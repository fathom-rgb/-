// ============================================================
// tools/sim.js —— 无头模拟测试（Node）
// 运行：node tools/sim.js [局数=400]
// 用随机/智能策略跑完整局，检查：不崩溃、能走到结局、各结局可达、
// 属性不溢出、钱/绩点曲线合理、无死锁（多局卡在同一状态）。
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
for (const f of FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { console.error(`缺少 ${f}`); process.exit(1); }
  require(p);
}
const U = globalThis.UNISIM;
const DATA = U.DATA;

const N = parseInt(process.argv[2] || "400", 10);

// 可复现伪随机（每个种子一局）
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const endings = {};
const stats = { min: { ac: 100, so: 100, hp: 100, mo: 100, money: Infinity }, max: { ac: 0, so: 0, hp: 0, mo: 0, money: -Infinity } };
let crashes = 0, hardStalls = 0, finished = 0, forcedEarly = 0, gpaSum = 0, moneyEnd = 0;
const crashSamples = [];
const stallSamples = [];

function randProfile(rnd) {
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  return {
    name: "测试生",
    personaId: pick(DATA.personas).id,
    familyId: pick(DATA.families).id,
    majorId: pick(DATA.majors).id,
    crushTypeId: pick(DATA.crushTypes).id,
    crushName: "小测"
  };
}

// 简单策略（按 playStyle 轮换，覆盖各种玩法路径）
const STYLES = ["smart", "slacker", "social", "lover", "random", "scholar"];
function strategyPick(st, view, style) {
  const acts = view.actions || [];
  if (!acts.length) return null;
  const byId = (id) => acts.find((a) => a.id === id);
  const needStudy = st.ac < 72;
  const lowMo = st.mo < 45;
  const lowHp = st.hp < 45;
  const broke = st.money < 300;

  if (style === "scholar") {
    if (byId("study")) return "study";
    if (lowMo && byId("rest")) return "rest";
    if (byId("work") && broke) return "work";
    return acts[Math.floor(Math.random() * acts.length)].id;
  }
  if (style === "slacker") {
    // 佛系但期末会突击：临近期末(学期后1/3)补几周学习，平时爱玩爱躺
    const totalW = (U.DATA.semWeeks[st.sem - 1] || 14);
    const cramming = st.week > totalW - Math.max(3, Math.floor(totalW / 4)) && st.ac < 58;
    if (cramming && byId("study") && Math.random() < 0.6) return "study";
    if (byId("play")) return "play";
    if (byId("rest")) return "rest";
    if (byId("sport") && Math.random() < 0.3) return "sport";
    if (broke && byId("work") && Math.random() < 0.4) return "work";
    return acts[Math.floor(Math.random() * acts.length)].id;
  }
  if (style === "social") {
    if (byId("social")) return "social";
    if (byId("club")) return "club";
    if (lowMo && byId("play") && Math.random() < 0.4) return "play";
    if (byId("study") && needStudy && Math.random() < 0.4) return "study";
    if (broke && byId("work") && Math.random() < 0.3) return "work";
    return acts[Math.floor(Math.random() * acts.length)].id;
  }
  if (style === "lover") {
    if (st.crushMet && !st.couple && st.love < 80 && byId("court")) return "court";
    if (st.couple && byId("date")) return "date";
    if (st.crushMet && byId("court")) return "court";
    if (byId("social") && Math.random() < 0.5) return "social";
    if (byId("study") && needStudy && Math.random() < 0.4) return "study";
    return acts[Math.floor(Math.random() * acts.length)].id;
  }
  if (style === "random") {
    return acts[Math.floor(Math.random() * acts.length)].id;
  }
  // smart（原启发式）
  if (st.crushMet && !st.couple && st.love < 60 && byId("court") && Math.random() < 0.4) return "court";
  if (st.couple && st.love < 80 && byId("date") && Math.random() < 0.4) return "date";
  if (st.path === "kaoyan" && byId("kaoyan") && Math.random() < 0.7) return "kaoyan";
  if (st.path === "civil" && byId("civil") && Math.random() < 0.7) return "civil";
  if (st.path === "job" && byId("net") && Math.random() < 0.7) return "net";
  if (st.path === "startup" && byId("startup") && Math.random() < 0.7) return "startup";
  if (broke && byId("work") && Math.random() < 0.5) return "work";
  if (lowHp && byId("sport")) return "sport";
  if (lowMo && byId("rest")) return "rest";
  if (needStudy && byId("study") && Math.random() < 0.8) return "study";
  const roll = Math.random();
  if (roll < 0.5 && byId("study")) return "study";
  if (roll < 0.66 && byId("social")) return "social";
  if (roll < 0.78 && byId("sport")) return "sport";
  if (roll < 0.9 && byId("play")) return "play";
  if (byId("rest")) return "rest";
  return acts[Math.floor(Math.random() * acts.length)].id;
}

