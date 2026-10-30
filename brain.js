/* CampusConnect – front-end demo (data is saved in the browser's localStorage) */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- storage helpers ---------- */
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* ---------- state ---------- */
const sample = [
  { id: 5, name: "CampusConnect Oversized Hoodie", price: 599, old: 749, cat: "Accessories", emoji: "🧥", bg: "#1b2a55", seller: "Student Seller", stock: 24,
    colors: [{ n: "Navy Blue", c: "#2a3b73" }, { n: "Gray", c: "#c9ced8" }, { n: "Black", c: "#2b2e36" }], sizes: ["S", "M", "L", "XL"],
    desc: "Cozy oversized hoodie with a Los Angeles, California print. Thick, soft fabric that is perfect for cool weather and school days." },
  { id: 1, name: "School Supplies Set", price: 85,  cat: "School Supplies", emoji: "📓", bg: "#f6c9d3", seller: "Student Seller" },
  { id: 2, name: "Chocolate Cookies",   price: 50,  cat: "Food",            emoji: "🍪", bg: "#e8cfa9", seller: "Student Seller" },
  { id: 3, name: "Cute Keychains",      price: 35,  cat: "Accessories",     emoji: "🧸", bg: "#f9c6dc", colors: [{ n: "Pink", c: "#f9c6dc" }, { n: "Blue", c: "#cfe6f7" }], seller: "Student Seller" },
  { id: 4, name: "Beaded Bracelet",     price: 25,  cat: "Accessories",     emoji: "📿", bg: "#cfe6f7", seller: "Student Seller" },
];
let accounts = load("cc_accounts", []);
let session  = load("cc_session", null);           // student ID of logged-in user
let myItems  = load("cc_mine", []);                // products posted by this browser
let favs     = load("cc_favs", []);
let category = "All", query = "", photoData = "";

/* ---------- navigation ---------- */
const AUTH_VIEWS = ["auth", "scan", "verify", "idinfo", "role", "create", "welcome"];
function go(view) {
  if (!session && !AUTH_VIEWS.includes(view)) view = "auth";
  if (view === "sell" && !isSeller()) { toast("Only Senior High School students (Grade 11–12) can sell."); view = lastMain || "home"; }
  curView = view;
  if (["home", "favorites", "messages", "profile"].includes(view)) lastMain = view;
  $$(".screen").forEach(s => s.classList.add("hidden"));
  const screenId = view === "favorites" ? "home" : view;
  $("#" + screenId).classList.remove("hidden");
  $("#nav").classList.toggle("hidden", [...AUTH_VIEWS, "sell", "detail", "buy", "settings", "editprofile", "chat"].includes(view));
  const sb = $("#nav .sellbtn"); if (sb) sb.classList.toggle("hidden", !isSeller());
  $$("#nav button").forEach(b => b.classList.toggle("on", b.dataset.go === view));
  if (view === "home" || view === "favorites") {
    const fav = view === "favorites";
    $("#homeTitle").textContent = fav ? "Your favorites" : "Today's picks";
    $("#homeSub").textContent = fav ? "Products you saved." : "Discover products from your fellow students.";
    $("#home").dataset.view = view;
    renderGrid();
  }
  if (view === "profile") renderProfile();
  if (view === "messages") renderChatList();
  if (view === "editprofile") renderEdit();
  window.scrollTo(0, 0);
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-go]");
  if (b) go(b.dataset.go);
});

/* ---------- toast ---------- */
let tt;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- AUTH: create account / log in ---------- */
const setErr = (input, msg) => {
  const f = input.closest(".field");
  f.classList.toggle("bad", !!msg);
  $(".err", f).textContent = msg || "";
  return !msg;
};
const isLRN = v => /^\d{12}$/.test(v);                      // LRN = 12 digits
const isStudentId = v => /^[A-Za-z0-9-]{5,20}$/.test(v);     // simple student ID
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/* ----- roles: Grade 7-10 = Buyer, Grade 11-12 = Seller (decided by the grade on the school ID) ----- */
const gradeNum = g => +String(g).replace(/\D/g, "");
const roleFor = g => gradeNum(g) >= 11 ? "seller" : "buyer";
const me = () => accounts.find(a => a.id === session);
const roleOfUser = u => (u && u.role) || "seller";      // accounts made before roles existed keep their selling access
const isSeller = () => roleOfUser(me()) === "seller";
const STRANDS = ["STEM", "ABM", "HUMSS", "GAS", "TVL"];
const ROLE = {
  buyer:  { icon: "🛒", name: "Buyer",  level: "Junior High School", range: "Grade 7 – 10",
            can: ["You can browse and buy products from other students.", "You can chat with sellers.", "You can save and favorite items."], cant: "You cannot post or sell products." },
  seller: { icon: "🏪", name: "Seller", level: "Senior High School", range: "Grade 11 – 12",
            can: ["You can post and sell products.", "You can also buy products.", "You can chat with other users.", "You can manage your listings."] },
};
let reg = {}, vTimer;

$$(".eye").forEach(b => b.onclick = () => {
  const i = $("#" + b.dataset.eye);
  i.type = i.type === "password" ? "text" : "password";
});

/* log in */
$("#loginForm").addEventListener("submit", e => {
  e.preventDefault();
  const id = $("#studentId"), pw = $("#password"), idv = id.value.trim().toLowerCase();
  let ok = setErr(id, idv ? "" : "Enter your school email or student ID.");
  ok = setErr(pw, pw.value ? "" : "Enter your password.") && ok;
  if (!ok) return;
  const user = accounts.find(a => a.id === idv && a.password === pw.value);
  if (!user) return void setErr(pw, "Wrong ID or password.");
  session = user.id; save("cc_session", session);
  toast("Welcome back, " + user.name.split(" ")[0] + "!");
  e.target.reset(); go("home");
});

