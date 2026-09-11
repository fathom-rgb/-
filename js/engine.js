// ============================================================
// 《大学文字模拟器》 engine.js —— 纯逻辑引擎（无 DOM）
// 浏览器与 Node 双环境可运行；UI 层负责渲染，sim.js 负责无头测试。
// 依赖：js/data/*.js 已先加载（globalThis.DATA）。
//
// 状态机设计：
//   st.pending = { kind:'action' } | { kind:'beat', id } | { kind:'event', id }
//   view(st) —— 幂等：有 pending 就映射成视图；无 pending 且未结束则推进一周并铺 feed。
//   chooseAction / chooseOption 处理玩家输入后返回新视图。
// ============================================================
(function (G) {
  "use strict";
  var DATA = G.DATA;
  if (!DATA) throw new Error("engine.js: 请先加载 js/data/*.js");

  // ---------- 小工具 ----------
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function chance(p) { return Math.random() < p; }
  function TX(s) { return String(s == null ? "" : s).replace(/\\n/g, "\n"); }

  // ---------- 状态创建 ----------
  function newGame(profile) {
    var p = profile || {};
    var persona = find(DATA.personas, p.personaId) || DATA.personas[0];
    var family = find(DATA.families, p.familyId) || DATA.families[1];
    var major = find(DATA.majors, p.majorId) || DATA.majors[0];
    var sb = persona.stats || {};
    var crushName = (p.crushName && String(p.crushName).trim()) || null;
    var crushType = find(DATA.crushTypes, p.crushTypeId) || pick(DATA.crushTypes);
    var gender = ['man','woman','nonbinary','unspecified'].includes(p.gender) ? p.gender : 'unspecified';
    var orientation = ['women','men','nonbinary','any','none'].includes(p.orientation) ? p.orientation : 'any';
    var crushGender = {women:'woman',men:'man',nonbinary:'nonbinary'}[orientation] || pick(['woman','man','nonbinary']);

    var st = {
      v: 1, // 存档版本
      meta: {
        name: (p.name && String(p.name).trim()) || "无名氏",
        gender: gender,
        orientation: orientation,
        crushGender: orientation==='none' ? null : crushGender,
        personaId: persona.id,
        familyId: family.id,
        majorId: major.id,
        crushName: crushName || pick(DATA.crushNames),
        crushTypeId: crushType.id
      },
      ac: clamp(24 + (sb.ac || 0) + randInt(0, 5), 0, 100),
      so: clamp(30 + (sb.so || 0) + randInt(0, 5), 0, 100),
      hp: clamp(55 + (sb.hp || 0) + randInt(0, 8), 0, 100),
      mo: clamp(55 + (sb.mo || 0) + randInt(0, 8), 0, 100),
      money: family.semAllowance,
      love: 0,
      sem: 1, week: 1,
      path: null,
      couple: false,
      crushMet: false,
      flags: {},
      counters: { study: 0, social: 0, work: 0, club: 0, play: 0, rest: 0, date: 0, meet: 0 },
      semStudy: 0,
      fails: 0,
      scholarshipCnt: 0,
      gpaHist: [],
      gpaAvg: 0,
      seenEvents: {},
      seenBeats: {},
      lastExam: null,
      over: false,
      endingId: null,
      feed: [],
      pending: null
    };
    norm(st);
    return st;
  }

  function find(arr, id) { for (var i = 0; i < arr.length; i++) { if (arr[i].id === id) return arr[i]; } return null; }

  // ---------- 数值规范化（属性 0-100，钱 0+，love 0-100） ----------
  function norm(st) {
    st.ac = clamp(Math.round(st.ac), 0, 100);
    st.so = clamp(Math.round(st.so), 0, 100);
    st.hp = clamp(Math.round(st.hp), 0, 100);
    st.mo = clamp(Math.round(st.mo), 0, 100);
    st.money = clamp(Math.round(st.money), 0, 999999);
    st.love = clamp(Math.round(st.love), 0, 100);
    return st;
  }

  // ---------- 文本插值 ----------
  function tpl(st, text) {
    if (!text) return "";
    var major = find(DATA.majors, st.meta.majorId);
    return TX(text)
      .replace(/\{crush\}/g, st.meta.orientation==='none' ? '朋友' : st.meta.crushName)
      .replace(/小伙子/g, st.meta.gender==='man' ? '小伙子' : '同学')
      .replace(/\{major\}/g, major ? major.name : "你的专业")
      .replace(/\{name\}/g, st.meta.name);
  }

  function pushFeed(st, kind, data) { st.feed.push({ kind: kind, data: data }); }

  // ---------- 条件判定（白名单见 SCHEMA §1） ----------
  function condOk(st, cond) {
    if (!cond) return true;
    function ck(key, min) { return cond[min] === undefined || st[key] >= cond[min]; }
    if (!ck("ac", "minAc")) return false;
    if (cond.maxAc !== undefined && st.ac > cond.maxAc) return false;
    if (!ck("so", "minSo")) return false;
    if (cond.maxSo !== undefined && st.so > cond.maxSo) return false;
    if (!ck("hp", "minHp")) return false;
    if (cond.maxHp !== undefined && st.hp > cond.maxHp) return false;
    if (!ck("mo", "minMo")) return false;
    if (cond.maxMo !== undefined && st.mo > cond.maxMo) return false;
    if (!ck("money", "minMoney")) return false;
    if (cond.maxMoney !== undefined && st.money > cond.maxMoney) return false;
    if (!ck("love", "minLove")) return false;
    if (cond.maxLove !== undefined && st.love > cond.maxLove) return false;
    if (cond.semIn && cond.semIn.indexOf(st.sem) < 0) return false;
    if (cond.yearIn && cond.yearIn.indexOf(Math.ceil(st.sem / 2)) < 0) return false;
    if (cond.minSem !== undefined && st.sem < cond.minSem) return false;
    if (cond.maxSem !== undefined && st.sem > cond.maxSem) return false;
    if (cond.path) {
      var arr = Array.isArray(cond.path) ? cond.path : [cond.path];
      if (arr.indexOf(st.path) < 0) return false;
    }
    if (cond.pathNull && st.path !== null) return false;
    if (cond.hasCrush && !st.crushMet) return false;
    if (cond.noCrush && st.crushMet) return false;
    if (cond.isCouple && !st.couple) return false;
    if (cond.notCouple && st.couple) return false;
    if (cond.flagsAll) for (var i = 0; i < cond.flagsAll.length; i++) if (!st.flags[cond.flagsAll[i]]) return false;
    if (cond.flagsAny) {
      var any = false;
      for (var j = 0; j < cond.flagsAny.length; j++) if (st.flags[cond.flagsAny[j]]) { any = true; break; }
      if (!any) return false;
    }
    if (cond.notFlag && st.flags[cond.notFlag]) return false;
    if (cond.majors && cond.majors.indexOf(st.meta.majorId) < 0) return false;
    if (cond.families && cond.families.indexOf(st.meta.familyId) < 0) return false;
    if (cond.counters) {
      var ck2 = Object.keys(cond.counters);
      for (var k = 0; k < ck2.length; k++) {
        var rule = cond.counters[ck2[k]];
        var val = st.counters[ck2[k]] || 0;
        if (rule.min !== undefined && val < rule.min) return false;
        if (rule.max !== undefined && val > rule.max) return false;
      }
    }
    return true;
  }

  // ---------- 应用 fx ----------
  function applyFx(st, fx) {
    if (!fx) return;
    if (fx.ac) st.ac += fx.ac;
    if (fx.so) st.so += fx.so;
    if (fx.hp) st.hp += fx.hp;
    if (fx.mo) st.mo += fx.mo;
    if (fx.money) st.money += fx.money;
    if (fx.love && st.meta.orientation!=='none') st.love += fx.love;
    if (fx.counters) {
      var ks = Object.keys(fx.counters);
      for (var i = 0; i < ks.length; i++) st.counters[ks[i]] = (st.counters[ks[i]] || 0) + fx.counters[ks[i]];
    }
    if (fx.flags) {
      for (var j = 0; j < fx.flags.length; j++) {
        var f = fx.flags[j];
        if(st.meta.orientation==='none' && ['crush_met','couple','confessed','heartbroken'].includes(f)) continue;
        st.flags[f] = true;
        if (f === "crush_met") st.crushMet = true;
        if (f === "couple") st.couple = true;
      }
    }
    if (fx.removeFlags) {
      for (var k = 0; k < fx.removeFlags.length; k++) {
        delete st.flags[fx.removeFlags[k]];
        if (fx.removeFlags[k] === "couple") st.couple = false;
      }
    }
    norm(st);
    autoCouple(st);
  }

  // 恋爱自动升温：感情到位却没确立 → 顺理成章在一起（大二下之后 love≥60）
  function autoCouple(st) {
    if(st.meta.orientation==='none') return;
    if (!st.couple && st.crushMet && !st.flags["heartbroken"] && st.love >= 60 && st.sem >= 3) {
      st.couple = true;
      st.flags["couple"] = true;
      st.love = 65;
      pushFeed(st, "para", tpl(st, "某个傍晚你鼓起勇气说出口，{crush} 笑了：等这句话很久了。你们在一起了。❤️"));
    }
  }

  // ---------- 期末考试/学年结算 ----------
  function runFinalExam(st) {
    // 大一课程宽松，逐年加深但平稳；ac(学业)与平时学时共同决定成绩
    var semEase = [13, 11, 10, 9, 8, 7, 6][st.sem - 1]; // sem8 无期末
    var noise = randInt(-4, 5);
    var studyBonus = st.semStudy >= 6 ? 8 : (st.semStudy >= 4 ? 6 : (st.semStudy >= 2 ? 4 : (st.semStudy >= 1 ? 2 : -3)));
    var raw = 38 + st.ac * 0.3 + (st.mo - 55) * 0.12 + studyBonus + semEase + noise;
    var score = clamp(Math.round(raw), 0, 100);
    var pass = score >= 60;
    var gpa = score >= 90 ? 4.0 : score >= 85 ? 3.7 : score >= 80 ? 3.3 :
              score >= 75 ? 3.0 : score >= 70 ? 2.7 : score >= 65 ? 2.3 :
              score >= 60 ? 2.0 : 0.0;
    if (!pass) st.fails++;
    st.gpaHist.push({ sem: st.sem, score: score, gpa: gpa, pass: pass });
    var sum = 0;
    for (var i = 0; i < st.gpaHist.length; i++) sum += st.gpaHist[i].gpa;
    st.gpaAvg = Math.round((sum / st.gpaHist.length) * 100) / 100;
    st.lastExam = { sem: st.sem, score: score, gpa: gpa, pass: pass, award: 0 };

    // 挂科后：下一学期补考——根据补考前的学习投入，挂科可能被"洗掉"
    // （补考机会：一旦及格就把该学期计为通过，减少连挂打击）
    if (!pass && st.semStudy >= 4 && chance(0.65)) {
      st.fails--; // 补考通过
      st.gpaHist[st.gpaHist.length - 1].pass = true;
      st.gpaHist[st.gpaHist.length - 1].gpa = Math.max(2.0, st.gpaHist[st.gpaHist.length - 1].gpa);
      var s2 = 0;
      for (var k = 0; k < st.gpaHist.length; k++) s2 += st.gpaHist[k].gpa;
      st.gpaAvg = Math.round((s2 / st.gpaHist.length) * 100) / 100;
      st.lastExam = { sem: st.sem, score: Math.max(60, score), gpa: st.gpaHist[st.gpaHist.length - 1].gpa, pass: true, award: 0 };
    }

    // 每学年（2/4/6/8 学期末）评奖学金
    if (st.sem % 2 === 0 && score >= 82 && st.gpaAvg >= 3.2) {
      st.scholarshipCnt++;
      var bonus = [1000, 1500, 2000, 2500][st.sem / 2 - 1];
      st.money += bonus;
      st.flags["scholarship_" + (st.sem / 2)] = true;
      st.lastExam.award = bonus;
    }
    if (st.mo < 30) { st.mo += 12; pushFeed(st, "para", "辅导员约你喝了杯奶茶。你说没事，他说他有经验。心态回升。"); }
    // 期末小回血（阈值压低，别把"病休"结局锁死）
    if (st.hp < 18) { st.hp += 8; pushFeed(st, "para", "校医院大夫开了药，勒令少熬夜。你第一次觉得医嘱真对。"); }
    norm(st);
  }

  // 危机检查（学期末触发：病休/退学/预警）
  function checkCrisis(st) {
    if (st.hp <= 20) {
      st.flags["doctor"] = true;
      pushFeed(st, "para", "你终于撑不住了。校医院建议住院观察，你办了休学手续。身体是革命的本钱。");
      return endGame(st, "E18");
    }
    // 挂科劝退：高年级仍一败涂地（大四累计挂科≥6 且绩点跌破 1.3）
    if (st.sem >= 7 && st.fails >= 6 && st.gpaAvg < 1.3) {
      pushFeed(st, "para", "教务处的退学警告单最终还是下来了。你盯着纸上的字，说不出话。");
      st.flags["dropschool"] = true;
      return endGame(st, "E14");
    }
    if (st.fails >= 4 && !st.flags["warn_fail"]) {
      st.flags["warn_fail"] = true;
      pushFeed(st, "para", "辅导员找你谈话：绩点再掉，学位证可能真的悬。你点了点头，有点想哭。");
    }
    if (st.mo <= 18 && !st.flags["warn_mo"]) {
      st.flags["warn_mo"] = true;
      pushFeed(st, "para", "心理咨询中心的老师加了你的微信，约你聊聊。你删了又加，还是去了。");
      st.mo += 10;
    }
    return false;
  }

  function endGame(st, endingId) {
    st.over = true;
    st.endingId = endingId || st.endingId || null;
    st.pending = null;
    return true;
  }

  // 推进一周；跨过学期末则结算
  function advanceWeek(st) {
    st.week++;
    var total = DATA.semWeeks[st.sem - 1];
    if (st.week <= total) {
      // 每周日常开销（伙食日用等），家境不同花销不同
      var famU = find(DATA.families, st.meta.familyId);
      var wk = { poor: 60, normal: 130, rich: 220, wealthy: 320 }[famU.id] || 130;
      st.money -= wk;
      if (st.money < 0) st.money = 0;
      return;
    }
    // ---- 学期结束 ----
    if (st.sem === 8) {
      pushFeed(st, "para", "毕业论文答辩结束。没有期末考的大四下，戛然而止。");
      endGame(st, null);
      return;
    }
    pushFeed(st, "header", "—— 期末考 · " + DATA.semNames[st.sem - 1] + " ——");
    runFinalExam(st);
    var ex = st.lastExam;
    if (ex.pass) {
      pushFeed(st, "exam", { pass: true, score: ex.score, gpa: ex.gpa, award: ex.award, sem: st.sem });
      pushFeed(st, "para", "期末 " + ex.score + " 分（绩点 " + ex.gpa.toFixed(1) + "）。" +
        (ex.award ? "本学年成绩优异，奖学金 +" + ex.award + " 元到账！" : "这学期没白熬。"));
    } else {
      pushFeed(st, "exam", { pass: false, score: ex.score, gpa: ex.gpa, sem: st.sem });
      pushFeed(st, "para", "期末 " + ex.score + " 分……挂科了。下学期补考见。（累计挂科 " + st.fails + "）");
    }
    if (checkCrisis(st)) return;
    // 进入下学期
    var fam = find(DATA.families, st.meta.familyId);
    st.sem++;
    st.week = 1;
    st.semStudy = 0;
    if (st.sem <= 8) {
      st.money += fam.semAllowance;
      var holiday = (st.sem % 2 === 0) ? "寒假" : "暑假";
      pushFeed(st, "para", DATA.semNames[st.sem - 2] + " 结束了。" + holiday +
        "里家里打了生活费（+" + fam.semAllowance + "），" + DATA.semNames[st.sem - 1] + "来了。");
    }
    norm(st);
  }

  // ---------- 视图生成（幂等） ----------
  function optionViews(st, list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      out.push({ idx: i, label: o.label, enabled: condOk(st, o.cond) });
    }
    return out;
  }

  function anyEnabled(opts) {
    for (var i = 0; i < opts.length; i++) if (opts[i].enabled) return true;
    return opts.length === 0;
  }

  // 引擎内置节拍：保研（推免）资格 —— 高绩点玩家在大四上开学自动触发
  var POSTGRAD_BEAT = {
    id: "b_engine_postgrad",
    title: "推免资格下来了",
    icon: "📜",
    text: "辅导员在年级群里@你：你前三年的绩点进入专业前 8%，拿到了推免（保研）资格，本周四前要去教务处确认。\n保研意味着不用挤独木桥，但也基本锁死了大四的方向。你握着手机，心里翻江倒海。",
    options: [
      { label: "接受推免，跟心仪的导师进组", setPath: "postgrad", fx: { flags: ["postgrad_admit", "postgrad_asked"], so: 2, mo: 3 },
        result: "你在确认单上签了名。导师回了个“欢迎”，还发来两篇论文让你先读。{crush} 知道后比你还高兴，说要请你吃饭。" },
      { label: "放弃保研，按原计划走自己的路", fx: { flags: ["postgrad_asked"], mo: -2 },
        result: "你把资格让给了名单上的下一位同学。有人骂你傻，只有你知道自己想要什么。" }
    ]
  };

  function isPostgradEligible(st) {
    return st.sem === 7 && st.week >= 1 && st.week <= 6 && st.path !== "postgrad" &&
      st.gpaAvg >= 3.4 && st.fails === 0 && !st.flags["postgrad_admit"] && !st.flags["postgrad_asked"];
  }

  // 查找节拍：先在数据里找，找不到再看引擎内置
  function beatById(id) {
    var b = find(DATA.beats, id);
    if (b) return b;
    if (POSTGRAD_BEAT.id === id) return POSTGRAD_BEAT;
    return null;
  }

  // 当前节拍对象（同周同条件：path 专属优先于通用）
  function beatAt(st) {
    var generic = null;
    for (var i = 0; i < DATA.beats.length; i++) {
      var b = DATA.beats[i];
      if(st.meta.orientation==='none' && b.id==='b_s2_w2') continue;
      if (!b.at || b.at.sem !== st.sem || b.at.week !== st.week) continue;
      if (st.seenBeats[b.id]) continue;
      if (!condOk(st, b.cond)) continue;
      if (b.path) {
        if (b.path === st.path) return b;
      } else if (!generic) {
        generic = b;
      }
    }
    // 引擎内置：保研资格
    if (isPostgradEligible(st)) return POSTGRAD_BEAT;
    return generic;
  }

  function actionList(st) {
    var out = [];
    for (var i = 0; i < DATA.actions.length; i++) {
      var a = DATA.actions[i];
      if (condOk(st, a.cond)) out.push({ id: a.id, name: a.name, icon: a.icon, desc: a.desc || "" });
    }
    return out;
  }

  function rollEvent(st) {
    var pool = [];
    for (var i = 0; i < DATA.events.length; i++) {
      var ev = DATA.events[i];
      if(st.meta.orientation==='none' && /\{crush\}|crush_met|couple|confessed|heartbroken/.test(JSON.stringify(ev))) continue;
      if (ev.once && st.seenEvents[ev.id]) continue;
      if (ev.semIn && ev.semIn.indexOf(st.sem) < 0) continue;
      if (ev.minSem !== undefined && st.sem < ev.minSem) continue;
      if (ev.maxSem !== undefined && st.sem > ev.maxSem) continue;
      if (!condOk(st, ev.cond)) continue;
      pool.push(ev);
    }
    if (!pool.length) return null;
    var total = 0;
    for (var j = 0; j < pool.length; j++) total += (pool[j].weight || 3);
    var r = Math.random() * total;
    for (var k = 0, acc = 0; k < pool.length; k++) {
      acc += (pool[k].weight || 3);
      if (r <= acc) return pool[k];
    }
    return pool[pool.length - 1];
  }

  // 无 pending 时：推进到下一个可交互点并铺 feed；否则直接映射。
  function view(st) {
    if (st.over) {
      var info = resolveEnding(st);
      if (st.feed.length && st.feed[st.feed.length - 1].kind === "ending") st.feed.pop();
      return { type: "ending", ending: info };
    }
    // 处理 mid-beat 恢复（pending 已存在）
    if (st.pending) {
      if (st.pending.kind === "beat") {
        var pb = beatById(st.pending.id);
        return { type: "beat", options: pb ? optionViews(st, pb.options) : [] };
      }
      if (st.pending.kind === "event") {
        var pe = find(DATA.events, st.pending.id);
        return { type: "event", options: pe ? optionViews(st, pe.options) : [] };
      }
      return { type: "action", actions: actionList(st) };
    }
    // 新的一周：节拍优先
    var beat = beatAt(st);
    if (beat) {
      st.seenBeats[beat.id] = true;
      pushFeed(st, "header", "★ " + DATA.semNames[st.sem - 1] + " · 第 " + st.week + " 周");
      pushFeed(st, "beat", { title: beat.title, icon: beat.icon, text: tpl(st, beat.text) });
      if (!beat.options || beat.options.length === 0) {
        // 纯叙事节拍：自动推进
        advanceWeek(st);
        return view(st);
      }
      var bopts = optionViews(st, beat.options || []);
      if (!anyEnabled(bopts)) {
        // 所有选项因条件不可用（如钱不够）→ 不能白送成功 flag：当作错过处理，防止卡死
        pushFeed(st, "para", "（你环顾四周，最终什么都没做成。有些机会，条件不够就是够不着。）");
        advanceWeek(st);
        return view(st);
      }
      st.pending = { kind: "beat", id: beat.id };
      return { type: "beat", options: bopts };
    }
    // 普通行动周
    st.pending = { kind: "action" };
    pushFeed(st, "header", DATA.semNames[st.sem - 1] + " · 第 " + st.week + " 周");
    pushFeed(st, "para", "【" + tpl(st, "{name}") + "】" + statTag(st));
    var acts = actionList(st);
    if (!acts.length) {
      // 理论上所有行动都不可用的兜底：休息一天
      st.pending = null;
      st.mo = clamp(st.mo + 2, 0, 100);
      st.hp = clamp(st.hp + 1, 0, 100);
      pushFeed(st, "para", "这周你实在提不起劲，就在宿舍瘫了一天。");
      advanceWeek(st);
      return view(st);
    }
    return { type: "action", actions: acts };
  }

  function statTag(st) {
    function lv(v, arr) { for (var i = 0; i < arr.length; i++) { if (v >= arr[i].min) return arr[i].t; } return "??"; }
    return "📚学业" + lv(st.ac, [{ min: 85, t: "封神" }, { min: 70, t: "优秀" }, { min: 55, t: "稳" }, { min: 40, t: "险" }, { min: 0, t: "濒危" }]) +
      " · 🗣️社交" + lv(st.so, [{ min: 85, t: "人脉王" }, { min: 65, t: "吃得开" }, { min: 45, t: "还行" }, { min: 25, t: "透明" }, { min: 0, t: "孤岛" }]) +
      " · 💪体质" + lv(st.hp, [{ min: 85, t: "铁人" }, { min: 65, t: "精神" }, { min: 45, t: "一般" }, { min: 25, t: "亚健康" }, { min: 0, t: "药罐" }]) +
      " · 😊心态" + lv(st.mo, [{ min: 85, t: "阳光" }, { min: 65, t: "稳" }, { min: 45, t: "emo" }, { min: 25, t: "焦虑" }, { min: 0, t: "崩溃" }]);
  }

  // ---------- 玩家操作 ----------
  function chooseAction(st, actionId) {
    if (!st.pending || st.pending.kind !== "action") return view(st);
    var act = null;
    for (var i = 0; i < DATA.actions.length; i++) { if (DATA.actions[i].id === actionId) { act = DATA.actions[i]; break; } }
    if (!act || !condOk(st, act.cond)) return view(st);
    st.pending = null;
    applyFx(st, act.fx);
    if (act.id === "study" || act.id === "kaoyan" || act.id === "civil") st.semStudy++;
    // 熬夜/长时间打游戏伤身（概率性，避免过度惩罚；运动/休息可对冲）
    if (act.id === "play" && chance(0.4)) { st.hp -= 1; norm(st); }
    var line = pick(act.lines);
    pushFeed(st, "act", { id: act.id, name: act.name, icon: act.icon, text: tpl(st, line.text) });
    if (line.fxExtra) applyFx(st, line.fxExtra);
    if (chance(0.34)) {
      var ev = rollEvent(st);
      if (ev) {
        if (ev.once) st.seenEvents[ev.id] = true;
        pushFeed(st, "event", { title: ev.title, icon: ev.icon, text: tpl(st, ev.text) });
        if (!ev.options || ev.options.length === 0) { // 纯叙事
          st.pending = null;
          advanceWeek(st);
          return view(st);
        }
        var eopts = optionViews(st, ev.options);
        if (!anyEnabled(eopts)) {
          // 条件都不满足（如没钱）→ 事件只能错过，不白送结果
          pushFeed(st, "para", "（你摸了摸口袋，最后什么也没做成就走了。）");
          st.pending = null;
          advanceWeek(st);
          return view(st);
        }
        st.pending = { kind: "event", id: ev.id };
        return view(st);
      }
    }
    advanceWeek(st);
    return view(st);
  }

  function chooseOption(st, kind, idx) {
    var src = null;
    if (st.pending && st.pending.kind === kind) {
      src = kind === "beat" ? beatById(st.pending.id) : find(DATA.events, st.pending.id);
    }
    if (!src || !src.options || !src.options[idx]) return view(st);
    var o = src.options[idx];
    if (o.cond && !condOk(st, o.cond)) return view(st);
    st.pending = null;
    applyFx(st, o.fx);
    if (o.setPath) st.path = o.setPath;
    if (o.result) pushFeed(st, "para", tpl(st, o.result));
    advanceWeek(st);
    return view(st);
  }

  // ---------- 开局 ----------
  function start(st) {
    pushFeed(st, "para", tpl(st, "拖着行李箱走进大学校门，" + DATA.semNames[0] + "开始了。【" + st.meta.name + "】，你好。"));
    return view(st);
  }

  // ============================================================
  // 结局判定（依据可测量状态 + content 设置的 flag）
  // 判定顺序 = 优先级顺序
  // ============================================================
  function resolveEnding(st) {
    var g = st.gpaAvg, fails = st.fails, c = st.counters;
    var ac = st.ac, so = st.so, hp = st.hp, mo = st.mo, love = st.love;
    var id = null;

    // ---- 特殊/灾难结局（最高优先级）----
    if (st.flags["doctor"]) id = "E18";                 // 病休
    else if (st.flags["dropschool"]) id = "E14";        // 退学
    // 隐藏·全都要：比 E01 更苛刻的终极彩蛋（绩点封神+全过+高恋爱+人缘+才艺）
    else if (st.flags["legend"] && g >= 3.7 && fails === 0 && ac >= 85 && love >= 65 && so >= 55) id = "E19";
    // 彩蛋 flag 但条件不够 → 不设 id，回落正常判定

    // ---- 恋爱修成正果（在职业结局之前？不，学业太好的应该先看职业）----
    // 顺序：先判定"大成功职业/学历"，恋爱作为加分/平凡时的归宿

    if (!id) {
      if (st.path === "kaoyan") {
        if (st.flags["kaoyan_admit"]) id = "E03";
        else if (g >= 3.0 && mo >= 40) id = "E05";      // 差一口气，二战逆袭(成绩底子好)
        else if (g >= 2.4) id = "E04";                  // 调剂·曲线救国
        else id = "E11";
      }
      else if (st.path === "civil") {
        if (st.flags["civil_admit"]) id = "E08";
        else if (so >= 55 && g >= 2.9) id = "E07";      // 转向银行/国企
        else id = "E11";
      }
      else if (st.path === "job") {
        if (st.flags["job_big"]) id = "E06";
        else if (st.flags["job_offer"]) id = "E07";
        else if (g >= 3.4 && so >= 45) id = "E06";      // 绩点/人脉双高：仍有大厂青睐
        else if (so >= 60 && g >= 2.6) id = "E07";      // 社牛有去处
        else id = "E11";
      }
      else if (st.path === "startup") {
        // 创业是真·高风险：S级融资成功需要启动资金与人脉积累
        if (st.flags["startup_fund"] && st.money >= 4000 && so >= 55) id = "E09";
        else if (st.flags["startup_fund"] || st.flags["startup_small"]) id = "E12"; // 小生意/佛系成事
        else if (so >= 55 && g >= 2.8 && mo >= 50) id = "E12";
        else id = "E11";
      }
      else if (st.path === "lieflat") {
        // 神仙宿舍：玩得开心 + 没人挂科 + 朋友多（隐藏 S，门槛仍高）
        if (so >= 55 && mo >= 62 && fails <= 1 && g >= 2.6 && (c.play + c.rest) >= 45) id = "E20";
        else if (mo >= 55 && g >= 2.2 && fails <= 3) id = "E12";     // 佛系快乐毕业
        else if (c.play >= 30 && g < 2.4) id = "E17";                // 网瘾四年
        else id = "E11";
      }
      else if (st.path === "postgrad") {
        if (st.flags["postgrad_admit"]) id = g >= 3.7 && fails === 0 ? "E01" : "E02";
        else if (g >= 3.5 && fails === 0) id = "E02";
        else if (g >= 3.2) id = "E03";
        else id = "E11";
      }
      else {
        // 没走主线（理论不可达，兜底）
        if (g >= 3.7 && fails === 0) id = "E01";
        else if (g >= 3.2) id = "E02";
        else id = "E11";
      }
    }

    // ---- 网瘾 / 自媒体 覆写（保持为相对"摆烂但有转机"的结局）----
    if (!st.flags["doctor"] && !st.flags["dropschool"] && !st.flags["legend"]) {
      if (st.flags["streamer"] && (id === "E11" || id === "E12" || id === "E13")) id = "E10";
      if (c.play >= 30 && fails >= 2 && g < 2.5 && (id === "E11" || id === "E12")) id = "E17";
    }

    // ---- 恋爱结局覆写（网瘾者不再恋爱脑）----
    // 修成正果：在一起、感情深，且职业/学历不是顶级时，给一个温暖的 A 级结局
    if (!st.flags["doctor"] && !st.flags["dropschool"] && !st.flags["legend"] && id !== "E17") {
      var topCareer = ["E01", "E02", "E03", "E06", "E08", "E09"].indexOf(id) >= 0;
      if (!topCareer && st.couple && love >= 72 && mo >= 45 &&
          ["E04", "E05", "E07", "E11", "E12", "E16"].indexOf(id) >= 0) {
        id = "E15";
      }
      // 遗憾/各自安好：心动过但没有结果
      if (!st.couple && st.crushMet && love >= 40 && mo >= 40 &&
          ["E11", "E12", "E04"].indexOf(id) >= 0) {
        if (st.flags["heartbroken"] || g >= 2.8) id = "E16";
      }
    }

    // ---- 网瘾 / 自媒体 覆写（保持为相对"摆烂但有转机"的结局）----
    if (!st.flags["doctor"] && !st.flags["dropschool"] && !st.flags["legend"]) {
      if (st.flags["streamer"] && (id === "E11" || id === "E12")) id = "E10";
      if (c.play >= 30 && fails >= 2 && g < 2.5 && (id === "E11" || id === "E12")) id = "E17";
    }

    // ---- 延期毕业 / 兜底 ----
    // 挂科多但没被劝退：延期毕业·重整旗鼓
    if (id === "E11" && fails >= 4 && g < 2.6) id = "E13";
    if (!id) id = "E11";
    if (st.flags["doctor"]) id = "E18";
    if (st.flags["dropschool"]) id = "E14";

    var endData = find(DATA.endings, id);
    return {
      id: id,
      name: endData ? endData.name : "未知结局",
      icon: endData ? endData.icon : "🎓",
      rank: endData ? endData.rank : "C",
      title: endData ? endData.title : "毕业",
      text: endData ? tpl(st, endData.text) : "",
      epilog: endData ? endData.epilog : "",
      stats: { gpa: st.gpaAvg, fails: st.fails, money: st.money, love: st.love,
               couple: st.couple, scholarship: st.scholarshipCnt, path: st.path }
    };
  }

  // 序列化存档（去掉运行时引用）
  function serialize(st) {
    return JSON.stringify({
      v: 1, meta: st.meta, ac: st.ac, so: st.so, hp: st.hp, mo: st.mo, money: st.money,
      love: st.love, sem: st.sem, week: st.week, path: st.path, couple: st.couple,
      crushMet: st.crushMet, flags: st.flags, counters: st.counters, semStudy: st.semStudy,
      fails: st.fails, scholarshipCnt: st.scholarshipCnt, gpaHist: st.gpaHist, gpaAvg: st.gpaAvg,
      seenEvents: st.seenEvents, seenBeats: st.seenBeats, lastExam: st.lastExam,
      over: st.over, endingId: st.endingId, feed: st.feed, pending: st.pending
    });
  }

  function deserialize(json) {
    var o = JSON.parse(json);
    var st = {
      v: 1, meta: o.meta, ac: o.ac, so: o.so, hp: o.hp, mo: o.mo, money: o.money,
      love: o.love, sem: o.sem, week: o.week, path: o.path, couple: o.couple,
      crushMet: o.crushMet, flags: o.flags || {}, counters: o.counters || {},
      semStudy: o.semStudy || 0, fails: o.fails || 0, scholarshipCnt: o.scholarshipCnt || 0,
      gpaHist: o.gpaHist || [], gpaAvg: o.gpaAvg || 0, seenEvents: o.seenEvents || {},
      seenBeats: o.seenBeats || {}, lastExam: o.lastExam || null, over: !!o.over,
      endingId: o.endingId || null, feed: o.feed || [], pending: o.pending || null
    };
    return st;
  }

  G.UNISIM = {
    DATA: DATA,
    newGame: newGame,
    start: start,
    view: view,
    chooseAction: chooseAction,
    chooseOption: chooseOption,
    condOk: condOk,
    applyFx: applyFx,
    tpl: tpl,
    resolveEnding: resolveEnding,
    serialize: serialize,
    deserialize: deserialize,
    rollEvent: rollEvent,
    statTag: statTag,
    semNames: DATA.semNames
  };

})(typeof window !== "undefined" ? window : globalThis);