// 事件/节拍选项：偏向"结果导向"（设置成功 flag 的优先），否则随机
function optionPick(st, view) {
  const enabled = view.options.filter((o) => o.enabled);
  const pool = enabled.length ? enabled : view.options;
  // 尝试识别当前是 beat/event 并查看其选项 fx
  let src = null;
  if (st.pending && st.pending.kind === "beat") {
    src = (U.DATA.beats || []).find((b) => b.id === st.pending.id);
  } else if (st.pending && st.pending.kind === "event") {
    src = (U.DATA.events || []).find((e) => e.id === st.pending.id);
  }
  if (src && src.options) {
    const goodIdx = [];
    src.options.forEach((o, i) => {
      const fx = o.fx || {};
      const good = (fx.flags && fx.flags.some((f) =>
        ["kaoyan_admit", "civil_admit", "job_offer", "job_big", "startup_fund", "postgrad_admit", "couple", "scholarship_1", "scholarship_2", "scholarship_3", "comp_win", "intern_offer", "streamer", "legend"].indexOf(f) >= 0))
        || o.setPath;
      if (good && enabled.some((e2) => e2.idx === i)) goodIdx.push(i);
    });
    if (goodIdx.length) {
      const gi = goodIdx[Math.floor(Math.random() * goodIdx.length)];
      return { idx: gi };
    }
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function playOne(seed, style) {
  const rnd = mulberry32(seed);
  const profile = randProfile(rnd);
  const st = U.newGame(profile);
  let view = U.start(st);
  let steps = 0;
  const MAX = 4000;
  let prevSemWeek = "";
  let sameCount = 0;

  while (!st.over && steps < MAX) {
    steps++;
    if (view.type === "action") {
      const act = strategyPick(st, view, style);
      view = U.chooseAction(st, act);
    } else if (view.type === "event" || view.type === "beat") {
      const opt = optionPick(st, view);
      view = U.chooseOption(st, view.type, opt.idx);
    } else if (view.type === "ending") {
      break;
    } else {
      view = U.view(st);
    }
    // 死锁检测
    const k = st.sem + "_" + st.week + "_" + (st.pending ? (st.pending.id || st.pending.kind) : "none");
    if (k === prevSemWeek) { sameCount++; } else { sameCount = 0; prevSemWeek = k; }
    if (sameCount > 60) {
      hardStalls++;
      stallSamples.push({ seed, style, sem: st.sem, week: st.week, feedTail: st.feed.slice(-3).map((f) => f.kind + ":" + JSON.stringify(f.data).slice(0, 60)) });
      break;
    }
  }
  if (steps >= MAX) { crashes++; crashSamples.push({ seed, reason: "steps>MAX", sem: st.sem, week: st.week }); return null; }
  if (st.over) {
    finished++;
    const info = U.resolveEnding(st);
    endings[info.id] = (endings[info.id] || 0) + 1;
    stats.min.ac = Math.min(stats.min.ac, st.ac); stats.max.ac = Math.max(stats.max.ac, st.ac);
    stats.min.so = Math.min(stats.min.so, st.so); stats.max.so = Math.max(stats.max.so, st.so);
    stats.min.hp = Math.min(stats.min.hp, st.hp); stats.max.hp = Math.max(stats.max.hp, st.hp);
    stats.min.mo = Math.min(stats.min.mo, st.mo); stats.max.mo = Math.max(stats.max.mo, st.mo);
    stats.min.money = Math.min(stats.min.money, st.money); stats.max.money = Math.max(stats.max.money, st.money);
    gpaSum += st.gpaAvg; moneyEnd += st.money;
    pathCounts[st.path || "none"] = (pathCounts[st.path || "none"] || 0) + 1;
    return info.id;
  }
  return null;
}

// pendingCount helper
function pendingCount(st) { return st.pending ? (st.pending.id || st.pending.kind) : "none"; }

// 各策略混合
const pathCounts = {};
for (let i = 0; i < N; i++) {
  try {
    playOne(i + 1, STYLES[i % STYLES.length]);
  } catch (e) {
    crashes++;
    crashSamples.push({ seed: i + 1, reason: e.message + " @ " + (e.stack || "").split("\n")[1] });
  }
}

console.log(`\n===== 模拟结果（${N} 局）=====`);
console.log(`完成并出结局: ${finished}  中途强制结局: ${forcedEarly}  死锁: ${hardStalls}  崩溃/异常: ${crashes}`);
console.log(`平均绩点: ${(gpaSum / Math.max(1, finished)).toFixed(2)}  平均结余: ${Math.round(moneyEnd / Math.max(1, finished))} 元`);
console.log(`属性范围: ac ${stats.min.ac}-${stats.max.ac} | so ${stats.min.so}-${stats.max.so} | hp ${stats.min.hp}-${stats.max.hp} | mo ${stats.min.mo}-${stats.max.mo} | money ${stats.min.money}-${stats.max.money}`);
console.log(`\n结局分布:`);
const allEnd = [...new Set((DATA.endings || []).map((e) => e.id))];
const order = { S: 0, A: 1, B: 2, C: 3, D: 4 };
const sortedEnd = allEnd.slice().sort((a, b) => {
  const ea = (DATA.endings.find((e) => e.id === a) || {}).rank || "D";
  const eb = (DATA.endings.find((e) => e.id === b) || {}).rank || "D";
  return (order[ea] - order[eb]) || (a < b ? -1 : 1);
});
sortedEnd.forEach((id) => {
  const e = DATA.endings.find((x) => x.id === id) || {};
  console.log(`  ${id} ${e.rank || "?"} ${(endings[id] || 0)} 局  ${e.name || ""}`);
});
const unReached = sortedEnd.filter((id) => !endings[id]);
if (unReached.length) console.log(`\n⚠ 未触达结局: ${unReached.join(", ")}`);
if (crashSamples.length) {
  console.log(`\n崩溃样本:`);
  crashSamples.slice(0, 8).forEach((c) => console.log("  " + JSON.stringify(c)));
}
if (stallSamples.length) {
  console.log(`\n死锁样本:`);
  stallSamples.slice(0, 5).forEach((c) => console.log("  " + JSON.stringify(c).slice(0, 400)));
}
console.log("\n✔ sim 结束");
