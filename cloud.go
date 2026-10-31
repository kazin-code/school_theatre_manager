package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Cloud backup: after changes, a copy of the database and any new photos is written into a
// folder that OneDrive / Google Drive / Dropbox keeps synced to the cloud.

const (
	mirrorSub = "School Theatre Manager Backup"
)

var (
	syncMu      sync.Mutex
	syncTimer   *time.Timer
	lastSync    string
	lastSyncErr string
)

func mirrorRoot() string {
	if cfg.MirrorFolder == "" {
		return ""
	}
	cur := filepath.Join(cfg.MirrorFolder, mirrorSub)
	if _, err := os.Stat(cur); err != nil {
		// names used by versions 1.0 and 1.1
		for _, oldSub := range []string{"AHS Theatre Application Backup", "AHS Theatre Inventory Backup"} {
			if old := filepath.Join(cfg.MirrorFolder, oldSub); dirExists(old) {
				if os.Rename(old, cur) != nil {
					return old
				}
				break
			}
		}
	}
	return cur
}

func dirExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

func saveConfig() error {
	out, _ := json.MarshalIndent(cfg, "", "  ")
	return os.WriteFile(filepath.Join(dataDir, "config.json"), out, 0o644)
}

// markChanged schedules a cloud copy 90 seconds after the last change.
func markChanged() {
	if cfg.MirrorFolder == "" {
		return
	}
	syncMu.Lock()
	defer syncMu.Unlock()
	if syncTimer != nil {
		syncTimer.Stop()
	}
	syncTimer = time.AfterFunc(90*time.Second, func() {
		if err := syncNow(); err != nil {
			logf("cloud backup failed: %v", err)
		}
	})
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".partial"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	os.Remove(dst)
	return os.Rename(tmp, dst)
}

func syncNow() error {
	root := mirrorRoot()
	if root == "" {
		return errors.New("No cloud backup folder is set.")
	}
	err := func() error {
		if _, err := os.Stat(cfg.MirrorFolder); err != nil {
			return fmt.Errorf("The cloud folder %s can't be reached. Is OneDrive/Google Drive signed in?", cfg.MirrorFolder)
		}
		for _, d := range []string{root, filepath.Join(root, "daily"), filepath.Join(root, "photos"), filepath.Join(root, "showfiles"), filepath.Join(root, "branding")} {
			if err := os.MkdirAll(d, 0o755); err != nil {
				return err
			}
		}
		// consistent snapshot of the live database
		snap := filepath.Join(os.TempDir(), fmt.Sprintf("ati-snap-%d.db", time.Now().UnixNano()))
		if _, err := db.Exec("VACUUM INTO ?", snap); err != nil {
			return err
		}
		defer os.Remove(snap)
		if err := copyFile(snap, filepath.Join(root, "inventory-latest.db")); err != nil {
			return err
		}
		daily := filepath.Join(root, "daily", "inventory-"+today()+".db")
		if err := copyFile(snap, daily); err != nil {
			return err
		}
		// keep 60 daily copies
		ents, _ := os.ReadDir(filepath.Join(root, "daily"))
		names := []string{}
		for _, e := range ents {
			if strings.HasSuffix(e.Name(), ".db") {
				names = append(names, e.Name())
			}
		}
		sort.Strings(names)
		for len(names) > 60 {
			os.Remove(filepath.Join(root, "daily", names[0]))
			names = names[1:]
		}
		// school branding is small and can change, so it is always copied
		bents, _ := os.ReadDir(brandDir())
		for _, e := range bents {
			if err := copyFile(filepath.Join(brandDir(), e.Name()), filepath.Join(root, "branding", e.Name())); err != nil {
				return err
			}
		}
		// photos and show files: copy any that aren't there yet
		for sub, local := range map[string]string{"photos": photoDir(), "showfiles": showFileDir()} {
			ents, _ := os.ReadDir(local)
			for _, e := range ents {
				dst := filepath.Join(root, sub, e.Name())
				if _, err := os.Stat(dst); err == nil {
					continue
				}
				if err := copyFile(filepath.Join(local, e.Name()), dst); err != nil {
					return err
				}
			}
		}
		os.WriteFile(filepath.Join(root, "README.txt"), []byte("These files are automatic backups from School Theatre Manager ("+programName()+").\r\n\r\nTo restore on a new computer: install School Theatre Manager, sign in as director,\r\nopen Settings > Cloud backup, choose this folder and click Restore.\r\n\r\nDo not edit these files.\r\n"), 0o644)
		return nil
	}()
	syncMu.Lock()
	if err != nil {
		lastSyncErr = err.Error()
	} else {
		lastSync = now()
		lastSyncErr = ""
	}
	syncMu.Unlock()
	return err
}

