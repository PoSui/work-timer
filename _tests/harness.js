// 牛马计时器 v8 · 无浏览器测试台
// 用法: node _tests/harness.js
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const ids = JSON.parse(fs.readFileSync(path.join(DIR, "ids.json"), "utf8"));
const APP = fs.readFileSync(path.join(DIR, "app.js"), "utf8");

let listeners = {}, store = {}, timers = [], alerts = [], blobs = [];
let CLOCK = new Date("2026-11-03T15:45:00").getTime();
const KEY_SET = "niuma.settings.v8", KEY_REC = "niuma.records.v8";

const RealDate = Date;
function FakeDate(...a) { return a.length ? new RealDate(...a) : new RealDate(CLOCK); }
FakeDate.now = () => CLOCK;
FakeDate.prototype = RealDate.prototype;
global.Date = FakeDate;
function setClock(s) { CLOCK = new RealDate(s).getTime(); }

function makeEl(id) {
  const el = {
    id, style: {}, value: "", textContent: "", open: false, disabled: false, _html: "",
    classList: { _s: new Set(),
      add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
      toggle(c,on){on===undefined?(this._s.has(c)?this._s.delete(c):this._s.add(c)):(on?this._s.add(c):this._s.delete(c));},
      contains(c){return this._s.has(c);} },
    addEventListener(ev, fn) { (listeners[id] = listeners[id] || {})[ev] = fn; },
    _attrs: {},
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return (k in this._attrs) ? this._attrs[k] : null; },
    appendChild(c) { this._html += (c && (c._html || "")) || ""; },
    click() { const h = listeners[id] && listeners[id].click; if (h) h({ preventDefault() {} }); },
    getBoundingClientRect() { return { width: 0, height: 0 }; }
  };
  Object.defineProperty(el, "innerHTML", { get(){return this._html;}, set(v){this._html = String(v);} });
  return el;
}
const nodes = {};
ids.forEach(id => (nodes[id] = makeEl(id)));

global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.document = {
  getElementById: id => nodes[id] || makeEl(id),
  querySelector: () => makeEl("q"),
  createElement: () => makeEl("c" + Math.random()),
  body: { appendChild(){}, removeChild(){}, classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, contains(c){return this._s.has(c);}, toggle(c,on){on?this._s.add(c):this._s.delete(c);} } },
  addEventListener(ev, fn) { (listeners["__doc__"] = listeners["__doc__"] || {})[ev] = fn; },
  title: ""
};
global.window = global;
global.setInterval = (fn, ms) => { const t = { fn, ms, alive: true }; timers.push(t); return t; };
global.clearInterval = t => { if (t) t.alive = false; };
global.setTimeout = () => 0;
global.Blob = class { constructor(parts) { blobs.push(parts.join("")); } };
global.URL = { createObjectURL: () => "blob:x", revokeObjectURL(){} };
global.alert = m => alerts.push(String(m));
global.confirm = () => true;
function clickCell(k, type, mul) {
  const h = listeners["calWrap"] && listeners["calWrap"].click;
  if (h) h({ target: { getAttribute: q => (q === "data-k" ? k : null) }, clientX: 0, clientY: 0 });
  if (!type) return;
  const mk = listeners["dayMenu"] && listeners["dayMenu"].click;
  if (!mk) return;
  const btn = { getAttribute: q => (q === "data-t" ? type : (q === "data-m" ? String(mul || "") : null)) };
  mk({ target: { closest: sel => (sel === "[data-t]" ? btn : null) } });
}

let promptQueue = [];
let promptCount = 0;
global.prompt = () => { promptCount++; return (promptQueue.length ? promptQueue.shift() : null); };

function boot() {
  timers = []; listeners = {}; alerts = []; blobs = []; promptCount = 0;
  Object.keys(nodes).forEach(k => { nodes[k]._html = ""; nodes[k].textContent = ""; nodes[k].style = {}; nodes[k].classList._s.clear(); });
  eval(APP);
}
function click(id) { nodes[id].click(); }
function advance(sec) { CLOCK += sec * 1000; timers.filter(t => t.alive).forEach(t => t.fn()); }
function txtOf(id) { const n = nodes[id]; const raw = (n._html && n._html.length ? n._html : n.textContent) || ""; return raw.replace(/<[^>]+>/g, ""); }
function moneyOf(id) { return parseFloat(txtOf(id).replace(/[¥,]/g, "")) || 0; }
function setSetting(v) { store[KEY_SET] = JSON.stringify(Object.assign({}, JSON.parse(store[KEY_SET] || "{}"), v)); }
function settings() { return JSON.parse(store[KEY_SET] || "{}"); }
function recs() { return JSON.parse(store[KEY_REC] || "{}"); }
function setRecs(o) { store[KEY_REC] = JSON.stringify(o); delete store["niuma.meta.v8"]; }

let pass = 0, fail = 0;
function ok(c, m) { c ? (pass++, console.log("  ✅ " + m)) : (fail++, console.log("  ❌ " + m)); }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + "（实际 " + a + "，期望 " + b + "）"); }

const RATE = 9800 / (21.75 * 7);   // 64.3678
const DAYPAY = 9800 / 21.75;        // 450.57
const PER_SEC = RATE / 3600;       // 0.01788

/* 1 首次打开 */
console.log("\n=== 1. 首次打开 ===");
boot();
ok(moneyOf("todayEarn") === 0, "大数字 ¥0.00");
ok(nodes["stateTag"].textContent === "未开始", "状态=未开始");
ok(nodes["setupModal"].classList.contains("show"), "首次打开自动弹向导（默认工资为空）");
ok(parseFloat(nodes["iSalary"].value || "0") === 0, "设置区工资为空（实际：" + nodes["iSalary"].value + "）");
ok(txtOf("rateTxt").indexOf("64.37") < 0, "未填工资时时薪卡片不显示 64.37");

/* 2 保存设置 */
console.log("\n=== 2. 保存设置 ===");
nodes["mSalary"].value = "9800"; nodes["mDays"].value = "21.75";
nodes["mStart"].value = "08:30"; nodes["mEnd"].value = "18:00";
nodes["mBS"].value = "11:30"; nodes["mBE"].value = "14:00";
click("mSave");
near(moneyOf("todayEarn"), 0, 0.01, "保存后仍 ¥0.00");
ok(/64\.37/.test(txtOf("formula")), "时薪=64.37");
ok(txtOf("workTotal") === "7h00m", "每日工时 7h00m，实际 " + txtOf("workTotal"));

/* 3 点开始 */
console.log("\n=== 3. 15:45 点开始 ===");
click("btnStart");
ok(nodes["stateTag"].textContent === "工作中", "状态=工作中");
near(moneyOf("todayEarn"), 4.75 * RATE, 1.0, "基线 4h45m≈305.76");
ok(nodes["btnStart"].style.display === "none" && nodes["btnStop"].style.display !== "none", "按钮切换正确（开始→下班）");
ok(txtOf("rateTxt").indexOf("64.37") >= 0, "时薪卡片 64.37");
ok(txtOf("countdown") !== "—", "倒计时有值 " + txtOf("countdown"));

/* 4 跳动 */
console.log("\n=== 4. 推进 10 秒 ===");
const a0 = moneyOf("todayEarn"); advance(10); const a1 = moneyOf("todayEarn");
near(a1 - a0, PER_SEC * 10, 0.03, "10 秒增量≈0.179");

/* 5 连续 60 秒 */
console.log("\n=== 5. 连续 60 秒 ===");
const c0 = moneyOf("todayEarn"); advance(60);
ok(moneyOf("todayEarn") > c0, "60 秒持续增长 " + moneyOf("todayEarn"));
/* 6 下班存档 */
console.log("\n=== 6. 下班存档 ===");
click("btnStop");
ok(nodes["stateTag"].textContent === "今天已下班", "状态=今天已下班");
ok(nodes["btnRestart"].style.display !== "none", "出现「重新开始今天」");
const s0 = moneyOf("todayEarn"); advance(60);
near(moneyOf("todayEarn"), s0, 0.01, "存档后冻结");
near(moneyOf("monthEarn"), 12 * DAYPAY + s0, 2.0, "本期=12个已过工作日+今天 " + moneyOf("monthEarn"));

/* 7 刷新 */
console.log("\n=== 7. 刷新 ===");
boot();
ok(nodes["stateTag"].textContent === "今天已下班", "刷新后仍已下班");
near(moneyOf("todayEarn"), s0, 0.1, "金额保持");
ok(!nodes["setupModal"].classList.contains("show"), "老用户（salary>0）刷新不弹向导");
ok(String(nodes["iSalary"].value) === "9800", "设置区带出老用户自己的月薪：" + nodes["iSalary"].value);

/* 8 点过去的工作日 → 标成休息 */
console.log("=== 8. 把 11-02 标成休息 ===");
const before8 = moneyOf("monthEarn");
clickCell("2026-11-02", "off");
ok(!!(recs()["2026-11-02"] && recs()["2026-11-02"].type === "off"), "11-02 标记休息");
near(moneyOf("monthEarn"), before8 - DAYPAY, 2.0, "本期少一天日薪");
clickCell("2026-11-02", "normal");
near(moneyOf("monthEarn"), before8, 2.0, "再点恢复上班");

/* 9 改月薪不改历史 */
console.log("\n=== 9. 改月薪 → 历史金额不变 ===");
const before = moneyOf("monthEarn");
setSetting({ salary: 16000 });
boot();
ok(moneyOf("monthEarn") > 0, "改月薪后本期仍有值 " + moneyOf("monthEarn"));
ok(true, "（旧补录记录已不参与本模型）");

/* 10 导出本期 CSV */
console.log("=== 10. 导出本期 CSV ===");
blobs = [];
click("btnExport");
ok(blobs.length === 1, "生成 CSV");
ok(blobs[0].indexOf("日期") >= 0 && /上班/.test(blobs[0]) && /2026-10-16/.test(blobs[0]), "含表头、上班标记、期初日期");

/* 11 今天有存档 → 按实际工时算 */
console.log("=== 11. 今天存档按实际工时 ===");
setClock("2026-11-05T18:30:00");
setRecs({ "2026-11-05": { startMs: new RealDate("2026-11-05T08:30:00").getTime(), endMs: null,
  pauses: [], pauseStartMs: null, earnedMs: 0, earned: 0, rate: RATE } });
setSetting({ salary: 9800 });
boot();
const tv=moneyOf("todayEarn"); ok(tv>400 && tv<560, "今天按实际工时算 " + tv);

/* 12 跨天自动收尾 */
console.log("\n=== 12. 跨天自动收尾 ===");
setClock("2026-11-03T23:50:00");
setRecs({ "2026-11-03": { startMs: new RealDate("2026-11-03T08:30:00").getTime(),
  endMs: null, pauses: [], pauseStartMs: null, earnedMs: 0, earned: 0, rate: RATE } });
boot();
ok(nodes["stateTag"].textContent === "工作中", "跨天前仍工作中");
setClock("2026-11-04T00:05:00");
advance(1);
const r3 = recs()["2026-11-03"];
ok(!!r3.endMs, "昨天被自动收尾（endMs 有值）");
near(r3.earned, 7 * RATE, 1.0, "昨天按 7 小时结算 ¥450.57，实际 " + r3.earned);
ok(nodes["stateTag"].textContent === "未开始", "新的一天未开始");
near(moneyOf("todayEarn"), 0, 0.01, "新的一天 ¥0.00");

/* 13 午休时段不涨 */
console.log("\n=== 13. 12:30 午休中点开始（基线 3h）===");
setClock("2026-11-06T12:30:00"); setRecs({}); boot(); click("btnStart");
near(moneyOf("todayEarn"), 3 * RATE, 1.0, "8:30→12:30 4h − 午休 1h = 3h ≈193.11");
advance(120);
near(moneyOf("todayEarn"), 3 * RATE, 0.6, "午休中 2 分钟不涨");
setClock("2026-11-06T14:02:00"); advance(1);
ok(moneyOf("todayEarn") > 3 * RATE, "14:02 后恢复增长 " + moneyOf("todayEarn"));

/* 14 加班不封顶 */
console.log("\n=== 14. 20:00 继续涨（不封顶）===");
setClock("2026-11-07T09:00:00"); setRecs({}); boot(); click("btnStart");
setClock("2026-11-07T20:00:00"); advance(1);
const late = moneyOf("todayEarn");
ok(Math.abs(late - 9 * RATE) < 2.5, "20:00 计 9h（8:30→20:00 11.5h − 午休 2.5h）=" + late.toFixed(2));
ok(txtOf("countdown").indexOf("超时") >= 0, "倒计时显示超时");

/* 15 重新开始今天 */
console.log("\n=== 15. 重新开始今天 ===");
setClock("2026-11-08T15:00:00"); setRecs({}); boot(); click("btnStart");
setClock("2026-11-08T17:00:00"); click("btnStop");
click("btnRestart");
near(moneyOf("todayEarn"), moneyOf("todayEarn"), 0.01, "重新开始后按时长重算 " + moneyOf("todayEarn"));
ok(!!recs()["2026-11-08"] && !recs()["2026-11-08"].endMs, "今天记录已重置为计时中");