/* step 1-3: scan the ID. The photo is read in the browser (idreader.js); other schools' IDs are turned away. */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const setStep = (i, st) => { const li = $$("#vSteps li")[i]; if (li) li.className = st; };
const SCAN_MSG = {
  "not-school": "This doesn't look like a San Pedro National High School ID. Only SPNHS students can sign up.",
  unclear: "We couldn't clearly confirm this is a San Pedro National High School ID. Retake the photo with the whole ID in view, good light and no glare.",
  "wrong-year": "This ID is not for school year " + (window.IDReader ? IDReader.SCHOOL_YEAR : "2026-2027") + ". Please scan your current ID.",
  "no-reader": "The ID reader file is missing. Put id_reader.js in the same folder as index1.html, then reload the page.",
  incomplete: "We found the school name but couldn't read your LRN and grade level. Retake the photo with the whole ID in view and no glare.",
  "cam-denied": "Camera access was blocked. Allow the camera for this page in your browser settings, or tap “Upload a photo instead”.",
  "cam-none": "We couldn't open a camera on this device or page. Use “Upload a photo instead”. (The camera only works on a secure https:// page.)",
  "id-mismatch": "This ID doesn't match the account you are resetting. Scan your own school ID.",
  "reader-load": "The ID reader couldn't load. Check your internet connection and try again.",
};
const FAIL_STEP = { "not-school": 1, unclear: 1, "wrong-year": 1, incomplete: 2 };
function scanFail(code) {
  const m = $("#scanErr"); m.textContent = SCAN_MSG[code] || "Something went wrong while reading the ID. Please try again."; m.classList.remove("hidden");
  go("scan");
}
let scanBusy = false;
$("#startScan").onclick = () => { setScanMode("signup"); reg = {}; $("#scanErr").classList.add("hidden"); go("scan"); };
$("#idPhoto").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) scanFile(f); });
async function scanFile(f) {
  if (!f || scanBusy) return;
  scanBusy = true; $("#scanErr").classList.add("hidden");
  if (!window.IDReader) { scanBusy = false; return scanFail("no-reader"); }
  $$("#vSteps li").forEach(x => x.className = ""); setStep(0, "load"); $("#vNote").textContent = "This can take a few seconds."; go("verify");
  try {
    const r = await IDReader.read(f, msg => { $("#vNote").textContent = msg; });
    setStep(0, "done"); setStep(1, "load"); await sleep(350);
    if (!r.ok) { setStep(FAIL_STEP[r.reason] || 1, "fail"); await sleep(700); return scanFail(r.reason); }
    if (scanMode === "reset" && r.lrn !== resetId) { setStep(1, "fail"); await sleep(700); return scanFail("id-mismatch"); }
    setStep(1, "done"); setStep(2, "load"); await sleep(350);
    setStep(2, "done"); setStep(3, "load"); await sleep(350);
    setStep(3, "done"); await sleep(300);
    if (scanMode === "reset") { resetOk = resetId; setScanMode("signup"); go("auth"); return openResetPw(); }
    reg = { name: r.name, id: r.lrn, grade: r.grade, strand: r.strand, role: roleFor(r.grade) };
    prepIdForm(); go("idinfo");
  } catch (err) {
    scanFail(err && err.message === "reader-load" ? "reader-load" : "error");
  } finally { scanBusy = false; }
}

/* live camera: opens the device camera, takes a still, and hands it to the same reader as an uploaded photo */
let camStream = null, camFacing = "environment";
function camStop() {
  if (camStream) camStream.getTracks().forEach(t => t.stop());
  camStream = null; $("#camVideo").srcObject = null;
}
function camClose() { camStop(); $("#cam").classList.add("hidden"); }
async function camStart() {
  camStop();
  camStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: camFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
  const v = $("#camVideo"); v.srcObject = camStream; await v.play().catch(() => {});
}
$("#camOpen").onclick = async () => {
  reg = {}; $("#scanErr").classList.add("hidden");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return scanFail("cam-none");
  try { $("#cam").classList.remove("hidden"); await camStart(); }
  catch (err) { camClose(); scanFail(err && err.name === "NotAllowedError" ? "cam-denied" : "cam-none"); }
};
$("#camClose").onclick = camClose;
$("#camFlip").onclick = async () => {
  camFacing = camFacing === "environment" ? "user" : "environment";
  try { await camStart(); } catch { camFacing = camFacing === "environment" ? "user" : "environment"; try { await camStart(); } catch {} }
};
$("#camShot").onclick = () => {
  const v = $("#camVideo"); if (!v.videoWidth) return;
  const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  c.toBlob(b => { camClose(); if (b) scanFile(new File([b], "id.jpg", { type: "image/jpeg" })); }, "image/jpeg", 0.92);
};
document.addEventListener("visibilitychange", () => { if (document.hidden) camClose(); });

/* forgot password: prove it's the account owner by scanning the ID (the LRN must match), then set a new password */
let scanMode = "signup", resetId = "", resetOk = "";
function setScanMode(m) {
  scanMode = m;
  $("#scanTitle").textContent = m === "reset" ? "Verify Your ID" : "Scan Your School ID";
  $("#scanSub").textContent = m === "reset" ? "Scan the school ID of the account you want to reset. The LRN on it must match." : "Scan your San Pedro National High School ID to continue.";
}
function openForgot() {
  openSheet(`<h2 class="sh">Forgot password?</h2><p class="muted s">Enter your LRN or student ID. Then scan your school ID to confirm it's you.</p>
    <div class="field" style="margin-top:12px"><input id="fpId" placeholder="LRN or student ID" autocomplete="off"></div>
    <small class="err" id="fpErr"></small><button class="btn primary" id="fpNext">Continue</button>
    <p class="muted s" style="margin-top:10px">Can't scan your ID? Email <a href="mailto:campusconnect.sphns.system@gmail.com?subject=CampusConnect%20Password%20Help" style="color:var(--blue);font-weight:700;word-break:break-all">campusconnect.sphns.system@gmail.com</a> or tell your class adviser.</p>`);
  $("#fpId").value = $("#studentId").value.trim();
}
function forgotNext() {
  const id = $("#fpId").value.trim().toLowerCase(), a = accounts.find(x => x.id === id);
  const err = !id ? "Enter your LRN or student ID." : !a ? "No account found with that ID." :
    !isLRN(a.id) ? "This account can't be checked by ID scan. Please email support or tell your class adviser." : "";
  if (err) return void ($("#fpErr").textContent = err);
  resetId = a.id; resetOk = ""; closeSheet(); setScanMode("reset"); $("#scanErr").classList.add("hidden"); go("scan");
}
function openResetPw() {
  openSheet(`<h2 class="sh">Set a new password</h2><p class="muted s">✅ ID verified. Choose a new password for your account.</p>
    <div class="field" style="margin-top:12px"><input id="rpNew" type="password" placeholder="New password (8+ characters, letters and numbers)" autocomplete="new-password"></div>
    <div class="field"><input id="rpCf" type="password" placeholder="Confirm new password" autocomplete="new-password"></div>
    <small class="err" id="rpErr"></small><button class="btn primary" id="rpSave">Reset Password</button>`);
}
function saveResetPw() {
  const u = accounts.find(a => a.id === resetOk), p = $("#rpNew").value;
  const err = !u ? "Verification expired. Please start again." : !(p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p)) ? "Use 8+ characters with letters and numbers." : p !== $("#rpCf").value ? "Passwords do not match." : "";
  if (err) return void ($("#rpErr").textContent = err);
  u.password = p; save("cc_accounts", accounts); resetId = resetOk = "";
  closeSheet(); $("#studentId").value = u.id; $("#password").value = ""; toast("Password reset. You can log in now.");
}
document.addEventListener("click", e => {
  if (e.target.closest("#forgotBtn")) openForgot();
  else if (e.target.closest("#fpNext")) forgotNext();
  else if (e.target.closest("#rpSave")) saveResetPw();
});