func cloudCandidates() []map[string]string {
	out := []map[string]string{}
	seen := map[string]bool{}
	add := func(label, p string) {
		if p == "" || seen[strings.ToLower(p)] {
			return
		}
		if st, err := os.Stat(p); err == nil && st.IsDir() {
			seen[strings.ToLower(p)] = true
			out = append(out, map[string]string{"label": label, "path": p})
		}
	}
	add("OneDrive (school)", os.Getenv("OneDriveCommercial"))
	add("OneDrive", os.Getenv("OneDrive"))
	add("OneDrive (personal)", os.Getenv("OneDriveConsumer"))
	home, _ := os.UserHomeDir()
	for _, l := range "GHIJKLMNOPQRSTUVWXYZ" {
		add("Google Drive", string(l)+`:\My Drive`)
	}
	add("Google Drive", filepath.Join(home, "Google Drive"))
	add("Google Drive", filepath.Join(home, "My Drive"))
	add("Dropbox", filepath.Join(home, "Dropbox"))
	return out
}

func mirrorBackups(root string) []map[string]any {
	out := []map[string]any{}
	if root == "" {
		return out
	}
	if st, err := os.Stat(filepath.Join(root, "inventory-latest.db")); err == nil {
		out = append(out, map[string]any{"name": "inventory-latest.db", "label": "Most recent copy", "modified": st.ModTime().Format("2006-01-02 15:04"), "size": st.Size()})
	}
	ents, _ := os.ReadDir(filepath.Join(root, "daily"))
	for i := len(ents) - 1; i >= 0; i-- {
		e := ents[i]
		if st, err := e.Info(); err == nil && strings.HasSuffix(e.Name(), ".db") {
			out = append(out, map[string]any{"name": "daily/" + e.Name(), "label": "End of " + strings.TrimSuffix(strings.TrimPrefix(e.Name(), "inventory-"), ".db"), "modified": st.ModTime().Format("2006-01-02 15:04"), "size": st.Size()})
		}
	}
	return out
}

func apiCloud(w http.ResponseWriter, r *http.Request) {
	syncMu.Lock()
	ls, le := lastSync, lastSyncErr
	syncMu.Unlock()
	jout(w, map[string]any{"folder": cfg.MirrorFolder, "backup_folder": mirrorRoot(), "last_sync": ls, "last_error": le,
		"candidates": cloudCandidates(), "backups": mirrorBackups(mirrorRoot())})
}

func apiSetCloud(w http.ResponseWriter, r *http.Request) {
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	folder := str(b["folder"])
	if folder != "" {
		st, err := os.Stat(folder)
		if err != nil || !st.IsDir() {
			jerr(w, 400, "That folder doesn't exist on this computer. Copy the folder's path from File Explorer's address bar.")
			return
		}
		probe := filepath.Join(folder, ".ati-write-test")
		if err := os.WriteFile(probe, []byte("ok"), 0o644); err != nil {
			jerr(w, 400, "The app can't save files in that folder. Choose a folder you can write to.")
			return
		}
		os.Remove(probe)
	}
	cfg.MirrorFolder = folder
	if err := saveConfig(); err != nil {
		fail(w, err)
		return
	}
	if folder == "" {
		logActivity(currentUser(r).Name(), "backup", "Turned off cloud backup")
		jout(w, map[string]any{"ok": true})
		return
	}
	logActivity(currentUser(r).Name(), "backup", "Cloud backup folder set to "+folder)
	// If the folder already holds a backup from another computer, don't overwrite it before the director decides.
	if st, err := os.Stat(filepath.Join(mirrorRoot(), "inventory-latest.db")); err == nil && b["sync"] != true {
		jout(w, map[string]any{"ok": true, "existing": st.ModTime().Format("2006-01-02 15:04")})
		return
	}
	if err := syncNow(); err != nil {
		jerr(w, 400, err.Error())
		return
	}
	jout(w, map[string]any{"ok": true, "synced": true})
}

