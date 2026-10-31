package main

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// ---------- response helpers ----------

func jout(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(v)
}

func jerr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func fail(w http.ResponseWriter, err error) {
	logf("error: %v", err)
	jerr(w, 500, "Something went wrong saving that: "+err.Error())
}

func body(r *http.Request) (map[string]any, error) {
	m := map[string]any{}
	dec := json.NewDecoder(io.LimitReader(r.Body, 4<<20))
	dec.UseNumber()
	if err := dec.Decode(&m); err != nil && err != io.EOF {
		return nil, errors.New("Could not read the request.")
	}
	for k, v := range m {
		m[k] = fixNumbers(v)
	}
	return m, nil
}

func fixNumbers(v any) any {
	switch t := v.(type) {
	case json.Number:
		if i, err := t.Int64(); err == nil {
			return i
		}
		f, _ := t.Float64()
		return f
	case []any:
		for i := range t {
			t[i] = fixNumbers(t[i])
		}
	case map[string]any:
		for k := range t {
			t[k] = fixNumbers(t[k])
		}
	}
	return v
}

func pathID(r *http.Request) int64 {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id
}

func num(v any) float64 {
	switch t := v.(type) {
	case int64:
		return float64(t)
	case float64:
		return t
	case string:
		f, _ := strconv.ParseFloat(strings.TrimSpace(t), 64)
		return f
	}
	return 0
}

func str(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return strings.TrimSpace(s)
	}
	return fmt.Sprint(v)
}

func list(v any) []map[string]any {
	out := []map[string]any{}
	if arr, ok := v.([]any); ok {
		for _, x := range arr {
			if m, ok := x.(map[string]any); ok {
				out = append(out, m)
			}
		}
	}
	return out
}

func condName(c int64) string {
	switch c {
	case 5:
		return "Excellent"
	case 4:
		return "Good"
	case 3:
		return "Fair"
	case 2:
		return "Poor"
	case 1:
		return "Needs repair"
	}
	return "—"
}

// ---------- routes ----------

func routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/ping", func(w http.ResponseWriter, r *http.Request) { jout(w, map[string]any{"app": appID}) })
	mux.HandleFunc("GET /api/setup", apiSetupStatus)
	mux.HandleFunc("POST /api/setup", apiSetup)
	mux.HandleFunc("POST /api/login", apiLogin)
	mux.HandleFunc("POST /api/logout", apiLogout)
	mux.HandleFunc("GET /api/me", auth("", apiMe))
	mux.HandleFunc("POST /api/me/password", auth("", apiChangePassword))

	mux.HandleFunc("GET /api/users", auth("director", apiUsers))
	mux.HandleFunc("POST /api/users", auth("director", apiCreateUser))
	mux.HandleFunc("PUT /api/users/{id}", auth("director", apiUpdateUser))

	mux.HandleFunc("GET /api/dashboard", auth("", apiDashboard))
	mux.HandleFunc("GET /api/lookups", auth("", apiLookups))
	mux.HandleFunc("PUT /api/lookups", auth("director", apiSaveLookups))
	mux.HandleFunc("GET /api/activity", auth("", apiActivity))

	mux.HandleFunc("GET /api/items", auth("", apiItems))
	mux.HandleFunc("POST /api/items", auth("", apiCreateItem))
	mux.HandleFunc("GET /api/items/{id}", auth("", apiItem))
	mux.HandleFunc("PUT /api/items/{id}", auth("", apiUpdateItem))
	mux.HandleFunc("DELETE /api/items/{id}", auth("director", apiDeleteItem))
	mux.HandleFunc("POST /api/items/{id}/photos", auth("", apiAddItemPhotos))
	mux.HandleFunc("PUT /api/item-photos/{id}", auth("", apiUpdateItemPhoto))
	mux.HandleFunc("DELETE /api/item-photos/{id}", auth("", apiDeleteItemPhoto))
	mux.HandleFunc("POST /api/shows/{id}/people", auth("", apiAddPeople))
	mux.HandleFunc("PUT /api/show-people/{id}", auth("", apiUpdatePerson))
	mux.HandleFunc("DELETE /api/show-people/{id}", auth("", apiDeletePerson))
	mux.HandleFunc("POST /api/shows/{id}/numbers", auth("", apiAddNumbers))
	mux.HandleFunc("PUT /api/show-numbers/{id}", auth("", apiUpdateNumber))
	mux.HandleFunc("DELETE /api/show-numbers/{id}", auth("", apiDeleteNumber))
	mux.HandleFunc("POST /api/shows/{id}/files", auth("", apiAddShowFiles))
	mux.HandleFunc("PUT /api/show-files/{id}", auth("", apiUpdateShowFile))
	mux.HandleFunc("DELETE /api/show-files/{id}", auth("", apiDeleteShowFile))
	mux.HandleFunc("GET /files/show/{name}", auth("", apiShowFile))
	mux.HandleFunc("POST /api/items/{id}/condition", auth("", apiItemCondition))
	mux.HandleFunc("GET /photos/{name}", auth("", apiPhoto))

	mux.HandleFunc("GET /api/renters", auth("", apiRenters))
	mux.HandleFunc("POST /api/renters", auth("", apiCreateRenter))
	mux.HandleFunc("GET /api/renters/{id}", auth("", apiRenter))
	mux.HandleFunc("PUT /api/renters/{id}", auth("", apiUpdateRenter))
	mux.HandleFunc("DELETE /api/renters/{id}", auth("director", apiDeleteRenter))

	mux.HandleFunc("GET /api/rentals", auth("", apiRentals))
	mux.HandleFunc("POST /api/rentals", auth("", apiCreateRental))
	mux.HandleFunc("GET /api/rentals/{id}", auth("", apiRental))
	mux.HandleFunc("PUT /api/rentals/{id}", auth("", apiUpdateRental))
	mux.HandleFunc("POST /api/rentals/{id}/return", auth("", apiReturnRental))
	mux.HandleFunc("DELETE /api/rentals/{id}", auth("director", apiDeleteRental))

	mux.HandleFunc("GET /api/shows", auth("", apiShows))
	mux.HandleFunc("POST /api/shows", auth("", apiCreateShow))
	mux.HandleFunc("GET /api/shows/{id}", auth("", apiShow))
	mux.HandleFunc("PUT /api/shows/{id}", auth("", apiUpdateShow))
	mux.HandleFunc("DELETE /api/shows/{id}", auth("director", apiDeleteShow))
	mux.HandleFunc("POST /api/shows/{id}/items", auth("", apiShowCheckout))
	mux.HandleFunc("POST /api/shows/{id}/return", auth("", apiShowReturn))
	mux.HandleFunc("PUT /api/show-items/{id}", auth("", apiUpdateShowItem))
	mux.HandleFunc("DELETE /api/show-items/{id}", auth("", apiDeleteShowItem))

	mux.HandleFunc("GET /api/export/{name}", auth("", apiExport))
	mux.HandleFunc("GET /api/backups", auth("director", apiBackups))
	mux.HandleFunc("POST /api/backups", auth("director", apiBackupNow))
	mux.HandleFunc("GET /api/system", auth("", apiSystem))
	mux.HandleFunc("POST /api/open-folder", auth("director", apiOpenFolder))
	mux.HandleFunc("POST /api/shutdown", auth("director", apiShutdown))
	mux.HandleFunc("GET /api/cloud", auth("director", apiCloud))
	mux.HandleFunc("PUT /api/cloud", auth("director", apiSetCloud))
	mux.HandleFunc("POST /api/cloud/sync", auth("director", apiCloudSync))
	mux.HandleFunc("POST /api/restore", auth("director", apiRestore))
}

