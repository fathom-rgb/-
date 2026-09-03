# 《大学文字模拟器》内容数据契约 (SCHEMA v1.0)

所有内容文件是**浏览器与 Node 双环境通用**的纯数据 JS 脚本：
- 浏览器中由 `index.html` 以 `<script>` 标签按顺序加载；
- Node 中由 `tools/validate.js` 与 `tools/sim.js` 用 `require()` 加载校验。

**禁止**在内容文件中出现：`window`、`document`、DOM 操作、`import/export`、`require`、随机数或复杂逻辑（最多允许 `Math.random` 之外的简单常量与 tiny helper，能不用就不用）。文件必须能通过 `node --check <file>` 语法检查。

## 0. 全局命名空间与加载顺序

内容文件只往 `globalThis.DATA` 里填数据，格式统一为：

```js
// 每个文件开头固定两行：
(function (G) { "use strict";
  if (!G.DATA) G.DATA = { personas: [], families: [], majors: [], crushNames: [], crushTypes: [], semWeeks: [], actions: [], events: [], beats: [], endings: [] };
  var D = G.DATA;
  // ... 把你的数组元素 push 进 D.xxx ...
})(typeof window !== "undefined" ? window : globalThis);
```

加载顺序（也即 tools 里的 require 顺序）：
`js/data/core.js` → `js/data/actions.js` → `js/data/events_junior.js` → `js/data/events_senior.js` → `js/data/beats.js` → `js/data/endings.js` → `js/engine.js` → `js/ui.js`

- `js/data/core.js` 已由主程序提供：里面定义 personas/families/majors/crushNames/crushTypes/semWeeks 并初始化 DATA 对象。**不要重写 core.js**，只 `require`/读取它导出的数组来获取常量引用（如 `DATA.families`）。
- 你要写的新文件负责 push：`DATA.actions` / `DATA.events` / `DATA.beats` / `DATA.endings`。
- 写完后请运行 `node --check 你的文件路径` 确认零语法错误。

## 1. 数值与状态模型（引擎持有，你的 fx 直接改这些键）

```
stats: { ac:0-100 学业, so:0-100 社交/人缘, hp:0-100 体质, mo:0-100 心态 }
money: 整数元（可正可负，兜底不崩）
love: 0-100 对心动对象的感情（未开启恋爱线时为 0，隐藏）
sem: 1..8 （大一上=1 大一下=2 大二上=3 大二下=4 大三上=5 大三下=6 大四上=7 大四下=8）
year: 1..4 （= ceil(sem/2)）
path: null | 'kaoyan'(考研) | 'civil'(考公) | 'job'(就业实习) | 'startup'(创业) | 'lieflat'(躺平)
counters: { study, social, work, club, play, rest, date, meet }  累计行动次数
flags: 字符串集合（全部 flag 见 §4）
crushName: 心动对象名字（字符串）
crushType: 'wen'文艺型 | 'yun'运动型 | 'zhai'宅系 | 'cool'高冷型 （影响事件文案用词）
gpaAvg: 0-4.0 累计平均绩点（引擎算）
fails: 累计挂科门次（引擎算，主要由期末考 <60 触发）
scholarshipCnt: 获得奖学金的学期数（引擎算，期末评优自动）
```

**fx 允许的键**（在 action/event 的 fx 对象里，值为数值）：
`ac, so, hp, mo, money, love` 数值增减；`counters:{study:+1,...}` 计数增减（键必须取自上面的 counters 列表）；`flags:["flagA","flagB"]` 添加；`removeFlags:[...]` 移除。

**cond 允许的键**（所有内容里的可用性条件；值为数值/数组/字符串）：
`minAc,maxAc,minSo,maxSo,minHp,maxHp,minMo,maxMo,minMoney,maxMoney,minLove,maxLove,semIn:[...],yearIn:[...],minSem,maxSem,path:'kaoyan'|[...数组],pathNull:true,hasCrush:true,flagsAll:['a','b'](全部拥有才满足),flagsAny:['a','b'](任一拥有),notFlag:'x',majors:['cs','med'](专业id),families:['rich'],counters:{study:{min:3,max:9}}`
条件对象作为整体与运算。未列出的键一律无效，会被校验器警告。

## 2. 行动 (DATA.actions)

每回合（周）玩家从**可用**行动里选一个执行。行动对象：

