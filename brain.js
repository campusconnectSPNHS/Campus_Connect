const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const icon = name => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const initial = name => String(name || "?").trim().charAt(0).toUpperCase();
const initials = name => String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase()).join("");
$$(".logo img").forEach(img => {
  const hide = () => img.remove();
  if (img.complete && img.naturalWidth === 0)
    hide();
  else
    img.addEventListener("error", hide);
});
const load = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? d;
  }
  catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  }
  catch (e) {
    toast("Couldn't save data (" + e.name + "). Check that you're not in private mode.");
    return false;
  }
};
const db = window.supabaseClient;
let accounts = [];
const toAcct = p => ({
  id: p.id, lrn: p.lrn, name: p.name, username: p.username, email: p.email, grade: p.grade,
  strand: p.strand || "", role: p.role, section: p.section || "", bio: p.bio || "", avatar: p.avatar || "", verified: true
});
async function startSession(uid) {
  session = uid;
  const { data } = await db.from("profiles").select("*").eq("id", uid).maybeSingle();
  accounts = data ? [toAcct(data)] : [];
  await loadProducts();
}
async function loadProducts() {
  const { data, error } = await db.from("products").select("*").order("created_at", { ascending: false });
  if (error)
    return toast("Couldn't load products.");
  myItems = data.map(p => ({
    id: p.id, owner: p.owner, seller: p.seller_name, name: p.name, price: p.price, cat: p.cat, desc: p.descr || "", photo: p.photo_url || ""
  }));
  if (curView === "home" || curView === "favorites")
    renderGrid();
  if (curView === "profile")
    renderProfile();
}
let session = null;
let myItems = [];
let favs = load("cc_favs", []);
let category = "All", query = "", photoData = "";
const AUTH_VIEWS = ["auth", "scan", "verify", "idinfo", "role", "create", "welcome", "signup"];
function go(view) {
  if (!session && !AUTH_VIEWS.includes(view))
    view = "auth";
  if (view === "sell" && !isSeller()) {
    toast("Only Senior High School students (Grade 11–12) can sell.");
    view = lastMain || "home";
  }
  curView = view;
  if (["home", "favorites", "messages", "profile"].includes(view))
    lastMain = view;
  $$(".screen").forEach(s => s.classList.add("hidden"));
  const screenId = view === "favorites" ? "home" : view;
  $("#" + screenId).classList.remove("hidden");
  $("#nav").classList.toggle("hidden", [...AUTH_VIEWS, "sell", "detail", "buy", "orders", "orderdetail", "notifications", "notifdetail", "notifsettings", "settings", "editprofile", "chat"].includes(view));
  const sb = $("#nav .sellbtn");
  if (sb)
    sb.classList.toggle("hidden", !isSeller());
  $$("#nav button").forEach(b => b.classList.toggle("on", b.dataset.go === view));
  if (view === "home" || view === "favorites") {
    const fav = view === "favorites";
    $("#homeTitle").textContent = fav ? "Your favorites" : "Today's picks";
    $("#homeSub").textContent = fav ? "Products you saved." : "Discover products from your fellow students.";
    $("#home").dataset.view = view;
    renderGrid();
  }
  if (view === "profile")
    renderProfile();
  if (view === "messages")
    renderChatList();
  if (view === "orders")
    $("#ordersList").innerHTML = ordersHTML();
  if (view === "notifications")
    renderNotifs();
  if (view === "notifsettings")
    renderNotifSettings();
  if (view === "editprofile")
    renderEdit();
  updateNotifBadge();
  updateCartBadge();
  window.scrollTo(0, 0);
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-go]");
  if (b)
    go(b.dataset.go);
});
let tt;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove("show"), 2200);
}
const setErr = (input, msg) => {
  const f = input.closest(".field");
  f.classList.toggle("bad", !!msg);
  $(".err", f).textContent = msg || "";
  return !msg;
};
const isLRN = v => /^\d{12}$/.test(v);
const isStudentId = v => /^[A-Za-z0-9-]{5,20}$/.test(v);
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
// Students no longer type an email. Supabase Auth still needs one, so we build a
// private placeholder from the LRN. It is never shown and never receives mail.
const AUTH_DOMAIN = "campusconnectspnhs.github.io";
const authEmail = lrn => String(lrn).toLowerCase().replace(/[^a-z0-9._-]/g, "") + "@" + AUTH_DOMAIN;
const isAuthEmail = v => String(v || "").toLowerCase().endsWith("@" + AUTH_DOMAIN);
const gradeNum = g => +String(g).replace(/\D/g, "");
const roleFor = g => gradeNum(g) >= 11 ? "seller" : "buyer";
const me = () => accounts.find(a => a.id === session);
const roleOfUser = u => (u && u.role) || "seller";
const isSeller = () => roleOfUser(me()) === "seller";
const STRANDS = ["STEM", "ABM", "HUMSS", "GAS", "TVL"];
const ROLE = {
  buyer: {
    icon: "cart", name: "Buyer", level: "Junior High School", range: "Grade 7 – 10",
    can: ["You can browse and buy products from other students.", "You can chat with sellers.", "You can save and favorite items."], cant: "You cannot post or sell products."
  },
  seller: {
    icon: "store", name: "Seller / Buyer", level: "Senior High School", range: "Grade 11 – 12",
    can: ["You can post and sell products.", "You can also buy products.", "You can chat with other users.", "You can manage your listings."]
  },
};
let reg = {}, vTimer, signupDraft = null;
$$(".eye").forEach(b => b.onclick = () => {
  const i = $("#" + b.dataset.eye);
  i.type = i.type === "password" ? "text" : "password";
});
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("#studentId"), pw = $("#password");
  const idv = id.value.trim().toLowerCase().replace(/^@/, "");
  let ok = setErr(id, idv ? "" : "Enter your LRN or username.");
  ok = setErr(pw, pw.value ? "" : "Enter your password.") && ok;
  if (!ok)
    return;
  const { data: email } = await db.rpc("email_for_login", { identifier: idv });
  if (!email) {
    console.warn("[login] no account found for", idv);
    return void setErr(pw, "Wrong ID/username or password.");
  }
  const { data, error } = await db.auth.signInWithPassword({ email, password: pw.value });
  if (error) {
    console.warn("[login]", error.message);
    return void setErr(pw, /confirm/i.test(error.message) ? "Your account isn't confirmed yet. Please contact the CampusConnect admin." : "Wrong ID/username or password.");
  }
  await startSession(data.user.id);
  toast("Welcome back, " + (me() ? me().name.split(" ")[0] : "") + "!");
  e.target.reset();
  go("home");
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const setStep = (i, st) => {
  const li = $$("#vSteps li")[i];
  if (li)
    li.className = st;
};
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
  "not-enrolled": "This LRN isn't in the school's student list. Retake the photo so the LRN is clear, or ask your class adviser to check your record.",
};
const FAIL_STEP = {
  "not-school": 1, unclear: 1, "wrong-year": 1, incomplete: 2
};
// Checks the LRN against the "students" table in Supabase (see students_setup.sql).
// Returns the student {name, grade, strand}, null if the LRN is not on the list,
// or undefined if the check is off (empty table) or couldn't run.
const lookupStudent = async lrn => {
  try {
    const { data, error } = await db.rpc("student_check", { p_lrn: String(lrn) });
    if (error || !data || !data.enforced)
      return undefined;
    return data.student || null;
  }
  catch {
    return undefined;
  }
};
function scanFail(code) {
  const m = $("#scanErr");
  m.textContent = SCAN_MSG[code] || "Something went wrong while reading the ID. Please try again.";
  m.classList.remove("hidden");
  go("scan");
}
let scanBusy = false;
$("#startScan").onclick = () => {
  setScanMode("signup");
  signupDraft = null;
  reg = {};
  $("#scanErr").classList.add("hidden");
  go("scan");
};
$("#idPhoto").addEventListener("change", e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (f)
    scanFile(f);
});
async function scanFile(f) {
  if (!f || scanBusy)
    return;
  scanBusy = true;
  $("#scanErr").classList.add("hidden");
  if (!window.IDReader) {
    scanBusy = false;
    return scanFail("no-reader");
  }
  $$("#vSteps li").forEach(x => x.className = "");
  setStep(0, "load");
  $("#vNote").textContent = "This can take a few seconds.";
  go("verify");
  try {
    const r = await IDReader.read(f, msg => {
      $("#vNote").textContent = msg;
    });
    setStep(0, "done");
    setStep(1, "load");
    await sleep(350);
    if (!r.ok) {
      setStep(FAIL_STEP[r.reason] || 1, "fail");
      await sleep(700);
      return scanFail(r.reason);
    }
    const stu = await lookupStudent(r.lrn);
    if (stu === null) {
      setStep(1, "fail");
      await sleep(700);
      return scanFail("not-enrolled");
    }
    if (stu) {
      r.name = stu.name;
      r.grade = stu.grade;
      r.strand = gradeNum(stu.grade) >= 11 ? (stu.strand || "") : "";
    }
    if (scanMode === "reset" && r.lrn !== resetId) {
      setStep(1, "fail");
      await sleep(700);
      return scanFail("id-mismatch");
    }
    setStep(1, "done");
    setStep(2, "load");
    await sleep(350);
    setStep(2, "done");
    setStep(3, "load");
    await sleep(350);
    setStep(3, "done");
    await sleep(300);
    if (scanMode === "reset") {
      resetOk = resetId;
      setScanMode("signup");
      go("auth");
      return openResetPw();
    }
    reg = {
      name: r.name, id: r.lrn, grade: r.grade, strand: r.strand, role: roleFor(r.grade)
    };
    prepIdForm();
    go("idinfo");
  }
  catch (err) {
    scanFail(err && err.message === "reader-load" ? "reader-load" : "error");
  }
  finally {
    scanBusy = false;
  }
}
let camStream = null, camFacing = "environment";
function camStop() {
  if (camStream)
    camStream.getTracks().forEach(t => t.stop());
  camStream = null;
  $("#camVideo").srcObject = null;
}
function camClose() {
  camStop();
  $("#cam").classList.add("hidden");
}
async function camStart() {
  camStop();
  camStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: camFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
  const v = $("#camVideo");
  v.srcObject = camStream;
  await v.play().catch(() => { });
}
$("#camOpen").onclick = async () => {
  reg = {};
  $("#scanErr").classList.add("hidden");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
    return scanFail("cam-none");
  try {
    $("#cam").classList.remove("hidden");
    await camStart();
  }
  catch (err) {
    camClose();
    scanFail(err && err.name === "NotAllowedError" ? "cam-denied" : "cam-none");
  }
};
$("#camClose").onclick = camClose;
$("#camFlip").onclick = async () => {
  camFacing = camFacing === "environment" ? "user" : "environment";
  try {
    await camStart();
  }
  catch {
    camFacing = camFacing === "environment" ? "user" : "environment";
    try {
      await camStart();
    }
    catch { }
  }
};
$("#camShot").onclick = () => {
  const v = $("#camVideo");
  if (!v.videoWidth)
    return;
  const c = document.createElement("canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  c.toBlob(b => {
    camClose();
    if (b)
      scanFile(new File([b], "id.jpg", { type: "image/jpeg" }));
  }, "image/jpeg", 0.92);
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden)
    camClose();
});
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
  if (err)
    return void ($("#fpErr").textContent = err);
  resetId = a.id;
  resetOk = "";
  closeSheet();
  setScanMode("reset");
  $("#scanErr").classList.add("hidden");
  go("scan");
}
function openResetPw() {
  openSheet(`<h2 class="sh">Set a new password</h2><p class="muted s">ID verified. Choose a new password for your account.</p>
  <div class="field" style="margin-top:12px"><input id="rpNew" type="password" placeholder="New password (8+ characters, letters and numbers)" autocomplete="new-password"></div>
  <div class="field"><input id="rpCf" type="password" placeholder="Confirm new password" autocomplete="new-password"></div>
  <small class="err" id="rpErr"></small><button class="btn primary" id="rpSave">Reset Password</button>`);
}
function saveResetPw() {
  const u = accounts.find(a => a.id === resetOk), p = $("#rpNew").value;
  const err = !u ? "Verification expired. Please start again." : !(p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p)) ? "Use 8+ characters with letters and numbers." : p !== $("#rpCf").value ? "Passwords do not match." : "";
  if (err)
    return void ($("#rpErr").textContent = err);
  u.password = p;
  save("cc_accounts", accounts);
  resetId = resetOk = "";
  closeSheet();
  $("#studentId").value = u.id;
  $("#password").value = "";
  toast("Password reset. You can log in now.");
}
document.addEventListener("click", e => {
  if (e.target.closest("#forgotBtn"))
    openForgot();
  else if (e.target.closest("#fpNext"))
    forgotNext();
  else if (e.target.closest("#rpSave"))
    saveResetPw();
});
// One combined field: "Grade 7" ... "Grade 10", or "Grade 11 - STEM" etc.
// The option value is "Grade 11|STEM" (grade and strand separated by "|").
const GRADES = ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
const gsOpt = (g, st) => `<option value="${g}${st ? "|" + st : ""}">${g}${st ? " – " + st : ""}</option>`;
const allGradeOptions = () => `<option value="">Select grade level</option>${GRADES.map(g => gradeNum(g) >= 11 ? STRANDS.map(st => gsOpt(g, st)).join("") : gsOpt(g)).join("")}`;
function prepIdForm() {
  const sel = $("#iGrade");
  $("#iName").value = reg.name || (signupDraft ? signupDraft.first + " " + signupDraft.last : "");
  $("#iSid").value = reg.id || "";
  $("#iSid").readOnly = true;
  if (!reg.grade) {
    sel.innerHTML = allGradeOptions();
    sel.disabled = false;
  }
  else if (gradeNum(reg.grade) < 11) {
    sel.innerHTML = gsOpt(reg.grade);
    sel.disabled = true;
  }
  else if (reg.strand) {
    sel.innerHTML = gsOpt(reg.grade, reg.strand);
    sel.disabled = true;
  }
  else {
    // Senior High but the strand wasn't read from the ID: let the student pick it.
    sel.innerHTML = `<option value="">Select your strand</option>${STRANDS.map(st => gsOpt(reg.grade, st)).join("")}`;
    sel.disabled = false;
  }
  if (sel.options.length === 1)
    sel.selectedIndex = 0;
  $$("#idForm .err").forEach(x => x.textContent = "");
  $$("#idForm .field").forEach(x => x.classList.remove("bad"));
}
$("#idForm").addEventListener("submit", e => {
  e.preventDefault();
  const n = $("#iName"), s = $("#iSid"), g = $("#iGrade"), sid = s.value.trim().toLowerCase();
  const [grade, strand = ""] = g.value.split("|");
  const shs = gradeNum(grade) >= 11;
  let ok = setErr(n, n.value.trim().length >= 3 ? "" : "Enter your full name.");
  ok = setErr(s, !sid ? "Enter your student ID." : !(isLRN(sid) || isStudentId(sid)) ? "Use your student ID or 12-digit LRN." :
    accounts.some(a => a.id === sid) ? "This ID already has an account. Please log in." : "") && ok;
  ok = setErr(g, !grade ? "Select your grade level." : shs && !strand ? "Select your strand." : "") && ok;
  if (!ok)
    return;
  reg = {
    name: n.value.trim(), id: sid, grade, strand: shs ? strand : "", role: roleFor(grade)
  };
  renderRole();
  go("role");
});
const checks = (R, withCant) => `<ul class="checks">${R.can.map(t => `<li>${t}</li>`).join("")}${withCant && R.cant ? `<li class="no">${R.cant}</li>` : ""}</ul>`;
function renderRole() {
  const R = ROLE[reg.role];
  $("#roleBody").innerHTML = `<div class="rolebox ${reg.role}"><div class="roleic">${icon(R.icon)}</div><b class="rname">${R.name}</b><div>${R.level}<br>(${R.range})</div></div>${checks(R, true)}`;
}
$("#roleNext").onclick = () => {
  if (signupDraft)
    return finishSignup();
  $("#createForm").reset();
  $$("#pwHints li").forEach(l => l.classList.remove("ok"));
  go("create");
};
$("#cPw").addEventListener("input", e => {
  const v = e.target.value;
  $('#pwHints [data-h="len"]').classList.toggle("ok", v.length >= 8);
  $('#pwHints [data-h="mix"]').classList.toggle("ok", /[A-Za-z]/.test(v) && /\d/.test(v));
});
$("#createForm").addEventListener("submit", async e => {
  e.preventDefault();
  const u = $("#cUser"), pw = $("#cPw"), cf = $("#cCf"), un = u.value.trim().replace(/^@/, "");
  let ok = setErr(u, !/^[a-z0-9._]{3,20}$/i.test(un) ? "3–20 letters, numbers, dots or underscores." :
    accounts.some(a => uname(a).toLowerCase() === un.toLowerCase()) ? "That username is taken." : "");
  ok = setErr(pw, pw.value.length >= 8 && /[A-Za-z]/.test(pw.value) && /\d/.test(pw.value) ? "" : "Use 8+ characters with letters and numbers.") && ok;
  ok = setErr(cf, cf.value && cf.value === pw.value ? "" : "Passwords do not match.") && ok;
  if (!ok)
    return;
  if (accounts.some(a => a.id === reg.id)) {
    toast("This ID already has an account. Please log in.");
    return go("auth");
  }
  const form = e.target, btn = form.querySelector("button.primary");
  if (btn)
    btn.disabled = true;
  const created = await enterAccount({
    name: reg.name, id: reg.id, password: pw.value, username: un, grade: reg.grade, strand: reg.strand, role: reg.role, verified: true
  });
  if (btn)
    btn.disabled = false;
  if (created)
    form.reset();
});
async function enterAccount(acct) {
  acct.email = acct.email || authEmail(acct.id);
  const { data, error } = await db.auth.signUp({ email: acct.email, password: acct.password });
  if (error)
    return toast(error.message);
  if (!data.session)
    return toast("Check your email to confirm your account, then log in.");
  const { error: e2 } = await db.from("profiles").insert({
    id: data.user.id, lrn: acct.id, name: acct.name, username: acct.username, email: acct.email,
    grade: acct.grade, strand: acct.strand, role: acct.role
  });
  if (e2) {
    console.error("[signup] profile insert failed", e2);
    await db.auth.signOut();
    return toast(e2.code === "23505" ? "This LRN or username already has an account." : "Couldn't create the account: " + (e2.message || e2.code || "unknown error"));
  }
  await startSession(data.user.id);
  if (acct.role === "seller") {
    $("#welcomeSub").textContent = "Welcome to CampusConnect, " + acct.name.split(" ")[0] + "!";
    $("#welcomeNote").textContent = "Your account is now ready. You can start selling and managing your products within our school.";
    go("welcome");
  }
  else {
    toast("Welcome to CampusConnect, " + acct.name.split(" ")[0] + "!");
    go("home");
  }
  return true;
}
$("#signupForm").addEventListener("submit", e => {
  e.preventDefault();
  const first = $("#sFirst"), last = $("#sLast"), pw = $("#sPw"), cf = $("#sCf"), terms = $("#sTerms");
  let ok = setErr(first, first.value.trim().length >= 2 ? "" : "Enter your first name.");
  ok = setErr(last, last.value.trim().length >= 2 ? "" : "Enter your last name.") && ok;
  ok = setErr(pw, pw.value.length >= 8 && /[A-Za-z]/.test(pw.value) && /\d/.test(pw.value) ? "" : "Use 8+ characters with letters and numbers.") && ok;
  ok = setErr(cf, cf.value && cf.value === pw.value ? "" : "Passwords do not match.") && ok;
  $("#sTermsErr").textContent = terms.checked ? "" : "Please accept the Terms of Use and Privacy Policy.";
  if (!ok || !terms.checked)
    return;
  signupDraft = { first: first.value.trim(), last: last.value.trim(), password: pw.value };
  reg = {};
  setScanMode("signup");
  $("#scanErr").classList.add("hidden");
  e.target.reset();
  toast("Next, verify your school ID.");
  go("scan");
});
function finishSignup() {
  if (accounts.some(a => a.id === reg.id)) {
    signupDraft = null;
    toast("This ID already has an account. Please log in.");
    return go("auth");
  }
  let base = (signupDraft.first + signupDraft.last).replace(/[^a-z0-9._]/gi, "").toLowerCase().slice(0, 16);
  if (base.length < 3)
    base += "user";
  let username = base, n = 1;
  while (accounts.some(a => uname(a).toLowerCase() === username.toLowerCase()))
    username = base + n++;
  const d = signupDraft;
  signupDraft = null;
  enterAccount({
    name: reg.name, id: reg.id, email: authEmail(reg.id), password: d.password, username, grade: reg.grade, strand: reg.strand, role: reg.role, verified: true
  });
}
$("#toStore").onclick = () => {
  ptab = "listings";
  go("profile");
};
const allProducts = () => myItems;
const myListings = () => myItems.filter(p => p.owner === session);
function card(p, mine) {
  const thumb = p.photo
    ? `<div class="thumb img" style="background-image:url(${p.photo})"></div>`
    : `<div class="thumb" style="background:${p.bg || "#dbe9ff"}">${icon("bag")}</div>`;
  return `<article class="prod" data-pid="${p.id}">${thumb}
  ${mine ? '<span class="badge">Active</span><button class="dots" data-del="' + p.id + '" aria-label="Delete listing">⋮</button>'
    : `<button class="heart ${favs.includes(p.id) ? "on" : ""}" data-fav="${p.id}" aria-label="Favorite">${favs.includes(p.id) ? "♥" : "♡"}</button>`}
  <div class="pinfo"><b>${esc(p.name)}</b><div class="price">₱${p.price}</div>
  <div class="seller">${mine ? `${p.sold || 0} sold &nbsp; ♡ ${p.likes || 0}` : `<span class="av">${initial(p.seller || "Student Seller")}</span>${esc(p.seller || "Student Seller")}`}</div></div></article>`;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
function renderGrid() {
  const favView = $("#home").dataset.view === "favorites";
  const list = allProducts().filter(p => (!favView || favs.includes(p.id)) &&
    (category === "All" || p.cat === category) &&
    p.name.toLowerCase().includes(query));
  $("#grid").innerHTML = list.length ? list.map(p => card(p, false)).join("")
    : `<div class="empty">${favView ? "No favorites yet. Tap ♡ on a product." : allProducts().length ? "No products found." : "No products have been posted yet."}</div>`;
}
$("#grid").addEventListener("click", e => {
  const h = e.target.closest("[data-fav]");
  if (!h)
    return;
  const id = +h.dataset.fav;
  favs = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id];
  save("cc_favs", favs);
  renderGrid();
});
$("#chips").addEventListener("click", e => {
  const c = e.target.closest(".chip");
  if (!c)
    return;
  category = c.dataset.cat;
  $$(".chip").forEach(x => x.classList.toggle("on", x === c));
  renderGrid();
});
$("#search").addEventListener("input", e => {
  query = e.target.value.trim().toLowerCase();
  renderGrid();
});
$("#photo").addEventListener("change", e => {
  const f = e.target.files[0];
  if (!f)
    return;
  shrink(f, 800, d => {
    photoData = d;
    $("#preview").src = photoData;
    $("#preview").hidden = false;
    $("#uploadText").hidden = true;
  });
});
$("#sellForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!isSeller())
    return toast("Only Senior High School students (Grade 11–12) can sell.");
  const n = $("#pName"), p = $("#pPrice"), c = $("#pCat");
  let ok = true;
  ok = setErr(n, n.value.trim() ? "" : "Enter a product name.") && ok;
  ok = setErr(p, +p.value > 0 ? "" : "Enter a price greater than 0.") && ok;
  ok = setErr(c, c.value ? "" : "Choose a category.") && ok;
  if (/\b(vape|cigarettes?|alcohol|beer|guns?|knife|knives|weapons?|explosives?|drugs?|answer\s*keys?|fake\s*(id|documents?))\b/i.test(n.value + " " + $("#pDesc").value))
    return void setErr(n, "This item isn't allowed. See Safety & Rules.");
  if (!ok)
    return;
  let photo_url = null;
  if (photoData) {
    const blob = await (await fetch(photoData)).blob();
    const path = session + "/" + Date.now() + ".jpg";
    const up = await db.storage.from("product-photos").upload(path, blob, { contentType: "image/jpeg" });
    if (up.error)
      return toast("Couldn't upload the photo.");
    photo_url = db.storage.from("product-photos").getPublicUrl(path).data.publicUrl;
  }
  const { error } = await db.from("products").insert({
    seller_name: me().name, name: n.value.trim(), price: Math.round(+p.value), cat: c.value, descr: $("#pDesc").value.trim(), photo_url
  });
  if (error) {
    console.error("[product] insert failed", error);
    return toast("Couldn't post the product: " + (error.message || error.code || "unknown error"));
  }
  await loadProducts();
  e.target.reset();
  photoData = "";
  $("#preview").hidden = true;
  $("#uploadText").hidden = false;
  toast("Product posted!");
  go("profile");
});
function renderProfile() {
  const u = me(), seller = isSeller();
  if (u) {
    $("#pfName").textContent = u.name;
    setAvatar($("#pfAv"), u);
    $("#pfSub").textContent = u.grade ? u.grade + (u.strand ? " · " + u.strand : "") : "Student";
    $("#pfRole").textContent = ROLE[roleOfUser(u)].name;
  }
  $$(".ptab[data-tab=listings]").forEach(b => b.classList.toggle("hidden", !seller));
  $(".ptabs").style.setProperty("--n", seller ? 4 : 3);
  if (!seller && ptab === "listings")
    ptab = "favorites";
  $("#stLabel").textContent = seller ? "Listings" : "Orders";
  $("#stListings").textContent = seller ? myListings().length : orders.length;
  $("#stFollowers").textContent = social.followers.length;
  $("#stFollowing").textContent = social.following.length;
  $("#stRev").textContent = received.length;
  updateCartBadge();
  renderTab();
}
let ptab = "listings";
function renderTab() {
  const T = {
    listings: "My Listings", favorites: "Favorites", orders: "Orders", settings: "Settings"
  };
  const isSocial = SOCIAL_VIEWS.includes(ptab);
  $("#tabPane").classList.toggle("hidden", isSocial);
  $("#socialPane").classList.toggle("hidden", !isSocial);
  $$(".stat").forEach(b => b.classList.toggle("on", b.dataset.stat === statOf(ptab)));
  $$(".ptab").forEach(b => b.classList.toggle("on", b.dataset.tab === ptab));
  if (isSocial)
    return renderSocial();
  $("#tabTitle").textContent = T[ptab];
  $("#addBtn").classList.toggle("hidden", ptab !== "listings");
  const g = $("#myGrid");
  if (ptab === "listings")
    g.innerHTML = myListings().length ? myListings().map(p => card(p, true)).join("")
      : `<div class="empty">No listings yet.<br>Tap “Add New Product” to start selling.</div>`;
  else if (ptab === "favorites") {
    const l = allProducts().filter(p => favs.includes(p.id));
    g.innerHTML = l.length ? l.map(p => card(p, false)).join("") : `<div class="empty">No favorites yet.</div>`;
  }
  else if (ptab === "orders")
    g.innerHTML = ordersHTML();
  else
    g.innerHTML = `<div class="empty">Settings coming soon.</div>`;
}
const SOCIAL_VIEWS = ["followers", "following", "reviews"];
const EMPTY_SOCIAL = { followers: [], requests: [], following: [] };
const SAMPLE_REVIEWS = [
  { name: "Alyssa M.", text: "Great quality and exactly as described." },
  { name: "Joaquin T.", text: "Friendly seller and easy to meet on campus." },
  { name: "Bianca L.", text: "Fast reply and fair price. Recommended." }
];
localStorage.removeItem("cc_social");
let social = load("cc_follows", EMPTY_SOCIAL);
let received = load("cc_received", []);
let fQuery = "", fLevel = "all", showRequests = true;

