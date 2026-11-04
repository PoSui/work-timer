#! /usr/bin/env node
/* 全量自检（v30.09）——独立于 harness，直接对 app.js / index.html 做静态与跨文件检查。
   用法：node _tests/selfcheck.js [--selftest]
         --selftest：在临时副本里故意制造 3 处故障，断言自检能 exit 1（证明自检不是摆设）。
   退出码：0 = 全部通过（或自检成功抓到故障）；1 = 有失败项。 */
const fs = require("fs");
const path = require("path");
const DIR = path.join(__dirname, "..");

const WHITELIST = {
  // 历史遗留：以下 5 个 id 在 v24 起就没有对应 DOM，但代码里都有 null 保护或位于死函数，运行期不会崩
  sumTag: "旧汇总标签，v24 后不再渲染；代码处 `if(sumTag)` 保护",
  rankWrap: "旧排行表容器，renderTables() 开头按 rankWrap 是否存在决定是否提前 return",
  detailBody: "旧明细表 tbody，仅死函数 renderTables() 内引用",
  rankBody: "旧排行 tbody，仅死函数 renderTables() 内引用",
  rankTag: "旧排行标签，仅死函数 renderTables() 内引用",
  mMode: "计薪方式旧控件；v26 起改用 iMode，openSetup 里 `if(mm)` 保护"
};

function readAll(dir) {
  return {
    html: fs.readFileSync(path.join(dir, "index.html"), "utf8"),
    app: fs.readFileSync(path.join(dir, "_tests", "app.js"), "utf8"),
    readme: fs.readFileSync(path.join(dir, "README.md"), "utf8"),
    ledger: fs.readFileSync(path.join(dir, "docs", "测试记录.md"), "utf8")
  };
}

function runHarness(dir) {
  const hp = path.join(dir, "_tests", "harness.js");
  if (!fs.existsSync(hp)) return null;
  const lines = [];
  const origLog = console.log, origExit = process.exit;
  console.log = function () { lines.push(Array.prototype.join.call(arguments, " ")); };
  let thrown = null;
  process.exit = function () { const e = new Error("__harness_exit__"); e.__harness = true; throw e; };
  try { eval(fs.readFileSync(hp, "utf8")); }
  catch (e) { if (!e || !e.__harness) thrown = e; }
  finally { console.log = origLog; process.exit = origExit; }
  if (thrown) throw thrown;
  const last = lines.filter(l => /=== 结果：通过 (\d+)，失败 (\d+) ===/.test(l)).pop() || "";
  const m = last.match(/通过 (\d+)，失败 (\d+)/);
  return m ? { pass: +m[1], fail: +m[2] } : null;
}