/* step 4: confirm the details on the ID */
function syncStrand() {
  const g = $("#iGrade").value, st = $("#iStrand"), shs = gradeNum(g) >= 11, keep = st.value;
  st.disabled = !g || !shs;
  st.innerHTML = !g ? "<option>Select grade level first</option>" : !shs ? "<option>N/A (Junior High School)</option>"
    : `<option value="">Select strand</option>${STRANDS.map(x => `<option>${x}</option>`).join("")}`;
  if (shs && STRANDS.includes(keep)) st.value = keep;
}
function prepIdForm() {
  // LRN, grade level and strand come from the ID itself and can't be edited here; only the name can be corrected.
  $("#iName").value = reg.name || ""; $("#iSid").value = reg.id || ""; $("#iSid").readOnly = true;
  $("#iGrade").value = reg.grade; $("#iGrade").disabled = true; syncStrand();
  if (reg.strand) { $("#iStrand").value = reg.strand; $("#iStrand").disabled = true; }
  $$("#idForm .err").forEach(x => x.textContent = ""); $$("#idForm .field").forEach(x => x.classList.remove("bad"));
}
$("#iGrade").addEventListener("change", syncStrand);
$("#idForm").addEventListener("submit", e => {
  e.preventDefault();
  const n = $("#iName"), s = $("#iSid"), g = $("#iGrade"), st = $("#iStrand"), sid = s.value.trim().toLowerCase();
  const shs = gradeNum(g.value) >= 11;
  let ok = setErr(n, n.value.trim().length >= 3 ? "" : "Enter your full name.");
  ok = setErr(s, !sid ? "Enter your student ID." : !(isLRN(sid) || isStudentId(sid)) ? "Use your student ID or 12-digit LRN." :
        accounts.some(a => a.id === sid) ? "This ID already has an account. Please log in." : "") && ok;
  ok = setErr(g, g.value ? "" : "Select your grade level.") && ok;
  ok = setErr(st, shs && !st.value ? "Select your strand." : "") && ok;
  if (!ok) return;
  reg = { name: n.value.trim(), id: sid, grade: g.value, strand: shs ? st.value : "", role: roleFor(g.value) };
  renderRole(); go("role");
});

/* step 5: role assigned */
const checks = (R, withCant) => `<ul class="checks">${R.can.map(t => `<li>${t}</li>`).join("")}${withCant && R.cant ? `<li class="no">${R.cant}</li>` : ""}</ul>`;
function renderRole() {
  const R = ROLE[reg.role];
  $("#roleBody").innerHTML = `<div class="rolebox ${reg.role}"><div class="roleic">${R.icon}</div><b class="rname">${R.name}</b><div>${R.level}<br>(${R.range})</div></div>${checks(R, true)}`;
}
$("#roleNext").onclick = () => { $("#createForm").reset(); $$("#pwHints li").forEach(l => l.classList.remove("ok")); go("create"); };

/* step 6: create account */
$("#cPw").addEventListener("input", e => {
  const v = e.target.value;
  $('#pwHints [data-h="len"]').classList.toggle("ok", v.length >= 8);
  $('#pwHints [data-h="mix"]').classList.toggle("ok", /[A-Za-z]/.test(v) && /\d/.test(v));
});
$("#createForm").addEventListener("submit", e => {
  e.preventDefault();
  const u = $("#cUser"), pw = $("#cPw"), cf = $("#cCf"), un = u.value.trim().replace(/^@/, "");
  let ok = setErr(u, !/^[a-z0-9._]{3,20}$/i.test(un) ? "3–20 letters, numbers, dots or underscores." :
        accounts.some(a => uname(a).toLowerCase() === un.toLowerCase()) ? "That username is taken." : "");
  ok = setErr(pw, pw.value.length >= 8 && /[A-Za-z]/.test(pw.value) && /\d/.test(pw.value) ? "" : "Use 8+ characters with letters and numbers.") && ok;
  ok = setErr(cf, cf.value && cf.value === pw.value ? "" : "Passwords do not match.") && ok;
  if (!ok) return;
  if (accounts.some(a => a.id === reg.id)) { toast("This ID already has an account. Please log in."); return go("auth"); }
  const acct = { name: reg.name, id: reg.id, password: pw.value, username: un, grade: reg.grade, strand: reg.strand, role: reg.role, verified: true };
  accounts.push(acct); save("cc_accounts", accounts);
  session = acct.id; save("cc_session", session);
  e.target.reset();
  if (acct.role === "seller") {
    $("#welcomeSub").textContent = "Welcome to CampusConnect, " + acct.name.split(" ")[0] + "!";
    $("#welcomeNote").textContent = "Your account is now ready. You can start selling and managing your products within our school.";
    go("welcome");
  } else { toast("Welcome to CampusConnect, " + acct.name.split(" ")[0] + "!"); go("home"); }
});
$("#toStore").onclick = () => { ptab = "listings"; go("profile"); };

/* ---------- PRODUCTS ---------- */
const allProducts = () => [...myItems, ...sample];

function card(p, mine) {
  const thumb = p.photo
    ? `<div class="thumb img" style="background-image:url(${p.photo})"></div>`
    : `<div class="thumb" style="background:${p.bg || "#dbe9ff"}">${p.emoji || "🛍️"}</div>`;
  return `<article class="prod" data-pid="${p.id}">${thumb}
    ${mine ? '<span class="badge">Active</span><button class="dots" data-del="' + p.id + '" aria-label="Delete listing">⋮</button>'
           : `<button class="heart ${favs.includes(p.id) ? "on" : ""}" data-fav="${p.id}" aria-label="Favorite">${favs.includes(p.id) ? "♥" : "♡"}</button>`}
    <div class="pinfo"><b>${esc(p.name)}</b><div class="price">₱${p.price}</div>
    <div class="seller">${mine ? `⏱ ${p.sold || 0} sold &nbsp; ♡ ${p.likes || 0}` : `<span class="av">🧑</span>${esc(p.seller || "Student Seller")}`}</div></div></article>`;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function renderGrid() {
  const favView = $("#home").dataset.view === "favorites";
  const list = allProducts().filter(p =>
    (!favView || favs.includes(p.id)) &&
    (category === "All" || p.cat === category) &&
    p.name.toLowerCase().includes(query));
  $("#grid").innerHTML = list.length ? list.map(p => card(p, false)).join("")
    : `<div class="empty">😕<br>${favView ? "No favorites yet. Tap ♡ on a product." : "No products found."}</div>`;
}
$("#grid").addEventListener("click", e => {
  const h = e.target.closest("[data-fav]"); if (!h) return;
  const id = +h.dataset.fav;
  favs = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id];
  save("cc_favs", favs); renderGrid();
});
$("#chips").addEventListener("click", e => {
  const c = e.target.closest(".chip"); if (!c) return;
  category = c.dataset.cat;
  $$(".chip").forEach(x => x.classList.toggle("on", x === c));
  renderGrid();
});
$("#search").addEventListener("input", e => { query = e.target.value.trim().toLowerCase(); renderGrid(); });