const levelOf = p => (p.grade >= 11 ? "SHS" : "JHS");
const personRow = (p, action) => `
  <div class="person">
    <span class="pav">${esc(initials(p.name))}</span>
    <div class="grow"><b>${esc(p.name)}</b><span>Grade ${p.grade} · ${levelOf(p)}</span></div>
    ${action}
  </div>`;
const socialHead = (n, label, iconName) => `
  <div class="card sochead">
    <span class="sico">${icon(iconName)}</span>
    <div class="grow"><b>${n}</b><div class="muted s">${label}</div></div>
  </div>`;

function statOf(view) {
  return view === "listings" || view === "orders" ? "listings" : SOCIAL_VIEWS.includes(view) ? view : "";
}
function followerListHTML() {
  const q = fQuery.trim().toLowerCase();
  const followingIds = social.following.map(p => p.id);
  const rows = social.followers
    .filter(p => p.name.toLowerCase().includes(q) && (fLevel === "all" || levelOf(p) === fLevel))
    .map(p => personRow(p, followingIds.includes(p.id)
      ? `<button class="pbtn soft" data-act="follow" data-id="${p.id}">Following</button>`
      : `<button class="pbtn blue" data-act="follow" data-id="${p.id}">Follow</button>`));
  return rows.join("") || `<div class="empty">No followers found.</div>`;
}
function requestsHTML() {
  const rows = social.requests.map(p => personRow(p,
    `<button class="pbtn blue" data-act="confirm" data-id="${p.id}">Confirm</button>
     <button class="pbtn" data-act="decline" data-id="${p.id}">Decline</button>`)).join("");
  return `
  <div class="card reqbox">
    <div class="reqhead">
      <span class="grow">FOLLOW REQUESTS</span>
      <span class="count">${social.requests.length} Pending</span>
      <button class="pbtn soft" data-act="confirm-all">Confirm All</button>
    </div>
    ${rows}
  </div>`;
}
function followersHTML() {
  const levels = [["all", "All"], ["SHS", "SHS"], ["JHS", "JHS"]];
  return `
  <div class="card sochead">
    <span class="sico">${icon("users")}</span>
    <div class="grow"><b>${social.followers.length}</b><div class="muted s">Followers</div></div>
    <button class="pbtn soft" data-act="toggle-requests">Requests <span class="count">${social.requests.length}</span></button>
  </div>
  ${showRequests && social.requests.length ? requestsHTML() : ""}
  ${social.followers.length ? `
  <input id="fSearch" class="sosearch" placeholder="Search followers..." value="${esc(fQuery)}">
  <div class="seg">${levels.map(([v, t]) => `<button data-act="level" data-level="${v}" class="${fLevel === v ? "on" : ""}">${t}</button>`).join("")}</div>
  <div id="fList">${followerListHTML()}</div>` : `
  <div class="empty">No followers yet.<br>When students follow you, they will appear here.</div>`}`;
}
function followingHTML() {
  const rows = social.following.map(p => personRow(p,
    `<button class="pbtn" data-act="unfollow" data-id="${p.id}">Unfollow</button>`)).join("");
  return socialHead(social.following.length, "Following Accounts", "badge") +
    (rows || `<div class="empty">You are not following anyone yet.<br>Students you follow will appear here.</div>`);
}
function reviewsHTML() {
  const avg = received.length ? (received.reduce((n, r) => n + r.stars, 0) / received.length).toFixed(1) : "0.0";
  const list = received.map(r => `
    <div class="card revcard">
      <div class="row between"><b>${esc(r.name)}</b><span class="muted s">${esc(r.when)}</span></div>
      <div class="stars">${stars(r.stars)}</div>
      <p class="s">${esc(r.text)}</p>
    </div>`).join("");
  return `
  <div class="card rating">
    <b>${avg}</b>
    <div class="muted s">${received.length ? received.length + " customer reviews" : "No customer reviews received yet"}</div>
    <button class="btn outline sm" data-act="sample-review">Write Sample Review</button>
  </div>
  ${list || `<div class="empty">Reviews from verified student buyers will appear here.</div>`}`;
}
function renderSocial() {
  const views = { followers: followersHTML, following: followingHTML, reviews: reviewsHTML };
  $("#socialPane").innerHTML = views[ptab]();
}
function saveSocial() {
  save("cc_follows", social);
  renderProfile();
}
const takeRequest = id => {
  const p = social.requests.find(r => r.id === id);
  social.requests = social.requests.filter(r => r.id !== id);
  return p;
};
const socialActions = {
  "toggle-requests": () => {
    showRequests = !showRequests;
    renderProfile();
  },
  level: b => {
    fLevel = b.dataset.level;
    renderProfile();
  },
  confirm: b => {
    const p = takeRequest(b.dataset.id);
    if (p)
      social.followers.push(p);
    saveSocial();
  },
  decline: b => {
    takeRequest(b.dataset.id);
    saveSocial();
  },
  "confirm-all": () => {
    social.followers.push(...social.requests);
    social.requests = [];
    saveSocial();
  },
  follow: b => {
    const id = b.dataset.id, already = social.following.some(p => p.id === id);
    if (already)
      social.following = social.following.filter(p => p.id !== id);
    else
      social.following.push(social.followers.find(p => p.id === id));
    saveSocial();
  },
  unfollow: b => {
    social.following = social.following.filter(p => p.id !== b.dataset.id);
    saveSocial();
  },
  "sample-review": () => {
    const s = SAMPLE_REVIEWS[received.length % SAMPLE_REVIEWS.length];
    received.unshift({ ...s, stars: 5, when: "Just now" });
    save("cc_received", received);
    renderProfile();
  }
};
$(".stats").addEventListener("click", e => {
  const b = e.target.closest("[data-stat]");
  if (!b)
    return;
  ptab = b.dataset.stat === "listings" ? (isSeller() ? "listings" : "orders") : b.dataset.stat;
  renderTab();
});
$("#socialPane").addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (b)
    socialActions[b.dataset.act](b);
});
$("#socialPane").addEventListener("input", e => {
  if (e.target.id !== "fSearch")
    return;
  fQuery = e.target.value;
  $("#fList").innerHTML = followerListHTML();
});
$$(".ptab").forEach(b => b.onclick = () => {
  if (b.dataset.tab === "settings")
    return go("settings");
  ptab = b.dataset.tab;
  renderTab();
});
$("#myGrid").addEventListener("click", e => {
  const h = e.target.closest("[data-fav]"), d = e.target.closest("[data-del]");
  if (h) {
    const id = +h.dataset.fav;
    favs = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id];
    save("cc_favs", favs);
    renderProfile();
  }
  if (d && confirm("Delete this listing?")) {
    db.from("products").delete().eq("id", +d.dataset.del).then(async ({ error }) => {
      if (error)
        return toast("Couldn't delete the listing.");
      await loadProducts();
      toast("Listing deleted.");
    });
  }
});
const doLogout = async () => {
  await db.auth.signOut();
  session = null;
  accounts = [];
  myItems = [];
  toast("Logged out.");
  go("auth");
};
let cur = null, curView = "", lastMain = "home", dtab = "overview", rate = 0, writing = false, fbDraft = "";
let orders = load("cc_orders", []), reviews = load("cc_reviews", {}), helped = {};
const peso = n => "₱" + Number(n).toLocaleString("en-PH");
const oldPrice = p => p.old || Math.round(p.price / 0.8);
const findP = id => allProducts().find(p => p.id === id);
const isMine = id => myItems.some(p => p.id === id && p.owner === session);
const BASE = {
  5: 84, 4: 12, 3: 3, 2: 1, 1: 0
};
const revsOf = id => reviews[id] || [];
const stars = n => "★".repeat(n) + "☆".repeat(5 - n);
function stats(id) {
  const c = { ...BASE };
  (reviews[id] || []).forEach(r => c[r.stars]++);
  const n = Object.values(c).reduce((a, b) => a + b, 0);
  const avg = Object.entries(c).reduce((a, [s, k]) => a + s * k, 0) / n;
  return { c, n, avg: avg.toFixed(1) };
}
const colorOf = p => (p.colors && p.colors.find(c => c.n === cur.color)) || null;
const colorChips = p => !p.colors ? "" : `<div class="lbl">Color: <span>${cur.color}</span></div><div class="sw">${p.colors.map(c => `<button class="swatch ${c.n === cur.color ? "on" : ""}" data-color="${c.n}" style="background:${c.c}" aria-label="${c.n}"></button>`).join("")}</div>`;
const sizePills = p => !p.sizes ? "" : `<div class="lbl">Size: <span>${cur.size}</span></div><div class="pills">${p.sizes.map(s => `<button class="pill ${s === cur.size ? "on" : ""}" data-size="${s}">${s}</button>`).join("")}</div>`;
const priceRow = p => `<div class="pricerow"><b class="big">${peso(p.price)}</b><s>${peso(oldPrice(p))}</s><span class="save">Save ${peso(oldPrice(p) - p.price)}</span></div>`;
function openDetail(id) {
  const p = findP(id);
  if (!p)
    return;
  cur = {
    p, color: p.colors ? p.colors[0].n : "", size: p.sizes ? (p.sizes[1] || p.sizes[0]) : "", qty: 1
  };
  dtab = "overview";
  writing = false;
  rate = 0;
  fbDraft = "";
  go("detail");
  renderDetail();
}
function toggleFav(id) {
  favs = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id];
  save("cc_favs", favs);
}
function renderDetail() {
  const p = cur.p, st = stats(p.id), fav = favs.includes(p.id), col = colorOf(p);
  $$(".dtab").forEach(b => b.classList.toggle("on", b.dataset.dt === dtab));
  $("#dHeart").classList.toggle("on", fav);
  $("#dHeart").textContent = fav ? "♥" : "♡";
  let h = "";
  if (dtab === "overview") {
    const hero = p.photo ? `<div class="hero img" style="background-image:url(${p.photo})"></div>`
      : `<div class="hero" style="background:${col ? col.c : (p.bg || "#dbe9ff")}">${icon("bag")}</div>`;
    h = hero + `<div class="deal"><span>Student Deal</span><b>20% OFF</b></div>
  <div class="dpanel">${priceRow(p)}<h2 class="pname">${esc(p.name)}</h2>
  <div class="rate"><span class="stars">★</span> <b>${st.avg}</b> <span class="muted">(${st.n} feedback)</span></div>${colorChips(p)}${sizePills(p)}</div>`;
  }
  else if (dtab === "description") {
    h = `<div class="dpanel"><h2>Description</h2><p>${esc(p.desc || "The seller hasn't added a description yet.")}</p><p class="muted s">Category: ${esc(p.cat)}</p></div>`;
  }
  else {
    const bars = [5, 4, 3, 2, 1].map(s => {
      const pc = Math.round(st.c[s] / st.n * 100);
      return `<div class="bar"><span>${s} ★</span><i><u style="width:${pc}%"></u></i><span>${pc}%</span></div>`;
    }).join("");
    const form = writing ? `<div class="dpanel wf"><b>Your rating</b><div class="rstars">${[1, 2, 3, 4, 5].map(n => `<button class="rs ${n <= rate ? "on" : ""}" data-rate="${n}" aria-label="${n} stars">★</button>`).join("")}</div><textarea id="fbText" rows="3" placeholder="Share your experience...">${esc(fbDraft)}</textarea><button class="btn primary" id="fbSend">Submit feedback</button></div>` : "";
    const list = revsOf(p.id).map((r, i) => {
      const k = p.id + "-" + i;
      return `<div class="rev"><div class="av2">${initial(r.name)}</div><div class="grow"><b>${esc(r.name)}</b> ${r.verified ? '<span class="vb">✓ Verified Buyer</span>' : ""}<div><span class="stars">${stars(r.stars)}</span> <span class="muted s">· ${r.when}</span></div><p>${esc(r.text)}</p><button class="help" data-help="${k}">Helpful (${r.helpful + (helped[k] ? 1 : 0)})</button></div></div>`;
    }).join("");
    h = `<div class="dpanel"><h2>Customer feedback</h2><div class="avg"><b>${st.avg}</b><span class="muted">/5 (${st.n})</span></div><div class="stars big">${stars(Math.round(st.avg))}</div>${bars}</div>${form}<div class="dpanel">${list}</div>`;
  }
  $("#dBody").innerHTML = h;
  $("#abar").innerHTML = dtab === "feedback"
    ? `<button class="btn primary" id="aWrite">${writing ? "Cancel" : "Write a feedback"}</button>`
    : `<button class="aico ${fav ? "on" : ""}" id="aFav"><span>${fav ? "♥" : "♡"}</span>Favorite</button><button class="aico" id="aChat"><span>${icon("chat")}</span>Chat</button><button class="btn primary" id="aBuy">Buy Now</button>`;
}
$("#dBack").onclick = () => go(lastMain);
$("#detail").addEventListener("click", e => {
  const q = s => e.target.closest(s);
  let el;
  const ta = $("#fbText");
  if (ta)
    fbDraft = ta.value;
  if ((el = q(".dtab"))) {
    dtab = el.dataset.dt;
    writing = false;
  }
  else if ((el = q("[data-color]")))
    cur.color = el.dataset.color;
  else if ((el = q("[data-size]")))
    cur.size = el.dataset.size;
  else if (q("#dHeart, #aFav"))
    toggleFav(cur.p.id);
  else if (q("#aChat")) {
    if (isMine(cur.p.id))
      return toast("This is your own listing.");
    return openChat(cur.p.seller || "Student Seller", cur.p, "detail");
  }
  else if (q("#aBuy")) {
    if (isMine(cur.p.id))
      return toast("This is your own listing.");
    cur.qty = 1;
    go("buy");
    return renderBuy();
  }
  else if (q("#aWrite")) {
    writing = !writing;
    rate = 0;
    fbDraft = "";
  }
  else if ((el = q("[data-rate]")))
    rate = +el.dataset.rate;
  else if (q("#fbSend")) {
    if (!rate)
      return toast("Tap a star to rate.");
    if (fbDraft.trim().length < 3)
      return toast("Please write a short feedback.");
    const u = accounts.find(a => a.id === session), parts = (u ? u.name : "Student").split(" ");
    const name = parts[0] + (parts[1] ? " " + parts[parts.length - 1][0] + "." : "");
    (reviews[cur.p.id] = reviews[cur.p.id] || []).unshift({
      name, stars: rate, when: "Just now", text: fbDraft.trim(), helpful: 0, verified: orders.some(o => o.pid === cur.p.id)
    });
    save("cc_reviews", reviews);
    writing = false;
    fbDraft = "";
    toast("Thanks for your feedback!");
  }
  else if ((el = q("[data-help]")))
    helped[el.dataset.help] = !helped[el.dataset.help];
  else
    return;
  renderDetail();
});
document.addEventListener("click", e => {
  if (e.target.closest("[data-fav],[data-del]"))
    return;
  const a = e.target.closest("[data-pid]");
  if (a)
    openDetail(+a.dataset.pid);
});
const getAddr = () => {
  const u = accounts.find(a => a.id === session) || {};
  return u.addr || { name: u.name || "", phone: "", line: "SPNHS, San Pedro National High School" };
};
const phoneOk = v => /^(\+63|0)9\d{9}$/.test(v.replace(/[\s-]/g, ""));
function renderBuy() {
  const p = cur.p, st = stats(p.id), col = colorOf(p), sub = p.price * cur.qty, ship = 50, stock = p.stock || 24, a = getAddr();
  const bg = col ? col.c : (p.bg || "#dbe9ff");
  $("#buyBody").innerHTML = `
  <div class="dpanel row"><div class="mini" style="background:${bg}">${icon("bag")}</div><div class="grow"><b>${esc(p.name)}</b><div class="rate"><span class="stars">★</span> ${st.avg} <span class="muted s">(${st.n} feedback)</span></div>${priceRow(p)}</div></div>
  <div class="dpanel"><h3>Product Details</h3>
  ${p.colors ? `<div class="drow"><span class="dl">Color</span><i class="dot" style="background:${col.c}"></i><span>${cur.color}</span></div>` : ""}
  ${p.sizes ? `<div class="drow"><span class="dl">Size</span><span class="szpill">${cur.size}</span></div>` : ""}
  <div class="drow"><span class="dl">Quantity</span><div class="qty"><button class="qb" data-q="-1" aria-label="Less">−</button><b>${cur.qty}</b><button class="qb" data-q="1" aria-label="More">+</button></div></div>
  <div class="instock">● In stock · ${stock} pieces available</div>
  <div class="sumrow"><span>Subtotal</span><span>${peso(sub)}</span></div>
  <div class="sumrow"><span>Shipping Fee</span><span>${peso(ship)}</span></div>
  <div class="sumrow tot"><span>Total</span><span>${peso(sub + ship)}</span></div></div>
  <h3 class="hh">Shipping Address</h3>
  <div class="dpanel row addr"><div class="grow"><b>${esc(a.name)}</b><div class="muted s">${a.phone ? esc(a.phone) : "Add your contact number"}</div><div class="s">${esc(a.line)}</div></div><button class="chg" id="chgAddr">Change ›</button></div>
  <h3 class="hh">Payment Method</h3>
  <div class="dpanel row"><div class="grow"><b>Cash on Delivery (COD)</b><div class="muted s">Pay when you receive your item.</div></div><span>›</span></div>
  <button class="btn primary" id="cBuy">Confirm Purchase</button>
  <p class="secure">Your information is safe and secure. <button type="button" class="linkbtn" data-rules>Safety &amp; Rules</button></p>
  <button type="button" class="linkbtn center" id="bProd">‹ Back to Product</button>`;
}
const backToProduct = () => {
  go("detail");
  renderDetail();
};
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
  if (err)
    return void ($("#adErr").textContent = err);
  const u = accounts.find(a => a.id === session);
  u.addr = { name, phone, line };
  save("cc_accounts", accounts);
  closeSheet();
  if (curView === "buy")
    renderBuy();
  toast("Address saved.");
}
$("#buy").addEventListener("click", e => {
  const q = s => e.target.closest(s);
  let el;
  const p = cur.p;
  if ((el = q("[data-q]")))
    cur.qty = Math.min(p.stock || 24, Math.max(1, cur.qty + +el.dataset.q));
  else if (q("#chgAddr"))
    return openAddr();
  else if (q("#bProd"))
    return backToProduct();
  else if (q("#cBuy")) {
    if (!phoneOk(getAddr().phone)) {
      toast("Please add your contact number first.");
      return openAddr();
    }
    orders.unshift({
      id: Date.now(), pid: p.id, name: p.name, bg: (colorOf(p) || {}).c || p.bg || "#dbe9ff", color: cur.color, size: cur.size, qty: cur.qty, total: p.price * cur.qty + SHIPPING_FEE, date: new Date().toLocaleDateString("en-PH"),
      status: "Pending", seller: p.seller || "Student Seller", addr: getAddr()
    });
    save("cc_orders", orders);
    notify("order", "Order Update", `Your order #${refOf(orders[0])} has been placed and is now Pending.`, { order: orders[0].id });
    toast("Order placed! Pay when you receive your item.");
    return go("orders");
  }
  else
    return;
  renderBuy();
});
const SHIPPING_FEE = 50;
const ORDER_FILTERS = ["All", "Pending", "Processing", "Completed", "Cancelled"];
let orderFilter = "All", curOrderId = null, orderFrom = "orders";

