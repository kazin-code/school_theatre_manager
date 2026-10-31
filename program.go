package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Printed show programs (playbills) and the sponsors library used in them.
//
// A program is one JSON document per show: page size, style, and pages made of blocks. Blocks
// such as the cast list read the show's data when drawn, so they stay current. Sponsors are kept
// in their own table so they can be reused from show to show.

const programSchema = `
CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY,
  show_id INTEGER NOT NULL UNIQUE REFERENCES shows(id),
  doc TEXT NOT NULL,
  created_at TEXT, created_by TEXT,
  updated_at TEXT, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS sponsors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  tier TEXT,
  ad_size TEXT,
  message TEXT,
  website TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  amount REAL,
  logo TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT, created_by TEXT,
  updated_at TEXT, updated_by TEXT
);
`

var sponsorFields = []string{"name", "tier", "ad_size", "message", "website", "contact_name", "email", "phone", "amount", "active", "notes"}

func sponsorDir() string { return filepath.Join(dataDir, "sponsors") }

func migratePrograms() {
	db.Exec(programSchema)
	for _, list := range []string{"sponsor_tier", "ad_size"} {
		var n int
		db.QueryRow("SELECT COUNT(*) FROM lookups WHERE list=?", list).Scan(&n)
		if n == 0 {
			for i, v := range defaultLookups[list] {
				db.Exec("INSERT OR IGNORE INTO lookups(list,value,sort) VALUES(?,?,?)", list, v, i)
			}
		}
	}
}

// ---------- programs ----------

func apiGetProgram(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	s, _ := qone(db, "SELECT * FROM shows WHERE id=?", id)
	if s == nil {
		jerr(w, 404, "That show doesn't exist.")
		return
	}
	var doc any
	var meta map[string]any
	if p, _ := qone(db, "SELECT doc, updated_at, updated_by FROM programs WHERE show_id=?", id); p != nil {
		json.Unmarshal([]byte(str(p["doc"])), &doc)
		meta = map[string]any{"updated_at": p["updated_at"], "updated_by": p["updated_by"]}
	}
	others, _ := qmaps(db, `SELECT s.id, s.title, s.season, s.year FROM programs p JOIN shows s ON s.id=p.show_id WHERE s.id!=? ORDER BY p.updated_at DESC LIMIT 30`, id)
	jout(w, map[string]any{"doc": doc, "meta": meta, "show": s, "people": showPeople(id), "numbers": showNumbers(id),
		"images": showFiles(id, "program"), "photos": showFiles(id, "photo"), "sponsors": activeSponsors(), "others": others})
}

