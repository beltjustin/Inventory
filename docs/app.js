/* Pantry Inventory PWA — Supabase data + Claude-vision scanning. */
(function () {
  "use strict";
  var cfg = window.PANTRY_CONFIG || {};
  var configured = cfg.SUPABASE_URL && cfg.SUPABASE_URL.indexOf("YOUR-PROJECT") === -1 &&
                   cfg.SUPABASE_ANON_KEY && cfg.SUPABASE_ANON_KEY.indexOf("YOUR-") === -1;
  var SBURL = (cfg.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  var db = configured ? window.supabase.createClient(SBURL, cfg.SUPABASE_ANON_KEY) : null;

  var $ = function (id) { return document.getElementById(id); };
  var items = [];
  var view = [];
  var tab = "all";
  var locFilter = "";
  var activePlace = (function () { try { return localStorage.getItem("pantry_place") || "Home"; } catch (e) { return "Home"; } })();
  var scanCurrent = null;
  var pendingMode = null;
  var useItem = null;
  var photoData = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function today() { var d = new Date(); d.setHours(0,0,0,0); return d; }
  function daysLeft(exp) { if (!exp) return null; return Math.round((new Date(exp + "T00:00:00") - today()) / 86400000); }
  function pill(dl) {
    if (dl === null) return '<span class="pill d-gray">no date</span>';
    var c = dl < 7 ? "d-red" : dl <= 30 ? "d-yellow" : "d-green";
    return '<span class="pill ' + c + '">' + (dl < 0 ? Math.abs(dl) + "d ago" : dl + "d") + "</span>";
  }
  function banner(msg) { var b = $("banner"); b.innerHTML = msg; b.style.display = msg ? "block" : "none"; }
  function cacheLocal() { try { localStorage.setItem("pantry_cache", JSON.stringify(items)); } catch (e) {} }
  function loadLocal() { try { return JSON.parse(localStorage.getItem("pantry_cache") || "[]"); } catch (e) { return []; } }
  function validLoc(l) { return l === "Fridge" || l === "Freezer" ? l : "Pantry"; }
  function numOr(v, d) { var n = Number(v); return isNaN(n) ? d : n; }

  /* ---------- data ---------- */
  function load() {
    if (!db) {
      banner("⚙️ Not connected yet. Add your Supabase URL + key in <b>config.js</b>. Showing last cached data.");
      items = loadLocal(); render(); return;
    }
    $("sub").textContent = "Syncing…";
    db.from("items").select("*").order("expiration", { ascending: true }).then(function (res) {
      if (res.error) {
        banner("⚠️ Couldn't reach the database: " + esc(res.error.message) + ". Showing cached data.");
        items = loadLocal();
      } else { banner(""); items = res.data || []; cacheLocal(); }
      render();
    });
  }
  function save(rec, id) {
    if (!db) { alert("Connect Supabase first."); return Promise.resolve(); }
    var q = id ? db.from("items").update(rec).eq("id", id) : db.from("items").insert(rec);
    return q.then(function (res) { if (res.error) alert("Save failed: " + res.error.message); load(); });
  }
  function removeItem(it, logUsed) {
    if (!db) return;
    var chain = Promise.resolve();
    if (logUsed) chain = db.from("used_log").insert({ item: it.item, quantity_used: (it.quantity || "") + " " + (it.unit || ""), reason: "Marked used in app" });
    chain.then(function () { return db.from("items").delete().eq("id", it.id); })
      .then(function (res) { if (res && res.error) alert("Delete failed: " + res.error.message); load(); });
  }

  /* ---------- places (separate inventories: Home, RV, Lake House…) ---------- */
  function allPlaces() {
    var p = []; items.forEach(function (x) { var pl = x.place || "Home"; if (p.indexOf(pl) < 0) p.push(pl); });
    if (p.indexOf(activePlace) < 0) p.push(activePlace);
    return p.sort();
  }
  function renderPlaces() {
    $("placeSel").innerHTML = allPlaces().map(function (p) {
      return '<option value="' + esc(p) + '"' + (p === activePlace ? " selected" : "") + ">📍 " + esc(p) + "</option>";
    }).join("") + '<option value="__new__">➕ New list…</option>';
  }
  $("placeSel").addEventListener("change", function () {
    if (this.value === "__new__") {
      var name = prompt("Name this inventory (e.g. RV, Lake House):");
      if (name && name.trim()) activePlace = name.trim();
    } else { activePlace = this.value; }
    try { localStorage.setItem("pantry_place", activePlace); } catch (e) {}
    render();
  });

  /* ---------- render ---------- */
  function render() {
    renderPlaces();
    view = items.filter(function (x) { return (x.place || "Home") === activePlace; });
    var n = view.length;
    $("sub").textContent = n + " item" + (n === 1 ? "" : "s") + " in " + activePlace + (configured ? " · synced" : " · offline");
    var exp = view.filter(function (x) { var d = daysLeft(x.expiration); return d !== null && d < 30; }).length;
    var low = view.filter(function (x) { return x.status === "Low" || x.status === "Out"; }).length;
    var cats = {}; view.forEach(function (x) { if (x.category) cats[x.category] = 1; });
    $("cards").innerHTML = card(n, "Items") + card(exp, "Exp &lt;30d") + card(low, "Low/out") + card(Object.keys(cats).length, "Categories");
    fillFilter("fcat", "category", "All categories");
    fillFilter("fstatus", "status", "All statuses");
    fillDatalist();
    renderList();
  }
  function card(v, l) { return '<div class="card"><div class="n">' + v + '</div><div class="l">' + l + "</div></div>"; }
  function fillFilter(id, key, label) {
    var el = $(id), cur = el.value, vals = [];
    view.forEach(function (x) { if (x[key] && vals.indexOf(x[key]) < 0) vals.push(x[key]); });
    vals.sort();
    el.innerHTML = '<option value="">' + label + "</option>" + vals.map(function (v) { return "<option>" + esc(v) + "</option>"; }).join("");
    if (vals.indexOf(cur) >= 0) el.value = cur;
  }
  function fillDatalist() {
    var vals = []; view.forEach(function (x) { if (x.category && vals.indexOf(x.category) < 0) vals.push(x.category); });
    $("catlist").innerHTML = vals.sort().map(function (v) { return "<option value='" + esc(v) + "'>"; }).join("");
    $("placelist").innerHTML = allPlaces().map(function (p) { return "<option value='" + esc(p) + "'>"; }).join("");
  }
  function renderList() {
    var c = $("fcat").value, s = $("fstatus").value;
    var rows = view.filter(function (x) {
      return (!c || x.category === c) && (!locFilter || x.location === locFilter) && (!s || x.status === s);
    });
    if (tab === "expiring") rows = rows.filter(function (x) { var d = daysLeft(x.expiration); return d !== null && d < 30; });
    rows.sort(function (a, b) {
      var da = daysLeft(a.expiration), dbb = daysLeft(b.expiration);
      return (da === null ? 1e9 : da) - (dbb === null ? 1e9 : dbb);
    });
    if (!rows.length) { $("list").innerHTML = '<div class="empty">' + (tab === "expiring" ? "Nothing expiring soon 🎉" : "Nothing here. Tap + to add.") + "</div>"; return; }
    $("list").innerHTML = rows.map(function (x) {
      var thumb = x.photo ? '<img class="thumb" src="' + esc(x.photo) + '">' : '<div class="thumb"></div>';
      var loc = x.location || "Pantry";
      return '<div class="item" data-id="' + esc(x.id) + '">' + thumb +
        '<div class="body"><div class="nm">' + esc(x.item) + "</div>" +
        '<div class="meta"><span class="loctag lt-' + esc(loc) + '">' + esc(loc) + "</span>" +
        esc(x.quantity != null ? x.quantity : "") + " " + esc(x.unit || "") +
        (x.category ? " · " + esc(x.category) : "") + "</div></div>" +
        pill(daysLeft(x.expiration)) +
        '<div class="rowbtns"><button class="ib" data-act="edit" title="Edit">✎</button>' +
        '<button class="ib use" data-act="use">Use</button>' +
        '<button class="ib del" data-act="del" title="Delete">✕</button></div></div>';
    }).join("");
  }

  /* ---------- search ---------- */
  $("q").addEventListener("input", function () {
    var t = this.value.trim().toLowerCase(), a = $("answer");
    if (!t) { a.innerHTML = ""; return; }
    var m = view.filter(function (x) { return (x.item || "").toLowerCase().indexOf(t) >= 0 || (x.category || "").toLowerCase().indexOf(t) >= 0; });
    if (m.length) a.innerHTML = '<span class="have">✓ Yes</span> — ' + m.map(function (x) { return esc(x.item) + " (" + esc(x.quantity != null ? x.quantity : "") + " " + esc(x.unit || "") + ", " + esc(x.location || "") + ")"; }).join(", ");
    else a.innerHTML = '<span class="havent">✗ No</span> — "' + esc(this.value.trim()) + '" isn\'t in your pantry.';
  });

  /* ---------- list actions ---------- */
  $("list").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]"), row = e.target.closest(".item");
    if (!row) return;
    var it = items.filter(function (x) { return String(x.id) === row.dataset.id; })[0];
    if (!it) return;
    if (btn && btn.dataset.act === "use") openUse(it);
    else if (btn && btn.dataset.act === "edit") openForm(it);
    else if (btn && btn.dataset.act === "del") { if (confirm('Delete "' + it.item + '"? (No usage logged.)')) removeItem(it, false); }
    else openForm(it);
  });

  /* ---------- tabs / filters / location ---------- */
  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
    t.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
      t.classList.add("active"); tab = t.dataset.tab; renderList();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll("#locbar .seg"), function (sg) {
    sg.addEventListener("click", function () {
      document.querySelectorAll("#locbar .seg").forEach(function (x) { x.classList.remove("active"); });
      sg.classList.add("active"); locFilter = sg.dataset.loc; renderList();
    });
  });
  ["fcat", "fstatus"].forEach(function (id) { $(id).addEventListener("change", renderList); });
  $("reload").addEventListener("click", function (e) { e.preventDefault(); load(); });

  /* ---------- + menu ---------- */
  function openMenu() { $("menuModal").classList.add("open"); }
  function closeMenu() { $("menuModal").classList.remove("open"); }
  $("fab").addEventListener("click", openMenu);
  $("menuCancel").addEventListener("click", closeMenu);
  $("menuModal").addEventListener("click", function (e) { if (e.target === $("menuModal")) closeMenu(); });
  $("mManual").addEventListener("click", function () { closeMenu(); openForm(null); });
  $("mReceipt").addEventListener("click", function () { startScan("receipt"); });
  $("mReconcile").addEventListener("click", function () { startScan("reconcile"); });

  /* ---------- add / edit form ---------- */
  function openForm(it) {
    photoData = it && it.photo || null;
    $("mTitle").textContent = it ? "Edit item" : "Add item";
    $("fId").value = it ? it.id : "";
    $("fItem").value = it ? it.item || "" : "";
    $("fQty").value = it ? (it.quantity != null ? it.quantity : 1) : 1;
    $("fUnit").value = it ? it.unit || "" : "";
    $("fCat").value = it ? it.category || "" : "";
    $("fLoc").value = it ? validLoc(it.location) : "Pantry";
    $("fStatus").value = it ? it.status || "In Stock" : "In Stock";
    $("fPlace").value = it ? (it.place || activePlace) : activePlace;
    $("fExp").value = it ? it.expiration || "" : "";
    $("fNotes").value = it ? it.notes || "" : "";
    var p = $("photoPrev");
    if (photoData) { p.src = photoData; p.style.display = "block"; } else { p.style.display = "none"; }
    $("fPhoto").value = "";
    $("modal").classList.add("open");
  }
  function closeForm() { $("modal").classList.remove("open"); }
  $("cancelBtn").addEventListener("click", closeForm);
  $("modal").addEventListener("click", function (e) { if (e.target === $("modal")) closeForm(); });
  $("fPhoto").addEventListener("change", function () {
    var f = this.files && this.files[0]; if (!f) return;
    compress(f, 600, function (d) { photoData = d; var p = $("photoPrev"); p.src = d; p.style.display = "block"; });
  });
  $("saveBtn").addEventListener("click", function () {
    var name = $("fItem").value.trim();
    if (!name) { alert("Item name is required."); return; }
    var rec = {
      item: name, quantity: $("fQty").value === "" ? null : Number($("fQty").value),
      unit: $("fUnit").value.trim(), category: $("fCat").value.trim(),
      location: $("fLoc").value, status: $("fStatus").value, place: $("fPlace").value.trim() || activePlace,
      expiration: $("fExp").value || null, notes: $("fNotes").value.trim(), photo: photoData || null
    };
    var id = $("fId").value;
    if (!id) rec.source = "Manual";
    save(rec, id || null).then(closeForm);
  });

  /* ---------- partial "use" ---------- */
  function openUse(it) {
    useItem = it;
    var q = it.quantity != null ? it.quantity : 1;
    $("useTitle").textContent = 'Use "' + it.item + '"';
    $("useSub").textContent = "In stock: " + q + " " + (it.unit || "");
    $("useQty").value = q;
    $("useUnitLbl").textContent = it.unit || "";
    $("useModal").classList.add("open");
  }
  function closeUse() { $("useModal").classList.remove("open"); useItem = null; }
  $("useCancel").addEventListener("click", closeUse);
  $("useModal").addEventListener("click", function (e) { if (e.target === $("useModal")) closeUse(); });
  $("useApply").addEventListener("click", function () {
    if (!useItem || !db) { closeUse(); return; }
    var it = useItem, have = it.quantity != null ? Number(it.quantity) : 1, used = Number($("useQty").value);
    if (isNaN(used) || used <= 0) { closeUse(); return; }
    db.from("used_log").insert({ item: it.item, quantity_used: used + " " + (it.unit || ""), reason: "Used in app" })
      .then(function () {
        if (used >= have) return db.from("items").delete().eq("id", it.id);
        return db.from("items").update({ quantity: have - used }).eq("id", it.id);
      })
      .then(function (res) { if (res && res.error) alert("Update failed: " + res.error.message); closeUse(); load(); });
  });

  /* ---------- image compression ---------- */
  function compress(file, max, cb) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        if (w > h && w > max) { h = h * max / w; w = max; } else if (h > max) { w = w * max / h; h = max; }
        var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        cb(cv.toDataURL("image/jpeg", 0.7));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  /* ---------- scan / reconcile ---------- */
  var MAX_FRAMES = 8;
  var staged = [];
  function startScan(mode) {
    pendingMode = mode; staged = [];
    closeMenu();
    openScan(mode === "receipt" ? "Scan receipt" : "Reconcile shelf");
    renderStaging();
  }
  function renderStaging() {
    var noun = pendingMode === "receipt" ? "receipt" : "pantry";
    var head = staged.length
      ? '<div class="stage">' + staged.map(function (d, i) { return '<div class="sthumb"><img src="' + d + '"><button class="srm" data-rm="' + i + '">✕</button></div>'; }).join("") + "</div>"
      : '<p style="color:var(--muted);font-size:13px;margin:0 0 4px">Add one or more photos' + (pendingMode === "receipt" ? "" : " (or a short video)") + " of your " + noun + ". Snap several shelves, then analyze them together.</p>";
    var goLabel = staged.length ? "Analyze " + staged.length + " image" + (staged.length > 1 ? "s" : "") : "Analyze";
    $("scanBody").innerHTML = head +
      '<button class="btn ghost" id="stageAdd" style="margin-top:12px">➕ Add ' + (staged.length ? "more" : "photos") + (pendingMode === "receipt" ? "" : " / video") + "</button>" +
      '<div class="savebtns"><button class="btn ghost" id="scanCancel">Cancel</button>' +
      '<button class="btn primary" id="stageGo"' + (staged.length ? "" : " disabled") + ">" + goLabel + "</button></div>";
    $("stageAdd").onclick = function () { $("scanFile").click(); };
    $("scanCancel").onclick = closeScan;
    if (staged.length) $("stageGo").onclick = runAnalyze;
    Array.prototype.forEach.call(document.querySelectorAll("#scanBody [data-rm]"), function (b) {
      b.onclick = function () { staged.splice(Number(b.dataset.rm), 1); renderStaging(); };
    });
  }
  $("scanFile").addEventListener("change", function () {
    var files = this.files ? Array.prototype.slice.call(this.files) : [];
    this.value = "";
    if (!files.length || !pendingMode) return;
    scanSpinner("Processing photos…");
    collectImages(files, function (imgs) {
      staged = staged.concat(imgs);
      if (staged.length > MAX_FRAMES) staged = staged.slice(0, MAX_FRAMES);
      renderStaging();
    });
  });
  function runAnalyze() {
    if (!staged.length || !pendingMode) return;
    var mode = pendingMode;
    scanSpinner("Analyzing " + staged.length + " image" + (staged.length > 1 ? "s" : "") + "…");
    callScan(mode, staged.slice(), function (err, res) {
      if (err) { scanError("Couldn't reach the scanner. Is the Edge Function deployed? (see SCAN-SETUP.md) " + err.message); return; }
      if (!res.ok || (res.j && res.j.error)) { scanError(scanErrMsg(res.j)); return; }
      if (mode === "receipt") reviewReceipt(res.j); else reviewReconcile(res.j);
    });
  }
  // Turn the selected files (photos and/or a video) into a list of base64 images.
  function collectImages(files, done) {
    var out = [], i = 0;
    (function next() {
      if (i >= files.length || out.length >= MAX_FRAMES) { done(out); return; }
      var f = files[i++];
      if (f.type && f.type.indexOf("video") === 0) {
        extractFrames(f, 5, function (frames) { out = out.concat(frames); next(); });
      } else if (f.type && f.type.indexOf("image") === 0) {
        compress(f, 1100, function (d) { out.push(d); next(); });
      } else { next(); }
    })();
  }
  // Grab `count` evenly-spaced frames from a video, client-side.
  function extractFrames(file, count, cb) {
    var url = URL.createObjectURL(file), v = document.createElement("video"), frames = [], done = false;
    v.muted = true; v.playsInline = true; v.preload = "auto";
    function finish() { if (done) return; done = true; try { URL.revokeObjectURL(url); } catch (e) {} cb(frames); }
    v.addEventListener("error", finish);
    v.addEventListener("loadedmetadata", function () {
      var dur = v.duration;
      if (!isFinite(dur) || dur <= 0) { finish(); return; }
      var times = [], i; for (i = 1; i <= count; i++) times.push(dur * i / (count + 1));
      var idx = 0;
      function step() { if (idx >= times.length) { finish(); return; } v.currentTime = times[idx]; }
      v.addEventListener("seeked", function () {
        var max = 1000, w = v.videoWidth, h = v.videoHeight;
        if (w && h) {
          if (w > h && w > max) { h = h * max / w; w = max; } else if (h > max) { w = w * max / h; h = max; }
          var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
          cv.getContext("2d").drawImage(v, 0, 0, w, h);
          frames.push(cv.toDataURL("image/jpeg", 0.6));
        }
        idx++; step();
      });
      step();
    });
    v.src = url;
  }
  function callScan(mode, images, cb) {
    if (!configured) { cb(new Error("Not configured.")); return; }
    var url = SBURL + "/functions/v1/scan";
    var body = { mode: mode, images: Array.isArray(images) ? images : [images] };
    if (mode === "reconcile") body.inventory = view.map(function (x) {
      return { id: x.id, item: x.item, category: x.category, quantity: x.quantity, unit: x.unit, location: x.location, expiration: x.expiration };
    });
    fetch(url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + cfg.SUPABASE_ANON_KEY, "apikey": cfg.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }, function () { return { ok: r.ok, j: {} }; }); })
      .then(function (res) { cb(null, res); })
      .catch(function (e) { cb(e); });
  }
  function scanErrMsg(j) {
    var m = (j && (j.error || j.message)) || "Unknown error";
    if (j && j.detail) m += " — " + (typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail));
    return m;
  }
  function summarize(x) {
    var p = [(x.quantity != null ? x.quantity : 1) + " " + (x.unit || "")];
    if (x.location) p.push(x.location);
    if (x.category) p.push(x.category);
    if (x.expiration) p.push("exp " + x.expiration);
    return p.join(" · ");
  }
  function scanRowHtml(id, title, sub, checked) {
    return '<label class="scanrow"><input type="checkbox" data-i="' + esc(id) + '"' + (checked ? " checked" : "") +
      '><span class="info"><span class="t">' + esc(title) + '</span><span class="s">' + esc(sub) + "</span></span></label>";
  }
  function isChecked(id) { var el = document.querySelector('#scanBody input[data-i="' + id + '"]'); return el && el.checked; }

  function reviewReceipt(j) {
    var its = j.items || [];
    if (!its.length) { scanInfo("No items detected on that receipt. Try a clearer, well-lit photo."); return; }
    scanCurrent = { type: "receipt", items: its };
    var html = '<p style="color:var(--muted);font-size:13px;margin:0 0 10px">Found ' + its.length + ' item(s). Uncheck anything you don\'t want, then add. You can fine-tune details after by tapping an item.</p>';
    html += its.map(function (x, i) { return scanRowHtml(i, x.item, summarize(x), true); }).join("");
    html += '<div class="savebtns"><button class="btn ghost" id="scanCancel">Cancel</button><button class="btn primary" id="scanApply">Add selected</button></div>';
    $("scanBody").innerHTML = html; wireScanButtons();
  }
  function applyReceipt() {
    var recs = [];
    scanCurrent.items.forEach(function (x, i) {
      if (isChecked(i)) recs.push({ item: x.item, category: x.category || "", quantity: numOr(x.quantity, 1), unit: x.unit || "", location: validLoc(x.location), status: "In Stock", expiration: x.expiration || null, notes: x.notes || "", place: activePlace, source: "Receipt" });
    });
    if (!recs.length) { closeScan(); return; }
    scanSpinner("Adding " + recs.length + " item(s)…");
    db.from("items").insert(recs).then(function (res) { if (res.error) alert("Add failed: " + res.error.message); closeScan(); load(); });
  }
  function reviewReconcile(j) {
    var add = j.add || [], missing = j.missing || [], changed = j.changed || [];
    scanCurrent = { type: "reconcile", add: add, missing: missing, changed: changed };
    if (!add.length && !missing.length && !changed.length) { scanInfo("No changes detected — your inventory matches the photo. 👍"); return; }
    var html = "";
    if (add.length) { html += '<div class="scanhdr">➕ New items to add</div>' + add.map(function (x, i) { return scanRowHtml("a" + i, x.item, summarize(x), true); }).join(""); }
    if (changed.length) { html += '<div class="scanhdr">🔁 Quantity changes</div>' + changed.map(function (x, i) { return scanRowHtml("c" + i, x.item, "set quantity to " + x.quantity, true); }).join(""); }
    if (missing.length) { html += '<div class="scanhdr">➖ Looks used up — remove?</div>' + missing.map(function (x, i) { return scanRowHtml("m" + i, x.item, "not visible in photo", false); }).join(""); }
    html += '<div class="savebtns"><button class="btn ghost" id="scanCancel">Cancel</button><button class="btn primary" id="scanApply">Apply changes</button></div>';
    $("scanBody").innerHTML = html; wireScanButtons();
  }
  function applyReconcile() {
    var ops = [];
    scanCurrent.add.forEach(function (x, i) { if (isChecked("a" + i)) ops.push(function () { return db.from("items").insert([{ item: x.item, category: x.category || "", quantity: numOr(x.quantity, 1), unit: x.unit || "", location: validLoc(x.location), status: "In Stock", expiration: x.expiration || null, notes: x.notes || "", place: activePlace, source: "Photo" }]); }); });
    scanCurrent.changed.forEach(function (x, i) { if (isChecked("c" + i) && x.id) ops.push(function () { return db.from("items").update({ quantity: numOr(x.quantity, 1) }).eq("id", x.id); }); });
    scanCurrent.missing.forEach(function (x, i) { if (isChecked("m" + i) && x.id) { ops.push(function () { return db.from("used_log").insert([{ item: x.item, quantity_used: "", reason: "Reconcile: not visible in photo" }]); }); ops.push(function () { return db.from("items").delete().eq("id", x.id); }); } });
    if (!ops.length) { closeScan(); return; }
    scanSpinner("Applying changes…");
    var p = Promise.resolve();
    ops.forEach(function (op) { p = p.then(op); });
    p.then(function () { closeScan(); load(); }).catch(function (e) { alert("Some changes failed: " + e.message); closeScan(); load(); });
  }

  function openScan(title) { $("scanTitle").textContent = title; $("scanModal").classList.add("open"); }
  function closeScan() { $("scanModal").classList.remove("open"); scanCurrent = null; staged = []; }
  function scanSpinner(msg) { $("scanBody").innerHTML = '<div class="spinner"><div class="spin"></div><div>' + esc(msg) + "</div></div>"; }
  function scanError(msg) { $("scanBody").innerHTML = '<p style="color:var(--red);font-size:14px">⚠️ ' + esc(msg) + '</p><div class="savebtns"><button class="btn ghost" id="scanCancel">Close</button></div>'; $("scanCancel").onclick = closeScan; }
  function scanInfo(msg) { $("scanBody").innerHTML = '<p style="font-size:14px">' + esc(msg) + '</p><div class="savebtns"><button class="btn ghost" id="scanCancel">Close</button></div>'; $("scanCancel").onclick = closeScan; }
  function wireScanButtons() {
    var c = $("scanCancel"), a = $("scanApply");
    if (c) c.onclick = closeScan;
    if (a) a.onclick = function () { scanCurrent.type === "receipt" ? applyReceipt() : applyReconcile(); };
  }

  /* ---------- boot ---------- */
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
  load();

  // exposed for the automated smoke test (harmless in normal use)
  window.__pantry = { reviewReceipt: reviewReceipt, reviewReconcile: reviewReconcile, openUse: openUse, getItems: function () { return items; }, setItems: function (v) { items = v; } };
})();
