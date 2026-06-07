/* Pantry Inventory PWA — talks to Supabase, works on phone + web. */
(function () {
  "use strict";
  var cfg = window.PANTRY_CONFIG || {};
  var configured = cfg.SUPABASE_URL && cfg.SUPABASE_URL.indexOf("YOUR-PROJECT") === -1 &&
                   cfg.SUPABASE_ANON_KEY && cfg.SUPABASE_ANON_KEY.indexOf("YOUR-") === -1;
  var db = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  var $ = function (id) { return document.getElementById(id); };
  var items = [];
  var tab = "all";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function today() { var d = new Date(); d.setHours(0,0,0,0); return d; }
  function daysLeft(exp) {
    if (!exp) return null;
    var e = new Date(exp + "T00:00:00");
    return Math.round((e - today()) / 86400000);
  }
  function pill(dl) {
    if (dl === null) return '<span class="pill d-gray">no date</span>';
    var c = dl < 7 ? "d-red" : dl <= 30 ? "d-yellow" : "d-green";
    var t = dl < 0 ? Math.abs(dl) + "d ago" : dl + "d";
    return '<span class="pill ' + c + '">' + t + "</span>";
  }
  function banner(msg) { var b = $("banner"); b.innerHTML = msg; b.style.display = msg ? "block" : "none"; }
  function cacheLocal() { try { localStorage.setItem("pantry_cache", JSON.stringify(items)); } catch (e) {} }
  function loadLocal() { try { return JSON.parse(localStorage.getItem("pantry_cache") || "[]"); } catch (e) { return []; } }

  /* ---------- data ---------- */
  function load() {
    if (!db) {
      banner("⚙️ Not connected yet. Add your Supabase URL + key in <b>config.js</b> (see DEPLOY-GUIDE.md). Showing last cached data.");
      items = loadLocal(); render(); return;
    }
    $("sub").textContent = "Syncing…";
    db.from("items").select("*").order("expiration", { ascending: true }).then(function (res) {
      if (res.error) {
        banner("⚠️ Couldn't reach the database: " + esc(res.error.message) + ". Showing cached data.");
        items = loadLocal();
      } else {
        banner("");
        items = res.data || [];
        cacheLocal();
      }
      render();
    });
  }

  function save(rec, id) {
    if (!db) { alert("Connect Supabase first (see DEPLOY-GUIDE.md)."); return Promise.resolve(); }
    var q = id ? db.from("items").update(rec).eq("id", id) : db.from("items").insert(rec);
    return q.then(function (res) {
      if (res.error) alert("Save failed: " + res.error.message);
      load();
    });
  }
  function removeItem(it, logUsed) {
    if (!db) return;
    var chain = Promise.resolve();
    if (logUsed) {
      chain = db.from("used_log").insert({
        item: it.item, quantity_used: (it.quantity || "") + " " + (it.unit || ""),
        reason: "Marked used in app"
      });
    }
    chain.then(function () {
      return db.from("items").delete().eq("id", it.id);
    }).then(function (res) {
      if (res && res.error) alert("Delete failed: " + res.error.message);
      load();
    });
  }

  /* ---------- render ---------- */
  function render() {
    var n = items.length;
    $("sub").textContent = n + " items" + (configured ? " · synced" : " · offline");
    var exp = items.filter(function (x) { var d = daysLeft(x.expiration); return d !== null && d < 30; }).length;
    var low = items.filter(function (x) { return x.status === "Low" || x.status === "Out"; }).length;
    var cats = {};
    items.forEach(function (x) { if (x.category) cats[x.category] = 1; });
    $("cards").innerHTML =
      card(n, "Items") + card(exp, "Exp &lt;30d") + card(low, "Low/out") + card(Object.keys(cats).length, "Categories");

    fillFilter("fcat", "category", "All categories");
    fillFilter("floc", "location", "All locations");
    fillFilter("fstatus", "status", "All statuses");
    fillDatalist();
    renderList();
  }
  function card(v, l) { return '<div class="card"><div class="n">' + v + '</div><div class="l">' + l + "</div></div>"; }

  function fillFilter(id, key, label) {
    var el = $(id), cur = el.value;
    var vals = []; items.forEach(function (x) { if (x[key] && vals.indexOf(x[key]) < 0) vals.push(x[key]); });
    vals.sort();
    el.innerHTML = '<option value="">' + label + "</option>" +
      vals.map(function (v) { return "<option>" + esc(v) + "</option>"; }).join("");
    if (vals.indexOf(cur) >= 0) el.value = cur;
  }
  function fillDatalist() {
    var vals = []; items.forEach(function (x) { if (x.category && vals.indexOf(x.category) < 0) vals.push(x.category); });
    $("catlist").innerHTML = vals.sort().map(function (v) { return "<option value='" + esc(v) + "'>"; }).join("");
  }

  function renderList() {
    var c = $("fcat").value, l = $("floc").value, s = $("fstatus").value;
    var rows = items.filter(function (x) {
      return (!c || x.category === c) && (!l || x.location === l) && (!s || x.status === s);
    });
    if (tab === "expiring") {
      rows = rows.filter(function (x) { var d = daysLeft(x.expiration); return d !== null && d < 30; });
    }
    rows.sort(function (a, b) {
      var da = daysLeft(a.expiration), dbb = daysLeft(b.expiration);
      da = da === null ? 1e9 : da; dbb = dbb === null ? 1e9 : dbb;
      return da - dbb;
    });
    if (!rows.length) { $("list").innerHTML = '<div class="empty">' + (tab === "expiring" ? "Nothing expiring soon 🎉" : "No items. Tap + to add one.") + "</div>"; return; }
    $("list").innerHTML = rows.map(function (x) {
      var thumb = x.photo ? '<img class="thumb" src="' + esc(x.photo) + '">' : '<div class="thumb"></div>';
      return '<div class="item" data-id="' + esc(x.id) + '">' + thumb +
        '<div class="body"><div class="nm">' + esc(x.item) + "</div>" +
        '<div class="meta">' + esc(x.quantity != null ? x.quantity : "") + " " + esc(x.unit || "") +
        " · " + esc(x.location || "") + (x.category ? " · " + esc(x.category) : "") + "</div></div>" +
        pill(daysLeft(x.expiration)) +
        '<div class="rowbtns"><button class="ib used" data-act="used">Used</button>' +
        '<button class="ib del" data-act="del">✕</button></div></div>';
    }).join("");
  }

  /* ---------- search ---------- */
  $("q").addEventListener("input", function () {
    var t = this.value.trim().toLowerCase(), a = $("answer");
    if (!t) { a.innerHTML = ""; return; }
    var m = items.filter(function (x) {
      return (x.item || "").toLowerCase().indexOf(t) >= 0 || (x.category || "").toLowerCase().indexOf(t) >= 0;
    });
    if (m.length) {
      a.innerHTML = '<span class="have">✓ Yes</span> — ' + m.map(function (x) {
        return esc(x.item) + " (" + esc(x.quantity != null ? x.quantity : "") + " " + esc(x.unit || "") + ", " + esc(x.location || "") + ")";
      }).join(", ");
    } else {
      a.innerHTML = '<span class="havent">✗ No</span> — "' + esc(this.value.trim()) + '" isn\'t in your pantry.';
    }
  });

  /* ---------- list actions ---------- */
  $("list").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]"), row = e.target.closest(".item");
    if (!row) return;
    var it = items.filter(function (x) { return String(x.id) === row.dataset.id; })[0];
    if (!it) return;
    if (btn && btn.dataset.act === "used") {
      if (confirm('Mark "' + it.item + '" as used up? It will be logged and removed.')) removeItem(it, true);
    } else if (btn && btn.dataset.act === "del") {
      if (confirm('Delete "' + it.item + '"?')) removeItem(it, false);
    } else {
      openForm(it);
    }
  });

  /* ---------- tabs / filters ---------- */
  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
    t.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
      t.classList.add("active"); tab = t.dataset.tab; renderList();
    });
  });
  ["fcat", "floc", "fstatus"].forEach(function (id) { $(id).addEventListener("change", renderList); });
  $("reload").addEventListener("click", function (e) { e.preventDefault(); load(); });

  /* ---------- add / edit form ---------- */
  var photoData = null;
  function openForm(it) {
    photoData = it && it.photo || null;
    $("mTitle").textContent = it ? "Edit item" : "Add item";
    $("fId").value = it ? it.id : "";
    $("fItem").value = it ? it.item || "" : "";
    $("fQty").value = it ? (it.quantity != null ? it.quantity : 1) : 1;
    $("fUnit").value = it ? it.unit || "" : "";
    $("fCat").value = it ? it.category || "" : "";
    $("fLoc").value = it ? it.location || "Pantry" : "Pantry";
    $("fStatus").value = it ? it.status || "In Stock" : "In Stock";
    $("fExp").value = it ? it.expiration || "" : "";
    $("fNotes").value = it ? it.notes || "" : "";
    var p = $("photoPrev");
    if (photoData) { p.src = photoData; p.style.display = "block"; } else { p.style.display = "none"; }
    $("fPhoto").value = "";
    $("modal").classList.add("open");
  }
  function closeForm() { $("modal").classList.remove("open"); }
  $("fab").addEventListener("click", function () { openForm(null); });
  $("cancelBtn").addEventListener("click", closeForm);
  $("modal").addEventListener("click", function (e) { if (e.target === $("modal")) closeForm(); });

  $("fPhoto").addEventListener("change", function () {
    var f = this.files && this.files[0]; if (!f) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var max = 600, w = img.width, h = img.height;
        if (w > h && w > max) { h = h * max / w; w = max; } else if (h > max) { w = w * max / h; h = max; }
        var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        photoData = cv.toDataURL("image/jpeg", 0.6);
        var p = $("photoPrev"); p.src = photoData; p.style.display = "block";
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(f);
  });

  $("saveBtn").addEventListener("click", function () {
    var name = $("fItem").value.trim();
    if (!name) { alert("Item name is required."); return; }
    var rec = {
      item: name,
      quantity: $("fQty").value === "" ? null : Number($("fQty").value),
      unit: $("fUnit").value.trim(),
      category: $("fCat").value.trim(),
      location: $("fLoc").value,
      status: $("fStatus").value,
      expiration: $("fExp").value || null,
      notes: $("fNotes").value.trim(),
      photo: photoData || null
    };
    var id = $("fId").value;
    if (!id) rec.source = "Manual";
    save(rec, id || null).then(closeForm);
  });

  /* ---------- boot ---------- */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  load();
})();