// ---------- auth endpoints ----------

func userCount() int {
	var n int
	db.QueryRow("SELECT COUNT(*) FROM users").Scan(&n)
	return n
}

func apiSetupStatus(w http.ResponseWriter, r *http.Request) {
	jout(w, map[string]any{"needs_setup": userCount() == 0, "password_rule": passwordRule})
}

// apiSetup creates the first director account when the installer did not.
func apiSetup(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-ATI") != "1" {
		jerr(w, 403, "Request blocked.")
		return
	}
	if userCount() > 0 {
		jerr(w, 409, "A director account already exists. Please sign in.")
		return
	}
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	id, err := createUser(str(b["username"]), str(b["display_name"]), "director", str(b["password"]), false)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	logActivity(str(b["username"]), "account", "Created director account")
	startSession(w, id, false)
	jout(w, map[string]any{"ok": true})
}

func apiLogin(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-ATI") != "1" {
		jerr(w, 403, "Request blocked.")
		return
	}
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	name := strings.ToLower(str(b["username"]))
	if wait := throttled(name); wait > 0 {
		jerr(w, 429, fmt.Sprintf("Too many wrong passwords. Try again in %d seconds.", int(wait.Seconds())+1))
		return
	}
	var id int64
	var hash string
	var active int
	err = db.QueryRow("SELECT id,pw_hash,active FROM users WHERE username=?", name).Scan(&id, &hash, &active)
	if err != nil || active != 1 || !checkPassword(str(b["password"]), hash) {
		recordFailure(name)
		jerr(w, 401, "That username and password don't match.")
		return
	}
	clearFailures(name)
	db.Exec("UPDATE users SET last_login=? WHERE id=?", now(), id)
	// passwords set before the stronger rule must be replaced at this sign-in
	if validatePassword(str(b["password"])) != nil {
		db.Exec("UPDATE users SET must_change=1 WHERE id=?", id)
	}
	startSession(w, id, b["remember"] == true)
	logActivity(name, "sign-in", "Signed in")
	jout(w, map[string]any{"ok": true})
}

func apiLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil {
		db.Exec("DELETE FROM sessions WHERE token=?", c.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", MaxAge: -1})
	jout(w, map[string]any{"ok": true})
}

func apiMe(w http.ResponseWriter, r *http.Request) { jout(w, currentUser(r)) }

func apiChangePassword(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	var hash string
	db.QueryRow("SELECT pw_hash FROM users WHERE id=?", u.ID).Scan(&hash)
	if !checkPassword(str(b["current"]), hash) {
		jerr(w, 400, "Your current password is not correct.")
		return
	}
	np := str(b["new"])
	if err := validatePassword(np); err != nil {
		jerr(w, 400, err.Error())
		return
	}
	h, _ := hashPassword(np)
	db.Exec("UPDATE users SET pw_hash=?, must_change=0 WHERE id=?", h, u.ID)
	logActivity(u.Name(), "account", "Changed own password")
	jout(w, map[string]any{"ok": true})
}

func apiUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := qmaps(db, "SELECT id,username,display_name,role,active,must_change,created_at,last_login FROM users ORDER BY role DESC, username")
	if err != nil {
		fail(w, err)
		return
	}
	jout(w, rows)
}

func apiCreateUser(w http.ResponseWriter, r *http.Request) {
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	_, err = createUser(str(b["username"]), str(b["display_name"]), str(b["role"]), str(b["password"]), true)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	logActivity(currentUser(r).Name(), "account", "Added user "+str(b["username"])+" ("+str(b["role"])+")")
	jout(w, map[string]any{"ok": true})
}