```js
{
  id: "study",            // 唯一, 小写英文
  name: "图书馆卷王模式", // 按钮文案
  icon: "📚",             // 一个 emoji
  desc: "把青春献给高数线代。", // 按钮副文案（可选）
  // 可用性条件（可选，不写=总是可用）
  cond: { path: ["kaoyan"], minMo: 20 },
  // 或按学期等; 例如只在恋爱后可约会的行动 cond:{hasCrush:true}
  fx: { ac: 5, mo: -2, counters: { study: 1 } },   // 必选：固定主效果
  // 可选：每行动额外给一个保底钱变动等
  lines: [               // 必选 >= 4 条，随机抽 1 条作为周记文案
    { text: "……", fxExtra: { ac: 2 } },  // fxExtra 可选小浮动
    { text: "……" }
  ]
}
```

行动 id 全游戏复用（引擎按 id 归约）：请只定义以下 id，**必须全部覆盖，不要发明新 id**：

| id | 定位 | 典型 fx 参考 | 备注 |
|---|---|---|---|
| study | 自习/上课/图书馆 | ac+5 mo-1 | 学业主力 |
| club | 社团活动/学生工作 | so+3 mo+1 ct.club | cond 常要求 flagsAll:['club_joined']（b_s1_w4 节拍加入社团后才解锁）；未入社前不显示 |
| work | 兼职打工 | money+280 hp-2 ct.work | 不同文案覆盖家教/发传单/奶茶店/食堂帮工等 |
| sport | 运动健身 | hp+4 so+1 mo+1 | |
| rest | 宿舍躺/补觉 | mo+3 hp+2 | |
| play | 打游戏刷剧摸鱼 | mo+4 ac-2 | 上瘾风险事件看 counters.play |
| social | 聚会/联谊/社交 | so+4 money-60 mo+2 | 条件限制次数由引擎控制 |
| date | 约会（确立关系/热恋后） | love+3 mo+2 money-120 | cond:{flagsAll:['couple']}（b_s2_w12 或后续可确立） |
| court | 追心动对象（crush_met 之后、未确立关系前） | love+3 so+1 money-40 | cond:{flagsAll:['crush_met'], notFlag:'couple'} |
| kaoyan | 考研复习（大三起选考研后） | ac+4 mo-3 | cond:{path:'kaoyan',minSem:6} |
| civil | 行测申论刷题 | ac+3 mo-3 | cond:{path:'civil',minSem:6} |
| startup | 搞项目/跑路演 | so+2 ac-1 money-80 | cond:{path:'startup',minSem:6} |
| net | 投简历/跑招聘会 | so+2 mo-2 | cond:{path:'job',minSem:6} |

每个 id 写 **5-8 条** lines，覆盖不同心情/季节/场景的花式文案（轻松幽默为主，偶尔走心）。注意：**约 60% 文案应尽量与学期阶段弱相关、可复用**，不要每条都写“大一/大四”这类强绑定。

## 3. 随机事件 (DATA.events)

每周行动结束后，引擎按权重从**可用事件**里抽一个（权重控制频率）。事件对象：

```js
{
  id: "roommate_night",      // 唯一英文小写
  icon: "🛏️",
  title: "宿舍夜谈会",
  // 可用条件（可选）
  cond: { semIn: [1,2], minSem: 1, maxSem: 6 },   // 学期范围写在 semIn 或 min/max
  weight: 6,                 // 抽取权重，默认 3；越大越常见
  once: false,               // true=整局只触发一次
  text: "……第一段……\n……第二段……",  // 支持 \n 分段；{crush} 会替换成心动对象名，{major} 专业名
  options: [
    {
      label: "选项按钮文字",
      cond: { minMoney: 100 },     // 可选：不满足则按钮置灰
      fx: { mo: 3, money: -80, counters: { social: 1 } },
      result: "选完后的叙事反馈……"  // 必填，>=1 句
    },
    { label: "……", fx: { hp: -2, mo: 1 }, result: "……" }
  ]
}
```

要求：
- 2-4 个选项（可以有 1 个明显更损/更稳的），选项间数值要像“有取舍”，不要全赢或全输；
- 每个事件文本 2-4 段，总字数 **150-400 字**，选项 result 每条 20-80 字；
- `text` 用 `\n` 分段，**不要**用连续两个反引号；
- 事件主题尽量口语化、有校园颗粒感；轻松幽默 70%、偶尔走心 30%；禁止黄暴、政治、真实人物；挫折类事件结局要留“能翻盘”的口子；
- 允许少量**纯叙事无选项**事件：`options:[]`，fx 可为空，作为氛围调剂（weight 别太高）。