/* ---------- SELL ---------- */
$("#photo").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { photoData = r.result; $("#preview").src = photoData; $("#preview").hidden = false; $("#uploadText").hidden = true; };
  r.readAsDataURL(f);
});
$("#sellForm").addEventListener("submit", e => {
  e.preventDefault();
  if (!isSeller()) return toast("Only Senior High School students (Grade 11–12) can sell.");
  const n = $("#pName"), p = $("#pPrice"), c = $("#pCat");
  let ok = true;
  ok = setErr(n, n.value.trim() ? "" : "Enter a product name.") && ok;
  ok = setErr(p, +p.value > 0 ? "" : "Enter a price greater than 0.") && ok;
  ok = setErr(c, c.value ? "" : "Choose a category.") && ok;
  if (/\b(vape|cigarettes?|alcohol|beer|guns?|knife|knives|weapons?|explosives?|drugs?|answer\s*keys?|fake\s*(id|documents?))\b/i.test(n.value + " " + $("#pDesc").value)) return void setErr(n, "This item isn't allowed. See Safety & Rules.");
  // photos are stored in localStorage only if small enough
  const item = { id: Date.now(), name: n.value.trim(), price: Math.round(+p.value), cat: c.value, desc: $("#pDesc").value.trim(), photo: photoData.length < 400000 ? photoData : "", emoji: "🛍️" };
  myItems.unshift(item); save("cc_mine", myItems);
  e.target.reset(); photoData = ""; $("#preview").hidden = true; $("#uploadText").hidden = false;
  toast("Product posted!");
  go("profile");
});

/* ---------- PROFILE ---------- */
function renderProfile() {
  const u = me(), seller = isSeller();
  if (u) {
    $("#pfName").textContent = u.name; setAvatar($("#pfAv"), u);
    $("#pfSub").textContent = u.grade ? u.grade + (u.strand ? " · " + u.strand : "") : "Student";
    $("#pfRole").textContent = ROLE[roleOfUser(u)].name;
  }
  $$(".ptab[data-tab=listings]").forEach(b => b.classList.toggle("hidden", !seller));
  $(".ptabs").style.setProperty("--n", seller ? 4 : 3);
  if (!seller && ptab === "listings") ptab = "favorites";
  $("#stLabel").textContent = seller ? "Listings" : "Orders";
  $("#stListings").textContent = seller ? myItems.length : orders.length;
  $("#stRev").textContent = Object.values(reviews).reduce((n, l) => n + l.length, 0);
  $("#cartBadge").textContent = orders.length; $("#cartBadge").classList.toggle("hidden", !orders.length);
  renderTab();
}
let ptab = "listings";
function renderTab() {
  const T = { listings: "My Listings", favorites: "Favorites", orders: "Orders", settings: "Settings" };
  $("#tabTitle").textContent = T[ptab];
  $$(".ptab").forEach(b => b.classList.toggle("on", b.dataset.tab === ptab));
  $("#addBtn").classList.toggle("hidden", ptab !== "listings");
  const g = $("#myGrid");
  if (ptab === "listings") g.innerHTML = myItems.length ? myItems.map(p => card(p, true)).join("")
    : `<div class="empty">📦<br>No listings yet.<br>Tap “Add New Product” to start selling.</div>`;
  else if (ptab === "favorites") { const l = allProducts().filter(p => favs.includes(p.id));
    g.innerHTML = l.length ? l.map(p => card(p, false)).join("") : `<div class="empty">♡<br>No favorites yet.</div>`; }
  else if (ptab === "orders") g.innerHTML = orders.length ? orders.map(orderCard).join("") : `<div class="empty">🧊<br>No orders yet.</div>`;
  else g.innerHTML = `<div class="empty">⚙️<br>Settings coming soon.</div>`;
}
$$(".ptab").forEach(b => b.onclick = () => { if (b.dataset.tab === "settings") return go("settings"); ptab = b.dataset.tab; renderTab(); });
$("#myGrid").addEventListener("click", e => {
  const h = e.target.closest("[data-fav]"), d = e.target.closest("[data-del]");
  if (h) { const id = +h.dataset.fav; favs = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id]; save("cc_favs", favs); renderProfile(); }
  if (d && confirm("Delete this listing?")) { myItems = myItems.filter(p => p.id !== +d.dataset.del); save("cc_mine", myItems); renderProfile(); toast("Listing deleted."); }
});

const doLogout = () => { session = null; save("cc_session", null); toast("Logged out."); go("auth"); };

/* ---------- PRODUCT DETAIL / BUY / FEEDBACK ---------- */
let cur = null, curView = "", lastMain = "home", dtab = "overview", rate = 0, writing = false, fbDraft = "";
let orders = load("cc_orders", []), reviews = load("cc_reviews", {}), helped = {};
const peso = n => "₱" + Number(n).toLocaleString("en-PH");
const oldPrice = p => p.old || Math.round(p.price / 0.8);
const findP = id => allProducts().find(p => p.id === id);
const isMine = id => myItems.some(p => p.id === id);
const BASE = { 5: 84, 4: 12, 3: 3, 2: 1, 1: 0 };
const SEED = [
  { name: "Alyssa M.", stars: 5, when: "2 days ago", text: "Great quality and perfect for school! Exactly as described. Will definitely buy again!", helpful: 18, verified: true },
  { name: "Joaquin T.", stars: 5, when: "4 days ago", text: "Worth it! Seller was friendly and easy to meet on campus.", helpful: 9, verified: true },
];
const revsOf = id => [...(reviews[id] || []), ...SEED];
const stars = n => "★".repeat(n) + "☆".repeat(5 - n);
function stats(id) {
  const c = { ...BASE }; (reviews[id] || []).forEach(r => c[r.stars]++);
  const n = Object.values(c).reduce((a, b) => a + b, 0);
  const avg = Object.entries(c).reduce((a, [s, k]) => a + s * k, 0) / n;
  return { c, n, avg: avg.toFixed(1) };
}
const colorOf = p => (p.colors && p.colors.find(c => c.n === cur.color)) || null;
const colorChips = p => !p.colors ? "" : `<div class="lbl">Color: <span>${cur.color}</span></div><div class="sw">${p.colors.map(c => `<button class="swatch ${c.n === cur.color ? "on" : ""}" data-color="${c.n}" style="background:${c.c}" aria-label="${c.n}">${p.emoji}</button>`).join("")}</div>`;
const sizePills = p => !p.sizes ? "" : `<div class="lbl">Size: <span>${cur.size}</span></div><div class="pills">${p.sizes.map(s => `<button class="pill ${s === cur.size ? "on" : ""}" data-size="${s}">${s}</button>`).join("")}</div>`;
const priceRow = p => `<div class="pricerow"><b class="big">${peso(p.price)}</b><s>${peso(oldPrice(p))}</s><span class="save">Save ${peso(oldPrice(p) - p.price)}</span></div>`;

function openDetail(id) {
  const p = findP(id); if (!p) return;
  cur = { p, color: p.colors ? p.colors[0].n : "", size: p.sizes ? (p.sizes[1] || p.sizes[0]) : "", qty: 1 };
  dtab = "overview"; writing = false; rate = 0; fbDraft = "";
  go("detail"); renderDetail();
}
function toggleFav(id) { favs = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id]; save("cc_favs", favs); }

