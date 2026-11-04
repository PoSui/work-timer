# -*- coding: utf-8 -*-
import io

p = '_tests/harness.js'
s = io.open(p, encoding='utf-8').read()

old = '''ok(vTitle === "牛马计时器 v28.01", "title 是 v28.01（实际：" + vTitle + "）");
ok(vBrand === "牛马计时器 · v28.01", "brand 是 v28.01（实际：" + vBrand + "）");
ok(/^\\| v27 \\|/m.test(readmeSrc), "README 版本历史有 v27 行");
ok(/^\\| v28 \\|/m.test(readmeSrc), "README 版本历史有 v28 行");
ok(/^\\| v28\\.01 \\|/m.test(readmeSrc), "README 版本历史有 v28.01 行");'''
assert old in s, 'test 49 block not found'
new = '''ok(vTitle === "牛马计时器 v28.02", "title 是 v28.02（实际：" + vTitle + "）");
ok(vBrand === "牛马计时器 · v28.02", "brand 是 v28.02（实际：" + vBrand + "）");
ok(/^\\| v27 \\|/m.test(readmeSrc), "README 版本历史有 v27 行");
ok(/^\\| v28 \\|/m.test(readmeSrc), "README 版本历史有 v28 行");
ok(/^\\| v28\\.01 \\|/m.test(readmeSrc), "README 版本历史有 v28.01 行");
ok(/^\\| v28\\.02 \\|/m.test(readmeSrc), "README 版本历史有 v28.02 行");'''
s = s.replace(old, new, 1)

g59 = '''
/* ===== v28.02 对账归因快照化 ===== */
console.log("\\n=== 59. 对账归因快照化（改月薪不改旧账说法）===");
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

'''

tail = 'console.log("");\nconsole.log("=== 结果：通过 " + pass + "，失败 " + fail + " ===");'
assert tail in s
s = s.replace(tail, g59 + tail, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('harness patched', len(s))