const statusOf = o => o.status || "Pending";
const refOf = o => "CC" + new Date(o.id).getFullYear() + "-" + String(o.id % 10000).padStart(4, "0");
const itemsLabel = o => o.qty + (o.qty === 1 ? " item" : " items");
const sellerOf = o => o.seller || (findP(o.pid) || {}).seller || "Student Seller";
const statusPill = o => `<span class="ostatus ${statusOf(o).toLowerCase()}">${statusOf(o)}</span>`;
const findOrder = id => orders.find(o => o.id === id);
function updateCartBadge() {
  const active = orders.filter(o => statusOf(o) !== "Cancelled").length;
  $$(".cartBadge").forEach(b => {
    b.textContent = active;
    b.classList.toggle("hidden", !active);
  });
}

const orderCard = o => `
  <button class="ocard" data-order="${o.id}">
    <div class="mini" style="background:${o.bg}">${icon("bag")}</div>
    <div class="grow">
      <b>Order #${refOf(o)}</b>
      <div class="muted s">${esc(o.name)}</div>
      <div class="muted s">${o.date} · ${itemsLabel(o)}</div>
    </div>
    ${statusPill(o)}
    <span class="chev">›</span>
  </button>`;

function ordersHTML() {
  if (!orders.length)
    return `<div class="empty">No orders yet.</div>`;
  const tabs = ORDER_FILTERS.map(f => `<button data-ofilter="${f}" class="${f === orderFilter ? "on" : ""}">${f}</button>`).join("");
  const list = orders.filter(o => orderFilter === "All" || statusOf(o) === orderFilter);
  return `<div class="ofilter">${tabs}</div>` +
    (list.map(orderCard).join("") || `<div class="empty">No ${orderFilter.toLowerCase()} orders.</div>`);
}

