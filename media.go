package main

import (
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Pictures for items and shows, show materials (scripts, scores, programs…), and show people
// (production team, cast and crew).

const (
	maxPhotoBytes    = 25 << 20
	maxMaterialBytes = 200 << 20
	maxItemPhotos    = 40
)

var photoExts = map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true}

// Files that could run code on the computer are never stored.
var blockedExts = map[string]bool{".exe": true, ".msi": true, ".bat": true, ".cmd": true, ".com": true, ".scr": true, ".ps1": true, ".vbs": true,
	".vbe": true, ".js": true, ".jse": true, ".wsf": true, ".wsh": true, ".jar": true, ".dll": true, ".lnk": true, ".reg": true, ".hta": true,
	".html": true, ".htm": true, ".svg": true, ".xhtml": true, ".cpl": true, ".msc": true, ".pif": true, ".appx": true, ".msix": true}

func showFileDir() string { return filepath.Join(dataDir, "showfiles") }

// migrate brings older databases up to date. Safe to run every start.
func migrate() {
	addColumn("shows", "cover", "TEXT")
	addColumn("show_people", "voice_part", "TEXT")
	// carry single photos from version 1.0 into the gallery
	db.Exec(`INSERT INTO item_photos(item_id,file,sort,created_at,created_by)
		SELECT id, photo, 0, COALESCE(updated_at, created_at), updated_by FROM items
		WHERE photo IS NOT NULL AND id NOT IN (SELECT item_id FROM item_photos)`)
	migratePrograms()
	for _, list := range []string{"team_position", "crew_position", "material_type", "voice_part", "instrument"} {
		vals := defaultLookups[list]
		var n int
		db.QueryRow("SELECT COUNT(*) FROM lookups WHERE list=?", list).Scan(&n)
		if n == 0 {
			for i, v := range vals {
				db.Exec("INSERT OR IGNORE INTO lookups(list,value,sort) VALUES(?,?,?)", list, v, i)
			}
		}
	}
}

func addColumn(table, col, typ string) {
	rows, _ := qmaps(db, "SELECT name FROM pragma_table_info(?)", table)
	for _, r := range rows {
		if str(r["name"]) == col {
			return
		}
	}
	db.Exec(fmt.Sprintf(`ALTER TABLE %s ADD COLUMN "%s" %s`, table, col, typ))
}

// saveUpload writes one multipart file into dir under a generated name and returns it.
func saveUpload(dir, prefix string, src io.Reader, ext string) (string, int64, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", 0, err
	}
	name := fmt.Sprintf("%s-%d-%s%s", prefix, time.Now().Unix(), randomToken(4), ext)
	out, err := os.Create(filepath.Join(dir, name))
	if err != nil {
		return "", 0, err
	}
	n, err := io.Copy(out, src)
	cerr := out.Close()
	if err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(filepath.Join(dir, name))
		return "", 0, err
	}
	return name, n, nil
}

func cleanExt(filename string) string {
	return strings.ToLower(filepath.Ext(filename))
}

// ---------- item photos ----------

func itemPhotos(id int64) []map[string]any {
	rows, _ := qmaps(db, "SELECT * FROM item_photos WHERE item_id=? ORDER BY sort, id", id)
	return rows
}

// refreshMainPhoto keeps items.photo (used for thumbnails) pointing at a real photo.
func refreshMainPhoto(itemID int64) {
	var cur string
	db.QueryRow("SELECT COALESCE(photo,'') FROM items WHERE id=?", itemID).Scan(&cur)
	var exists int
	db.QueryRow("SELECT COUNT(*) FROM item_photos WHERE item_id=? AND file=?", itemID, cur).Scan(&exists)
	if cur != "" && exists > 0 {
		return
	}
	var first string
	db.QueryRow("SELECT COALESCE((SELECT file FROM item_photos WHERE item_id=? ORDER BY sort, id LIMIT 1),'')", itemID).Scan(&first)
	if first == "" {
		db.Exec("UPDATE items SET photo=NULL WHERE id=?", itemID)
	} else {
		db.Exec("UPDATE items SET photo=? WHERE id=?", first, itemID)
	}
}