function renderDetail() {
  const p = cur.p, st = stats(p.id), fav = favs.includes(p.id), col = colorOf(p);
  $$(".dtab").forEach(b => b.classList.toggle("on", b.dataset.dt === dtab));
  $("#dHeart").classList.toggle("on", fav); $("#dHeart").textContent = fav ? "♥" : "♡";
  let h = "";
  if (dtab === "overview") {
    const hero = p.photo ? `<div class="hero img" style="background-image:url(${p.photo})"></div>`
      : `<div class="hero" style="background:${col ? col.c : (p.bg || "#dbe9ff")}">${p.emoji || "🛍️"}</div>`;
    h = hero + `<div class="deal"><span>🔥 Student Deal</span><b>20% OFF</b></div>
      <div class="dpanel">${priceRow(p)}<h2 class="pname">${esc(p.name)}</h2>
      <div class="rate"><span class="stars">★</span> <b>${st.avg}</b> <span class="muted">(${st.n} feedback)</span></div>${colorChips(p)}${sizePills(p)}</div>`;
  } else if (dtab === "description") {
    h = `<div class="dpanel"><h2>Description</h2><p>${esc(p.desc || "The seller hasn't added a description yet.")}</p><p class="muted s">Category: ${esc(p.cat)}</p></div>`;
  } else {
    const bars = [5, 4, 3, 2, 1].map(s => { const pc = Math.round(st.c[s] / st.n * 100); return `<div class="bar"><span>${s} ★</span><i><u style="width:${pc}%"></u></i><span>${pc}%</span></div>`; }).join("");
    const form = writing ? `<div class="dpanel wf"><b>Your rating</b><div class="rstars">${[1, 2, 3, 4, 5].map(n => `<button class="rs ${n <= rate ? "on" : ""}" data-rate="${n}" aria-label="${n} stars">★</button>`).join("")}</div><textarea id="fbText" rows="3" placeholder="Share your experience...">${esc(fbDraft)}</textarea><button class="btn primary" id="fbSend">Submit feedback</button></div>` : "";
    const list = revsOf(p.id).map((r, i) => { const k = p.id + "-" + i; return `<div class="rev"><div class="av2">🧑</div><div class="grow"><b>${esc(r.name)}</b> ${r.verified ? '<span class="vb">✔ Verified Buyer</span>' : ""}<div><span class="stars">${stars(r.stars)}</span> <span class="muted s">· ${r.when}</span></div><p>${esc(r.text)}</p><button class="help" data-help="${k}">👍 Helpful (${r.helpful + (helped[k] ? 1 : 0)})</button></div></div>`; }).join("");
    h = `<div class="dpanel"><h2>Customer feedback</h2><div class="avg"><b>${st.avg}</b><span class="muted">/5 (${st.n})</span></div><div class="stars big">${stars(Math.round(st.avg))}</div>${bars}</div>${form}<div class="dpanel">${list}</div>`;
  }
  $("#dBody").innerHTML = h;
  $("#abar").innerHTML = dtab === "feedback"
    ? `<button class="btn primary" id="aWrite">✏️ ${writing ? "Cancel" : "Write a feedback"}</button>`
    : `<button class="aico ${fav ? "on" : ""}" id="aFav"><span>${fav ? "♥" : "♡"}</span>Favorite</button><button class="aico" id="aChat"><span>💬</span>Chat</button><button class="btn primary" id="aBuy">Buy Now</button>`;
}
$("#dBack").onclick = () => go(lastMain);
$("#detail").addEventListener("click", e => {
  const q = s => e.target.closest(s); let el;
  const ta = $("#fbText"); if (ta) fbDraft = ta.value;
  if ((el = q(".dtab"))) { dtab = el.dataset.dt; writing = false; }
  else if ((el = q("[data-color]"))) cur.color = el.dataset.color;
  else if ((el = q("[data-size]"))) cur.size = el.dataset.size;
  else if (q("#dHeart, #aFav")) toggleFav(cur.p.id);
  else if (q("#aChat")) { if (isMine(cur.p.id)) return toast("This is your own listing."); return openChat(cur.p.seller || "Student Seller", cur.p, "detail"); }
  else if (q("#aBuy")) { if (isMine(cur.p.id)) return toast("This is your own listing."); cur.qty = 1; go("buy"); return renderBuy(); }
  else if (q("#aWrite")) { writing = !writing; rate = 0; fbDraft = ""; }
  else if ((el = q("[data-rate]"))) rate = +el.dataset.rate;
  else if (q("#fbSend")) {
    if (!rate) return toast("Tap a star to rate.");
    if (fbDraft.trim().length < 3) return toast("Please write a short feedback.");
    const u = accounts.find(a => a.id === session), parts = (u ? u.name : "Student").split(" ");
    const name = parts[0] + (parts[1] ? " " + parts[parts.length - 1][0] + "." : "");
    (reviews[cur.p.id] = reviews[cur.p.id] || []).unshift({ name, stars: rate, when: "Just now", text: fbDraft.trim(), helpful: 0, verified: orders.some(o => o.pid === cur.p.id) });
    save("cc_reviews", reviews); writing = false; fbDraft = ""; toast("Thanks for your feedback!");
  }
  else if ((el = q("[data-help]"))) helped[el.dataset.help] = !helped[el.dataset.help];
  else return;
  renderDetail();
});
/* open detail when a product card is clicked (not the heart / ⋮ buttons) */
document.addEventListener("click", e => {
  if (e.target.closest("[data-fav],[data-del]")) return;
  const a = e.target.closest("[data-pid]"); if (a) openDetail(+a.dataset.pid);
});

