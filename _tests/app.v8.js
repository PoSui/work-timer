(function(){
  "use strict";

  /* ============ 常量与存储 ============ */
  var LS_SET="niuma.settings.v8", LS_REC="niuma.records.v8", LS_GOALS="niuma.goals.v15", LS_ACT="niuma.actuals.v1", LS_PHASES="niuma.phases.v1";
  var DEFAULT={salary:0,days:21.75,hours:8,payDay:15,restMode:"double",goalName:"买车首付",goalAmount:80000,goalBase:0,goalFrom:"",
    workStart:"09:00",workEnd:"18:00",breakStart:"12:00",breakEnd:"13:00",mul:1,freq:100,remind:true,mode:"month",months:12,theme:"light"};

  function loadActuals(){ try{ var a=JSON.parse(localStorage.getItem(LS_ACT)||"[]"); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
  function saveActuals(){ try{ localStorage.setItem(LS_ACT,JSON.stringify(ACTUALS)); }catch(e){} touchStore(); }
  function loadPhases(){ try{ var a=JSON.parse(localStorage.getItem(LS_PHASES)||"[]"); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
  function savePhases(){ try{ localStorage.setItem(LS_PHASES,JSON.stringify(PHASES)); }catch(e){} touchStore(); }

  var S=loadSettings(), R=loadRecords();
  var GOALS=loadGoals();
  var ACTUALS=loadActuals();
  var PHASES=loadPhases();
  var curDay=todayKey(), fastTimer=null, uiTimer=null;

  function pad(n){return n<10?"0"+n:""+n;}
  function dateKey(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
  function todayKey(){return dateKey(new Date());}
  function monthKey(d){var x=(d instanceof Date)?d:(d?new Date(d):new Date());return x.getFullYear()+"-"+pad(x.getMonth()+1);}
  function hm2min(s){var p=(s||"00:00").split(":");return (+p[0]||0)*60+(+p[1]||0);}
  function atTime(base,hm){var m=hm2min(hm),d=new Date(base.getTime());d.setHours(Math.floor(m/60),m%60,0,0);return d;}
  function dateOfKey(k){var p=k.split("-");return new Date(+p[0],+p[1]-1,+p[2]);}
  function moneyHTML(v){var s=(Math.max(0,v)).toFixed(2),p=s.split(".");
    p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,",");return "¥"+p[0]+"<span class='dec'>."+p[1]+"</span>";}
  function money4(v){ return "¥"+Number(v||0).toFixed(4); }
  function money(v){return "¥"+(Math.max(0,v)).toFixed(2);}
  function esc(t){ return String(t==null?"":t).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
  function hms(ms){if(ms<=0)return "0h00m";var m=Math.floor(ms/60000),h=Math.floor(m/60);return h+"h"+pad(m%60)+"m";}
  function clock(ms){if(ms<=0)return "00:00:00";
    var h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000);
    return pad(h)+":"+pad(m)+":"+pad(s);}
  function overlap(a1,a2,b1,b2){var s=Math.max(a1,b1),e=Math.min(a2,b2);return e>s?e-s:0;}

  function loadSettings(){try{var raw=localStorage.getItem(LS_SET);
    if(!raw)return Object.assign({},DEFAULT);return Object.assign({},DEFAULT,JSON.parse(raw));}
    catch(e){return Object.assign({},DEFAULT);}}
  function saveSettings(){try{localStorage.setItem(LS_SET,JSON.stringify(S));}catch(e){} touchStore();}
  function loadRecords(){try{return JSON.parse(localStorage.getItem(LS_REC)||"{}");}catch(e){return {};}}
  function saveRecords(){try{localStorage.setItem(LS_REC,JSON.stringify(R));}catch(e){} touchStore();}
  function touchStore(){ try{ if(IDB && IDB.putSoon) IDB.putSoon(); }catch(e){} }

  /* ============ 计算口径 ============ */
  function paidHours(){
    var s=hm2min(S.workStart), e=hm2min(S.workEnd), bs=hm2min(S.breakStart), be=hm2min(S.breakEnd);
    if(e<=s) e+=1440;            // 跨夜班：22:00→06:00
    if(be<=bs) be+=1440;         // 跨夜的午休/夜宵
    var m=e-s; if(be>bs) m-=(be-bs);
    if(m<=0) m=30;
    return Math.round(m/60*100)/100;
  }
  // 月薪口径（各模式统一折算到月）
  function monthlyPay(){
    var dd=(S.days>0?S.days:21.75), hh=paidHours()>0?paidHours():8, v=S.salary||0;
    if(S.mode==="day") return v*dd;
    if(S.mode==="hour") return v*dd*hh;
    if(S.mode==="year") return v/((S.months||12)||12);
    return v;
  }
  function modeLabel(){
    return S.mode==="day"?"日薪":S.mode==="hour"?"时薪":S.mode==="year"?"年薪":(S.months&&S.months!==12?"年薪 "+(S.months)+" 薪":"月薪");
  }
  function hourly(){var dd=(S.days>0?S.days:21.75), hh=paidHours()>0?paidHours():8;return monthlyPay()/(dd*hh);}
  function dailyPay(){return hourly()*paidHours();}
  function mul(){return S.mul||1;}
  function todayRate(){return hourly()*mul();}
  function dailyMs(){return paidHours()*3600000;}

  function recOf(k){return R[k];}
  function todayRec(){return R[todayKey()];}
  function started(){var r=todayRec();return !!(r&&r.startMs&&!r.endMs);}
  function ended(){var r=todayRec();return !!(r&&r.endMs);}
  function isPaused(){var r=todayRec();return !!(r&&r.pauseStartMs);}

  // 某天工时拆解：总时长 / 午休 / 暂停 / 有效。workMsOf 与「今天已赚」抽屉共用这一份
  function workSplit(k,now){
    var zero={from:0,to:0,total:0,lunch:0,pauses:0,eff:0};
    var r=R[k]; if(!r) return zero;
    if(r.manual&&!r.startMs){ var m=zero; m.eff=r.earnedMs||0; m.manual=true; return m; }
    if(!r.startMs) return zero;
    var day=dateOfKey(k);
    var bS=atTime(day,S.breakStart).getTime(), bE=atTime(day,S.breakEnd).getTime();
    if(hm2min(S.workEnd)<=hm2min(S.workStart) && bE<=r.startMs){ bS+=86400000; bE+=86400000; }  // 夜班：午休/夜宵落在次日
    var to=r.endMs?r.endMs:Math.min(now,Date.now());
    var from=r.startMs;
    if(to<=from) return zero;
    var total=to-from;
    var lunch=overlap(from,to,bS,bE);
    var pauses=0;
    (r.pauses||[]).forEach(function(p){
      var ps=p.s, pe=(p.e==null)?to:p.e;
      if(pe<=ps) return;
      pauses+=(pe-ps)-overlap(ps,pe,bS,bE);
    });
    if(r.pauseStartMs){ var ps2=r.pauseStartMs, pe2=to; if(pe2>ps2) pauses+=(pe2-ps2)-overlap(ps2,pe2,bS,bE); }
    return {from:from,to:to,total:total,lunch:lunch,pauses:pauses,eff:Math.max(0,total-lunch-pauses)};
  }
  function workMsOf(k,now){ return workSplit(k,now).eff; }
  function earnFrom(ms,rate){return ms/3600000*(rate||0);}

  // 某天该显示多少钱：存档/补录/已下班 → 用存档值；只有"计时中"用实时
  function amountOf(k,now){
    var r=R[k]; if(!r) return 0;
    if(r.manual&&!r.startMs) return r.earned||0;
    if(r.endMs) return r.earned||0;
    if(k===todayKey()&&r.startMs) return earnFrom(workMsOf(k,now), r.rate||todayRate());
    return r.earned||0;
  }
  function todayEarn(now){ return amountOf(todayKey(),now); }

  // 本月已赚 = 已存档日（用存档时的钱）+ 今天实时
  function monthTotal(now){
    var mk=monthKey(now), sum=0, days=0;
    Object.keys(R).forEach(function(k){
      if(k.indexOf(mk)!==0||k===todayKey()) return;
      var r=R[k]; if(!r) return;
      sum+=(r.earned||0); days++;
    });
    var t=todayEarn(now);
    if(t>0||started()||ended()||(todayRec()&&todayRec().manual)){ sum+=t; days++; }
    return {total:sum,days:days};
  }


  /* 2026 年法定节假日与调休（国办发明电〔2025〕7号） */
  var HOLIDAYS={"2026-01-01":1,"2026-01-02":1,"2026-01-03":1,
    "2026-02-15":1,"2026-02-16":1,"2026-02-17":1,"2026-02-18":1,"2026-02-19":1,"2026-02-20":1,"2026-02-21":1,"2026-02-22":1,"2026-02-23":1,
    "2026-04-04":1,"2026-04-05":1,"2026-04-06":1,
    "2026-05-01":1,"2026-05-02":1,"2026-05-03":1,"2026-05-04":1,"2026-05-05":1,
    "2026-06-19":1,"2026-06-20":1,"2026-06-21":1,
    "2026-09-25":1,"2026-09-26":1,"2026-09-27":1,
    "2026-10-01":1,"2026-10-02":1,"2026-10-03":1,"2026-10-04":1,"2026-10-05":1,"2026-10-06":1,"2026-10-07":1};
  var MAKEUP={"2026-01-04":1,"2026-02-14":1,"2026-02-28":1,"2026-05-09":1,"2026-09-20":1,"2026-10-10":1};

  var FESTIVAL={"2026-01-01":"元旦","2026-02-17":"春节","2026-04-05":"清明","2026-05-01":"劳动节",
    "2026-06-19":"端午","2026-09-25":"中秋","2026-10-01":"国庆节"};
  function baseWorkday(k){
    if(HOLIDAYS[k]) return false;
    if(MAKEUP[k]) return true;
    var w=new Date(k+"T12:00:00").getDay(), mode=S.restMode||"double";
    if(mode==="none") return true;
    if(mode==="single") return w!==0;
    return w!==0&&w!==6;
  }
  function isWorkday(k){
    if(R[k]&&R[k].off) return false;
    return baseWorkday(k);
  }
  function dayPayNow(){ return earnFrom(paidHours()*3600000,todayRate()); }

  /* ============ 发薪账期 ============ */
  function dayInMonth(y,m,d){ var x=new Date(y,m,d); return x.getDate()===d; }
  function safeDay(y,m,d){ var last=new Date(y,m+1,0).getDate(); return Math.min(d,last); }
  function startOfPeriod(y,m,pd){
    var dim=new Date(y,m+1,0).getDate();
    return (pd+1>dim) ? new Date(y,m+1,1) : new Date(y,m,pd+1);
  }
  function periodRange(now){
    var d=new Date(now), y=d.getFullYear(), m=d.getMonth(), pd=(S.payDay||15);
    var thisStart=startOfPeriod(y,m,pd), py, pm;
    if(thisStart.getTime()<=d.getTime()){ py=y; pm=m; }
    else { py=y; pm=m-1; }                     // Date 构造器自动处理跨年
    var start=startOfPeriod(py,pm,pd);
    var end=startOfPeriod(py,pm+1,pd);
    return {start:start,end:end,next:end};
  }
  function periodKeys(now){
    var pr=periodRange(now), keys=[], cur=new Date(pr.start.getTime()), endT=pr.end.getTime();
    while(cur.getTime()<endT){ keys.push(dateKey(cur)); cur.setDate(cur.getDate()+1); }
    return keys;
  }
  var META={};
  function loadMeta(){ try{ META=JSON.parse(localStorage.getItem("niuma.meta.v8")||"{}")||{}; }catch(e){ META={}; } }
  function saveMeta(){ try{ localStorage.setItem("niuma.meta.v8",JSON.stringify(META)); }catch(e){} }
  function clearAt(){ return META.clearedAt||""; }
  function afterClear(k){ var c=clearAt(); return !c||k>=c; }
  function dayValue(k,now){
    var r=R[k], pay=dayPayNow();
    if(k===todayKey()){
      if(started()) return amountOf(k,now);
      if(r&&r.endMs&&r.earned>0) return r.earned;
      return 0;
    }
    if(!r) return isWorkday(k)?pay:0;
    if(r.type==="off") return 0;
    if(r.type==="paid") return pay;
    if(r.type==="sick") return pay*0.6;
    if(r.type==="half") return pay*0.5;
    if(r.type==="p80") return pay*0.8;
    if(r.type==="ot") return pay*(r.mul||1.5);
    if(r.off) return 0;
    if(r.earned>0) return r.earned;
    return isWorkday(k)?pay:0;
  }
  function accrueSince(fromKey, now){
    var sum=0, tk=todayKey(), d=fromKey?dateOfKey(fromKey):dateOfKey(tk);
    var cur=new Date(d.getTime());
    while(dateKey(cur)<=tk){
      var k=dateKey(cur);
      if(k===tk){ sum+=amountOf(k,now); }
      else if(!clearAt()||k>=clearAt()){ sum+=dayValue(k,now); }
      cur.setDate(cur.getDate()+1);
    }
    return sum;
  }
  function loadGoals(){ try{ var a=JSON.parse(localStorage.getItem(LS_GOALS)||"[]"); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
  function saveGoals(){ try{ localStorage.setItem(LS_GOALS,JSON.stringify(GOALS)); }catch(e){} touchStore(); }

  /* ============ IndexedDB 持久层（v25） ============ */
  var LS_AT="niuma.at.v25", IDB_NAME="niuma-timer", IDB_VER=1, IDB_KEY="snap.v1";
  var IDB=(function(){
    var dbp=null, tmr=null;
    function has(){ try{ return (typeof indexedDB!=="undefined") && indexedDB; }catch(e){ return false; } }
    function open(){
      if(dbp) return dbp;
      if(!has()){ dbp=Promise.reject(new Error("no-idb")); dbp.catch(function(){}); return dbp; }
      dbp=new Promise(function(res,rej){
        var rq=indexedDB.open(IDB_NAME,IDB_VER);
        rq.onupgradeneeded=function(){ var d=rq.result; if(!d.objectStoreNames.contains("kv")) d.createObjectStore("kv"); };
        rq.onsuccess=function(){ res(rq.result); };
        rq.onerror=function(){ rej(rq.error||new Error("idb-open")); };
      });
      dbp.catch(function(){});
      return dbp;
    }
    function get(key){
      return open().then(function(d){ return new Promise(function(res,rej){
        var tx=d.transaction("kv","readonly"), rq=tx.objectStore("kv").get(key);
        rq.onsuccess=function(){ res(rq.result||null); };
        rq.onerror=function(){ rej(rq.error||new Error("idb-get")); };
      });});
    }
    function put(key,val){
      return open().then(function(d){ return new Promise(function(res,rej){
        var tx=d.transaction("kv","readwrite"); tx.objectStore("kv").put(val,key);
        tx.oncomplete=function(){ res(true); };
        tx.onerror=function(){ rej(tx.error||new Error("idb-put")); };
        tx.onabort=function(){ rej(tx.error||new Error("idb-abort")); };
      });});
    }
    function snapshot(){ return {at:Date.now(),settings:S,records:R,goals:GOALS,meta:META,actuals:ACTUALS,phases:PHASES}; }
    function persist(){
      if(!has()) return Promise.resolve(false);
      var snap=snapshot();
      try{ localStorage.setItem(LS_AT,String(snap.at)); }catch(e){}
      return put(IDB_KEY,snap).catch(function(){ return false; });
    }
    function putSoon(){
      if(!has()||tmr) return;
      if(typeof setTimeout!=="function"){ persist(); return; }
      tmr=setTimeout(function(){ tmr=null; persist(); },250);
    }
    function load(){ return get(IDB_KEY).catch(function(){ return null; }); }
    function hydrate(snap){
      if(!snap) return false;
      try{
        S=Object.assign({},DEFAULT,snap.settings||{});
        R=(snap.records&&typeof snap.records==="object")?snap.records:{};
        GOALS=Array.isArray(snap.goals)?snap.goals:[];
        ACTUALS=Array.isArray(snap.actuals)?snap.actuals:[];
        PHASES=Array.isArray(snap.phases)?snap.phases:[];
        META=snap.meta||{};
        return true;
      }catch(e){ return false; }
    }
    function lsAt(){ try{ return +(localStorage.getItem(LS_AT)||0)||0; }catch(e){ return 0; } }
    return {open:open,get:get,put:put,persist:persist,putSoon:putSoon,load:load,hydrate:hydrate,has:has,snapshot:snapshot,lsAt:lsAt};
  })();
  window.__niuma={IDB:IDB};
  function migrateGoal(){
    if(GOALS.length) return;
    if(S.goalAmount>0){ GOALS.push({id:"g"+Date.now(),name:S.goalName||"攒钱目标",amount:S.goalAmount,base:S.goalBase||0,from:S.goalFrom||todayKey()}); saveGoals(); }
  }
  function goalSaved(g, now){ return (g.base||0)+accrueSince(g.from||todayKey(), now); }
  function goalEta(g, now){
    var left=Math.max(0,(g.amount||0)-goalSaved(g,now)), pay=dayPayNow();
    if(left<=0||pay<=0) return {left:0,days:0,date:null};
    var days=0, cur=new Date(dateOfKey(todayKey()).getTime()), guard=0;
    while(guard++<3000){ cur.setDate(cur.getDate()+1); if(isWorkday(dateKey(cur))) days++; if(days*pay>=left) return {left:left,days:days+1,date:dateKey(cur)}; }
    return {left:left,days:999,date:null};
  }
  function renderGoals(now){
    var box=document.getElementById("goalList"); if(!box) return;
    var list=GOALS.slice().sort(function(a,b){
      var ra=goalSaved(a,now)/(a.amount||1), rb=goalSaved(b,now)/(b.amount||1);
      return (ra>=1?1:0)-(rb>=1?1:0);
    });
    box.innerHTML=list.map(function(g){
      var saved=goalSaved(g,now), amt=g.amount||0, left=Math.max(0,amt-saved);
      var pct=amt>0?Math.min(100,saved/amt*100):0, eta=goalEta(g,now);
      var sub = amt<=0 ? "未填目标金额" : (left<=0 ? "已达成 🎉" : "还差 "+money(left)+" · 约 "+eta.days+" 个工作日"+(eta.date?"（"+eta.date.slice(5)+" 左右）":""));
      return '<div class="goal"><div class="gtop"><span class="gname">'+esc(g.name||"目标")+'</span>'+
        '<span class="gamt" data-edit="'+g.id+'" title="点击修改目标金额">'+money(saved)+' / '+money(amt)+(left<=0?' ✅':'')+'</span>'+
        '<button class="gdel" data-gid="'+g.id+'" title="删除">×</button></div>'+
        '<div class="bar"><i style="width:'+pct.toFixed(1)+'%"></i></div>'+
        '<p class="gsub">'+sub+'</p></div>';
    }).join("")||'<p class="gsub">还没有目标，点右上「+ 添加」。</p>';
  }
  function periodTotal(now){
    var keys=periodKeys(now), tk=todayKey(), sum=0, days=0;
    keys.forEach(function(k){
      if(k>tk) return;
      if(!afterClear(k)) return;
      var v=dayValue(k,now);
      if(v>0){ sum+=v; days++; }
    });
    return {total:sum,days:days,keys:keys};
  }

  /* ============ v27 月末对账 ============ */
  function findActual(key){
    for(var i=0;i<ACTUALS.length;i++) if(ACTUALS[i]&&ACTUALS[i].periodKey===key) return ACTUALS[i];
    return null;
  }
  function periodKeyNow(now){
    var pr=periodRange(now||Date.now()), endD=new Date(pr.end.getTime()-86400000);
    return dateKey(pr.start)+"~"+dateKey(endD);
  }
  function periodDisplay(now){
    var pr=periodRange(now||Date.now()), endD=new Date(pr.end.getTime()-86400000);
    return dateKey(pr.start)+" ~ "+dateKey(endD);
  }
  function signedMoney(v){
    var n=Number(v)||0;
    return (n<0?"−":"+")+"¥"+Math.abs(n).toFixed(2);
  }
  function actualAttribution(now){
    var tk=todayKey(), pay=dayPayNow(), list=[];
    var n={sick:0,off:0,paid:0,ot:0,half:0,p80:0}, imp={sick:0,off:0,paid:0,ot:0,half:0,p80:0};
    var workdays=fullEstimate(now).workdays;
    periodKeys(now).forEach(function(k){
      if(k>tk||!afterClear(k)) return;
      var r=R[k]; if(!r) return;
      if(r.type==="sick"){ n.sick++; imp.sick-=pay*0.4; }
      else if(r.type==="off"){ n.off++; imp.off-=pay; }
      else if(r.type==="paid"){ n.paid++; }
      else if(r.type==="half"){ n.half++; imp.half-=pay*0.5; }
      else if(r.type==="p80"){ n.p80++; imp.p80-=pay*0.2; }
      else if(r.type==="ot"){ n.ot++; imp.ot+=pay*((r.mul||1.5)-1); }
    });
    if(n.sick) list.push({key:"sick", label:"病假 "+n.sick+" 天，按 60% 计（相对满勤）", impact:imp.sick, n:n.sick});
    if(n.off) list.push({key:"off", label:"休息 "+n.off+" 天，不计钱", impact:imp.off, n:n.off});
    if(n.paid) list.push({key:"paid", label:"带薪假 "+n.paid+" 天，按 100% 计", impact:0, n:n.paid});
    if(n.half) list.push({key:"half", label:"半天班 "+n.half+" 天，按 50% 计", impact:imp.half, n:n.half});
    if(n.p80) list.push({key:"p80", label:"出勤 80% "+n.p80+" 天", impact:imp.p80, n:n.p80});
    if(n.ot) list.push({key:"ot", label:"加班 "+n.ot+" 天（1.5/2/3 倍）", impact:imp.ot, n:n.ot});
    list.sort(function(a,b){ return Math.abs(b.impact)-Math.abs(a.impact); });
    return {list:list.slice(0,3), all:list, workdays:workdays};
  }
  function renderActual(now){
    var box=document.getElementById("actualBody"); if(!box) return;
    now=now||Date.now();
    var key=periodKeyNow(now), fe=fullEstimate(now), rec=findActual(key), html;
    if(!rec){
      html='<p class="gsub" style="margin:0 0 10px">本期满勤应得 <b>'+money(fe.total)+'</b>（'+fe.workdays+' 个工作日 × 日薪 '+money(fe.pay)+'） · 拿到工资后填一下税后到手，工具会帮你对一下差多少、差在哪。</p>'+
        '<div class="btns" style="justify-content:flex-start"><button class="b-go" id="btnActFill">填入实际</button></div>';
    } else {
      var dcls=rec.diff<0?"#c0392b":"#22a06b";
      html='<p class="gsub" style="margin:0 0 10px">满勤应得 <b>'+money(rec.estimate)+'</b> · 实际到手 <b>'+money(rec.actual)+
        '</b> · 差 <b style="color:'+dcls+'">'+signedMoney(rec.diff)+'（'+((rec.diffPct>=0)?"+":"")+Number(rec.diffPct).toFixed(1)+'%）</b></p>'+
        '<div class="btns" style="justify-content:flex-start"><button class="b-ghost" id="btnActEdit">修改</button><button class="b-ghost" id="btnActHist">看历史</button></div>';
    }
    box.innerHTML=html;
    var f=document.getElementById("btnActFill"), e=document.getElementById("btnActEdit"), h=document.getElementById("btnActHist");
    if(f) f.addEventListener("click",function(){ openActual(null); });
    if(e) e.addEventListener("click",function(){ openActual(rec); });
    if(h) h.addEventListener("click",function(){ showActualHistory(); });
  }
  function setActView(which){
    ["actFormView","actResultView","actHistView"].forEach(function(id){
      var el=document.getElementById(id); if(el) el.style.display=(id===which?"":"none");
    });
  }
  function showActErr(msg){
    var el=document.getElementById("actErr");
    if(el){ el.style.display="block"; el.textContent=msg; }
  }
  function openActual(rec){
    var now=Date.now();
    var lab=document.getElementById("actPeriodLabel"); if(lab) lab.textContent="账期 "+periodDisplay(now);
    var a=document.getElementById("actAmount"); if(a) a.value=(rec&&rec.actual!=null)?String(rec.actual):"";
    [["social","actSocial"],["housing","actHousing"],["tax","actTax"]].forEach(function(x){
      var el=document.getElementById(x[1]);
      if(el) el.value=(rec&&rec.deductions&&rec.deductions[x[0]]!=null)?String(rec.deductions[x[0]]):"";
    });
    var nt=document.getElementById("actNote"); if(nt) nt.value=(rec&&rec.note)?rec.note:"";
    var er=document.getElementById("actErr"); if(er){ er.style.display="none"; er.textContent=""; }
    setActView("actFormView");
    var m=document.getElementById("actualModal"); if(m&&m.classList) m.classList.add("show");
  }
  function closeActual(){
    var m=document.getElementById("actualModal"); if(m&&m.classList) m.classList.remove("show");
    renderActual(Date.now());
  }
  function attrLabel(x){
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
  function saveActualFromForm(){
    var amt=parseFloat(getVal("actAmount",""));
    if(!isFinite(amt)||amt<0){ showActErr("请填写实际到手金额（可以填 0）。"); return; }
    var tmp={}, bad=false;
    [["social","actSocial"],["housing","actHousing"],["tax","actTax"]].forEach(function(x){
      var raw=getVal(x[1],"");
      if(raw==="") return;
      var f=parseFloat(raw);
      if(!isFinite(f)||f<0){ bad=true; return; }
      tmp[x[0]]=+f.toFixed(2);
    });
    if(bad){ showActErr("社保/公积金/个税请填非负数字，或留空。"); return; }
    var now=Date.now(), key=periodKeyNow(now), prev=findActual(key);
    // v28.01：估算快照固化——同一账期再次「修改」保存时沿用第一次的 estimate，不按新设置的月薪重算
    var est=(prev&&isFinite(prev.estimate))?prev.estimate:fullEstimate(now).total;
    var diff=amt-est, pct=est>0?diff/est*100:0;
    var rec={periodKey:key, estimate:+est.toFixed(2), actual:+amt.toFixed(2), diff:+diff.toFixed(2), diffPct:+pct.toFixed(2)};
    if(Object.keys(tmp).length) rec.deductions=tmp;
    rec.note=getVal("actNote","");
    rec.at=now;
    // v28.02：写入时快照化——归因结果、基准、日薪、满勤工作日数全部固化，重开只读快照
    var snap=(prev&&Array.isArray(prev.impactSnapshot))?prev:attributionSnapshot(now);
    rec.impactSnapshot=snap.impactSnapshot;
    rec.basis=snap.basis||"full-attendance";
    rec.dailyPaySnapshot=snap.dailyPaySnapshot;
    rec.paidDaysSnapshot=snap.paidDaysSnapshot;
    var replaced=false;
    for(var i=0;i<ACTUALS.length;i++){ if(ACTUALS[i]&&ACTUALS[i].periodKey===key){ ACTUALS[i]=rec; replaced=true; break; } }
    if(!replaced) ACTUALS.push(rec);
    saveActuals(); renderActual(now); showActualResult(rec);
  }

  function deductionsTotal(rec){
    var d=(rec&&rec.deductions)||{}, s=0;
    ["social","housing","tax"].forEach(function(k){ var v=parseFloat(d[k]); if(isFinite(v)&&v>0) s+=v; });
    return s;
  }
  // v28.01：结论只列「净贡献」，diff≈0 时禁止出现「主要来自」；残差按量级说话
  function actualConclusion(rec, at, baseDiff, residual, ded){
    var out=[];
    var lbl=function(x){
      if(x.key==="sick") return x.n+" 天病假";
      if(x.key==="off") return x.n+" 天休息";
      if(x.key==="paid") return x.n+" 天带薪假";
      if(x.key==="half") return x.n+" 天半天班";
      if(x.key==="p80") return x.n+" 天出勤 80%";
      return x.n+" 天加班";
    };
    if(Math.abs(baseDiff)<1){
      if(ded>0) out.push("实发 "+money(rec.actual)+" = 满勤应得 "+money(rec.estimate)+" − 已填代扣 "+money(ded)+"，差 "+signedMoney(baseDiff)+"，基本一致。");
      else out.push("实发与满勤应得基本一致（差 "+signedMoney(baseDiff)+"），不需要解释差额。");
    } else {
      // v28.01：先做正负抵消（休息/加班这类 +450/−450），只把「净贡献」写进结论
      var work=at.all.filter(function(x){ return Math.abs(x.impact)>=0.005; }).map(function(x){
        return {key:x.key, n:x.n, impact:x.impact, left:x.impact};
      });
      var pos=work.filter(function(x){ return x.left>0; }), neg=work.filter(function(x){ return x.left<0; });
      var cancelled=[];
      pos.forEach(function(p){
        neg.forEach(function(q){
          if(p.left<0.005||q.left>-0.005) return;
          var m=Math.min(p.left,-q.left);
          p.left-=m; q.left+=m;
        });
      });
      work.forEach(function(x){ if(Math.abs(x.left)<0.005 && Math.abs(x.impact)>=0.005) cancelled.push(x); });
      var remain=work.filter(function(x){ return Math.abs(x.left)>=0.005; })
                    .sort(function(a,b){ return Math.abs(b.left)-Math.abs(a.left); });
      var cancelTxt=cancelled.length?("（"+cancelled.map(function(x){ return x.n+" 天"+(x.key==="off"?"休息":x.key==="ot"?"加班":lbl(x).replace(/^\d+ 天/,"")); }).join("、")+"的影响基本抵消）"):"";
      var deduced=cancelled.reduce(function(a,x){ return a+x.impact; },0);
      if(remain.length){
        out.push("差额主要来自 "+remain.slice(0,2).map(function(x){ return lbl(x)+"（"+signedMoney(x.left)+"）"; }).join("、")+(cancelTxt?cancelTxt:"")+"。");
      } else if(cancelled.length){
        out.push("休息/加班等的影响基本抵消（净 "+signedMoney(deduced)+"），差额主要来自其他原因。");
      } else {
        out.push("没有标记请假或加班，差额可能来自已填/未填的代扣项或估算口径偏差。");
      }
    }
    if(Math.abs(residual)>100){
      out.push("剩余 "+signedMoney(residual)+" 暂未归类：可能含社保/个税、填错金额、或没标记的请假。");
    } else if(Math.abs(residual)>=1){
      out.push("剩余 "+signedMoney(residual)+" 属零头差异。");
    }
    return out.join("");
  }
  function showActualResult(rec){
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
  }
  function showActualHistory(){
    var arr=ACTUALS.slice().sort(function(a,b){ return (b.at||0)-(a.at||0); }).slice(0,6);
    var html=arr.map(function(r,i){
      var dcls=r.diff<0?"#c0392b":"#22a06b", d=new Date(r.at||0);
      return '<div class="act-hrow" id="histRow'+i+'" title="点开看这期的对账结果"><span class="act-hk">'+esc(r.periodKey||"")+'</span>'+
        '<span class="act-hv">'+money(r.estimate)+' → '+money(r.actual)+'</span>'+
        '<b style="color:'+dcls+'">'+signedMoney(r.diff)+'</b>'+
        '<span class="act-hp">'+((r.diffPct>=0)?"+":"")+Number(r.diffPct).toFixed(1)+'%</span>'+
        '<span class="act-hd">'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'</span></div>';
    }).join("")||'<p class="gsub">还没有对账记录。</p>';
    var box=document.getElementById("histActBody");
    if(box){
      box.innerHTML=html;
      // 每行单独绑，点开看当期结果（v28.02 起结果只读快照，不再重算）
      arr.forEach(function(r,i){
        var row=document.getElementById("histRow"+i);
        if(row) row.addEventListener("click",function(){ showActualResult(r); });
      });
    }
    var mean=0;
    if(arr.length){ var sum=0; arr.forEach(function(r){ sum+=Math.abs(Number(r.diffPct)||0); }); mean=sum/arr.length; }
    var sm=document.getElementById("histActSum");
    if(sm) sm.textContent=arr.length?("最近 "+arr.length+" 次 · 平均绝对偏差 "+mean.toFixed(1)+"%"):"";
    setActView("actHistView");
    var m=document.getElementById("actualModal"); if(m&&m.classList) m.classList.add("show");
  }

  /* ============ 跨天收尾 ============ */
  function finalizeStale(){
    var tk=todayKey(), changed=false;
    Object.keys(R).forEach(function(k){
      if(k>=tk) return;
      var r=R[k]; if(!r||!r.startMs||r.endMs) return;
      var day=dateOfKey(k), end=atTime(day,S.workEnd).getTime();
      if(end<=r.startMs) end+=86400000;        // 夜班：下班时刻落在第二天
      r.pauses=r.pauses||[];
      if(r.pauseStartMs){ r.pauses.push({s:r.pauseStartMs,e:end}); r.pauseStartMs=null; }
      r.endMs=end;
      r.earnedMs=workMsOf(k,end);
      r.earned=earnFrom(r.earnedMs, r.rate||todayRate());
      r.auto=true; changed=true;
    });
    if(changed) saveRecords();
  }

  /* ============ v28 口径抽屉 ============ */
  var sheetKind="";
  function num(v){ return String(Math.round((Number(v)||0)*100)/100); }
  function hmLabel(d){ return pad(d.getHours())+":"+pad(d.getMinutes()); }
  function sheetLine(t){ return '<div class="s-line">'+t+'</div>'; }
  function sheetNote(t){ return '<div class="s-sec s-note">'+t+'</div>'; }
  function sheetHead(kicker,bigHtml){ return '<div class="s-kicker">'+kicker+'</div><div class="s-big">'+bigHtml+'</div>'; }
  function sheetOpen(){ var s=document.getElementById("sheet"); return !!(s&&s.classList&&s.classList.contains("show")); }
  // 今天已赚：金额走 todayEarn/amountOf，工时拆解走 workSplit（与 workMsOf 同源）
  function sheetToday(now){
    var earn=todayEarn(now), r=todayRec(), rate=(r&&r.rate)||todayRate(), sp=workSplit(todayKey(),now);
    var head=sheetHead("今天已赚",moneyHTML(earn));
    var note=sheetNote("说明：按设置里的 "+modeLabel()+" "+num(S.salary)+"、"+num(S.days>0?S.days:21.75)+" 天、"+num(paidHours())+" 小时折算；不含个税与社保（本工具只按到手口径估算）；加班日按倍率另计。");
    if(!sp.from||!(sp.total>0)){
      return head+'<div class="s-sec">'+sheetLine("今天还没开始计时。点「开始上班」后，按「时薪 × 有效工时」累加；上班时间到现在的部分会先补算。")+'</div>'+note;
    }
    var line1="时薪 "+money(rate)+" × 有效工时 "+hms(sp.eff)+" = "+money(earn);
    var line2="有效工时 = 上班 "+hmLabel(new Date(sp.from))+" → "+(sp.to===now?"现在 "+hmLabel(new Date(sp.to)):"下班 "+hmLabel(new Date(sp.to)))+"（"+hms(sp.total)+"）− 午休 "+hms(sp.lunch);
    if(sp.pauses>0) line2+=" − 暂停 "+hms(sp.pauses);
    return head+'<div class="s-sec">'+sheetLine(line1)+sheetLine(line2)+'</div>'+note;
  }
  // 时薪：全部走 hourly/dailyPay/monthlyPay/paidHours
  function sheetRate(){
    var days=(S.days>0?S.days:21.75), hh=paidHours();
    var head=sheetHead("时薪",money(hourly()));
    var l1="折合月薪 "+money(monthlyPay())+" ÷ "+num(days)+" 天 ÷ "+num(hh)+" 小时 = "+money(hourly());
    var l2="日薪 "+money(dailyPay())+" = 折合月薪 "+money(monthlyPay())+" ÷ "+num(days)+" 天";
    return head+'<div class="s-sec">'+sheetLine(l1)+sheetLine(l2)+'</div>'
      +sheetNote("说明：21.75 是月均计薪天数（(365−104)/12），当月实际工作日会多几天，所以月末对账可能有几十元偏差；可在月末对账里校准。不含个税与社保（本工具只按到手口径估算）。");
  }
  // 本期已赚：总额走 periodTotal，分类型走 periodGroups（两者同用 dayValue）
  function sheetPeriod(now){
    var st=periodTotal(now), pg=periodGroups(now), pr=periodRange(now), tk=todayKey(), workdays=0;
    periodKeys(now).forEach(function(k){ if(k<=tk&&afterClear(k)&&baseWorkday(k)) workdays++; });
    var head=sheetHead("本期已赚",money(st.total));
    var d1="账期 "+dateKey(pr.start).slice(5)+" → "+dateKey(new Date(pr.end.getTime()-86400000)).slice(5)+"（发薪日 "+(S.payDay||15)+" 号），共 "+workdays+" 个工作日";
    var parts=[];
    GROUP_ORDER.forEach(function(t){
      var g=pg.groups[t]; if(!g) return;
      var lab=GROUP_LABEL[t]||t;
      if(t==="ot"){
        var muls={}; periodKeys(now).forEach(function(k){ var r=R[k]; if(r&&r.type==="ot") muls[String(r.mul||1.5)]=1; });
        lab+=" ×"+Object.keys(muls).join("/");
      }
      parts.push(lab+" "+g.n+" 天 "+money(g.sum));
    });
    var d2="其中："+(parts.join(" / ")||"本期还没有数据");
    var d3="合计 "+money(st.total);
    return head+'<div class="s-sec">'+sheetLine(d1)+sheetLine(d2)+sheetLine(d3)+'</div>'
      +sheetNote("说明：每天的金额可在日历里点开查看；被标记为休息/病假的天按规则折算。");
  }
  function openSheet(kind){
    var now=Date.now(), html="";
    if(kind==="today") html=sheetToday(now);
    else if(kind==="rate") html=sheetRate();
    else html=sheetPeriod(now);
    var t=document.getElementById("sheetTitle");
    if(t) t.textContent=(kind==="today"?"今天这笔钱怎么算":kind==="rate"?"时薪怎么算":"本期这笔钱怎么算");
    var b=document.getElementById("sheetBody"); if(b) b.innerHTML=html;
    document.getElementById("sheet").classList.add("show");
    document.getElementById("sheetMask").classList.add("show");
    sheetKind=kind;
    var sh=document.getElementById("sheet"); if(sh&&sh.focus){ try{ sh.focus(); }catch(e){} }
  }
  function closeSheet(){
    document.getElementById("sheet").classList.remove("show");
    document.getElementById("sheetMask").classList.remove("show");
    sheetKind="";
  }
  function toggleSheet(kind){
    if(sheetOpen()&&sheetKind===kind){ closeSheet(); return; }
    openSheet(kind);
  }

  /* ============ v29 时薪轨迹 ============ */
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

  /* ============ 渲染 ============ */
  var GROUP_LABEL={work:"正常上班",p80:"上班 80%",ot:"加班",paid:"带薪假",sick:"病假",half:"半天班",off:"休息",weekend:"周末"};
  var GROUP_ORDER=["work","p80","half","ot","paid","sick","off","weekend"];
  // 本期按类型分组：金额只走 dayValue，与「本期已赚」(periodTotal) 同口径；抽屉与构成卡共用
  // v28.01 对账基准：满勤应得 = 当月已过工作日 × 当前日薪（请假/加班之前的「正常出勤」口径）
  // 注意它不等于「本期已赚」：后者按病假 60%/休息 0/加班倍率折算。归因以满勤为基准，所以
  // 病假/休息/加班的 impact 可以直接相加，残差才是代扣、填错、未标记请假等。
  function fullEstimate(now){
    var tk=todayKey(), pay=dayPayNow(), sum=0, workdays=0;
    periodKeys(now).forEach(function(k){
      // 只算「已经过完的日子」：今天还没结束，金额随时会变，不纳入满勤基准
      if(k>=tk||!afterClear(k)) return;
      if(!baseWorkday(k)) return;
      workdays++; sum+=pay;
    });
    return {total:sum, workdays:workdays, pay:pay};
  }
  function periodGroups(now){
    var keys=periodKeys(now), tk=todayKey(), groups={};
    keys.forEach(function(k){
      if(k>tk||!afterClear(k)) return;
      var r=R[k]||{}, t=r.type;
      if(!t) t = isWorkday(k) ? "work" : "weekend";
      var v=dayValue(k,now);
      if(v<=0&&t!=="off"&&t!=="weekend") return;
      var g=groups[t]||(groups[t]={n:0,sum:0});
      g.n++; g.sum+=v;
    });
    var total=0; GROUP_ORDER.forEach(function(t){ if(groups[t]) total+=groups[t].sum; });
    return {groups:groups,total:total};
  }
  function renderStats(now){
    var box=document.getElementById("statBody"); if(!box) return;
    var pg=periodGroups(now), groups=pg.groups, total=pg.total;
    var html=GROUP_ORDER.filter(function(t){return groups[t];}).map(function(t){
      var g=groups[t], pct=total>0?g.sum/total*100:0;
      return '<div class="srow"><span class="sname">'+(GROUP_LABEL[t]||t)+'</span>'+
        '<span class="scnt">'+g.n+' 天</span>'+
        '<div class="bar"><i style="width:'+pct.toFixed(1)+'%"></i></div>'+
        '<span class="ssum">'+money(g.sum)+'</span></div>';
    }).join("") || '<p class="gsub">本期还没有数据。</p>';
    box.innerHTML=html+'<p class="gsub">合计 '+money(total)+' · 本期末次更新 '+new Date(now).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+'</p>';
  }
  function renderHistory(now){
    var box=document.getElementById("histBody"); if(!box) return;
    var cur=new Date(now), arr=[], map={};
    for(var i=5;i>=0;i--){
      var d=new Date(cur.getFullYear(),cur.getMonth()-i,1);
      var k=d.getFullYear()+"-"+pad(d.getMonth()+1);
      var o={key:k,label:(d.getMonth()+1)+" 月",sum:0,days:0}; arr.push(o); map[k]=o;
    }
    var ySum=0, yDays=0, yk=String(cur.getFullYear());
    Object.keys(R).forEach(function(k){
      var v=dayValue(k,now); if(!(v>0)) return;
      var mk=k.slice(0,7);
      if(map[mk]){ map[mk].sum+=v; map[mk].days++; }
      if(k.slice(0,4)===yk){ ySum+=v; yDays++; }
    });
    var max=0; arr.forEach(function(a){ if(a.sum>max) max=a.sum; });
    box.innerHTML=arr.map(function(a){
      var h=max>0?Math.round(a.sum/max*100):0;
      return '<div class="hcol"><div class="hbar" style="height:'+h+'%"><span>'+money(a.sum)+'</span></div>'+
             '<div class="hlab">'+a.label+'</div><div class="hday">'+a.days+' 天</div></div>';
    }).join("")+
    '<p class="gsub">'+yk+' 年累计 <b>'+money(ySum)+'</b> · 出勤 '+yDays+' 天 · 日均 '+(yDays?money(ySum/yDays):money(0))+'</p>';
  }
  function applyTheme(){
    var t=(S.theme==="dark")?"dark":"light";
    if(document.body&&document.body.classList){ if(t==="dark") document.body.classList.add("dark"); else document.body.classList.remove("dark"); }
    var b=document.getElementById("btnTheme"); if(b) b.textContent=(t==="dark")?"☀ 浅色":"🌙 深色";
  }
  function render(){
    var now=Date.now(), r=todayRec();
    var ms=workMsOf(todayKey(),now), earn=todayEarn(now);
    var notStarted=!(r&&(r.startMs||r.endedMs||r.manual||r.endMs));

    var el=document.getElementById("todayEarn");
    el.innerHTML=moneyHTML(earn);
    el.classList.toggle("zero",earn<=0);
    document.title=(earn>0?money(earn)+" · 牛马计时器":"牛马计时器");

    var tag=document.getElementById("stateTag");
    if(ended()){tag.textContent="今天已下班";tag.className="state";}
    else if(started()){tag.textContent="工作中";tag.className="state on";}
    else {tag.textContent="未开始";tag.className="state";}

    var rate=todayRate();
    var sub=document.getElementById("subLine");
    if(sub){
      if(monthlyPay()<=0){ sub.innerHTML="还没填月薪 · 点「设置」填入月薪和上下班时间，就能按秒算钱"; }
      else if(started()){ sub.innerHTML="工作中 · 每秒 <b>"+money(rate/3600)+"</b> · 每分钟 <b>"+money(rate/60)+"</b>"+(mul()>1?" · 今日 "+mul()+" 倍":""); }
      else if(ended()){ sub.innerHTML="今天已存档 · 点「继续计时」可以接着算"; }
      else{ sub.innerHTML="点「开始上班」= 今天从上班时间起补算，之后每秒自动加钱"; }
    }

    var st=periodTotal(now);
    document.getElementById("monthEarn").textContent=money(st.total);

    var rEl=document.getElementById("rateTxt");
    rEl.textContent=money(rate)+" / "+money(rate/60)+" / "+money4(rate/3600);

    var cd=document.getElementById("countdown");
    var endT=atTime(new Date(),S.workEnd).getTime(), left=endT-now;
    if(hm2min(S.workEnd)<=hm2min(S.workStart)&&left<0) endT=atTime(new Date(),S.workEnd).getTime()+86400000, left=endT-now;
    if(!started()&&!ended()) cd.textContent="—";
    else if(left<=0) cd.textContent="已超时 "+clock(-left);
    else cd.textContent=clock(left);

    var remindOn=(S.remind!==false)&&started()&&left>0&&left<=10*60000;
    if(remindOn){ document.title="⏰ "+Math.ceil(left/60000)+" 分钟 · "+money(earn)+" · 牛马计时器"; }
    else if(earn>0){ document.title=money(earn)+" · 牛马计时器"; }
    else { document.title="牛马计时器"; }

    var dm=dailyMs(), dp=dm>0?Math.min(100,ms/dm*100):0;
    document.getElementById("dayBar").style.width=dp+"%";
    document.getElementById("dayPct").textContent=dp.toFixed(1)+"%";
    document.getElementById("dayLeft").textContent=money(Math.max(0,dailyPay()*mul()-earn));

    var mp=monthlyPay()>0?Math.min(100,st.total/monthlyPay()*100):0;
    document.getElementById("monthBar").style.width=mp+"%";
    document.getElementById("monthPct").textContent=mp.toFixed(1)+"%";
    document.getElementById("monthLabel").textContent="本期进度 "+money(st.total)+" / "+money(monthlyPay());

    document.getElementById("workBar").style.width=dp+"%";
    document.getElementById("workTxt").textContent=hms(ms);
    document.getElementById("workTotal").textContent=hms(dm);
    updateCalToday();
    renderGoals(now);
    applyTheme();
    renderStats(now);
    renderActual(now);
    renderPhase(now);
    renderHistory(now);
    var _lb=document.getElementById("monthEarnLabel");
    if(_lb) _lb.textContent=((S.payDay||15)===1)?"本月已赚":"本期已赚";
    var _st=document.getElementById("sumTag"); if(_st) _st.textContent="本期 "+st.days+" 天 · 合计 "+money(st.total);

    (function(){
    var b=document.getElementById("btnMini");
    if(b) b.addEventListener("click",function(){
      try{ window.open(location.pathname+"?mini=1","niuma_mini","width=430,height=380,menubar=no,toolbar=no"); }catch(e){}
    });
  })();

  document.getElementById("btnStart").style.display=(started()||ended())?"none":"inline-block";
    document.getElementById("btnStop").style.display=started()?"inline-block":"none";
    document.getElementById("btnRestart").style.display=ended()?"inline-block":"none";
  }

  function renderTables(){
    if(!document.getElementById("rankWrap")) return;
    var now=Date.now(), tk=todayKey(), mk=monthKey(now);
    var pset={}; periodKeys(now).forEach(function(k){pset[k]=1;});
    var keys=Object.keys(R).filter(function(k){
      if(!pset[k]) return false;
      var r=R[k]; return r&&(r.startMs||r.endMs||r.manual);
    });
    if(keys.indexOf(tk)<0 && started()) keys.push(tk);
    keys.sort().reverse();

    var tb=document.getElementById("detailBody");
    tb.innerHTML="";
    if(!keys.length){
      tb.innerHTML='<tr><td colspan="4" class="muted">还没有记录，先点「开始上班」</td></tr>';
    }
    keys.forEach(function(k){
      var r=R[k]||{}, ms, amount, status;
      if(k===tk&&!(r.manual&&!r.startMs)&&!r.endMs){ ms=workMsOf(k,now); amount=amountOf(k,now); status="进行中"; }
      else if(r.manual&&!r.startMs){ ms=r.earnedMs||0; amount=r.earned||0; status="补录"; }
      else { ms=r.earnedMs||0; amount=r.earned||0; status="已存档"; }
      var tr=document.createElement("tr");
      if(k===tk) tr.className="today";
      tr.innerHTML="<td>"+k.slice(5)+"</td><td>"+status+"</td>"+
        '<td class="num">'+hms(ms)+"</td>"+
        '<td class="num">'+money(amount)+"</td>";
      tb.appendChild(tr);
    });

    var rank=keys.map(function(k){
      var r=R[k]||{}, ms, amount;
      if(k===tk&&!(r.manual&&!r.startMs)&&!r.endMs){ ms=workMsOf(k,now); amount=amountOf(k,now); }
      else { ms=r.earnedMs||0; amount=r.earned||0; }
      return {k:k,ms:ms,e:amount};
    }).filter(function(x){return x.ms>0;}).sort(function(a,b){return b.e-a.e;}).slice(0,5);

    var rb=document.getElementById("rankBody");
    rb.innerHTML=rank.length?"":'<tr><td colspan="4" class="muted">还没有数据</td></tr>';
    rank.forEach(function(x,i){
      var tr=document.createElement("tr");
      tr.innerHTML='<td class="'+(i===0?"medal":"")+'">'+(i+1)+"</td><td>"+x.k+"</td>"+
        '<td class="num">'+hms(x.ms)+'</td><td class="num">'+money(x.e)+"</td>";
      rb.appendChild(tr);
    });
    document.getElementById("rankTag").textContent="本期 "+keys.length+" 天";
  }


  /* ============ 账期日历 ============ */
  function updateCalToday(){
    var el=document.querySelector('[data-k="'+todayKey()+'"] .e');
    if(el) el.textContent=money(amountOf(todayKey(),Date.now()));
  }
  function renderCalendar(){
    var wrap=document.getElementById("calWrap"); if(!wrap) return;
    var now=Date.now(), pr=periodRange(now), tk=todayKey(), pay=dayPayNow();
    var first=new Date(pr.start.getTime());
    var dow=(first.getDay()+6)%7;
    first.setDate(first.getDate()-dow);
    var cells=[], cur=new Date(first.getTime());
    while(cur.getTime()<pr.end.getTime()){ cells.push(new Date(cur.getTime())); cur.setDate(cur.getDate()+1); }
    while(cells.length%7!==0) cells.push(null);

    var html='<div class="cal">';
    ["一","二","三","四","五","六","日"].forEach(function(w){ html+='<div class="wd">'+w+'</div>'; });
    cells.forEach(function(d){
      if(!d){ html+='<div class="d out"></div>'; return; }
      var k=dateKey(d), inP=(d>=pr.start&&d<pr.end), working=isWorkday(k);
      var wd0=d.getDay();
      var cls="d"+(inP?"":" out");
      if(inP&&!working) cls+=" offday";
      if(inP&&HOLIDAYS[k]) cls+=" holiday";
      if(inP&&MAKEUP[k]) cls+=" makeup";
      if(inP&&!HOLIDAYS[k]&&!MAKEUP[k]&&(wd0===0||wd0===6)) cls+=" weekend";
      if(inP&&working&&k<tk&&afterClear(k)) cls+=" done";
      if(inP&&k<tk&&!HOLIDAYS[k]&&baseWorkday(k)) cls+=" clickable";
      if(k===tk) cls+=" today";
      if(inP&&k>tk) cls+=" future";
      var amt="", ttl="";
      var live=afterClear(k), r0=R[k];
      if(inP&&live&&k<=tk){
        var v=dayValue(k,now);
        if(v>0||k===tk) amt=money(v);
        if(r0&&r0.type){
          ttl={off:"休",paid:"带薪",sick:"病假",p80:"80%",ot:"加班"}[r0.type]||"";
          if(r0.type==="ot"&&r0.mul) ttl="加班"+r0.mul+"x";
        }
      }
      var tag=HOLIDAYS[k]?"休":(MAKEUP[k]?"班":"");
      var fes=FESTIVAL[k]||"";
      html+='<div class="'+cls+'" data-k="'+k+'"><div class="n">'+d.getDate()+'</div>'+
        (tag?'<div class="tg'+(tag==='班'?' ban':'')+'">'+tag+'</div>':'')+
        (fes?'<div class="fes">'+fes+'</div>':'')+
        (ttl?'<div class="typ">'+ttl+'</div>':'')+
        (amt?'<div class="e">'+amt+'</div>':'')+'</div>';
    });
    html+='</div>';
    wrap.innerHTML=html;

    var t=document.getElementById("calTitle");
    if(t){
      var passed=periodKeys(now).filter(function(k){return k<=tk;}).length;
      var workDays=periodKeys(now).filter(function(k){return isWorkday(k);}).length;
      t.textContent=dateKey(pr.start).slice(5)+" → "+dateKey(new Date(pr.end.getTime()-86400000)).slice(5)+
        "（"+dateKey(new Date(pr.end.getTime()-86400000)).slice(5)+" 发薪）· 已过 "+passed+"/"+periodKeys(now).length+
        " 天 · 工作日 "+workDays+" 天"+(pr.end.getFullYear()>=2027?" · 2027 假期未公布":"")
    }
  }

  /* ============ 动作 ============ */
  function setErr(msg){
    var b=document.getElementById("errBar"); if(!b) return;
    if(msg){ b.style.display="block"; b.textContent=msg; }
    else { b.style.display="none"; b.textContent=""; }
  }
  function startTimer(){
    if(started()||ended()) return;
    if(!(monthlyPay()>0)||!(paidHours()>0)){
      setErr("先填月薪和上下班时间，再点「开始上班」。");
      openSetup();
      return;
    }
    setErr("");
    var base=atTime(new Date(),S.workStart).getTime();
    R[todayKey()]={startMs:base,endMs:null,pauses:[],pauseStartMs:null,earnedMs:0,earned:0,rate:todayRate()};
    saveRecords(); render(); renderTables(); renderCalendar(); startFast();
  }
  function stopToday(){
    if(!started()) return;
    if(!confirm("确认下班存档？存档后今天的计时会停止，之后可以点「继续计时」恢复。")) return;
    var k=todayKey(), r=todayRec(), now=Date.now();
    var r0=r.rate||todayRate();
    if(r.pauseStartMs){ r.pauses.push({s:r.pauseStartMs,e:now}); r.pauseStartMs=null; }
    r.earnedMs=workMsOf(k,now);
    r.rate=r0;
    r.earned=earnFrom(r.earnedMs,r0);
    r.endMs=now;
    saveRecords(); stopFast(); render(); renderTables(); renderCalendar();
  }
  function restartToday(){
    var k=todayKey();
    if(!confirm("继续计时？会按「上班时间」重新算今天已挣的钱，之前那次存档被覆盖。")) return;
    delete R[k]; saveRecords();
    startTimer();
  }

  /* ============ 定时器 ============ */
  var tickN=0, tickMs=0;
  function startFast(){
    stopFast();
    fastTimer=setInterval(function(){
      if(!started()) return;
      render();
      var k=todayKey(), r=R[k], ms=workMsOf(k,Date.now());
      r.earnedMs=ms; r.earned=earnFrom(ms,r.rate||todayRate());
      if((++tickN*tickMs)>=2000){ tickN=0; saveRecords(); }
    }, (tickMs=(S.freq||100)) && (S.freq||100));
  }
  function stopFast(){ if(fastTimer){clearInterval(fastTimer);fastTimer=null;} }

  function startUi(){
    if(uiTimer) clearInterval(uiTimer);
    uiTimer=setInterval(function(){
      var tk=todayKey();
      if(tk!==curDay){ curDay=tk; finalizeStale(); render(); renderTables(); renderCalendar(); return; }
      render();
      if(started()) renderTables();
    },1000);
  }

  /* ============ 设置 ============ */
  function updateFormula(){
    var h=hourly(), d=h*paidHours();
    document.getElementById("formula").innerHTML=
      "算法：按"+modeLabel()+" <b>"+money(S.salary)+"</b>"+
      (S.mode==="year"?" ÷ "+(S.months||12)+" 个月":"")+" → 月均 <b>"+money(monthlyPay())+"</b> ÷ "+S.days+" 天 ÷ "+paidHours()+" 小时 = 时薪 <b>"+money(h)+"</b>；"+
      "日薪 <b>"+money(d)+"</b>；每分钟 <b>"+money(h/60)+"</b>；每秒 <b>"+money(h/3600)+"</b>"+
      (mul()>1?"（今日按 "+mul()+" 倍计）":"")+
      (monthlyPay()>0?"":"　<b>← 还没填工资</b>");
  }
  function setVal(id,v){var e=document.getElementById(id); if(e) e.value=v;}
  function getVal(id,d){var e=document.getElementById(id); if(!e) return d; return e.value!==""?e.value:d;}
  function fillForm(){
    setVal("iSalary",S.salary||"");
    setVal("iMode",S.mode||"month");
    setVal("iMonths",String(S.months||12));
    setVal("iDays",S.days);
    setVal("iHours",paidHours()+" 小时");
    setVal("iStart",S.workStart);
    setVal("iEnd",S.workEnd);
    setVal("iBS",S.breakStart);
    setVal("iBE",S.breakEnd);
    setVal("iMul",String(mul()));
    setVal("iFreq",String(S.freq||100));
    setVal("iPayDay",S.payDay||15);
    setVal("iRest",S.restMode||"double");
    setVal("iRemind",(S.remind!==false)?"1":"0");
    updateFormula();
  }
  function readForm(){
    S.salary=parseFloat(getVal("iSalary",""))||0;
    S.mode=getVal("iMode","month");
    S.months=parseFloat(getVal("iMonths","12"))||12;
    S.days=parseFloat(getVal("iDays",""))||21.75;
    S.workStart=getVal("iStart","09:00");
    S.workEnd=getVal("iEnd","18:00");
    S.breakStart=getVal("iBS","12:00");
    S.breakEnd=getVal("iBE","13:00");
    S.mul=parseFloat(getVal("iMul","1"))||1;
    S.freq=parseInt(getVal("iFreq","100"),10)||100;
    S.payDay=Math.min(31,Math.max(1,parseInt(getVal("iPayDay","15"),10)||15));
    S.restMode=getVal("iRest","double");
    S.remind=getVal("iRemind","1")!=="0";
    S.hours=paidHours();
  }

  function download(text,name){
    var blob=new Blob([text],{type:"text/csv;charset=utf-8"});
    var a=document.createElement("a");
    a.href=URL.createObjectURL(blob);a.download=name;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
  }
  function csvOf(keys,filename){
    var tk=todayKey();
    var head=["日期","状态","工时(小时)","时薪(元)","收入(元)"];
    var lines=keys.sort().map(function(k){
      var r=R[k]||{}, ms,amt,rate,st;
      if(k===tk&&!(r.manual&&!r.startMs)&&!r.endMs){ ms=workMsOf(k,Date.now()); rate=r.rate||todayRate(); amt=amountOf(k,Date.now()); st="进行中"; }
      else if(r.manual&&!r.startMs){ ms=r.earnedMs||0; rate=r.rate||todayRate(); amt=r.earned||0; st="补录"; }
      else { ms=r.earnedMs||0; rate=r.rate||todayRate(); amt=r.earned||0; st=r.auto?"自动收尾":"已存档"; }
      return [k,st,(ms/3600000).toFixed(2),rate.toFixed(2),amt.toFixed(2)].join(",");
    });
    download("\uFEFF"+head.join(",")+"\n"+lines.join("\n"),filename);
  }

  /* ============ 事件绑定 ============ */
  (function(){
    var b=document.getElementById("btnMini");
    if(b) b.addEventListener("click",function(){
      try{ window.open(location.pathname+"?mini=1","niuma_mini","width=430,height=380,menubar=no,toolbar=no"); }catch(e){}
    });
  })();
  (function(){
    var form=document.getElementById("goalForm");
    var sv=document.getElementById("gSave");
    if(sv) sv.addEventListener("click",function(){
      var name=(document.getElementById("gName").value||"目标").trim();
      var amt=Math.max(0,parseFloat(document.getElementById("gAmount").value)||0);
      var base=Math.max(0,parseFloat(document.getElementById("gBase").value)||0);
      var from=document.getElementById("gFrom").value||todayKey();
      if(!amt){ alert("请填目标金额"); return; }
      GOALS.push({id:"g"+GOALS.length+"_"+Date.now(),name:name,amount:amt,base:base,from:from}); saveGoals();
      form.style.display="none";
      document.getElementById("gName").value=""; document.getElementById("gAmount").value=""; document.getElementById("gBase").value="";
      render();
    });
    var cn=document.getElementById("gCancel");
    if(cn) cn.addEventListener("click",function(){ form.style.display="none"; });
    var list=document.getElementById("goalList");
    if(list) list.addEventListener("click",function(e){
      var ed=e.target.closest?e.target.closest("[data-edit]"):null;
      if(ed){
        var gid=ed.getAttribute("data-edit"), g0=null;
        GOALS.forEach(function(g){ if(g.id===gid) g0=g; });
        if(!g0) return;
        var v=prompt("把「"+g0.name+"」的目标金额改成多少？（元）", String(g0.amount||0));
        if(v==null) return;
        var n=Math.max(0,parseFloat(v)||0); if(!n){ alert("金额要大于 0"); return; }
        g0.amount=n; saveGoals(); render(); return;
      }
      var b=e.target.closest?e.target.closest("[data-gid]"):null; if(!b) return;
      var id=b.getAttribute("data-gid");
      GOALS=GOALS.filter(function(g){return g.id!==id;}); saveGoals(); render();
    });
  })();
  document.getElementById("btnStart").addEventListener("click",startTimer);
  document.getElementById("btnStop").addEventListener("click",stopToday);
  document.getElementById("btnRestart").addEventListener("click",restartToday);

  /* v28 三个可点数字 → 口径抽屉（再点同一个 / 点遮罩 / 关闭按钮 / Esc 都可关） */
  (function(){
    function bind(id,kind){
      var el=document.getElementById(id); if(!el||!el.addEventListener) return;
      el.addEventListener("click",function(){ toggleSheet(kind); });
      el.addEventListener("keydown",function(e){
        if(e.code==="Enter"){ if(e.preventDefault) e.preventDefault(); toggleSheet(kind); }
      });
    }
    bind("hitToday","today"); bind("chipRate","rate"); bind("chipMonth","period");
    var c=document.getElementById("sheetClose"); if(c&&c.addEventListener) c.addEventListener("click",closeSheet);
    var m=document.getElementById("sheetMask"); if(m&&m.addEventListener) m.addEventListener("click",closeSheet);
  })();

  document.getElementById("btnTheme").addEventListener("click",function(){
    S.theme=(S.theme==="dark")?"light":"dark"; saveSettings(); applyTheme();
  });
  /* v26.01 小窗：?mini=1 时进入紧凑版，并给「回大窗」出口 */
  (function(){
    var isMini=false;
    try{ isMini=/(?:^|[?&])mini=1(?:&|$)/.test(String(location.search||"")); }catch(e){ isMini=false; }
    if(isMini && document.body && document.body.classList){ document.body.classList.add("mini"); }
    var b=document.getElementById("btnBig");
    if(b) b.addEventListener("click",function(){
      try{ window.close(); }catch(e){}
      try{ location.href=location.pathname; }catch(e){}
    });
  })();
  document.getElementById("btnActSave").addEventListener("click",saveActualFromForm);
  document.getElementById("btnActCancel").addEventListener("click",closeActual);
  document.getElementById("btnActDone").addEventListener("click",closeActual);
  document.getElementById("btnActHistBack").addEventListener("click",function(){ setActView("actFormView"); });
  document.getElementById("btnActHistFromResult").addEventListener("click",showActualHistory);
  document.getElementById("btnBackup").addEventListener("click",function(){
    var obj={app:"牛马计时器",ver:"v21",at:new Date().toISOString(),settings:S,records:R,goals:GOALS,meta:META};
    var blob=new Blob([JSON.stringify(obj,null,2)],{type:"application/json"});
    var a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download="牛马计时器_备份_"+dateKey(new Date())+".json"; a.click();
  });
  document.getElementById("btnRestore").addEventListener("click",function(){
    var txt=prompt("把备份文件的全部内容粘贴到这里：");
    if(!txt) return;
    try{
      var o=JSON.parse(txt);
      if(!o||typeof o!=="object") throw new Error("不是 JSON 对象");
      if(o.settings) { S=Object.assign({},DEFAULT,o.settings); saveSettings(); }
      if(o.records && typeof o.records==="object"){ R=o.records; saveRecords(); }
      if(Array.isArray(o.goals)){ GOALS=o.goals; saveGoals(); }
      if(o.meta && typeof o.meta==="object"){ META=o.meta; saveMeta(); }
      fillForm(); render(); renderCalendar();
      alert("导入成功：设置 + "+Object.keys(R).length+" 天记录 + "+GOALS.length+" 个目标");
    }catch(e){ alert("导入失败："+e.message); }
  });
  document.getElementById("btnSave").addEventListener("click",function(){
    readForm(); saveSettings(); syncPhase(); document.getElementById("box").open=false;
    setErr("");
    render(); renderTables(); renderCalendar(); startFast(); updateFormula();
  });

  function addForDate(seed){
    var k=seed; if(!k) return;
    var tk=todayKey();
    if(k>tk) return;
    if(k===tk){ alert("今天是实时计时，点「下班存档」就行"); return; }
    var pr=periodRange(Date.now()), dt=dateOfKey(k);
    if(dt<pr.start||dt>=pr.end) return;
    if(HOLIDAYS[k]) return;            // 法定假日不可点
    if(!baseWorkday(k)) return;        // 普通周末/休息日不可点；调休补班日可点
    var off=!!(R[k]&&R[k].off);
    R[k]=R[k]||{};
    if(off){ delete R[k].off; if(!Object.keys(R[k]).length) delete R[k]; }
    else { R[k].off=true; }
    saveRecords(); render(); renderCalendar();
  }
  document.getElementById("btnAdd").addEventListener("click",function(){
    var d=prompt("要标记/取消哪一天？（格式 2026-11-02）",todayKey());
    if(d) addForDate(d);
  });
  var menuDay=null;
  function openDayMenu(k,x,y){
    menuDay=k;
    var m=document.getElementById("dayMenu"); if(!m) return;
    m.style.display="block";
    m.style.left=Math.max(8,Math.min(window.innerWidth-180,x-70))+"px";
    m.style.top=(y+6)+"px";
    document.getElementById("dayMenuTitle").textContent=k;
  }
  function closeDayMenu(){ var m=document.getElementById("dayMenu"); if(m) m.style.display="none"; menuDay=null; }
  function setDayType(t,mul){
    var k=menuDay; if(!k) return;
    var r=R[k]||{};
    if(!t){ delete r.type; delete r.mul; if(!Object.keys(r).length) delete R[k]; else R[k]=r; }
    else { r.type=t; if(mul) r.mul=mul; R[k]=r; }
    saveRecords(); closeDayMenu(); render(); renderCalendar();
  }
  document.getElementById("calWrap").addEventListener("click",function(e){
    var n=e.target; while(n&&n!==this&&!(n.getAttribute&&n.getAttribute("data-k"))) n=n.parentNode;
    var k=n&&n.getAttribute&&n.getAttribute("data-k"); if(!k) return;
    var tk=todayKey();
    if(k>tk) return;
    var pr=periodRange(Date.now()), dt=dateOfKey(k);
    if(dt<pr.start||dt>=pr.end) return;
    if(HOLIDAYS[k]) return;
    if(!baseWorkday(k)&&!(R[k]&&R[k].type)) return;
    openDayMenu(k, e.clientX||0, e.clientY||0);
  });
  document.getElementById("dayMenu").addEventListener("click",function(e){
    var b=e.target.closest?e.target.closest("[data-t]"):null; if(!b) return;
    var t=b.getAttribute("data-t"), mul=parseFloat(b.getAttribute("data-m")||"0")||0;
    setDayType(t==="normal"?"":t, mul);
  });
  document.addEventListener("click",function(e){
    var m=document.getElementById("dayMenu");
    if(m&&m.style.display==="block"&&!m.contains(e.target)&&!(e.target.closest&&e.target.closest("#calWrap"))) closeDayMenu();
  },true);

  document.getElementById("btnExport").addEventListener("click",function(){
    var now=Date.now(), pr=periodRange(now), tk=todayKey(), pay=dayPayNow();
    var rows=[["日期","是否上班","当天收入"]], sum=0;
    periodKeys(now).forEach(function(k){
      if(k>tk) return;
      var w=isWorkday(k), amt=0;
      if(!afterClear(k)){ rows.push([k,"休息","0.00"]); return; }
      if(w) amt=(k===tk)?amountOf(k,now):((R[k]&&R[k].earned>0)?R[k].earned:pay);
      sum+=amt;
      rows.push([k,w?"上班":"休息",amt.toFixed(2)]);
    });
    rows.push(["合计","",sum.toFixed(2)]);
    var NL=String.fromCharCode(13,10), BOM=String.fromCharCode(0xFEFF);
    var csv=rows.map(function(r){return r.join(",");}).join(NL);
    var blob=new Blob([BOM+csv],{type:"text/csv;charset=utf-8"});
    var a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download="工时收入_"+dateKey(pr.start)+"_至_"+dateKey(new Date(pr.end.getTime()-86400000))+".csv";
    a.click();
  });
  document.getElementById("btnExportAll").addEventListener("click",function(){
    var keys=Object.keys(R);
    if(!keys.length){alert("还没有记录");return;}
    csvOf(keys,"工时收入_全部.csv");
  });
  document.getElementById("btnDefault").addEventListener("click",function(){
    if(!confirm("把所有设置恢复成默认值？(不会删记录)")) return;
    S=Object.assign({},DEFAULT); saveSettings(); fillForm(); render(); renderTables();
  });
  document.getElementById("btnClear").addEventListener("click",function(){
    if(!confirm("确定清空全部记录？不可恢复。"))return;
    if(!confirm("再确认一次：真的要删掉所有工时收入数据？"))return;
    if(!confirm("确认清空全部数据？所有存档和标记都会删除，且无法恢复。")) return;
    META={clearedAt:todayKey()}; saveMeta(); R={}; saveRecords(); stopFast(); render(); renderTables(); renderCalendar();
  });

  document.addEventListener("keydown",function(e){
    if(e.code==="Escape"){ if(sheetOpen()) closeSheet(); return; }
    var t=e.target&&e.target.tagName;
    if(t==="INPUT"||t==="SELECT"||t==="TEXTAREA"||t==="BUTTON") return;
    if(e.code==="Space"){
      e.preventDefault();
      if(!started()&&!ended()) startTimer();
    }
  });

  function openSetup(){
    document.getElementById("mSalary").value=S.salary||"";
    var mm=document.getElementById("mMode"); if(mm) mm.value=S.mode||"month";
    document.getElementById("mDays").value=S.days;
    document.getElementById("mStart").value=S.workStart;
    document.getElementById("mEnd").value=S.workEnd;
    document.getElementById("mBS").value=S.breakStart;
    document.getElementById("mBE").value=S.breakEnd;
    document.getElementById("setupModal").classList.add("show");
    }
  document.getElementById("mSave").addEventListener("click",function(){
    S.salary=parseFloat(document.getElementById("mSalary").value)||0;
    if(document.getElementById("mMode")) S.mode=document.getElementById("mMode").value||"month";
    S.days=parseFloat(document.getElementById("mDays").value)||21.75;
    S.workStart=document.getElementById("mStart").value||"09:00";
    S.workEnd=document.getElementById("mEnd").value||"18:00";
    S.breakStart=document.getElementById("mBS").value||"12:00";
    S.breakEnd=document.getElementById("mBE").value||"13:00";
    S.hours=paidHours(); saveSettings(); syncPhase();
    setErr("");
    document.getElementById("setupModal").classList.remove("show");
    ensurePhase(); fillForm(); render(); renderTables(); renderCalendar();
  });
  document.getElementById("mSkip").addEventListener("click",function(){
    saveSettings();
    document.getElementById("setupModal").classList.remove("show");
    fillForm(); render(); renderTables();
    if(!(monthlyPay()>0)) setErr("还没设置工资，点「开始上班」会被拦下；点「设置」填入月薪即可开始。");
  });

  /* ============ 启动 ============ */
  window.onerror=function(msg,src,line){
    var b=document.getElementById("errBar");
    if(b){b.style.display="block";b.textContent="页面出错（把这段话发给我）："+msg+" @"+line;}
    return false;
  };
  finalizeStale();
  loadMeta(); fillForm(); ensurePhase(); render(); renderTables(); renderCalendar(); startUi();
  if(started()) startFast();
  if(!(monthlyPay()>0)) openSetup();

  /* IDB 异步水合：IDB 里比本地缓存新时，用 IDB 的数据覆盖内存并重绘 */
  try{
    IDB.load().then(function(snap){
      if(snap && snap.at>IDB.lsAt()){
        if(IDB.hydrate(snap)){
          try{
            localStorage.setItem(LS_SET,JSON.stringify(S));
            localStorage.setItem(LS_REC,JSON.stringify(R));
            localStorage.setItem(LS_GOALS,JSON.stringify(GOALS));
            localStorage.setItem(LS_ACT,JSON.stringify(ACTUALS));
            localStorage.setItem(LS_PHASES,JSON.stringify(PHASES));
            localStorage.setItem(LS_AT,String(snap.at));
          }catch(e){}
          fillForm(); render(); renderTables(); renderCalendar();
          if(started()) startFast();
          try{ document.getElementById("setupModal").classList.remove("show"); }catch(e){}
          try{ document.documentElement.setAttribute("data-store","idb"); }catch(e){}
        }
      }else if(!snap){
        IDB.persist();
        try{ document.documentElement.setAttribute("data-store","idb"); }catch(e){}
      }
    }).catch(function(){});
  }catch(e){}
})();