### 3.1 大一大二事件 (events_junior.js) — 你负责 [junior]
覆盖：宿舍生活/室友、军训、军训后社团百团大战、课堂点名/小组作业、食堂、快递/超市、第一次考试心态、校园恋爱萌芽、兼职初体验、想家、社团活动、期中/期末压力、健康小病、生活费告急等。**semIn:[1,2,3,4]** 为主，约 45-60 个事件。weight 建议 2-8。其中恋爱相关事件仅在 hasCrush 或 love>0 后有意义，写明 cond。

### 3.2 大三大四事件 (events_senior.js) — 你负责 [senior]
覆盖：专业课硬仗/科研竞赛、实习/求职/面试、考研自习室/焦虑/二战、考公刷题班/岗位选择、创业路演/找合伙人、躺平被家里念叨、大四毕设/查重/答辩、毕业旅行/散伙饭/各奔东西、毕业去向焦虑。**semIn:[5,6,7,8]** 为主，约 40-55 个。**大量事件要与 path 挂钩**（写 cond.path 或 cond.pathNull），否则会被引擎在错误 path 下抽到。weight 建议 2-7。同时写 3-4 个“大学最后一课/青春散场”的走心事件，不加 path 限制、semIn:[8]。

## 4. Flag 注册表（事件/行动里只能 set 这些）

`club_joined` 加入社团 · `club_leader` 当上部长/社长 · `scholarship_1/2/3` 第1/2/3学年获奖学金 · `top_gpa` 学霸线 · `comp_win` 竞赛获奖 · `research` 进实验室/做大创 · `cert_cet4/cet6` 过四六级 · `intern_offer` 拿到实习 · `job_offer` 校招 offer · `job_big` 大厂 offer · `kaoyan_admit` 考研上岸 · `civil_admit` 考公上岸 · `startup_fund` 创业拿到融资 · `startup_small` 小生意做成 · `couple` 确立恋爱关系 · `crush_met` 与心动对象相识 · `confessed` 表白过 · `heartbroken` 失恋过 · `game_addict` 网瘾 · `poor_loan` 办了助学贷款 · `dropschool` 退学 · `gapi_yr` 延毕一年 · `doctor` 大病/休学 · `legend` 隐藏彩蛋旗标（不要主动设置，留给 beats）· `streamer` 小有名气的校园博主

结局引擎会读：gpaAvg、fails、counters、scholarshipCnt、love、couple、path 及上述 flags。**别发明新 flag**；确实需要新的 → 放弃或改用 counters/stat 表达。

## 5. 主线剧情节拍 (DATA.beats) — 你负责 [beats]
强制剧情，到点必触发（替代当周自由行动）。对象：

```js
{
  id: "b_kaoyan_result",     // 唯一
  at: { sem: 8, week: 1 },   // 触发时点
  path: "kaoyan",            // 可选：仅该 path 触发
  cond: { flagsAll: ["kaoyan_admit"] }, // 可选附加条件
  icon: "📄", title: "考研出分",
  text: "...", options: [ { label, fx, result } ]  // 同事件结构
}
```