func apiUpdateUser(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	me := currentUser(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	if id == me.ID && (b["active"] == false || (b["role"] != nil && str(b["role"]) != "director")) {
		jerr(w, 400, "You can't remove your own director access or deactivate yourself.")
		return
	}
	if v, ok := b["display_name"]; ok {
		db.Exec("UPDATE users SET display_name=? WHERE id=?", str(v), id)
	}
	if v, ok := b["role"]; ok && (v == "director" || v == "assistant") {
		db.Exec("UPDATE users SET role=? WHERE id=?", v, id)
	}
	if v, ok := b["active"]; ok {
		a := 0
		if v == true {
			a = 1
		}
		db.Exec("UPDATE users SET active=? WHERE id=?", a, id)
		if a == 0 {
			db.Exec("DELETE FROM sessions WHERE user_id=?", id)
		}
	}
	if pw := str(b["password"]); pw != "" {
		if err := validatePassword(pw); err != nil {
			jerr(w, 400, err.Error())
			return
		}
		h, _ := hashPassword(pw)
		db.Exec("UPDATE users SET pw_hash=?, must_change=1 WHERE id=?", h, id)
		db.Exec("DELETE FROM sessions WHERE user_id=?", id)
	}
	var name string
	db.QueryRow("SELECT username FROM users WHERE id=?", id).Scan(&name)
	logActivity(me.Name(), "account", "Updated user "+name)
	jout(w, map[string]any{"ok": true})
}

// ---------- lookups / dashboard ----------

var lookupFields = map[string]string{"category": "category", "subcategory": "subcategory", "era": "era", "gender": "gender", "size": "size", "material": "material", "color": "color", "location": "location"}

func apiLookups(w http.ResponseWriter, r *http.Request) {
	out := map[string][]string{}
	configured := map[string][]string{}
	rows, _ := qmaps(db, "SELECT list,value FROM lookups ORDER BY list, sort, value")
	for _, row := range rows {
		l := str(row["list"])
		out[l] = append(out[l], str(row["value"]))
		configured[l] = append(configured[l], str(row["value"]))
	}
	// add values already used in the inventory so filters always cover real data
	for list, col := range lookupFields {
		seen := map[string]bool{}
		for _, v := range out[list] {
			seen[strings.ToLower(v)] = true
		}
		vals, _ := qmaps(db, fmt.Sprintf(`SELECT DISTINCT "%s" v FROM items WHERE "%s" IS NOT NULL ORDER BY 1`, col, col))
		for _, v := range vals {
			s := str(v["v"])
			if s != "" && !seen[strings.ToLower(s)] {
				out[list] = append(out[list], s)
				seen[strings.ToLower(s)] = true
			}
		}
	}
	jout(w, map[string]any{"lists": out, "configured": configured})
}

func apiSaveLookups(w http.ResponseWriter, r *http.Request) {
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	name := str(b["list"])
	if _, ok := defaultLookups[name]; !ok {
		jerr(w, 400, "Unknown list.")
		return
	}
	tx, _ := db.Begin()
	tx.Exec("DELETE FROM lookups WHERE list=?", name)
	i := 0
	if arr, ok := b["values"].([]any); ok {
		for _, v := range arr {
			if s := str(v); s != "" {
				tx.Exec("INSERT OR IGNORE INTO lookups(list,value,sort) VALUES(?,?,?)", name, s, i)
				i++
			}
		}
	}
	if err := tx.Commit(); err != nil {
		fail(w, err)
		return
	}
	logActivity(currentUser(r).Name(), "settings", "Edited the "+name+" list")
	jout(w, map[string]any{"ok": true})
}

func apiActivity(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := qmaps(db, "SELECT * FROM activity ORDER BY id DESC LIMIT ?", limit)
	if err != nil {
		fail(w, err)
		return
	}
	jout(w, rows)
}

func scalar(q string, args ...any) float64 {
	var v sql.NullFloat64
	db.QueryRow(q, args...).Scan(&v)
	return v.Float64
}

func apiDashboard(w http.ResponseWriter, r *http.Request) {
	t := today()
	out := map[string]any{
		"item_records":  scalar("SELECT COUNT(*) FROM items WHERE status!='retired'"),
		"item_pieces":   scalar("SELECT SUM(quantity) FROM items WHERE status!='retired'"),
		"on_rental":     scalar("SELECT SUM(ri.qty) FROM rental_items ri JOIN rentals r ON r.id=ri.rental_id WHERE r.status='out'"),
		"in_shows":      scalar("SELECT SUM(qty) FROM show_items WHERE date_returned IS NULL"),
		"needs_repair":  scalar("SELECT COUNT(*) FROM items WHERE status='repair' OR (condition<=1 AND status='active')"),
		"renters":       scalar("SELECT COUNT(*) FROM renters WHERE approved=1"),
		"value":         scalar("SELECT SUM(COALESCE(replacement_value,0)*quantity) FROM items WHERE status!='retired'"),
		"overdue_count": scalar("SELECT COUNT(*) FROM rentals WHERE status='out' AND date_due < ?", t),
	}
	out["active_rentals"], _ = qmaps(db, `SELECT r.id, r.date_out, r.date_due, r.purpose, n.name renter, n.organization,
		(SELECT SUM(qty) FROM rental_items WHERE rental_id=r.id) pieces,
		CASE WHEN r.date_due < ? THEN 1 ELSE 0 END overdue
		FROM rentals r JOIN renters n ON n.id=r.renter_id WHERE r.status='out' ORDER BY r.date_due`, t)
	out["shows"], _ = qmaps(db, `SELECT s.*, (SELECT SUM(qty) FROM show_items WHERE show_id=s.id AND date_returned IS NULL) out_pieces,
		(SELECT SUM(qty) FROM show_items WHERE show_id=s.id) total_pieces
		FROM shows s WHERE s.status!='closed' ORDER BY COALESCE(s.open_date,'9999')`)
	out["repairs"], _ = qmaps(db, `SELECT id,tag,name,category,condition,condition_notes,status FROM items
		WHERE status='repair' OR (condition<=1 AND status='active') ORDER BY updated_at DESC LIMIT 12`)
	out["activity"], _ = qmaps(db, "SELECT * FROM activity WHERE action!='sign-in' ORDER BY id DESC LIMIT 12")
	jout(w, out)
}

// ---------- items ----------

var itemFields = []string{"tag", "name", "category", "subcategory", "description", "era", "gender", "size", "chest", "waist", "hips", "inseam", "neck", "sleeve", "head", "shoe_size", "color", "material", "pattern", "quantity", "condition", "condition_notes", "location", "acquired_date", "acquired_from", "cost", "replacement_value", "rentable", "rental_rate", "status", "keywords", "notes"}

const itemSelect = `SELECT * FROM (SELECT i.*,
  (SELECT COALESCE(SUM(ri.qty),0) FROM rental_items ri JOIN rentals r ON r.id=ri.rental_id WHERE ri.item_id=i.id AND r.status='out') rent_out,
  (SELECT COALESCE(SUM(si.qty),0) FROM show_items si WHERE si.item_id=i.id AND si.date_returned IS NULL) show_out,
  (SELECT COUNT(DISTINCT si.show_id) FROM show_items si WHERE si.item_id=i.id) show_count,
  (SELECT COUNT(*) FROM rental_items ri WHERE ri.item_id=i.id) rental_count,
  (SELECT COUNT(*) FROM item_photos ip WHERE ip.item_id=i.id) photo_count
  FROM items i) x`

var measureCols = []string{"chest", "waist", "hips", "inseam", "neck", "sleeve", "head"}

func apiItems(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where, args := []string{}, []any{}
	if text := strings.TrimSpace(q.Get("q")); text != "" {
		for _, word := range strings.Fields(text) {
			like := "%" + word + "%"
			where = append(where, `(tag LIKE ? OR name LIKE ? OR description LIKE ? OR category LIKE ? OR subcategory LIKE ? OR era LIKE ? OR color LIKE ? OR material LIKE ? OR pattern LIKE ? OR keywords LIKE ? OR notes LIKE ? OR size LIKE ? OR location LIKE ? OR gender LIKE ?
				OR id IN (SELECT si.item_id FROM show_items si JOIN shows s ON s.id=si.show_id WHERE s.title LIKE ? OR si.character LIKE ?))`)
			for i := 0; i < 16; i++ {
				args = append(args, like)
			}
		}
	}
	for _, f := range []string{"category", "subcategory", "era", "gender", "material", "color", "location"} {
		if v := q.Get(f); v != "" {
			if f == "material" || f == "color" {
				where = append(where, f+" LIKE ?")
				args = append(args, "%"+v+"%")
			} else {
				where = append(where, f+" = ?")
				args = append(args, v)
			}
		}
	}
	if v := q.Get("size"); v != "" {
		where = append(where, "(size = ? OR size LIKE ? OR shoe_size = ?)")
		args = append(args, v, v+" %", v)
	}
	switch q.Get("status") {
	case "", "current":
		where = append(where, "status != 'retired'")
	case "all":
	default:
		where = append(where, "status = ?")
		args = append(args, q.Get("status"))
	}
	switch q.Get("availability") {
	case "available":
		where = append(where, "status='active' AND quantity - rent_out - show_out > 0")
	case "out":
		where = append(where, "rent_out + show_out > 0")
	case "rented":
		where = append(where, "rent_out > 0")
	case "inshow":
		where = append(where, "show_out > 0")
	}
	if v := q.Get("condition_min"); v != "" {
		where = append(where, "condition >= ?")
		args = append(args, v)
	}
	if q.Get("rentable") == "1" {
		where = append(where, "rentable = 1")
	}
	if v := q.Get("show_id"); v != "" {
		where = append(where, "id IN (SELECT item_id FROM show_items WHERE show_id=?)")
		args = append(args, v)
	}
	if q.Get("never_used") == "1" {
		where = append(where, "show_count = 0")
	}
	for _, m := range measureCols {
		if v := q.Get(m + "_min"); v != "" {
			where = append(where, m+" >= ?")
			args = append(args, num(v))
		}
		if v := q.Get(m + "_max"); v != "" {
			where = append(where, m+" <= ?")
			args = append(args, num(v))
		}
	}
	order := "name COLLATE NOCASE"
	switch q.Get("sort") {
	case "tag":
		order = "tag COLLATE NOCASE"
	case "recent":
		order = "id DESC"
	case "condition":
		order = "condition DESC, name"
	case "used":
		order = "show_count DESC, name"
	case "category":
		order = "category, name COLLATE NOCASE"
	}
	sqlq := itemSelect
	if len(where) > 0 {
		sqlq += " WHERE " + strings.Join(where, " AND ")
	}
	sqlq += " ORDER BY " + order + " LIMIT 2000"
	rows, err := qmaps(db, sqlq, args...)
	if err != nil {
		fail(w, err)
		return
	}
	jout(w, rows)
}

func nextTag(category string) string {
	prefix := ""
	for _, c := range strings.ToUpper(category) {
		if c >= 'A' && c <= 'Z' {
			prefix += string(c)
		}
		if len(prefix) == 3 {
			break
		}
	}
	if len(prefix) < 2 {
		prefix = "ITM"
	}
	rows, _ := qmaps(db, "SELECT tag FROM items WHERE tag LIKE ?", prefix+"-%")
	max := 0
	for _, r := range rows {
		n, _ := strconv.Atoi(strings.TrimPrefix(str(r["tag"]), prefix+"-"))
		if n > max {
			max = n
		}
	}
	return fmt.Sprintf("%s-%04d", prefix, max+1)
}

func validateItem(b map[string]any, creating bool) error {
	if creating || b["name"] != nil {
		if str(b["name"]) == "" {
			return errors.New("Every item needs a name.")
		}
	}
	if v, ok := b["quantity"]; ok && v != nil && str(v) != "" && num(v) < 1 {
		return errors.New("Quantity must be at least 1.")
	}
	if v, ok := b["condition"]; ok && v != nil && str(v) != "" && (num(v) < 1 || num(v) > 5) {
		return errors.New("Condition must be between 1 and 5.")
	}
	return nil
}

func apiCreateItem(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	if err := validateItem(b, true); err != nil {
		jerr(w, 400, err.Error())
		return
	}
	if str(b["tag"]) == "" {
		b["tag"] = nextTag(str(b["category"]))
	}
	id, err := insertRow(db, "items", itemFields, b, map[string]any{"created_at": now(), "created_by": u.Name(), "updated_at": now(), "updated_by": u.Name()})
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			jerr(w, 400, "That tag number is already used by another item.")
			return
		}
		fail(w, err)
		return
	}
	var cond int64 = 4
	if c, ok := b["condition"]; ok && str(c) != "" {
		cond = int64(num(c))
	}
	db.Exec("INSERT INTO condition_log(item_id,at,condition,notes,source,user) VALUES(?,?,?,?,?,?)", id, now(), cond, b["condition_notes"], "Added to inventory", u.Name())
	logActivity(u.Name(), "item", fmt.Sprintf("Added %s %s", str(b["tag"]), str(b["name"])))
	jout(w, map[string]any{"id": id})
}

