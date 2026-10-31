package main

import (
	"context"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

const pbkdfIter = 310000

func hashPassword(pw string) (string, error) {
	salt := make([]byte, 16)
	rand.Read(salt)
	key, err := pbkdf2.Key(sha256.New, pw, salt, pbkdfIter, 32)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("pbkdf2-sha256$%d$%s$%s", pbkdfIter, base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

func checkPassword(pw, stored string) bool {
	parts := strings.Split(stored, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2-sha256" {
		return false
	}
	var iter int
	fmt.Sscanf(parts[1], "%d", &iter)
	salt, err1 := base64.RawStdEncoding.DecodeString(parts[2])
	want, err2 := base64.RawStdEncoding.DecodeString(parts[3])
	if err1 != nil || err2 != nil || iter < 1000 {
		return false
	}
	got, err := pbkdf2.Key(sha256.New, pw, salt, iter, len(want))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(got, want) == 1
}

func validatePassword(pw string) error {
	if len(pw) < 8 {
		return errors.New("Password must be at least 8 characters.")
	}
	return nil
}

func validUsername(u string) error {
	u = strings.TrimSpace(u)
	if len(u) < 3 || len(u) > 40 {
		return errors.New("Username must be 3–40 characters.")
	}
	for _, r := range u {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '.' || r == '_' || r == '-') {
			return errors.New("Username can use letters, numbers, dots, dashes and underscores only.")
		}
	}
	return nil
}

func createUser(username, display, role, pw string, mustChange bool) (int64, error) {
	if err := validUsername(username); err != nil {
		return 0, err
	}
	if err := validatePassword(pw); err != nil {
		return 0, err
	}
	if role != "director" && role != "assistant" {
		role = "assistant"
	}
	h, err := hashPassword(pw)
	if err != nil {
		return 0, err
	}
	mc := 0
	if mustChange {
		mc = 1
	}
	if strings.TrimSpace(display) == "" {
		display = username
	}
	res, err := db.Exec("INSERT INTO users(username,display_name,role,pw_hash,must_change,created_at) VALUES(?,?,?,?,?,?)",
		strings.TrimSpace(username), strings.TrimSpace(display), role, h, mc, now())
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return 0, errors.New("That username is already taken.")
		}
		return 0, err
	}
	return res.LastInsertId()
}

func randomToken(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// ---- login throttling ----

var (
	failMu   sync.Mutex
	failures = map[string][]time.Time{}
)

func throttled(key string) time.Duration {
	failMu.Lock()
	defer failMu.Unlock()
	cut := time.Now().Add(-5 * time.Minute)
	list := failures[key][:0]
	for _, t := range failures[key] {
		if t.After(cut) {
			list = append(list, t)
		}
	}
	failures[key] = list
	if len(list) >= 5 {
		wait := time.Until(list[len(list)-1].Add(60 * time.Second))
		if wait > 0 {
			return wait
		}
	}
	return 0
}

func recordFailure(key string) {
	failMu.Lock()
	failures[key] = append(failures[key], time.Now())
	failMu.Unlock()
}

func clearFailures(key string) {
	failMu.Lock()
	delete(failures, key)
	failMu.Unlock()
}

// ---- sessions ----

type User struct {
	ID         int64  `json:"id"`
	Username   string `json:"username"`
	Display    string `json:"display_name"`
	Role       string `json:"role"`
	MustChange bool   `json:"must_change"`
}

func (u *User) Name() string {
	if u.Display != "" {
		return u.Display
	}
	return u.Username
}

type ctxKey struct{}

const cookieName = "ati_session"

func sessionUser(r *http.Request) *User {
	c, err := r.Cookie(cookieName)
	if err != nil || c.Value == "" {
		return nil
	}
	var u User
	var exp string
	var mc int
	err = db.QueryRow(`SELECT u.id,u.username,COALESCE(u.display_name,''),u.role,u.must_change,s.expires_at
		FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND u.active=1`, c.Value).
		Scan(&u.ID, &u.Username, &u.Display, &u.Role, &mc, &exp)
	if err != nil || exp < now() {
		return nil
	}
	u.MustChange = mc == 1
	return &u
}

func startSession(w http.ResponseWriter, userID int64, remember bool) {
	tok := randomToken(32)
	dur := 12 * time.Hour
	if remember {
		dur = 30 * 24 * time.Hour
	}
	exp := time.Now().Add(dur)
	db.Exec("DELETE FROM sessions WHERE expires_at < ?", now())
	db.Exec("INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES(?,?,?,?)", tok, userID, exp.Format("2006-01-02 15:04:05"), now())
	c := &http.Cookie{Name: cookieName, Value: tok, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode}
	if remember {
		c.Expires = exp
	}
	http.SetCookie(w, c)
}

func currentUser(r *http.Request) *User {
	u, _ := r.Context().Value(ctxKey{}).(*User)
	return u
}

// auth wraps a handler: requires a session, optionally the director role, and a custom header on writes (CSRF guard).
func auth(role string, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Header.Get("X-ATI") != "1" {
			jerr(w, 403, "Request blocked.")
			return
		}
		u := sessionUser(r)
		if u == nil {
			jerr(w, 401, "Please sign in.")
			return
		}
		if u.MustChange && !strings.HasPrefix(r.URL.Path, "/api/me") && r.URL.Path != "/api/logout" {
			jerr(w, 428, "Please choose a new password first.")
			return
		}
		if role == "director" && u.Role != "director" {
			jerr(w, 403, "Only a director account can do that.")
			return
		}
		h(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, u)))
		if r.Method != http.MethodGet && r.URL.Path != "/api/restore" && !strings.HasPrefix(r.URL.Path, "/api/cloud") {
			markChanged()
		}
	}
}
