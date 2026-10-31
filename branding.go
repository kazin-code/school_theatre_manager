package main

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	"image/color"
	_ "image/gif"
	_ "image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Each school brands its own installation: school name, program name, initials, a tagline,
// an accent color and a logo. Stored in <data>/branding/ so the installer can read and write it too.

type Branding struct {
	School  string `json:"school"`
	Program string `json:"program"`
	Short   string `json:"short"`
	Tagline string `json:"tagline"`
	Accent  string `json:"accent"`
}

var (
	brandMu  sync.RWMutex
	brand    Branding
	hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
)

func brandDir() string  { return filepath.Join(dataDir, "branding") }
func brandFile() string { return filepath.Join(brandDir(), "branding.ini") }
func logoPNG() string   { return filepath.Join(brandDir(), "logo.png") }
func logoICO() string   { return filepath.Join(brandDir(), "logo.ico") }

func currentBrand() Branding {
	brandMu.RLock()
	defer brandMu.RUnlock()
	return brand
}

// programName is what the app calls itself on screen: the theatre program's name, or the product name.
func programName() string {
	b := currentBrand()
	if b.Program != "" {
		return b.Program
	}
	if b.School != "" {
		return b.School + " Theatre"
	}
	return productName
}

func loadBranding() {
	b := Branding{}
	if f, err := os.Open(brandFile()); err == nil {
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			line := strings.TrimSpace(sc.Text())
			if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "[") {
				continue
			}
			k, v, ok := strings.Cut(line, "=")
			if !ok {
				continue
			}
			v = strings.TrimSpace(v)
			switch strings.ToLower(strings.TrimSpace(k)) {
			case "school":
				b.School = v
			case "program":
				b.Program = v
			case "short":
				b.Short = v
			case "tagline":
				b.Tagline = v
			case "accent":
				if hexColor.MatchString(v) {
					b.Accent = strings.ToLower(v)
				}
			}
		}
		f.Close()
	}
	brandMu.Lock()
	brand = b
	brandMu.Unlock()
}

func cleanBrandText(s string, max int) string {
	s = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, strings.TrimSpace(s))
	if r := []rune(s); len(r) > max {
		s = string(r[:max])
	}
	return s
}

func saveBranding(b Branding) error {
	b.School = cleanBrandText(b.School, 100)
	b.Program = cleanBrandText(b.Program, 60)
	b.Short = cleanBrandText(b.Short, 12)
	b.Tagline = cleanBrandText(b.Tagline, 120)
	if b.Accent != "" && !hexColor.MatchString(b.Accent) {
		return errors.New("Choose a color like #c21d2b.")
	}
	b.Accent = strings.ToLower(b.Accent)
	if err := os.MkdirAll(brandDir(), 0o755); err != nil {
		return err
	}
	// INI so the Windows installer can read it back with ReadINIStr when upgrading
	content := fmt.Sprintf("[branding]\r\nschool=%s\r\nprogram=%s\r\nshort=%s\r\ntagline=%s\r\naccent=%s\r\n", b.School, b.Program, b.Short, b.Tagline, b.Accent)
	if err := os.WriteFile(brandFile(), []byte(content), 0o644); err != nil {
		return err
	}
	brandMu.Lock()
	brand = b
	brandMu.Unlock()
	return nil
}

// ---------- logo processing ----------

func decodeLogo(data []byte) (image.Image, error) {
	if len(data) > 4 && data[0] == 0 && data[1] == 0 && data[2] == 1 && data[3] == 0 {
		return decodeICO(data)
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, errors.New("That file isn't a PNG, JPG, GIF or ICO image.")
	}
	return img, nil
}

