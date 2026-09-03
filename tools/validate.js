// ============================================================
// tools/validate.js —— 数据完整性校验（Node）
// 运行：node tools/validate.js
// 加载全部 js/data + engine，检查 id 唯一、字段合法、必填覆盖。
// ============================================================
"use strict";
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");

const FILES = [
  "js/data/core.js", "js/data/actions.js",
  "js/data/events_junior.js", "js/data/events_senior.js",
  "js/data/beats.js", "js/data/endings.js", "js/engine.js"
];

const FX_KEYS = ["ac", "so", "hp", "mo", "money", "love", "counters", "flags", "removeFlags"];
const COUNTER_KEYS = ["study", "social", "work", "club", "play", "rest", "date", "meet"];
const COND_KEYS = [
  "minAc", "maxAc", "minSo", "maxSo", "minHp", "maxHp", "minMo", "maxMo",
  "minMoney", "maxMoney", "minLove", "maxLove", "semIn", "yearIn", "minSem", "maxSem",
  "path", "pathNull", "hasCrush", "noCrush", "isCouple", "notCouple",
  "flagsAll", "flagsAny", "notFlag", "majors", "families", "counters"
];
const FLAG_SET = new Set([
  "club_joined", "club_leader", "scholarship_1", "scholarship_2", "scholarship_3",
  "top_gpa", "comp_win", "research", "cert_cet4", "cert_cet6", "intern_offer",
  "job_offer", "job_big", "kaoyan_admit", "civil_admit", "startup_fund",
  "startup_small", "couple", "crush_met", "confessed", "heartbroken",
  "game_addict", "poor_loan", "dropschool", "gapi_yr", "doctor", "legend", "streamer"
]);
const PATHS = ["kaoyan", "civil", "job", "startup", "lieflat", "postgrad"];
const ACTION_IDS = ["study", "club", "work", "sport", "rest", "play", "social", "date", "court", "kaoyan", "civil", "startup", "net"];
// 必填节拍时点（sem, week, path或null）
const BEAT_SLOTS = [
  { sem: 1, week: 1, path: null },
  { sem: 1, week: 4, path: null },
  { sem: 2, week: 2, path: null },
  { sem: 2, week: 12, path: null },
  { sem: 3, week: 6, path: null },
  { sem: 4, week: 12, path: null },
  { sem: 5, week: 13, path: null },   // 岔路口
];
["kaoyan", "civil", "job", "startup", "lieflat"].forEach((p) => {
  BEAT_SLOTS.push({ sem: 6, week: 1, path: p });
  BEAT_SLOTS.push({ sem: 7, week: 4, path: p });
  BEAT_SLOTS.push({ sem: 7, week: 8, path: p });
  BEAT_SLOTS.push({ sem: 7, week: 12, path: p });
  BEAT_SLOTS.push({ sem: 8, week: 4, path: p });
});
BEAT_SLOTS.push({ sem: 8, week: 8, path: null });

// ---------- 加载 ----------
for (const f of FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { console.error(`✗ 缺少文件 ${f}`); process.exit(1); }
  require(p);
}
const DATA = globalThis.DATA;
const errors = [];
const warns = [];

function uniq(arr, tag) {
  const seen = new Set();
  arr.forEach((x) => {
    if (!x.id) { errors.push(`${tag}: 存在无 id 的条目`); return; }
    if (seen.has(x.id)) errors.push(`${tag}: id 重复「${x.id}」`);
    seen.add(x.id);
  });
}

// ---------- 各集合检查 ----------
uniq(DATA.actions, "actions");
uniq(DATA.events, "events");
uniq(DATA.beats, "beats");
uniq(DATA.endings, "endings");

// actions 覆盖
const actionIds = new Set(DATA.actions.map((a) => a.id));
ACTION_IDS.forEach((id) => { if (!actionIds.has(id)) errors.push(`actions: 缺少行动「${id}」`); });

