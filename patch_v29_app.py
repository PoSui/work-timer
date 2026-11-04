# -*- coding: utf-8 -*-
import io

PATH = '_tests/app.v8.js'
s = io.open(PATH, encoding='utf-8').read()

# 1) keys
old = 'var LS_SET="niuma.settings.v8", LS_REC="niuma.records.v8", LS_GOALS="niuma.goals.v15", LS_ACT="niuma.actuals.v1";'
assert old in s
s = s.replace(old, 'var LS_SET="niuma.settings.v8", LS_REC="niuma.records.v8", LS_GOALS="niuma.goals.v15", LS_ACT="niuma.actuals.v1", LS_PHASES="niuma.phases.v1";', 1)

# 2) loader after actuals loader
old = '''  function saveActuals(){ try{ localStorage.setItem(LS_ACT,JSON.stringify(ACTUALS)); }catch(e){} touchStore(); }'''
assert old in s
s = s.replace(old, old + '''
  function loadPhases(){ try{ var a=JSON.parse(localStorage.getItem(LS_PHASES)||"[]"); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
  function savePhases(){ try{ localStorage.setItem(LS_PHASES,JSON.stringify(PHASES)); }catch(e){} touchStore(); }''', 1)

# 3) PHASES var
old = '  var ACTUALS=loadActuals();'
assert old in s
s = s.replace(old, old + '\n  var PHASES=loadPhases();', 1)

# 4) IDB snapshot / hydrate / boot write-back
old = "    function snapshot(){ return {at:Date.now(),settings:S,records:R,goals:GOALS,meta:META,actuals:ACTUALS}; }"
assert old in s
s = s.replace(old, "    function snapshot(){ return {at:Date.now(),settings:S,records:R,goals:GOALS,meta:META,actuals:ACTUALS,phases:PHASES}; }", 1)

old = "        ACTUALS=Array.isArray(snap.actuals)?snap.actuals:[];"
assert old in s
s = s.replace(old, old + '\n        PHASES=Array.isArray(snap.phases)?snap.phases:[];', 1)

old = "            localStorage.setItem(LS_ACT,JSON.stringify(ACTUALS));"
assert old in s
s = s.replace(old, old + '\n            localStorage.setItem(LS_PHASES,JSON.stringify(PHASES));', 1)