// decodeICO returns the largest image in a Windows .ico file (PNG or 24/32-bit bitmap entries).
func decodeICO(b []byte) (image.Image, error) {
	bad := errors.New("That .ico file can't be read. Try a PNG or JPG of the logo instead.")
	if len(b) < 6 {
		return nil, bad
	}
	n := int(binary.LittleEndian.Uint16(b[4:]))
	best, bestScore := -1, -1
	for i := 0; i < n; i++ {
		e := 6 + i*16
		if e+16 > len(b) {
			return nil, bad
		}
		w := int(b[e])
		if w == 0 {
			w = 256
		}
		bpp := int(binary.LittleEndian.Uint16(b[e+6:]))
		if score := w*100 + bpp; score > bestScore {
			best, bestScore = i, score
		}
	}
	if best < 0 {
		return nil, bad
	}
	e := 6 + best*16
	size := int(binary.LittleEndian.Uint32(b[e+8:]))
	off := int(binary.LittleEndian.Uint32(b[e+12:]))
	if off < 0 || size <= 0 || off+size > len(b) {
		return nil, bad
	}
	d := b[off : off+size]
	if bytes.HasPrefix(d, []byte("\x89PNG")) {
		return png.Decode(bytes.NewReader(d))
	}
	if len(d) < 40 {
		return nil, bad
	}
	hdr := int(binary.LittleEndian.Uint32(d[0:]))
	w := int(int32(binary.LittleEndian.Uint32(d[4:])))
	h := int(int32(binary.LittleEndian.Uint32(d[8:]))) / 2
	bpp := int(binary.LittleEndian.Uint16(d[14:]))
	if comp := binary.LittleEndian.Uint32(d[16:]); comp != 0 || (bpp != 32 && bpp != 24) || w <= 0 || h <= 0 || w > 1024 || h > 1024 {
		return nil, bad
	}
	stride := ((w*bpp + 31) / 32) * 4
	maskStride := ((w + 31) / 32) * 4
	px := d[hdr:]
	if len(px) < stride*h {
		return nil, bad
	}
	mask := px[stride*h:]
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	anyAlpha := false
	for y := 0; y < h; y++ {
		row := px[(h-1-y)*stride:]
		for x := 0; x < w; x++ {
			var r, g, bl, a uint8
			if bpp == 32 {
				bl, g, r, a = row[x*4], row[x*4+1], row[x*4+2], row[x*4+3]
				if a != 0 {
					anyAlpha = true
				}
			} else {
				bl, g, r, a = row[x*3], row[x*3+1], row[x*3+2], 255
			}
			img.SetNRGBA(x, y, color.NRGBA{r, g, bl, a})
		}
	}
	// older icons keep transparency in a separate 1-bit mask
	if (bpp == 24 || !anyAlpha) && len(mask) >= maskStride*h {
		for y := 0; y < h; y++ {
			row := mask[(h-1-y)*maskStride:]
			for x := 0; x < w; x++ {
				c := img.NRGBAAt(x, y)
				if row[x/8]&(0x80>>(x%8)) != 0 {
					c.A = 0
				} else {
					c.A = 255
				}
				img.SetNRGBA(x, y, c)
			}
		}
	}
	return img, nil
}

// scale resizes with area averaging (good for shrinking logos) into a w×h canvas, keeping aspect
// ratio and centering the picture on transparency when square is true.
func scale(src image.Image, maxSide int, square bool) *image.NRGBA {
	sb := src.Bounds()
	sw, sh := sb.Dx(), sb.Dy()
	f := float64(maxSide) / float64(max(sw, sh))
	if f > 1 && !square {
		f = 1
	}
	tw, th := max(1, int(float64(sw)*f+0.5)), max(1, int(float64(sh)*f+0.5))
	cw, ch, ox, oy := tw, th, 0, 0
	if square {
		cw, ch = maxSide, maxSide
		ox, oy = (maxSide-tw)/2, (maxSide-th)/2
	}
	dst := image.NewNRGBA(image.Rect(0, 0, cw, ch))
	for y := 0; y < th; y++ {
		y0, y1 := float64(y)/f, float64(y+1)/f
		for x := 0; x < tw; x++ {
			x0, x1 := float64(x)/f, float64(x+1)/f
			var r, g, b, a, wsum float64
			for sy := int(y0); sy < int(y1+0.999) && sy < sh; sy++ {
				wy := minf(y1, float64(sy+1)) - maxf(y0, float64(sy))
				if wy <= 0 {
					continue
				}
				for sx := int(x0); sx < int(x1+0.999) && sx < sw; sx++ {
					wx := minf(x1, float64(sx+1)) - maxf(x0, float64(sx))
					if wx <= 0 {
						continue
					}
					c := color.NRGBAModel.Convert(src.At(sb.Min.X+sx, sb.Min.Y+sy)).(color.NRGBA)
					wgt := wx * wy
					al := float64(c.A) * wgt
					r += float64(c.R) * al
					g += float64(c.G) * al
					b += float64(c.B) * al
					a += al
					wsum += wgt
				}
			}
			if wsum == 0 || a == 0 {
				continue
			}
			dst.SetNRGBA(ox+x, oy+y, color.NRGBA{uint8(r/a + .5), uint8(g/a + .5), uint8(b/a + .5), uint8(a/wsum + .5)})
		}
	}
	return dst
}