func getItem(id int64) map[string]any {
	m, _ := qone(db, itemSelect+" WHERE id=?", id)
	return m
}

func apiItem(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	item := getItem(id)
	if item == nil {
		jerr(w, 404, "That item doesn't exist.")
		return
	}
	rentals, _ := qmaps(db, `SELECT ri.*, r.date_out, r.date_due, r.date_returned, r.status, r.purpose, r.rating, n.id renter_id, n.name renter, n.organization
		FROM rental_items ri JOIN rentals r ON r.id=ri.rental_id JOIN renters n ON n.id=r.renter_id WHERE ri.item_id=? ORDER BY r.date_out DESC`, id)
	shows, _ := qmaps(db, `SELECT si.*, s.title, s.type, s.season, s.year, s.open_date, s.close_date, s.director
		FROM show_items si JOIN shows s ON s.id=si.show_id WHERE si.item_id=? ORDER BY COALESCE(s.open_date, si.date_out) DESC`, id)
	conds, _ := qmaps(db, "SELECT * FROM condition_log WHERE item_id=? ORDER BY id DESC", id)
	jout(w, map[string]any{"item": item, "rentals": rentals, "shows": shows, "conditions": conds, "photos": itemPhotos(id)})
}

func apiUpdateItem(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := pathID(r)
	old := getItem(id)
	if old == nil {
		jerr(w, 404, "That item doesn't exist.")
		return
	}
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	if err := validateItem(b, false); err != nil {
		jerr(w, 400, err.Error())
		return
	}
	if _, ok := b["tag"]; ok && str(b["tag"]) == "" {
		b["tag"] = nextTag(str(b["category"]))
	}
	if err := updateRow(db, "items", itemFields, id, b, map[string]any{"updated_at": now(), "updated_by": u.Name()}); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			jerr(w, 400, "That tag number is already used by another item.")
			return
		}
		fail(w, err)
		return
	}
	if c, ok := b["condition"]; ok && str(c) != "" && int64(num(c)) != old["condition"].(int64) {
		db.Exec("INSERT INTO condition_log(item_id,at,condition,notes,source,user) VALUES(?,?,?,?,?,?)", id, now(), int64(num(c)), b["condition_notes"], "Edited item record", u.Name())
	}
	logActivity(u.Name(), "item", fmt.Sprintf("Edited %s %s", str(old["tag"]), str(old["name"])))
	jout(w, map[string]any{"ok": true})
}