**必须覆盖的节拍清单（at 时点别乱改，除非你要加戏）**：
- `b_s1_w1` 大一开学报到+军训开营（sem1 week1，全 path）
- `b_s1_w4` 百团大战社团招新（sem1 week4）→ 决定 club_joined
- `b_s2_w2` 偶遇心动对象（sem2 week2）：**偶遇必然发生**——该节拍所有选项的 fx 都必须带 `flags:["crush_met"]`（否则恋爱线永久关闭）；选项差异只在好感/心态/金钱。crushName 已由玩家开局定好，文案用 {crush}
- `b_s2_w12` **夜谈·要不要表白**（sem2 week12，cond 需 flagsAll:["crush_met"]）：这是确立恋爱关系的主时点。请提供表白类选项——成功选项 cond 建议 `{minLove:60}` 且 fx 带 `flags:["couple"]`、love+10；失败/退缩选项 fx 可带 `flags:["heartbroken"]`（选一次即可）或不带。若一直没表白，beats 写手可在大三再给一次机会（可选，不强制）
- `b_s3_w6` 大二上：专业分流/加深抉择（sem3 week6）
- `b_s4_w12` 大二下：是该考虑未来的时候了（sem4 week12）
- `b_s5_w13` **人生岔路口**（sem5 week13，第5学期共14周、w14 是期末考，别占）：选 path（考研/考公/就业/创业/躺平），path 由引擎读你的 options 上的 `setPath:"kaoyan"` 字段，见下
- `b_s6_w1` 大三下开学动员（按 path 各写 1 个变体，用 path 字段区分）
- `b_s7_w4` 保研/求职关键动作（sem7 week4，按 path 变体）
- `b_s7_w8` 冲刺（sem7 week8，按 path 变体：考研冲刺/国考笔试/秋招收尾/路演/躺平的自我怀疑）
- `b_s7_w12` 决定性事件（sem7 week12，按 path 变体：考研初试结束/国考考完/校招 offer 结果/融资 pitch/彻底摆烂的边缘）
- `b_s8_w4` 结果揭晓（sem8 week4，按 path 变体，设置上述对应 flag，如 kaoyan_admit/civil_admit/job_big/startup_fund 等）
- `b_s8_w8` 毕业答辩+散伙饭（sem8 week8 全 path）
- `b_e1`~`b_e4` 可在 sem2/4/6/8 期末后作为“学年总结”心情节拍（sem X week 13 或最后一周，可选 1 个即可）

**特殊字段**：岔路口节拍的 option 里写 `setPath:"kaoyan"` 等（引擎在选中时设置 path），其他 option 不要写 setPath。beats 的 fx 可用 flags/counters/stats，但**不要用 setPath 之外的方式改 path**。

选项设置的关键结局 flag 时机（尽量与上表一致，别提前让结局引擎误判）：kaoyan_admit 在 b_s8_w4；civil_admit 在 b_s8_w4；job_offer/job_big 在 b_s7_w12 或 b_s8_w4；startup_fund 在 b_s8_w4。

## 6. 结局文案 (DATA.endings) — 你负责 [endings]

对象：
```js
{
  id: "E01", name: "六边形战士", icon: "🏆",
  rank: "S",                    // S/A/B/C/D
  title: "全奖直博清北",          // 大标题
  text: "...多段长文案 200-500字, \\n 分段...",  // 主角回首/室友评语/未来走向
  epilog: "给玩家的周目感言一句话"  // 可选
}
```
**id 与主题对照（引擎按此判定，别改 id）**：
E01 六边形战士·全奖直博清北（S）｜E02 保研名校·稳中带秀（A）｜E03 考研上岸·一战成硕（A）｜E04 考研调剂·曲线救国（B）｜E05 二战逆袭·我命由我（B）｜E06 大厂 offer·年薪起飞（A）｜E07 央企银行·安稳上岸（B）｜E08 国考上岸·为民服务（A）｜E09 创业融资·初代目（S）｜E10 校园博主·小有名气（B）｜E11 毕业即失业·迷茫开篇（C）｜E12 佛系毕业·快乐就好（C）｜E13 延期毕业·重整旗鼓（C）｜E14 黯然退学·重启人生（D）｜E15 校园恋爱修成正果（A）｜E16 青春散场·各自安好（C）｜E17 网瘾四年·悔不当初（D）｜E18 病休一年·健康第一（D）｜E19 隐藏结局·全都要的人生赢家（S）｜E20 隐藏结局·大隐隐于市的神仙宿舍（S）

文案风格：第一人称回顾 + 第三人称点评穿插皆可；不要写成说明文，要有画面感。E01/E09/E15/E19/E20 写长一些（400-600 字），其他 200-450 字。禁止出现真实学校/人名/公司名。

## 7. 提交前自检
1. `node --check <你的文件路径>` 零错误；
2. id 无重复（validate.js 会查）；
3. 只使用 §4 flags、§1 fx/cond 键、行动表 id；
4. `{crush}`/`{major}` 占位符只在需要处出现；
5. 文案立场：轻松幽默为主、偶尔走心，别教条、别贩卖焦虑到令人窒息。
6. 最后用 `node tools/validate.js` 验证（该文件加载全部 js 并报告问题；validate.js 由主程序提供，若运行报缺文件属正常：告诉我输出即可）。
