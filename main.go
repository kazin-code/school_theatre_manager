package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	appName    = "AHS Theatre Inventory"
	appID      = "ahs-theatre-inventory"
	appVersion = "1.0.0"
)

//go:embed web
var webFS embed.FS

type Config struct {
	Port         int    `json:"port"`
	AllowNetwork bool   `json:"allow_network"`
	MirrorFolder string `json:"mirror_folder"`
}

var (
	dataDir string
	cfg     = Config{Port: 8417}
	logger  *log.Logger
)

func dbPath() string { return filepath.Join(dataDir, "inventory.db") }

func logf(format string, a ...any) {
	if logger != nil {
		logger.Printf(format, a...)
	}
}

func loadConfig() {
	p := filepath.Join(dataDir, "config.json")
	b, err := os.ReadFile(p)
	if err == nil {
		json.Unmarshal(b, &cfg)
	}
	if cfg.Port <= 0 {
		cfg.Port = 8417
	}
	if err != nil {
		out, _ := json.MarshalIndent(cfg, "", "  ")
		os.WriteFile(p, out, 0o644)
	}
}

func prepareDataDir() error {
	for _, d := range []string{dataDir, filepath.Join(dataDir, "photos"), filepath.Join(dataDir, "backups")} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return fmt.Errorf("could not create %s: %w", d, err)
		}
	}
	lf, err := os.OpenFile(filepath.Join(dataDir, "app.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err == nil {
		logger = log.New(lf, "", log.LstdFlags)
	}
	loadConfig()
	if err := openDB(dbPath()); err != nil {
		return fmt.Errorf("could not open the database: %w", err)
	}
	return initSchema()
}

func main() {
	initDB := flag.Bool("init-db", false, "create the database and data folders, then exit (used by the installer)")
	reset := flag.Bool("reset-password", false, "reset a director password (must be run as administrator)")
	noBrowser := flag.Bool("no-browser", false, "do not open the browser")
	dataFlag := flag.String("data", "", "data folder")
	flag.Parse()

	dataDir = *dataFlag
	if dataDir == "" {
		dataDir = defaultDataDir()
	}

	if *initDB {
		if err := prepareDataDir(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(2)
		}
		// The installer passes the first director account through environment variables
		// so the password never appears on a command line.
		if u := os.Getenv("ATI_ADMIN_USER"); u != "" && userCount() == 0 {
			if _, err := createUser(u, os.Getenv("ATI_ADMIN_NAME"), "director", os.Getenv("ATI_ADMIN_PASS"), false); err != nil {
				fmt.Fprintln(os.Stderr, err)
				logf("installer could not create director: %v", err)
				os.Exit(3)
			}
			logActivity(u, "account", "Director account created by installer")
		}
		logActivity("Installer", "system", "Database ready at "+dbPath())
		db.Close()
		return
	}

	if *reset {
		resetPassword()
		return
	}

	url := fmt.Sprintf("http://127.0.0.1:%d/", cfg.Port)
	// If the program is already running, just open the browser to it.
	loadConfigOnly()
	url = fmt.Sprintf("http://127.0.0.1:%d/", cfg.Port)
	if alreadyRunning(cfg.Port) {
		if !*noBrowser {
			openBrowser(url)
		}
		return
	}

	if err := prepareDataDir(); err != nil {
		showMessage(appName, "The inventory could not start.\n\n"+err.Error()+"\n\nData folder: "+dataDir)
		os.Exit(1)
	}

	mux := http.NewServeMux()
	routes(mux)
	sub, _ := fs.Sub(webFS, "web")
	static := http.FileServer(http.FS(sub))
	mux.Handle("GET /", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.URL.Path == "/" {
			w.Header().Set("Cache-Control", "no-store")
		}
		static.ServeHTTP(w, r)
	}))

	host := "127.0.0.1"
	if cfg.AllowNetwork {
		host = "0.0.0.0"
	}
	ln, err := net.Listen("tcp", fmt.Sprintf("%s:%d", host, cfg.Port))
	if err != nil {
		showMessage(appName, fmt.Sprintf("The inventory could not start because port %d is in use by another program.\n\nChange \"port\" in %s and try again.", cfg.Port, filepath.Join(dataDir, "config.json")))
		os.Exit(1)
	}
	logf("started v%s on %s, data %s", appVersion, ln.Addr(), dataDir)
	go autoBackup()
	if cfg.MirrorFolder != "" {
		go func() {
			time.Sleep(20 * time.Second)
			if err := syncNow(); err != nil {
				logf("cloud backup at startup failed: %v", err)
			}
		}()
	}
	go func() {
		for {
			db.Exec("DELETE FROM sessions WHERE expires_at < ?", now())
			time.Sleep(6 * time.Hour)
		}
	}()
	if !*noBrowser {
		go func() {
			time.Sleep(400 * time.Millisecond)
			openBrowser(url)
		}()
	}
	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	if err := srv.Serve(ln); err != nil {
		logf("server stopped: %v", err)
	}
}

func loadConfigOnly() {
	if b, err := os.ReadFile(filepath.Join(dataDir, "config.json")); err == nil {
		json.Unmarshal(b, &cfg)
	}
	if cfg.Port <= 0 {
		cfg.Port = 8417
	}
}

func alreadyRunning(port int) bool {
	c := http.Client{Timeout: 800 * time.Millisecond}
	resp, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d/api/ping", port))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	var m map[string]any
	json.NewDecoder(resp.Body).Decode(&m)
	return m["app"] == appID
}

func lanURLs() []string {
	if !cfg.AllowNetwork {
		return nil
	}
	out := []string{}
	addrs, _ := net.InterfaceAddrs()
	for _, a := range addrs {
		if ipn, ok := a.(*net.IPNet); ok && ipn.IP.To4() != nil && !ipn.IP.IsLoopback() && !strings.HasPrefix(ipn.IP.String(), "169.254") {
			out = append(out, fmt.Sprintf("http://%s:%d/", ipn.IP, cfg.Port))
		}
	}
	return out
}

// resetPassword gives a director account a temporary password. It needs administrator
// rights (proved by writing into the protected install folder), so students can't use it.
func resetPassword() {
	exe, _ := os.Executable()
	probe := filepath.Join(filepath.Dir(exe), ".admin-check")
	if err := os.WriteFile(probe, []byte("x"), 0o644); err != nil {
		showMessage(appName, "Resetting a password needs administrator rights.\n\nRight-click \"Reset Director Password\" and choose \"Run as administrator\".")
		return
	}
	os.Remove(probe)
	if err := prepareDataDir(); err != nil {
		showMessage(appName, err.Error())
		return
	}
	var id int64
	var name string
	if err := db.QueryRow("SELECT id, username FROM users WHERE role='director' ORDER BY active DESC, last_login DESC LIMIT 1").Scan(&id, &name); err != nil {
		showMessage(appName, "There is no director account yet. Open the inventory to create one.")
		return
	}
	temp := strings.ToUpper(randomToken(3)) + "-" + strings.ToUpper(randomToken(3))
	h, _ := hashPassword(temp)
	db.Exec("UPDATE users SET pw_hash=?, must_change=1, active=1 WHERE id=?", h, id)
	db.Exec("DELETE FROM sessions WHERE user_id=?", id)
	logActivity("Administrator", "account", "Reset director password for "+name)
	db.Close()
	showMessage(appName, fmt.Sprintf("The director password has been reset.\n\nUsername:  %s\nTemporary password:  %s\n\nYou will be asked to choose a new password when you sign in.", name, temp))
}
