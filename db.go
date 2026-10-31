package main

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"
)

var db *sql.DB

const schemaVersion = "2"

const schema = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'assistant',
  pw_hash TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT,
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS lookups (
  list TEXT NOT NULL,
  value TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (list, value)
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  tag TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  subcategory TEXT,
  description TEXT,
  era TEXT,
  gender TEXT,
  size TEXT,
  chest REAL, waist REAL, hips REAL, inseam REAL, neck REAL, sleeve REAL, head REAL,
  shoe_size TEXT,
  color TEXT,
  material TEXT,
  pattern TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  condition INTEGER NOT NULL DEFAULT 4,
  condition_notes TEXT,
  location TEXT,
  acquired_date TEXT,
  acquired_from TEXT,
  cost REAL,
  replacement_value REAL,
  rentable INTEGER NOT NULL DEFAULT 1,
  rental_rate REAL,
  status TEXT NOT NULL DEFAULT 'active',
  keywords TEXT,
  notes TEXT,
  photo TEXT,
  created_at TEXT, created_by TEXT,
  updated_at TEXT, updated_by TEXT
);

CREATE TABLE IF NOT EXISTS renters (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  organization TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  approved INTEGER NOT NULL DEFAULT 1,
  approved_date TEXT,
  notes TEXT,
  created_at TEXT, created_by TEXT,
  updated_at TEXT, updated_by TEXT
);

CREATE TABLE IF NOT EXISTS rentals (
  id INTEGER PRIMARY KEY,
  renter_id INTEGER NOT NULL REFERENCES renters(id),
  purpose TEXT,
  date_out TEXT NOT NULL,
  date_due TEXT,
  date_returned TEXT,
  fee REAL,
  deposit REAL,
  deposit_returned INTEGER,
  status TEXT NOT NULL DEFAULT 'out',
  rating INTEGER,
  rating_notes TEXT,
  notes TEXT,
  created_at TEXT, created_by TEXT,
  returned_by TEXT
);

CREATE TABLE IF NOT EXISTS rental_items (
  id INTEGER PRIMARY KEY,
  rental_id INTEGER NOT NULL REFERENCES rentals(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  qty INTEGER NOT NULL DEFAULT 1,
  condition_out INTEGER,
  notes_out TEXT,
  condition_in INTEGER,
  notes_in TEXT,
  damage_charge REAL
);

CREATE TABLE IF NOT EXISTS shows (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT,
  season TEXT,
  year INTEGER,
  director TEXT,
  venue TEXT,
  open_date TEXT,
  close_date TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  notes TEXT,
  created_at TEXT, created_by TEXT,
  updated_at TEXT, updated_by TEXT
);

CREATE TABLE IF NOT EXISTS show_items (
  id INTEGER PRIMARY KEY,
  show_id INTEGER NOT NULL REFERENCES shows(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  qty INTEGER NOT NULL DEFAULT 1,
  character TEXT,
  actor TEXT,
  scene TEXT,
  usage_notes TEXT,
  alterations TEXT,
  date_out TEXT,
  condition_out INTEGER,
  date_returned TEXT,
  condition_in INTEGER,
  notes_in TEXT,
  created_by TEXT,
  returned_by TEXT
);

CREATE TABLE IF NOT EXISTS condition_log (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id),
  at TEXT NOT NULL,
  condition INTEGER,
  notes TEXT,
  source TEXT,
  user TEXT
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  user TEXT,
  action TEXT,
  details TEXT
);

CREATE TABLE IF NOT EXISTS item_photos (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id),
  file TEXT NOT NULL,
  caption TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT, created_by TEXT
);

CREATE TABLE IF NOT EXISTS show_people (
  id INTEGER PRIMARY KEY,
  show_id INTEGER NOT NULL REFERENCES shows(id),
  kind TEXT NOT NULL DEFAULT 'cast',
  name TEXT NOT NULL,
  role TEXT,
  grade TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT, created_by TEXT
);

CREATE TABLE IF NOT EXISTS show_files (
  id INTEGER PRIMARY KEY,
  show_id INTEGER NOT NULL REFERENCES shows(id),
  kind TEXT NOT NULL DEFAULT 'material',
  file TEXT NOT NULL,
  original_name TEXT,
  size INTEGER,
  category TEXT,
  caption TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT, created_by TEXT
);

CREATE TABLE IF NOT EXISTS show_numbers (
  id INTEGER PRIMARY KEY,
  show_id INTEGER NOT NULL REFERENCES shows(id),
  act TEXT,
  number TEXT,
  title TEXT NOT NULL,
  singers TEXT,
  scene TEXT,
  notes TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT, created_by TEXT
);

