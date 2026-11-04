# -*- coding: utf-8 -*-
import io, json

# ---------- index.html: card + css + version ----------
hp = 'index.html'
h = io.open(hp, encoding='utf-8').read()

card = '''  <div class="card" id="phaseCard" style="display:none">
    <details>
      <summary><span class="ph-t">我的时间值多少 · 时薪轨迹</span><span class="tag">折叠</span></summary>
      <div id="phaseBody"></div>
    </details>
  </div>

'''
anchor = '  <div class="card" id="histCard">'
assert anchor in h and 'id="phaseCard"' not in h
h = h.replace(anchor, card + anchor, 1)

css = '''  /* v29 时薪轨迹 */
  #phaseCard summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center}
  #phaseCard summary::-webkit-details-marker{display:none}
  .ph-t{font-weight:700}
  .ph-svg{width:100%;height:118px;display:block;margin:8px 0 2px}
  .ph-line{stroke:#22a06b}
  .ph-dot{fill:#22a06b}
  .ph-lab{font-size:9px;fill:#5b7285}
  .ph-sent{font-size:13px;color:#33475b;line-height:1.7}
  .ph-list{margin:8px 0 4px}
  .ph-row{display:flex;gap:6px;margin:6px 0;align-items:center}
  .ph-in{border:1px solid #dbe6ef;border-radius:8px;padding:5px 7px;font-size:12px;background:#fff;color:#1d2b36}
  .ph-m{width:88px}
  .ph-s{width:100px}
  .ph-n{flex:1;min-width:0}
'''
assert '</style>' in h
h = h.replace('</style>', css + '</style>', 1)

h = h.replace('<title>牛马计时器 v28.02</title>', '<title>牛马计时器 v29</title>', 1)
h = h.replace('class="brand">牛马计时器 · v28.02', 'class="brand">牛马计时器 · v29', 1)
io.open(hp, 'w', encoding='utf-8', newline='').write(h)
print('html patched')

# ---------- ids.json ----------
p = '_tests/ids.json'
ids = json.load(io.open(p, encoding='utf-8'))
add = ['phaseCard', 'phaseBody', 'btnPhaseAdd']
for i in range(6):
    add += ['phMonth%d' % i, 'phSalary%d' % i, 'phNote%d' % i, 'btnPhDel%d' % i]
for a in add:
    if a not in ids:
        ids.append(a)
ids = sorted(set(ids))
io.open(p, 'w', encoding='utf-8', newline='').write(json.dumps(ids, ensure_ascii=False, indent=2) + '\n')
print('ids', len(ids))

# ---------- README ----------
r = io.open('README.md', encoding='utf-8').read()
r = r.replace('version-v28.02-blue', 'version-v29-blue', 1)
row = '| v29 | 长期视角：时薪轨迹卡片（折叠不打扰）——按「薪资阶段」记录时薪变化，CSS/SVG 折线 + 三句人话（涨跌幅、同样 8 小时换算、涨幅 <5% 必须说「基本没动」）；阶段可编辑，改月薪自动追加/同月覆盖，历史段不会被现在的设置改写 |\n'
if '| v29 |' not in r:
    r = r.replace('| v28.02 |', row + '| v28.02 |', 1)
io.open('README.md', 'w', encoding='utf-8', newline='').write(r)
print('readme v29')

# ---------- test 49 in harness ----------
pp = '_tests/harness.js'
s = io.open(pp, encoding='utf-8').read()
s = s.replace('ok(vTitle === "牛马计时器 v28.02", "title 是 v28.02（实际：" + vTitle + "）");',
              'ok(vTitle === "牛马计时器 v29", "title 是 v29（实际：" + vTitle + "）");', 1)
s = s.replace('ok(vBrand === "牛马计时器 · v28.02", "brand 是 v28.02（实际：" + vBrand + "）");',
              'ok(vBrand === "牛马计时器 · v29", "brand 是 v29（实际：" + vBrand + "）");', 1)
s = s.replace('ok(/^\\| v28\\.02 \\|/m.test(readmeSrc), "README 版本历史有 v28.02 行");',
              'ok(/^\\| v28\\.02 \\|/m.test(readmeSrc), "README 版本历史有 v28.02 行");\nok(/^\\| v29 \\|/m.test(readmeSrc), "README 版本历史有 v29 行");', 1)
io.open(pp, 'w', encoding='utf-8', newline='').write(s)
print('harness test49 v29')