// endings 覆盖
const endingIds = new Set(DATA.endings.map((e) => e.id));
for (let i = 1; i <= 20; i++) {
  const id = "E" + String(i).padStart(2, "0");
  if (!endingIds.has(id)) errors.push(`endings: 缺少结局「${id}」`);
}
DATA.endings.forEach((e) => {
  if (!e.text || e.text.length < 150) warns.push(`endings: ${e.id} 文案偏短(${e.text ? e.text.length : 0})`);
  if (!e.rank) warns.push(`endings: ${e.id} 缺 rank`);
});

// beats 必填槽位
function beatSlotKey(b) {
  const w = b.at ? b.at.week : -1;
  return (b.at ? b.at.sem : -1) + "_" + w + "_" + (b.path || "");
}
const slotMap = {};
DATA.beats.forEach((b) => {
  const k = beatSlotKey(b);
  slotMap[k] = (slotMap[k] || 0) + 1;
});
// 同一槽位(含 path)只能有一个节拍，否则后写的永远无法触发
Object.keys(slotMap).forEach((k) => {
  if (slotMap[k] > 1) errors.push(`beats: 槽位 ${k} 存在 ${slotMap[k]} 个节拍（会互相顶掉）`);
});
BEAT_SLOTS.forEach((s) => {
  const k = s.sem + "_" + s.week + "_" + (s.path || "");
  if (!slotMap[k]) errors.push(`beats: 缺少槽位 sem${s.sem}w${s.week} path=${s.path || "通用"}`);
});
// 岔路口必须有 setPath 选项且 setPath 只出现在 b_s5_w13
DATA.beats.forEach((b) => {
  const isCross = b.id === "b_s5_w13";
  (b.options || []).forEach((o) => {
    if (o.setPath !== undefined && !isCross) {
      errors.push(`beats: ${b.id} 的选项非法使用 setPath(${o.setPath})（只允许 b_s5_w13）`);
    }
    if (o.setPath !== undefined && PATHS.indexOf(o.setPath) < 0) {
      errors.push(`beats: ${b.id} 使用了未知 path「${o.setPath}」`);
    }
  });
  if (isCross) {
    const paths = (b.options || []).map((o) => o.setPath).filter(Boolean);
    ["kaoyan", "civil", "job", "startup", "lieflat"].forEach((p) => {
      if (paths.indexOf(p) < 0) errors.push(`beats: b_s5_w13 缺少 path「${p}」选项`);
    });
  }
});