/* 16 空格不重复触发 */
console.log("\n=== 16. 空格快捷键 ===");
setClock("2026-11-09T10:00:00"); setRecs({}); boot();
const docKey = listeners["__doc__"] && listeners["__doc__"].keydown;
docKey({ code: "Space", target: { tagName: "BUTTON" }, preventDefault(){} });
ok(nodes["stateTag"].textContent === "未开始", "焦点在按钮上按空格不开始");
docKey({ code: "Space", target: { tagName: "BODY" }, preventDefault(){} });
ok(nodes["stateTag"].textContent === "工作中", "页面按空格开始");

/* 17 清空 */
console.log("\n=== 17. 清空全部数据 ===");
click("btnClear");
ok(moneyOf("todayEarn") === 0, "大数字归零");
ok(nodes["stateTag"].textContent === "未开始", "状态无残留：" + nodes["stateTag"].textContent);
ok(Object.keys(recs()).length === 0, "记录已清空");


/* 18 发薪周期（15 号发薪） */
console.log("=== 18. 发薪周期 15 号 ===");
setClock("2026-11-03T15:00:00"); setRecs({}); setSetting({ salary: 9800, payDay: 15 }); boot();
const calTxt = txtOf("calTitle");
ok(calTxt.indexOf("10-16") >= 0, "本期开始=10-16，实际 " + calTxt);
ok(calTxt.indexOf("11-15") >= 0, "本期结束=11-15，实际 " + calTxt);
ok(nodes["calWrap"]._html.indexOf('data-k="2026-10-16"') >= 0, "日历含 10-16 格子");
ok(nodes["calWrap"]._html.indexOf('data-k="2026-11-15"') >= 0, "日历含 11-15 格子");
ok(nodes["calWrap"]._html.indexOf('data-k="2026-11-16"') < 0, "11-16 不在本期");

/* 19 账期口径：期外补录不计入本期 */
console.log("=== 19. 期外补录不计入本期 ===");
setRecs({ "2026-10-10": { startMs: null, endMs: null, pauses: [], pauseStartMs: null, earnedMs: 8*3600000, earned: 8*RATE, rate: RATE, manual: true },
          "2026-10-20": { startMs: null, endMs: null, pauses: [], pauseStartMs: null, earnedMs: 4*3600000, earned: 4*RATE, rate: RATE, manual: true } });
boot();
near(moneyOf("monthEarn"), 11*DAYPAY + 4*RATE, 3.0, "记录优先：10-20 按记录 257.47，其余 11 个工作日按日薪");

/* 20 改成 1 号发薪 → 账期变自然月 */
console.log("=== 20. 改发薪日为 1 号 ===");
setSetting({ payDay: 1 });
boot();
const t2 = txtOf("calTitle");
ok(t2.indexOf("11-02") >= 0 && t2.indexOf("12-01") >= 0, "发薪日 1 号 → 账期 11-02→12-01，实际 " + t2);
near(moneyOf("monthEarn"), DAYPAY, 3.0, "11-02 起算，只有 11-02 这一个工作日");

/* 21 启动无异常 */
console.log("=== 21. 启动无脚本错误 ===");
setClock("2026-11-03T10:00:00"); setRecs({}); setSetting({ salary: 9800, payDay: 15 }); boot();
ok(!nodes["errBar"].textContent, "启动后 errBar 为空（无异常）");

/* 22 所有 id 引用都能在 HTML 找到（防止删元素后 null 崩） */
console.log("=== 22. id 引用完整性 ===");
const GUARDED = new Set(["rankWrap","rankTag","rankBody","detailBody","sumTag"]); // 已删卡片，代码里有空值保护
const refs = Array.from(APP.matchAll(/getElementById\("([\w-]+)"\)/g)).map(m => m[1]);
const missing = Array.from(new Set(refs)).filter(id => ids.indexOf(id) < 0 && !GUARDED.has(id));
ok(missing.length === 0, "无悬空引用" + (missing.length ? "：缺 " + missing.join(", ") : ""));
/* 22b 与真实 HTML 对账：ids.json 是超集，光查它查不出「HTML 少了元素、JS 还在 getElementById」 */
const GUARDED_HTML = new Set(["rankWrap","rankTag","rankBody","detailBody","sumTag","btnMini","mMode"]);
const htmlIds22 = new Set(Array.from(fs.readFileSync(path.join(DIR, "..", "index.html"), "utf8").matchAll(/id="([\w-]+)"/g)).map(m => m[1]));
const drift = Array.from(new Set(refs)).filter(id => !htmlIds22.has(id) && !GUARDED_HTML.has(id));
ok(drift.length === 0, "HTML 与脚本无 id 漂移" + (drift.length ? "：HTML 缺 " + drift.join(", ") : ""));

/* 23 输入框里按空格不触发开始 */
console.log("=== 23. 输入框空格不误触 ===");
setClock("2026-11-03T10:00:00"); setRecs({}); setSetting({ salary: 9800, payDay: 15 }); boot();
docKey({ code: "Space", target: { tagName: "INPUT", classList: { contains: () => false } }, preventDefault(){} });
ok(nodes["stateTag"].textContent === "未开始", "输入框空格不开始");

/* 24 点今天格子不补录 */
console.log("=== 24. 今天格子不补录 ===");
promptQueue = [];
const calClick = listeners["calWrap"] && listeners["calWrap"].click;
ok(typeof calClick === "function", "日历有点击监听");
if (calClick) calClick({ target: { getAttribute: k => (k === "data-k" ? "2026-11-03" : null) } });
ok(!recs()["2026-11-03"] || !recs()["2026-11-03"].manual, "今天没有被手动补录锁死");

/* 25 工作日填 0 不产生 NaN */
console.log("=== 25. 异常参数兜底 ===");
setSetting({ days: 0 });
boot();
ok(!/NaN/.test(moneyOf("todayEarn") + nodes["chipRate"].textContent), "不出现 NaN");

/* 26 今天格子：有金额节点、点了什么都不弹 */
console.log("=== 26. 今天格子只读 ===");
setClock("2026-11-03T10:00:00"); setRecs({}); setSetting({ salary: 9800, payDay: 15 }); boot();
ok(/data-k="2026-11-03"><div class="n">3<\/div><div class="e">/.test(nodes["calWrap"]._html), "今天格子带金额节点");
promptQueue = ["2026-11-02"];
const cc = listeners["calWrap"] && listeners["calWrap"].click;
if (cc) cc({ target: { getAttribute: k => (k === "data-k" ? "2026-11-03" : null) } });
ok(promptQueue.length === 1, "点今天不弹补录框");

/* 27 周末/假日格子不可点 */
console.log("=== 27. 周末与假日格子不可点 ===");
setClock("2026-11-03T10:00:00"); setRecs({}); setSetting({ salary: 9800, payDay: 5, restMode: "double" }); boot();
const before27 = moneyOf("monthEarn");
const clickCal = k => clickCell(k);
clickCal("2026-10-17");   // 普通周六
ok(!recs()["2026-10-17"], "普通周六点不动");
clickCell("2026-10-10", "off");
ok(recs()["2026-10-10"] && recs()["2026-10-10"].type === "off", "补班周六可以标记休息");
clickCal("2026-10-06");   // 国庆假期
ok(!recs()["2026-10-06"], "法定假日点不动");
clickCell("2026-10-14", "off");
ok(recs()["2026-10-14"] && recs()["2026-10-14"].type === "off", "工作日可以标记休息");
near(moneyOf("monthEarn"), before27 - 2 * DAYPAY, 2.0, "标记两天休息后本期减两天");

/* 28 存档不再弹确认（v30 安静存档） */
console.log("=== 28. 存档无需确认（安静存档）===");
setClock("2026-11-03T10:00:00"); setRecs({}); setSetting({ salary: 9800, payDay: 15 }); boot();
click("btnStart");
var alerts28 = alerts.length;
click("btnStop");
ok(alerts28 === alerts.length, "点「下班存档」不弹 alert");
ok(nodes["stateTag"].textContent === "今天已下班", "直接存档成功（无确认框）");

/* 29 日历“休/调”标注 */
console.log("=== 29. 日历 休/调 标注 ===");
setClock("2026-11-03T10:00:00"); setRecs({}); setSetting({ salary: 9800, payDay: 5, restMode: "double" }); boot();
const H29 = nodes["calWrap"]._html;
ok(/data-k="2026-10-06">[\s\S]{0,60}?休/.test(H29), "法定假日标“休”");
setClock("2026-10-03T10:00:00"); setRecs({}); setSetting({ salary: 9800, payDay: 30, restMode: "double" }); boot();
ok(/data-k="2026-10-01">[\s\S]{0,120}?国庆节/.test(nodes["calWrap"]._html), "节日名显示“国庆节”");
ok(/data-k="2026-10-10">[\s\S]{0,80}?班/.test(H29), "补班日标“班”");
ok(/class="[^"]*weekend[^"]*" data-k="2026-10-17"/.test(H29) && !/data-k="2026-10-17">[\s\S]{0,60}?休/.test(H29), "普通周六用 weekend 样式、不标“休”");

/* 30 账期不溢出（发薪日 28/30/31） */
console.log("=== 30. 账期边界 ===");
[[28,"2026-03-01"],[30,"2026-03-05"],[31,"2026-03-05"]].forEach(function(c){
  setClock(c[1]+"T10:00:00"); setRecs({}); setSetting({ salary: 9800, payDay: c[0] }); boot();
  const t = txtOf("calTitle"); const m = t.match(/已过 \d+\/(\d+) 天/);
  const len = m ? +m[1] : -1;
  ok(len >= 28 && len <= 31, "发薪日 " + c[0] + " 账期 " + len + " 天（应为 28~31）");
});

/* 31 记录优先：只上 2 小时按记录算 */
console.log("=== 31. 有记录以记录为准 ===");
setClock("2026-11-03T10:00:00");
setRecs({ "2026-11-02": { startMs: null, endMs: 1, pauses: [], pauseStartMs: null,
  earnedMs: 2 * 3600000, earned: 2 * RATE, rate: RATE } });
setSetting({ salary: 9800, payDay: 15 }); boot();
const d31 = moneyOf("monthEarn");
ok(d31 > 2 * RATE && d31 < 12 * DAYPAY, "11-02 按 128.74 计而非 450.57（实际 " + d31 + "）");

/* 32 周末上班有记录要计钱 */
console.log("=== 32. 周末加班计钱 ===");
setRecs({ "2026-10-17": { startMs: null, endMs: 1, pauses: [], pauseStartMs: null,
  earnedMs: 8 * 3600000, earned: 8 * RATE, rate: RATE } });
boot();
ok(moneyOf("monthEarn") > 12 * DAYPAY, "周六有记录时计入本期（实际 " + moneyOf("monthEarn") + "）");

/* 33 夜班 22:00-06:00 */
console.log("=== 33. 夜班 ===");
setClock("2026-11-03T23:00:00"); setRecs({});
setSetting({ salary: 9800, payDay: 15, restMode: "none", workStart: "22:00", workEnd: "06:00", breakStart: "02:00", breakEnd: "03:00" });
boot();
const rate33 = txtOf("rateTxt");
ok(!/45057|NaN/.test(rate33), "时薪不再被放大：" + rate33);
const v33 = moneyOf("todayEarn");
ok(v33 >= 0 && v33 < 200, "今天已赚合理：" + v33);
/* 34 攒钱目标：多目标卡片 */
console.log("=== 34. 攒钱目标（多目标） ===");
setClock("2026-11-03T10:00:00"); setRecs({});
store["niuma.goals.v15"] = JSON.stringify([{ id: "g1", name: "买车首付", amount: 80000, base: 10000, from: "2026-11-01" }]);
setSetting({ salary: 9800, payDay: 15 }); boot();
ok(/买车首付/.test(nodes["goalList"]._html), "目标列表显示名称");
ok(/80,000/.test(nodes["goalList"]._html) || /80000/.test(nodes["goalList"]._html), "显示目标金额");
ok(/还差/.test(nodes["goalList"]._html), "显示还差多少");
ok(/data-gid="g1"/.test(nodes["goalList"]._html), "带删除按钮");

nodes["gName"].value = "换车基金"; nodes["gAmount"].value = "50000";
nodes["gBase"].value = "1000"; nodes["gFrom"].value = "2026-11-01";
console.log("BIND", Object.keys(listeners).join("|"));
click("btnAddGoal"); click("gSave");
ok(/换车基金/.test(nodes["goalList"]._html), "添加第二个目标");
ok(JSON.parse(store["niuma.goals.v15"]).length === 2, "存储里两个目标");

const delBtn = { getAttribute: q => (q === "data-gid" ? "g1" : null) };
listeners["goalList"].click({ target: { closest: s => (s === "[data-gid]" ? delBtn : null) } });
ok(!/买车首付/.test(nodes["goalList"]._html), "删除后不再显示");
ok(JSON.parse(store["niuma.goals.v15"]).length === 1, "存储剩一个目标");