CREATE INDEX IF NOT EXISTS ix_sn_show ON show_numbers(show_id);
CREATE INDEX IF NOT EXISTS ix_ip_item ON item_photos(item_id);
CREATE INDEX IF NOT EXISTS ix_sp_show ON show_people(show_id);
CREATE INDEX IF NOT EXISTS ix_sf_show ON show_files(show_id);
CREATE INDEX IF NOT EXISTS ix_ri_item ON rental_items(item_id);
CREATE INDEX IF NOT EXISTS ix_ri_rental ON rental_items(rental_id);
CREATE INDEX IF NOT EXISTS ix_si_item ON show_items(item_id);
CREATE INDEX IF NOT EXISTS ix_si_show ON show_items(show_id);
CREATE INDEX IF NOT EXISTS ix_cl_item ON condition_log(item_id);
CREATE INDEX IF NOT EXISTS ix_rentals_renter ON rentals(renter_id);
`

var defaultLookups = map[string][]string{
	"category":      {"Costumes", "Shoes", "Hats & Headwear", "Wigs & Hair", "Accessories & Jewelry", "Props", "Hand Props", "Furniture", "Set Pieces", "Flats & Platforms", "Drapes & Soft Goods", "Fabric & Materials", "Lighting", "Sound", "Makeup & FX", "Tools & Hardware", "Other"},
	"subcategory":   {"Dress / Gown", "Suit / Jacket", "Coat / Cape", "Shirt / Blouse", "Vest / Waistcoat", "Skirt", "Trousers / Breeches", "Uniform", "Robe", "Underpinnings / Corset / Petticoat", "Animal / Character Suit", "Chair", "Table", "Sofa / Settee", "Bed", "Desk", "Cabinet / Shelf", "Lamp", "Weapon (prop)", "Tableware", "Luggage", "Sign"},
	"era":           {"Ancient / Classical", "Medieval", "Renaissance / Elizabethan", "17th Century", "18th Century / Colonial", "Regency (1800–1830)", "Victorian (1837–1901)", "Old West", "Edwardian (1901–1914)", "1920s", "1930s", "1940s", "1950s", "1960s", "1970s", "1980s", "1990s", "Contemporary", "Fantasy / Storybook", "Sci-Fi / Futuristic", "Military", "Period-neutral"},
	"gender":        {"Men's", "Women's", "Unisex", "Boys'", "Girls'"},
	"size":          {"XS", "S", "M", "L", "XL", "2XL", "3XL", "Child S", "Child M", "Child L", "One size", "Adjustable"},
	"material":      {"Cotton", "Wool", "Silk", "Satin", "Velvet", "Polyester", "Linen", "Lace", "Denim", "Leather", "Faux fur", "Brocade", "Chiffon", "Tulle", "Spandex", "Wood", "Metal", "Plastic", "Foam", "Upholstered", "Glass", "Wicker", "Cardboard / Paper"},
	"color":         {"Black", "White", "Ivory", "Red", "Burgundy", "Pink", "Orange", "Yellow", "Gold", "Green", "Blue", "Navy", "Purple", "Brown", "Tan", "Grey", "Silver", "Multicolor"},
	"location":      {"Costume Room", "Costume Room – Rack A", "Costume Room – Rack B", "Costume Room – Bins", "Prop Cage", "Scene Shop", "Under Stage", "Loft", "Off-site Storage"},
	"show_type":     {"Play", "Musical", "One-Acts", "Revue / Showcase", "Children's Theatre", "Other"},
	"season":        {"Fall", "Winter", "Spring", "Summer"},
	"team_position": {"Director", "Assistant Director", "Technical Director", "Music Director", "Vocal Director", "Choreographer", "Assistant Choreographer", "Stage Manager", "Assistant Stage Manager", "Producer", "Accompanist", "Pit Conductor", "Costume Designer", "Set Designer", "Lighting Designer", "Sound Designer", "Hair & Makeup Designer", "Props Master", "Fight / Intimacy Director", "Dramaturg", "Dance Captain"},
	"crew_position": {"Light Board Operator", "Sound Board Operator", "Spotlight Operator", "Fly Rail", "Running Crew", "Deck Crew", "Set Construction", "Scenic Painter", "Props Crew", "Costume Crew", "Wardrobe / Dresser", "Hair & Makeup Crew", "Mic Wrangler", "Pit Orchestra", "House Manager", "Usher", "Box Office", "Concessions", "Publicity", "Photographer", "Videographer"},
	"voice_part":    {"Soprano", "Mezzo-Soprano", "Alto", "Tenor", "Baritone", "Bass", "Treble", "Non-singing"},
	"instrument":    {"Conductor", "Piano", "Keyboard 1", "Keyboard 2", "Synthesizer", "Guitar", "Bass", "Drums", "Percussion", "Violin", "Viola", "Cello", "Flute", "Clarinet", "Reed 1", "Reed 2", "Saxophone", "Trumpet", "Trombone", "French Horn"},
	"material_type": {"Script", "Libretto", "Vocal score", "Piano / conductor score", "Orchestra parts", "Rehearsal tracks", "Choreography notes", "Program", "Poster / Artwork", "Rehearsal schedule", "Blocking notes", "Design drawings", "Costume plot", "Prop list", "Light plot", "Sound cues", "Rights & licensing", "Budget", "Forms & permissions", "Other"},
}

func now() string   { return time.Now().Format("2006-01-02 15:04:05") }
func today() string { return time.Now().Format("2006-01-02") }

func openDB(path string) error {
	var err error
	db, err = sql.Open("sqlite3", path)
	if err != nil {
		return err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)
	for _, p := range []string{"PRAGMA busy_timeout=5000", "PRAGMA journal_mode=WAL", "PRAGMA foreign_keys=ON", "PRAGMA synchronous=NORMAL"} {
		if _, err := db.Exec(p); err != nil {
			return fmt.Errorf("%s: %w", p, err)
		}
	}
	return nil
}

// initSchema creates all tables and seeds default lists. Safe to run repeatedly.
func initSchema() error {
	if _, err := db.Exec(schema); err != nil {
		return err
	}
	var n int
	db.QueryRow("SELECT COUNT(*) FROM lookups").Scan(&n)
	if n == 0 {
		for list, vals := range defaultLookups {
			for i, v := range vals {
				db.Exec("INSERT OR IGNORE INTO lookups(list,value,sort) VALUES(?,?,?)", list, v, i)
			}
		}
	}
	migrate()
	db.Exec("INSERT OR IGNORE INTO meta(key,value) VALUES('created_at',?)", now())
	db.Exec("INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version',?)", schemaVersion)
	return nil
}

// ---- generic helpers ----

func scanMaps(rows *sql.Rows) ([]map[string]any, error) {
	defer rows.Close()
	cols, _ := rows.Columns()
	out := []map[string]any{}
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		m := make(map[string]any, len(cols))
		for i, c := range cols {
			v := vals[i]
			if b, ok := v.([]byte); ok {
				v = string(b)
			}
			if t, ok := v.(time.Time); ok {
				v = t.Format("2006-01-02 15:04:05")
			}
			m[c] = v
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

type querier interface {
	Query(string, ...any) (*sql.Rows, error)
	Exec(string, ...any) (sql.Result, error)
}

func qmaps(q querier, query string, args ...any) ([]map[string]any, error) {
	rows, err := q.Query(query, args...)
	if err != nil {
		return nil, err
	}
	return scanMaps(rows)
}

func qone(q querier, query string, args ...any) (map[string]any, error) {
	r, err := qmaps(q, query, args...)
	if err != nil || len(r) == 0 {
		return nil, err
	}
	return r[0], nil
}

// clean normalizes a JSON value for storage: trims strings, blanks become NULL, bools become 0/1.
func clean(v any) any {
	switch t := v.(type) {
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return nil
		}
		return s
	case bool:
		if t {
			return 1
		}
		return 0
	}
	return v
}

func insertRow(q querier, table string, allowed []string, body map[string]any, extra map[string]any) (int64, error) {
	cols, marks, args := []string{}, []string{}, []any{}
	for _, f := range allowed {
		if v, ok := body[f]; ok {
			cols = append(cols, `"`+f+`"`)
			marks = append(marks, "?")
			args = append(args, clean(v))
		}
	}
	for k, v := range extra {
		cols = append(cols, `"`+k+`"`)
		marks = append(marks, "?")
		args = append(args, v)
	}
	res, err := q.Exec(fmt.Sprintf("INSERT INTO %s(%s) VALUES(%s)", table, strings.Join(cols, ","), strings.Join(marks, ",")), args...)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func updateRow(q querier, table string, allowed []string, id int64, body map[string]any, extra map[string]any) error {
	sets, args := []string{}, []any{}
	for _, f := range allowed {
		if v, ok := body[f]; ok {
			sets = append(sets, `"`+f+`"=?`)
			args = append(args, clean(v))
		}
	}
	for k, v := range extra {
		sets = append(sets, `"`+k+`"=?`)
		args = append(args, v)
	}
	if len(sets) == 0 {
		return nil
	}
	args = append(args, id)
	_, err := q.Exec(fmt.Sprintf("UPDATE %s SET %s WHERE id=?", table, strings.Join(sets, ",")), args...)
	return err
}

func logActivity(user, action, details string) {
	db.Exec("INSERT INTO activity(at,user,action,details) VALUES(?,?,?,?)", now(), user, action, details)
}
