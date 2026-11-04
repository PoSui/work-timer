# -*- coding: utf-8 -*-
import io, json, re

# ---------- app.v8.js: history rows clickable by id ----------
p = '_tests/app.v8.js'
s = io.open(p, encoding='utf-8').read()

old_map = '''    var html=arr.map(function(r){
      var dcls=r.diff<0?"#c0392b":"#22a06b", d=new Date(r.at||0);
      return '<div class="act-hrow" data-hk="'+esc(r.periodKey||"")+'" title="点开看这期的对账结果"><span class="act-hk">'+esc(r.periodKey||"")+'</span>'+
        '<span class="act-hv">'+money(r.estimate)+' → '+money(r.actual)+'</span>'+
        '<b style="color:'+dcls+'">'+signedMoney(r.diff)+'</b>'+
        '<span class="act-hp">'+((r.diffPct>=0)?"+":"")+Number(r.diffPct).toFixed(1)+'%</span>'+
        '<span class="act-hd">'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'</span></div>';
    }).join("")||'''
new_map = '''    var html=arr.map(function(r,i){
      var dcls=r.diff<0?"#c0392b":"#22a06b", d=new Date(r.at||0);
      return '<div class="act-hrow" id="histRow'+i+'" title="点开看这期的对账结果"><span class="act-hk">'+esc(r.periodKey||"")+'</span>'+
        '<span class="act-hv">'+money(r.estimate)+' → '+money(r.actual)+'</span>'+
        '<b style="color:'+dcls+'">'+signedMoney(r.diff)+'</b>'+
        '<span class="act-hp">'+((r.diffPct>=0)?"+":"")+Number(r.diffPct).toFixed(1)+'%</span>'+
        '<span class="act-hd">'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'</span></div>';
    }).join("")||'''
assert old_map in s
s = s.replace(old_map, new_map, 1)

old_box = '''    var box=document.getElementById("histActBody");
    if(box){
      box.innerHTML=html;
      box.addEventListener("click",function(e){
        var t=e.target; if(!t||!t.closest) return;
        var row=t.closest("[data-hk]"); if(!row) return;
        var key=row.getAttribute("data-hk"), rec=findActual(key);
        if(rec) showActualResult(rec);
      });
    }'''
new_box = '''    var box=document.getElementById("histActBody");
    if(box){
      box.innerHTML=html;
      // 每行单独绑，点开看当期结果（v28.02 起结果只读快照，不再重算）
      arr.forEach(function(r,i){
        var row=document.getElementById("histRow"+i);
        if(row) row.addEventListener("click",function(){ showActualResult(r); });
      });
    }'''
assert old_box in s
s = s.replace(old_box, new_box, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('app patched', len(s))

# ---------- ids.json ----------
ids_p = '_tests/ids.json'
ids = json.load(io.open(ids_p, encoding='utf-8'))
for i in range(6):
    name = 'histRow%d' % i
    if name not in ids:
        ids.append(name)
ids = sorted(set(ids))
io.open(ids_p, 'w', encoding='utf-8', newline='').write(json.dumps(ids, ensure_ascii=False, indent=2) + '\n')
print('ids', len(ids))

# ---------- index.html version ----------
hp = 'index.html'
h = io.open(hp, encoding='utf-8').read()
h = h.replace('<title>牛马计时器 v28.01</title>', '<title>牛马计时器 v28.02</title>', 1)
h = h.replace('class="brand">牛马计时器 · v28.01', 'class="brand">牛马计时器 · v28.02', 1)
io.open(hp, 'w', encoding='utf-8', newline='').write(h)
print('html version bumped')

# ---------- README ----------
rp = 'README.md'
r = io.open(rp, encoding='utf-8').read()
r = r.replace('version-v28.01-blue', 'version-v28.02-blue', 1)
row = '| v28.02 | 对账归因快照化：保存时把归因明细（`impactSnapshot`）、满勤基准、日薪、满勤工作日数写进记录；重开旧账只读快照渲染，改月薪不再改写历史说法；无快照的老数据降级为按当前口径重算并明确标注 |\n'
if '| v28.02 |' not in r:
    r = r.replace('| v28.01 |', row + '| v28.01 |', 1)
io.open(rp, 'w', encoding='utf-8', newline='').write(r)
print('readme bumped')
