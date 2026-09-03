// ============================================================
// 《大学文字模拟器》 core.js —— 全局常量与角色卡基础数据
// 加载顺序第 1 位。仅填充 globalThis.DATA，不碰 DOM。
// ============================================================
(function (G) {
  "use strict";
  if (!G.DATA) {
    G.DATA = {
      personas: [], families: [], majors: [], crushNames: [], crushTypes: [],
      semWeeks: [], actions: [], events: [], beats: [], endings: []
    };
  }
  var D = G.DATA;

  // ---------- 性格（影响初始属性与少量结局判定） ----------
  D.personas = [
    { id: "neijuan", name: "卷王本卷", desc: "图书馆钉子户，学习使我快乐（装的）。",
      stats: { ac: 18, so: -2, hp: -3, mo: -4 } },
    { id: "shejiao", name: "社牛本牛", desc: "全宿舍的通讯录都认识你。",
      stats: { ac: -3, so: 18, hp: 2, mo: 2 } },
    { id: "sporty", name: "阳光运动系", desc: "操场常驻，球场上最亮的崽。",
      stats: { ac: -2, so: 4, hp: 16, mo: 3 } },
    { id: "foxi", name: "佛系咸鱼", desc: "随缘上课，缘分到了自然就会了。",
      stats: { ac: -8, so: 0, hp: 4, mo: 10 } },
    { id: "balanced", name: "均衡发展型", desc: "什么都想试试，什么都不算精。",
      stats: { ac: 6, so: 6, hp: 4, mo: 0 } }
  ];

  // ---------- 家境（影响初始生活费、每学期补助与部分事件） ----------
  // 每学期生活费 = 吃饭住宿等硬开销 + 可支配零花（简化为一笔），贫寒家庭需要打工补贴。
  D.families = [
    { id: "poor",    name: "勤工俭学", desc: "生活费紧张，精打细算是必修课，好在助学渠道多。", semAllowance: 1200 },
    { id: "normal",  name: "普通工薪", desc: "不愁吃穿，但也经不起大手大脚。", semAllowance: 2600 },
    { id: "rich",    name: "中产小康", desc: "父母收入稳定，零花钱比较宽松。", semAllowance: 4200 },
    { id: "wealthy", name: "家里有矿", desc: "生活费？你自己看着办吧。",     semAllowance: 6500 }
  ];

  // ---------- 专业方向（影响叙事与部分事件条件 majors:[...]） ----------
  D.majors = [
    { id: "cs",  name: "计算机科学与技术", desc: "掉头发是成长的代价。", icon: "💻" },
    { id: "med", name: "临床医学",         desc: "蓝色生死恋，从入门到入土。", icon: "🩺" },
    { id: "lib", name: "汉语言文学",       desc: "写论文写得想骂人，读完又觉得值。", icon: "📖" },
    { id: "bus", name: "工商管理",         desc: "什么都学一点，什么都不深。", icon: "📊" },
    { id: "eng", name: "机械工程",         desc: "金工实习的磨铁声是青春的声音。", icon: "⚙️" }
  ];

  // ---------- 心动对象名字池 & 类型（文案风味） ----------
  D.crushNames = ["林小满", "苏晚晴", "陈一舟", "陆星遥", "许南风", "夏栀",
                  "顾言", "乔安", "沈知夏", "白鹿", "程野", "叶未央"];
  D.crushTypes = [
    { id: "wen",  name: "文青型", desc: "爱看书爱拍照，朋友圈岁月静好。", adj: "温柔" },
    { id: "yun",  name: "运动型", desc: "球场常客，笑起来有阳光的味道。", adj: "元气" },
    { id: "zhai", name: "宅系",   desc: "二次元浓度超标，但关键时刻很靠谱。", adj: "安静" },
    { id: "cool", name: "高冷型", desc: "话不多，成绩好，谜一样的存在。", adj: "清冷" }
  ];

  // ---------- 每学期周数（8 学期：大一上 → 大四下） ----------
  // 期末考自动结算不占周；beats 不要占用各学期最后一两周。
  D.semWeeks = [14, 14, 14, 14, 14, 12, 12, 8];

  // 学期显示名
  D.semNames = ["大一上", "大一下", "大二上", "大二下", "大三上", "大三下", "大四上", "大四下"];

})(typeof window !== "undefined" ? window : globalThis);