function renderOrder() {
  const o = findOrder(curOrderId);
  if (!o)
    return go("profile");
  const sub = o.total - SHIPPING_FEE, a = o.addr || getAddr(), cancelled = statusOf(o) === "Cancelled";
  $("#odBody").innerHTML = `
    <div class="row between">
      <h2 class="bt">Order Details</h2>
      <button class="odref" id="odCopy" aria-label="Copy order number">#${refOf(o)} ${icon("copy")}</button>
    </div>
    <div>${statusPill(o)}</div>
    <p class="muted s">Ordered on ${o.date} · ${itemsLabel(o)}</p>
    <div class="dpanel row">
      <div class="mini" style="background:${o.bg}">${icon("bag")}</div>
      <div class="grow">
        <b>${esc(o.name)}</b>
        <div class="muted s">${[o.color, o.size].filter(Boolean).map(esc).join(" · ")}</div>
        <b>${peso(sub / o.qty)}</b>
        <div class="muted s">Qty: ${o.qty}</div>
      </div>
    </div>
    <div class="odsum">
      <div class="row between"><span>Subtotal</span><b>${peso(sub)}</b></div>
      <div class="row between"><span>Shipping Fee</span><b>${peso(SHIPPING_FEE)}</b></div>
      <div class="row between odtotal"><span>Total</span><b>${peso(o.total)}</b></div>
    </div>
    ${cancelled ? `
    <div class="card odcancelled">
      <b>Order Cancelled</b>
      <p class="muted s">This order has been cancelled. No further action is needed.</p>
    </div>` : `
    <div class="odactions">
      <button class="btn outline" id="odChat">Chat Seller</button>
      ${statusOf(o) === "Pending" ? `<button class="btn danger" id="odCancel">Cancel Order</button>` : ""}
    </div>`}
    <div class="card odaddr">
      <b>Shipping Address</b>
      <div>${esc(a.name)}</div>
      <div class="muted s">${esc(a.phone)}</div>
      <div class="muted s">${esc(a.line)}</div>
    </div>`;
}
function showOrder(id) {
  if (curView === "profile" || curView === "orders")
    orderFrom = curView;
  curOrderId = id;
  go("orderdetail");
  renderOrder();
}
function confirmCancelHTML(o) {
  return `
    <h2 class="sh">Cancel Order?</h2>
    <p>Are you sure you want to cancel this order?</p>
    <p class="muted s">The seller will be notified, and the order will be marked as cancelled.</p>
    <div class="dlgbtns">
      <button class="btn outline" data-close>Go Back</button>
      <button class="btn danger solid" data-oact="cancel-yes">Yes, Cancel Order</button>
    </div>`;
}
function cancelOrder() {
  const o = findOrder(curOrderId);
  if (!o || statusOf(o) !== "Pending")
    return closeSheet();
  o.status = "Cancelled";
  save("cc_orders", orders);
  pushMsg({ from: "me", type: "text", text: `I cancelled order #${refOf(o)}.` }, sellerOf(o));
  notify("order", "Order Update", `Your order #${refOf(o)} has been cancelled.`, { order: o.id });
  renderOrder();
  openSheet(`
    <h2 class="sh">Order Cancelled</h2>
    <p class="muted s">Your order #${refOf(o)} has been successfully cancelled.</p>
    <div class="dlgbtns">
      <button class="btn primary" data-oact="back-orders">Back to Orders</button>
    </div>`, true);
}
const backToOrders = () => {
  closeSheet();
  if (orderFrom === "profile")
    ptab = "orders";
  go(orderFrom);
};