func apiItemCondition(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := pathID(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	c := int64(num(b["condition"]))
	if c < 1 || c > 5 {
		jerr(w, 400, "Choose a condition from 1 to 5.")
		return
	}
	extra := map[string]any{"condition": c, "condition_notes": clean(b["notes"]), "updated_at": now(), "updated_by": u.Name()}
	if s := str(b["status"]); s != "" {
		extra["status"] = s
	}
	updateRow(db, "items", nil, id, nil, extra)
	db.Exec("INSERT INTO condition_log(item_id,at,condition,notes,source,user) VALUES(?,?,?,?,?,?)", id, now(), c, clean(b["notes"]), "Inspection", u.Name())
	it := getItem(id)
	logActivity(u.Name(), "condition", fmt.Sprintf("Inspected %s %s: %s", str(it["tag"]), str(it["name"]), condName(c)))
	jout(w, map[string]any{"ok": true})
}

func apiDeleteItem(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	it := getItem(id)
	if it == nil {
		jerr(w, 404, "That item doesn't exist.")
		return
	}
	if it["show_count"].(int64) > 0 || it["rental_count"].(int64) > 0 {
		jerr(w, 400, "This item has rental or show history, so it can't be deleted. Set its status to Retired instead to keep the history.")
		return
	}
	db.Exec("DELETE FROM condition_log WHERE item_id=?", id)
	deleteItemPhotos(id)
	db.Exec("DELETE FROM items WHERE id=?", id)
	logActivity(currentUser(r).Name(), "item", fmt.Sprintf("Deleted %s %s", str(it["tag"]), str(it["name"])))
	jout(w, map[string]any{"ok": true})
}

var safeName = regexp.MustCompile(`^[a-zA-Z0-9_.-]+$`)

func photoDir() string { return filepath.Join(dataDir, "photos") }

func apiPhoto(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !safeName.MatchString(name) {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "private, max-age=86400")
	http.ServeFile(w, r, filepath.Join(photoDir(), name))
}

// ---------- renters ----------

var renterFields = []string{"name", "organization", "contact_name", "email", "phone", "address", "approved", "approved_date", "notes"}

const renterSelect = `SELECT * FROM (SELECT n.*,
  (SELECT ROUND(AVG(rating),2) FROM rentals WHERE renter_id=n.id AND rating IS NOT NULL) avg_rating,
  (SELECT COUNT(*) FROM rentals WHERE renter_id=n.id AND rating IS NOT NULL) rating_count,
  (SELECT COUNT(*) FROM rentals WHERE renter_id=n.id) rental_count,
  (SELECT COUNT(*) FROM rentals WHERE renter_id=n.id AND status='out') active_count,
  (SELECT MAX(date_out) FROM rentals WHERE renter_id=n.id) last_rental,
  (SELECT SUM(ri.damage_charge) FROM rental_items ri JOIN rentals r ON r.id=ri.rental_id WHERE r.renter_id=n.id) damage_total
  FROM renters n) x`

func apiRenters(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where, args := []string{}, []any{}
	if t := strings.TrimSpace(q.Get("q")); t != "" {
		where = append(where, "(name LIKE ? OR organization LIKE ? OR contact_name LIKE ? OR email LIKE ? OR phone LIKE ?)")
		for i := 0; i < 5; i++ {
			args = append(args, "%"+t+"%")
		}
	}
	switch q.Get("approved") {
	case "1":
		where = append(where, "approved=1")
	case "0":
		where = append(where, "approved=0")
	}
	s := renterSelect
	if len(where) > 0 {
		s += " WHERE " + strings.Join(where, " AND ")
	}
	order := "name COLLATE NOCASE"
	if q.Get("sort") == "rating" {
		order = "avg_rating IS NULL, avg_rating DESC, name"
	} else if q.Get("sort") == "recent" {
		order = "last_rental IS NULL, last_rental DESC"
	}
	rows, err := qmaps(db, s+" ORDER BY "+order, args...)
	if err != nil {
		fail(w, err)
		return
	}
	jout(w, rows)
}

func apiCreateRenter(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	if str(b["name"]) == "" {
		jerr(w, 400, "Enter the renter's name.")
		return
	}
	extra := map[string]any{"created_at": now(), "created_by": u.Name(), "updated_at": now(), "updated_by": u.Name()}
	if b["approved"] == true && str(b["approved_date"]) == "" {
		extra["approved_date"] = today()
		delete(b, "approved_date")
	}
	id, err := insertRow(db, "renters", renterFields, b, extra)
	if err != nil {
		fail(w, err)
		return
	}
	logActivity(u.Name(), "renter", "Added renter "+str(b["name"]))
	jout(w, map[string]any{"id": id})
}

func apiRenter(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	rn, _ := qone(db, renterSelect+" WHERE id=?", id)
	if rn == nil {
		jerr(w, 404, "That renter doesn't exist.")
		return
	}
	rentals, _ := qmaps(db, `SELECT r.*, (SELECT SUM(qty) FROM rental_items WHERE rental_id=r.id) pieces,
		(SELECT SUM(damage_charge) FROM rental_items WHERE rental_id=r.id) damages,
		(SELECT GROUP_CONCAT(i.name, ', ') FROM rental_items ri JOIN items i ON i.id=ri.item_id WHERE ri.rental_id=r.id) item_names
		FROM rentals r WHERE renter_id=? ORDER BY date_out DESC, id DESC`, id)
	jout(w, map[string]any{"renter": rn, "rentals": rentals})
}

func apiUpdateRenter(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := pathID(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	if _, ok := b["name"]; ok && str(b["name"]) == "" {
		jerr(w, 400, "Enter the renter's name.")
		return
	}
	extra := map[string]any{"updated_at": now(), "updated_by": u.Name()}
	if b["approved"] == true {
		var was int
		db.QueryRow("SELECT approved FROM renters WHERE id=?", id).Scan(&was)
		if was == 0 && str(b["approved_date"]) == "" {
			extra["approved_date"] = today()
			delete(b, "approved_date")
		}
	}
	if err := updateRow(db, "renters", renterFields, id, b, extra); err != nil {
		fail(w, err)
		return
	}
	var name string
	db.QueryRow("SELECT name FROM renters WHERE id=?", id).Scan(&name)
	logActivity(u.Name(), "renter", "Edited renter "+name)
	jout(w, map[string]any{"ok": true})
}

func apiDeleteRenter(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	var n int
	db.QueryRow("SELECT COUNT(*) FROM rentals WHERE renter_id=?", id).Scan(&n)
	if n > 0 {
		jerr(w, 400, "This renter has rental history, so they can't be deleted. Remove them from the approved list instead.")
		return
	}
	var name string
	db.QueryRow("SELECT name FROM renters WHERE id=?", id).Scan(&name)
	db.Exec("DELETE FROM renters WHERE id=?", id)
	logActivity(currentUser(r).Name(), "renter", "Deleted renter "+name)
	jout(w, map[string]any{"ok": true})
}

// ---------- availability ----------

// checkAvailable confirms each requested line fits the item's free quantity.
func checkAvailable(tx *sql.Tx, lines []map[string]any) error {
	want := map[int64]int64{}
	for _, l := range lines {
		q := int64(num(l["qty"]))
		if q < 1 {
			q = 1
		}
		want[int64(num(l["item_id"]))] += q
	}
	for id, q := range want {
		it, _ := qone(tx, itemSelect+" WHERE id=?", id)
		if it == nil {
			return fmt.Errorf("Item #%d no longer exists.", id)
		}
		if str(it["status"]) == "retired" || str(it["status"]) == "lost" {
			return fmt.Errorf("%s %s is marked %s and can't be checked out.", str(it["tag"]), str(it["name"]), str(it["status"]))
		}
		free := it["quantity"].(int64) - it["rent_out"].(int64) - it["show_out"].(int64)
		if q > free {
			return fmt.Errorf("%s %s: only %d of %d available right now.", str(it["tag"]), str(it["name"]), max(free, 0), it["quantity"].(int64))
		}
	}
	return nil
}

func itemCondition(q querier, id int64) int64 {
	m, _ := qone(q, "SELECT condition FROM items WHERE id=?", id)
	if m == nil {
		return 0
	}
	return m["condition"].(int64)
}

// ---------- rentals ----------

func apiRentals(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where, args := []string{}, []any{}
	t := today()
	switch q.Get("status") {
	case "out":
		where = append(where, "r.status='out'")
	case "overdue":
		where = append(where, "r.status='out' AND r.date_due < ?")
		args = append(args, t)
	case "returned":
		where = append(where, "r.status='returned'")
	}
	if v := q.Get("renter_id"); v != "" {
		where = append(where, "r.renter_id=?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(q.Get("q")); v != "" {
		where = append(where, "(n.name LIKE ? OR n.organization LIKE ? OR r.purpose LIKE ?)")
		args = append(args, "%"+v+"%", "%"+v+"%", "%"+v+"%")
	}
	s := `SELECT r.*, n.name renter, n.organization, CASE WHEN r.status='out' AND r.date_due < ? THEN 1 ELSE 0 END overdue,
		(SELECT SUM(qty) FROM rental_items WHERE rental_id=r.id) pieces,
		(SELECT SUM(damage_charge) FROM rental_items WHERE rental_id=r.id) damages
		FROM rentals r JOIN renters n ON n.id=r.renter_id`
	args = append([]any{t}, args...)
	if len(where) > 0 {
		s += " WHERE " + strings.Join(where, " AND ")
	}
	rows, err := qmaps(db, s+" ORDER BY r.status='returned', r.date_out DESC, r.id DESC LIMIT 1000", args...)
	if err != nil {
		fail(w, err)
		return
	}
	jout(w, rows)
}

func apiCreateRental(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	renterID := int64(num(b["renter_id"]))
	rn, _ := qone(db, "SELECT * FROM renters WHERE id=?", renterID)
	if rn == nil {
		jerr(w, 400, "Choose a renter.")
		return
	}
	if rn["approved"].(int64) != 1 {
		jerr(w, 400, str(rn["name"])+" is not on the approved renters list. Approve them on their renter page first.")
		return
	}
	lines := list(b["items"])
	if len(lines) == 0 {
		jerr(w, 400, "Add at least one item to the rental.")
		return
	}
	if str(b["date_out"]) == "" {
		b["date_out"] = today()
	}
	if str(b["date_due"]) != "" && str(b["date_due"]) < str(b["date_out"]) {
		jerr(w, 400, "The due date is before the checkout date.")
		return
	}
	tx, err := db.Begin()
	if err != nil {
		fail(w, err)
		return
	}
	defer tx.Rollback()
	if err := checkAvailable(tx, lines); err != nil {
		jerr(w, 400, err.Error())
		return
	}
	id, err := insertRow(tx, "rentals", []string{"renter_id", "purpose", "date_out", "date_due", "fee", "deposit", "notes"}, b,
		map[string]any{"status": "out", "created_at": now(), "created_by": u.Name()})
	if err != nil {
		fail(w, err)
		return
	}
	for _, l := range lines {
		iid := int64(num(l["item_id"]))
		q := int64(num(l["qty"]))
		if q < 1 {
			q = 1
		}
		co := int64(num(l["condition_out"]))
		if co < 1 || co > 5 {
			co = itemCondition(tx, iid)
		}
		if _, err := tx.Exec("INSERT INTO rental_items(rental_id,item_id,qty,condition_out,notes_out) VALUES(?,?,?,?,?)", id, iid, q, co, clean(l["notes_out"])); err != nil {
			fail(w, err)
			return
		}
		if co != itemCondition(tx, iid) {
			tx.Exec("UPDATE items SET condition=? WHERE id=?", co, iid)
			tx.Exec("INSERT INTO condition_log(item_id,at,condition,notes,source,user) VALUES(?,?,?,?,?,?)", iid, now(), co, clean(l["notes_out"]), fmt.Sprintf("Checked out on rental #%d", id), u.Name())
		}
	}
	if err := tx.Commit(); err != nil {
		fail(w, err)
		return
	}
	logActivity(u.Name(), "rental", fmt.Sprintf("Rental #%d to %s: %d line(s) checked out", id, str(rn["name"]), len(lines)))
	jout(w, map[string]any{"id": id})
}

func apiRental(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	rent, _ := qone(db, `SELECT r.*, CASE WHEN r.status='out' AND r.date_due < ? THEN 1 ELSE 0 END overdue FROM rentals r WHERE id=?`, today(), id)
	if rent == nil {
		jerr(w, 404, "That rental doesn't exist.")
		return
	}
	rn, _ := qone(db, renterSelect+" WHERE id=?", rent["renter_id"])
	lines, _ := qmaps(db, `SELECT ri.*, i.tag, i.name, i.category, i.size, i.photo, i.replacement_value, i.rental_rate, i.condition current_condition
		FROM rental_items ri JOIN items i ON i.id=ri.item_id WHERE ri.rental_id=? ORDER BY ri.id`, id)
	jout(w, map[string]any{"rental": rent, "renter": rn, "items": lines})
}

func apiUpdateRental(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	if v, ok := b["rating"]; ok && v != nil && str(v) != "" && (num(v) < 1 || num(v) > 5) {
		jerr(w, 400, "Ratings go from 1 to 5 stars.")
		return
	}
	if err := updateRow(db, "rentals", []string{"purpose", "date_out", "date_due", "fee", "deposit", "deposit_returned", "notes", "rating", "rating_notes"}, id, b, nil); err != nil {
		fail(w, err)
		return
	}
	logActivity(currentUser(r).Name(), "rental", fmt.Sprintf("Edited rental #%d", id))
	jout(w, map[string]any{"ok": true})
}

func apiReturnRental(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := pathID(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	rent, _ := qone(db, "SELECT r.*, n.name renter FROM rentals r JOIN renters n ON n.id=r.renter_id WHERE r.id=?", id)
	if rent == nil {
		jerr(w, 404, "That rental doesn't exist.")
		return
	}
	if str(rent["status"]) != "out" {
		jerr(w, 400, "This rental was already checked in.")
		return
	}
	rating := int64(num(b["rating"]))
	if rating < 1 || rating > 5 {
		jerr(w, 400, "Give the renter a rating from 1 to 5 stars before checking in.")
		return
	}
	dr := str(b["date_returned"])
	if dr == "" {
		dr = today()
	}
	tx, err := db.Begin()
	if err != nil {
		fail(w, err)
		return
	}
	defer tx.Rollback()
	byLine := map[int64]map[string]any{}
	for _, l := range list(b["items"]) {
		byLine[int64(num(l["id"]))] = l
	}
	lines, _ := qmaps(tx, "SELECT * FROM rental_items WHERE rental_id=?", id)
	for _, line := range lines {
		lid := line["id"].(int64)
		iid := line["item_id"].(int64)
		l := byLine[lid]
		ci := int64(num(l["condition_in"]))
		if ci < 1 || ci > 5 {
			if co, ok := line["condition_out"].(int64); ok {
				ci = co
			} else {
				ci = itemCondition(tx, iid)
			}
		}
		dmg := clean(l["damage_charge"])
		tx.Exec("UPDATE rental_items SET condition_in=?, notes_in=?, damage_charge=? WHERE id=?", ci, clean(l["notes_in"]), dmg, lid)
		tx.Exec("UPDATE items SET condition=?, updated_at=?, updated_by=? WHERE id=?", ci, now(), u.Name(), iid)
		if ci <= 1 && l["send_to_repair"] == true {
			tx.Exec("UPDATE items SET status='repair' WHERE id=?", iid)
		}
		tx.Exec("INSERT INTO condition_log(item_id,at,condition,notes,source,user) VALUES(?,?,?,?,?,?)", iid, now(), ci, clean(l["notes_in"]), fmt.Sprintf("Returned from rental #%d (%s)", id, str(rent["renter"])), u.Name())
	}
	_, err = tx.Exec("UPDATE rentals SET status='returned', date_returned=?, rating=?, rating_notes=?, deposit_returned=?, returned_by=? WHERE id=?",
		dr, rating, clean(b["rating_notes"]), clean(b["deposit_returned"]), u.Name(), id)
	if err != nil {
		fail(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		fail(w, err)
		return
	}
	logActivity(u.Name(), "rental", fmt.Sprintf("Checked in rental #%d from %s — rated %d★", id, str(rent["renter"]), rating))
	jout(w, map[string]any{"ok": true})
}

func apiDeleteRental(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	db.Exec("DELETE FROM rental_items WHERE rental_id=?", id)
	db.Exec("DELETE FROM rentals WHERE id=?", id)
	logActivity(currentUser(r).Name(), "rental", fmt.Sprintf("Deleted rental #%d", id))
	jout(w, map[string]any{"ok": true})
}

// ---------- shows ----------

var showFields = []string{"title", "type", "season", "year", "director", "venue", "open_date", "close_date", "status", "notes"}

func apiShows(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where, args := []string{}, []any{}
	if v := strings.TrimSpace(q.Get("q")); v != "" {
		where = append(where, "(title LIKE ? OR director LIKE ? OR season LIKE ? OR CAST(year AS TEXT) LIKE ?)")
		for i := 0; i < 4; i++ {
			args = append(args, "%"+v+"%")
		}
	}
	if v := q.Get("status"); v != "" {
		where = append(where, "status=?")
		args = append(args, v)
	}
	s := `SELECT s.*, (SELECT COUNT(*) FROM show_items WHERE show_id=s.id) lines,
		(SELECT SUM(qty) FROM show_items WHERE show_id=s.id) pieces,
		(SELECT SUM(qty) FROM show_items WHERE show_id=s.id AND date_returned IS NULL) out_pieces,
		(SELECT COUNT(*) FROM show_people WHERE show_id=s.id AND kind='cast') cast_count,
		(SELECT COUNT(*) FROM show_people WHERE show_id=s.id AND kind!='cast') crew_count,
		(SELECT COUNT(*) FROM show_files WHERE show_id=s.id AND kind='photo') photo_count,
		(SELECT COUNT(*) FROM show_files WHERE show_id=s.id AND kind='material') material_count,
		(SELECT COUNT(*) FROM show_numbers WHERE show_id=s.id) number_count FROM shows s`
	if len(where) > 0 {
		s += " WHERE " + strings.Join(where, " AND ")
	}
	rows, err := qmaps(db, s+" ORDER BY status='closed', COALESCE(open_date, year || '-12-31') DESC, id DESC", args...)
	if err != nil {
		fail(w, err)
		return
	}
	jout(w, rows)
}

func apiCreateShow(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	if str(b["title"]) == "" {
		jerr(w, 400, "Enter the show's title.")
		return
	}
	id, err := insertRow(db, "shows", showFields, b, map[string]any{"created_at": now(), "created_by": u.Name(), "updated_at": now(), "updated_by": u.Name()})
	if err != nil {
		fail(w, err)
		return
	}
	logActivity(u.Name(), "show", "Created show "+str(b["title"]))
	jout(w, map[string]any{"id": id})
}

func apiShow(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	s, _ := qone(db, "SELECT * FROM shows WHERE id=?", id)
	if s == nil {
		jerr(w, 404, "That show doesn't exist.")
		return
	}
	lines, _ := qmaps(db, `SELECT si.*, i.tag, i.name, i.category, i.subcategory, i.size, i.era, i.color, i.photo, i.location, i.condition current_condition
		FROM show_items si JOIN items i ON i.id=si.item_id WHERE si.show_id=? ORDER BY si.character IS NULL, si.character COLLATE NOCASE, i.category, i.name`, id)
	jout(w, map[string]any{"show": s, "items": lines, "people": showPeople(id), "numbers": showNumbers(id), "materials": showFiles(id, "material"), "photos": showFiles(id, "photo")})
}

func apiUpdateShow(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	if _, ok := b["title"]; ok && str(b["title"]) == "" {
		jerr(w, 400, "Enter the show's title.")
		return
	}
	if err := updateRow(db, "shows", showFields, id, b, map[string]any{"updated_at": now(), "updated_by": currentUser(r).Name()}); err != nil {
		fail(w, err)
		return
	}
	var t string
	db.QueryRow("SELECT title FROM shows WHERE id=?", id).Scan(&t)
	logActivity(currentUser(r).Name(), "show", "Edited show "+t)
	jout(w, map[string]any{"ok": true})
}

func apiDeleteShow(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	var n int
	db.QueryRow("SELECT COUNT(*) FROM show_items WHERE show_id=?", id).Scan(&n)
	if n > 0 {
		jerr(w, 400, "This show has items on its record. Remove them first, or mark the show Closed to keep its history.")
		return
	}
	var t string
	db.QueryRow("SELECT title FROM shows WHERE id=?", id).Scan(&t)
	deleteShowMedia(id)
	db.Exec("DELETE FROM shows WHERE id=?", id)
	logActivity(currentUser(r).Name(), "show", "Deleted show "+t)
	jout(w, map[string]any{"ok": true})
}

func apiShowCheckout(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := pathID(r)
	s, _ := qone(db, "SELECT * FROM shows WHERE id=?", id)
	if s == nil {
		jerr(w, 404, "That show doesn't exist.")
		return
	}
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	lines := list(b["items"])
	if len(lines) == 0 {
		jerr(w, 400, "Add at least one item.")
		return
	}
	dateOut := str(b["date_out"])
	if dateOut == "" {
		dateOut = today()
	}
	tx, err := db.Begin()
	if err != nil {
		fail(w, err)
		return
	}
	defer tx.Rollback()
	if err := checkAvailable(tx, lines); err != nil {
		jerr(w, 400, err.Error())
		return
	}
	for _, l := range lines {
		iid := int64(num(l["item_id"]))
		q := int64(num(l["qty"]))
		if q < 1 {
			q = 1
		}
		_, err := tx.Exec(`INSERT INTO show_items(show_id,item_id,qty,character,actor,scene,usage_notes,date_out,condition_out,created_by)
			VALUES(?,?,?,?,?,?,?,?,?,?)`, id, iid, q, clean(l["character"]), clean(l["actor"]), clean(l["scene"]), clean(l["usage_notes"]), dateOut, itemCondition(tx, iid), u.Name())
		if err != nil {
			fail(w, err)
			return
		}
	}
	if str(s["status"]) == "planning" {
		tx.Exec("UPDATE shows SET status='in production' WHERE id=?", id)
	}
	if err := tx.Commit(); err != nil {
		fail(w, err)
		return
	}
	logActivity(u.Name(), "show", fmt.Sprintf("Checked out %d item(s) to %s", len(lines), str(s["title"])))
	jout(w, map[string]any{"ok": true})
}

func apiUpdateShowItem(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	if err := updateRow(db, "show_items", []string{"character", "actor", "scene", "usage_notes", "alterations", "notes_in"}, id, b, nil); err != nil {
		fail(w, err)
		return
	}
	jout(w, map[string]any{"ok": true})
}

func apiDeleteShowItem(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	line, _ := qone(db, "SELECT si.*, i.name, s.title FROM show_items si JOIN items i ON i.id=si.item_id JOIN shows s ON s.id=si.show_id WHERE si.id=?", id)
	if line == nil {
		jerr(w, 404, "That line doesn't exist.")
		return
	}
	if line["date_returned"] != nil && currentUser(r).Role != "director" {
		jerr(w, 403, "Returned items are part of the show's history. Only a director can remove them.")
		return
	}
	db.Exec("DELETE FROM show_items WHERE id=?", id)
	logActivity(currentUser(r).Name(), "show", fmt.Sprintf("Removed %s from %s", str(line["name"]), str(line["title"])))
	jout(w, map[string]any{"ok": true})
}

func apiShowReturn(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := pathID(r)
	s, _ := qone(db, "SELECT * FROM shows WHERE id=?", id)
	if s == nil {
		jerr(w, 404, "That show doesn't exist.")
		return
	}
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	dr := str(b["date_returned"])
	if dr == "" {
		dr = today()
	}
	tx, err := db.Begin()
	if err != nil {
		fail(w, err)
		return
	}
	defer tx.Rollback()
	n := 0
	for _, l := range list(b["items"]) {
		lid := int64(num(l["id"]))
		line, _ := qone(tx, "SELECT * FROM show_items WHERE id=? AND show_id=? AND date_returned IS NULL", lid, id)
		if line == nil {
			continue
		}
		iid := line["item_id"].(int64)
		ci := int64(num(l["condition_in"]))
		if ci < 1 || ci > 5 {
			ci = itemCondition(tx, iid)
		}
		upd := "UPDATE show_items SET date_returned=?, condition_in=?, notes_in=?, returned_by=?"
		args := []any{dr, ci, clean(l["notes_in"]), u.Name()}
		if v, ok := l["alterations"]; ok {
			upd += ", alterations=?"
			args = append(args, clean(v))
		}
		args = append(args, lid)
		tx.Exec(upd+" WHERE id=?", args...)
		tx.Exec("UPDATE items SET condition=?, updated_at=?, updated_by=? WHERE id=?", ci, now(), u.Name(), iid)
		if ci <= 1 && l["send_to_repair"] == true {
			tx.Exec("UPDATE items SET status='repair' WHERE id=?", iid)
		}
		tx.Exec("INSERT INTO condition_log(item_id,at,condition,notes,source,user) VALUES(?,?,?,?,?,?)", iid, now(), ci, clean(l["notes_in"]), "Returned from show: "+str(s["title"]), u.Name())
		n++
	}
	if b["close_show"] == true {
		tx.Exec("UPDATE shows SET status='closed' WHERE id=?", id)
	}
	if err := tx.Commit(); err != nil {
		fail(w, err)
		return
	}
	logActivity(u.Name(), "show", fmt.Sprintf("Returned %d item(s) from %s", n, str(s["title"])))
	jout(w, map[string]any{"returned": n})
}

// ---------- export / backup / system ----------

func apiExport(w http.ResponseWriter, r *http.Request) {
	var q string
	switch r.PathValue("name") {
	case "items.csv":
		q = `SELECT tag "Tag", name "Name", category "Category", subcategory "Type", era "Era", gender "Gender", size "Size",
			chest "Chest", waist "Waist", hips "Hips", inseam "Inseam", neck "Neck", sleeve "Sleeve", head "Head", shoe_size "Shoe size",
			color "Color", material "Material", pattern "Pattern", quantity "Qty", condition "Condition (1-5)", condition_notes "Condition notes",
			location "Location", status "Status", rentable "Rentable", rental_rate "Rental rate", replacement_value "Replacement value",
			cost "Cost", acquired_date "Acquired", acquired_from "Source", keywords "Keywords", description "Description", notes "Notes",
			show_count "Shows used in", rental_count "Times rented" FROM (` + itemSelect + `) ORDER BY tag`
	case "renters.csv":
		q = `SELECT name "Name", organization "Organization", contact_name "Contact", email "Email", phone "Phone", address "Address",
			CASE approved WHEN 1 THEN 'Yes' ELSE 'No' END "Approved", approved_date "Approved on", avg_rating "Avg rating", rating_count "Ratings",
			rental_count "Rentals", damage_total "Damage charges", notes "Notes" FROM (` + renterSelect + `) ORDER BY name`
	case "rentals.csv":
		q = `SELECT r.id "Rental #", n.name "Renter", n.organization "Organization", r.purpose "Purpose", r.date_out "Out", r.date_due "Due",
			r.date_returned "Returned", r.status "Status", i.tag "Tag", i.name "Item", ri.qty "Qty", ri.condition_out "Cond. out", ri.notes_out "Notes out",
			ri.condition_in "Cond. in", ri.notes_in "Notes in", ri.damage_charge "Damage charge", r.fee "Fee", r.deposit "Deposit", r.rating "Rating", r.rating_notes "Rating notes"
			FROM rentals r JOIN renters n ON n.id=r.renter_id JOIN rental_items ri ON ri.rental_id=r.id JOIN items i ON i.id=ri.item_id ORDER BY r.id, ri.id`
	case "shows.csv":
		q = `SELECT s.title "Show", s.type "Type", s.season "Season", s.year "Year", s.director "Director", s.open_date "Opens", s.close_date "Closes",
			i.tag "Tag", i.name "Item", i.category "Category", si.qty "Qty", si.character "Character", si.actor "Actor", si.scene "Scene / Act",
			si.usage_notes "How used", si.alterations "Alterations", si.date_out "Out", si.condition_out "Cond. out", si.date_returned "Returned", si.condition_in "Cond. in", si.notes_in "Return notes"
			FROM show_items si JOIN shows s ON s.id=si.show_id JOIN items i ON i.id=si.item_id ORDER BY s.year, s.title, si.character`
	case "people.csv":
		q = `SELECT s.title "Show", s.season "Season", s.year "Year",
			CASE p.kind WHEN 'team' THEN 'Production team' WHEN 'cast' THEN 'Cast' WHEN 'pit' THEN 'Pit orchestra' ELSE 'Crew' END "Group",
			p.name "Name", p.role "Role / position / instrument", p.voice_part "Voice part", p.grade "Grade", p.email "Email", p.phone "Phone", p.notes "Notes"
			FROM show_people p JOIN shows s ON s.id=p.show_id ORDER BY s.year, s.title, CASE p.kind WHEN 'team' THEN 0 WHEN 'cast' THEN 1 WHEN 'pit' THEN 2 ELSE 3 END, p.sort`
	case "numbers.csv":
		q = `SELECT s.title "Show", s.season "Season", s.year "Year", n.act "Act", n.number "No.", n.title "Song", n.singers "Sung by", n.scene "Scene", n.notes "Notes"
			FROM show_numbers n JOIN shows s ON s.id=n.show_id ORDER BY s.year, s.title, n.sort`
	default:
		http.NotFound(w, r)
		return
	}
	rows, err := db.Query(q)
	if err != nil {
		fail(w, err)
		return
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="AHS-Theatre-%s-%s"`, today(), r.PathValue("name")))
	w.Write([]byte("\xEF\xBB\xBF")) // BOM so Excel reads UTF-8
	cw := csv.NewWriter(w)
	cw.Write(cols)
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		rows.Scan(ptrs...)
		rec := make([]string, len(cols))
		for i, v := range vals {
			switch t := v.(type) {
			case nil:
			case []byte:
				rec[i] = string(t)
			case float64:
				rec[i] = strconv.FormatFloat(t, 'f', -1, 64)
			default:
				rec[i] = fmt.Sprint(t)
			}
		}
		cw.Write(rec)
	}
	cw.Flush()
	logActivity(currentUser(r).Name(), "export", "Exported "+r.PathValue("name"))
}

func backupDir() string { return filepath.Join(dataDir, "backups") }

func makeBackup(label string) (string, error) {
	os.MkdirAll(backupDir(), 0o755)
	name := fmt.Sprintf("inventory-%s-%s.db", time.Now().Format("2006-01-02-150405"), label)
	p := filepath.Join(backupDir(), name)
	if _, err := db.Exec("VACUUM INTO ?", p); err != nil {
		return "", err
	}
	pruneBackups()
	return name, nil
}

func pruneBackups() {
	ents, _ := os.ReadDir(backupDir())
	var auto []string
	for _, e := range ents {
		if strings.HasSuffix(e.Name(), "-auto.db") {
			auto = append(auto, e.Name())
		}
	}
	sort.Strings(auto)
	for len(auto) > 30 {
		os.Remove(filepath.Join(backupDir(), auto[0]))
		auto = auto[1:]
	}
}

// autoBackup makes one backup per day while the program is running.
func autoBackup() {
	for {
		ents, _ := os.ReadDir(backupDir())
		prefix := "inventory-" + today()
		done := false
		for _, e := range ents {
			if strings.HasPrefix(e.Name(), prefix) {
				done = true
			}
		}
		if !done {
			if _, err := makeBackup("auto"); err != nil {
				logf("auto backup failed: %v", err)
			}
		}
		time.Sleep(time.Hour)
	}
}

func apiBackups(w http.ResponseWriter, r *http.Request) {
	ents, _ := os.ReadDir(backupDir())
	out := []map[string]any{}
	for i := len(ents) - 1; i >= 0; i-- {
		e := ents[i]
		if info, err := e.Info(); err == nil && strings.HasSuffix(e.Name(), ".db") {
			out = append(out, map[string]any{"name": e.Name(), "size": info.Size(), "modified": info.ModTime().Format("2006-01-02 15:04")})
		}
	}
	jout(w, map[string]any{"folder": backupDir(), "backups": out})
}

func apiBackupNow(w http.ResponseWriter, r *http.Request) {
	name, err := makeBackup("manual")
	if err != nil {
		fail(w, err)
		return
	}
	logActivity(currentUser(r).Name(), "backup", "Made backup "+name)
	jout(w, map[string]any{"name": name})
}

func apiSystem(w http.ResponseWriter, r *http.Request) {
	jout(w, map[string]any{"version": appVersion, "data_folder": dataDir, "database": dbPath(), "port": cfg.Port, "network": cfg.AllowNetwork, "lan_urls": lanURLs(), "cloud_folder": cfg.MirrorFolder, "last_sync": lastSync, "last_sync_error": lastSyncErr})
}

func apiOpenFolder(w http.ResponseWriter, r *http.Request) {
	b, _ := body(r)
	dir := dataDir
	if str(b["which"]) == "backups" {
		dir = backupDir()
	}
	openFolder(dir)
	jout(w, map[string]any{"ok": true})
}

func apiShutdown(w http.ResponseWriter, r *http.Request) {
	logActivity(currentUser(r).Name(), "system", "Closed the program")
	jout(w, map[string]any{"ok": true})
	go func() {
		time.Sleep(300 * time.Millisecond)
		if cfg.MirrorFolder != "" {
			syncNow()
		}
		db.Close()
		os.Exit(0)
	}()
}