# 5) v29 block before render section
anchor = '  /* ============ 渲染 ============ */'
assert anchor in s
block = '''  /* ============ v29 时薪轨迹 ============ */
  function monthKeyOf(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1); }
  function monthIdx(mk){ var a=String(mk||"").split("-"); return (+a[0]||0)*12+((+a[1]||1)-1); }
  function hourlyOfPhase(p){ var h=+p.hours||8, d=+p.days||21.75, sal=+p.salary||0; return (h>0&&d>0)?(sal/d/h):0; }
  function phaseText(p){ return String(p.from||"")+" · 月薪 "+money(p.salary||0)+" / "+p.days+" 天 / "+p.hours+" 小时"; }
  // 首次使用生成第一段；之后只由「设置保存」触发追加/覆盖，历史段不回头改
  function ensurePhase(now){
    if(PHASES.length) return false;
    if(!(monthlyPay()>0)||!(paidHours()>0)) return false;
    PHASES.push({ from:monthKeyOf(new Date(now||Date.now())), salary:S.salary, days:S.days, hours:S.hours, note:"" });
    savePhases(); return true;
  }
  function syncPhase(now){
    if(!(monthlyPay()>0)) return;
    var mk=monthKeyOf(new Date(now||Date.now()));
    var last=PHASES[PHASES.length-1];
    if(last && last.from===mk){
      if(+last.salary===+S.salary && +last.days===+S.days && +last.hours===+S.hours) return;
      last.salary=S.salary; last.days=S.days; last.hours=S.hours; savePhases(); return;
    }
    PHASES.push({ from:mk, salary:S.salary, days:S.days, hours:S.hours, note:"" });
    savePhases();
  }
  // 三句人话：涨跌幅 / 同样 8 小时 / 涨幅 <5% 必须说「基本没动」
  function phaseSentences(){
    if(!PHASES.length) return [];
    var fs=PHASES[0], ls=PHASES[PHASES.length-1], a=hourlyOfPhase(fs), b=hourlyOfPhase(ls);
    var out=[];
    var mv=monthIdx(ls.from)-monthIdx(fs.from);
    if(!(a>0&&b>0)) return ["时薪数据还没填全，先在下面的阶段里补上限月薪即可。"];
    var pct=(b-a)/a*100, apct=Math.round(Math.abs(pct));
    if(mv<=0){ out.push("目前只有一段记录：从 "+fs.from+" 起，时薪 "+money(a)+"。"); }
    else if(Math.abs(pct)<5){ out.push("这 "+mv+" 个月时薪基本没动（"+money(a)+" → "+money(b)+"，"+apct+"%）。"); }
    else if(pct<0){ out.push("从 "+fs.from+" 到 "+ls.from+"，时薪降了 "+apct+"%（"+money(a)+" → "+money(b)+"）。"); }
    else { out.push("从 "+fs.from+" 到 "+ls.from+"，时薪涨了 "+apct+"%（"+money(a)+" → "+money(b)+"）。"); }
    out.push("同样 8 小时："+fs.from+" 时值 "+money(a*8)+"，现在值 "+money(b*8)+"。");
    return out;
  }
  function phaseChartSvg(){
    var n=PHASES.length, W=300, H=118, minH=1e9, maxH=-1e9, hs=[];
    PHASES.forEach(function(p){ var h=hourlyOfPhase(p); hs.push(h); if(h<minH)minH=h; if(h>maxH)maxH=h; });
    if(n===0) return "";
    var padL=14, padR=52, x0=padL, x1=W-padR, y0=14, y1=H-24, span=(maxH-minH)||1;
    function X(i){ return n===1?((x0+x1)/2):(x0+(x1-x0)*i/(n-1)); }
    function Y(h){ return y1-(h-minH)/span*(y1-y0); }
    var pts=hs.map(function(h,i){ return X(i).toFixed(1)+","+Y(h).toFixed(1); }).join(" ");
    var g='<svg class="ph-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="时薪轨迹折线图" preserveAspectRatio="none">';
    g+='<polyline class="ph-line" points="'+pts+'" fill="none" stroke-width="2"/>';
    hs.forEach(function(h,i){
      g+='<circle class="ph-dot" cx="'+X(i).toFixed(1)+'" cy="'+Y(h).toFixed(1)+'" r="3"></circle>';
      if(i===0||i===n-1||n<=4){
        g+='<text class="ph-lab" x="'+X(i).toFixed(1)+'" y="'+(Y(h)-7).toFixed(1)+'" text-anchor="middle">'+money(h)+'</text>';
      }
    });
    g+='</svg>';
    return g;
  }
  function renderPhase(now){
    var card=document.getElementById("phaseCard"); if(!card) return;
    if(!PHASES.length && !(monthlyPay()>0)){ card.style.display="none"; return; }
    card.style.display="";
    var box=document.getElementById("phaseBody"); if(!box) return;
    var html=phaseChartSvg();
    phaseSentences().forEach(function(t){ html+='<div class="ph-sent">'+esc(t)+'</div>'; });
    html+='<div class="ph-list">';
    PHASES.forEach(function(p,i){
      html+='<div class="ph-row">'+
        '<input class="ph-in ph-m" id="phMonth'+i+'" value="'+esc(p.from||"")+'" placeholder="2026-01" aria-label="阶段起始月">'+
        '<input class="ph-in ph-s" id="phSalary'+i+'" type="number" min="0" step="100" value="'+(+p.salary||0)+'" aria-label="该阶段月薪">'+
        '<input class="ph-in ph-n" id="phNote'+i+'" value="'+esc(p.note||"")+'" placeholder="备注（公司/转正）" aria-label="阶段备注">'+
        '<button type="button" class="mini-btn" id="btnPhDel'+i+'" aria-label="删除该阶段">删</button></div>';
    });
    html+='</div><div class="rowflex"><button type="button" class="mini-btn" id="btnPhaseAdd">+ 添加一段</button>'+
      '<span class="gsub">改完自动重算，历史段不会被现在的设置改写</span></div>';
    box.innerHTML=html;
    PHASES.forEach(function(p,i){
      ["phMonth","phSalary","phNote"].forEach(function(pre){
        var el=document.getElementById(pre+i);
        if(el) el.addEventListener("change",function(){
          var arr=JSON.parse(JSON.stringify(PHASES)), q=arr[i];
          q.from=String((document.getElementById("phMonth"+i)||{}).value||q.from).trim();
          q.salary=parseFloat((document.getElementById("phSalary"+i)||{}).value)||0;
          q.note=String((document.getElementById("phNote"+i)||{}).value||"");
          q.days=+q.days||21.75; q.hours=+q.hours||8;
          PHASES=arr; savePhases(); renderPhase(now);
        });
      });
      var del=document.getElementById("btnPhDel"+i);
      if(del) del.addEventListener("click",function(){
        if(PHASES.length<=1) return;
        var arr=JSON.parse(JSON.stringify(PHASES)); arr.splice(i,1);
        PHASES=arr; savePhases(); renderPhase(now);
      });
    });
    var add=document.getElementById("btnPhaseAdd");
    if(add) add.addEventListener("click",function(){
      PHASES.push({ from:monthKeyOf(new Date()), salary:S.salary||PHASES[PHASES.length-1].salary, days:S.days, hours:S.hours, note:"" });
      savePhases(); renderPhase(now);
    });
  }

'''
s = s.replace(anchor, block + anchor, 1)

# 6) render() call renderPhase
old = '    renderActual(now);'
assert old in s
s = s.replace(old, old + '\n    renderPhase(now);', 1)

# 7) settings save hooks: btnSave and mSave
old = '''  document.getElementById("btnSave").addEventListener("click",function(){
    readForm(); saveSettings(); document.getElementById("box").open=false;
    setErr("");
    render(); renderTables(); renderCalendar(); startFast(); updateFormula();
  });'''
assert old in s
s = s.replace(old, '''  document.getElementById("btnSave").addEventListener("click",function(){
    readForm(); saveSettings(); syncPhase(); document.getElementById("box").open=false;
    setErr("");
    render(); renderTables(); renderCalendar(); startFast(); updateFormula();
  });''', 1)

old = '''    S.hours=paidHours(); saveSettings();
    setErr("");'''
assert old in s
s = s.replace(old, '''    S.hours=paidHours(); saveSettings(); syncPhase();
    setErr("");''', 1)

# 7b) mSave should also renderPhase (card may appear first time)
old = '''    document.getElementById("setupModal").classList.remove("show");
    fillForm(); render(); renderTables(); renderCalendar();
  });'''
assert old in s
s = s.replace(old, '''    document.getElementById("setupModal").classList.remove("show");
    ensurePhase(); fillForm(); render(); renderTables(); renderCalendar();
  });''', 1)

# 8) boot: ensurePhase before render
old = '  finalizeStale();\n  loadMeta(); fillForm(); render(); renderTables(); renderCalendar(); startUi();'
assert old in s
s = s.replace(old, '  finalizeStale();\n  loadMeta(); fillForm(); ensurePhase(); render(); renderTables(); renderCalendar(); startUi();', 1)

io.open(PATH, 'w', encoding='utf-8', newline='').write(s)
print('app v29 patched', len(s))