func apiCloudSync(w http.ResponseWriter, r *http.Request) {
	if err := syncNow(); err != nil {
		jerr(w, 400, err.Error())
		return
	}
	logActivity(currentUser(r).Name(), "backup", "Backed up to cloud folder")
	jout(w, map[string]any{"ok": true, "last_sync": lastSync})
}

// apiRestore replaces the live database with a backup (local or cloud). A safety copy is made first.
func apiRestore(w http.ResponseWriter, r *http.Request) {
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	name := str(b["name"])
	var src string
	switch str(b["source"]) {
	case "cloud":
		if mirrorRoot() == "" {
			jerr(w, 400, "Set the cloud backup folder first.")
			return
		}
		clean := filepath.Clean(name)
		if strings.Contains(clean, "..") || filepath.IsAbs(clean) {
			jerr(w, 400, "Invalid backup name.")
			return
		}
		src = filepath.Join(mirrorRoot(), clean)
	case "local":
		if !safeName.MatchString(name) {
			jerr(w, 400, "Invalid backup name.")
			return
		}
		src = filepath.Join(backupDir(), name)
	default:
		jerr(w, 400, "Choose a backup to restore.")
		return
	}
	if err := validBackup(src); err != nil {
		jerr(w, 400, err.Error())
		return
	}
	who := currentUser(r).Name()
	safety, err := makeBackup("before-restore")
	if err != nil {
		fail(w, err)
		return
	}
	syncMu.Lock()
	if syncTimer != nil {
		syncTimer.Stop()
	}
	syncMu.Unlock()
	db.Close()
	os.Remove(dbPath() + "-wal")
	os.Remove(dbPath() + "-shm")
	if err := copyFile(src, dbPath()); err != nil {
		openDB(dbPath())
		fail(w, err)
		return
	}
	if err := openDB(dbPath()); err != nil {
		fail(w, err)
		return
	}
	initSchema()
	restored := 0
	if str(b["source"]) == "cloud" {
		for sub, local := range map[string]string{"photos": photoDir(), "showfiles": showFileDir()} {
			os.MkdirAll(local, 0o755)
			ents, _ := os.ReadDir(filepath.Join(mirrorRoot(), sub))
			for _, e := range ents {
				dst := filepath.Join(local, e.Name())
				if _, err := os.Stat(dst); err != nil {
					if copyFile(filepath.Join(mirrorRoot(), sub, e.Name()), dst) == nil {
						restored++
					}
				}
			}
		}
	}
	if str(b["source"]) == "cloud" {
		bents, _ := os.ReadDir(filepath.Join(mirrorRoot(), "branding"))
		for _, e := range bents {
			os.MkdirAll(brandDir(), 0o755)
			copyFile(filepath.Join(mirrorRoot(), "branding", e.Name()), filepath.Join(brandDir(), e.Name()))
		}
		loadBranding()
	}
	logActivity(who, "backup", fmt.Sprintf("Restored database from %s backup %s (safety copy: %s)", str(b["source"]), name, safety))
	jout(w, map[string]any{"ok": true, "photos": restored, "safety": safety})
}

func validBackup(p string) error {
	f, err := os.Open(p)
	if err != nil {
		return errors.New("That backup file can't be found.")
	}
	defer f.Close()
	head := make([]byte, 16)
	if _, err := io.ReadFull(f, head); err != nil || string(head[:15]) != "SQLite format 3" {
		return errors.New("That file isn't an inventory database.")
	}
	return nil
}