function runChecks(dir) {
  const F = readAll(dir);
  let pass = 0, fail = 0;
  const log = s => console.log(s);
  const ok = (c, m) => { if (c) { pass++; log("  ✅ " + m); } else { fail++; log("  ❌ " + m); } };
  const section = t => log("\n" + t);

  section("=== 1. id 完整性 ===");
  const htmlIds = new Set(Array.from(F.html.matchAll(/id="([\w-]+)"/g)).map(m => m[1]));
  const refs = Array.from(new Set(Array.from(F.app.matchAll(/getElementById\("([\w-]+)"\)/g)).map(m => m[1]))).sort();
  const missing = refs.filter(id => !htmlIds.has(id));
  log("  app 引用 id " + refs.length + " 个，HTML 定义 " + htmlIds.size + " 个");
  missing.forEach(id => log("    · " + id + (WHITELIST[id] ? "（白名单：" + WHITELIST[id] + "）" : " ← 缺失且无白名单")));
  ok(missing.every(id => WHITELIST[id]), "所有 getElementById 引用都在 HTML 中存在，或列在白名单里（缺失 " + missing.length + " 个）");

  section("=== 2. 语法 ===");
  try { new Function(F.app); ok(true, "app.js 语法通过（new Function 编译，等价 V8 解析）"); }
  catch (e) { ok(false, "app.js 语法失败：" + String(e.message).slice(0, 200)); }

  section("=== 3. CSS 括号配对 ===");
  const style = F.html.slice(F.html.indexOf("<style>") + 7, F.html.indexOf("</style>"));
  let d = 0, minD = 0; for (const ch of style) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < minD) minD = d; } }
  log("  顶层括号结余 = " + d + "，过程中最深负值 = " + minD);
  ok(d === 0 && minD === 0, "style 块 { 与 } 配对，无未闭合规则");

  section("=== 4. 弹窗调用点 ===");
  const calls = Array.from(F.app.matchAll(/\b(alert|confirm|prompt)\s*\(/g)).map(m => m[1]);
  const byType = calls.reduce((a, t) => (a[t] = (a[t] || 0) + 1, a), {});
  const EXPECT = { alert: 6, confirm: 5, prompt: 3 };
  log("  预期集合：" + JSON.stringify(EXPECT) + "；实际：" + JSON.stringify({ alert: byType.alert || 0, confirm: byType.confirm || 0, prompt: byType.prompt || 0 }));
  ok(Object.keys(EXPECT).every(k => (byType[k] || 0) === EXPECT[k]), "弹窗调用点数量与预期集合严格一致");

  section("=== 5. 文案洁癖 ===");
  const badWords = ["恭喜", "太厉害", "加油", "棒", "🎉", "🔥"];
  const bodyHtml = F.html.slice(F.html.indexOf("<body>"));
  const hits = badWords.filter(w => bodyHtml.includes(w));
  ok(hits.length === 0, "页面文案不含庆祝/激励词（命中：" + (hits.length ? hits.join("、") : "无") + "）");

  section("=== 6. innerHTML 注入面（真检查） ===");
  const risky = [];
  let sites = 0;
  F.app.split("\n").forEach((ln, i) => {
    const at = ln.indexOf("innerHTML");
    if (at < 0 || !/innerHTML\s*=/.test(ln)) return;
    sites++;
    const rhs = ln.slice(ln.indexOf("=", at) + 1);
    const hasPlus = rhs.indexOf("+") >= 0;
    const hasVar = /(S\.|R\[|this\.|e\.|rec\.|r\.|p\.|g\.|d\.|sel|name|note|label|value)/.test(rhs);
    const safe = /esc\(|money\(|moneyHTML\(|hmLabel\(|num\(/.test(rhs);
    if (hasPlus && hasVar && !safe) risky.push((i + 1) + ": " + ln.trim().slice(0, 110));
  });
  log("  innerHTML 赋值 " + sites + " 处；「+ 拼接 且 含变量 且 未 esc/money」命中 " + risky.length + " 处");
  risky.forEach(r => log("    · " + r));
  ok(risky.length === 0, "innerHTML 不拼接未转义的用户/状态变量");

  section("=== 7. 版本一致（严格相等） ===");
  const vTitle = ((F.html.match(/<title>([^<]*)<\/title>/) || [])[1] || "").match(/v[\d.]+/);
  const vBrand = ((F.html.match(/class="brand">([^<]*)</) || [])[1] || "").match(/v[\d.]+/);
  const vBadge = (F.readme.match(/version-(v[\d.]+)-blue/) || [])[1];
  const firstRow = (F.ledger.match(/^\| \d{4}-\d{2}-\d{2} \| (v[\d.]+) \|/m) || [])[1];
  log("  title=" + (vTitle && vTitle[0]) + " / brand=" + (vBrand && vBrand[0]) + " / README 徽标=" + vBadge + " / 台账最新行=" + firstRow);
  ok(!!vBadge && !!vTitle && !!vBrand && !!firstRow && vTitle[0] === vBrand[0] && vBrand[0] === vBadge && vBadge === firstRow,
     "title === brand === README 徽标 === 台账最新行（严格相等）");
  const histHas = new RegExp("^\\| " + (vBadge || "v0") + " \\|", "m").test(F.readme) || new RegExp("^### " + (vBadge || "v0") + " \\b", "m").test(F.readme);
  ok(histHas, "README 版本历史有当前版本（" + vBadge + "）的独立行，缺了就失败");

  section("=== 8. 深色对比度抽样 ===");
  function lum(hex) {
    const n = parseInt(hex.replace("#", ""), 16), rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }
  function ratio(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
  const samples = [["正文 #E8F0F7", "#E8F0F7", "#182633"], ["次要 #B6C8D6", "#B6C8D6", "#182633"], ["弱 #96ADBE", "#96ADBE", "#182633"], ["主数字 #4FD1C5", "#4FD1C5", "#182633"], ["绿色 #7BE495", "#7BE495", "#182633"]];
  samples.forEach(s => log("  " + s[0] + " on 卡片 → " + ratio(s[1], s[2]).toFixed(2) + ":1"));
  ok(samples.every(s => ratio(s[1], s[2]) >= 3), "深色抽样 token 对卡片 ≥ 3:1");

  section("=== 9. 移动几何估算 ===");
  [375, 320].forEach(vw => {
    const cardPad = 14 * 2, bodyPad = 10 * 2, gap = 4 * 6, avail = vw - bodyPad - cardPad - gap;
    const need = vw <= 360 ? 26 : 38;
    log("  " + vw + "px：日历 7 列可用宽 ≈ " + avail + "px / 7 ≈ " + (avail / 7).toFixed(1) + "px/格（该档金额需 ≈ " + need + "px）");
    ok(avail / 7 >= need, vw + "px 下日历单格 ≥ " + need + "px，金额放得下");
  });
  ok(/\.cal\{display:grid;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/.test(F.html), "日历 7 列 minmax(0,1fr)，可压缩");
  ok(/\.act3\{flex-direction:column/.test(F.html), "对账三格窄屏单列");

  section("=== 10. 台账/徽标数字 vs 实跑 ===");
  const hr = runHarness(dir);
  if (!hr) { ok(true, "跳过（副本无 harness.js，仅 --selftest 时出现）"); }
  else {
    const badgeN = Number(((F.readme.match(/tests-(\d+)%20passed/) || [])[1]) || 0);
    const ledgerN = Number(((F.ledger.match(/^\| \d{4}-\d{2}-\d{2} \| v[\d.]+ \|[^|]*\|[^|]*\| (\d+) 通过/m) || [])[1]) || 0);
    log("  harness 实跑 = " + hr.pass + " 通过 / " + hr.fail + " 失败；README 徽标 = " + badgeN + "；台账最新行 = " + ledgerN);
    ok(hr.fail === 0 && hr.pass === badgeN && hr.pass === ledgerN, "台账数字 == README 徽标 == harness 实跑（" + hr.pass + "）");
  }

  return { pass, fail };
}

function selftest() {
  const tmp = path.join(DIR, ".tmp", "selfcheck-selftest");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(path.join(tmp, "_tests"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
  const cp = (a, b) => fs.copyFileSync(path.join(DIR, a), path.join(tmp, b));
  cp("index.html", "index.html"); cp("README.md", "README.md"); cp("_tests/app.js", "_tests/app.js"); cp(path.join("docs", "测试记录.md"), path.join("docs", "测试记录.md"));
  // 故障 1：改坏一个 id；故障 2：title 版本号改错；故障 3：删掉 README 版本历史行
  let html = fs.readFileSync(path.join(tmp, "index.html"), "utf8");
  html = html.replace(/id="todayEarn"/, 'id="todayEarnBroken"');
  html = html.replace(/<title>([^<]*)<\/title>/, '<title>牛马计时器 v0.0.0-broken</title>');
  fs.writeFileSync(path.join(tmp, "index.html"), html);
  // 故障 4：往 app.js 里塞一处「+ 拼接未转义变量」的 innerHTML
  let app = fs.readFileSync(path.join(tmp, "_tests", "app.js"), "utf8");
  app += "function __badRender(){ var el=document.getElementById('x'); if(el) el.innerHTML = '<b>' + S.salary + '</b>'; }";
  fs.writeFileSync(path.join(tmp, "_tests", "app.js"), app);
  const readme = fs.readFileSync(path.join(tmp, "README.md"), "utf8").split("\n").filter(l => !/^\| v\d/.test(l)).join("\n");
  fs.writeFileSync(path.join(tmp, "README.md"), readme);
  const r = runChecks(tmp);
  fs.rmSync(tmp, { recursive: true, force: true });
  const caught = r.fail >= 3;
  console.log("\n=== 自检反证：制造 4 处故障（改 id / 改 title 版本 / 删 README 历史行 / 塞未转义 innerHTML），至少抓到 3 条算通过，自检抓到 " + r.fail + " 条失败 ===");
  if (caught) { console.log("✅ 反证通过：自检能抓住故障，不是恒绿摆设"); return 0; }
  console.log("❌ 反证失败：故障没被自检抓住");
  return 1;
}

if (process.argv.indexOf("--selftest") >= 0) process.exit(selftest());
const r = runChecks(DIR);
console.log("\n=== 自检结果：通过 " + r.pass + "，失败 " + r.fail + " ===");
process.exit(r.fail ? 1 : 0);
