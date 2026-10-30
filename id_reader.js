/* CampusConnect – school ID reader.
   Runs entirely in the browser: the photo is read with Tesseract.js (OCR) and is never uploaded or stored.
   It accepts a photo only if it carries the San Pedro National High School name plus other markers of the
   school's ID layout (LRN, S.Y., "San Pedro, Hagonoy, Bulacan", "Class Adviser"), then reads LRN, grade,
   strand and name from the text.  NOTE: this is a front-end check. It cannot tell a real card from a
   well-made copy; a production app must also check the LRN against the school's list on a server. */
(function (root) {
  "use strict";

  const SCHOOL_YEAR = "2026-2027";            // change each school year
  const SCHOOL_NAME = "SANPEDRONATIONALHIGHSCHOOL";
  const MAX_SCHOOL_DIST = 6;                  // OCR typos allowed in the 26-letter school name
  const LOOSE_SCHOOL_DIST = 10;               // ...when the town line "Hagonoy, Bulacan" is also found
  const UNCLEAR_DIST = 12;                    // close enough to ask for a better photo instead of rejecting

  const norm = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");

  /* smallest edit distance between `pat` and ANY part of `text` (Sellers' algorithm) */
  function fuzzy(text, pat) {
    const t = norm(text), m = pat.length;
    let prev = Array.from({ length: m + 1 }, (_, i) => i), best = m;
    for (let j = 0; j < t.length; j++) {
      const cur = [0];
      for (let i = 1; i <= m; i++) cur[i] = Math.min(prev[i] + 1, cur[i - 1] + 1, prev[i - 1] + (pat[i - 1] === t[j] ? 0 : 1));
      if (cur[m] < best) best = cur[m];
      prev = cur;
    }
    return best;
  }

  function findLRN(text) {
    const m = /L\s*R\s*N\s*[:;.\-]?\s*([0-9OoIl|SB\s]{12,26})/.exec(text);
    if (m) {
      const d = m[1].replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/\D/g, "");
      if (d.length >= 12) return d.slice(0, 12);
    }
    const x = /(?<!\d)\d{12}(?!\d)/.exec(text);
    return x ? x[0] : "";
  }

  function findGrade(text) {
    const re = /GRADE\s*[-–—:]?\s*([0-9lIO]{1,2})(?![0-9])/gi;
    let m;
    while ((m = re.exec(text))) {
      const n = +m[1].replace(/[lI]/g, "1").replace(/O/g, "0");
      if (n >= 7 && n <= 12) return n;
    }
    return 0;
  }

  function findStrand(text) {
    if (/TECHNICAL\s*[-–—]?\s*PROFESSIONAL|\bTVL\b/i.test(text)) return "TVL";
    const m = /\b(STEM|ABM|HUMSS|GAS)\b/i.exec(text);
    return m ? m[1].toUpperCase() : "";
  }

  const titleCase = n => n.split(/\s+/).map(w => (w.length <= 3 && w.endsWith(".")) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

  function findName(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const at = lines.findIndex(l => /L\s*R\s*N/i.test(l));
    if (at < 1) return "";
    for (let i = at - 1; i >= Math.max(0, at - 3); i--) {
      const l = lines[i].replace(/[^A-Za-zÑñ.\-' ]/g, " ").replace(/\s+/g, " ").trim();
      if (l.split(" ").length >= 2 && l.length >= 6 && !/SCHOOL|NATIONAL|GRADE|TRACK|ADVISER|PEDRO|S\.?\s?Y/i.test(l) && l === l.toUpperCase()) return titleCase(l);
    }
    return "";
  }

  /* Decide whether the OCR text belongs to an SPNHS ID and pull out the details. */
  function analyze(text) {
    text = String(text || "");
    const schoolDist = fuzzy(text, SCHOOL_NAME);
    const lrn = findLRN(text);
    const sy = /S\s*\.?\s*Y\s*\.?\s*[:\s]*(20\d\d)\s*[-–—]\s*(20\d\d)/i.exec(text);
    const markers = [];
    if (fuzzy(text, "HAGONOYBULACAN") <= 3) markers.push("place");
    if (fuzzy(text, "CLASSADVISER") <= 2) markers.push("adviser");
    if (sy) markers.push("sy");
    if (lrn) markers.push("lrn");
    const out = { ok: false, reason: "not-school", schoolDist, markers, lrn, grade: "", strand: "", name: "", sy: sy ? sy[1] + "-" + sy[2] : "" };
    // Accept a clear read of the school name, or a fuzzier one backed by "San Pedro, Hagonoy, Bulacan" (blurry photos).
    const pedro = fuzzy(text, "SANPEDRO") <= 2;        // the part that tells us apart from "San Roque", "San Pablo", ...
    const named = pedro && markers.length >= 2 && (schoolDist <= MAX_SCHOOL_DIST || (schoolDist <= LOOSE_SCHOOL_DIST && markers.includes("place")));
    if (!named) return markers.length >= 2 && schoolDist <= UNCLEAR_DIST ? { ...out, reason: "unclear" } : out;   // unclear = looks close, retake
    if (out.sy && out.sy !== SCHOOL_YEAR) return { ...out, reason: "wrong-year" };
    const g = findGrade(text);
    if (!g || !lrn) return { ...out, reason: "incomplete", grade: g ? "Grade " + g : "" };
    return { ...out, ok: true, reason: "", grade: "Grade " + g, strand: g >= 11 ? findStrand(text) : "", name: findName(text) };
  }

  /* ---------- browser side: photo -> OCR -> analyze ---------- */
  function loadTesseract() {
    if (root.Tesseract) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      s.onload = res; s.onerror = () => rej(new Error("reader-load"));
      document.head.appendChild(s);
    });
  }

  async function bitmapOf(file) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch {
      const url = URL.createObjectURL(file);
      return await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
    }
  }

  function canvasOf(img, rot, mode) {
    const w0 = img.width, h0 = img.height, s = Math.min(2, 2000 / Math.max(w0, h0)), w = Math.round(w0 * s), h = Math.round(h0 * s);
    const c = document.createElement("canvas"), swap = rot === 90 || rot === 270;
    c.width = swap ? h : w; c.height = swap ? w : h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    x.translate(c.width / 2, c.height / 2); x.rotate(rot * Math.PI / 180);
    x.drawImage(img, -w / 2, -h / 2, w, h);
    if (mode === "min") {            // darkest colour channel: white text on a coloured band turns dark on light
      x.setTransform(1, 0, 0, 1, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) { const v = Math.min(p[i], p[i + 1], p[i + 2]); p[i] = p[i + 1] = p[i + 2] = v; }
      x.putImageData(d, 0, 0);
    }
    return c;
  }

  /* IDs come in different colours and are often photographed sideways, so for each turn of the photo we read it
     twice (normal, and "darkest channel" for white-on-colour text), merge the text, and stop at the first good read. */
  const RANK = { "wrong-year": 4, incomplete: 3, unclear: 2, "not-school": 1 };
  async function read(file, onNote) {
    await loadTesseract();
    const img = await bitmapOf(file), worker = await root.Tesseract.createWorker("eng");
    let best = null;
    try {
      for (const rot of [0, 90, 270, 180]) {
        if (rot && onNote) onNote("Trying another angle…");
        let text = "";
        for (const mode of ["color", "min"]) {
          const { data } = await worker.recognize(canvasOf(img, rot, mode));
          text += data.text + "\n";
          const r = analyze(text);
          if (r.ok) return r;
          if (!best || RANK[r.reason] * 100 - r.schoolDist > RANK[best.reason] * 100 - best.schoolDist) best = r;
        }
      }
    } finally { await worker.terminate(); }
    return best;
  }

  const api = { analyze, read, SCHOOL_YEAR };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.IDReader = api;
})(typeof window !== "undefined" ? window : globalThis);