/* ----- Buy Now ----- */
const getAddr = () => { const u = accounts.find(a => a.id === session) || {}; return u.addr || { name: u.name || "", phone: "", line: "SPNHS, San Pedro National High School" }; };
const phoneOk = v => /^(\+63|0)9\d{9}$/.test(v.replace(/[\s-]/g, ""));
function renderBuy() {
  const p = cur.p, st = stats(p.id), col = colorOf(p), sub = p.price * cur.qty, ship = 50, stock = p.stock || 24, a = getAddr();
  const bg = col ? col.c : (p.bg || "#dbe9ff");
  $("#buyBody").innerHTML = `
    <div class="dpanel row"><div class="mini" style="background:${bg}">${p.emoji || "🛍️"}</div><div class="grow"><b>${esc(p.name)}</b><div class="rate"><span class="stars">★</span> ${st.avg} <span class="muted s">(${st.n} feedback)</span></div>${priceRow(p)}</div></div>
    <div class="dpanel"><h3>Product Details</h3>
      ${p.colors ? `<div class="drow"><span class="di">🎨</span><span class="dl">Color</span><i class="dot" style="background:${col.c}"></i><span>${cur.color}</span></div>` : ""}
      ${p.sizes ? `<div class="drow"><span class="di">👕</span><span class="dl">Size</span><span class="szpill">${cur.size}</span></div>` : ""}
      <div class="drow"><span class="di">📦</span><span class="dl">Quantity</span><div class="qty"><button class="qb" data-q="-1" aria-label="Less">−</button><b>${cur.qty}</b><button class="qb" data-q="1" aria-label="More">+</button></div></div>
      <div class="instock">● In stock · ${stock} pieces available</div>
      <div class="sumrow"><span>Subtotal</span><span>${peso(sub)}</span></div>
      <div class="sumrow"><span>Shipping Fee ⓘ</span><span>${peso(ship)}</span></div>
      <div class="sumrow tot"><span>Total</span><span>${peso(sub + ship)}</span></div></div>
    <h3 class="hh">📍 Shipping Address</h3>
    <div class="dpanel row addr"><div class="grow"><b>${esc(a.name)}</b><div class="muted s">${a.phone ? esc(a.phone) : "Add your contact number"}</div><div class="s">${esc(a.line)}</div></div><button class="chg" id="chgAddr">Change ›</button></div>
    <h3 class="hh">💳 Payment Method</h3>
    <div class="dpanel row"><span class="di">💵</span><div class="grow"><b>Cash on Delivery (COD)</b><div class="muted s">Pay when you receive your item.</div></div><span>›</span></div>
    <button class="btn primary" id="cBuy">🔒 Confirm Purchase</button>
    <p class="secure">🛡️ Your information is safe and secure. <button type="button" class="linkbtn" data-rules>Safety &amp; Rules</button></p>
    <button type="button" class="linkbtn center" id="bProd">‹ Back to Product</button>`;
}
const backToProduct = () => { go("detail"); renderDetail(); };
$("#bBack").onclick = backToProduct;
function openAddr() {
  const a = getAddr();
  openSheet(`<h2 class="sh">Shipping Address</h2><p class="muted s">Where should the seller deliver or meet you?</p>
    <div class="field"><input id="adName" placeholder="Full name" value="${esc(a.name)}"></div>
    <div class="field"><input id="adPhone" placeholder="Contact number (09xx xxx xxxx)" inputmode="tel" value="${esc(a.phone)}"></div>
    <div class="field"><input id="adLine" placeholder="Address / meetup place" value="${esc(a.line)}"></div>
    <small class="err" id="adErr"></small><button class="btn primary" id="adSave">Save Address</button>`);
}
function saveAddr() {
  const name = $("#adName").value.trim(), phone = $("#adPhone").value.trim(), line = $("#adLine").value.trim();
  const err = name.length < 3 ? "Enter your full name." : !phoneOk(phone) ? "Enter a valid PH mobile number (e.g. 09123456789)." : line.length < 5 ? "Enter your address or meetup place." : "";
  if (err) return void ($("#adErr").textContent = err);
  const u = accounts.find(a => a.id === session); u.addr = { name, phone, line }; save("cc_accounts", accounts);
  closeSheet(); if (curView === "buy") renderBuy(); toast("Address saved.");
}
$("#buy").addEventListener("click", e => {
  const q = s => e.target.closest(s); let el; const p = cur.p;
  if ((el = q("[data-q]"))) cur.qty = Math.min(p.stock || 24, Math.max(1, cur.qty + +el.dataset.q));
  else if (q("#chgAddr")) return openAddr();
  else if (q("#bProd")) return backToProduct();
  else if (q("#cBuy")) {
    if (!phoneOk(getAddr().phone)) { toast("Please add your contact number first."); return openAddr(); }
    orders.unshift({ id: Date.now(), pid: p.id, name: p.name, emoji: p.emoji || "🛍️", bg: (colorOf(p) || {}).c || p.bg || "#dbe9ff", color: cur.color, size: cur.size, qty: cur.qty, total: p.price * cur.qty + 50, date: new Date().toLocaleDateString("en-PH") });
    save("cc_orders", orders); toast("Order placed! 🎉 Pay when you receive your item.");
    ptab = "orders"; return go("profile");
  } else return;
  renderBuy();
});
const orderCard = o => `<div class="dpanel row" style="grid-column:1/-1;margin:0"><div class="mini" style="background:${o.bg}">${o.emoji}</div><div class="grow"><b>${esc(o.name)}</b><div class="muted s">${[o.color, o.size, o.qty + " pc"].filter(Boolean).join(" | ")}</div><div class="muted s">${o.date}</div></div><b>${peso(o.total)}</b></div>`;

