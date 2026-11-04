# -*- coding: utf-8 -*-
import io

p = '_tests/app.v8.js'
s = io.open(p, encoding='utf-8').read()


def replace_func(src, name, new):
    key = 'function ' + name + '('
    i = src.index(key)
    b = src.index('{', i)
    depth = 0
    j = b
    while True:
        ch = src[j]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                break
        j += 1
    return src[:i] + new + src[j + 1:]


helpers = '''  function attrLabel(x){
    if(x.key==="sick") return "病假 "+x.n+" 天，按 60% 计（相对满勤）";
    if(x.key==="off") return "休息 "+x.n+" 天，不计钱";
    if(x.key==="paid") return "带薪假 "+x.n+" 天，按 100% 计";
    if(x.key==="half") return "半天班 "+x.n+" 天，按 50% 计";
    if(x.key==="p80") return "出勤 80% "+x.n+" 天";
    return "加班 "+x.n+" 天（1.5/2/3 倍）";
  }
  // v28.02：快照 → 归因对象（重开旧账时不再调用 actualAttribution，避免月薪/作息变化改写历史说法）
  function snapshotToAttr(rec){
    var all=(rec.impactSnapshot||[]).map(function(x){ return {key:x.type, n:x.days, impact:x.impact}; });
    all.sort(function(a,b){ return Math.abs(b.impact)-Math.abs(a.impact); });
    return {all:all, list:all.slice(0,3), workdays:rec.paidDaysSnapshot||0, snap:true};
  }
  // 写入时把渲染所需中间量一起固化（basis / 日薪 / 满勤工作日数 / 各类影响）
  function attributionSnapshot(now){
    var at=actualAttribution(now), fe=fullEstimate(now);
    return {
      impactSnapshot:at.all.map(function(x){ return {type:x.key, days:x.n, impact:+x.impact.toFixed(2)}; }),
      basis:"full-attendance",
      dailyPaySnapshot:+fe.pay.toFixed(2),
      paidDaysSnapshot:fe.workdays
    };
  }
'''
s = s.replace('  function saveActualFromForm(){', helpers + '  function saveActualFromForm(){', 1)

s = s.replace('''    rec.note=getVal("actNote","");
    rec.at=now;''','''    rec.note=getVal("actNote","");
    rec.at=now;
    // v28.02：写入时快照化——归因结果、基准、日薪、满勤工作日数全部固化，重开只读快照
    var snap=(prev&&Array.isArray(prev.impactSnapshot))?prev:attributionSnapshot(now);
    rec.impactSnapshot=snap.impactSnapshot;
    rec.basis=snap.basis||"full-attendance";
    rec.dailyPaySnapshot=snap.dailyPaySnapshot;
    rec.paidDaysSnapshot=snap.paidDaysSnapshot;''')