function onOrdersClick(e) {
  const f = e.target.closest("[data-ofilter]"), c = e.target.closest("[data-order]");
  if (f) {
    orderFilter = f.dataset.ofilter;
    $("#ordersList").innerHTML = ordersHTML();
    if (curView === "profile")
      renderTab();
  }
  else if (c)
    showOrder(+c.dataset.order);
}
$("#myGrid").addEventListener("click", onOrdersClick);
$("#ordersList").addEventListener("click", onOrdersClick);
$("#oBack").onclick = () => go(lastMain || "home");
$("#odBack").onclick = backToOrders;
$("#odBody").addEventListener("click", e => {
  const o = findOrder(curOrderId);
  if (e.target.closest("#odCancel"))
    openSheet(confirmCancelHTML(o), true);
  else if (e.target.closest("#odChat"))
    openChat(sellerOf(o), null, "orderdetail");
  else if (e.target.closest("#odCopy"))
    navigator.clipboard.writeText(refOf(o))
      .then(() => toast("Order number copied."))
      .catch(() => toast("Could not copy the order number."));
});
$("#sheetBody").addEventListener("click", e => {
  const b = e.target.closest("[data-oact]");
  if (!b)
    return;
  if (b.dataset.oact === "cancel-yes")
    cancelOrder();
  else if (b.dataset.oact === "back-orders")
    backToOrders();
});
function openSheet(html, asDialog = false) {
  $("#sheetBody").innerHTML = html;
  $("#sheet").classList.toggle("dialog", asDialog);
  $("#sheet").classList.remove("hidden");
}
function closeSheet() {
  $("#sheet").classList.add("hidden");
}
const RULES = [
  ["shield", "Secure & Verified Accounts", "We verify all users through their school ID or school email to ensure that everyone is a real SPNHS student.", "ok", "blue", ["School ID / school email verification", "Report suspicious accounts", "Block and remove fake profiles"]],
  ["lock", "Your Privacy Matters", "We respect and protect your personal information.", "ok", "purple", ["Your name, contact number, and address are kept private.", "We do not share your information with third parties.", "Your data is used only for CampusConnect purposes."]],
  ["pin", "Safe Meetups & Transactions", "For your safety, we encourage face-to-face meetups in designated public areas on campus.", "ok", "green", ["Meet in school-approved locations (e.g., school grounds, designated areas).", "Avoid sharing personal details publicly.", "Report any suspicious activities or unsafe interactions."]],
  ["ban", "No Harmful or Prohibited Products", "We do not allow the sale or purchase of any illegal, dangerous, or harmful items.", "no", "red", ["No drugs, weapons, explosives, or unsafe items", "No academic dishonesty services (e.g., answer keys, fake documents)", "No inappropriate or illegal content", "No items that violate school policies or the law"]],
  ["users", "Equal Access & Fair Rules", "We aim for a safe, transparent, and respectful marketplace for all SPNHS students.", "ok", "blue", ["No discrimination", "Clear and fair guidelines for buyers and sellers", "Feedback and rating system for accountability"]],
];
function openRules() {
  openSheet(`<h2 class="sh">Safety &amp; Rules</h2><p class="muted s">A safer and better CampusConnect for every student.</p>` +
    RULES.map(r => `<div class="rule ${r[4]}"><div class="rh"><span class="ric">${icon(r[0])}</span><div><b>${r[1]}</b><p>${r[2]}</p></div></div><ul class="${r[3]}">${r[5].map(i => `<li>${i}</li>`).join("")}</ul></div>`).join("") +
    `<p class="thanks">Thank you for being a responsible and kind CampusConnect user! ♥</p>`);
}
function openRoleSheet() {
  const mine = roleOfUser(me());
  const box = k => {
    const R = ROLE[k];
    return `<div class="rcard ${k}"><div class="rhead"><span class="roleic sm">${icon(R.icon)}</span><div class="grow"><b>${R.level}</b><div class="muted s">(${R.range})</div></div><span class="rpill ${k}">${R.name}${mine === k ? " ✓" : ""}</span></div>${checks(R, true)}</div>`;
  };
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
  if (msg.length < 10)
    return void ($("#hsErr").textContent = "Please describe your concern (at least 10 characters).");
  $("#hsErr").textContent = "";
  const u = me() || {};
  const body = msg + "\n\n---\nName: " + (u.name || "") + "\nUsername: " + (u.username ? "@" + u.username : "") +
    "\nGrade: " + (u.grade || "") + (u.section ? " – " + u.section : "") + "\nSent from CampusConnect";
  location.href = "mailto:" + SUPPORT_EMAIL + "?subject=" + encodeURIComponent("CampusConnect Help & Support") + "&body=" + encodeURIComponent(body);
  closeSheet();
  toast("Opening your email app…");
}
function savePw() {
  const u = accounts.find(a => a.id === session);
  const err = $("#pwOld").value !== u.password ? "Current password is incorrect." : !($("#pwNew").value.length >= 8 && /[A-Za-z]/.test($("#pwNew").value) && /\d/.test($("#pwNew").value)) ? "Use 8+ characters with letters and numbers." : $("#pwNew").value !== $("#pwCf").value ? "Passwords do not match." : "";
  if (err)
    return void ($("#pwErr").textContent = err);
  u.password = $("#pwNew").value;
  save("cc_accounts", accounts);
  closeSheet();
  toast("Password updated.");
}
document.addEventListener("click", e => {
  if (e.target.closest("[data-close]"))
    closeSheet();
  if (e.target.closest("[data-rules]"))
    openRules();
  if (e.target.closest("#adSave"))
    saveAddr();
  if (e.target.closest("#pwSave"))
    savePw();
  if (e.target.closest("#hsSend"))
    sendHelp();
});
const prefs = load("cc_prefs", {
  msgs: true, orders: true, deals: false, showGrade: true, showActive: true
});
const toggles = l => l.map(([k, t]) => `<label class="tg"><span>${t}</span><input type="checkbox" data-pref="${k}" ${prefs[k] ? "checked" : ""}><i></i></label>`).join("");
document.addEventListener("change", e => {
  const k = e.target.dataset && e.target.dataset.pref;
  if (k) {
    prefs[k] = e.target.checked;
    save("cc_prefs", prefs);
  }
});
Object.assign(prefs, { inquiries: prefs.inquiries ?? true, announce: prefs.announce ?? true });