/* ---------- SHEET (modal) ---------- */
function openSheet(html) { $("#sheetBody").innerHTML = html; $("#sheet").classList.remove("hidden"); }
function closeSheet() { $("#sheet").classList.add("hidden"); }
const RULES = [
  ["🛡️", "Secure & Verified Accounts", "We verify all users through their school ID or school email to ensure that everyone is a real SPNHS student.", "ok", "blue", ["School ID / school email verification", "Report suspicious accounts", "Block and remove fake profiles"]],
  ["🔒", "Your Privacy Matters", "We respect and protect your personal information.", "ok", "purple", ["Your name, contact number, and address are kept private.", "We do not share your information with third parties.", "Your data is used only for CampusConnect purposes."]],
  ["🤝", "Safe Meetups & Transactions", "For your safety, we encourage face-to-face meetups in designated public areas on campus.", "ok", "green", ["Meet in school-approved locations (e.g., school grounds, designated areas).", "Avoid sharing personal details publicly.", "Report any suspicious activities or unsafe interactions."]],
  ["🚫", "No Harmful or Prohibited Products", "We do not allow the sale or purchase of any illegal, dangerous, or harmful items.", "no", "red", ["No drugs, weapons, explosives, or unsafe items", "No academic dishonesty services (e.g., answer keys, fake documents)", "No inappropriate or illegal content", "No items that violate school policies or the law"]],
  ["👥", "Equal Access & Fair Rules", "We aim for a safe, transparent, and respectful marketplace for all SPNHS students.", "ok", "blue", ["No discrimination", "Clear and fair guidelines for buyers and sellers", "Feedback and rating system for accountability"]],
];
function openRules() {
  openSheet(`<h2 class="sh">🛡️ Safety &amp; Rules</h2><p class="muted s">A safer and better CampusConnect for every student.</p>` +
    RULES.map(r => `<div class="rule ${r[4]}"><div class="rh"><span class="ric">${r[0]}</span><div><b>${r[1]}</b><p>${r[2]}</p></div></div><ul class="${r[3]}">${r[5].map(i => `<li>${i}</li>`).join("")}</ul></div>`).join("") +
    `<p class="thanks">Thank you for being a responsible and kind CampusConnect user! ♥</p>`);
}
function openRoleSheet() {
  const mine = roleOfUser(me());
  const box = k => { const R = ROLE[k]; return `<div class="rcard ${k}"><div class="rhead"><span class="roleic sm">${R.icon}</span><div class="grow"><b>${R.level}</b><div class="muted s">(${R.range})</div></div><span class="rpill ${k}">${R.name}${mine === k ? " ✔" : ""}</span></div>${checks(R, true)}</div>`; };
  openSheet(`<h2 class="sh">Your Role in CampusConnect</h2><p class="muted s">Your role is set by the grade level on your school ID.${mine ? " You are a <b>" + ROLE[mine].name + "</b>." : ""}</p>${box("buyer")}${box("seller")}<button class="btn primary" data-close>Got it!</button>`);
}
function openPw() {
  openSheet(`<h2 class="sh">Password &amp; Login</h2><p class="muted s">Change your password.</p>
    <div class="field"><input id="pwOld" type="password" placeholder="Current password"></div>
    <div class="field"><input id="pwNew" type="password" placeholder="New password (8+ characters, letters and numbers)"></div>
    <div class="field"><input id="pwCf" type="password" placeholder="Confirm new password"></div>
    <small class="err" id="pwErr"></small><button class="btn primary" id="pwSave">Update Password</button>`);
}
const SUPPORT_EMAIL = "campusconnect.sphns.system@gmail.com";
function sendHelp() {
  const box = $("#hsMsg"), msg = box.value.trim();
  if (msg.length < 10) return void ($("#hsErr").textContent = "Please describe your concern (at least 10 characters).");
  $("#hsErr").textContent = "";
  const u = me() || {};
  const body = msg + "\n\n---\nName: " + (u.name || "") + "\nUsername: " + (u.username ? "@" + u.username : "") +
    "\nGrade: " + (u.grade || "") + (u.section ? " – " + u.section : "") + "\nSent from CampusConnect";
  location.href = "mailto:" + SUPPORT_EMAIL + "?subject=" + encodeURIComponent("CampusConnect Help & Support") + "&body=" + encodeURIComponent(body);
  closeSheet(); toast("Opening your email app…");
}
function savePw() {
  const u = accounts.find(a => a.id === session);
  const err = $("#pwOld").value !== u.password ? "Current password is incorrect." : !($("#pwNew").value.length >= 8 && /[A-Za-z]/.test($("#pwNew").value) && /\d/.test($("#pwNew").value)) ? "Use 8+ characters with letters and numbers." : $("#pwNew").value !== $("#pwCf").value ? "Passwords do not match." : "";
  if (err) return void ($("#pwErr").textContent = err);
  u.password = $("#pwNew").value; save("cc_accounts", accounts); closeSheet(); toast("Password updated.");
}
document.addEventListener("click", e => {
  if (e.target.closest("[data-close]")) closeSheet();
  if (e.target.closest("[data-rules]")) openRules();
  if (e.target.closest("#adSave")) saveAddr();
  if (e.target.closest("#pwSave")) savePw();
  if (e.target.closest("#hsSend")) sendHelp();
});

/* ---------- SETTINGS ---------- */
const prefs = load("cc_prefs", { msgs: true, orders: true, deals: false, showGrade: true, showActive: true });
const toggles = l => l.map(([k, t]) => `<label class="tg"><span>${t}</span><input type="checkbox" data-pref="${k}" ${prefs[k] ? "checked" : ""}><i></i></label>`).join("");
document.addEventListener("change", e => { const k = e.target.dataset && e.target.dataset.pref; if (k) { prefs[k] = e.target.checked; save("cc_prefs", prefs); } });
let editFrom = "profile", ePhotoData = null;
$("#settings").addEventListener("click", e => {
  const r = e.target.closest("[data-set]"); if (!r) return; const k = r.dataset.set;
  if (k === "account") { editFrom = "settings"; ePhotoData = null; go("editprofile"); }
  else if (k === "role") openRoleSheet();
  else if (k === "privacy") openSheet(`<h2 class="sh">Privacy &amp; Security</h2><p class="muted s">Control who sees what.</p>${toggles([["showGrade", "Show my grade level to buyers"], ["showActive", "Show when I was last active"]])}<p class="muted s" style="margin-top:12px">Your name, contact number, and address are kept private.</p>`);
  else if (k === "notif") openSheet(`<h2 class="sh">Notifications</h2><p class="muted s">Choose what you want to be notified about.</p>${toggles([["msgs", "New messages"], ["orders", "Order updates"], ["deals", "Student deals &amp; price drops"]])}`);
  else if (k === "password") openPw();
  else if (k === "safety") openRules();
  else if (k === "help") openSheet(`<h2 class="sh">Help &amp; Support</h2><p class="muted s">Having a problem with an order, a seller, or your account? Tell your class adviser or the school office and include your username and what happened. Use ⋯ in a chat to review the Safety &amp; Rules.</p><div class="field" style="margin-top:12px"><textarea id="hsMsg" rows="4" maxlength="1000" placeholder="Type your concern here… (what happened, which order or seller)"></textarea></div><small class="err" id="hsErr"></small><button class="btn primary" id="hsSend">✉️ Send to Support</button><p class="muted s" style="margin-top:10px">Opens your email app with your message ready to send to <b style="word-break:break-all">campusconnect.sphns.system@gmail.com</b>.</p>`);
  else if (k === "about") openSheet(`<h2 class="sh">About CampusConnect</h2><p class="muted s">Version 1.0 — a student marketplace for San Pedro National High School. By using the app you agree to follow the Safety &amp; Rules.</p>`);
  else if (k === "logout") doLogout();
});
$("#sBack").onclick = () => go("profile");
$("#pMore").onclick = () => go("settings");
$("#cartBtn").onclick = () => { ptab = "orders"; renderProfile(); };

/* ---------- EDIT PROFILE ---------- */
const uname = a => a.username || a.id.split("@")[0].replace(/[^a-z0-9._]/gi, "").slice(0, 20);
const maskEmail = id => isEmail(id) ? id.replace(/^(.{1,3}).*(@.*)$/, (m, a, b) => a + "••••••••" + b) : "No school email added";
const setAvatar = (el, u) => { el.innerHTML = u.avatar ? `<img src="${u.avatar}" alt="">` : "🏪"; };
function shrink(file, max, cb) {
  const r = new FileReader();
  r.onload = () => { const im = new Image(); im.onload = () => { const s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = im.width * s; c.height = im.height * s; c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); cb(c.toDataURL("image/jpeg", .8)); }; im.src = r.result; };
  r.readAsDataURL(file);
}
function renderEdit() {
  const u = accounts.find(a => a.id === session); if (!u) return;
  setAvatar($("#eAv"), ePhotoData ? { avatar: ePhotoData } : u);
  $("#eName").value = u.name; $("#eUser").value = uname(u); $("#eGrade").value = u.grade || ""; $("#eGrade").disabled = true; $("#eSec").value = u.section || "";
  $("#eMail").value = maskEmail(u.id); $("#eBio").value = u.bio || ""; $("#eCount").textContent = ($("#eBio").value || "").length;
}
$("#editBtn").onclick = () => { editFrom = "profile"; ePhotoData = null; go("editprofile"); };
const leaveEdit = () => go(editFrom);
$("#eBack").onclick = leaveEdit; $("#eCancel").onclick = leaveEdit;
$("#eBio").addEventListener("input", e => { $("#eCount").textContent = e.target.value.length; });
$("#ePhoto").addEventListener("change", e => { const f = e.target.files[0]; if (f) shrink(f, 240, d => { ePhotoData = d; setAvatar($("#eAv"), { avatar: d }); }); });
$("#editForm").addEventListener("submit", e => {
  e.preventDefault();
  const n = $("#eName"), us = $("#eUser"), un = us.value.trim().replace(/^@/, "");
  let ok = setErr(n, n.value.trim().length >= 3 ? "" : "Enter your full name.");
  ok = setErr(us, !/^[a-z0-9._]{3,20}$/i.test(un) ? "3–20 letters, numbers, dots or underscores." : accounts.some(a => a.id !== session && uname(a).toLowerCase() === un.toLowerCase()) ? "That username is taken." : "") && ok;
  if (!ok) return;
  const u = accounts.find(a => a.id === session);
  Object.assign(u, { name: n.value.trim(), username: un, section: $("#eSec").value, bio: $("#eBio").value.trim() });
  if (ePhotoData) u.avatar = ePhotoData;
  save("cc_accounts", accounts); toast("Profile updated."); go("profile");
});