result = '''function showActualResult(rec){
    var now=Date.now(), ded=deductionsTotal(rec);
    var legacy=!(rec&&rec.basis==="full-attendance"&&Array.isArray(rec.impactSnapshot));
    // v28.02：有快照就只读快照，绝不重算；老数据（v28.01 之前）降级为按当前口径算并明确标注
    var at=legacy?actualAttribution(now):snapshotToAttr(rec);
    var payShown=legacy?dayPayNow():(rec.dailyPaySnapshot||dayPayNow());
    var sumImp=0;
    at.all.forEach(function(x){ sumImp+=x.impact; });
    var expectedNet=rec.estimate-ded;
    var baseDiff=ded>0?(rec.actual-expectedNet):rec.diff;
    var residual=baseDiff-sumImp;
    var html=at.all.slice(0,3).map(function(x){
      return '<div class="act-arow">'+esc(attrLabel(x))+' <b>'+(x.impact===0?"¥0.00":signedMoney(x.impact))+'</b></div>';
    }).join("");
    html+='<div class="act-arow act-conv">差额基准：满勤应得 '+money(rec.estimate)+'（当月 '+at.workdays+' 个工作日 × 日薪 '+money(payShown)+'）；病假/休息/加班是相对满勤的增减。</div>';
    if(legacy) html+='<div class="act-arow act-conv">旧数据无快照，按当前口径重算（改过月薪/作息的话，数字可能与当初不同）。</div>';
    if(ded>0) html+='<div class="act-arow act-conv">已填社保/公积金/个税共 '+money(ded)+'，扣后应约 '+money(expectedNet)+'；与实发相差 '+signedMoney(rec.actual-expectedNet)+'。</div>';
    var attr=document.getElementById("resAttr"); if(attr) attr.innerHTML=html;

    var warn=document.getElementById("actWarn"), warnTxt="";
    if(rec.estimate>0&&rec.actual>rec.estimate*3){
      warnTxt="实发 "+money(rec.actual)+" 是满勤应得（"+money(rec.estimate)+"）的 "+Math.round(rec.actual/rec.estimate)+" 倍，偏差 "+Number(rec.diffPct).toFixed(0)+"%。可能多打了一位，建议先核对，确认无误再保存。";
    } else if(rec.estimate>0&&rec.actual>0&&rec.actual<rec.estimate*0.3){
      warnTxt="实发 "+money(rec.actual)+" 不到满勤应得（"+money(rec.estimate)+"）的三成，偏差 "+Number(rec.diffPct).toFixed(0)+"%。如果只发了半个月或一部分，可以在备注里写明。";
    }
    if(warn){ warn.textContent=warnTxt; warn.style.display=warnTxt?"block":"none"; }

    var se=document.getElementById("resEstimate"); if(se) se.textContent=money(rec.estimate);
    var sa=document.getElementById("resActual"); if(sa) sa.textContent=money(rec.actual);
    var sd=document.getElementById("resDiff");
    if(sd){ sd.textContent=signedMoney(rec.diff); sd.style.color=(rec.diff<0?"#c0392b":"#22a06b"); }
    var sc=document.getElementById("resConcl"); if(sc) sc.textContent=actualConclusion(rec,at,baseDiff,residual,ded);
    setActView("actResultView");
    var m=document.getElementById("actualModal"); if(m&&m.classList) m.classList.add("show");
  }'''
s = replace_func(s, 'showActualResult', result)

hist = '''function showActualHistory(){
    var arr=ACTUALS.slice().sort(function(a,b){ return (b.at||0)-(a.at||0); }).slice(0,6);
    var html=arr.map(function(r){
      var dcls=r.diff<0?"#c0392b":"#22a06b", d=new Date(r.at||0);
      return '<div class="act-hrow" data-hk="'+esc(r.periodKey||"")+'" title="点开看这期的对账结果"><span class="act-hk">'+esc(r.periodKey||"")+'</span>'+
        '<span class="act-hv">'+money(r.estimate)+' → '+money(r.actual)+'</span>'+
        '<b style="color:'+dcls+'">'+signedMoney(r.diff)+'</b>'+
        '<span class="act-hp">'+((r.diffPct>=0)?"+":"")+Number(r.diffPct).toFixed(1)+'%</span>'+
        '<span class="act-hd">'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'</span></div>';
    }).join("")||'<p class="gsub">还没有对账记录。</p>';
    var box=document.getElementById("histActBody");
    if(box){
      box.innerHTML=html;
      box.addEventListener("click",function(e){
        var t=e.target; if(!t||!t.closest) return;
        var row=t.closest("[data-hk]"); if(!row) return;
        var key=row.getAttribute("data-hk"), rec=findActual(key);
        if(rec) showActualResult(rec);
      });
    }
    var mean=0;
    if(arr.length){ var sum=0; arr.forEach(function(r){ sum+=Math.abs(Number(r.diffPct)||0); }); mean=sum/arr.length; }
    var sm=document.getElementById("histActSum");
    if(sm) sm.textContent=arr.length?("最近 "+arr.length+" 次 · 平均绝对偏差 "+mean.toFixed(1)+"%"):"";
    setActView("actHistView");
    var m=document.getElementById("actualModal"); if(m&&m.classList) m.classList.add("show");
  }'''
s = replace_func(s, 'showActualHistory', hist)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('app v28.02 patched', len(s))