func apiSaveProgram(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := pathID(r)
	var title string
	if db.QueryRow("SELECT title FROM shows WHERE id=?", id).Scan(&title) != nil {
		jerr(w, 404, "That show doesn't exist.")
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, 4<<20))
	if err != nil {
		jerr(w, 400, "Could not read the program.")
		return
	}
	var in struct {
		Doc json.RawMessage `json:"doc"`
	}
	if json.Unmarshal(raw, &in) != nil || len(in.Doc) == 0 || in.Doc[0] != '{' {
		jerr(w, 400, "Could not read the program.")
		return
	}
	var existed int
	db.QueryRow("SELECT COUNT(*) FROM programs WHERE show_id=?", id).Scan(&existed)
	_, err = db.Exec(`INSERT INTO programs(show_id,doc,created_at,created_by,updated_at,updated_by) VALUES(?,?,?,?,?,?)
		ON CONFLICT(show_id) DO UPDATE SET doc=excluded.doc, updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
		id, string(in.Doc), now(), u.Name(), now(), u.Name())
	if err != nil {
		fail(w, err)
		return
	}
	if existed == 0 {
		logActivity(u.Name(), "program", "Started the program for "+title)
	}
	jout(w, map[string]any{"ok": true, "updated_at": now()})
}

func apiResetProgram(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	var title string
	db.QueryRow("SELECT title FROM shows WHERE id=?", id).Scan(&title)
	db.Exec("DELETE FROM programs WHERE show_id=?", id)
	logActivity(currentUser(r).Name(), "program", "Started over on the program for "+title)
	jout(w, map[string]any{"ok": true})
}

// apiCopyProgram copies another show's program layout and text into this show. Lists such as
// the cast fill in from this show automatically; uploaded images are copied too.
func apiCopyProgram(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := pathID(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	from := int64(num(b["from"]))
	p, _ := qone(db, "SELECT doc FROM programs WHERE show_id=?", from)
	if p == nil {
		jerr(w, 404, "That show has no program to copy.")
		return
	}
	doc := str(p["doc"])
	imgs, _ := qmaps(db, "SELECT * FROM show_files WHERE show_id=? AND kind='program'", from)
	for _, im := range imgs {
		old := str(im["file"])
		if !strings.Contains(doc, old) {
			continue
		}
		src, err := os.Open(filepath.Join(showFileDir(), old))
		if err != nil {
			continue
		}
		name, size, err := saveUpload(showFileDir(), fmt.Sprintf("show-%d-prog", id), src, cleanExt(old))
		src.Close()
		if err != nil {
			continue
		}
		db.Exec(`INSERT INTO show_files(show_id,kind,file,original_name,size,sort,created_at,created_by) VALUES(?,?,?,?,?,0,?,?)`, id, "program", name, im["original_name"], size, now(), u.Name())
		doc = strings.ReplaceAll(doc, old, name)
	}
	_, err = db.Exec(`INSERT INTO programs(show_id,doc,created_at,created_by,updated_at,updated_by) VALUES(?,?,?,?,?,?)
		ON CONFLICT(show_id) DO UPDATE SET doc=excluded.doc, updated_at=excluded.updated_at, updated_by=excluded.updated_by`, id, doc, now(), u.Name(), now(), u.Name())
	if err != nil {
		fail(w, err)
		return
	}
	var t1, t2 string
	db.QueryRow("SELECT title FROM shows WHERE id=?", from).Scan(&t1)
	db.QueryRow("SELECT title FROM shows WHERE id=?", id).Scan(&t2)
	logActivity(u.Name(), "program", "Started the "+t2+" program from "+t1+"'s")
	jout(w, map[string]any{"ok": true})
}

// ---------- sponsors ----------

func activeSponsors() []map[string]any {
	rows, _ := qmaps(db, `SELECT s.* FROM sponsors s LEFT JOIN lookups l ON l.list='sponsor_tier' AND l.value=s.tier
		WHERE s.active=1 ORDER BY COALESCE(l.sort, 999), s.sort, s.name COLLATE NOCASE`)
	return rows
}

func apiSponsors(w http.ResponseWriter, r *http.Request) {
	rows, err := qmaps(db, `SELECT s.* FROM sponsors s LEFT JOIN lookups l ON l.list='sponsor_tier' AND l.value=s.tier
		ORDER BY s.active DESC, COALESCE(l.sort, 999), s.sort, s.name COLLATE NOCASE`)
	if err != nil {
		fail(w, err)
		return
	}
	jout(w, rows)
}

func apiCreateSponsor(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	if str(b["name"]) == "" {
		jerr(w, 400, "Enter the sponsor's name.")
		return
	}
	if _, ok := b["active"]; !ok {
		b["active"] = true
	}
	id, err := insertRow(db, "sponsors", sponsorFields, b, map[string]any{"created_at": now(), "created_by": u.Name(), "updated_at": now(), "updated_by": u.Name()})
	if err != nil {
		fail(w, err)
		return
	}
	logActivity(u.Name(), "sponsor", "Added sponsor "+str(b["name"]))
	jout(w, map[string]any{"id": id})
}

func apiUpdateSponsor(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	id := pathID(r)
	b, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	if _, ok := b["name"]; ok && str(b["name"]) == "" {
		jerr(w, 400, "Enter the sponsor's name.")
		return
	}
	if err := updateRow(db, "sponsors", sponsorFields, id, b, map[string]any{"updated_at": now(), "updated_by": u.Name()}); err != nil {
		fail(w, err)
		return
	}
	jout(w, map[string]any{"ok": true})
}

func apiDeleteSponsor(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	s, _ := qone(db, "SELECT * FROM sponsors WHERE id=?", id)
	if s == nil {
		jerr(w, 404, "That sponsor doesn't exist.")
		return
	}
	if l := str(s["logo"]); l != "" {
		os.Remove(filepath.Join(sponsorDir(), l))
	}
	db.Exec("DELETE FROM sponsors WHERE id=?", id)
	logActivity(currentUser(r).Name(), "sponsor", "Deleted sponsor "+str(s["name"]))
	jout(w, map[string]any{"ok": true})
}

func apiSponsorLogo(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	s, _ := qone(db, "SELECT * FROM sponsors WHERE id=?", id)
	if s == nil {
		jerr(w, 404, "That sponsor doesn't exist.")
		return
	}
	if r.Method == http.MethodDelete {
		if l := str(s["logo"]); l != "" {
			os.Remove(filepath.Join(sponsorDir(), l))
		}
		db.Exec("UPDATE sponsors SET logo=NULL WHERE id=?", id)
		jout(w, map[string]any{"ok": true})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxPhotoBytes+1<<20)
	f, fh, err := r.FormFile("logo")
	if err != nil {
		jerr(w, 400, "Choose a JPG, PNG, WEBP or GIF image under 25 MB.")
		return
	}
	defer f.Close()
	ext := cleanExt(fh.Filename)
	if !photoExts[ext] {
		jerr(w, 400, "Logos and ads must be JPG, PNG, WEBP or GIF images. Ask the sponsor for a PNG or JPG, or export the PDF page as an image.")
		return
	}
	name, _, err := saveUpload(sponsorDir(), fmt.Sprintf("sponsor-%d", id), f, ext)
	if err != nil {
		fail(w, err)
		return
	}
	if l := str(s["logo"]); l != "" {
		os.Remove(filepath.Join(sponsorDir(), l))
	}
	db.Exec("UPDATE sponsors SET logo=?, updated_at=? WHERE id=?", name, now(), id)
	jout(w, map[string]any{"logo": name})
}

func apiSponsorFile(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !safeName.MatchString(name) {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeFile(w, r, filepath.Join(sponsorDir(), name))
}