/* ---------- CHAT ---------- */
let chats = load("cc_chats", {}), chatKey = "", pending = null, chatFrom = "messages";
const hhmm = () => new Date().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
const snap = p => ({ pid: p.id, name: p.name, price: p.price, old: oldPrice(p), emoji: p.emoji || "🛍️", bg: p.bg || "#dbe9ff", cat: p.cat });
function openChat(seller, p, from) { chatKey = seller; pending = p ? snap(p) : null; chatFrom = from || "messages"; $("#cAttach").classList.add("hidden"); go("chat"); renderChat(); }
function pushMsg(m, key = chatKey) { (chats[key] = chats[key] || []).push({ ...m, t: hhmm() }); save("cc_chats", chats); }
const prodCard = m => `<div class="mini" style="background:${m.bg};width:52px;height:52px;font-size:26px">${m.emoji}</div><div class="grow"><b>${esc(m.name)}</b><div class="muted s">${esc(m.cat || "")}</div><div><b>${peso(m.price)}</b> <s class="muted s">${peso(m.old)}</s></div></div>`;
function msgHTML(m) {
  const body = m.type === "image" ? `<img src="${m.img}" alt="Photo">` : m.type === "product" ? `<div class="mcard">${prodCard(m)}</div>` : m.type === "order" ? `🧾 <b>Order</b><br>${esc(m.name)} · ${peso(m.total)}` : esc(m.text);
  return `<div class="msg ${m.from}">${body}<small>${m.t}</small></div>`;
}
function renderChat() {
  $("#cName").textContent = chatKey; $("#cAv").textContent = chatKey.slice(0, 2).toUpperCase();
  const l = chats[chatKey] || [];
  $("#cMsgs").innerHTML = l.length ? l.map(msgHTML).join("") : `<div class="empty">👋<br>Say hi to ${esc(chatKey)}!</div>`;
  $("#cPending").classList.toggle("hidden", !pending);
  if (pending) $("#cPending").innerHTML = `<button class="px" data-pclose aria-label="Remove">✕</button>${prodCard(pending)}<button class="send" id="cSendP">Send</button>`;
  window.scrollTo(0, document.body.scrollHeight);
}
function autoReply(key) {
  const n = (chats[key] || []).filter(m => m.from === "them").length;
  setTimeout(() => { pushMsg({ from: "them", type: "text", text: n ? "Sure! We can meet at school during break time. 👍" : "Hi! Thanks for messaging 😊 Yes, it's still available." }, key); if (curView === "chat" && chatKey === key) renderChat(); }, 1200);
}
function sendText() {
  const t = $("#cText"), v = t.value.trim(); if (!v) return;
  pushMsg({ from: "me", type: "text", text: v }); t.value = ""; $("#cSend").classList.add("hidden"); $("#cPlus").classList.remove("hidden");
  renderChat(); autoReply(chatKey);
}
const EMOJIS = ["😊", "👍", "🙏", "😍", "🎉"]; let ei = 0;
$("#cText").addEventListener("input", e => { const has = !!e.target.value.trim(); $("#cSend").classList.toggle("hidden", !has); $("#cPlus").classList.toggle("hidden", has); });
$("#cText").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); sendText(); } });
$("#cSend").onclick = sendText;
$("#cEmoji").onclick = () => { const t = $("#cText"); t.value += EMOJIS[ei++ % EMOJIS.length]; t.dispatchEvent(new Event("input")); t.focus(); };
$("#cPlus").onclick = () => $("#cAttach").classList.toggle("hidden");
$("#cBack").onclick = () => { if (chatFrom === "detail" && cur) { go("detail"); renderDetail(); } else go("messages"); };
$("#cFile").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) shrink(f, 600, d => { pushMsg({ from: "me", type: "image", img: d }); renderChat(); autoReply(chatKey); }); });
$("#chat").addEventListener("click", e => {
  let el;
  if (e.target.closest("[data-pclose]")) { pending = null; renderChat(); }
  else if (e.target.closest("#cSendP")) { pushMsg({ from: "me", type: "product", ...pending }); pending = null; renderChat(); autoReply(chatKey); }
  else if ((el = e.target.closest("[data-att]"))) {
    const k = el.dataset.att;
    if (k === "photo") $("#cFile").click();
    else if (k === "video") toast("Video sharing is coming soon.");
    else if (k === "order") { const o = orders[0]; if (!o) return toast("You have no orders yet."); pushMsg({ from: "me", type: "order", name: o.name, total: o.total }); renderChat(); autoReply(chatKey); }
    else if (k === "product") { if (!pending && cur) pending = snap(cur.p); if (!pending) return toast("Open a product and tap Chat to share it."); renderChat(); }
    $("#cAttach").classList.add("hidden");
  }
});
function renderChatList() {
  const keys = Object.keys(chats).filter(k => chats[k].length);
  $("#chatList").innerHTML = keys.length ? keys.map(k => {
    const m = chats[k][chats[k].length - 1], pv = m.type === "text" ? m.text : m.type === "image" ? "📷 Photo" : m.type === "order" ? "🧾 Order" : "🛍️ " + m.name;
    return `<button class="conv" data-chat="${esc(k)}"><div class="av2">${esc(k.slice(0, 2).toUpperCase())}</div><div class="grow"><b>${esc(k)}</b><div class="muted s">${m.from === "me" ? "You: " : ""}${esc(pv)}</div></div><span class="muted s">${m.t}</span></button>`;
  }).join("") : `<div class="empty">💬<br>No messages yet.<br>Tap a product to chat with the seller.</div>`;
}
$("#messages").addEventListener("click", e => { const c = e.target.closest("[data-chat]"); if (c) openChat(c.dataset.chat, null, "messages"); });

/* ---------- start ---------- */
go(session && me() ? "home" : "auth");