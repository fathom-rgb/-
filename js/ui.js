// ============================================================
// 《大学文字模拟器》 ui.js —— 界面渲染与交互（DOM）
// 依赖：engine.js（G.UNISIM）与 css/style.css
// ============================================================
(function () {
  "use strict";
  var U = window.UNISIM;
  if (!U) throw new Error("ui.js: 请先加载 engine.js");

  var $ = function (id) { return document.getElementById(id); };
  var SAVE_KEY = "unisim_save_v1";
  var GALLERY_KEY = "unisim_gallery_v1";
  var COUNT_KEY = "unisim_count_v1";

  // ---------- 工具 ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function show(id) {
    var screens = document.querySelectorAll(".screen");
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove("active");
    $(id).classList.add("active");
    window.scrollTo(0, 0);
  }
  function pathName(p) {
    var m = { kaoyan: "考研", civil: "考公", job: "就业", startup: "创业", lieflat: "躺平", postgrad: "保研" };
    return p ? m[p] || p : "";
  }  function saveState() {
    if (!current) return;
    try { localStorage.setItem(SAVE_KEY, U.serialize(current)); } catch (e) { /* ignore */ }
  }
  function loadGallery() {
    try { return JSON.parse(localStorage.getItem(GALLERY_KEY) || "[]"); } catch (e) { return []; }
  }
  function addToGallery(id) {
    var g = loadGallery();
    if (g.indexOf(id) < 0) g.push(id);
    try { localStorage.setItem(GALLERY_KEY, JSON.stringify(g)); } catch (e) { /* ignore */ }
  }
  function addCount() {
    try {
      var n = parseInt(localStorage.getItem(COUNT_KEY) || "0", 10) + 1;
      localStorage.setItem(COUNT_KEY, String(n));
      $("play-count").textContent = "你已体验过 " + n + " 段大学时光";
    } catch (e) { /* ignore */ }
  }

  var current = null;   // 当前状态
  var lastFeedLen = 0;  // 已渲染 feed 长度
  var pendingView = null; // 当前视图

  // ---------- 字符卡选项构建 ----------
  var profile = { name: "", personaId: null, familyId: null, majorId: null, crushName: "", crushTypeId: null };

  function buildOptGrid(containerId, list, keyName, onClick) {
    var box = $(containerId);
    box.innerHTML = "";
    list.forEach(function (item) {
      var card = el("div", "opt-card");
      var b = el("b", null, (item.icon ? item.icon + " " : "") + item.name);
      var sp = el("span", null, item.desc);
      card.appendChild(b); card.appendChild(sp);
      card.onclick = function () { onClick(item); };
      box.appendChild(card);
    });
  }
  function paintSelection(containerId, selectedId) {
    var cards = $(containerId).children;
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle("sel", false);
    }
    // 依据选中 id 反查当前列表渲染顺序有损，改为数据驱动高亮由 onclick 即时处理
  }

  // 简化：重新渲染时给选中项加样式
  function paintOpt(containerId, list, selectedId) {
    var box = $(containerId);
    var cards = box.children;
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle("sel", list[i] && list[i].id === selectedId);
    }
  }

  // ---------- 主菜单 ----------
  function initHome() {
    var saveExists = false;
    try { saveExists = !!localStorage.getItem(SAVE_KEY); } catch (e) { }
    $("btn-continue").style.display = saveExists ? "inline-block" : "none";
    try {
      var n = parseInt(localStorage.getItem(COUNT_KEY) || "0", 10);
      $("play-count").textContent = n ? "你已体验过 " + n + " 段大学时光" : "";
    } catch (e) { }
  }

  function goCreate(randomFill) {
    profile = { name: "", personaId: null, familyId: null, majorId: null, crushName: "", crushTypeId: null };
    if (randomFill) {
      profile.personaId = U.DATA.personas[Math.floor(Math.random() * U.DATA.personas.length)].id;
      profile.familyId = U.DATA.families[Math.floor(Math.random() * U.DATA.families.length)].id;
      profile.majorId = U.DATA.majors[Math.floor(Math.random() * U.DATA.majors.length)].id;
      profile.crushTypeId = U.DATA.crushTypes[Math.floor(Math.random() * U.DATA.crushTypes.length)].id;
      $("c-name").value = "";
      $("c-crush").value = "";
    }
    renderCreate();
    show("screen-create");
  }

  function renderCreate() {
    buildOptGrid("c-personas", U.DATA.personas, "persona", function (it) { profile.personaId = it.id; paintOpt("c-personas", U.DATA.personas, profile.personaId); });
    buildOptGrid("c-families", U.DATA.families, "family", function (it) { profile.familyId = it.id; paintOpt("c-families", U.DATA.families, profile.familyId); });
    buildOptGrid("c-majors", U.DATA.majors, "major", function (it) { profile.majorId = it.id; paintOpt("c-majors", U.DATA.majors, profile.majorId); });
    buildOptGrid("c-crushtypes", U.DATA.crushTypes, "crushType", function (it) { profile.crushTypeId = it.id; paintOpt("c-crushtypes", U.DATA.crushTypes, profile.crushTypeId); });
    paintOpt("c-personas", U.DATA.personas, profile.personaId);
    paintOpt("c-families", U.DATA.families, profile.familyId);
    paintOpt("c-majors", U.DATA.majors, profile.majorId);
    paintOpt("c-crushtypes", U.DATA.crushTypes, profile.crushTypeId);
  }

  function beginGame() {
    profile.name = $("c-name").value.trim();
    profile.crushName = $("c-crush").value.trim();
    if (!profile.personaId) profile.personaId = U.DATA.personas[Math.floor(Math.random() * U.DATA.personas.length)].id;
    if (!profile.familyId) profile.familyId = U.DATA.families[Math.floor(Math.random() * U.DATA.families.length)].id;
    if (!profile.majorId) profile.majorId = U.DATA.majors[Math.floor(Math.random() * U.DATA.majors.length)].id;
    if (!profile.crushTypeId) profile.crushTypeId = U.DATA.crushTypes[Math.floor(Math.random() * U.DATA.crushTypes.length)].id;
    current = U.newGame(profile);
    lastFeedLen = 0;
    pendingView = U.start(current);
    addCount();
    enterGame();
  }

  function continueGame() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      current = U.deserialize(raw);
      lastFeedLen = 0;
      pendingView = U.view(current);
      enterGame();
    } catch (e) {
      alert("存档读取失败：" + e.message);
    }
  }

  // ---------- 游戏界面 ----------
  function enterGame() {
    show("screen-game");
    renderStatus();
    $("log").innerHTML = "";
    lastFeedLen = 0;
    renderFeedAll();
    renderChoices();
    if (pendingView && pendingView.type === "ending") { showEnding(pendingView.ending); return; }
    if (!current.over) saveState();
  }

  function renderStatus() {
    if (!current) return;
    var fam = U.DATA.families.find(function (f) { return f.id === current.meta.familyId; });
    $("g-name").textContent = current.meta.name;
    $("g-major").textContent = " · " + (U.DATA.majors.find(function (m) { return m.id === current.meta.majorId; }) || {}).name;
    $("g-path").textContent = current.path ? pathName(current.path) : "自由探索";
    $("g-time").textContent = U.semNames[current.sem - 1] + " · 第 " + current.week + " 周";
    $("g-money").textContent = current.money;
    $("g-fam").textContent = "(" + fam.name + ")";
    $("num-ac").textContent = current.ac; $("bar-ac").style.width = current.ac + "%";
    $("num-so").textContent = current.so; $("bar-so").style.width = current.so + "%";
    $("num-hp").textContent = current.hp; $("bar-hp").style.width = current.hp + "%";
    $("num-mo").textContent = current.mo; $("bar-mo").style.width = current.mo + "%";
    $("num-love").textContent = current.love; $("bar-love").style.width = current.love + "%";
    $("r-gpa").textContent = current.gpaAvg.toFixed(2);
    $("r-fails").textContent = current.fails;
    $("r-scholar").textContent = current.scholarshipCnt;
    var crushInfo = current.crushMet ? ("❤ " + current.meta.crushName + (current.couple ? "（在一起了）" : "（好感" + current.love + "）")) : "❤ 尚未遇见TA";
    $("r-crush").textContent = crushInfo;
  }

  function feedNode(entry) {
    var kind = entry.kind, data = entry.data;
    if (kind === "header") { var h = el("div", "entry header", data); return h; }
    if (kind === "para") { return el("div", "entry para", data); }
    if (kind === "act") {
      var a = el("div", "entry act");
      var t = el("div", "et", (data.icon ? data.icon + " " : "") + data.name);
      a.appendChild(t); a.appendChild(el("div", null, data.text));
      return a;
    }
    if (kind === "beat" || kind === "event") {
      var b = el("div", "entry " + kind);
      var bt = el("div", "et", (data.icon ? data.icon + " " : "") + data.title);
      b.appendChild(bt);
      var body = el("div", null); body.textContent = data.text; body.style.whiteSpace = "pre-line";
      b.appendChild(body);
      return b;
    }
    if (kind === "exam") {
      var e = el("div", "entry exam " + (data.pass ? "pass" : "fail"),
        "📝 " + U.semNames[(data.sem || 1) - 1] + " 期末：" + data.score + " 分 · 绩点 " + data.gpa.toFixed(1) + (data.pass ? " · 通过" : " · 挂科"));
      return e;
    }
    return el("div", "entry", JSON.stringify(entry));
  }

  function renderFeedAll() {
    var log = $("log");
    while (lastFeedLen < current.feed.length) {
      log.appendChild(feedNode(current.feed[lastFeedLen]));
      lastFeedLen++;
    }
    log.scrollTop = log.scrollHeight;
  }

  function renderChoices() {
    var box = $("choices");
    box.innerHTML = "";
    if (!pendingView || pendingView.type === "ending") return;
    var opts;
    if (pendingView.type === "action") {
      pendingView.actions.forEach(function (a) {
        var btn = el("div", "choice", (a.icon ? a.icon + " " : "") + a.name + (a.desc ? " —— " + a.desc : ""));
        btn.onclick = function () { onAction(a.id); };
        box.appendChild(btn);
      });
      return;
    }
    if (pendingView.type === "beat" || pendingView.type === "event") {
      pendingView.options.forEach(function (o) {
        var btn = el("div", "choice" + (o.enabled ? "" : " off"), (o.enabled ? "👉 " : "🔒 ") + o.label);
        btn.onclick = function () { if (o.enabled) onOption(pendingView.type, o.idx); };
        box.appendChild(btn);
      });
    }
  }

  function onAction(actionId) {
    pendingView = U.chooseAction(current, actionId);
    afterStep();
  }
  function onOption(kind, idx) {
    pendingView = U.chooseOption(current, kind, idx);
    afterStep();
  }
  function afterStep() {
    renderStatus();
    renderFeedAll();
    renderChoices();
    saveState();
    if (pendingView && pendingView.type === "ending") showEnding(pendingView.ending);
  }

  // ---------- 结局 ----------
  function showEnding(info) {
    addToGallery(info.id);
    $("end-icon").textContent = info.icon;
    $("end-title").textContent = info.name;
    $("end-name").textContent = info.title;
    $("end-rank").textContent = "结局评级 " + info.rank;
    $("end-text").textContent = info.text;
    $("end-epilog").textContent = info.epilog ? "—— " + info.epilog : "";
    var st = info.stats || {};
    var famName = current && current.meta ? (U.DATA.families.find(function (f) { return f.id === current.meta.familyId; }) || {}).name : "";
    $("end-stats").innerHTML = "";
    var items = [
      "🎯 绩点 " + (st.gpa || 0).toFixed(2),
      "📉 挂科 " + (st.fails || 0) + " 门",
      "💰 余款 " + (st.money || 0) + " 元",
      "🏅 奖学金 " + (st.scholarship || 0) + " 次",
      st.couple ? ("❤ 和TA走到了毕业") : ("❤ 恋爱值 " + (st.love || 0)),
      "🧭 方向：" + pathName(st.path)
    ];
    items.forEach(function (t) {
      var s = el("span", null, t);
      $("end-stats").appendChild(s);
    });
    show("screen-ending");
  }

  // ---------- 图鉴 ----------
  function renderGallery() {
    var box = $("gallery-list");
    box.innerHTML = "";
    var got = loadGallery();
    var list = U.DATA.endings.slice().sort(function (a, b) {
      var order = { S: 0, A: 1, B: 2, C: 3, D: 4 };
      return (order[a.rank] || 9) - (order[b.rank] || 9) || (a.id < b.id ? -1 : 1);
    });
    list.forEach(function (e) {
      var unlocked = got.indexOf(e.id) >= 0;
      var card = el("div", "g-item" + (unlocked ? "" : " locked"));
      var ic = el("div", "gi", e.icon);
      var nm = el("b", null, unlocked ? e.name : "？？？");
      var rk = el("div", "rk", unlocked ? ("评级 " + e.rank + " · " + e.title) : "尚未解锁");
      card.appendChild(ic); card.appendChild(nm); card.appendChild(rk);
      box.appendChild(card);
    });
    show("screen-gallery");
  }

  // ---------- 事件绑定 ----------
  function bind() {
    $("btn-new").onclick = function () { goCreate(false); };
    $("btn-random").onclick = function () { goCreate(true); };
    $("btn-continue").onclick = continueGame;
    $("btn-begin").onclick = beginGame;
    $("btn-save").onclick = function () { saveState(); alert("已保存，可放心回到主菜单。"); };
    $("btn-menu").onclick = function () { if (confirm("回到主菜单？当前进度已自动保存。")) { show("screen-home"); initHome(); } };
    $("btn-gallery").onclick = renderGallery;
    $("btn-gallery2").onclick = renderGallery;
    $("btn-gback").onclick = function () { show("screen-home"); initHome(); };
    $("btn-again").onclick = function () { goCreate(false); };
    $("btn-home2").onclick = function () { show("screen-home"); initHome(); };
  }

  bind();
  initHome();
  show("screen-home");
})();