func apiAddItemPhotos(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := pathID(r)
	it := getItem(id)
	if it == nil {
		jerr(w, 404, "That item doesn't exist.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxPhotoBytes*12)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		jerr(w, 400, "Those photos are too large. Add up to 10 at a time, each under 25 MB.")
		return
	}
	files := r.MultipartForm.File["photo"]
	if len(files) == 0 {
		jerr(w, 400, "Choose at least one photo.")
		return
	}
	var have int
	db.QueryRow("SELECT COUNT(*) FROM item_photos WHERE item_id=?", id).Scan(&have)
	if have+len(files) > maxItemPhotos {
		jerr(w, 400, fmt.Sprintf("An item can have up to %d photos. This one has %d.", maxItemPhotos, have))
		return
	}
	var sort int
	db.QueryRow("SELECT COALESCE(MAX(sort),0)+1 FROM item_photos WHERE item_id=?", id).Scan(&sort)
	added := 0
	for _, fh := range files {
		ext := cleanExt(fh.Filename)
		if ext == ".heic" || ext == ".heif" {
			jerr(w, 400, fmt.Sprintf("%s is an iPhone HEIC photo, which browsers can't show. On the iPhone, choose Settings → Camera → Formats → Most Compatible, or export the photo as JPG.", fh.Filename))
			return
		}
		if !photoExts[ext] || fh.Size > maxPhotoBytes {
			jerr(w, 400, fmt.Sprintf("%s isn't a JPG, PNG, WEBP or GIF photo under 25 MB.", fh.Filename))
			return
		}
		f, err := fh.Open()
		if err != nil {
			fail(w, err)
			return
		}
		name, _, err := saveUpload(photoDir(), fmt.Sprintf("item-%d", id), f, ext)
		f.Close()
		if err != nil {
			fail(w, err)
			return
		}
		db.Exec("INSERT INTO item_photos(item_id,file,caption,sort,created_at,created_by) VALUES(?,?,?,?,?,?)", id, name, clean(r.FormValue("caption")), sort, now(), u.Name())
		sort++
		added++
	}
	refreshMainPhoto(id)
	db.Exec("UPDATE items SET updated_at=?, updated_by=? WHERE id=?", now(), u.Name(), id)
	logActivity(u.Name(), "item", fmt.Sprintf("Added %d photo(s) to %s %s", added, str(it["tag"]), str(it["name"])))
	jout(w, map[string]any{"photos": itemPhotos(id)})
}

func itemPhotoRow(pid int64) map[string]any {
	m, _ := qone(db, "SELECT * FROM item_photos WHERE id=?", pid)
	return m
}

func apiUpdateItemPhoto(w http.ResponseWriter, r *http.Request) {
	p := itemPhotoRow(pathID(r))
	if p == nil {
		jerr(w, 404, "That photo doesn't exist.")
		return
	}
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	if _, ok := b["caption"]; ok {
		db.Exec("UPDATE item_photos SET caption=? WHERE id=?", clean(b["caption"]), p["id"])
	}
	if b["main"] == true {
		db.Exec("UPDATE items SET photo=? WHERE id=?", p["file"], p["item_id"])
		// main photo leads the gallery
		db.Exec("UPDATE item_photos SET sort=sort+1 WHERE item_id=?", p["item_id"])
		db.Exec("UPDATE item_photos SET sort=0 WHERE id=?", p["id"])
	}
	if mv := str(b["move"]); mv == "left" || mv == "right" {
		movePhoto(p, mv == "left")
	}
	jout(w, map[string]any{"photos": itemPhotos(p["item_id"].(int64))})
}

// movePhoto swaps a photo with its neighbour in the gallery order.
func movePhoto(p map[string]any, left bool) {
	list := itemPhotos(p["item_id"].(int64))
	for i, x := range list {
		db.Exec("UPDATE item_photos SET sort=? WHERE id=?", i, x["id"])
	}
	for i, x := range list {
		if x["id"] == p["id"] {
			j := i + 1
			if left {
				j = i - 1
			}
			if j >= 0 && j < len(list) {
				db.Exec("UPDATE item_photos SET sort=? WHERE id=?", j, x["id"])
				db.Exec("UPDATE item_photos SET sort=? WHERE id=?", i, list[j]["id"])
			}
		}
	}
	db.Exec(`UPDATE items SET photo=(SELECT file FROM item_photos WHERE item_id=? ORDER BY sort, id LIMIT 1) WHERE id=?`, p["item_id"], p["item_id"])
}

func apiDeleteItemPhoto(w http.ResponseWriter, r *http.Request) {
	p := itemPhotoRow(pathID(r))
	if p == nil {
		jerr(w, 404, "That photo doesn't exist.")
		return
	}
	db.Exec("DELETE FROM item_photos WHERE id=?", p["id"])
	os.Remove(filepath.Join(photoDir(), str(p["file"])))
	iid := p["item_id"].(int64)
	refreshMainPhoto(iid)
	logActivity(currentUser(r).Name(), "item", fmt.Sprintf("Removed a photo from item #%d", iid))
	jout(w, map[string]any{"photos": itemPhotos(iid)})
}

func deleteItemPhotos(itemID int64) {
	for _, p := range itemPhotos(itemID) {
		os.Remove(filepath.Join(photoDir(), str(p["file"])))
	}
	db.Exec("DELETE FROM item_photos WHERE item_id=?", itemID)
}

// ---------- show people ----------

var peopleKinds = map[string]string{"team": "production team", "cast": "cast", "pit": "pit orchestra", "crew": "crew"}
var personFields = []string{"kind", "name", "role", "voice_part", "grade", "email", "phone", "notes"}

const kindOrder = `CASE kind WHEN 'team' THEN 0 WHEN 'cast' THEN 1 WHEN 'pit' THEN 2 ELSE 3 END`

func showPeople(showID int64) []map[string]any {
	rows, _ := qmaps(db, `SELECT * FROM show_people WHERE show_id=? ORDER BY `+kindOrder+`, sort, id`, showID)
	return rows
}

// ---------- musical numbers ----------

var numberFields = []string{"act", "number", "title", "singers", "scene", "notes"}

func showNumbers(showID int64) []map[string]any {
	rows, _ := qmaps(db, "SELECT * FROM show_numbers WHERE show_id=? ORDER BY sort, id", showID)
	return rows
}

func apiAddNumbers(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := pathID(r)
	var title string
	if db.QueryRow("SELECT title FROM shows WHERE id=?", id).Scan(&title) != nil {
		jerr(w, 404, "That show doesn't exist.")
		return
	}
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	nums := list(b["numbers"])
	if len(nums) == 0 || len(nums) > 300 {
		jerr(w, 400, "Add between 1 and 300 musical numbers.")
		return
	}
	tx, _ := db.Begin()
	defer tx.Rollback()
	var sort int
	tx.QueryRow("SELECT COALESCE(MAX(sort),0)+1 FROM show_numbers WHERE show_id=?", id).Scan(&sort)
	n := 0
	for _, x := range nums {
		if str(x["title"]) == "" {
			continue
		}
		if _, err := insertRow(tx, "show_numbers", numberFields, x, map[string]any{"show_id": id, "sort": sort, "created_at": now(), "created_by": u.Name()}); err != nil {
			fail(w, err)
			return
		}
		sort++
		n++
	}
	if err := tx.Commit(); err != nil {
		fail(w, err)
		return
	}
	logActivity(u.Name(), "show", fmt.Sprintf("Added %d musical number(s) to %s", n, title))
	jout(w, map[string]any{"added": n})
}

func apiUpdateNumber(w http.ResponseWriter, r *http.Request) {
	nid := pathID(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	if _, ok := b["title"]; ok && str(b["title"]) == "" {
		jerr(w, 400, "Enter the song title.")
		return
	}
	if err := updateRow(db, "show_numbers", numberFields, nid, b, nil); err != nil {
		fail(w, err)
		return
	}
	if mv := str(b["move"]); mv == "up" || mv == "down" {
		x, _ := qone(db, "SELECT show_id FROM show_numbers WHERE id=?", nid)
		if x != nil {
			all := showNumbers(x["show_id"].(int64))
			for i, y := range all {
				db.Exec("UPDATE show_numbers SET sort=? WHERE id=?", i, y["id"])
			}
			for i, y := range all {
				if y["id"].(int64) == nid {
					j := i + 1
					if mv == "up" {
						j = i - 1
					}
					if j >= 0 && j < len(all) {
						db.Exec("UPDATE show_numbers SET sort=? WHERE id=?", j, nid)
						db.Exec("UPDATE show_numbers SET sort=? WHERE id=?", i, all[j]["id"])
					}
				}
			}
		}
	}
	jout(w, map[string]any{"ok": true})
}

func apiDeleteNumber(w http.ResponseWriter, r *http.Request) {
	db.Exec("DELETE FROM show_numbers WHERE id=?", pathID(r))
	jout(w, map[string]any{"ok": true})
}

func apiAddPeople(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := pathID(r)
	var title string
	if db.QueryRow("SELECT title FROM shows WHERE id=?", id).Scan(&title) != nil {
		jerr(w, 404, "That show doesn't exist.")
		return
	}
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	people := list(b["people"])
	if len(people) == 0 {
		jerr(w, 400, "Add at least one name.")
		return
	}
	if len(people) > 500 {
		jerr(w, 400, "Add up to 500 people at a time.")
		return
	}
	tx, _ := db.Begin()
	defer tx.Rollback()
	var sort int
	tx.QueryRow("SELECT COALESCE(MAX(sort),0)+1 FROM show_people WHERE show_id=?", id).Scan(&sort)
	n := 0
	for _, p := range people {
		if str(p["name"]) == "" {
			continue
		}
		if _, ok := peopleKinds[str(p["kind"])]; !ok {
			p["kind"] = "cast"
		}
		if _, err := insertRow(tx, "show_people", personFields, p, map[string]any{"show_id": id, "sort": sort, "created_at": now(), "created_by": u.Name()}); err != nil {
			fail(w, err)
			return
		}
		sort++
		n++
	}
	if err := tx.Commit(); err != nil {
		fail(w, err)
		return
	}
	logActivity(u.Name(), "show", fmt.Sprintf("Added %d people to %s", n, title))
	jout(w, map[string]any{"added": n, "people": showPeople(id)})
}

func apiUpdatePerson(w http.ResponseWriter, r *http.Request) {
	pid := pathID(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	if _, ok := b["name"]; ok && str(b["name"]) == "" {
		jerr(w, 400, "Enter a name.")
		return
	}
	if k, ok := b["kind"]; ok {
		if _, valid := peopleKinds[str(k)]; !valid {
			delete(b, "kind")
		}
	}
	if err := updateRow(db, "show_people", personFields, pid, b, nil); err != nil {
		fail(w, err)
		return
	}
	if mv := str(b["move"]); mv == "up" || mv == "down" {
		movePerson(pid, mv == "up")
	}
	jout(w, map[string]any{"ok": true})
}

func movePerson(pid int64, up bool) {
	p, _ := qone(db, "SELECT * FROM show_people WHERE id=?", pid)
	if p == nil {
		return
	}
	group, _ := qmaps(db, "SELECT id FROM show_people WHERE show_id=? AND kind=? ORDER BY sort, id", p["show_id"], p["kind"])
	for i, x := range group {
		db.Exec("UPDATE show_people SET sort=? WHERE id=?", i, x["id"])
	}
	for i, x := range group {
		if x["id"].(int64) == pid {
			j := i + 1
			if up {
				j = i - 1
			}
			if j >= 0 && j < len(group) {
				db.Exec("UPDATE show_people SET sort=? WHERE id=?", j, pid)
				db.Exec("UPDATE show_people SET sort=? WHERE id=?", i, group[j]["id"])
			}
		}
	}
}

func apiDeletePerson(w http.ResponseWriter, r *http.Request) {
	db.Exec("DELETE FROM show_people WHERE id=?", pathID(r))
	jout(w, map[string]any{"ok": true})
}

// ---------- show files: materials and photos ----------

func showFiles(showID int64, kind string) []map[string]any {
	rows, _ := qmaps(db, "SELECT * FROM show_files WHERE show_id=? AND kind=? ORDER BY sort, id", showID, kind)
	return rows
}

func apiAddShowFiles(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := pathID(r)
	s, _ := qone(db, "SELECT * FROM shows WHERE id=?", id)
	if s == nil {
		jerr(w, 404, "That show doesn't exist.")
		return
	}
	kind := r.URL.Query().Get("kind")
	if kind != "photo" && kind != "program" {
		kind = "material"
	}
	// "program" files are images placed in the show's printed program
	isPic := kind == "photo" || kind == "program"
	limit := int64(maxMaterialBytes)
	if isPic {
		limit = maxPhotoBytes
	}
	r.Body = http.MaxBytesReader(w, r.Body, limit*5)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		jerr(w, 400, "Those files are too large. Upload fewer at a time; each material can be up to 200 MB and each photo up to 25 MB.")
		return
	}
	files := r.MultipartForm.File["file"]
	if len(files) == 0 {
		jerr(w, 400, "Choose at least one file.")
		return
	}
	var sort int
	db.QueryRow("SELECT COALESCE(MAX(sort),0)+1 FROM show_files WHERE show_id=? AND kind=?", id, kind).Scan(&sort)
	added := 0
	for _, fh := range files {
		ext := cleanExt(fh.Filename)
		if isPic {
			if ext == ".heic" || ext == ".heif" {
				jerr(w, 400, fmt.Sprintf("%s is an iPhone HEIC photo, which browsers can't show. Export it as JPG, or upload it under Materials instead.", fh.Filename))
				return
			}
			if !photoExts[ext] {
				jerr(w, 400, fmt.Sprintf("%s isn't a JPG, PNG, WEBP or GIF photo. Other files belong under Materials.", fh.Filename))
				return
			}
		} else if blockedExts[ext] {
			jerr(w, 400, fmt.Sprintf("%s is a program or web file, which can't be stored for safety. Zip it or save it as a PDF first.", fh.Filename))
			return
		}
		if fh.Size > limit {
			jerr(w, 400, fmt.Sprintf("%s is larger than %d MB.", fh.Filename, limit>>20))
			return
		}
		f, err := fh.Open()
		if err != nil {
			fail(w, err)
			return
		}
		name, size, err := saveUpload(showFileDir(), fmt.Sprintf("show-%d", id), f, ext)
		f.Close()
		if err != nil {
			fail(w, err)
			return
		}
		orig := filepath.Base(strings.ReplaceAll(fh.Filename, `\`, "/"))
		_, err = db.Exec(`INSERT INTO show_files(show_id,kind,file,original_name,size,category,caption,sort,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)`,
			id, kind, name, orig, size, clean(r.FormValue("category")), clean(r.FormValue("caption")), sort, now(), u.Name())
		if err != nil {
			os.Remove(filepath.Join(showFileDir(), name))
			fail(w, err)
			return
		}
		sort++
		added++
	}
	if kind == "photo" && s["cover"] == nil {
		db.Exec("UPDATE shows SET cover=(SELECT file FROM show_files WHERE show_id=? AND kind='photo' ORDER BY sort, id LIMIT 1) WHERE id=?", id, id)
	}
	what := "material(s)"
	if kind == "photo" {
		what = "photo(s)"
	}
	logActivity(u.Name(), "show", fmt.Sprintf("Added %d %s to %s", added, what, str(s["title"])))
	jout(w, map[string]any{"added": added})
}

func showFileRow(fid int64) map[string]any {
	m, _ := qone(db, "SELECT * FROM show_files WHERE id=?", fid)
	return m
}

func apiUpdateShowFile(w http.ResponseWriter, r *http.Request) {
	f := showFileRow(pathID(r))
	if f == nil {
		jerr(w, 404, "That file doesn't exist.")
		return
	}
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	updateRow(db, "show_files", []string{"caption", "category"}, f["id"].(int64), b, nil)
	if b["cover"] == true && str(f["kind"]) == "photo" {
		removeCoverFiles(f["show_id"].(int64))
		db.Exec("UPDATE shows SET cover=? WHERE id=?", f["file"], f["show_id"])
	}
	jout(w, map[string]any{"ok": true})
}

func apiDeleteShowFile(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	f := showFileRow(pathID(r))
	if f == nil {
		jerr(w, 404, "That file doesn't exist.")
		return
	}
	if u.Role != "director" && str(f["created_by"]) != u.Name() {
		jerr(w, 403, "Only a director, or the person who uploaded it, can delete this file.")
		return
	}
	db.Exec("DELETE FROM show_files WHERE id=?", f["id"])
	os.Remove(filepath.Join(showFileDir(), str(f["file"])))
	db.Exec(`UPDATE shows SET cover=(SELECT file FROM show_files WHERE show_id=shows.id AND kind='photo' ORDER BY sort, id LIMIT 1)
		WHERE id=? AND (cover IS NULL OR cover=?)`, f["show_id"], f["file"])
	logActivity(u.Name(), "show", fmt.Sprintf("Deleted %s from show #%d", str(f["original_name"]), f["show_id"]))
	jout(w, map[string]any{"ok": true})
}

// apiShowFile serves a stored show file. Photos and PDFs open in the browser; everything else downloads
// under its original name.
func apiShowFile(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !safeName.MatchString(name) {
		http.NotFound(w, r)
		return
	}
	f, _ := qone(db, "SELECT * FROM show_files WHERE file=?", name)
	if f == nil {
		http.NotFound(w, r)
		return
	}
	ext := cleanExt(name)
	ctype := mime.TypeByExtension(ext)
	if ctype == "" {
		ctype = "application/octet-stream"
	}
	disp := "attachment"
	if (photoExts[ext] || ext == ".pdf") && r.URL.Query().Get("download") != "1" {
		disp = "inline"
	}
	orig := str(f["original_name"])
	w.Header().Set("Content-Type", ctype)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`%s; filename="%s"; filename*=UTF-8''%s`, disp, strings.Map(func(r rune) rune {
		if r < 32 || r == '"' || r > 126 {
			return '_'
		}
		return r
	}, orig), url.PathEscape(orig)))
	w.Header().Set("Cache-Control", "private, max-age=86400")
	http.ServeFile(w, r, filepath.Join(showFileDir(), name))
}

// ---------- recycle folder for deleted shows ----------

func trashDir() string { return filepath.Join(dataDir, "recycle") }

// trashShowMedia moves a show's files into recycle/<date>/ instead of erasing them.
func trashShowMedia(showID int64) {
	day := filepath.Join(trashDir(), time.Now().Format("2006-01-02"))
	os.MkdirAll(day, 0o755)
	rows, _ := qmaps(db, "SELECT file FROM show_files WHERE show_id=?", showID)
	for _, f := range rows {
		name := str(f["file"])
		if os.Rename(filepath.Join(showFileDir(), name), filepath.Join(day, name)) != nil {
			copyFile(filepath.Join(showFileDir(), name), filepath.Join(day, name))
			os.Remove(filepath.Join(showFileDir(), name))
		}
	}
}

// recoverFromTrash puts back any show file or item photo the database refers to but that is
// only in the recycle folder (after a backup from before a delete is restored).
func recoverFromTrash() int {
	days, _ := os.ReadDir(trashDir())
	if len(days) == 0 {
		return 0
	}
	n := 0
	for dir, q := range map[string]string{showFileDir(): "SELECT file FROM show_files", photoDir(): "SELECT file FROM item_photos"} {
		rows, _ := qmaps(db, q)
		for _, r := range rows {
			name := str(r["file"])
			if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
				continue
			}
			for _, d := range days {
				src := filepath.Join(trashDir(), d.Name(), name)
				if _, err := os.Stat(src); err == nil {
					os.MkdirAll(dir, 0o755)
					if os.Rename(src, filepath.Join(dir, name)) == nil {
						n++
					}
					break
				}
			}
		}
	}
	return n
}

// pruneTrash empties recycle folders older than 60 days.
func pruneTrash() {
	cut := time.Now().AddDate(0, 0, -60).Format("2006-01-02")
	days, _ := os.ReadDir(trashDir())
	for _, d := range days {
		if d.IsDir() && d.Name() < cut {
			os.RemoveAll(filepath.Join(trashDir(), d.Name()))
		}
	}
}

func deleteShowMedia(showID int64) {
	rows, _ := qmaps(db, "SELECT file FROM show_files WHERE show_id=?", showID)
	for _, f := range rows {
		os.Remove(filepath.Join(showFileDir(), str(f["file"])))
	}
	db.Exec("DELETE FROM show_files WHERE show_id=?", showID)
	db.Exec("DELETE FROM show_people WHERE show_id=?", showID)
	db.Exec("DELETE FROM show_numbers WHERE show_id=?", showID)
}

// ---------- show cover image ----------
// A show's cover is usually its title artwork, logo or poster. Uploaded covers are stored as
// show_files of kind "cover" (kept out of the photo gallery); a gallery photo can also be the cover.

func apiSetShowCover(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := pathID(r)
	s, _ := qone(db, "SELECT * FROM shows WHERE id=?", id)
	if s == nil {
		jerr(w, 404, "That show doesn't exist.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxPhotoBytes+1<<20)
	f, fh, err := r.FormFile("file")
	if err != nil {
		jerr(w, 400, "Choose a JPG, PNG, WEBP or GIF image under 25 MB.")
		return
	}
	defer f.Close()
	ext := cleanExt(fh.Filename)
	if ext == ".heic" || ext == ".heif" {
		jerr(w, 400, "That's an iPhone HEIC photo, which browsers can't show. Export it as JPG first.")
		return
	}
	if !photoExts[ext] {
		jerr(w, 400, "The cover must be a JPG, PNG, WEBP or GIF image. A PDF poster can go under Materials.")
		return
	}
	name, size, err := saveUpload(showFileDir(), fmt.Sprintf("show-%d-cover", id), f, ext)
	if err != nil {
		fail(w, err)
		return
	}
	removeCoverFiles(id)
	orig := filepath.Base(strings.ReplaceAll(fh.Filename, `\`, "/"))
	db.Exec(`INSERT INTO show_files(show_id,kind,file,original_name,size,sort,created_at,created_by) VALUES(?,?,?,?,?,0,?,?)`, id, "cover", name, orig, size, now(), u.Name())
	db.Exec("UPDATE shows SET cover=?, updated_at=?, updated_by=? WHERE id=?", name, now(), u.Name(), id)
	logActivity(u.Name(), "show", "Changed the cover image for "+str(s["title"]))
	jout(w, map[string]any{"cover": name})
}

func apiRemoveShowCover(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	var title string
	if db.QueryRow("SELECT title FROM shows WHERE id=?", id).Scan(&title) != nil {
		jerr(w, 404, "That show doesn't exist.")
		return
	}
	removeCoverFiles(id)
	db.Exec("UPDATE shows SET cover=NULL WHERE id=?", id)
	logActivity(currentUser(r).Name(), "show", "Removed the cover image from "+title)
	jout(w, map[string]any{"ok": true})
}

// removeCoverFiles deletes an uploaded cover (gallery photos used as the cover are left alone).
func removeCoverFiles(showID int64) {
	rows, _ := qmaps(db, "SELECT id, file FROM show_files WHERE show_id=? AND kind='cover'", showID)
	for _, c := range rows {
		os.Remove(filepath.Join(showFileDir(), str(c["file"])))
		db.Exec("DELETE FROM show_files WHERE id=?", c["id"])
	}
}