const NOTIF_TYPES = {
  message: { label: "Messages", icon: "chat", pref: "msgs" },
  order: { label: "Order Updates", icon: "box", pref: "orders" },
  inquiry: { label: "Inquiries", icon: "search", pref: "inquiries" },
  announcement: { label: "Announcements", icon: "megaphone", pref: "announce" }
};
const ORDER_STEPS = ["Pending", "Processing", "Completed", "Cancelled"];
let notifs = load("cc_notifs", []), notifFilter = "All", curNotifId = null, nsFrom = "notifications";

if (!load("cc_notifs_seeded", false)) {
  notifs.push({
    id: Date.now(), type: "announcement", title: "Welcome to CampusConnect",
    body: "Buy and sell with fellow SPNHS students. Meet in school-approved areas and stay safe.",
    ts: Date.now(), read: false
  });
  save("cc_notifs", notifs);
  save("cc_notifs_seeded", true);
}

function notify(type, title, body, ref = {}) {
  if (prefs[NOTIF_TYPES[type].pref] === false)
    return;
  notifs.unshift({ id: Date.now() + Math.random(), type, title, body, ref, ts: Date.now(), read: false });
  notifs = notifs.slice(0, 100);
  save("cc_notifs", notifs);
  updateNotifBadge();
}
function updateNotifBadge() {
  const unread = notifs.filter(n => !n.read).length;
  $$(".notifBadge").forEach(b => {
    b.textContent = unread;
    b.classList.toggle("hidden", !unread);
  });
}
function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1)
    return "Just now";
  if (m < 60)
    return m + "m ago";
  if (m < 1440)
    return Math.floor(m / 60) + "h ago";
  if (m < 10080)
    return Math.floor(m / 1440) + "d ago";
  return new Date(ts).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}