func minf(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
func maxf(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

// encodeICO writes a multi-size Windows icon made of PNG entries (supported since Windows Vista).
func encodeICO(src image.Image) ([]byte, error) {
	sizes := []int{16, 24, 32, 48, 64, 128, 256}
	var pngs [][]byte
	for _, s := range sizes {
		var buf bytes.Buffer
		if err := png.Encode(&buf, scale(src, s, true)); err != nil {
			return nil, err
		}
		pngs = append(pngs, buf.Bytes())
	}
	var out bytes.Buffer
	binary.Write(&out, binary.LittleEndian, [3]uint16{0, 1, uint16(len(sizes))})
	off := 6 + 16*len(sizes)
	for i, s := range sizes {
		dim := uint8(s)
		if s == 256 {
			dim = 0
		}
		out.Write([]byte{dim, dim, 0, 0})
		binary.Write(&out, binary.LittleEndian, uint16(1))
		binary.Write(&out, binary.LittleEndian, uint16(32))
		binary.Write(&out, binary.LittleEndian, uint32(len(pngs[i])))
		binary.Write(&out, binary.LittleEndian, uint32(off))
		off += len(pngs[i])
	}
	for _, p := range pngs {
		out.Write(p)
	}
	return out.Bytes(), nil
}

// setLogo stores a school logo as logo.png (for the app) and logo.ico (for Windows shortcuts).
func setLogo(data []byte) error {
	img, err := decodeLogo(data)
	if err != nil {
		return err
	}
	if b := img.Bounds(); b.Dx() < 16 || b.Dy() < 16 {
		return errors.New("That logo is too small. Use an image at least 64 pixels wide.")
	}
	if err := os.MkdirAll(brandDir(), 0o755); err != nil {
		return err
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, scale(img, 512, false)); err != nil {
		return err
	}
	ico, err := encodeICO(img)
	if err != nil {
		return err
	}
	if err := os.WriteFile(logoPNG(), buf.Bytes(), 0o644); err != nil {
		return err
	}
	return os.WriteFile(logoICO(), ico, 0o644)
}

func setLogoFromFile(path string) error {
	st, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("The logo file %s can't be found.", path)
	}
	if st.Size() > 15<<20 {
		return errors.New("The logo file is larger than 15 MB.")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return setLogo(data)
}

// ---------- API ----------

func brandingJSON() map[string]any {
	b := currentBrand()
	ver := ""
	if st, err := os.Stat(logoPNG()); err == nil {
		ver = fmt.Sprint(st.ModTime().Unix())
	}
	return map[string]any{"product": productName, "school": b.School, "program": b.Program, "short": b.Short, "tagline": b.Tagline,
		"accent": b.Accent, "name": programName(), "has_logo": ver != "", "logo_version": ver}
}

func apiBranding(w http.ResponseWriter, r *http.Request) { jout(w, brandingJSON()) }

func apiSaveBranding(w http.ResponseWriter, r *http.Request) {
	in, err := body(r)
	if err != nil {
		jerr(w, 400, err.Error())
		return
	}
	b := currentBrand()
	for k, p := range map[string]*string{"school": &b.School, "program": &b.Program, "short": &b.Short, "tagline": &b.Tagline, "accent": &b.Accent} {
		if v, ok := in[k]; ok {
			*p = str(v)
		}
	}
	if err := saveBranding(b); err != nil {
		jerr(w, 400, err.Error())
		return
	}
	logActivity(currentUser(r).Name(), "settings", "Updated school branding")
	jout(w, brandingJSON())
}

func apiBrandLogo(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodDelete {
		os.Remove(logoPNG())
		os.Remove(logoICO())
		logActivity(currentUser(r).Name(), "settings", "Removed the school logo")
		jout(w, brandingJSON())
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<20)
	f, _, err := r.FormFile("logo")
	if err != nil {
		jerr(w, 400, "Choose a logo image under 15 MB.")
		return
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	if err != nil {
		fail(w, err)
		return
	}
	if err := setLogo(data); err != nil {
		jerr(w, 400, err.Error())
		return
	}
	logActivity(currentUser(r).Name(), "settings", "Changed the school logo")
	jout(w, brandingJSON())
}

// apiLogoFile serves the school's logo, or the built-in stage icon when none is set.
func apiLogoFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-cache")
	if st, err := os.Stat(logoPNG()); err == nil {
		f, err := os.Open(logoPNG())
		if err == nil {
			defer f.Close()
			http.ServeContent(w, r, "logo.png", st.ModTime(), f)
			return
		}
	}
	data, _ := webFS.ReadFile("web/logo.png")
	http.ServeContent(w, r, "logo.png", time.Time{}, bytes.NewReader(data))
}