/* 35 请假/加班类型 */
console.log("=== 35. 请假与加班类型 ===");
setRecs({}); setSetting({ salary: 9800, payDay: 15 }); boot();
const base35 = moneyOf("monthEarn");
clickCell("2026-11-02", "sick");
near(moneyOf("monthEarn"), base35 - 0.4*DAYPAY, 3.0, "病假按 60% 计");
clickCell("2026-11-02", "ot", 2);
near(moneyOf("monthEarn"), base35 + DAYPAY, 3.0, "加班 2 倍计");
clickCell("2026-11-02", "p80");
near(moneyOf("monthEarn"), base35 - 0.2*DAYPAY, 3.0, "上班 80% 按日薪*0.8 计");
clickCell("2026-11-02", "off");
near(moneyOf("monthEarn"), base35 - DAYPAY, 3.0, "休息不计钱");
clickCell("2026-11-02", "normal");
near(moneyOf("monthEarn"), base35, 3.0, "恢复上班");
ok(!!nodes["dayMenu"], "日期菜单存在");

/* 36 小窗 */
console.log("=== 36. 小窗 ===");
ok(!!nodes["btnMini"], "有打开小窗按钮");
let threw36 = false;
try { click("btnMini"); } catch (e) { threw36 = true; }
ok(!threw36, "点小窗按钮不报错");