const fullDate = ts => new Date(ts).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) +
  " · " + new Date(ts).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

function renderNotifs() {
  const filters = ["All", ...Object.values(NOTIF_TYPES).map(t => t.label)];
  $("#nChips").innerHTML = filters.map(f => `<button class="chip ${f === notifFilter ? "on" : ""}" data-nfilter="${f}">${f}</button>`).join("");
  const list = notifs.filter(n => notifFilter === "All" || NOTIF_TYPES[n.type].label === notifFilter);
  $("#nList").innerHTML = list.length ? list.map(n => `
    <button class="nitem ${n.read ? "" : "unread"}" data-notif="${n.id}">
      <span class="nico ${n.type}">${icon(NOTIF_TYPES[n.type].icon)}</span>
      <div class="grow"><b>${esc(n.title)}</b><div class="muted s">${esc(n.body)}</div></div>
      <div class="ntime"><span>${timeAgo(n.ts)}</span>${n.read ? "" : `<i class="ndot"></i>`}</div>
    </button>`).join("") : `
    <div class="nempty">
      <span class="nbell">${icon("bell")}</span>
      <h3>No Notifications Yet</h3>
      <p class="muted s">You're all caught up! New updates will appear here when you have them.</p>
    </div>`;
}
function stepperHTML(status) {
  const at = ORDER_STEPS.indexOf(status), cancelled = status === "Cancelled";
  return `<div class="stepper">${ORDER_STEPS.map((s, i) => {
    const state = i === at ? "now" : (!cancelled && i < at) || (cancelled && i === 0) ? "done" : "";
    return `<div class="step ${state}"><i></i><span>${s}</span></div>`;
  }).join("")}</div>`;
}
function notifDetailHTML(n) {
  const head = `
    <div class="ndhead">
      <span class="nico ${n.type}">${icon(NOTIF_TYPES[n.type].icon)}</span>
      <div><b>${esc(n.title)}</b><div class="muted s">${fullDate(n.ts)}</div></div>
    </div>`;
  const o = n.type === "order" && n.ref && findOrder(n.ref.order);
  if (o)
    return `${head}
      <p>${esc(n.body)}</p>
      ${stepperHTML(statusOf(o))}
      <div class="dpanel row">
        <div class="mini" style="background:${o.bg}">${icon("bag")}</div>
        <div class="grow">
          <b>${esc(o.name)}</b>
          <div class="muted s">${[o.color, o.size].filter(Boolean).map(esc).join(" · ")}</div>
          <div class="muted s">${peso((o.total - SHIPPING_FEE) / o.qty)} · Qty: ${o.qty}</div>
        </div>
      </div>
      <button class="btn outline" id="ndOrder">View Order</button>`;
  if (n.ref && n.ref.chat)
    return `${head}
      <div class="card ndmsg">
        <span class="pav">${esc(initials(n.ref.chat))}</span>
        <div><b>${esc(n.ref.chat)}</b><div>${esc(n.body.replace(n.ref.chat + ": ", ""))}</div></div>
      </div>
      <button class="btn primary" id="ndReply">Reply</button>`;
  return `${head}<p>${esc(n.body)}</p>`;
}
function showNotif(id) {
  const n = notifs.find(x => x.id === id);
  if (!n)
    return go("notifications");
  curNotifId = id;
  n.read = true;
  save("cc_notifs", notifs);
  go("notifdetail");
  $("#ndBody").innerHTML = notifDetailHTML(n);
}
function renderNotifSettings() {
  $("#nsBody").innerHTML = toggles([
    ["msgs", `${icon("chat")} Messages`],
    ["orders", `${icon("box")} Order Updates`],
    ["inquiries", `${icon("search")} Product Inquiries`],
    ["announce", `${icon("megaphone")} School Announcements`]
  ]);
}