// fx / cond 键合法性
function checkFx(obj, where) {
  if (!obj) return;
  Object.keys(obj).forEach((k) => {
    if (FX_KEYS.indexOf(k) < 0) errors.push(`${where}: fx 含未知键「${k}」`);
  });
  if (obj.counters) {
    Object.keys(obj.counters).forEach((k) => {
      if (COUNTER_KEYS.indexOf(k) < 0) errors.push(`${where}: counters 含未知键「${k}」`);
    });
  }
  if (obj.flags) obj.flags.forEach((f) => { if (!FLAG_SET.has(f)) warns.push(`${where}: 使用了未注册 flag「${f}」`); });
  if (obj.removeFlags) obj.removeFlags.forEach((f) => { if (!FLAG_SET.has(f)) warns.push(`${where}: removeFlags 未注册 flag「${f}」`); });
}
function checkCond(cond, where) {
  if (!cond) return;
  Object.keys(cond).forEach((k) => {
    if (COND_KEYS.indexOf(k) < 0) errors.push(`${where}: cond 含未知键「${k}」`);
  });
  if (cond.counters) {
    Object.keys(cond.counters).forEach((k) => {
      if (COUNTER_KEYS.indexOf(k) < 0) errors.push(`${where}: cond.counters 含未知键「${k}」`);
    });
  }
  ["flagsAll", "flagsAny"].forEach((k) => {
    if (cond[k]) cond[k].forEach((f) => { if (!FLAG_SET.has(f)) warns.push(`${where}: cond.${k} 未注册 flag「${f}」`); });
  });
  if (cond.notFlag && !FLAG_SET.has(cond.notFlag)) warns.push(`${where}: cond.notFlag 未注册「${cond.notFlag}」`);
}
function checkFlagReg(fx, where) {
  if (!fx) return;
  // 只提醒“结局结果 flag”应该出现在哪些节拍，宽松处理
}
function scanList(list, tag, fn) {
  list.forEach((x) => { fn(x, `${tag}:${x.id}`); });
}
DATA.actions.forEach((a) => {
  checkCond(a.cond, `actions:${a.id}`);
  checkFx(a.fx, `actions:${a.id}`);
  if (!a.lines || a.lines.length < 4) errors.push(`actions:${a.id} lines 少于 4 条`);
  (a.lines || []).forEach((l) => {
    if (!l.text) errors.push(`actions:${a.id} 存在无 text 的行`);
    checkFx(l.fxExtra, `actions:${a.id}.lines`);
  });
  if (["club", "date", "court", "kaoyan", "civil", "startup", "net"].indexOf(a.id) >= 0 && !a.cond) {
    errors.push(`actions:${a.id} 缺少 cond（应为条件行动）`);
  }
});
DATA.events.forEach((e) => {
  checkCond(e.cond, `events:${e.id}`);
  if (!e.text) errors.push(`events:${e.id} 缺 text`);
  if (e.options && e.options.length) {
    e.options.forEach((o) => {
      if (!o.label) errors.push(`events:${e.id} 有选项缺 label`);
      checkCond(o.cond, `events:${e.id}.option`);
      checkFx(o.fx, `events:${e.id}.option`);
      if (!o.result) warns.push(`events:${e.id} 有选项缺 result`);
    });
  }
});
DATA.beats.forEach((b) => {
  checkCond(b.cond, `beats:${b.id}`);
  if (!b.text) errors.push(`beats:${b.id} 缺 text`);
  if (!b.at) errors.push(`beats:${b.id} 缺 at`);
  (b.options || []).forEach((o) => {
    checkCond(o.cond, `beats:${b.id}.option`);
    checkFx(o.fx, `beats:${b.id}.option`);
    if (!o.result) warns.push(`beats:${b.id} 有选项缺 result`);
  });
});

// 数据体量统计
console.log(`✔ 加载数据: actions=${DATA.actions.length} events=${DATA.events.length} beats=${DATA.beats.length} endings=${DATA.endings.length}`);
console.log(`  actions: ${DATA.actions.map(a => a.id).join(", ")}`);
console.log(`  beats 分 path: ` + JSON.stringify(countBy(DATA.beats, (b) => b.path || "通用")));
function countBy(arr, f) {
  const m = {};
  arr.forEach((x) => { const k = f(x); m[k] = (m[k] || 0) + 1; });
  return m;
}
function countEventBySem() {
  const m = { "1-2": 0, "3-4": 0, "5-6": 0, "7-8": 0, 通用: 0 };
  DATA.events.forEach((e) => {
    const semIn = e.cond && e.cond.semIn ? e.cond.semIn : [];
    const mn = e.cond && e.cond.minSem, mx = e.cond && e.cond.maxSem;
    const lo = semIn.length ? Math.min.apply(null, semIn) : (mn || 1);
    const hi = semIn.length ? Math.max.apply(null, semIn) : (mx || 8);
    if (!semIn.length && mn === undefined && mx === undefined) m["通用"]++;
    else if (hi <= 2) m["1-2"]++;
    else if (hi <= 4) m["3-4"]++;
    else if (hi <= 6) m["5-6"]++;
    else m["7-8"]++;
  });
  return m;
}
console.log(`  events 按学期覆盖: ` + JSON.stringify(countEventBySem()));

console.log("");
if (errors.length) {
  console.error(`✗ 发现 ${errors.length} 个错误：`);
  errors.slice(0, 60).forEach((e) => console.error("  " + e));
  if (errors.length > 60) console.error(`  …还有 ${errors.length - 60} 个`);
  process.exit(1);
}
if (warns.length) {
  console.warn(`⚠ ${warns.length} 条警告：`);
  warns.slice(0, 40).forEach((w) => console.warn("  " + w));
  if (warns.length > 40) console.warn(`  …还有 ${warns.length - 40} 条`);
}
console.log("✔ 全部校验通过");