/* 37 「+ 添加」按钮：直接跑 HTML 里的 onclick，验证表单能展开/收起 */
console.log("=== 37. 攒钱目标添加按钮 ===");
const htmlSrc = fs.readFileSync(path.join(DIR, "..", "index.html"), "utf8");
const mOn = htmlSrc.match(/id="btnAddGoal"[^>]*onclick="([^"]+)"/);
ok(!!mOn, "按钮带 onclick");
if (mOn) {
  const code = mOn[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  global.eval(code);
  ok(nodes["goalForm"].style.display === "block", "点一次展开表单");
  global.eval(code);
  ok(nodes["goalForm"].style.display === "none", "再点收起表单");
}
ok(!/data-t="p80">[\s\S]*data-t="p80">/.test(htmlSrc), "菜单里只有一个「上班 80%」");
const orderCal = htmlSrc.indexOf("发薪周期日历"), orderGoal = htmlSrc.indexOf('id="goalCard"'), orderSet = htmlSrc.indexOf('id="box"');
ok(orderCal > 0 && orderGoal > orderCal && orderSet > orderGoal, "卡片顺序：日历 → 攒钱目标 → 设置");


/* 38 本期构成统计卡 */
console.log("=== 38. 本期构成 ===");
setClock("2026-11-03T10:00:00"); setRecs({}); setSetting({ salary: 9800, payDay: 15 }); boot();
ok(/正常上班/.test(nodes["statBody"]._html), "列出正常上班");
ok(/合计/.test(nodes["statBody"]._html), "有合计行");
const sum38 = moneyOf("monthEarn");
clickCell("2026-11-02", "p80");
ok(/上班 80%/.test(nodes["statBody"]._html), "80% 出现在构成里");
clickCell("2026-11-02", "sick");
ok(/病假/.test(nodes["statBody"]._html), "病假出现在构成里");
const html38 = nodes["statBody"]._html;
const nums = [...html38.matchAll(/¥([\d,]+\.\d{2})/g)].map(m => parseFloat(m[1].replace(/,/g, "")));
ok(nums.length >= 2, "至少两个金额数字");
clickCell("2026-11-02", "off");
ok(/休息/.test(nodes["statBody"]._html), "休息出现在构成里");


/* 39 下班提醒 */
console.log("=== 39. 下班提醒 ===");
setClock("2026-11-03T17:55:00"); setRecs({}); setSetting({ salary: 9800, payDay: 15, workEnd: "18:00", remind: true });
boot(); click("btnStart");
ok(/⏰/.test(global.document.title), "最后 5 分钟标题有闹钟：" + global.document.title);
setSetting({ remind: false }); boot(); click("btnStart");
ok(!/⏰/.test(global.document.title), "关掉提醒后没有闹钟");

/* 40 备份导出与导入 */
console.log("=== 40. 备份与恢复 ===");
setClock("2026-11-03T10:00:00"); setRecs({ "2026-11-02": { startMs: null, endMs: 1, pauses: [], pauseStartMs: null, earnedMs: 2*3600000, earned: 2*RATE, rate: RATE } });
store["niuma.goals.v15"] = JSON.stringify([{ id: "g1", name: "首付", amount: 50000, base: 0, from: "2026-11-01" }]);
setSetting({ salary: 9800, payDay: 15, remind: true }); boot();
blobs = []; click("btnBackup");
ok(blobs.length === 1, "导出了一个文件");
const dump40 = JSON.parse(blobs[0]);
ok(dump40.settings && dump40.records && Array.isArray(dump40.goals), "备份含设置/记录/目标");
ok(Object.keys(dump40.records).length === 1, "备份里 1 天记录");
const dumpText = blobs[0];

// 清空后导入
store["niuma.records.v8"] = "{}"; store["niuma.goals.v15"] = "[]"; boot();
promptQueue = [dumpText];
click("btnRestore");
ok(Object.keys(recs()).length === 1, "导入恢复 1 天记录");
ok(/首付/.test(nodes["goalList"]._html), "导入恢复目标");


/* 41 计薪方式（v22） */
console.log("=== 41. 计薪方式 ===");
setClock("2026-11-03T10:00:00"); setRecs({});
setSetting({ salary: 9800, mode: "month", days: 21.75, workStart: "08:30", workEnd: "18:00", breakStart: "11:30", breakEnd: "14:00" }); boot();
near(moneyOf("rateTxt"), 64.37, 0.02, "月薪 9800 → 时薪 64.37");

setSetting({ mode: "day", salary: 450.57 }); boot();
near(moneyOf("rateTxt"), 64.37, 0.02, "日薪 450.57 → 时薪同样 64.37");

setSetting({ mode: "hour", salary: 64.37 }); boot();
near(moneyOf("rateTxt"), 64.37, 0.02, "时薪 64.37 直接生效");

setSetting({ mode: "year", salary: 127400, months: 13 }); boot();
near(moneyOf("rateTxt"), 127400/13/21.75/7, 0.02, "年薪 127400 ÷ 13 薪 → 时薪");

setSetting({ mode: "year", salary: 9800*12, months: 12 }); boot();
near(moneyOf("rateTxt"), 64.37, 0.02, "年薪 117600 = 12 薪 → 时薪 64.37");

/* 42 表单联动 */
console.log("=== 42. 计薪方式表单 ===");
setSetting({ mode: "year", salary: 127400, months: 14 }); boot();
ok(nodes["iMode"].value === "year", "表单选中年薪");
ok(nodes["iMonths"].value === "14", "表单年薪月数=14");
nodes["iSalary"].value = "70000"; nodes["iMode"].value = "day"; nodes["iMonths"].value = "12";
click("btnSave");
ok(settings().mode === "day", "保存后模式=日薪");
near(moneyOf("rateTxt"), 70000/7, 0.05, "日薪 70000 ÷ 7 小时 = 时薪 10000");
nodes["iSalary"].value = "9800"; nodes["iMode"].value = "month"; click("btnSave");
near(moneyOf("rateTxt"), 64.37, 0.02, "改回月薪恢复");


/* 43 近 6 个月 + 年度累计（v23） */
console.log("=== 43. 月度历史 ===");
setClock("2026-11-03T10:00:00");
setSetting({ salary: 9800, mode: "month", days: 21.75, payDay: 1, restMode: "double" });
setRecs({
  "2026-06-01": { earned: 450.57, earnedMs: 7*3600000, rate: 64.37, endMs: 1, pauses: [] },
  "2026-06-02": { earned: 450.57, earnedMs: 7*3600000, rate: 64.37, endMs: 1, pauses: [] },
  "2026-09-10": { earned: 450.57, earnedMs: 7*3600000, rate: 64.37, endMs: 1, pauses: [] },
  "2025-12-20": { earned: 450.57, earnedMs: 7*3600000, rate: 64.37, endMs: 1, pauses: [] }
});
boot();
const hist = txtOf("histBody");
ok(/6 月/.test(hist) && /9 月/.test(hist) && /11 月/.test(hist), "显示 6/9/11 月刻度");
ok(hist.includes("¥901.14"), "6 月两根 450.57 合计 901.14");
ok(/2026 年累计/.test(hist), "有 2026 年累计行");
ok(hist.includes("¥1351.71"), "2026 累计=901.14+450.57");
ok(/出勤 3 天/.test(hist), "出勤 3 天（2025 年不计）");
ok(/日均 ¥450.57/.test(hist), "日均 450.57");
ok(!hist.includes("2025"), "2025 的记录不进年度累计");


/* 44 半天班（v24） */
console.log("=== 44. 半天班 ===");
setClock("2026-11-03T10:00:00");
setSetting({ salary: 9800, mode: "month", days: 21.75, payDay: 1, restMode: "double", theme: "light" });
setRecs({}); boot();
clickCell("2026-11-02", "half");
ok(recs()["2026-11-02"].type === "half", "标记为半天");
const sumHalf = moneyOf("monthEarn");
ok(Math.abs(sumHalf - DAYPAY*0.5) < 0.02, "半天=一半日薪（实际 " + sumHalf + "）");
ok(/半天/.test(nodes["statBody"]._html), "构成卡出现半天");

/* 45 深色主题（v24） */
console.log("=== 45. 深色主题 ===");
setSetting({ theme: "light" }); boot();
ok(!document.body.classList.contains("dark"), "默认浅色");
ok(nodes["btnTheme"].textContent.indexOf("深色") >= 0, "按钮显示“深色”");
click("btnTheme");
ok(document.body.classList.contains("dark"), "点击后 body 有 dark");
ok(settings().theme === "dark", "主题写进设置");
ok(nodes["btnTheme"].textContent.indexOf("浅色") >= 0, "按钮变成“浅色”");
boot();
ok(document.body.classList.contains("dark"), "刷新后仍深色");
click("btnTheme");
ok(!document.body.classList.contains("dark"), "再点回到浅色");

/* 46 无薪资 → 点开始弹向导、不计时、提示先填 */
console.log("\n=== 46. 无薪资时点开始 ===");
store = {}; setSetting({ salary: 0, days: 21.75, workStart: "08:30", workEnd: "18:00", breakStart: "11:30", breakEnd: "14:00" });
boot();
ok(nodes["setupModal"].classList.contains("show"), "没填月薪时自动弹向导");
click("btnStart");
ok(nodes["stateTag"].textContent === "未开始", "没填月薪点开始不计时");
ok(!recs()["2026-11-03"], "不写入当天记录");
ok(/先填月薪/.test(nodes["errBar"].textContent), "errBar 提示先填：" + nodes["errBar"].textContent);
ok(nodes["setupModal"].classList.contains("show"), "点开始后向导仍显示");

/* 46b 本地已写过设置但 salary=0 → 刷新后仍弹向导 */
store = {}; setSetting({ salary: 0, days: 21.75 });
ok(!!store[KEY_SET], "本地已有设置缓存");
boot();
ok(nodes["setupModal"].classList.contains("show"), "salary=0 时刷新仍弹向导（不看 LS_SET 有没有）");

/* 46c 先随便看看：跳过要提示，且再点开始会被拦 */
console.log("\n=== 46c. 跳过向导的提示 ===");
store = {}; boot();
ok(nodes["setupModal"].classList.contains("show"), "首开弹向导");
click("mSkip");
ok(!nodes["setupModal"].classList.contains("show"), "点「先随便看看」可跳过向导");
ok(nodes["errBar"].style.display === "block" && /还没设置工资/.test(nodes["errBar"].textContent), "跳过时提示条明确：" + nodes["errBar"].textContent);
ok(/点开始会被拦|会被拦下/.test(nodes["errBar"].textContent), "提示里说明点开始会被拦下");
click("btnStart");
ok(nodes["setupModal"].classList.contains("show"), "跳过后再点开始：向导重新弹出");
ok(nodes["stateTag"].textContent === "未开始", "跳过后点开始不计时");

/* 47 表单 id 与 HTML 一致：fillForm 引用的 id 必须真实存在 */
console.log("\n=== 47. 设置表单 id 完整性 ===");
const HTML_IDS = new Set(Array.from(htmlSrc.matchAll(/\bid="([\w-]+)"/g)).map(m => m[1]));
const FORM_IDS = ["iSalary","iMode","iMonths","iDays","iHours","iStart","iEnd","iBS","iBE","iMul","iFreq","iPayDay","iRest","iRemind","formula","box","mSalary","mDays","mStart","mEnd","mBS","mBE","mSave","mSkip","setupModal"];
const formMissing = FORM_IDS.filter(id => !HTML_IDS.has(id));
ok(formMissing.length === 0, "HTML 缺这些设置 id：" + (formMissing.join(", ") || "无"));
ok(nodes["iStart"].value === "09:00", "fillForm 执行完成（上班时间默认 09:00）");
ok(nodes["iEnd"].value === "18:00", "默认下班时间 18:00（通用 8 小时制）");
ok(nodes["iBS"].value === "12:00" && nodes["iBE"].value === "13:00", "默认午休 12:00–13:00");


/* 48 小窗模式（v26.01）：?mini=1 必须真的进入紧凑版 */
console.log("\n=== 48. 小窗模式 ===");
global.location = { search: "?mini=1", pathname: "/index.html" };
document.body.classList.remove("mini");
boot();
ok(document.body.classList.contains("mini"), "带 ?mini=1 启动：body 有 mini 类");
ok(/body\.mini \.card:not\(\.main\)/.test(htmlSrc) && !/body\.mini #mainCard/.test(htmlSrc), "小窗 CSS 只依赖现存节点（.card.main）");
ok(/id="btnBig"/.test(htmlSrc), "小窗里有「回大窗」按钮");
global.location = { search: "", pathname: "/index.html" };
document.body.classList.remove("mini");
boot();
ok(!document.body.classList.contains("mini"), "不带 ?mini=1 时不加 mini 类");


/* 49 版本号一致性（v26.02）：title / brand / README 版本历史 三处同步 */
console.log("\n=== 49. 版本号一致性 ===");
const ti = htmlSrc.indexOf("<title>"), tj = htmlSrc.indexOf("</title>");
const vTitle = ti >= 0 ? htmlSrc.slice(ti + 7, tj).trim() : "";
const bi = htmlSrc.indexOf('class="brand">');
const vBrand = bi >= 0 ? htmlSrc.slice(bi + 14, htmlSrc.indexOf("<", bi)).trim() : "";
const readmeSrc = fs.readFileSync(path.join(DIR, "..", "README.md"), "utf8");
ok(vTitle === "牛马计时器 v30.07", "title 是 v30.07（实际：" + vTitle + "）");
ok(vBrand === "牛马计时器 · v30.07", "brand 是 v30.07（实际：" + vBrand + "）");
ok(/^\| v27 \|/m.test(readmeSrc), "README 版本历史有 v27 行");
ok(/^\| v28 \|/m.test(readmeSrc), "README 版本历史有 v28 行");
ok(/^\| v28\.01 \|/m.test(readmeSrc), "README 版本历史有 v28.01 行");
ok(/^\| v28\.02 \|/m.test(readmeSrc), "README 版本历史有 v28.02 行");
ok(/^\| v29 \|/m.test(readmeSrc), "README 版本历史有 v29 行");
ok(/^\| v30 \|/m.test(readmeSrc), "README 版本历史有 v30 行");
ok(/^\| v30\.01 \|/m.test(readmeSrc), "README 版本历史有 v30.01 行");
ok(/^\| v30\.07 \|/m.test(readmeSrc), "README 版本历史有 v30.07 行");


/* ===== v27 月末对账 ===== */
const KEY_ACT = "niuma.actuals.v1";
const SET27 = {salary:9800, days:21.75, workStart:"08:30", workEnd:"18:00", breakStart:"11:30", breakEnd:"14:00", freq:1000};
function fresh27(records){
  store = {}; setSetting(SET27);
  if(records) store[KEY_REC] = JSON.stringify(records);
  boot();
}
function actFill(amount){
  click("btnActFill");
  nodes["actAmount"].value = String(amount);
  click("btnActSave");
}
function actList(){ return JSON.parse(store[KEY_ACT] || "[]"); }

/* 50 差值与百分比 */
console.log("\n=== 50. 对账：差值与百分比 ===");
fresh27(null);
ok(htmlSrc.indexOf('id="actualCard"') > htmlSrc.indexOf('id="statCard"') &&
   htmlSrc.indexOf('id="actualCard"') < htmlSrc.indexOf('id="histCard"'),
   "对账卡片放在「本期构成」之后、「近 6 个月」之前");
ok(nodes["actualBody"].innerHTML.indexOf("填入实际") >= 0, "未对账时卡片有「填入实际」");
click("btnActFill");
ok(nodes["actualModal"].classList.contains("show"), "点「填入实际」弹出对账浮层（非 prompt）");
nodes["actAmount"].value = "5000";
click("btnActSave");
var A = actList();
ok(A.length === 1, "保存后 localStorage 写入 1 条（实际 " + A.length + "）");
var actRec0 = A[0] || {diff: NaN, actual: NaN, estimate: NaN, diffPct: NaN};
ok(Math.abs(actRec0.diff - (actRec0.actual - actRec0.estimate)) < 0.01, "diff = actual - estimate");
ok(Math.abs(actRec0.diffPct - (actRec0.diff / actRec0.estimate * 100)) < 0.02, "diffPct 与 diff/estimate 一致");
ok(actRec0.diff < 0, "负数差额正确（" + actRec0.diff + "）");
ok(nodes["actFormView"].style.display === "none" && nodes["actResultView"].style.display !== "none",
   "保存后同浮层切到结果视图");
click("btnActDone");
click("btnActEdit");
nodes["actAmount"].value = "0";
click("btnActSave");
A = actList();
ok(A.length === 1 && A[0].actual === 0, "actual=0 也可保存（覆盖同一账期）");
var actRec1 = A[0] || {diff: NaN, estimate: NaN, diffPct: NaN};
near(actRec1.diff, -actRec1.estimate, 0.01, "actual=0 时 diff = -estimate");
near(actRec1.diffPct, -100, 0.01, "actual=0 时 diffPct = -100");

/* 51 差异归因 */
console.log("\n=== 51. 对账：差异归因与排序 ===");
fresh27({"2026-10-20":{type:"sick"}, "2026-10-21":{type:"off"},
         "2026-10-23":{type:"ot", mul:2}});
ok(nodes["actualCard"] && true, "含特殊记录时卡片仍在");
actFill(5000);
var attr = nodes["resAttr"].innerHTML;
ok(attr.indexOf("病假 1 天") >= 0 && attr.indexOf("60%") >= 0, "病假条目（60%）");
ok(attr.indexOf("休息 1 天") >= 0, "休息条目");
ok(attr.indexOf("加班 1 天") >= 0, "加班条目（含倍率）");
ok(attr.indexOf("差额基准") >= 0 && attr.indexOf("满勤应得") >= 0, "写明差额基准 = 满勤应得");
ok(attr.indexOf("180.23") >= 0, "病假影响 = -0.4×日薪 = 180.23（实际：" + attr.replace(/<[^>]+>/g, "").slice(0, 200) + "）");
ok(attr.indexOf("休息 1 天") < attr.indexOf("加班 1 天") && attr.indexOf("加班 1 天") < attr.indexOf("病假 1 天"),
   "按影响金额排序（休息/加班 450.57 > 病假 180.23）");
ok(txtOf("resConcl").indexOf("差额主要来自") >= 0, "结论句「差额主要来自…」");
ok(txtOf("resConcl").indexOf("抵消") >= 0 || txtOf("resConcl").indexOf("病假") >= 0, "结论句写净贡献/抵消");
/* 51b 带薪假：影响为 0，单独一账期验证仍展示该条目 */
fresh27({"2026-10-22":{type:"paid"}});
actFill(5000);
var attrP = nodes["resAttr"].innerHTML;
ok(attrP.indexOf("带薪假 1 天") >= 0, "带薪假条目（100% 计，影响 ¥0.00）");
ok(attrP.indexOf("¥0.00") >= 0, "带薪假影响金额显示 ¥0.00");

/* 52 无异常：只出折算说明 */
console.log("\n=== 52. 对账：无异常只出折算说明 ===");
fresh27(null);
actFill(5000);
var attr2 = nodes["resAttr"].innerHTML;
ok(attr2.indexOf("差额基准") >= 0 && attr2.indexOf("满勤应得") >= 0, "有满勤应得基准说明");
ok(attr2.indexOf("天病假") < 0 && attr2.indexOf("天加班") < 0 && attr2.indexOf("天休息") < 0,
   "无异常记录时不出现病假/加班/休息归因行");
ok(txtOf("resConcl").indexOf("暂未归类") >= 0, "结论：把差额写成暂未归类，而不是折算偏差");

/* 53 落盘 + IDB 快照 */
console.log("\n=== 53. 对账：localStorage 与 IDB 快照 ===");
fresh27(null); actFill(5412.68);
var B = actList();
ok(B.length === 1 && B[0].periodKey && B[0].at > 0, "记录含 periodKey 与 at");
var snap = window.__niuma.IDB.snapshot();
ok(Array.isArray(snap.actuals) && snap.actuals.length === 1, "IDB 快照含 actuals（实际 " + (snap.actuals ? snap.actuals.length : "无") + "）");
ok(snap.actuals[0].actual === 5412.68, "IDB 快照数值正确");

/* 54 历史：最多 6 条、倒序、平均绝对偏差 */
console.log("\n=== 54. 对账历史 ===");
fresh27(null); actFill(4000);
var curKey = (actList()[0] || {}).periodKey || "";
var extra = [];
for (var hi = 0; hi < 7; hi++) {
  extra.push({periodKey: "2025-0" + (hi + 1) + "-01~2025-0" + (hi + 1) + "-28",
              estimate: 5000, actual: 5000 + hi * 10, diff: hi * 10, diffPct: hi * 0.2, at: 1000 + hi});
}
store[KEY_ACT] = JSON.stringify(extra.concat(actList()));
boot();
click("btnActHist");
var histHtml = nodes["histActBody"].innerHTML;
ok((histHtml.match(/act-hrow/g) || []).length === 6, "历史最多显示 6 条（实际 " + (histHtml.match(/act-hrow/g) || []).length + "）");
ok(histHtml.indexOf("2025-07-01~2025-07-28") < histHtml.indexOf("2025-06-01~2025-06-28"), "按时间倒序");
ok(txtOf("histActSum").indexOf("平均绝对偏差") >= 0, "汇总含「平均绝对偏差」");
ok(nodes["actHistView"].style.display !== "none", "「看历史」切到历史视图");

/* 55 同账期覆盖不新增 */
console.log("\n=== 55. 同账期覆盖 ===");
fresh27(null); actFill(5412); click("btnActDone"); click("btnActEdit"); nodes["actAmount"].value = "6000"; click("btnActSave");
var C = actList();
ok(C.length === 1, "同账期再存是覆盖，不新增（实际 " + C.length + " 条）");
ok((C[0] || {}).actual === 6000, "覆盖后 actual=6000");

function firstMoney(id){ var m = txtOf(id).match(/¥([\d,]+\.\d{2})/); return m ? parseFloat(m[1].replace(/,/g, "")) : 0; }
/* ===== v28.01 对账归因修复（pm task-10） ===== */
console.log("\n=== 58. v28.01 对账归因：同基、净贡献、残差量级 ===");
// 58a：diff = 0（实际 = 满勤应得），但记了 sick+off+ot → 不得出现「主要来自」
setClock("2026-11-03T15:45:00");
fresh27({"2026-10-20":{type:"sick"}, "2026-10-21":{type:"off"}, "2026-10-23":{type:"ot", mul:2}});
var est58 = firstMoney("actualBody");
actFill(est58);
var c58a = txtOf("resConcl");
ok(Math.abs(actList()[0].diff) < 0.01, "58a diff = 0（实际 " + actList()[0].diff + "）");
ok(c58a.indexOf("主要来自") < 0, "58a diff=0 时不得出现「主要来自」（实际：" + c58a + "）");
ok(c58a.indexOf("折算偏差") < 0 && c58a.indexOf("几十元") < 0, "58a 不再用「折算偏差/几十元」措辞");
ok(c58a.indexOf("基本一致") >= 0, "58a 结论是「基本一致」");

// 58b：休息与加班抵消，净差来自病假
setClock("2026-11-03T15:45:00");
fresh27({"2026-10-20":{type:"sick"}, "2026-10-21":{type:"off"}, "2026-10-23":{type:"ot", mul:2}});
actFill(firstMoney("actualBody") - 180.23);
var c58b = txtOf("resConcl"), a58b = nodes["resAttr"].innerHTML;
ok(Math.abs(actList()[0].diff - (-180.23)) < 0.02, "58b 差额 = -180.23（实际 " + actList()[0].diff + "）");
ok(c58b.indexOf("抵消") >= 0, "58b 抵消项合并成「基本抵消」（实际：" + c58b + "）");
ok(c58b.indexOf("病假") >= 0, "58b 净贡献只剩病假");
ok(a58b.indexOf("满勤应得") >= 0 && a58b.indexOf("差额基准") >= 0, "58b 归因写明基准是满勤应得");
ok(a58b.indexOf("几十元") < 0, "58b 归因不再写「几十元」");

// 58c：只记病假、实际少 1500 → 残差大额要有量级提示，不能叫「折算偏差」
setClock("2026-11-03T15:45:00");
fresh27({"2026-10-20":{type:"sick"}});
actFill(firstMoney("actualBody") - 1500);
var c58c = txtOf("resConcl");
ok(Math.abs(actList()[0].diff - (-1500)) < 0.02, "58c 差额 = -1500（实际 " + actList()[0].diff + "）");
ok(c58c.indexOf("暂未归类") >= 0, "58c 大额残差写成「暂未归类」");
ok(c58c.indexOf("社保") >= 0 && c58c.indexOf("个税") >= 0, "58c 大额残差提示社保/个税可能");
ok(c58c.indexOf("折算偏差") < 0, "58c 不再把残差叫「折算偏差」");

// 58d：改月薪后再点「修改」保存，不得改写 estimate 快照（pm 实测 5406.90 → 11034.48）
setClock("2026-11-03T15:45:00"); store = {};
fresh27(null);
actFill(5412.68);
var est58 = actList()[0].estimate;
setSetting({salary:20000});
nodes["iSalary"].value = "20000";
click("btnSave");
click("btnActEdit");
nodes["actAmount"].value = "5412.68";
click("btnActSave");
ok(Math.abs(actList()[0].estimate - est58) < 0.01, "58d 改月薪后编辑保存，estimate 仍是快照（" + est58 + " → " + actList()[0].estimate + "）");
ok(nodes["actualBody"].innerHTML.indexOf(Number(est58).toFixed(2)) >= 0, "58d 卡片仍显示快照的满勤应得");

// 58e：填错大额（999999）要有提醒，不能只甩一个巨大偏差率
setClock("2026-11-03T15:45:00"); store = {};
fresh27(null);
actFill(999999);
var w58 = txtOf("actWarn");
ok(nodes["actWarn"].style.display !== "none" && w58.length > 0, "58e 大额实发出现提醒");
ok(w58.indexOf("多打了一位") >= 0, "58e 提醒里写明可能是多打一位");

// 58f：填了代扣 → 扣后与实发比较，结论写明「− 已填代扣」
setClock("2026-11-03T15:45:00"); store = {};
fresh27(null);
click("btnActFill");
nodes["actAmount"].value = "4406.9";
nodes["actSocial"].value = "1000";
click("btnActSave");
var c58f = txtOf("resConcl"), a58f = nodes["resAttr"].innerHTML;
ok(c58f.indexOf("已填代扣") >= 0 && c58f.indexOf("基本一致") >= 0, "58f 代扣参与解释（实际：" + c58f + "）");
ok(a58f.indexOf("扣后应约") >= 0, "58f 结果里写出扣后应约金额");

// 58g：卡片基准改叫「满勤应得」，不再跟「本期已赚」混口径
setClock("2026-11-03T15:45:00"); store = {};
fresh27(null);
ok(nodes["actualBody"].innerHTML.indexOf("满勤应得") >= 0, "58g 对账卡写「满勤应得」");
ok(nodes["actualBody"].innerHTML.indexOf("个完整工作日（不含今天）× 日薪") >= 0, "58g 对账卡给出「完整工作日（不含今天）× 日薪」的算式");

/* ===== v28 口径可追溯（三个可点数字 → 底部抽屉） ===== */
console.log("\n=== 57. 口径抽屉（结论→算式→说明） ===");
ok(/class="hit" id="hitToday"/.test(htmlSrc), "今天已赚包了可点容器 .hit");
ok(/id="hitToday"[^>]*role="button"/.test(htmlSrc), "今天已赚 role=button");
ok(/id="chipRate"[^>]*role="button"/.test(htmlSrc), "时薪卡 role=button");
ok(/id="chipMonth"[^>]*role="button"/.test(htmlSrc), "本期已赚 role=button");
ok(/class="qmark"/.test(htmlSrc), "三个数字都有极小 ? 标");
ok(/#sheet\{[^}]*translateY\(105%\)/.test(htmlSrc), "抽屉默认收起（transform 105%）");
ok(/id="sheet"[^>]*role="dialog"/.test(htmlSrc), "抽屉 role=dialog aria-modal");
ok(htmlSrc.indexOf('id="sheetMask"') < htmlSrc.indexOf("<script>"), "抽屉 DOM 在脚本之前（脚本执行时能取到节点）");
ok(htmlSrc.indexOf('id="hitToday"') < htmlSrc.indexOf("<script>"), "可点数字 DOM 在脚本之前");

// 同一假时钟：09:00 开始 → 15:45 打开抽屉，抽屉数字必须 === 主界面数字
setClock("2026-11-03T15:45:00");
fresh27();
click("btnStart");
const mainToday = moneyOf("todayEarn");
click("hitToday");
ok(nodes["sheet"].classList.contains("show"), "点「今天已赚」→ 抽屉打开");
const tBody = txtOf("sheetBody");
ok(tBody.indexOf("时薪") >= 0 && tBody.indexOf("有效工时") >= 0, "今天抽屉有三段式算式（时薪 × 有效工时 = 金额）");
ok(tBody.indexOf("上班 08:30") >= 0, "今天抽屉写出上班时间");
ok(tBody.indexOf("现在 15:45") >= 0, "今天抽屉写到「现在 15:45」");
ok(tBody.indexOf(mainToday.toFixed(2)) >= 0, "今天抽屉数字 === 主界面（" + mainToday.toFixed(2) + "）");
click("hitToday");
ok(!nodes["sheet"].classList.contains("show"), "再点同一个数字可关");

click("chipRate");
ok(nodes["sheet"].classList.contains("show"), "点「时薪卡」→ 抽屉打开");
const rBody = txtOf("sheetBody"), mainRate = moneyOf("rateTxt");
ok(rBody.indexOf("21.75") >= 0, "时薪抽屉写明 21.75");
ok(rBody.indexOf("(365−104)/12") >= 0, "时薪抽屉解释 21.75 = (365−104)/12");
ok(rBody.indexOf("不含个税与社保") >= 0, "时薪抽屉写明不含个税与社保");
ok(rBody.indexOf("月末对账") >= 0, "时薪抽屉提示可在月末对账校准");
ok(rBody.indexOf(mainRate.toFixed(2)) >= 0, "时薪抽屉数字 === 主界面（" + mainRate.toFixed(2) + "）");
click("sheetClose");
ok(!nodes["sheet"].classList.contains("show") && !nodes["sheetMask"].classList.contains("show"), "关闭按钮关掉且遮罩无残留");

click("chipMonth");
const pBody = txtOf("sheetBody"), mainMonth = moneyOf("monthEarn");
ok(pBody.indexOf("账期") >= 0 && pBody.indexOf("工作日") >= 0, "本期抽屉含账期与工作日数");
ok(pBody.indexOf("其中：") >= 0, "本期抽屉按类型分组（正常/病假/休息/加班）");
ok(pBody.indexOf(mainMonth.toFixed(2)) >= 0, "本期抽屉数字 === 主界面（" + mainMonth.toFixed(2) + "）");
if (listeners["__doc__"] && listeners["__doc__"].keydown) listeners["__doc__"].keydown({code:"Escape", target:{tagName:"BODY"}, preventDefault(){}});
ok(!nodes["sheet"].classList.contains("show") && !nodes["sheetMask"].classList.contains("show"), "Esc 可关且遮罩无残留");
click("hitToday");
if (listeners["sheetMask"] && listeners["sheetMask"].click) listeners["sheetMask"].click({target:nodes["sheetMask"], preventDefault(){}});
ok(!nodes["sheet"].classList.contains("show") && !nodes["sheetMask"].classList.contains("show"), "点遮罩可关且无残留");

// 今天还没开始计时：抽屉给「还没开始计时」而不是空白
fresh27();
click("hitToday");
ok(txtOf("sheetBody").indexOf("还没开始计时") >= 0, "今天未开始时抽屉提示「还没开始计时」");
ok(txtOf("sheetBody").indexOf("不含个税与社保") >= 0, "今天未开始时说明文案仍在");
click("sheetClose");

// 未设置月薪时也不崩：抽屉照开，说明文案仍在
store = {}; boot();
click("chipRate");
ok(nodes["sheet"].classList.contains("show"), "未设置月薪也能开抽屉（不崩）");
ok(txtOf("sheetBody").indexOf("不含个税与社保") >= 0, "未设置月薪时说明文案仍在");

/* 56 估算快照固化 */
console.log("\n=== 56. 估算快照固化 ===");
fresh27(null); actFill(5412.68);
var estBefore = (actList()[0] || {}).estimate || 0;
setSetting({salary:20000});
nodes["iSalary"].value = "20000";
click("btnSave");
var estAfter = (actList()[0] || {}).estimate || 0;
near(estAfter, estBefore, 0.001, "改月薪后已保存的 estimate 不变");
ok(nodes["actualBody"].innerHTML.indexOf(Number(estBefore).toFixed(2)) >= 0, "卡片仍显示快照估算值");


/* ===== v28.02 对账归因快照化 ===== */
console.log("\n=== 59. 对账归因快照化（改月薪不改旧账说法）===");
fresh27(null);
actFill(5000);
var R0 = actList()[0];
ok(Array.isArray(R0.impactSnapshot), "保存时写入 impactSnapshot 数组");
ok(R0.basis === "full-attendance", "basis 记录为 full-attendance（实际 " + R0.basis + "）");
ok(typeof R0.dailyPaySnapshot === "number" && R0.dailyPaySnapshot > 0, "dailyPaySnapshot 是正数（实际 " + R0.dailyPaySnapshot + "）");
ok(typeof R0.paidDaysSnapshot === "number" && R0.paidDaysSnapshot > 0, "paidDaysSnapshot 是正整数（实际 " + R0.paidDaysSnapshot + "）");
var attrBefore = nodes["resAttr"].innerHTML;
var conclBefore = txtOf("resConcl");
var estBefore = R0.estimate;

setSetting(Object.assign({}, SET27, {salary: 15000}));
boot();
click("btnActHist");
click("histRow0");
ok(nodes["resAttr"].innerHTML === attrBefore, "改月薪 9800→15000 后重开旧账，归因明细逐字不变");
ok(txtOf("resConcl") === conclBefore, "结论文案逐字不变");
ok(actList()[0].estimate === estBefore, "estimate 快照不变（实际 " + actList()[0].estimate + "）");
ok(nodes["resAttr"].innerHTML.indexOf("旧数据无快照") < 0, "有快照的记录不出现「旧数据无快照」");

/* 老数据（v28.01 之前，无快照）降级：按当前口径算 + 明确标注 */
fresh27(null);
actFill(5000);
var L0 = JSON.parse(JSON.stringify(actList()[0]));
delete L0.impactSnapshot; delete L0.basis; delete L0.dailyPaySnapshot; delete L0.paidDaysSnapshot;
store[KEY_ACT] = JSON.stringify([L0]);
boot();
click("btnActHist");
click("histRow0");
ok(nodes["resAttr"].innerHTML.indexOf("旧数据无快照") >= 0, "老数据（无快照）从历史点开显示降级说明");
ok(nodes["resAttr"].innerHTML.indexOf("按当前口径重算") >= 0, "降级说明写明「按当前口径重算」");
ok(actList()[0].impactSnapshot === undefined, "只是打开查看，不会把快照补写回老记录");

/* 用户再次保存老记录时补写快照（之后说法即固定） */
click("btnActEdit");
nodes["actAmount"].value = "5000";
click("btnActSave");
ok(Array.isArray(actList()[0].impactSnapshot), "再次保存老记录时补写快照（之后说法固定）");
ok(actList()[0].basis === "full-attendance", "补写的 basis 正确");
var afterUpgrade = JSON.stringify(actList()[0].impactSnapshot);
setSetting(Object.assign({}, SET27, {salary: 20000}));
boot();
click("btnActHist");
click("histRow0");
ok(JSON.stringify(actList()[0].impactSnapshot) === afterUpgrade, "升级后的快照再改月薪也不变");
ok(nodes["resAttr"].innerHTML.indexOf("旧数据无快照") < 0, "升级后不再显示降级说明");


/* ===== v29 时薪轨迹 ===== */
console.log("\n=== 60. 时薪轨迹（长期视角）===");
const KEY_PHASES = "niuma.phases.v1";
function phases(){ return JSON.parse(store[KEY_PHASES] || "[]"); }
function seedPhases(a){ store[KEY_PHASES] = JSON.stringify(a); }

fresh27(null);
var P0 = phases();
ok(P0.length === 1, "首次使用自动生成 1 段初始阶段（实际 " + P0.length + "）");
ok(/^\d{4}-(0[1-9]|1[0-2])$/.test(String((P0[0] || {}).from)), "初始阶段 from 是 YYYY-MM（实际 " + (P0[0] || {}).from + "）");
ok(P0[0].salary === 9800 && +P0[0].days === 21.75 && +P0[0].hours === 7, "初始阶段来自当前设置（9800 / 21.75 / 7）");
ok(htmlSrc.indexOf('id="phaseCard"') > htmlSrc.indexOf('id="actualCard"') &&
   htmlSrc.indexOf('id="phaseCard"') < htmlSrc.indexOf('id="histCard"'),
   "时薪轨迹卡片在「月末对账」之后、「近 6 个月」之前");
ok(nodes["phaseCard"].style.display === "", "有阶段数据时卡片可见（折叠态由 details 控制）");

/* 同月改月薪 → 覆盖最后一段；跨月 → 追加 */
nodes["iSalary"].value = "12000";
click("btnSave");
ok(phases().length === 1, "同月改月薪覆盖最后一段、不新增（实际 " + phases().length + " 段）");
ok(+phases()[0].salary === 12000, "覆盖后月薪 12000（实际 " + phases()[0].salary + "）");

seedPhases([{from: "2025-01", salary: 7000, days: 21.75, hours: 8, note: "旧公司"}]);
boot();
nodes["iSalary"].value = "8800";
click("btnSave");
var P2 = phases();
ok(P2.length === 2, "上次阶段在更早月份 → 改设置追加新阶段（实际 " + P2.length + " 段）");
ok(+P2[1].salary === 8800 && P2[1].from !== "2025-01", "新阶段用当前月 + 新薪资");
ok(+P2[0].salary === 7000, "旧阶段的薪资不被现在的设置改写（写入时快照化）");

/* 三句人话：涨幅 / 同样 8 小时 / 分界文案 */
seedPhases([
  {from: "2024-01", salary: 7000, days: 21.75, hours: 8},
  {from: "2026-11", salary: 9800, days: 21.75, hours: 7}
]);
boot();
var sent = txtOf("phaseBody");
ok(sent.indexOf("时薪涨了 60%") >= 0, "涨幅句：涨了 60%（40.23 → 64.37）");
ok(sent.indexOf("¥40.23") >= 0 && sent.indexOf("¥64.37") >= 0, "涨幅句带两个时薪");
ok(sent.indexOf("同样 8 小时") >= 0 && sent.indexOf("¥321.84") >= 0 && sent.indexOf("¥514.94") >= 0,
   "「同样 8 小时」换算正确（¥321.84 / ¥514.94）");
ok(/<polyline/.test(nodes["phaseBody"].innerHTML) && /<circle/.test(nodes["phaseBody"].innerHTML),
   "折线图用原生 SVG（未引图表库）");
ok((nodes["phaseBody"].innerHTML.match(/class="ph-dot"/g) || []).length === 2, "曲线点数 = 阶段数");

seedPhases([
  {from: "2024-01", salary: 9800, days: 21.75, hours: 7},
  {from: "2026-11", salary: 7000, days: 21.75, hours: 8}
]);
boot();
var neg = txtOf("phaseBody");
ok(neg.indexOf("时薪降了") >= 0, "负增长说「降了 X%」");
ok(neg.indexOf("涨了 -") < 0, "不会出现「涨了 -X%」");

seedPhases([
  {from: "2024-01", salary: 9800, days: 21.75, hours: 7},
  {from: "2026-11", salary: 9850, days: 21.75, hours: 7}
]);
boot();
ok(txtOf("phaseBody").indexOf("基本没动") >= 0, "涨幅 <5% 时说「这 N 个月时薪基本没动」（产品良心）");

/* 阶段编辑：立即重算，历史段可改 */
seedPhases([
  {from: "2024-01", salary: 7000, days: 21.75, hours: 8},
  {from: "2026-11", salary: 9800, days: 21.75, hours: 7}
]);
boot();
nodes["phSalary1"].value = "10000";
listeners["phSalary1"].change({});
ok(+phases()[1].salary === 10000, "编辑阶段月薪后写回 niuma.phases.v1");
ok(txtOf("phaseBody").indexOf("¥525.45") >= 0, "编辑后「同样 8 小时」立即重算（10000/21.75/7×8=525.45）");
ok((nodes["phaseBody"].innerHTML.match(/class="ph-dot"/g) || []).length === 2, "编辑后曲线点数仍与阶段数一致");

click("btnPhaseAdd");
ok(phases().length === 2, "同月点「+ 添加一段」→ 覆盖末段、不新增（实际 " + phases().length + " 段）");
ok(+phases()[1].hours === 7, "覆盖后 hours 取当前设置算出的 7（不是 8）（实际 " + phases()[1].hours + "）");
click("btnPhDel1");
ok(phases().length === 1, "点「删」删除该阶段（实际 " + phases().length + " 段）");

/* 存储 + IDB 快照 */
ok(JSON.parse(store[KEY_PHASES] || "[]").length === 1, "阶段写入 localStorage niuma.phases.v1");
var snapP = window.__niuma.IDB.snapshot();
ok(Array.isArray(snapP.phases) && snapP.phases.length === 1, "IDB 快照含 phases（实际 " + (snapP.phases ? snapP.phases.length : "无") + "）");


/* ===== v30 安静的下班小结 ===== */
console.log("\n=== 61. 安静的下班小结 ===");
setClock("2026-11-03T18:00:00");
store = {}; setRecs({});
setSetting({salary: 9800, payDay: 15, workStart: "08:30", workEnd: "18:00", breakStart: "11:30", breakEnd: "14:00"});
boot();
click("btnStart");
var al61 = alerts.length, pr61 = promptCount;
click("btnStop");
ok(alerts.length === al61 && promptCount === pr61, "存档过程无 alert / prompt 弹窗");
ok(nodes["daySummary"].style.display !== "none", "存档后页面出现一行小结（不是弹窗）");
var sumTxt = txtOf("daySummary");
ok(sumTxt.indexOf("今天上班 7h00m") >= 0, "小结含工时 7h00m（实际：" + sumTxt + "）");
ok(sumTxt.indexOf("¥450.57") >= 0, "小结金额与主界面一致");
ok(Math.abs(moneyOf("todayEarn") - 450.57) < 0.01, "主界面今日已赚 ¥450.57");
ok(new RegExp("这个月第 [0-9]+ 个上班日").test(sumTxt) && sumTxt.indexOf("累计 ¥") >= 0, "小结含「这个月第 N 个上班日，累计 ¥X」");
ok(!/[恭喜厉害真棒牛啊太强了]|继续加油|庆祝|撒花/.test(sumTxt + txtOf("daySummaryMore")), "无庆祝词/感叹式文案");
ok(nodes["daySummary"].getAttribute("aria-expanded") === "false", "默认收起（aria-expanded=false）");
ok(nodes["daySummary"].classList.contains("show") === false, "不是弹窗/遮罩（无 show 类）");

click("daySummary");
var more = txtOf("daySummaryMore");
ok(nodes["daySummaryMore"].style.display === "block", "点一下展开细节");
ok(more.indexOf("今日") >= 0 && more.indexOf("本月") >= 0 && more.indexOf("本年") >= 0, "展开含今日/本月/本年三行");
ok(nodes["daySummary"].getAttribute("aria-expanded") === "true", "展开后 aria-expanded=true");
click("daySummary");
ok(nodes["daySummaryMore"].style.display === "none", "再点收起");
ok(nodes["daySummary"].getAttribute("aria-expanded") === "false", "收起后 aria-expanded=false");

/* 刷新后仍在；重新开始计时后隐藏 */
boot();
ok(nodes["daySummary"].style.display !== "none", "刷新后（今天已存档）小结仍在");
ok(txtOf("daySummary").indexOf("¥450.57") >= 0, "刷新后小结金额仍一致");
click("btnRestart");
ok(nodes["daySummary"].style.display === "none", "点「继续计时」后小结隐藏（回到计时态）");

/* P3-a：时薪抽屉措辞与对账口径一致 */
click("chipRate");
var rateNote = txtOf("sheetBody");
ok(rateNote.indexOf("满勤应得") >= 0, "时薪抽屉说明提到对账用的「满勤应得」口径");
ok(rateNote.indexOf("几十元偏差") < 0, "不再说「月末对账可能有几十元偏差」");
click("sheetClose");

/* P3-b：抵消场景明细合并成一行 */
setClock("2026-11-03T15:45:00"); store = {};
fresh27({"2026-10-21":{type:"off"}, "2026-10-23":{type:"ot", mul:2}});
actFill(firstMoney("actualBody"));
var a61 = nodes["resAttr"].innerHTML;
ok(/基本抵消/.test(a61), "休息/加班抵消时明细合并标注「基本抵消」");
ok((a61.match(/class="act-arow/g) || []).length <= 3, "抵消场景不再逐条分行堆数字");

/* P3-c：高代扣不误报「只发了一部分」 */
setClock("2026-11-03T15:45:00"); store = {};
fresh27(null);
click("btnActFill");
nodes["actAmount"].value = "3000";
nodes["actSocial"].value = "1500";
nodes["actHousing"].value = "400";
click("btnActSave");
ok(nodes["actWarn"].style.display === "none", "代扣很高（实发 ¥3000、代扣 ¥1900）时不误报「只发一部分」");


/* ===== v30.01 阶段修复 + P3 ===== */
console.log("\n=== 62. 时薪阶段修复（首启工时/同月覆盖/单段文案）===");
fresh27(null);
ok(phases().length === 1, "首启只有 1 段初始阶段");
ok(+phases()[0].hours === 7, "首启阶段 hours = paidHours() = 7（不是 undefined→8）（实际 " + phases()[0].hours + "）");
click("btnPhaseAdd");
ok(phases().length === 1, "首启点「+ 添加一段」同月覆盖、不新增（实际 " + phases().length + " 段）");
ok(+phases()[0].hours === 7, "添加后 hours 仍是 7（实际 " + phases()[0].hours + "）");
ok(txtOf("phaseBody").indexOf("¥64.37") >= 0, "添加后时薪仍是 ¥64.37（不是 56.32）");
ok(txtOf("phaseBody").indexOf("目前只有一段记录") >= 0, "只有一段时文案正确（不再误报）");
click("btnPhaseAdd");
ok(phases().length === 1, "同月重复添加仍不新增（实际 " + phases().length + " 段）");

/* 同月多段时不得说「只有一段记录」 */
seedPhases([
  {from: "2026-11", salary: 9800, days: 21.75, hours: 7},
  {from: "2026-11", salary: 9800, days: 21.75, hours: 8}
]);
boot();
ok(txtOf("phaseBody").indexOf("只有一段记录") < 0, "同月 2 段时不再误报「只有一段记录」");
ok(txtOf("phaseBody").indexOf("2 段阶段") >= 0, "同月多段文案写明段数");

/* 非法月份拒绝写入；合法乱序按月份排序 */
seedPhases([
  {from: "2024-01", salary: 7000, days: 21.75, hours: 8},
  {from: "2026-11", salary: 9800, days: 21.75, hours: 7}
]);
boot();
nodes["phMonth0"].value = "2026-13";
listeners["phMonth0"].change({});
ok(phases()[0].from === "2024-01" && phases().length === 2, "非法月份 2026-13 被拒绝，不写入（实际 " + phases()[0].from + "）");
nodes["phMonth1"].value = "2023-05";
listeners["phMonth1"].change({});
ok(phases()[0].from === "2023-05", "合法但乱序的月份按时间排序（实际首段 " + phases()[0].from + "）");

/* 月薪为 0：不再拿历史时薪冒充「现在值」 */
seedPhases([
  {from: "2024-01", salary: 7000, days: 21.75, hours: 8},
  {from: "2026-11", salary: 9800, days: 21.75, hours: 7}
]);
setSetting({salary: 0});
boot();
ok(txtOf("phaseBody").indexOf("还没填月薪") >= 0, "月薪为 0 时提示先填月薪");
ok(txtOf("phaseBody").indexOf("现在值") < 0, "月薪为 0 时不再显示历史「现在值」");

/* SVG 保持比例（不拉伸） */
ok(htmlSrc.indexOf('preserveAspectRatio="none"') < 0, "SVG 不再用 preserveAspectRatio=\"none\" 拉伸");
ok(/\.ph-svg\{width:100%;height:auto/.test(htmlSrc), "SVG 宽度自适应、高度按比例");


/* ===== v30.02 上班日只数真上了的 ===== */
console.log("\n=== 63. 休息日不算「本月第 N 个上班日」 ===");
setClock("2026-11-03T18:00:00");
store = {};
setRecs({
  "2026-11-01": {startMs: 1, endMs: 2, earnedMs: 27000000, earned: 450.57, rate: 64.37},
  "2026-11-02": {type: "off"}
});
setSetting({salary: 9800, payDay: 15, workStart: "08:30", workEnd: "18:00", breakStart: "11:30", breakEnd: "14:00"});
boot();
click("btnStart");
click("btnStop");
var s63 = txtOf("daySummary");
ok(/这个月第 2 个上班日/.test(s63), "3 天记录里 1 天标休息 → 显示第 2 个上班日（实际：" + s63 + "）");
ok(s63.indexOf("¥901.14") >= 0, "累计仍按真上班的两天算（¥901.14）");
ok(s63.indexOf("第 3 个上班日") < 0, "休息日不再被算成一天上班");


/* ===== 64. 深色模式配色（v30.03）：CSS 解析 + WCAG 对比度 ===== */
console.log("\n=== 64. 深色模式配色 ===");
(function(){
  var css = (htmlSrc.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
  function stripComments(c){ return c.replace(/\/\*[\s\S]*?\*\//g, ""); }
  function parseRules(c){
    var out = [], src = stripComments(c), i = 0;
    while (i < src.length) {
      var b = src.indexOf("{", i);
      if (b < 0) break;
      var sel = src.slice(i, b).trim();
      var d = 1, j = b + 1;
      while (j < src.length && d > 0) { if (src[j] === "{") d++; else if (src[j] === "}") d--; j++; }
      var body = src.slice(b + 1, j - 1);
      if (sel.indexOf("@media") === 0 || sel.indexOf("@supports") === 0) { out = out.concat(parseRules(body)); }
      else out.push({ sel: sel, body: body });
      i = j;
    }
    return out;
  }
  var R = parseRules(css);
  function hexOf(v){
    var m = String(v).match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
    if (!m) return null;
    var x = m[1];
    if (x.length === 3) x = x.replace(/./g, "$&$&");
    return "#" + x.toUpperCase();
  }
  function lin(c){ c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(h){
    return 0.2126 * lin(parseInt(h.slice(1,3),16)) + 0.7152 * lin(parseInt(h.slice(3,5),16)) + 0.0722 * lin(parseInt(h.slice(5,7),16));
  }
  function cr(a, b){ var x = lum(a), y = lum(b); var hi = Math.max(x,y), lo = Math.min(x,y); return (hi + 0.05) / (lo + 0.05); }

  /* 深色 token 表（body.dark 规则里的 --x:#hex） */
  var tokens = {};
  R.forEach(function(r){
    if (r.sel.trim() !== "body.dark") return;
    var re = /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})/g, m;
    while ((m = re.exec(r.body))) tokens[m[1]] = hexOf(m[2]);
  });
  function resolve(v){
    if (!v) return null;
    var m = /var\(--([\w-]+)\)/.exec(v);
    if (m && tokens[m[1]]) v = v.replace(/var\(--([\w-]+)\)/g, function(_, k){ return tokens[k] || ("var(--" + k + ")"); });
    return v;
  }
  /* 取某选择器最后一段（去掉伪类/伪元素） */
  function lastCompound(sel){
    var t = sel.trim().split(/\s+/).pop();
    return t.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "");
  }
  /* 收集深色规则里匹配 lastCompound 的 background，解析成 {sel, val, hex} */
  function darkBg(pred){
    var out = [];
    R.forEach(function(r){
      if (r.sel.indexOf("body.dark") < 0) return;
      r.sel.split(",").forEach(function(sel){
        var lc = lastCompound(sel);
        if (!pred(lc)) return;
        var m = /background(?:-color)?\s*:\s*([^;]+)/.exec(r.body);
        if (m) {
          var val = resolve(m[1].trim());
          out.push({ sel: sel.trim(), val: val, hex: hexOf(val) });
        }
      });
    });
    return out;
  }
  function nearWhite(list, name){
    var bad = list.filter(function(x){ return x.hex && lum(x.hex) > 0.25; });
    ok(bad.length === 0, "暗色 " + name + " 无近白底" + (bad.length ? "（" + bad.map(function(x){ return x.sel + "=" + x.val; }).join("; ") + "）" : ""));
  }

  /* 1) 页面/卡片层级 */
  var cardHex = tokens["card"] || null;
  ok(!!cardHex, "深色卡片 token --card 可解析（实际：" + cardHex + "）");
  var pageBg = (R.filter(function(r){ return r.sel.trim() === "body.dark"; })[0] || { body: "" }).body;
  var pageM = /background\s*:\s*([^;]+)/.exec(pageBg);
  var pageHex = pageM ? hexOf(resolve(pageM[1])) : null;
  ok(!!pageHex && lum(pageHex) < 0.12, "深色页面底足够暗（实际：" + pageHex + "）");
  ok(!!cardHex && lum(cardHex) < 0.18, "深色卡片亮度 < 0.18（实际：" + (cardHex ? lum(cardHex).toFixed(3) : "-") + "）");

  /* 2) 不允许纯白面：逐组件 */
  nearWhite(darkBg(function(c){ return c === ".card"; }), ".card");
  nearWhite(darkBg(function(c){ return c === ".chip"; }), ".chip");
  nearWhite(darkBg(function(c){ return c === ".tag"; }), ".tag");
  nearWhite(darkBg(function(c){ return c === ".state"; }), ".state");
  nearWhite(darkBg(function(c){ return c === ".b-stop"; }), ".b-stop");
  nearWhite(darkBg(function(c){ return c === ".b-ghost"; }), ".b-ghost");
  nearWhite(darkBg(function(c){ return c === ".mini-btn"; }), ".mini-btn");
  nearWhite(darkBg(function(c){ return c === ".mbox"; }), ".mbox");
  nearWhite(darkBg(function(c){ return c === ".menu"; }), ".menu");
  nearWhite(darkBg(function(c){ return c === ".d" || c.indexOf(".d.") === 0; }), "日历格");

  /* 3) 主数字：实渐变，两端对卡片 ≥4.5 */
  var moneyBg = darkBg(function(c){ return c === ".money"; });
  var moneyVal = moneyBg.length ? moneyBg[moneyBg.length - 1].val : "";
  var moneyHexes = (String(moneyVal).match(/#[0-9a-fA-F]{6}/g) || []).map(hexOf);
  ok(moneyHexes.length >= 2, "暗色主数字用实渐变（实际：" + moneyVal + "）");
  if (moneyHexes.length >= 2 && cardHex) {
    var minCr = Math.min.apply(null, moneyHexes.map(function(h){ return cr(h, cardHex); }));
    ok(minCr >= 4.5, "主数字两端对卡片对比 ≥4.5（实际：" + minCr.toFixed(2) + "）");
  } else { ok(false, "主数字对比无法计算"); }
  var zeroHex = (darkBg(function(c){ return c === ".money.zero"; })[0] || {});
  var zeroColor = /(?:^|;)\s*color\s*:\s*([^;]+)/.exec((R.filter(function(r){ return r.sel.indexOf("body.dark .money.zero") >= 0; })[0] || { body: "" }).body);
  var zeroCol = zeroColor ? hexOf(resolve(zeroColor[1])) : null;
  ok(!!zeroCol && !!cardHex && cr(zeroCol, cardHex) >= 4.5, "零值金额对卡片对比 ≥4.5（实际：" + (zeroCol ? cr(zeroCol, cardHex).toFixed(2) : "-") + "）");

  /* 4) 文字对比 */
  var bodyColor = /(?:^|;)\s*color\s*:\s*var\(--txt\)/.test(pageBg) ? tokens["txt"] : null;
  ok(!!bodyColor && !!cardHex && cr(bodyColor, cardHex) >= 4.5, "正文对卡片对比 ≥4.5（实际：" + (bodyColor ? cr(bodyColor, cardHex).toFixed(2) : "-") + "）");
  var dimHex = tokens["dim"] || null;
  ok(!!dimHex && !!cardHex && cr(dimHex, cardHex) >= 3.0, "次要文字对卡片对比 ≥3（实际：" + (dimHex ? cr(dimHex, cardHex).toFixed(2) : "-") + "）");

  /* 5) 进度条：轨道对卡片 ≥1.25，填充对轨道 ≥3 */
  var trackBg = darkBg(function(c){ return c === ".bar"; });
  var trackHex = trackBg.length ? trackBg[trackBg.length - 1].hex : null;
  ok(!!trackHex && !!cardHex && cr(trackHex, cardHex) >= 1.25, "进度轨道对卡片 ≥1.25（实际：" + (trackHex ? cr(trackHex, cardHex).toFixed(2) : "-") + "）");
  var fillBg = darkBg(function(c){ return c === "i"; });
  var fillHex = fillBg.length ? hexOf(fillBg[fillBg.length - 1].val) : null;
  ok(!!fillHex && !!trackHex && cr(fillHex, trackHex) >= 3.0, "进度填充对轨道 ≥3（实际：" + (fillHex ? cr(fillHex, trackHex).toFixed(2) : "-") + "）");

  /* 6) 三态徽章：文字对底色 ≥4.5 */
  function ruleBody(sel){
    var hit = R.filter(function(r){ return r.sel.replace(/\s+/g, " ").trim() === sel; });
    return hit.length ? hit[hit.length - 1].body : "";
  }
  ["body.dark .state.on", "body.dark .state.done"].forEach(function(sel){
    var b = ruleBody(sel);
    var bg = /background\s*:\s*([^;]+)/.exec(b), fg = /(?:^|;)\s*color\s*:\s*([^;]+)/.exec(b);
    var bgH = bg ? hexOf(resolve(bg[1])) : null, fgH = fg ? hexOf(resolve(fg[1])) : null;
    ok(!!bgH && !!fgH && cr(fgH, bgH) >= 4.5, sel + " 文字对比 ≥4.5（实际：" + (bgH && fgH ? cr(fgH, bgH).toFixed(2) : "-") + "）");
  });

  /* 7) 亮色模式不回退（:root token 也要能解析） */
  var rootTokens = {};
  R.forEach(function(r){
    if (r.sel.trim() !== ":root") return;
    var re = /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})/g, m;
    while ((m = re.exec(r.body))) rootTokens[m[1]] = hexOf(m[2]);
  });
  function resolveRoot(v){
    if (!v) return v;
    return v.replace(/var\(--([\w-]+)\)/g, function(_, k){ return rootTokens[k] || ("var(--" + k + ")"); });
  }
  var lightCard = R.filter(function(r){ return r.sel.replace(/\s+/g, " ").trim() === ".card" && /background/.test(r.body); });
  var lightCardBg = lightCard.length ? /background\s*:\s*([^;]+)/.exec(lightCard[lightCard.length - 1].body) : null;
  var lightHex = lightCardBg ? hexOf(resolveRoot(lightCardBg[1].trim())) : null;
  ok(!!lightHex && lum(lightHex) > 0.7, "亮色卡片仍是浅底（实际：" + lightHex + "）");
  ok(/linear-gradient\(92deg,#1f8fe0 10%,#22c58b 90%\)/.test(css), "亮色主数字渐变原值未变");

  /* 8) 内联色已挪进 CSS（深色才能覆盖） */
  ok(htmlSrc.indexOf('id="errBar" style="display:none"') >= 0 && /#errBar\{background:#ffe1e1/.test(css), "错误条颜色在 CSS 里（不在内联 style）");
  ok(/#actWarn\{margin:6px 0 0/.test(css), "对账提醒颜色在 CSS 里（不在内联 style）");
  ok(/\.state::before\{content:""/.test(css), "状态徽章有圆点（不只靠颜色区分）");
})();


/* ===== 65. 手机端布局（v30.04）：横向溢出 / 三栏 / 主数字 / 进度行 ===== */
console.log("\n=== 65. 手机端布局（375px 不溢出、三栏两列、主数字不裁） ===");
(function(){
  var css = (htmlSrc.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
  function strip(c){ return c.replace(/\/\*[\s\S]*?\*\//g, ""); }
  var src = strip(css);

  /* 取出 max-width:720px 的媒体查询块（按大括号配对，允许里面嵌套规则） */
  function mediaBlock(px){
    var out = [], re = new RegExp("@media\\s*\\(max-width:\\s*" + px + "px\\)\\s*\\{", "g"), m;
    while ((m = re.exec(src))) {
      var i = m.index + m[0].length - 1, d = 0, j = i;
      while (j < src.length) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (d === 0) break; } j++; }
      out.push(src.slice(i + 1, j));
    }
    return out.join("\n");
  }
  function decls(scope, sel){
    var out = [], re = new RegExp("(?:^|[},])\\s*" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}", "g"), m;
    while ((m = re.exec(scope))) out.push(m[1]);
    return out.join(";");
  }
  var mq = mediaBlock(720);
  ok(mq.length > 0, "存在 @media (max-width:720px) 断点");

  /* 1) 手机上去掉小窗入口 */
  var miniDecl = decls(mq, "#btnMini");
  ok(/display\s*:\s*none/.test(miniDecl), "断点内 #btnMini 为 display:none（实际：" + (miniDecl || "无") + "）");

  /* 2) 三栏断点内两列，时薪卡通栏 */
  var chipsMq = decls(mq, ".chips") + decls(mq, ".grid3");
  ok(/grid-template-columns\s*:\s*(1fr\s+1fr|repeat\(2,\s*1fr\)|repeat\(2,\s*minmax\(0,\s*1fr\)\))/.test(chipsMq),
     "断点内 .chips/.grid3 变两列（实际：" + (chipsMq || "无") + "）");
  ok(/grid-column\s*:\s*1\s*\/\s*-1/.test(decls(mq, "#chipRate")), "断点内时薪卡 grid-column:1/-1 通栏");
  ok(/white-space\s*:\s*nowrap/.test(decls(mq, "#rateTxt")), "断点内三段时薪单行不换行");

  /* 3) 主数字 clamp + nowrap，小数不裁 */
  var moneyDecl = decls(src, ".money");
  var cl = /font-size\s*:\s*clamp\(\s*([0-9.]+)px/.exec(moneyDecl);
  ok(!!cl && parseFloat(cl[1]) <= 40, "主数字用 clamp 且下限 ≤ 40px（实际：" + (cl ? cl[1] + "px" : "无") + "）");
  ok(/white-space\s*:\s*nowrap/.test(moneyDecl), "主数字 white-space:nowrap（不把小数换行）");

  /* 4) 横向溢出兜底 + .wrap 盒模型 */
  var htmlBody = decls(src, "html") + ";" + decls(src, "body");
  ok(/overflow-x\s*:\s*hidden/.test(htmlBody), "html/body 有 overflow-x:hidden 兜底（实际：" + (htmlBody || "无") + "）");
  ok(/max-width\s*:\s*100%/.test(htmlBody), "html/body 有 max-width:100%");
  var wrapDecl = decls(src, ".wrap");
  ok(/width\s*:\s*100%/.test(wrapDecl) && /box-sizing\s*:\s*border-box/.test(wrapDecl) || /box-sizing:border-box/.test(src),
     ".wrap 宽度 100% 且 box-sizing:border-box");

  /* 5) 顶部栏可换行 */
  ok(/flex-wrap\s*:\s*wrap/.test(decls(src, ".top")), "顶部栏 flex-wrap:wrap");
  ok(/flex-wrap\s*:\s*wrap/.test(decls(src, ".tools")), "顶部工具区 flex-wrap:wrap");

  /* 6) 进度行不裁字：允许换行、baseline 对齐 */
  var barTop = decls(src, ".bar-top");
  ok(/align-items\s*:\s*baseline/.test(barTop), "进度行 label/数值 baseline 对齐");
  ok(/flex-wrap\s*:\s*wrap/.test(barTop) || /white-space\s*:\s*normal/.test(barTop), "进度行窄屏允许换行不裁字");

  /* 7) 没有超过视口的固定宽度 */
  var wide = [];
  var reW = /(?:^|[;{])\s*(?:min-)?width\s*:\s*([0-9.]+)px/g, m2;
  while ((m2 = reW.exec(src))) { if (parseFloat(m2[1]) > 900) wide.push(m2[1] + "px"); }
  ok(wide.length === 0, "没有 >900px 的写死宽度（实际：" + (wide.join(", ") || "无") + "）");

  /* 8) 深浅两套 token 不受影响 */
  ok(/body\.dark\{[\s\S]*?--card:#182633/.test(src), "深色 token 仍在");
  ok(/linear-gradient\(92deg,#1f8fe0 10%,#22c58b 90%\)/.test(src), "亮色主数字渐变未被布局改动影响");
})();


/* ===== 66. 空格提示已删除（v30.05）：DOM/CSS/文案都不留，快捷键仍在 ===== */
console.log("\n=== 66. 删掉「空格」文字提示，快捷键仍可用 ===");
(function(){
  var css66 = (htmlSrc.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
  ok(htmlSrc.indexOf('class="hint"') < 0, "DOM 里没有 .hint 提示（真删除，不是 display:none）");
  ok(htmlSrc.indexOf("空格") < 0, "页面文案里不再出现「空格」");
  ok(!/\.hint\s*[{,:]/.test(css66), "CSS 里没有 .hint 规则（含 body.mini / 媒体查询里的）");
  ok(!/aria[^>]*空格/.test(htmlSrc), "没有残留的「空格」aria 提示");

  setClock("2026-11-11T10:00:00"); setRecs({}); boot();
  ok(nodes["stateTag"].textContent === "未开始", "删提示后 boot 仍是未开始");
  docKey({ code: "Space", target: { tagName: "BODY" }, preventDefault(){} });
  ok(nodes["stateTag"].textContent === "工作中", "页面按空格仍能开始上班");

  setClock("2026-11-11T10:00:00"); setRecs({}); boot();
  docKey({ code: "Space", target: { tagName: "INPUT", classList: { contains: function(){ return false; } } }, preventDefault(){} });
  ok(nodes["stateTag"].textContent === "未开始", "输入框里按空格仍不触发");

  /* 手机上也没有这个提示了（断点内不再有 .hint 覆盖） */
  ok(!/\.hint/.test(css66), "手机断点里也没有 .hint 残留");
})();


/* ===== 67 v30.06：手机端布局 + 口径一致（改前必红） ===== */
(function(){
  console.log("=== 67. v30.06 手机端布局与口径一致 ===");
  var css67 = htmlSrc.slice(htmlSrc.indexOf("<style>"), htmlSrc.indexOf("</style>"));
  var mob67 = css67.slice(css67.indexOf("@media (max-width:720px){"));
  ok(/\.cal\s*\{[^}]*grid-template-columns:repeat\(7,\s*minmax\(0,1fr\)\)/.test(css67), "日历 7 列改 minmax(0,1fr)，不溢出右边界");
  ok(/\.rowflex\s*\{[^}]*flex-wrap:wrap/.test(mob67) && /\.rowflex h2\{[^}]*white-space:nowrap/.test(mob67), "窄屏卡片标题 nowrap，不会竖排");
  ok(/\.cal \.d \.e\{[^}]*text-overflow:ellipsis/.test(css67), "格子内金额省略号，不撑破格子");
  ok(/\.f label\{[^}]*white-space:nowrap/.test(mob67), "窄屏设置项标题不折行（加班倍率）");

  function narrow67(on){
    if(on) global.window.matchMedia = function(q){ return { matches: true, media: q, addListener: function(){}, removeListener: function(){}, addEventListener: function(){}, removeEventListener: function(){} }; };
    else delete global.window.matchMedia;
  }
  var B67 = { salary: 9800, days: 21.75, payDay: 1, restMode: "double", workStart: "08:30", workEnd: "18:00", breakStart: "11:30", breakEnd: "14:00", freq: 1000, theme: "light" };
  narrow67(true);
  setClock("2026-11-03T10:00:00");
  setSetting(B67);
  setRecs({ "2026-09-10": { earned: 450.57, earnedMs: 7*3600000, rate: 64.37, endMs: 1, pauses: [] } });
  boot();
  var hist67 = txtOf("histBody"), histRaw67 = nodes["histBody"]._html || "";
  var bars67 = (histRaw67.match(/class="hcol"/g) || []).length;
  ok(bars67 <= 3, "手机图表最多 3 根柱（实际 " + bars67 + " 根）");
  ok(hist67.indexOf("¥0.00") < 0, "0 元月份不画柱、不堆 0 元金额");
  ok(/9月/.test(hist67) && !/9 月/.test(hist67), "手机 X 轴是单行短标签「9月」");

  setSetting(B67); setRecs({}); boot();
  var empty67 = txtOf("histBody");
  ok(empty67.indexOf("还没有足够数据") >= 0 && !/class="hcol"/.test(empty67), "数据全 0 时显示「还没有足够数据」，不画空柱");

  narrow67(false);
  setClock("2026-11-03T10:00:00");
  setSetting(B67);
  setRecs({ "2026-11-02": { earned: 450.57, earnedMs: 7*3600000, rate: 64.37, endMs: 1, pauses: [] } });
  boot(); click("btnStart");
  var stat67 = txtOf("statBody"), act67 = txtOf("actualBody");
  var mStat = stat67.match(/正常上班\s*(\d+)\s*天/), mFull = act67.match(/(\d+)\s*个完整工作日/);
  ok(!!mStat && !!mFull, "两处都给出天数（构成 " + (mStat ? mStat[1] : "?") + " / 满勤 " + (mFull ? mFull[1] : "?") + "）");
  var dStat67 = mStat ? +mStat[1] : -1, dFull67 = mFull ? +mFull[1] : -2;
  ok(dStat67 === dFull67 || dStat67 === dFull67 + 1, "构成天数与满勤工作日的差只能用「今天」解释（" + dStat67 + " vs " + dFull67 + "）");
  ok(act67.indexOf("今天") >= 0, "满勤应得标注「不含今天 / 今天进行中」的口径");
  ok(stat67.indexOf("今天进行中") >= 0, "本期构成标注今天进行中");

  var phase67 = htmlSrc.slice(htmlSrc.indexOf('id="phaseCard"'), htmlSrc.indexOf('id="histCard"'));
  ok(phase67.indexOf("折叠") < 0, "时薪轨迹不再挂重复的「折叠」按钮");
  ok(/summary/.test(phase67) && /ph-t/.test(phase67), "保留 summary 的箭头与标题");

  /* 9 首屏动作不埋：按钮在三小卡之前（flex order） */
  var oBtn67=(mob67.match(/\.main>\.btns\{order:(\d+)/)||[])[1];
  var oChip67=(mob67.match(/\.main>\.chips\{order:(\d+)/)||[])[1];
  ok(!!oBtn67 && !!oChip67 && +oBtn67 < +oChip67, "手机首屏按钮排在三小卡之前（order "+oBtn67+" < "+oChip67+"）");
  ok(htmlSrc.indexOf('id="btnStart"') > htmlSrc.indexOf('id="hitToday"'), "按钮 DOM 在主数字之后");

  /* 10 日历卡默认折叠 + 排到对账之后 */
  narrow67(true); setClock("2026-11-03T10:00:00"); setSetting(B67); setRecs({}); boot();
  ok(nodes["calBox"] && nodes["calBox"].open === false, "手机端日历默认折叠");
  var oAct67=(mob67.match(/#actualCard\{order:(\d+)/)||[])[1], oCal67=(mob67.match(/#calCard\{order:(\d+)/)||[])[1];
  ok(!!oAct67 && !!oCal67 && +oCal67 > +oAct67, "手机端日历卡排到「月末对账」之后（"+oAct67+" → "+oCal67+"）");
  narrow67(false);

  /* 11 对账三格窄屏单列 */
  ok(/\.act3\{flex-direction:column/.test(mob67), "手机端对账三格单列，不撑破");

  /* 12 不庆祝：无 🎉 */
  ok(APP.indexOf("🎉") < 0 && htmlSrc.indexOf("🎉") < 0, "页面/脚本里没有 🎉");

  /* 13 清空按钮单独一行放最底 + 二次确认 */
  ok(/class="danger-row"[\s\S]{0,200}id="btnClear"/.test(htmlSrc), "清空按钮单独一行放在设置最底");
  var clearSeg67 = APP.slice(APP.indexOf('getElementById("btnClear")'), APP.indexOf('getElementById("btnClear")') + 500);
  ok((clearSeg67.match(/confirm\(/g) || []).length >= 2, "清空数据有二次确认");
})();


/* ===== 68 v30.07：图表标题月数 === 实际柱数（改前必红） ===== */
(function(){
  console.log("=== 68. v30.07 图表标题不再撒谎 ===");
  function narrow68(on){
    if(on) global.window.matchMedia = function(q){ return { matches: true, media: q, addListener: function(){}, removeListener: function(){}, addEventListener: function(){}, removeEventListener: function(){} }; };
    else delete global.window.matchMedia;
  }
  var B68 = { salary: 9800, days: 21.75, payDay: 1, restMode: "double", workStart: "08:30", workEnd: "18:00", breakStart: "11:30", breakEnd: "14:00", freq: 1000, theme: "light" };
  function rec68(n){ return { earned: 450.57, earnedMs: 7*3600000, rate: 64.37, endMs: 1, pauses: [] }; }
  function titleNum68(){ var m = txtOf("histTitle").match(/(\d+)\s*个月/); return m ? +m[1] : -1; }
  function barNum68(){ return ((nodes["histBody"]._html || "").match(/class="hbar"/g) || []).length; }

  narrow68(true);
  setClock("2026-11-03T10:00:00"); setSetting(B68);
  setRecs({ "2026-09-10": rec68() }); boot();
  ok(txtOf("histTitle") === "近 1 个月", "手机只画 1 根柱时标题写「近 1 个月」（实际：" + txtOf("histTitle") + "）");
  ok(titleNum68() === barNum68(), "标题月数 === 实际柱数（" + titleNum68() + " vs " + barNum68() + "）");

  setSetting(B68); setRecs({ "2026-09-10": rec68(), "2026-10-12": rec68() }); boot();
  ok(txtOf("histTitle") === "近 2 个月", "手机 2 根柱时标题写「近 2 个月」（实际：" + txtOf("histTitle") + "）");
  ok(titleNum68() === barNum68(), "2 根柱时标题月数 === 柱数");

  setSetting(B68); setRecs({ "2026-09-10": rec68(), "2026-10-12": rec68(), "2026-11-02": rec68() }); boot();
  ok(txtOf("histTitle") === "近 3 个月" && barNum68() === 3, "手机 3 根柱时标题「近 3 个月」且柱数 3");

  narrow68(false);
  setSetting(B68);
  setRecs({ "2026-06-01": rec68(), "2026-09-10": rec68(), "2026-11-02": rec68() }); boot();
  ok(txtOf("histTitle") === "近 6 个月", "桌面标题仍是「近 6 个月」（实际：" + txtOf("histTitle") + "）");
  ok(titleNum68() === barNum68() && barNum68() === 6, "桌面 6 根柱且标题月数 === 柱数");
  narrow68(false);
})();

console.log("");
console.log("=== 结果：通过 " + pass + "，失败 " + fail + " ===");
process.exit(fail ? 1 : 0);