$("#nBack").onclick = () => go(lastMain || "home");
$("#nSettings").onclick = () => {
  nsFrom = "notifications";
  go("notifsettings");
};
$("#nsBack").onclick = () => go(nsFrom);
$("#ndBack").onclick = () => go("notifications");
$("#ndDelete").onclick = () => {
  notifs = notifs.filter(n => n.id !== curNotifId);
  save("cc_notifs", notifs);
  go("notifications");
  toast("Notification deleted.");
};
$("#notifications").addEventListener("click", e => {
  const f = e.target.closest("[data-nfilter]"), n = e.target.closest("[data-notif]");
  if (f) {
    notifFilter = f.dataset.nfilter;
    renderNotifs();
  }
  else if (n)
    showNotif(+n.dataset.notif);
});
$("#ndBody").addEventListener("click", e => {
  const n = notifs.find(x => x.id === curNotifId);
  if (e.target.closest("#ndOrder"))
    showOrder(n.ref.order);
  else if (e.target.closest("#ndReply"))
    openChat(n.ref.chat, null, "notifdetail");
});
let editFrom = "profile", ePhotoData = null;
$("#settings").addEventListener("click", e => {
  const r = e.target.closest("[data-set]");
  if (!r)
    return;
  const k = r.dataset.set;
  if (k === "account") {
    editFrom = "settings";
    ePhotoData = null;
    go("editprofile");
  }
  else if (k === "role")
    openRoleSheet();
  else if (k === "privacy")
    openSheet(`<h2 class="sh">Privacy &amp; Security</h2><p class="muted s">Control who sees what.</p>${toggles([["showGrade", "Show my grade level to buyers"], ["showActive", "Show when I was last active"]])}<p class="muted s" style="margin-top:12px">Your name, contact number, and address are kept private.</p>`);
  else if (k === "notif") {
    nsFrom = "settings";
    go("notifsettings");
  }
  else if (k === "password")
    openPw();
  else if (k === "safety")
    openRules();
  else if (k === "help")
    openSheet(`<h2 class="sh">Help &amp; Support</h2><p class="muted s">Having a problem with an order, a seller, or your account? Tell your class adviser or the school office and include your username and what happened. Use ⋯ in a chat to review the Safety &amp; Rules.</p><div class="field" style="margin-top:12px"><textarea id="hsMsg" rows="4" maxlength="1000" placeholder="Type your concern here… (what happened, which order or seller)"></textarea></div><small class="err" id="hsErr"></small><button class="btn primary" id="hsSend">Send to Support</button><p class="muted s" style="margin-top:10px">Opens your email app with your message ready to send to <b style="word-break:break-all">campusconnect.sphns.system@gmail.com</b>.</p>`);
  else if (k === "about")
    openSheet(`<h2 class="sh">About CampusConnect</h2><p class="muted s">Version 1.0 — a student marketplace for San Pedro National High School. By using the app you agree to follow the Safety &amp; Rules.</p>`);
  else if (k === "logout")
    doLogout();
});
$("#sBack").onclick = () => go("profile");
$("#pMore").onclick = () => go("settings");
const uname = a => a.username || a.id.split("@")[0].replace(/[^a-z0-9._]/gi, "").slice(0, 20);
const maskEmail = id => isEmail(id) && !isAuthEmail(id) ? id.replace(/^(.{1,3}).*(@.*)$/, (m, a, b) => a + "••••••••" + b) : "No school email added";
const setAvatar = (el, u) => {
  el.innerHTML = u.avatar ? `<img src="${u.avatar}" alt="">` : esc(initials(u.name));
};
function shrink(file, max, cb) {
  const r = new FileReader();
  r.onload = () => {
    const im = new Image();
    im.onload = () => {
      const s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement("canvas");
      c.width = im.width * s;
      c.height = im.height * s;
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      cb(c.toDataURL("image/jpeg", .8));
    };
    im.src = r.result;
  };
  r.readAsDataURL(file);
}
function renderEdit() {
  const u = accounts.find(a => a.id === session);
  if (!u)
    return;
  setAvatar($("#eAv"), ePhotoData ? { avatar: ePhotoData } : u);
  $("#eName").value = u.name;
  $("#eUser").value = uname(u);
  $("#eGrade").value = u.grade || "";
  $("#eGrade").disabled = true;
  $("#eSec").value = u.section || "";
  $("#eMail").value = maskEmail(u.email || u.id);
  $("#eBio").value = u.bio || "";
  $("#eCount").textContent = ($("#eBio").value || "").length;
}
$("#editBtn").onclick = () => {
  editFrom = "profile";
  ePhotoData = null;
  go("editprofile");
};
const leaveEdit = () => go(editFrom);
$("#eBack").onclick = leaveEdit;
$("#eCancel").onclick = leaveEdit;
$("#eBio").addEventListener("input", e => {
  $("#eCount").textContent = e.target.value.length;
});
$("#ePhoto").addEventListener("change", e => {
  const f = e.target.files[0];
  if (f)
    shrink(f, 240, d => {
      ePhotoData = d;
      setAvatar($("#eAv"), { avatar: d });
    });
});
$("#editForm").addEventListener("submit", e => {
  e.preventDefault();
  const n = $("#eName"), us = $("#eUser"), un = us.value.trim().replace(/^@/, "");
  let ok = setErr(n, n.value.trim().length >= 3 ? "" : "Enter your full name.");
  ok = setErr(us, !/^[a-z0-9._]{3,20}$/i.test(un) ? "3–20 letters, numbers, dots or underscores." : accounts.some(a => a.id !== session && uname(a).toLowerCase() === un.toLowerCase()) ? "That username is taken." : "") && ok;
  if (!ok)
    return;
  const u = accounts.find(a => a.id === session);
  Object.assign(u, {
    name: n.value.trim(), username: un, section: $("#eSec").value, bio: $("#eBio").value.trim()
  });
  if (ePhotoData)
    u.avatar = ePhotoData;
  save("cc_accounts", accounts);
  toast("Profile updated.");
  go("profile");
});
let chats = load("cc_chats", {}), chatKey = "", pending = null, chatFrom = "messages";
const hhmm = () => new Date().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
const snap = p => ({
  pid: p.id, name: p.name, price: p.price, old: oldPrice(p), bg: p.bg || "#dbe9ff", cat: p.cat
});
function openChat(seller, p, from) {
  chatKey = seller;
  pending = p ? snap(p) : null;
  chatFrom = from || "messages";
  $("#cAttach").classList.add("hidden");
  go("chat");
  renderChat();
}
function pushMsg(m, key = chatKey) {
  (chats[key] = chats[key] || []).push({ ...m, t: hhmm() });
  save("cc_chats", chats);
}
const prodCard = m => `<div class="mini" style="background:${m.bg};width:52px;height:52px;font-size:26px">${icon("bag")}</div><div class="grow"><b>${esc(m.name)}</b><div class="muted s">${esc(m.cat || "")}</div><div><b>${peso(m.price)}</b> <s class="muted s">${peso(m.old)}</s></div></div>`;
function msgHTML(m) {
  const body = m.type === "image" ? `<img src="${m.img}" alt="Photo">` : m.type === "product" ? `<div class="mcard">${prodCard(m)}</div>` : m.type === "order" ? `<b>Order</b><br>${esc(m.name)} · ${peso(m.total)}` : esc(m.text);
  return `<div class="msg ${m.from}">${body}<small>${m.t}</small></div>`;
}
function renderChat() {
  $("#cName").textContent = chatKey;
  $("#cAv").textContent = chatKey.slice(0, 2).toUpperCase();
  const l = chats[chatKey] || [];
  $("#cMsgs").innerHTML = l.length ? l.map(msgHTML).join("") : `<div class="empty">Say hi to ${esc(chatKey)}!</div>`;
  $("#cPending").classList.toggle("hidden", !pending);
  if (pending)
    $("#cPending").innerHTML = `<button class="px" data-pclose aria-label="Remove">✕</button>${prodCard(pending)}<button class="send" id="cSendP">Send</button>`;
  window.scrollTo(0, document.body.scrollHeight);
}
function autoReply(key) {
  const n = (chats[key] || []).filter(m => m.from === "them").length;
  setTimeout(() => {
    const reply = n ? "Sure! We can meet at school during break time." : "Hi! Thanks for messaging. Yes, it's still available.";
    pushMsg({ from: "them", type: "text", text: reply }, key);
    if (curView === "chat" && chatKey === key)
      renderChat();
    else
      notify("message", "New Message", `${key}: ${reply}`, { chat: key });
  }, 1200);
}
function sendText() {
  const t = $("#cText"), v = t.value.trim();
  if (!v)
    return;
  pushMsg({ from: "me", type: "text", text: v });
  t.value = "";
  $("#cSend").classList.add("hidden");
  $("#cPlus").classList.remove("hidden");
  renderChat();
  autoReply(chatKey);
}
$("#cText").addEventListener("input", e => {
  const has = !!e.target.value.trim();
  $("#cSend").classList.toggle("hidden", !has);
  $("#cPlus").classList.toggle("hidden", has);
});
$("#cText").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendText();
  }
});
$("#cSend").onclick = sendText;
$("#cPlus").onclick = () => $("#cAttach").classList.toggle("hidden");
$("#cBack").onclick = () => {
  if (chatFrom === "notifdetail" && curNotifId)
    showNotif(curNotifId);
  else if (chatFrom === "orderdetail" && curOrderId)
    showOrder(curOrderId);
  else if (chatFrom === "detail" && cur) {
    go("detail");
    renderDetail();
  }
  else
    go("messages");
};
$("#cFile").addEventListener("change", e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (f)
    shrink(f, 600, d => {
      pushMsg({ from: "me", type: "image", img: d });
      renderChat();
      autoReply(chatKey);
    });
});
$("#chat").addEventListener("click", e => {
  let el;
  if (e.target.closest("[data-pclose]")) {
    pending = null;
    renderChat();
  }
  else if (e.target.closest("#cSendP")) {
    pushMsg({ from: "me", type: "product", ...pending });
    pending = null;
    renderChat();
    autoReply(chatKey);
  }
  else if ((el = e.target.closest("[data-att]"))) {
    const k = el.dataset.att;
    if (k === "photo")
      $("#cFile").click();
    else if (k === "video")
      toast("Video sharing is coming soon.");
    else if (k === "order") {
      const o = orders[0];
      if (!o)
        return toast("You have no orders yet.");
      pushMsg({
        from: "me", type: "order", name: o.name, total: o.total
      });
      renderChat();
      autoReply(chatKey);
    }
    else if (k === "product") {
      if (!pending && cur)
        pending = snap(cur.p);
      if (!pending)
        return toast("Open a product and tap Chat to share it.");
      renderChat();
    }
    $("#cAttach").classList.add("hidden");
  }
});
function renderChatList() {
  const keys = Object.keys(chats).filter(k => chats[k].length);
  $("#chatList").innerHTML = keys.length ? keys.map(k => {
    const m = chats[k][chats[k].length - 1], pv = m.type === "text" ? m.text : m.type === "image" ? "Photo" : m.type === "order" ? "Order" : m.name;
    return `<button class="conv" data-chat="${esc(k)}"><div class="av2">${esc(k.slice(0, 2).toUpperCase())}</div><div class="grow"><b>${esc(k)}</b><div class="muted s">${m.from === "me" ? "You: " : ""}${esc(pv)}</div></div><span class="muted s">${m.t}</span></button>`;
  }).join("") : `<div class="empty">No messages yet.<br>Tap a product to chat with the seller.</div>`;
}
$("#messages").addEventListener("click", e => {
  const c = e.target.closest("[data-chat]");
  if (c)
    openChat(c.dataset.chat, null, "messages");
});
(async () => {
  const { data } = await db.auth.getSession();
  if (data.session)
    await startSession(data.session.user.id);
  go(session && me() ? "home" : "auth");
})();