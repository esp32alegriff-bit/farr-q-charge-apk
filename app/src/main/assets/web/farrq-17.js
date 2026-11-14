/* FARR Q Charge Ver_FarrQ_1.7 layer.
   Adds the EV meter, relays, AUTO, calibration, alerts, demo meter and diagnostics
   on top of the unchanged 1.6 screens. Talks to the Android side through window.FarrNative.
   Loaded BEFORE the main app script, so it must not read app variables (S, E, ...) at load time. */
(function(){
'use strict';
const N=window.FarrNative||null;
window.FARR_VER='Ver_FarrQ_2.2.8.5_B';
window.FARR_APP_URL='https://github.com/esp32alegriff-bit/farr-q-charge-apk/releases/latest';

/* ---------- bridge ---------- */
let cbId=0; const pend={};
window.__farrCb=function(id,ok,txt){
  const p=pend[id]; if(!p)return; delete pend[id];
  let v=null; try{v=JSON.parse(txt);}catch(e){v={error:String(txt)};}
  if(ok)p.res(v); else p.rej(new Error((v&&v.error)||'Failed'));
};
function call(m,a){
  if(!N)return Promise.reject(new Error('Only works inside the Android app'));
  return new Promise((res,rej)=>{const id=++cbId;pend[id]={res,rej};N.call(id,m,JSON.stringify(a||{}));});
}
function sync(m,a){
  if(!N)return null;
  try{return JSON.parse(N.sync(m,JSON.stringify(a||{})));}catch(e){return null;}
}
window.farrCall=call; window.farrSync=sync;

/* ---------- sharing inside the APK (Android WebView has no Web Share) ---------- */
async function blobToB64(b){
  const u=new Uint8Array(await b.arrayBuffer()); let s='';
  for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));
  return btoa(s);
}
if(N){
  try{
    navigator.canShare=function(d){return !!(d&&((d.files&&d.files.length)||d.text||d.url));};
    navigator.share=async function(d){
      d=d||{};
      if(d.files&&d.files.length){
        const f=d.files[0];
        N.shareFile(await blobToB64(f),f.name||'file',f.type||'application/octet-stream',d.title||'');
      }else{
        const t=[d.text||'',d.url||''].filter(Boolean).join('\n');
        N.shareText(t,d.title||'');
      }
    };
  }catch(e){}
}

/* ---------- helpers ---------- */
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const R=(a,b)=>`<div class="row"><span>${a}</span><b style="text-align:right">${b}</b></div>`;
const n2=(v,d)=>v==null||isNaN(v)?'--':Number(v).toFixed(d);
const tstamp=ts=>ts?new Date(ts).toLocaleString('en-ZA',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'--';
const dur=s=>{s=Math.max(0,Math.round(s||0));const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?h+' h '+m+' min':m+' min';};
const ago=ts=>{if(!ts)return 'never';const s=(Date.now()-ts)/1000;return s<90?Math.round(s)+' s ago':s<5400?Math.round(s/60)+' min ago':s<172800?Math.round(s/3600)+' h ago':Math.round(s/86400)+' days ago';};
const rate=()=>{try{return S.rateHome;}catch(e){return 3.88;}};
const say=m=>{try{toast(m);}catch(e){}};
function b64e(o){return btoa(unescape(encodeURIComponent(JSON.stringify(o))));}
function b64d(t){return JSON.parse(decodeURIComponent(escape(atob(t))));}

/* ---------- 1.8: plain in-app dialogs (replace the browser boxes that showed the web address) ---------- */
let dlgClose=null;
const DLG_CSS=`
#fdlg{position:fixed;inset:0;background:rgba(4,7,12,.72);display:none;align-items:center;justify-content:center;padding:20px;z-index:50}
#fdlg.on{display:flex}
#fdlg .box{width:100%;max-width:420px;background:var(--panel);border:1px solid var(--line);border-top-width:5px;border-radius:16px;padding:20px 20px 18px;box-shadow:0 12px 40px rgba(0,0,0,.55)}
#fdlg .ttl{font-size:21px;font-weight:800;letter-spacing:.2px;color:var(--text);margin-bottom:10px;line-height:1.25}
#fdlg .txt{font-size:15px;line-height:1.5;color:var(--muted);margin-bottom:20px}
#fdlg .acts{display:flex;gap:10px}
#fdlg .acts button{flex:1;padding:14px 10px;border-radius:12px;border:0;font-size:16px;font-weight:700;font-family:inherit;cursor:pointer}
#fdlg .cancel{background:transparent;border:1px solid var(--line);color:var(--text)}
#fdlg .ok-red{background:var(--red);color:#fff}
#fdlg .ok-green{background:var(--green);color:#052e1c}
#fdlg .ok-cyan{background:var(--cyan);color:#06222a}
.btn.r-on{background:var(--green);border-color:var(--green);color:#052e1c;font-weight:700}
.btn.r-off{background:var(--red);border-color:var(--red);color:#fff;font-weight:700}
`;
(function(){const s=document.createElement('style');s.textContent=DLG_CSS;document.head.appendChild(s);})();
function askUser(o){
  return new Promise(res=>{
    const tone=o.tone||'red', col={red:'var(--red)',green:'var(--green)',cyan:'var(--cyan)'}[tone];
    const w=document.createElement('div'); w.id='fdlg';
    w.innerHTML=`<div class="box" role="dialog" aria-modal="true" style="border-top-color:${col}"><div class="ttl">${esc(o.title)}</div><div class="txt">${esc(o.text)}</div><div class="acts"><button class="cancel">Cancel</button><button class="ok-${tone}">${esc(o.ok)}</button></div></div>`;
    document.body.appendChild(w);
    const kd=e=>{if(e.key==='Escape')done(false);};
    function done(v){
      if(!dlgClose)return;
      dlgClose=null; document.removeEventListener('keydown',kd); w.remove(); res(v);
    }
    dlgClose=done;
    w.querySelector('.cancel').onclick=()=>done(false);
    w.querySelector('.ok-'+tone).onclick=()=>done(true);
    w.onclick=e=>{if(e.target===w)done(false);};
    document.addEventListener('keydown',kd);
    w.classList.add('on');
    w.querySelector('.cancel').focus();
  });
}

/* ---------- measured sessions (from the meter, kept on this phone) ---------- */
let MS=[], MSdemo=[];
function loadMS(){const s=sync('sessions');MS=(s&&s.sessions)||[];MSdemo=(s&&s.demo)||[];}
loadMS();
window.measuredBetween=function(a,b){
  let k=0,n=0;
  for(const x of MS){if(x.end_ms>a&&x.end_ms<=b){k+=+x.kwh||0;n++;}}
  if(n)return {kwh:k,count:n};
  /* 2.2.8.5_A: the charge log was typed while a Shelly charge was still running. That charge is measured, so it is never estimated from battery %.
     If the next log entry is a Home charge log after the charge ended, that entry already carries the kWh, so this one carries 0. */
  try{
    const run=MS.find(x=>!x.demo&&(+x.kwh||0)>=0.1&&(+x.start_ms||+x.end_ms)<=b&&+x.end_ms>b);
    if(run){
      const nx=(typeof E!=='undefined'&&E?E:[]).filter(e=>e&&!e.auto&&e.ts>b).sort((p,q)=>p.ts-q.ts)[0];
      return nx&&nx.kind==='charge'&&nx.where!=='Station'&&nx.ts>=+run.end_ms?{kwh:0,count:0,during:true}:{kwh:+run.kwh,count:1,during:true};
    }
  }catch(e){}
  return null;
};

/* ---------- backup rows (same 8 columns as 1.6, so 1.6 simply skips them) ---------- */
window.farrBackupExtra=function(){
  if(!N)return [];
  const out=[], row=(ts,kind,payload)=>{const d=new Date(ts);out.push([d.toLocaleDateString('en-ZA'),d.toLocaleTimeString('en-ZA'),kind,'','',b64e(payload),'',ts].join(','));};
  MS.forEach(x=>row(x.start_ms||x.end_ms,'meter',x));
  try{if(window.farr22)farr22.backupRows().forEach(r=>row(r.ts,r.kind,r.obj));}catch(e){}
  const a=sync('alerts'); ((a&&a.alerts)||[]).filter(x=>!x.demo).slice(0,300).forEach(x=>row(x.ts,'alert',x));
  const c=sync('config'); if(c){const k=Object.assign({},c);delete k.relayToken;delete k.mqttPass;delete k.demo;delete k.remoteUrl;delete k.remoteToken;delete k.remoteName;delete k.remoteLastOk;delete k.remoteLastMsg;row(Date.now(),'settings17',k);}
  return out;
};
window.farrImportExtra=function(c){
  const kind=c[2];
  if(kind==='pctread'||kind==='fsettings'){
    try{window.__fsetTs=parseFloat(c[7])||0;if(window.farr22)farr22.importRow(kind,b64d(c[5]));if(kind==='fsettings'&&window.__fsetChanged){window.__fsetChanged=false;try{save();}catch(e){}}}catch(e){}
    return true;
  }
  if(kind!=='meter'&&kind!=='alert'&&kind!=='settings17')return false;
  try{sync('importExtra',{kind,obj:b64d(c[5])});}catch(e){}
  if(kind==='meter')loadMS();
  return true;
};
window.farrImportText=function(text){
  try{const n=mergeCSV(String(text||''));save();renderAll();say('Imported '+n+' new entries');if(E.length)go('home');}
  catch(e){say('That is not a FARR Q backup');}
};

/* ---------- Android back button ---------- */
window.farrBack=function(){
  if(dlgClose){dlgClose(false);return true;}
  const on=document.querySelector('.screen.on'); const id=on?on.id.slice(2):'home';
  if(id==='home')return false;
  if(['meter','relay','relayinfo','alerts','conn','info','learn'].includes(id))go('set');
  else if(id==='set')go('graph');
  else go('home');
  return true;
};

/* ---------- live polling, only while a meter screen is on show ---------- */
let LIVE=null, screen='home', timer=null, inflight=false, relayTimer=null, RELAY=null;
function period(){return screen==='meter'?1000:(screen==='home'||screen==='relay')?2000:0;}
function schedule(){
  clearTimeout(timer);
  const p=period();
  if(!p||document.visibilityState!=='visible')return;
  timer=setTimeout(tick,p);
}
async function tick(){
  if(inflight){schedule();return;}
  inflight=true;
  try{LIVE=await call('live');}catch(e){LIVE={online:false,error:e.message};}
  inflight=false;
  if(LIVE&&LIVE.sessionsCount!=null&&LIVE.sessionsCount!==MS.length){loadMS();try{renderHome();}catch(e){}try{rmSoon(4000);}catch(e){}}
  paintLive();
  schedule();
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){tick();relayLoop();}else{clearTimeout(timer);clearTimeout(relayTimer);}});

function statusText(L){
  if(!L)return 'Checking…';
  if(L.demo)return 'DEMO';
  if(!L.online)return L.everSeen?'Offline':'Not found';
  return L.live&&L.live.charging?'Charging':'Idle';
}
function paintLive(){
  try{if(window.farr22)window.farr22.onLive(LIVE);}catch(e){}
  if(screen==='home')paintHomeCard();
  if(screen==='meter')paintMeter();
  if(screen==='relay')paintRelayAuto();
  if(screen==='home')paintRelayAuto();
  if(screen==='info'){const el=$('infoBody');if(el)el.innerHTML=infoHTML();}
}

/* ---------- Home card ---------- */
/* 2.2.4/2.2.5: shown only when this phone cannot reach the meter (away from home). The phone at home copies the reading to the Sheet
   about every 5 minutes while charging (every 30 minutes otherwise), so it is labelled with that time and is not a live reading. */
/* 2.2.6: extra rows for the block above, built only from data this phone already has (the log entries and the finished charges copied from the Sheet).
   Nothing new is asked from the Sheet and nothing new is sent, so a phone on 2.2.5 is not affected. */
/* 2.2.7: battery % and time left, worked out the same way as the dot matrix display (same pack size 42.7 kWh, same 10% loss, whole % cut off, minutes at the present power).
   The start is the last logged battery %. The energy since then is the finished charges after it plus the running charge. The running charge is the block's
   day total minus the finished charges of that day (the day total is built the same way on the phone at home). */
const DISP_PACK=42.7, DISP_LOSS=0.10;
function remoteEstCalc(r,last){
  try{
    if(!r||!(r.at>0)||!last||!(last.ts>0)||last.ts>r.at)return null;
    const d=new Date(r.at);d.setHours(0,0,0,0);const dayMs=d.getTime();
    let since=0,doneToday=0;
    for(const s of (typeof MS!=='undefined'&&MS.length?MS:[])){
      const st=+s.start_ms||+s.end_ms,en=+s.end_ms,k=+s.kwh;
      if(!(en>0&&k>0))continue;
      if(en>=dayMs&&en<=r.at+60000)doneToday+=k;
      if(en>last.ts&&en<=r.at+60000){const span=en-st;since+=span>0?k*Math.min(1,(en-Math.max(st,last.ts))/span):k;}
    }
    if(r.charging)since+=Math.max(0,(+r.today||0)-doneToday);
    if(!(since>=0.05)||isNaN(+last.pct))return null;
    const p=Math.min(100,+last.pct+since*(1-DISP_LOSS)/DISP_PACK*100);
    let min=null;
    if(r.charging&&+r.watts>=500)min=p>=100?0:Math.min(5999,Math.round((100-p)/100*DISP_PACK/((+r.watts)/1000*(1-DISP_LOSS))*60));
    return {p,min};
  }catch(e){return null;}
}
function remoteEstRow(r,last){
  try{
    const c=remoteEstCalc(r,last);if(!c)return '';
    let h=R('Battery then (estimated)','≈ '+Math.floor(c.p)+'%');
    if(c.min!=null)h+=R('Time left then (estimated)',c.p>=100?'About full':(c.min>=60?Math.floor(c.min/60)+' h '+(c.min%60)+' min':c.min+' min'));
    return h;
  }catch(e){return '';}
}
/* 2.2.8.1: km driven since the last charge = latest odometer minus the odometer at the latest charge entry. Read from this phone's own log only. */
/* 2.2.8.3: Home charging this calendar month, counted by WHEN THE ENERGY WAS CHARGED, not by the date a charge was logged.
   Measured = the meter's finished sessions (the part of a session that falls inside the month) plus the charge running at the time of the copy.
   Estimated = Home/Solar charge log rows with no meter session behind them, from battery %. Station left out. */
function runningKwh(r){
  try{
    if(!r||!r.charging)return 0;
    const d=new Date(r.at);d.setHours(0,0,0,0);const dayMs=d.getTime();let done=0;
    for(const s of (typeof MS!=='undefined'&&MS.length?MS:[])){const en=+s.end_ms,k=+s.kwh;if(en>=dayMs&&en<=r.at+60000&&k>0)done+=k;}
    return Math.max(0,(+r.today||0)-done);
  }catch(e){return 0;}
}
function monthSessions(from){
  const out=[];
  for(const s of (typeof MS!=='undefined'&&MS.length?MS:[])){
    const en=+s.end_ms,k=+s.kwh,st=+s.start_ms||en;
    if(!(en>0&&k>0)||en<from)continue;
    const frac=st>=from||en<=st?1:(en-from)/(en-st);
    const cost=(s.cost!=null&&s.cost!==''&&isFinite(+s.cost))?+s.cost:(+s.kwh)*rate();
    out.push({st,en,kwh:k*frac,cost:cost*frac});
  }
  return out.sort((a,b)=>a.st-b.st);
}
function homeMonthStats(now,r){
  const d=new Date(now||Date.now()), from=new Date(d.getFullYear(),d.getMonth(),1).getTime();
  const a={kwh:0,cost:0,mKwh:0,mCost:0,eKwh:0,eCost:0,n:0,sessions:0,pauses:0,running:0,from};
  const ss=monthSessions(from);
  ss.forEach(x=>{a.mKwh+=x.kwh;a.mCost+=x.cost;});
  a.sessions=ss.length;
  for(let i=1;i<ss.length;i++){const gap=ss[i].st-ss[i-1].en;if(gap>=0&&gap<=10*60000)a.pauses++;}
  if(r&&r.charging&&r.at>=from){const k=runningKwh(r);if(k>0){a.running=k;a.mKwh+=k;a.mCost+=k*rate();a.sessions++;}}
  derive().filter(x=>x.type==='charge'&&x.where!=='Station'&&!x.measured&&!x.auto&&x.ts>=from&&isFinite(+x.wall)).forEach(x=>{a.eKwh+=+x.wall||0;a.eCost+=+x.cost||0;a.n++;});
  a.kwh=a.mKwh+a.eKwh;a.cost=a.mCost+a.eCost;a.n+=a.sessions;
  return a;
}
const hmClock=ts=>new Date(ts).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'});
const hmDur=m0=>{const min=Math.max(0,Math.round(+m0||0));return min>=60?Math.floor(min/60)+' h '+(min%60)+' min':min+' min';};
const hmRand=v=>'R'+n2(v,2);
function hmHead(t,sub){return `<div class="label" style="margin:16px 0 4px;padding-top:10px;border-top:2px solid var(--line,#8884)">${esc(t)}</div>`+(sub?`<div class="small" style="margin:0 0 4px">${esc(sub)}</div>`:'');}
/* 2.2.8.3: the five groups under the EV meter block. Everything is worked out on this phone from the block, the log and the meter sessions already copied. Nothing is sent. */
function homeSummaryGroups(r){
  /* 2.2.8.5_B: plain words, each fact once, no "then". Odometer, settings and checks are under Details. */
  const NA='--';let h='';
  const now=Date.now(), dNow=new Date(r.at||now), rt=rate();
  const dayMs=new Date(dNow.getFullYear(),dNow.getMonth(),dNow.getDate()).getTime();
  const run=runningKwh(r), watts=+r.watts||0;
  const last=(typeof E!=='undefined'&&E.length?E:[]).reduce((a,b)=>!a||b.ts>a.ts?b:a,null);
  const est=remoteEstCalc(r,last);
  const todayDone=monthSessions(dayMs).filter(x=>x.en<=r.at+60000);
  let kmS=null;try{kmS=kmSinceCharge();}catch(e){}
  /* TODAY */
  h+=hmHead('Today');
  h+=R('Charging?',r.charging?'yes':'no');
  if(r.charging&&run>0&&watts>=500){
    let stA=0;
    try{
      const lastEnd=(typeof MS!=='undefined'&&MS.length?MS:[]).reduce((t,x)=>+x.end_ms<=r.at+60000&&+x.end_ms>t?+x.end_ms:t,0);
      ((sync('alerts')||{}).alerts||[]).forEach(a=>{if(a.type==='session_start'&&!a.demo&&+a.ts<=r.at+60000&&+a.ts>=lastEnd&&+a.ts>r.at-24*3600000&&+a.ts>stA)stA=+a.ts;});
    }catch(e){}
    h+=R('Power',n2(watts,0)+' W');
    if(stA>0){h+=R('Started at',hmClock(stA))+R('Charging for',hmDur((r.at-stA)/60000));}
    else{const mins=run/(watts/1000)*60;h+=R('Started at (about)',hmClock(r.at-mins*60000))+R('Charging for (about)',hmDur(mins));}
    h+=R('This charge so far',n2(run,2)+' kWh · '+hmRand(run*rt));
    if(est&&est.min!=null){h+=R('Time left (about)',est.p>=100?'Full':(est.min>=60?Math.floor(est.min/60)+' h '+(est.min%60)+' min':est.min+' min'));h+=R('Full at (about)',est.p>=100?'Full':hmClock(r.at+est.min*60000));}
  }
  /* one battery row */
  let bat=null,batLab='Battery (about)';
  try{
    const fs=last&&last.pct!=null?shVerdicts().filter(x=>x.kwh>=0.1&&x.en>last.ts&&x.en<=r.at+60000).pop():null;
    if(fs&&fs.v.k==='full'&&!r.charging){bat='100% · full at '+hmClock(fs.en);if(kmS&&kmS.km>0)batLab='Battery at the last full charge';}
    else if(est)bat='about '+Math.floor(est.p)+'%';
    else if(last&&last.pct!=null&&!isNaN(last.pct))bat=n2(last.pct,0)+'% · typed in on '+esc(shDT(last.ts));
  }catch(e){}
  h+=R(batLab,bat||NA);
  h+=R('Charges today',String(todayDone.length+(r.charging&&run>0?1:0)));
  h+=R('Used today',n2(r.today,2)+' kWh · '+hmRand((+r.today||0)*rt));
  /* LAST CHARGE */
  const ss=monthSessions(0).filter(x=>x.en<=r.at+60000);const lc=ss.length?ss.reduce((a,b)=>b.en>a.en?b:a):null;
  h+=hmHead('Last charge');
  if(lc){
    h+=R('When',esc(shRange(lc.st,lc.en)));
    h+=R('Used',n2(lc.kwh,2)+' kWh · '+hmRand(lc.cost));
    try{const vv=shVerdicts().filter(x=>Math.abs(x.en-lc.en)<=120000).pop();if(vv)h+=R('How it ended',shTag(vv.v));}catch(e){}
  }else h+=R('Last charge',NA);
  /* THIS MONTH */
  const m=homeMonthStats(r.at||now,r);
  const dom=Math.max(1,dNow.getDate()), dim=new Date(dNow.getFullYear(),dNow.getMonth()+1,0).getDate();
  h+=hmHead('This month');
  /* no meter sessions on this phone yet: use the month total the Sheet block sent */
  const mK=(m.sessions===0&&+r.month>0)?+r.month:m.kwh, mC=(m.sessions===0&&+r.month>0)?+r.month*rt:m.cost;
  h+=R('Used so far',n2(mK,2)+' kWh · '+hmRand(mC));
  if(m.eKwh>=0.005)h+=R('Guessed from battery %',n2(m.eKwh,2)+' kWh · '+hmRand(m.eCost));
  h+=R('Charges',String(m.sessions));
  h+=R('Each day, on average',n2(mK/dom,2)+' kWh · '+hmRand(mC/dom));
  h+=R('Guess for the whole month',hmRand(mC/dom*dim));
  /* THE CAR */
  const rowsM=derive().filter(x=>x.ts>=m.from), sm=summ(rowsM);
  h+=hmHead('The car this month');
  h+=R('Km driven',sm.km>0?n2(sm.km,0)+' km':NA);
  h+=R('Km driven since the last charge',kmS?n2(kmS.km,0)+' km':NA);
  let wl=null;try{wl=shEff();}catch(e){}
  h+=R('Power bought per 100 km (wall)',wl?n2(wl.v,1)+' kWh'+(wl.n?'':' · a starting guess'):NA);
  h+=R('Cost per km (wall)',wl?hmRand(wl.v/100*rt):NA);
  return h;
}
/* 2.2.8.5_B: the numbers that used to crowd Home. Shown under Details only. */
function homeMoreRows(){
  let h='';
  try{
    const r=JSON.parse(localStorage.getItem('farrq.remoteLive')||'null');
    const rt=rate();
    const last=(typeof E!=='undefined'&&E.length?E:[]).reduce((a,b)=>!a||b.ts>a.ts?b:a,null);
    h+=shHead('Other numbers');
    if(last&&last.pct!=null&&!isNaN(last.pct))h+=R('Battery % typed in last',n2(last.pct,0)+'%'+(last.who?' · '+esc(last.who):'')+' · '+esc(shDT(last.ts)));
    if(last&&last.carKm!=null&&!isNaN(last.carKm))h+=R('Range the car screen showed',n2(last.carKm,0)+' km');
    const from=new Date(new Date().getFullYear(),new Date().getMonth(),1).getTime();
    const sm=summ(derive().filter(x=>x.ts>=from));
    h+=R('Power used per 100 km (battery)',sm.eff!=null?n2(sm.eff,1)+' kWh':'--');
    if(r&&r.at>0){
      const m=homeMonthStats(r.at,r);
      h+=R('Short pauses in a charge, this month',String(m.pauses));
      h+=R('Meter total, ever',r.total!=null&&!isNaN(+r.total)?n2(r.total,1)+' kWh':'--');
      const ageMin=(Date.now()-r.at)/60000;
      h+=R('Home phone last sent',esc(ago(r.at))+' · '+(ageMin<=45?'recent':'old'));
    }
    h+=R('Price per kWh (setting)','R'+n2(rt,2));
    h+=R('Power lost while charging (setting)',n2(S.loss,0)+'%');
  }catch(e){}
  return h;
}
function homeMonthRows(){return '';}   /* 2.2.8.3: replaced by the B group (kept so older tests find the name) */
window.farrHomeMonth=homeMonthStats;window.farrHomeGroups=homeSummaryGroups;
function kmSinceCharge(){
  const L=(typeof E!=='undefined'&&E.length?E:[]).filter(e=>e&&!e.auto);
  const ch=L.filter(e=>e.kind==='charge'&&e.odo>0).reduce((a,b)=>!a||b.ts>a.ts?b:a,null);
  const lt=L.filter(e=>e.odo>0).reduce((a,b)=>!a||b.ts>a.ts?b:a,null);
  if(!lt)return null;
  const se=(typeof MS!=='undefined'&&MS.length?MS:[]).reduce((t,x)=>(+x.kwh||0)>=0.1&&+x.end_ms>t?+x.end_ms:t,0);
  let at=ch;
  if(se>(ch?ch.ts:0))at=L.filter(e=>e.odo>0&&e.ts<=se).reduce((a,b)=>!a||b.ts>a.ts?b:a,null);   // 2.2.8.5_A: the car stood still on that charge
  if(!at)return null;
  const km=lt.odo-at.odo;
  return km>=0?{km,since:Math.max(at.ts,se>(ch?ch.ts:0)?se:0)}:null;
}
function kmSinceChargeRow(){
  try{const k=kmSinceCharge();return k?R('Km since last charge',n2(k.km,0)+' km'):'';}catch(e){return '';}
}
window.farrKmSinceCharge=kmSinceCharge;
function remoteExtraRows(r){return '';}   /* 2.2.8.5_B: these rows now live in homeSummaryGroups and under Details */
function remoteLiveHTML(){
  try{
    const r=JSON.parse(localStorage.getItem('farrq.remoteLive')||'null');
    if(!r||!(r.at>0))return '';
    const old=(Date.now()-r.at)>45*60000;
    return `<div class="card"><div class="hdr-row"><div class="label">Copy from the Sheet</div><div class="small">${esc(ago(r.at))}</div></div>`+
      `<div class="small" style="margin:4px 0 6px">${old?'This copy is old. ':''}Everything here is as it was on ${esc(shDT(r.at))}.</div>`+
      (function(){try{return homeSummaryGroups(r);}catch(e){return '';}})()+
      `<div style="margin-top:10px"><button class="btn ghost" id="rmRefreshBtn" onclick="farrRefreshBlock()">Refresh latest data</button></div>`+
      `</div>`;
  }catch(e){return '';}
}
/* 2.2.8: the button at the bottom of the block. Same sync as "Save and send" / "Send now" in Connections: sends this phone's data and asks the Sheet for the latest block, readings and alerts. */
window.farrRefreshBlock=async function(){
  if(!rmOn()){say('Set up the Google Sheet first. Settings, Connections.');return;}
  if(rmBusy){say('Already refreshing…');return;}
  const b=document.getElementById('rmRefreshBtn'); if(b){b.disabled=true;b.textContent='Refreshing…';}
  const before=rmInfoGet().okTs||0;
  try{await rmSend(false);}catch(e){}
  const i=rmInfoGet();
  try{paintHomeCard();}catch(e){}
  if((i.okTs||0)>before&&i.tryOk!==false)say('Latest data received');
  else{say('Could not refresh: '+(i.err||'no answer'));const b2=document.getElementById('rmRefreshBtn');if(b2){b2.disabled=false;b2.textContent='Refresh latest data';}}
};
window.farrRemoteBlockHTML=remoteLiveHTML;window.farrRemoteExtraRows=remoteExtraRows;   /* 2.2.6: for the tests */
/* ---------- 2.2.8.4: the Shelly block (own card under the EV meter block; the other blocks are not changed) ----------
   Only true Shelly data from the measured sessions, plus what can be worked out from them.
   Verdict per session: Full / Not completed / Not sure (the same rule the home phone already uses, read from the alerts copied from the Sheet).
   Km: kWh charged since the last full charge, minus the charging loss, divided by kWh per km. Shown for two loss values, so two odometer values. */
const SH_KEY='farrq.shelly', SH_LOSS_B=13.3, SH_EFF_DEFAULT=12.8;
const SH_SEED={odo:1981,at:new Date(2026,10,2,13,24,0).getTime(),startPct:91,src:'start'};   /* odometer 1981 km at 11:44 on 2 Nov; the charge 11:47 to 13:24 started at 91% and was full */
function shGet(){try{const o=JSON.parse(localStorage.getItem(SH_KEY)||'null');if(o&&+o.odo>0&&+o.at>0)return o;}catch(e){}return Object.assign({},SH_SEED);}
function shSet(o){try{localStorage.setItem(SH_KEY,JSON.stringify(o));}catch(e){}}
/* ---------- 2.2.8.5_A: the verdict is worked out AFTERWARDS from the saved records, not live ----------
   The old way needed two relay reads by the phone at home inside 20 minutes. When a read failed the charge stayed "Not sure".
   Now every finished Shelly charge is judged from what is already on this phone: the Shelly sessions, the log entries,
   the alerts and the relay's own copy in the Sheet. Nothing is sent, nothing is asked from the relay, the Sheet script is not changed.
   Order: 1 charging went on again within 10 min = a pause. 2 a battery % typed after it, car not moved. 3 the relay's own log shows an OFF at the stop.
   4 the phone at home saw it full. 5 relays still ON after the stop. 6 the kWh fit (or do not reach) 100% from the % typed before it.
   7 the car took more charge within an hour. 8 the Shelly alone: the car stopped by itself (the owner's rule: the Shelly is king). */
const SH_WALL_DEFAULT=16.5, VD_KEY='farrq.verdicts';
function vdStore(){try{return JSON.parse(localStorage.getItem(VD_KEY)||'{}')||{};}catch(e){return {};}}
function vdKeep(en,v){
  try{const o=vdStore(),k=String(en);if(o[k]&&o[k].k===v.k&&o[k].by===v.by)return v;o[k]={k:v.k,by:v.by||''};
    const ks=Object.keys(o).sort((a,b)=>+a-+b);while(ks.length>400)delete o[ks.shift()];localStorage.setItem(VD_KEY,JSON.stringify(o));}catch(e){}
  return v;
}
function shEntries(){return (typeof E!=='undefined'&&E&&E.length?E:[]).filter(e=>e&&e.ts>0&&!e.auto).slice().sort((a,b)=>a.ts-b.ts);}
function shSessions(){
  return (typeof MS!=='undefined'&&MS.length?MS:[]).filter(s=>+s.end_ms>0&&+s.kwh>0).map(s=>({st:+s.start_ms||+s.end_ms,en:+s.end_ms,kwh:+s.kwh,cost:(s.cost!=null&&s.cost!==''&&isFinite(+s.cost))?+s.cost:(+s.kwh)*rate(),peak:+s.peak_w||0,reason:s.end_reason||s.why||'',raw:s})).sort((a,b)=>a.st-b.st);
}
/* The relay's own record: its ON/OFF/restart log and how long both relays have been ON. From the relay (at home) or its copy in the Sheet. */
function shRelayEv(){
  try{
    let src=null;
    try{if(RI&&RI.j&&+RI.seen>0)src={seen:+RI.seen,j:RI.j};}catch(e){}
    try{if(!src&&RI_SHEET&&RI_SHEET.status&&+RI_SHEET.seen>0)src={seen:+RI_SHEET.seen,j:RI_SHEET.status};}catch(e){}
    if(!src)return null;
    const j=src.j, ev=[];
    (Array.isArray(j.relay_log)?j.relay_log:[]).forEach(e=>{
      const m=/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)/.exec(String(e.time||''));if(!m)return;
      const why=typeof e.why==='string'?e.why:(RI_WHY[+e.why]||'');
      ev.push({ts:Date.UTC(+m[1],+m[2]-1,+m[3],+m[4]-2,+m[5],+m[6]),off:!/switched ON/i.test(why)});   // the relay clock is South African time (UTC+2)
    });
    const on=!!(j.relay1_on&&j.relay2_on), onS=Math.min(+j.relay1_on_s||0,+j.relay2_on_s||0);
    return {seen:src.seen,ev,on,onSince:on&&onS>0?src.seen-onS*1000:0};
  }catch(e){return null;}
}
function shJudge(x,ctx){
  const s=x.raw,en=x.en,st=x.st,nx=ctx.next;
  if(!(x.kwh>=0.1))return {k:'short'};
  if(Math.abs(en-SH_SEED.at)<=5*60000)return {k:'full',by:'you said so'};
  if(nx!=null&&nx-en<=10*60000)return {k:'not_full',by:'charging went on again '+Math.max(1,Math.round((nx-en)/60000))+' min later'};
  const lim=Math.min(nx!=null?nx:Infinity,en+36*3600000);
  let b=null,bo=null;const cs=x.chain||st;
  for(const e of ctx.ent){if(e.ts<en-3*60000&&e.odo>0)bo=e;if(e.ts<=st+3*60000&&e.ts>=cs-60*60000&&typeof e.pct==='number')b=e;}
  const a=ctx.ent.find(e=>e.ts>=en-3*60000&&e.ts<lim&&typeof e.pct==='number');
  const parked=a&&a.where!=='Station'&&(bo&&a.odo>0?a.odo===bo.odo:a.kind==='charge');
  if(parked&&a.pct>=99)return {k:'full',by:'100% typed after it'};
  if(parked&&a.pct<=96)return {k:'not_full',by:n2(a.pct,0)+'% typed after it'};
  if(parked===false||!parked){if(nx!=null&&nx-en<=60*60000&&ctx.nextKwh>=0.3)return {k:'not_full',by:'the car took more charge '+Math.round((nx-en)/60000)+' min later'};}
  const energy=b?(+b.pct+(x.kwh+ctx.all.filter(y=>y.en>b.ts&&y.en<=st).reduce((t,y)=>t+y.kwh,0))/(1+(+S.loss||0)/100)/(+S.pack||42.7)*100):null;
  const rl=ctx.relay, offAtStop=!!(rl&&rl.ev.some(e=>e.off&&e.ts>=en-4*60000&&e.ts<=en+90000));
  if(offAtStop&&!(energy!=null&&energy>=95))return vdKeep(en,{k:'not_full',by:'a relay was switched off at the stop'});
  const f=String(s.full||''), al=ctx.alert;
  if(f==='full'||(al&&al.k==='full'))return vdKeep(en,{k:'full',by:'the phone at home saw it'});
  if(rl&&rl.on&&!offAtStop&&rl.seen>=en+5*60000&&rl.onSince>0&&rl.onSince<=st+2*60000)return vdKeep(en,{k:'full',by:'Shelly at 0 W, relays stayed on'});
  if(energy!=null&&energy>=95)return {k:'full',by:'the kWh fit 100% from '+n2(b.pct,0)+'%'};
  if(energy!=null&&energy<90)return {k:'not_full',by:'the kWh only reach about '+n2(energy,0)+'%'};
  if(f==='not_full'||(al&&al.k==='not_full'))return {k:'not_full',by:al&&/power again/i.test(al.text||'')?'charging went on again':'the phone at home saw a relay off at the stop'};
  const old=ctx.kept[String(en)];
  if(old&&(old.k==='full'||old.k==='not_full'))return {k:old.k,by:old.by||''};
  if(en>ctx.now-10*60000)return {k:'unsure',by:'it has just ended'};
  return {k:'full',by:'Shelly only: the car stopped by itself'};
}
let VDm=null;
function shVerdicts(){
  const now=Date.now();
  const quick=[(typeof MS!=='undefined'?MS.length:0),(typeof MS!=='undefined'&&MS.length?+MS[MS.length-1].end_ms:0),(typeof E!=='undefined'&&E?E.length:0),
    (typeof E!=='undefined'&&E&&E.length?E.reduce((t,e)=>t+(+e.ts||0)%100000+(+e.pct||0)+(+e.odo||0),0):0)].join('/');
  if(VDm&&VDm.quick===quick&&now-VDm.at<2000&&now>=VDm.at)return VDm.all;
  const relay=shRelayEv(), kept=vdStore();
  const al=((sync('alerts')||{}).alerts||[]).filter(a=>!a.demo);
  const sig=[quick,al.length,relay?relay.seen:0,Object.keys(kept).length,Math.floor(now/60000)].join('/');
  if(VDm&&VDm.sig===sig){VDm.at=now;return VDm.all;}
  const map={charge_full:'full',charge_not_full:'not_full',charge_full_unsure:'unsure'};
  const ent=shEntries(), all=shSessions();
  all.forEach((x,i)=>{
    const nxs=all.slice(i+1).find(y=>y.kwh>=0.1), next=nxs?nxs.st:null;
    const pv=i>0?all[i-1]:null;x.chain=pv&&x.st-pv.en<=60*60000?(pv.chain||pv.st):x.st;   // charges less than an hour apart are one stand
    const hit=al.filter(a=>map[a.type]&&+a.ts>=x.en-120000&&+a.ts<=x.en+30*60000&&(next==null||+a.ts<=next+60000)).sort((a,b)=>a.ts-b.ts)[0];
    x.next=next;
    x.v=shJudge(x,{next,nextKwh:nxs?nxs.kwh:0,all,ent,relay,kept,now,alert:hit?{k:map[hit.type],text:hit.text||''}:null});
  });
  VDm={sig,quick,at:now,all};return all;
}
/* for the Learning page (farrq-22.js) and the trip maths (index.html) */
window.farrVerdict=function(s){try{const en=+s.end_ms,x=shVerdicts().find(y=>y.en===en);return x&&x.v?x.v.k:'';}catch(e){return '';}};
/* A trip that follows a charge with no charge log: if that charge ended full and the car stood still from the last reading until it was plugged in,
   the trip starts at 100% from the end of the charge. Any other unlogged charge in between makes the battery % unknown: the trip then counts for distance only. */
window.farrTripStart=function(prevTs,ts){
  try{
    const ss=shVerdicts().filter(x=>x.kwh>=0.1&&x.en>prevTs&&x.en<=ts);
    if(!ss.length)return null;
    const last=ss[ss.length-1];
    if(last.v.k==='full'&&prevTs>=ss[0].st-30*60000)return {pct:100,ts:last.en};
    return {unknown:true};
  }catch(e){return null;}
};
/* The real odometer while the car stood on a charge, or null when no reading proves it. */
function shOdoAt(x,ent,anchor){
  let b=null;for(const e of ent){if(e.ts<=x.st+3*60000&&e.odo>0)b=e;}
  if(b&&b.ts>=(x.chain||x.st)-30*60000)return +b.odo;                       // read just before it was plugged in
  const a=ent.find(e=>e.ts>=x.en-3*60000&&(x.next==null||e.ts<x.next)&&e.odo>0);
  if(a&&b&&a.where!=='Station'&&+a.odo===+b.odo)return +a.odo;                // same odometer before and after: the car did not move
  if(anchor&&anchor.src==='typed'&&anchor.at>=x.en&&(x.next==null||anchor.at<x.next)&&anchor.at-x.en<=24*3600000)return +anchor.odo;
  return null;
}
/* Wall kWh per 100 km, learned from stretches between two full charges that both have a real odometer. No charging-loss figure is used. */
function shWall(all,ent,anchor){
  const pts=[];
  all.forEach(x=>{
    x.odoReal=null;
    if(!x.v||x.v.k!=='full')return;
    x.odoReal=Math.abs(x.en-SH_SEED.at)<=5*60000?SH_SEED.odo:shOdoAt(x,ent,anchor);
    if(x.odoReal>0)pts.push({en:x.en,odo:x.odoReal});
  });
  let kwh=0,km=0,n=0;
  for(let i=pts.length-1;i>0&&n<8;i--){
    const A=pts[i-1],B=pts[i],d=B.odo-A.odo;
    if(!(d>=30))continue;
    if(ent.some(e=>e.where==='Station'&&e.ts>A.en&&e.ts<=B.en))continue;
    const k=all.filter(y=>y.en>A.en&&y.en<=B.en).reduce((t,y)=>t+y.kwh,0), r=k/d*100;
    if(!(r>=10&&r<=25))continue;
    kwh+=k;km+=d;n++;
  }
  if(n&&km>=100)return {v:kwh/km*100,app:null,n,km,kwh,why:'learned from '+n+' full-to-full stretch'+(n>1?'es':'')+' with real odometers, '+n2(km,0)+' km'};
  return {v:SH_WALL_DEFAULT,app:null,n:0,km:0,kwh:0,why:'start value, until there are full-to-full stretches with real odometers'};
}
function shEff(){const all=shVerdicts();return shWall(all,shEntries(),shGet());}
function shVerdict(s){return {k:window.farrVerdict(s)||'none'};}
function shCalc(){
  const all=shVerdicts(), ent=shEntries(), anchor=shGet(), eff=shWall(all,ent,anchor);
  const kmOf=kwh=>kwh/(eff.v/100);
  const evs=all.filter(x=>x.en>SH_SEED.at+60000&&x.v.k!=='short').map(x=>({t:x.en,x}));
  if(anchor.src==='typed'&&anchor.at>SH_SEED.at)evs.push({t:anchor.at,typed:anchor});
  evs.sort((a,b)=>a.t-b.t);
  let odo=SH_SEED.odo, pool=0, poolN=0, lastFull=null, base={odo:SH_SEED.odo,at:SH_SEED.at,how:'start'};
  const fulls=[];
  evs.forEach(ev=>{
    if(ev.typed){odo=+ev.typed.odo;pool=0;poolN=0;base={odo,at:ev.t,how:'typed'};return;}
    const x=ev.x;pool+=x.kwh;poolN++;
    if(x.v.k==='full'){
      const km=kmOf(pool), est=odo+km, real=x.odoReal>0?x.odoReal:null;
      const row={st:x.st,en:x.en,kwh:x.kwh,pool,poolN,km,odo:est,real,by:x.v.by||''};fulls.push(row);lastFull=row;
      odo=real!=null?real:est;if(real!=null)base={odo:real,at:x.en,how:'full'};
      pool=0;poolN=0;
    }
  });
  const lastReal=[...ent].reverse().find(e=>e.odo>0)||null;
  const least=odo+kmOf(pool), useReal=lastReal&&lastReal.ts>=base.at&&+lastReal.odo>least;
  const seedSess=all.filter(x=>Math.abs(x.en-SH_SEED.at)<=5*60000)[0]||null;
  return {all,anchor,eff,base,odo:useReal?+lastReal.odo:least,least,firm:pool===0&&!useReal,lastReal,pool,poolN,minKm:kmOf(pool),fulls,lastFull,seedSess,kmOf};
}
const shDT=ts=>new Date(ts).toLocaleDateString('en-ZA',{day:'2-digit',month:'short'})+' '+hmClock(ts);
const shRange=(a,b)=>shDT(a)+' to '+(new Date(a).toDateString()===new Date(b).toDateString()?hmClock(b):shDT(b));
function shTag(v){
  const t={full:['Full (100%)','var(--green,#22c55e)'],not_full:['Not completed','var(--gold)'],unsure:['Not sure','var(--muted)'],none:['Not sure','var(--muted)'],short:['Too short, ignored','var(--muted)']}[v.k]||['Not sure','var(--muted)'];
  return `<span class="tag" style="color:${t[1]};border-color:${t[1]}">${t[0]}</span>`+(v.by?` <span class="small">${esc(v.by)}</span>`:'');
}
function shHead(t,sub){return `<div class="label" style="margin:16px 0 4px;padding-top:10px;border-top:2px solid var(--line,#8884)">${esc(t)}</div>`+(sub?`<div class="small" style="margin:0 0 4px">${esc(sub)}</div>`:'');}
let shOpen=false;
window.farrShOpen=function(o){shOpen=!!o;};
function shellyHTML(){
  const c=shCalc(), a=c.anchor;
  let live=null;try{live=JSON.parse(localStorage.getItem('farrq.remoteLive')||'null');}catch(e){}
  const lastEn=c.all.length?c.all[c.all.length-1].en:0;
  const head=live&&live.charging&&live.at>lastEn?'charging now':(lastEn?'last charge ended '+ago(lastEn):'');
  let h=`<div class="card"><div class="hdr-row"><div class="label">Details</div><div class="small">${esc(head)}</div></div>`+
    `<details id="shDet"${shOpen?' open':''} ontoggle="farrShOpen(this.open)"><summary style="cursor:pointer;padding:10px 0;font-weight:600">Tap to open: odometer, every charge, checks</summary>`+
    `<div class="small" style="margin:4px 0 6px">Everything here comes from the Shelly's measured charges and the readings in the log.</div>`;
  /* 1 odometer from the car */
  h+=shHead('Odometer from the car','The km on the car dash, as typed in a log.');
  const lr=c.lastReal&&(a.src!=='typed'||c.lastReal.ts>=a.at)?c.lastReal:null;
  if(lr){h+=R('Odometer',n2(lr.odo,0)+' km')+R('Read on',esc(shDT(lr.ts))+(lr.who?' · '+esc(lr.who):''));}
  else if(a.src==='typed'){h+=R('Odometer',n2(a.odo,0)+' km')+R('Read on',esc(shDT(a.at))+' · typed in the box below');}
  else{h+=R('Odometer',n2(SH_SEED.odo,0)+' km')+R('Read on',esc(shDT(SH_SEED.at))+' · start value');}
  /* 2 odometer worked out */
  h+=shHead('Odometer worked out','The app counts the km from the kWh charged since a full charge. It starts from a real odometer.');
  h+=R(c.firm?'Odometer (worked out)':'Odometer (at least)',n2(c.odo,0)+' km');
  h+=R('Power per 100 km used for this',n2(c.eff.v,1)+' kWh');
  h+=`<div class="small" style="margin:0 0 4px">Why: ${esc(c.eff.why)}.</div>`;
  h+=R('Counting from',n2(c.base.odo,0)+' km · '+esc(shDT(c.base.at))+(c.base.how==='full'?' · full charge':c.base.how==='typed'?' · typed by you':' · start value'));
  /* 3 since last full */
  h+=shHead('Since the last full charge','Charges that did not end full only add kWh. The car has driven at least this far.');
  h+=R('Charges',String(c.poolN));
  h+=R('kWh charged',n2(c.pool,2)+' kWh · '+hmRand(c.pool*rate()));
  h+=R('Driven at least',n2(c.minKm,0)+' km');
  /* 4 full charges */
  h+=shHead('Full charges','Newest first. The app\'s km guess next to the real odometer.');
  const f=c.fulls.slice().reverse();
  h+=f.length?f.slice(0,8).map(x=>{const d=x.real!=null?Math.round(x.odo-x.real):0;return `<div class="row"><div>${esc(shRange(x.st,x.en))}<div class="small">${n2(x.pool,2)} kWh in ${x.poolN} charge${x.poolN>1?'s':''} · ${n2(x.km,0)} km driven</div></div><div style="text-align:right"><b>${n2(x.odo,0)} km</b><div class="small">${x.real!=null?'real '+n2(x.real,0)+' km · '+(d===0?'spot on':'guess '+Math.abs(d)+' km too '+(d>0?'high':'low')):'no real reading to check'}</div></div></div>`;}).join(''):'<div class="small">None yet.</div>';
  /* 5 last sessions */
  h+=shHead('Latest charges','Start, end, kWh, cost and how it ended.');
  const L=c.all.slice().reverse().slice(0,12);
  h+=L.length?L.map(x=>`<div class="row"><div>${esc(shRange(x.st,x.en))}<div class="small">${hmDur(Math.round((x.en-x.st)/60000))} · peak ${n2(x.peak,0)} W</div><div style="margin-top:3px">${shTag(x.v)}</div></div><div style="text-align:right"><b>${n2(x.kwh,2)} kWh</b><div class="small">${hmRand(x.cost)}</div></div></div>`).join(''):'<div class="small">No Shelly charges on this phone yet.</div>';
  /* 6 totals */
  const now=new Date(), from=new Date(now.getFullYear(),now.getMonth(),1).getTime(), wk=Date.now()-7*864e5;
  const tot=(cut)=>{const r={n:0,kwh:0,cost:0,full:0,nf:0,un:0};c.all.filter(x=>x.en>=cut&&x.v.k!=='short').forEach(x=>{r.n++;r.kwh+=x.kwh;r.cost+=x.cost;if(x.v.k==='full')r.full++;else if(x.v.k==='not_full')r.nf++;else r.un++;});return r;};
  const t7=tot(wk), tm=tot(from);
  h+=shHead('Totals','Finished charges only. Charges under 0.1 kWh are left out.');
  [['Last 7 days',t7],['This month',tm]].forEach(([n,t])=>{
    h+=R(n,n2(t.kwh,2)+' kWh · '+hmRand(t.cost));
    h+=`<div class="small" style="margin:0 0 4px">${t.n} charges: ${t.full} full · ${t.nf} not completed · ${t.un} not sure</div>`;
  });
  /* 7 odometer check */
  h+=shHead('Check the odometer','Type the km on the car dash. The app checks its guess. Best right after a full charge, before driving.');
  h+=`<div style="display:flex;gap:8px;align-items:center;margin:6px 0"><input id="shOdo" type="number" inputmode="decimal" placeholder="Odometer in km" style="flex:1 1 auto;width:auto;min-width:0"><button class="btn" style="flex:0 0 auto;width:auto;padding:10px 16px;margin:0" onclick="farrShellySet()">Save</button></div>`;
  h+=`<div class="small">${a.src==='typed'?'You typed '+n2(a.odo,0)+' km on '+esc(shDT(a.at))+'.'+(c.lastReal&&c.lastReal.ts>a.at?' The log has a newer reading, so that one is used.':''):'Nothing typed yet. The readings in the log are used.'}</div>`;
  if(a.src==='typed')h+=`<div style="margin-top:6px"><button class="btn ghost" onclick="farrShellyReset()">Forget the typed odometer</button></div>`;
  h+=homeMoreRows();
  /* 8 rules */
  h+=shHead('What the words mean');
  h+=`<div class="small">Full: the car stopped charging by itself. The small text says how we know.<br>Not completed: the charge was stopped early, or the car went on charging soon after.<br>Not sure: the charge has only just ended.<br>Km = kWh from the wall, divided by kWh per 100 km.<br>The odometer is exact right at a full charge. In between it says "at least".</div>`;
  return h+`</details></div>`;
}
let shLast='';
function paintShelly(force){
  const el=document.getElementById('shellyCard');if(!el)return;
  const inp=document.getElementById('shOdo');
  if(!force&&inp&&document.activeElement===inp)return;
  const keep=inp?inp.value:'';
  const h=shellyHTML();
  if(h!==shLast||force){shLast=h;el.innerHTML=h;const n=document.getElementById('shOdo');if(n&&keep)n.value=keep;}
}
window.farrShellySet=function(){
  const i=document.getElementById('shOdo');const v=i?parseFloat(i.value):NaN;
  if(isNaN(v)||v<=0)return say('Type your odometer in km first.');
  shSet({odo:v,at:Date.now(),startPct:null,src:'typed'});
  if(i)i.value='';paintShelly(true);say('Odometer check saved');
};
window.farrShellyReset=function(){try{localStorage.removeItem(SH_KEY);}catch(e){}paintShelly(true);say('Typed odometer forgotten');};
window.farrShelly={calc:shCalc,html:shellyHTML,paint:paintShelly};
function paintHomeCard(){
  try{paintShelly();}catch(e){}
  const el=$('meterCard'); if(!el)return;
  const L=LIVE, st=statusText(L), v=L&&L.live;
  const unread=(L&&L.unread)||0;
  let h='';
  const ma=$('meterAlert');
  if(ma)ma.innerHTML=unread?`<div class="card" style="border-color:var(--gold)" onclick="go('alerts')"><div class="small" style="color:var(--gold)">${unread} new alert${unread>1?'s':''}. Tap to open.</div></div>`:'';
  if(!v){
    const rl0=remoteLiveHTML();
    h+=`<div class="card" onclick="go('meter')"><div class="hdr-row"><div class="label">EV meter</div><div class="small">${esc(rl0?'Away from home':st)}</div></div>`+
       `<div class="small">${rl0?'This phone is not on the home Wi-Fi, so it cannot read the Shelly itself. The figures below are the copy from the Sheet.':(L&&L.everSeen?'The meter is not answering. Last seen '+ago(L.lastSeen)+'.':'Meter not found yet. It will show here once it is connected at 192.168.1.128.')}</div></div>`;
    h+=rl0;
    el.innerHTML=h;return;
  }
  const se=v.session;
  h+=`<div class="card" onclick="go('meter')"><div class="hdr-row"><div class="label">EV meter${L.demo?' · DEMO':''}</div><div class="small">${esc(st)}</div></div>`+
     `<div class="big">${n2(v.watts,0)} W</div>`+
     R('Current',n2(v.amps,2)+' A')+
     R('This session',se?n2(se.kwh,2)+' kWh · R'+n2(se.kwh*rate(),2)+' · '+dur(se.duration_s):'--')+
     R('Today',n2(v.today_kwh,2)+' kWh · R'+n2((v.today_kwh||0)*rate(),2))+
     R('Mode',esc(v.mode||'--'))+
     R('EV relay',RELAY&&RELAY.connected?(RELAY.relay2On?'ON':'OFF')+' (relay board)':v.relay&&v.relay.reachable?(v.relay.relay2_on?'ON':'OFF')+' (meter report)':'unknown')+
     `</div>`;
  el.innerHTML=h;
}

/* ---------- Meter page ---------- */
let CFG=null;
async function loadMeterConfig(){
  try{CFG=await call('meterConfig');}catch(e){CFG=null;}
  const set=(id,v)=>{const x=$(id);if(x&&v!=null)x.value=v;};
  if(CFG){
    set('calFactor',CFG.cal_factor);set('th_start_w',CFG.start_w);set('th_start_s',CFG.start_s);set('th_end_w',CFG.end_w);set('th_end_s',CFG.end_s);
    set('au_off_w',CFG.auto_off_w);set('au_off_s',CFG.auto_off_s);set('au_nostart',CFG.auto_nostart_min);set('au_over',CFG.overcurrent_a);
  }
  paintModeChips();
}
function paintMeter(){
  const L=LIVE, v=L&&L.live;
  $('mStatus').textContent=statusText(L);
  $('mWatts').textContent=v?n2(v.watts,0)+' W':'-- W';
  $('mRows').innerHTML=v?
    R('Current',n2(v.amps,2)+' A')+R('Raw clamp reading',n2(v.raw,4))+R('Calibration factor',n2(v.cal_factor,3))+
    R('Charging',v.charging?'yes':'no')+
    R('This session',v.session?n2(v.session.kwh,3)+' kWh · '+dur(v.session.duration_s)+' · peak '+n2(v.session.peak_w,0)+' W':'--')+
    R('Today · month',n2(v.today_kwh,2)+' · '+n2(v.month_kwh,2)+' kWh')+
    R('Meter clock',v.time_valid?'set':'not set yet')
    :`<div class="small">${L&&L.error?esc(L.error):'No reading yet.'}</div>`;
}
function paintSessions(){
  loadMS();
  const demoOn=LIVE&&LIVE.demo;
  const list=(demoOn?MSdemo.map(x=>Object.assign({_d:1},x)):[]).concat(MS).sort((a,b)=>b.end_ms-a.end_ms).slice(0,60);
  $('mSessions').innerHTML=list.length?list.map(x=>`<div class="row"><div>${x._d?'<span class="tag c">DEMO</span>':''}${tstamp(x.start_ms)}<div class="small">${dur(x.duration_s)} · peak ${n2(x.peak_w,0)} W · ${esc(x.end_reason||'')}</div></div><div style="text-align:right">${n2(x.kwh,2)} kWh<br><span class="small">R${n2(x.kwh*rate(),2)}</span></div></div>`).join('')
    :'<div class="small">No measured sessions yet.</div>';
}
async function pushMeter(obj,msgEl,okText){
  try{const c=await call('meterConfigSet',obj);CFG=c||CFG;if(LIVE&&LIVE.live&&obj.mode)LIVE.live.mode=obj.mode;if(msgEl)$(msgEl).textContent=okText||'Saved to the meter.';say(okText||'Saved to the meter');paintModeChips();return true;}
  catch(e){const t=(/^AUTO is not available/.test(e.message)?'':'Could not reach the meter: ')+e.message;if(msgEl)$(msgEl).textContent=t;say(t);return false;}
}
window.farrCalMatch=async function(){
  const ref=parseFloat($('calRef').value), v=LIVE&&LIVE.live;
  if(isNaN(ref)||ref<=0)return say('Type the Ellies reading in watts first.');
  if(!v||!(v.watts>50))return say('The meter must be reading above 50 W while the car charges.');
  const f0=v.cal_factor||1, f1=+(f0*ref/v.watts).toFixed(4);
  if(!(f1>0.05&&f1<20))return say('That gives a factor of '+f1+', which looks wrong. Check the reading.');
  if(await pushMeter({cal_factor:f1},'calMsg','Factor changed from '+n2(f0,3)+' to '+n2(f1,3)+'.'))$('calFactor').value=f1;
};
window.farrCalSave=function(){
  const f=parseFloat($('calFactor').value);
  if(isNaN(f)||f<=0.05||f>=20)return say('Enter a factor between 0.05 and 20.');
  pushMeter({cal_factor:f},'calMsg','Factor saved: '+n2(f,3)+'.');
};
window.farrThSave=function(){
  const g=id=>parseFloat($(id).value), o={start_w:g('th_start_w'),start_s:g('th_start_s'),end_w:g('th_end_w'),end_s:g('th_end_s')};
  if(Object.values(o).some(x=>isNaN(x)||x<0))return say('Fill in all four numbers.');
  if(o.end_w>o.start_w)return say('The end level must be at or below the start level.');
  pushMeter(o,null,'Session detection saved to the meter');
};

/* ---------- Relays and AUTO ---------- */
function setTxt(id,t){const x=$(id);if(x)x.textContent=t;}
function paintModeChips(){
  // 1.8: the meter's live mode wins, so a change made from another controller shows at once
  const m=(LIVE&&LIVE.live&&LIVE.live.mode)||(CFG&&CFG.mode)||'MANUAL';
  // 1.8: the same MANUAL/AUTO chips appear on Home and on the Relays page
  [['modeManual','modeAuto'],['hModeManual','hModeAuto']].forEach(([a,b])=>{
    const x=$(a),y=$(b);
    if(x&&y){x.classList.toggle('on',m==='MANUAL');y.classList.toggle('on',m==='AUTO');}
  });
}
function paintRelayAuto(){
  const v=LIVE&&LIVE.live;
  paintModeChips();
  const a=v&&v.auto;
  const t=!v?(localStorage.getItem('farrq.remoteLive')?'Away from home: the relays and AUTO only work on the home Wi-Fi. See Relay Info for the copy from the Sheet.':'Meter not connected, so AUTO cannot run yet.'):
    v.meter_type==='shelly'?'AUTO is not available with the Shelly meter yet. START and STOP work as before and charging is never blocked.':
    v.mode!=='AUTO'?'MANUAL: the meter never switches anything.':
    'AUTO is '+(a&&a.state?a.state:'watching')+(a&&a.below_s?' · below the level for '+a.below_s+' s':'')+'.';
  setTxt('autoState',t); setTxt('hAutoState',t);
}
/* 1.8: ON turns green when that relay is on, OFF turns red when it is off; grey when the board is not reachable */
function paintRelayButtons(){
  const r=RELAY, ok=!!(r&&r.connected);
  document.querySelectorAll('[data-relay]').forEach(b=>{
    const cur=ok?(b.dataset.relay==='1'?r.relay1On:r.relay2On):null, want=b.dataset.state==='on';
    b.classList.toggle('r-on',ok&&cur===true&&want);
    b.classList.toggle('r-off',ok&&cur===false&&!want);
  });
}
function paintRelay(){
  const r=RELAY, status=!r?'Checking…':r.connected?'Connected':'Not reachable';
  setTxt('rStatus',status); setTxt('hRStatus',status);
  $('rRows').innerHTML=r&&r.connected?
    R('Relay 1 · Eskom input',r.relay1On?'ON':'OFF')+R('Relay 2 · EV charger',r.relay2On?'ON':'OFF')+R('Relay says',esc(r.message||''))
    :`<div class="small">${esc((r&&r.message)||'')}</div>`;
  paintRelayButtons();
  if(screen==='home')paintHomeCard();
}
let relayGen=0;   // 2.1.6: bumped by every command, so an older status answer can never overwrite a newer command answer
async function relayLoop(){
  clearTimeout(relayTimer);
  if(!(screen==='relay'||screen==='home')||document.visibilityState!=='visible')return;
  const g=relayGen;
  let r; try{r=await call('relayStatus');}catch(e){r={connected:false,message:e.message};}
  if(g===relayGen){RELAY=r;paintRelay();}
  relayTimer=setTimeout(relayLoop,5000);
}
async function relayCmd(path){
  relayGen++;
  try{
    RELAY=await call('relay',{path});paintRelay();
    const m=/relay\/(\d)\/(on|off)$/.exec(path);
    if(RELAY.connected&&m){   // 2.1.6: check the board really did what was asked, and try once more if not
      const want=m[2]==='on', now=m[1]==='1'?RELAY.relay1On:RELAY.relay2On;
      if(now!==want){
        await new Promise(r=>setTimeout(r,700)); relayGen++;
        RELAY=await call('relay',{path}); paintRelay();
        const now2=m[1]==='1'?RELAY.relay1On:RELAY.relay2On;
        return say(RELAY.connected&&now2===want?'Done':'Relay '+m[1]+' did not change. Tap again.');
      }
    }
    say(RELAY.connected?'Done':'Relay did not answer: '+(RELAY.message||''));
  }catch(e){say('Relay did not answer: '+e.message);}
}
window.farrRelay=async function(n,on){
  if(n===1&&!on&&!await askUser({title:'Turn off Eskom input?',text:'This switches Relay 1 (Eskom input) off.',ok:'Turn off',tone:'red'}))return;
  relayCmd('/api/v1/relay/'+n+'/'+(on?'on':'off'));
};
window.farrCharge=async function(start){
  const ok=await askUser(start
    ?{title:'Start charging?',text:'Eskom goes on first, then the EV charger. The relay board runs this order itself.',ok:'Start',tone:'green'}
    :{title:'Stop charging?',text:'The EV charger goes off first, then Eskom. The relay board runs this order itself.',ok:'Stop',tone:'red'});
  if(ok)relayCmd(start?'/api/v1/charge/start':'/api/v1/charge/stop');
};
window.farrMode=async function(m){
  if(m==='AUTO'&&!await askUser({title:'Turn on AUTO?',text:'The meter will switch the EV charger off when charging finishes. AUTO never switches anything on and never touches Eskom.',ok:'Turn on AUTO',tone:'cyan'}))return;
  pushMeter({mode:m},null,'Mode set to '+m);
};
window.farrAutoSave=function(){
  const g=id=>parseFloat($(id).value), o={auto_off_w:g('au_off_w'),auto_off_s:g('au_off_s'),auto_nostart_min:g('au_nostart'),overcurrent_a:g('au_over')};
  if(Object.values(o).some(x=>isNaN(x)||x<0))return say('Fill in all four numbers.');
  pushMeter(o,null,'AUTO rules saved to the meter');
};

/* ---------- Alerts ---------- */
function paintAlerts(){
  const a=sync('alerts')||{alerts:[],types:[],off:[]};
  const st=sync('state')||{};
  $('bgInfo').innerHTML=
    R('Notifications',st.notifAllowed?'allowed':'not allowed yet')+
    R('Checks while the phone sleeps',st.batteryExempt?'allowed':'limited by Android')+
    R('On Wi-Fi now',st.onWifi?'yes':'no')+
    R('Last background check',ago(st.lastPoll))+
    R('Next check in about',st.nextPollS?dur(st.nextPollS):'only when Wi-Fi returns')+
    `<div class="small" style="margin-top:6px">Checks run about every 30 s while charging and every 5 min when idle, only on Wi-Fi. Away from home nothing runs; everything missed is collected the moment the phone is back on home Wi-Fi.</div>`;
  $('alertTypes').innerHTML=(a.types||[]).map(t=>`<label class="check"><input type="checkbox" ${a.off.includes(t.type)?'':'checked'} onchange="farrAlertType('${t.type}',this.checked)"> ${esc(t.label)}</label>`).join('');
  $('alertList').innerHTML=(a.alerts||[]).length?a.alerts.slice(0,300).map(x=>{
    const col=x.level==='critical'?'var(--red)':x.level==='warning'?'var(--gold)':'var(--cyan)';
    return `<div class="row"><div><span class="tag" style="color:${col};border-color:${col}">${esc(x.level||'info')}</span>${x.demo?'<span class="tag c">DEMO</span>':''}${tstamp(x.ts)}<div class="small">${esc(x.text)}</div></div></div>`;
  }).join(''):'<div class="small">No alerts yet.</div>';
  sync('alertsRead');
}
window.farrAlertType=(t,on)=>{sync('setAlertType',{type:t,off:!on});};
window.farrClearAlerts=async function(){
  if(!await askUser({title:'Clear the alert list?',text:'This clears the alert list on this phone only. The meter keeps its own records.',ok:'Clear',tone:'red'}))return;
  sync('clearAlerts');paintAlerts();
};
window.farrSyncNow=async function(){say('Checking the meter…');try{const r=await call('sync');say(r.message||'Done');}catch(e){say(e.message);}loadMS();if(screen==='alerts')paintAlerts();};

/* ---------- Connections ---------- */
let mqOn=false;
function paintConn(){
  const c=sync('config')||{};
  $('cf_meter').value=c.meterUrl||'';$('cf_relay').value=c.relayUrl||'';$('cf_token').value=c.relayToken||'';
  $('cf_mqhost').value=c.mqttHost||'';$('cf_mqport').value=c.mqttPort||'';$('cf_mquser').value=c.mqttUser||'';$('cf_mqpass').value=c.mqttPass||'';
  mqOn=!!c.mqttEnabled;paintMq();paintMqStatus();
  $('connMsg').textContent=c.pendingMeter?'Waiting to send these to the meter when it is found.':'';
}
function paintMq(){$('mqOn').classList.toggle('on',mqOn);$('mqOff').classList.toggle('on',!mqOn);}
/* 1.8: the Pi is optional; say so, and say what the meter reports */
function paintMqStatus(){
  const el=$('mqStatus'); if(!el)return;
  const mq=LIVE&&LIVE.live&&LIVE.live.mqtt;
  el.textContent='Pi/MQTT is OPTIONAL. The meter, relays and history never need it. '+
    (!mqOn?'MQTT is off, so the Pi is not used.':mq&&mq.connected?'MQTT is on and the meter is connected to the broker.':'MQTT is on, but the meter is not connected to the broker yet.');
}
window.farrMq=on=>{mqOn=on;paintMq();paintMqStatus();};
function addr(v){v=String(v||'').trim().replace(/\/+$/,'');if(v&&!/^https?:\/\//.test(v))v='http://'+v;return v;}
window.farrConnSave=async function(){
  const o={meterUrl:addr($('cf_meter').value),relayUrl:addr($('cf_relay').value),relayToken:$('cf_token').value.trim(),
    mqttEnabled:mqOn,mqttHost:$('cf_mqhost').value.trim(),mqttPort:parseInt($('cf_mqport').value,10)||1883,mqttUser:$('cf_mquser').value.trim(),mqttPass:$('cf_mqpass').value,tariff:rate()};
  if(!o.meterUrl||!o.relayUrl)return say('Enter both addresses.');
  sync('setConfig',o);
  $('connMsg').textContent='Saved on this phone. Sending to the meter…';
  try{const r=await call('sync');$('connMsg').textContent=r.pushed?'Saved on this phone and sent to the meter.':'Saved on this phone. It will be sent to the meter when it is found.';}
  catch(e){$('connMsg').textContent='Saved on this phone. It will be sent to the meter when it is found.';}
  say('Connections saved');
};
window.farrMqTest=async function(){
  $('mqMsg').textContent='Asking the meter to test MQTT…';
  try{const r=await call('mqttTest');$('mqMsg').textContent=(r.ok?'Connected: ':'Failed: ')+(r.message||'');}
  catch(e){$('mqMsg').textContent='Could not reach the meter: '+e.message;}
};

/* ---------- Demo ---------- */
function paintDemo(){
  if(!$('demoOn'))return;   // 2.1.4: the demo card is gone
  const c=sync('config')||{};
  $('demoOn').classList.toggle('on',!!c.demo);$('demoOff').classList.toggle('on',!c.demo);
  $('demoRelay').checked=!!c.demoRealRelay;
}
window.farrDemo=async function(on){
  if(!on&&!await askUser({title:'Turn demo off?',text:'Demo sessions and demo alerts are removed from this phone. Your real history is not touched.',ok:'Turn demo off',tone:'red'}))return;
  try{await call('demo',{on});}catch(e){say(e.message);}
  // 1.8: the demo relay switch is always off again once demo is turned off
  if(!on)sync('setConfig',{demoRealRelay:false});
  paintDemo();say(on?'Demo meter on':'Demo meter off');LIVE=null;loadMS();renderInfo();
};
window.farrDemoRelay=on=>{sync('setConfig',{demoRealRelay:on});};

/* ---------- Info and diagnostics ---------- */
const GUIDES=[
['Reserve 192.168.1.128 for the meter in your router',[
 'The meter already sets 192.168.1.128 itself, so this step is optional insurance against the router giving .128 to another device.',
 'On a phone or computer on home Wi-Fi, open a browser and type 192.168.1.1 (the router address printed on its sticker if that does not work).',
 'Sign in with the router admin password from the sticker.',
 'Find the page called DHCP, LAN, Address Reservation, Static Lease or Bound Devices (each router names it differently).',
 'Add a new reservation: paste the meter MAC address shown in the Meter section below, and type 192.168.1.128.',
 'Save or Apply, then restart the meter (unplug and plug its supply).',
 'Do the same check for the relay board at 192.168.1.120 if you like; do not change the relay board itself.']],
['Calibrate with the car and the Ellies meter',[
 'Start a normal home charge and wait two minutes for the car to settle (about 3000 W on the 13 A cable).',
 'Open Settings → Live meter and calibration.',
 'Read the watts on the Ellies meter and type that number into "Ellies meter reading now".',
 'Tap "Match the meter to this reading". The factor is saved on the meter, so both phones and the displays use it.',
 'Watch the live reading for a minute. If it drifts, repeat with a fresh Ellies reading.',
 'For a manual change, type a factor and tap "Save factor to the meter". 1.000 means uncalibrated.']],
['Move your history from 1.6 to 1.7',[
 'Open the old FARR Q Charge 1.6 web app.',
 'Settings → "Send backup as text" → send it to yourself on WhatsApp.',
 'In WhatsApp, long-press the message → Copy.',
 'Open 1.7 → Settings → "Paste backup" → long-press the box → Paste → "Import pasted backup".',
 'Do this once on each phone. Measured meter sessions come from the meter itself on the first sync at home.',
 'You can also share a 1.6 backup .csv from WhatsApp straight to FARR Q Charge.']],
['Install an update',[
 'Open the download page: '+window.FARR_APP_URL,
 'Download the newest FARR-Q-Charge APK and open it.',
 'Tap Update. Your data stays, because every version is signed with the same permanent key.',
 'Never uninstall to update; uninstalling deletes this phone\'s data unless Android offers to keep it.']],
['Alerts and background checks',[
 'Allow notifications on the Alerts page.',
 'Tap "Allow checks while the phone sleeps" and choose Allow, or Android may delay checks by up to about 10 minutes when the screen is off.',
 'At home on Wi-Fi the app checks about every 30 s while charging and every 5 min when idle; each check is one tiny request.',
 'Away from home nothing runs. When the phone rejoins home Wi-Fi it collects every session and alert the meter stored.']],
['Troubleshooting each alert',[
 'Meter offline: check the meter supply, that the 2.4 GHz "Farrusco" Wi-Fi is on channel 6, and the address in Connections.',
 'Relay OFF but power still flowing: normal while no contactor is fitted; later it means a stuck or bypassed contactor.',
 'Relay command failed: check the relay board is on, at 192.168.1.120, and the token in Connections matches.',
 'Current above the limit: the car drew more than the over-current level; check the cable and socket for heat.',
 'Charging stopped suddenly: power fell from a full charge to nothing within a minute (breaker, plug pulled, car fault or power cut).',
 'Meter clock not set: the meter has no internet time yet; sessions are corrected once it gets the time.']]
];
const TECH=[
['Meter web data (phone and Pi)','GET /api/v1/meter (live) · GET /api/v1/sessions?after=N · GET /api/v1/events?after=N · GET and POST /api/v1/config · GET /api/v1/diag · POST /api/v1/mqtt/test. Plain JSON, no token, home network only. Full field list: docs/meter-contract.md in the farr-q-charge-apk repo.'],
['ESP-NOW broadcast','To FF:FF:FF:FF:FF:FF on channel 6, open, every 2 s and on every change. 40-byte packet starting with "FQEV", version 1. Byte layout in docs/meter-contract.md.'],
['MQTT topics','farrusco/evmeter/status (retained online/offline) · /live (every 5 s) · /session (each finished session, retained) · /event (each alert or AUTO action) · /totals (retained) · /config (retained, no secrets) · /diag (every 60 s). Broker 192.168.1.102:1883, own topic tree only, publishes only.'],
['Relay commands used','GET /api/v1/status · POST /api/v1/relay/{1|2}/{on|off} · POST /api/v1/charge/start · POST /api/v1/charge/stop, header X-Farrusco-Token. The relay board firmware is unchanged. AUTO uses only POST /api/v1/relay/2/off.'],
['Planned clamp wiring (confirmed when the meter is built)','Emporia 200A clamp, 25 mm opening. 100 Ω burden across the two clamp wires. Bias: 3.3 V → 10 kΩ → midpoint → 10 kΩ → GND, 10 µF from midpoint to GND. Clamp sleeve wire → midpoint, clamp tip wire → ESP32-S3 ADC1 pin (GPIO4 planned). Clamp round the live conductor only, K→L arrow towards the car.'],
['Wi-Fi','The ESP32-S3 joins the 2.4 GHz "Farrusco" network only (it has no 5 GHz radio). The router must stay on channel 6 for ESP-NOW. TX power set to the maximum (about 20 dBm).']
];
function section(t,body){return `<div class="card"><div class="label" style="margin-bottom:8px">${esc(t)}</div>${body}</div>`;}
let DIAG=null;
async function renderInfo(){
  const el=$('infoBody'); if(!el)return;
  paintDemo();
  el.innerHTML=infoHTML();
  try{const [d,r,rd,dp]=await Promise.allSettled([call('meterDiag'),call('relayStatus'),call('relayDetails'),call('displayStatus')]);DIAG={meter:d.status==='fulfilled'?d.value:{error:d.reason.message},relay:r.status==='fulfilled'?r.value:{connected:false,message:r.reason.message},relayDet:rd.status==='fulfilled'?rd.value:{reachable:false,message:'Relay board not reachable'},display:dp.status==='fulfilled'?dp.value:{reachable:false,message:'Display not reachable'}};}catch(e){}
  if(screen==='info')el.innerHTML=infoHTML();
  /* 2.2.2.1: while this page is open, refresh the relay board and display details every 8 s (read-only) */
  clearTimeout(window.__infoTimer);
  if(screen==='info')window.__infoTimer=setTimeout(()=>{if(screen==='info')renderInfo();},8000);
}
/* 2.2.2.1: relay board details (4 LED dots, radio, reset) and display details. Details page only, never on Home. */
const RST_WORDS={0:'unknown',1:'power on',2:'reset pin',3:'software restart',4:'crash',5:'watchdog',6:'watchdog',7:'watchdog',8:'deep sleep',9:'brownout (weak supply)',10:'SDIO'};
const RST_BAD=[4,5,6,7,9];
function dot(on,col,label){
  const c=on?col:'rgba(128,128,128,.35)';
  return `<span style="display:inline-flex;flex-direction:column;align-items:center;margin:0 10px;font-size:11px"><span style="width:22px;height:22px;border-radius:50%;background:${c};box-shadow:${on?'0 0 8px '+col:'none'};display:block;margin-bottom:4px"></span>${esc(label)}</span>`;
}
function relayDetHTML(){
  const j=DIAG&&DIAG.relayDet;
  if(!j)return section('Relay board, details','<div class="small">Loading…</div>');
  if(!j.reachable)return section('Relay board, details','<div class="small">'+esc(j.message||'Not reachable')+'</div>'+R('Address',esc(j.address||'')));
  const has=j.led_eskom_green!==undefined;
  let b='';
  b+=R('Eskom relay (relay 1)',j.relay1_on?'ON':'OFF')+R('EV relay (relay 2)',j.relay2_on?'ON':'OFF');
  if(has){
    b+='<div style="display:flex;justify-content:center;padding:10px 0 4px"><div style="text-align:center"><div class="small" style="margin-bottom:6px">ESKOM</div>'+dot(j.led_eskom_green==1,'#2fd37a','green')+dot(j.led_eskom_red==1,'#ff4d4d','red')+'</div><div style="text-align:center"><div class="small" style="margin-bottom:6px">EV</div>'+dot(j.led_ev_green==1,'#2fd37a','green')+dot(j.led_ev_red==1,'#ff4d4d','red')+'</div></div>';
    const exp1=j.relay1_on?[1,0]:[0,1], exp2=j.relay2_on?[1,0]:[0,1];
    const match=j.led_eskom_green==exp1[0]&&j.led_eskom_red==exp1[1]&&j.led_ev_green==exp2[0]&&j.led_ev_red==exp2[1];
    b+=R('LEDs match the relays',match?'yes':'no')+R('LED corrections by the board',esc(j.led_fixes));
  } else b+='<div class="small" style="margin-top:6px">LED details need relay board firmware 2.2 (not on the board yet).</div>';
  if(j.reset_reason!==undefined){const rr=+j.reset_reason;b+=R('Last restart',esc(RST_WORDS[rr]||('code '+rr))+(RST_BAD.includes(rr)?' (unexpected)':''));}
  if(j.uptime_s!==undefined)b+=R('Uptime',esc(fmtUp(j.uptime_s)));
  if(j.wifi_rssi!==undefined)b+=R('Wi-Fi signal',esc(j.wifi_rssi)+' dBm ('+rssiWord(j.wifi_rssi)+') · channel '+esc(j.wifi_channel));
  if(j.free_heap!==undefined)b+=R('Free memory',Math.round(j.free_heap/1024)+' kB (lowest '+Math.round((j.min_free_heap||0)/1024)+' kB)');
  if(j.wifi_connects!==undefined)b+=R('Wi-Fi connects · drops',esc(j.wifi_connects)+' · '+esc(j.wifi_disconnects));
  if(j.espnow_age_ms_waveshare!==undefined)b+=R('Waveshare panel',j.espnow_age_ms_waveshare<0?'not heard':'heard '+Math.round(j.espnow_age_ms_waveshare/1000)+' s ago · '+esc(j.espnow_rssi_waveshare)+' dBm')+R('CrowPanel',j.espnow_age_ms_crowpanel<0?'not heard':'heard '+Math.round(j.espnow_age_ms_crowpanel/1000)+' s ago · '+esc(j.espnow_rssi_crowpanel)+' dBm');
  if(j.monitor_tx_ok!==undefined)b+=R('Home Monitor sends ok · failed',esc(j.monitor_tx_ok)+' · '+esc(j.monitor_tx_fail));
  if(j.fw_diag)b+=R('Firmware',esc(j.fw_diag));
  b+=R('Checked',ago(j.checkedAt));
  return section('Relay board, details',b);
}
function fmtUp(s){s=+s||0;const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return (d?d+' d ':'')+(d||h?h+' h ':'')+m+' min';}
function rssiWord(r){r=+r;return r>-60?'good':r>-70?'fair':r>-80?'weak':'poor';}
function displayHTML(){
  const j=DIAG&&DIAG.display;
  if(!j)return section('Display (dot matrix)','<div class="small">Loading…</div>');
  if(!j.reachable)return section('Display (dot matrix)','<div class="small">'+esc(j.message||'Display not reachable')+'</div>'+R('Address',esc(j.address||'')));
  const stateWord={IDLE:'idle (clock)',CHARGING:'charging',FULL:'full'}[j.state]||esc(j.state);
  const age=v=>v<0?'no good reading':v+' s ago';
  let b=R('Firmware',esc(j.fw))+R('Display state',stateWord)+R('Uptime',esc(fmtUp(j.uptime_s)));
  const rr=String(j.reset_reason||'');
  b+=R('Last restart',esc(rr.replace('_',' '))+(['crash','watchdog','brownout'].includes(rr)?' (unexpected'+(rr==='brownout'?': weak 5 V or USB supply':'')+')':''));
  b+=R('Wi-Fi signal',esc(j.rssi)+' dBm ('+rssiWord(j.rssi)+')')+R('Address · MAC',esc(j.ip)+' · '+esc(j.mac));
  b+=R('Data feeds',j.fault==='none'?'Shelly and relay board OK':'Quiet: '+esc(j.fault));
  b+=R('Shelly power',(j.power_ok?esc(Math.round(j.power_w))+' W':'no fresh reading')+' · '+age(j.shelly_age_s));
  b+=R('Shelly energy',esc(j.energy_wh)+' Wh · '+age(j.energy_age_s));
  b+=R('EV relay as the display reads it',j.relay2===1?'ON':j.relay2===0?'OFF':'unknown')+R('Relay board read',age(j.relay_age_s));
  b+=R('Battery estimate on the display',j.pct_known?esc(Math.round(j.pct))+'%':'--% (no start % sent yet)')+R('Time left on the display',j.minutes_left>=0?esc(j.minutes_left)+' min':'unknown');
  b+=R('Free memory',Math.round((j.heap||0)/1024)+' kB')+R('Checked',ago(j.checkedAt));
  return section('Display (dot matrix)',b);
}
function kv(o,skip){
  if(!o||typeof o!=='object')return '<div class="small">'+esc(o)+'</div>';
  return Object.keys(o).filter(k=>!(skip||[]).includes(k)).map(k=>{const v=o[k];return R(esc(k),esc(v&&typeof v==='object'?JSON.stringify(v):v));}).join('');
}
function infoData(){
  const app=sync('appInfo')||{}, st=sync('state')||{}, c=Object.assign({},sync('config')||{});
  if(c.relayToken)c.relayToken='••••'+c.relayToken.slice(-2);
  if(c.mqttPass)c.mqttPass='••••';
  if(c.remoteToken)c.remoteToken='••••';
  if(c.remoteUrl)c.remoteUrl=c.remoteUrl.slice(0,40)+'…';
  const al=sync('alerts')||{alerts:[]};
  let s1={};try{s1={rateHome:S.rateHome,rateStation:S.rateStation,rateSolar:S.rateSolar,loss:S.loss,pack:S.pack,claim:S.claim,petrol:S.petrol,compare:S.compare,theme:S.theme,entries:E.length,firstEntry:E.length?tstamp(E[0].ts):'--',lastEntry:E.length?tstamp(E[E.length-1].ts):'--'};}catch(e){}
  return {app,st,c,al,s1};
}
/* 1.8: communications health, from what the meter and relay board report right now */
function healthHTML(){
  const L=LIVE&&LIVE.live?LIVE.live:null, RL=DIAG&&DIAG.relay, wf=L&&L.wifi, en=L&&L.espnow, mq=L&&L.mqtt;
  const meter=LIVE&&LIVE.online?'Answering · last read '+ago(LIVE.lastSeen):(LIVE&&LIVE.everSeen?'Not answering · last seen '+ago(LIVE.lastSeen):'Not found yet');
  return section('Communications, live'+(LIVE&&LIVE.demo?' (DEMO)':''),
    R('Architecture','Meter: direct · Relay: direct · Pi/MQTT: optional')+
    R('Meter, HTTP read',esc(meter))+
    R('Wi-Fi signal to meter',wf?esc(wf.rssi)+' dBm · channel '+esc(wf.channel):'not reported yet')+
    R('ESP-NOW to the displays',en?'sent '+esc(en.sent)+' · failed '+esc(en.fail):'not reported yet')+
    R('Last ESP-NOW packet','not reported by the meter yet')+
    R('MQTT to the Pi',mq?esc(mq.enabled?(mq.connected?'connected':'on, not connected'):'off'):'not reported yet')+
    R('Relay board, direct',RL?(RL.connected?'reachable':'not reachable'):'checking…'));
}
function infoHTML(){
  const {app,st,c,al,s1}=infoData(), L=LIVE&&LIVE.live?LIVE.live:(st.lastLive||null), M=DIAG&&DIAG.meter, RL=DIAG&&DIAG.relay;
  let h=healthHTML();
  h+=section('App',kv(app)+R('Background check last ran',ago(st.lastPoll))+R('Last full sync with meter',ago(st.lastSync))+R('Meter last seen',ago(st.lastSeen))+
    R('Measured sessions on this phone',MS.length)+R('Alerts on this phone',(al.alerts||[]).length)+R('Notifications',st.notifAllowed?'allowed':'not allowed')+
    R('Checks while sleeping',st.batteryExempt?'allowed':'limited')+R('On Wi-Fi now',st.onWifi?'yes':'no'));
  h+=section('FARR Q settings (same as 1.6)',kv(s1));
  h+=section('Connections and meter settings stored on this phone',kv(c));
  h+=section('Meter, live reading'+(LIVE&&LIVE.demo?' (DEMO)':''),L?kv(L):'<div class="small">No reading from the meter yet. Address: '+esc(c.meterUrl)+'</div>');
  h+=section('Meter, diagnostics',M?kv(M):'<div class="small">Loading…</div>');
  h+=section('Relay board',RL?kv(RL):'<div class="small">Loading…</div>');
  h+=relayDetHTML();
  h+=displayHTML();
  h+=section('Last 50 alerts and AUTO actions',(al.alerts||[]).slice(0,50).map(x=>R(tstamp(x.ts)+(x.demo?' · DEMO':''),esc(x.text))).join('')||'<div class="small">None.</div>');
  GUIDES.forEach(g=>{h+=section(g[0],'<ol class="small" style="padding-left:18px;margin:0">'+g[1].map(x=>'<li style="margin-bottom:6px">'+esc(x)+'</li>').join('')+'</ol>');});
  TECH.forEach(t=>{h+=section(t[0],'<div class="small">'+esc(t[1])+'</div>');});
  return h;
}
window.farrShareDiag=function(){
  const {app,st,c,al,s1}=infoData(), L=LIVE&&LIVE.live?LIVE.live:(st.lastLive||null);
  const j=o=>JSON.stringify(o,null,1);
  const t=['FARR Q Charge diagnostics · '+new Date().toLocaleString('en-ZA'),
    '== App ==',j(app),j({lastPoll:ago(st.lastPoll),lastSync:ago(st.lastSync),lastSeen:ago(st.lastSeen),onWifi:st.onWifi,notifAllowed:st.notifAllowed,batteryExempt:st.batteryExempt,measuredSessions:MS.length}),
    '== FARR Q settings ==',j(s1),'== Connections ==',j(c),
    '== Meter live ==',j(L),'== Meter diag ==',j(DIAG&&DIAG.meter),'== Relay ==',j(DIAG&&DIAG.relay),'== Relay board details ==',j(DIAG&&DIAG.relayDet),'== Display ==',j(DIAG&&DIAG.display),
    '== Alerts (last 50) ==',(al.alerts||[]).slice(0,50).map(x=>tstamp(x.ts)+' '+(x.demo?'DEMO ':'')+x.level+': '+x.text).join('\n')].join('\n');
  if(N)N.shareText(t,'FARR Q diagnostics');
};


/* ---------- 1.10: charges the owner forgot to log, filled in from the meter ---------- */
/* A finished measured session with no charge log after it becomes a Home charge row (MEASURED kWh, battery % estimated).
   These rows are never stored in the log and never change the trip maths: they disappear as soon as a real charge log is saved. */
window.farrAutoRows=function(src){
  if(!N||!MS||!MS.length||!src||!src.length)return [];
  const sess=MS.filter(x=>!x.demo&&(+x.kwh||0)>=0.1&&x.end_ms>src[0].ts).sort((a,b)=>a.end_ms-b.end_ms);
  const out=[]; let gapKey=null, gapPct=0;
  for(const s of sess){
    let prev=null, next=null;
    for(const e of src){ if(e.ts<s.end_ms)prev=e; else {next=e;break;} }
    if(!prev)continue;
    if(next&&(next.kind==='charge'||next.kind==='start'))continue;     // a real charge log (or a fresh start) after it already covers it
    if(src.some(e=>e.kind==='charge'&&!e.auto&&e.ts>=(+s.start_ms||s.end_ms)&&e.ts<=s.end_ms))continue;   // 2.1.6: a charge log saved while the session was still running covers it too
    if(gapKey!==prev.ts){gapKey=prev.ts;gapPct=prev.pct;}
    const wall=+s.kwh, stored=wall/(1+S.loss/100);
    gapPct=Math.min(100,gapPct+stored/S.pack*100);
    out.push({kind:'charge',type:'charge',ts:s.end_ms,odo:prev.odo,pct:Math.round(gapPct),where:'Home',stored,wall,cost:wall*S.rateHome,measured:true,auto:true});
  }
  return out;
};

/* ---------- 1.10: view from anywhere (a copy of the log in the owner's own Google Sheet) ---------- */
const RM_SCRIPT='2.1.2';
function rmOk(v){return String(v||'')>='2.2.5';}   /* 2.2.5: needs the 2.2.5 script (live reading and alerts for a phone that is away) - an older script says so */
function rmNew(v){return String(v||'')>='2.2.2';}
let rmTimer=null, rmLast=0, rmBusy=false, rmSaveOrig=null, rmPending=null;
/* 2.1.4: the last Sheet sync result, kept so the report can show the Sheet status */
function rmInfoGet(){try{return JSON.parse(localStorage.getItem('farrq.rmInfo')||'{}');}catch(e){return {};}}
function rmInfoSave(o){try{localStorage.setItem('farrq.rmInfo',JSON.stringify(Object.assign(rmInfoGet(),o)));}catch(e){}}
function rmCfg(){const c=sync('config')||{};return c;}
function rmOn(){const c=rmCfg();return !!(N&&c.remoteUrl&&c.remoteToken);}
function rmAutoKeys(rows){return rows.filter(r=>r.type==='charge'&&r.auto).map(r=>r.ts);}
function rmGone(rows){
  /* AUTO rows sent earlier that no longer exist because a real charge log now covers them (the phone still has the session, so it is not just unknown) */
  let sent=[];try{sent=JSON.parse(localStorage.getItem('farrq.rmAuto')||'[]');}catch(e){}
  const now=new Set(rmAutoKeys(rows)), have=new Set((MS||[]).map(x=>x.end_ms));
  return sent.filter(t=>!now.has(t)&&have.has(t));
}
function rmPayload(){
  const real=[...E].sort((a,b)=>a.ts-b.ts), rows=derive();
  const s7=summ(rowsFor(7)), s30=summ(rowsFor(30)), L=lastState()||{};
  const sm=x=>({trips:x.trips,km:+x.km.toFixed(1),eff:x.eff==null?null:+x.eff.toFixed(2),charges:x.charges,wall:+x.wall.toFixed(2),cost:+x.cost.toFixed(2)});
  const autoRemove=rmGone(rows);
  rmPending={sent:rmAutoKeys(rows),gone:autoRemove};
  return {kind:'app',wantReadings:true,wantMeter:true,autoRemove,sent:Date.now(),
    readings:real.map(e=>({ts:e.ts,kind:e.kind,odo:e.odo,pct:e.pct,where:e.where||'',carKm:e.carKm==null?'':e.carKm})),
    charges:rows.filter(r=>r.type==='charge').map(r=>({ts:r.ts,where:r.where||'Unlogged',pct:r.pct,stored:+r.stored.toFixed(2),wall:+r.wall.toFixed(2),cost:+r.cost.toFixed(2),measured:!!r.measured,auto:!!r.auto})),
    trips:rows.filter(r=>r.type==='trip').map(r=>({ts:r.ts,km:+r.km.toFixed(1),kwh:r.countEff?+r.used.toFixed(2):'',cons:r.countEff?+r.cons.toFixed(1):'',odo:r.odo,pct:r.pct})),
    summary:{last7:sm(s7),last30:sm(s30),lastReading:{ts:L.ts||0,odo:L.odo||0,pct:L.pct==null?0:L.pct}},
    sessions:(MS||[]).filter(x=>!x.from_sheet).slice(-300)};   // 2.2.4: copies that came from the Sheet are never sent back
}
function rmPayloadX(){
  const pl=rmPayload();
  try{if(rmNew(rmInfoGet().script)&&window.farr22&&farr22.sheetExtra)pl.extra=farr22.sheetExtra();}catch(e){}
  return pl;
}

/* ---------- 2.1: entries typed on the other phone arrive here (and ours go there) ---------- */
/* Rules: entries are matched by kind + time. Nothing is ever deleted or overwritten here.
   A missing entry is added; a blank "where" or car km is filled in; only the earliest starting point is kept.
   After "Start fresh" on this phone, older entries from the Sheet are ignored. */
function rmMerge(rows){
  const res={added:0,filled:0};
  if(!rows||!rows.length||typeof E==='undefined')return res;
  let epoch=0; try{epoch=+localStorage.getItem('farrq.rmEpoch')||0;}catch(e){}
  const have=new Map(E.map(e=>[e.kind+'|'+e.ts,e]));
  let whoSet=false;   /* 2.2.6: remember who logged an entry (the Sheet keeps the first sender); nothing about this is sent back */
  for(const r of rows){
    const ts=+r.ts, odo=parseFloat(r.odo), pct=parseFloat(r.pct), kind=r.kind;
    if(!ts||isNaN(odo)||isNaN(pct)||!(kind==='trip'||kind==='charge'||kind==='start'))continue;
    if(ts<epoch)continue;
    if(kind==='start'&&E.some(x=>x.kind==='start'&&x.ts<=ts&&!(x.kind+'|'+x.ts===kind+'|'+ts)))continue;   // keep only the earliest starting point
    const where=r.where?String(r.where):'', car=(r.carKm===''||r.carKm==null)?null:parseFloat(r.carKm);
    const loc=have.get(kind+'|'+ts);
    if(!loc){
      const e={kind,ts,odo,pct};
      if(kind==='charge'){if(where)e.where=where;else e.unlogged=true;}
      if(car!=null&&!isNaN(car))e.carKm=car;
      if(r.phone)e.who=String(r.phone);
      E.push(e);have.set(kind+'|'+ts,e);res.added++;
    }else{
      if(!loc.who&&r.phone){loc.who=String(r.phone);whoSet=true;}
      if(kind==='charge'&&!loc.where&&where){loc.where=where;delete loc.unlogged;res.filled++;}
      if(loc.carKm==null&&car!=null&&!isNaN(car)){loc.carKm=car;res.filled++;}
    }
  }
  const starts=E.filter(e=>e.kind==='start').sort((a,b)=>a.ts-b.ts);
  for(let i=1;i<starts.length;i++){E.splice(E.indexOf(starts[i]),1);res.filled++;}
  if(res.added||res.filled||whoSet){
    E.sort((a,b)=>a.ts-b.ts);
    (rmSaveOrig||window.save)();
    try{renderAll();}catch(e){}
  }
  return res;
}
window.farrRmMerge=rmMerge;

/* ---------- 2.2.4: finished Shelly charges and the last meter reading, as copied to the Sheet by the phone at home ---------- */
/* A copy is only added when this phone has no measured session of its own at that time, so at home nothing is ever counted twice.
   Copies are tagged from_sheet: they are never sent back to the Sheet, and the app removes them when the real session arrives. */
function rmMergeMeter(m){
  const res={added:0};
  try{
    if(!m||!Array.isArray(m.sessions)||typeof MS==='undefined')return res;
    loadMS();   // the background check may have stored real sessions since this screen last looked
    let epoch=0; try{epoch=+localStorage.getItem('farrq.rmEpoch')||0;}catch(e){}
    const own=MS.filter(x=>!x.demo&&!x.from_sheet);
    const copies=MS.filter(x=>x.from_sheet).map(x=>x.start_ms);
    for(const s of m.sessions.slice(0,200)){
      const st=+s.start_ms, en=+s.end_ms, kwh=+s.kwh;
      if(!(st>0&&en>st&&kwh>0&&kwh<200)||st<epoch)continue;
      if(copies.some(t=>Math.abs(t-st)<=5000))continue;
      if(own.some(x=>Math.abs(x.start_ms-st)<=60000||(x.start_ms<=en&&x.end_ms>=st)))continue;
      const dur=Math.round((en-st)/1000), tariff=+s.tariff>0?+s.tariff:0;
      const o={store_id:'sheet',seq:0,from_sheet:true,start_ms:st,end_ms:en,kwh:kwh,duration_s:dur,peak_w:+s.peak_w||0,
        avg_w:dur>0?Math.round(kwh*3600000/dur):0,end_reason:String(s.end_reason||'')};
      if(tariff)o.tariff=tariff;
      if(s.cost!==''&&s.cost!=null&&isFinite(+s.cost))o.cost=+s.cost;
      try{sync('importExtra',{kind:'meter',obj:o});copies.push(st);res.added++;}catch(e){}
    }
    const L=m.live;
    if(L&&+L.updated_ms>0){try{localStorage.setItem('farrq.remoteLive',JSON.stringify({at:+L.updated_ms,got:Date.now(),today:L.today_kwh,month:L.month_kwh,total:L.total_kwh,watts:+L.watts||0,charging:!!L.charging}));}catch(e){}}
    if(res.added){loadMS();try{renderAll();}catch(e){}try{renderHome();}catch(e){}}
  }catch(e){}
  return res;
}
window.farrRmMergeMeter=rmMergeMeter;
async function rmSend(manual){
  if(!rmOn()){if(manual)setRm('Enter the web address and password first, then Save.');return;}
  if(rmBusy)return; rmBusy=true;
  if(manual)setRm('Sending…');
  try{
    const pl=rmPayloadX();const r=await call('remotePush',pl);rmLast=Date.now();
    try{if(pl.extra&&window.farr22&&farr22.sheetSent)farr22.sheetSent(pl.extra);}catch(e){}
    try{if(rmPending){const old=JSON.parse(localStorage.getItem('farrq.rmAuto')||'[]').filter(t=>!rmPending.gone.includes(t));localStorage.setItem('farrq.rmAuto',JSON.stringify([...new Set(old.concat(rmPending.sent))].slice(-500)));}}catch(e){}
    let note='', mm={added:0,filled:0};
    try{const m=rmMerge(r.readings);mm=m;if(m.added||m.filled)note=' · '+m.added+' new from the other phone'+(m.filled?', '+m.filled+' filled in':'');if(m.added||m.filled)say('Updated from the other phone');}catch(e){note=' · could not read the other phone ('+e.message+')';}
    try{const mt=rmMergeMeter(r.meter);if(mt.added){note+=' · '+mt.added+' charge'+(mt.added>1?'s':'')+' from the Sheet';say('Charges updated from the Sheet');}}catch(e){}
    const sv=r.script?('Sheet script '+r.script+(rmOk(r.script)?' (matches)':' - paste the new script and redeploy')):'Sheet script is OLD - paste the new script and redeploy';
    rmInfoSave({tryTs:Date.now(),tryOk:true,err:'',okTs:Date.now(),msg:r.message||'ok',script:r.script||'',match:rmOk(r.script),added:mm.added,filled:mm.filled});
    setRm('Synced '+ago(Date.now()).replace('0 s ago','just now')+': '+(r.message||'ok')+note+'\nApp '+(window.FARR_VER||'')+' · '+sv);
  }
  catch(e){rmInfoSave({tryTs:Date.now(),tryOk:false,err:String(e&&e.message||e)});setRm('Not sent: '+e.message);}
  rmBusy=false;
}
function rmSoon(ms){ if(!rmOn())return; clearTimeout(rmTimer); rmTimer=setTimeout(()=>rmSend(false),ms||4000); }
function setRm(t){const el=$('rmMsg');if(el)el.textContent=t;}
function paintRemote(){
  const c=rmCfg();
  if(!$('rm_url'))return;
  $('rm_url').value=c.remoteUrl||'';$('rm_token').value=c.remoteToken||'';$('rm_name').value=c.remoteName||'';
  setRm(c.remoteLastOk?'Last copy sent '+ago(c.remoteLastOk)+'. '+(c.remoteLastMsg||''):(c.remoteUrl?'Not sent yet.':'Off. Nothing leaves this phone until you set this up.'));
}
window.farrRemoteSave=function(){
  const o={remoteUrl:String($('rm_url').value||'').trim(),remoteToken:String($('rm_token').value||'').trim(),remoteName:String($('rm_name').value||'').trim()};
  if(o.remoteUrl&&!/^https:\/\//.test(o.remoteUrl))return say('The Google web address must start with https://');
  sync('setConfig',o); say('Saved'); rmSend(true);
};
window.farrRemoteSend=function(){rmSend(true);};
/* 2.1.4: facts the PDF report prints about the meter and the Google Sheet */
window.farrReportInfo=function(){
  const c=rmCfg(), i=rmInfoGet(), st=sync('state')||{}, now=!!(LIVE&&LIVE.live), L=(LIVE&&LIVE.live)||st.lastLive||null;
  return {ver:window.FARR_VER||'', sheetOn:rmOn(), phone:c.remoteName||'', expectedScript:RM_SCRIPT,
    okTs:i.okTs||c.remoteLastOk||0, msg:i.msg||c.remoteLastMsg||'', script:i.script||'', match:!!i.match,
    added:i.added||0, filled:i.filled||0, tryTs:i.tryTs||0, tryOk:i.tryOk!==false, err:i.err||'',
    meterUrl:c.meterUrl||'', meterType:L?(L.meter_type||''):'', meterSeen:now, lastSeen:st.lastSeen||0,
    rssi:L&&L.wifi?L.wifi.rssi:null, volts:L?L.volts:null, freq:L?L.freq:null};
};
window.farrMeterSessions=function(){return (MS||[]).filter(x=>!x.demo).slice().sort((a,b)=>a.start_ms-b.start_ms);};
window.addEventListener('load',()=>{
  // copy to the Sheet a few seconds after any log is saved, when the app opens, when it comes to the front, and every 90 s while it is open
  try{
    rmSaveOrig=window.save;
    if(typeof rmSaveOrig==='function')window.save=function(){const r=rmSaveOrig.apply(this,arguments);rmSoon(4000);return r;};
    const _sf=window.startFresh;
    if(typeof _sf==='function')window.startFresh=function(){
      const before=E.length;
      const r=_sf.apply(this,arguments);
      if(E.length===1&&before>1){try{localStorage.setItem('farrq.rmEpoch',String(Date.now()-1000));}catch(e){}}
      return r;
    };
  }catch(e){}
  setTimeout(()=>rmSoon(500),6000);
  setInterval(()=>{if(document.visibilityState==='visible'&&Date.now()-rmLast>85000)rmSoon(500);},30000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-rmLast>30000)rmSoon(1500);});
});


/* ---------- 2.2.8.1: Car claim accuracy line graph (1 week, zoomable) ---------- */
(function(){
const DAY=864e5, FULLMAX=3650*DAY;
let V=null; // {a,b} visible window in ms
function pts(){
  try{
    const st=carStats(rowsFor('all'));
    if(!st)return {p:[],avg:null};
    const p=st.C.map(r=>{const real=r.pct*st.realPerPct;return {t:r.ts,v:100-Math.abs((real-r.carKm)/r.carKm*100)};}).sort((a,b)=>a.t-b.t);
    return {p,avg:st.accuracy};
  }catch(e){return {p:[],avg:null};}
}
function week(){const b=Date.now();return {a:b-7*DAY,b:b};}
function trend(p,v){
  const w=p.filter(x=>x.t>=v.a&&x.t<=v.b);
  if(w.length<2)return 'Need at least 2 entries in this window to see a trend.';
  const n=w.length, mt=w.reduce((x,q)=>x+q.t,0)/n, mv=w.reduce((x,q)=>x+q.v,0)/n;
  let sxy=0,sxx=0;w.forEach(q=>{sxy+=(q.t-mt)*(q.v-mv);sxx+=(q.t-mt)*(q.t-mt);});
  if(!(sxx>0))return 'Entries are too close in time for a trend.';
  const span=Math.max(w[n-1].t-w[0].t,1), d=sxy/sxx*span;
  const dir=Math.abs(d)<0.5?'Steady':d>0?'Rising':'Falling';
  return dir+': '+(d>=0?'+':'')+d.toFixed(1)+' points across '+n+' entries.';
}
function dlabel(t){const d=new Date(t);return d.getDate()+'/'+(d.getMonth()+1);}
function draw(){
  const host=document.getElementById('gAcc');if(!host)return;
  const {p,avg}=pts();
  if(!p.length){host.innerHTML='<div class="small">Add the car screen range on the Anytime log to see accuracy over time.</div>';return;}
  if(!V)V=week();
  const W=320,H=210,L=34,Rr=10,T=12,B=26,pw=W-L-Rr,ph=H-T-B;
  const vis=p.filter(x=>x.t>=V.a&&x.t<=V.b);
  let lo=Math.min(...(vis.length?vis:p).map(x=>x.v),avg==null?1e9:avg), hi=Math.max(...(vis.length?vis:p).map(x=>x.v),avg==null?-1e9:avg);
  lo=Math.floor((lo-3)/5)*5;hi=Math.ceil((hi+3)/5)*5;if(hi>100)hi=100;if(lo>=hi)lo=hi-10;
  const X=t=>L+(t-V.a)/(V.b-V.a)*pw, Y=v=>T+(hi-v)/(hi-lo)*ph;
  let g='';
  for(let v=lo;v<=hi;v+=(hi-lo>30?10:5)){g+=`<line x1="${L}" x2="${W-Rr}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" opacity=".12"/><text x="${L-4}" y="${Y(v)+3}" font-size="9" text-anchor="end" fill="currentColor" opacity=".6">${v}%</text>`;}
  const span=V.b-V.a, step=span>20*DAY?7*DAY:span>6*DAY?DAY:span>2*DAY?12*36e5:6*36e5;
  for(let t=Math.ceil(V.a/step)*step;t<=V.b;t+=step){
    const lab=step>=DAY?dlabel(t):(new Date(t).getHours()+'h');
    g+=`<line x1="${X(t)}" x2="${X(t)}" y1="${T}" y2="${T+ph}" stroke="currentColor" opacity=".08"/><text x="${X(t)}" y="${H-10}" font-size="9" text-anchor="middle" fill="currentColor" opacity=".6">${lab}</text>`;
  }
  if(avg!=null&&avg>=lo&&avg<=hi)g+=`<line x1="${L}" x2="${W-Rr}" y1="${Y(avg)}" y2="${Y(avg)}" stroke="#d9a441" stroke-dasharray="4 3"/><text x="${W-Rr}" y="${Y(avg)-3}" font-size="9" text-anchor="end" fill="#d9a441">overall ${avg.toFixed(1)}%</text>`;
  // line through points, clipped to the window via neighbours
  const idx=p.map((x,i)=>i).filter(i=>p[i].t>=V.a&&p[i].t<=V.b);
  const seq=[];
  if(idx.length){const f=idx[0],l=idx[idx.length-1];if(f>0)seq.push(p[f-1]);idx.forEach(i=>seq.push(p[i]));if(l<p.length-1)seq.push(p[l+1]);}
  else{const before=p.filter(x=>x.t<V.a).pop(), after=p.find(x=>x.t>V.b);if(before)seq.push(before);if(after)seq.push(after);}
  if(seq.length>1)g+=`<clipPath id="accClip"><rect x="${L}" y="${T}" width="${pw}" height="${ph}"/></clipPath><polyline clip-path="url(#accClip)" fill="none" stroke="#4aa3ff" stroke-width="2" points="${seq.map(x=>X(x.t).toFixed(1)+','+Y(x.v).toFixed(1)).join(' ')}"/>`;
  vis.forEach(x=>{g+=`<circle cx="${X(x.t).toFixed(1)}" cy="${Y(x.v).toFixed(1)}" r="3.5" fill="#4aa3ff" data-t="${x.t}" data-v="${x.v.toFixed(1)}" class="accDot"/>`;});
  host.innerHTML=`<svg id="accSvg" viewBox="0 0 ${W} ${H}" style="touch-action:none;width:100%">${g}</svg>`+
    `<div class="small" id="accTrend">${trend(p,V)}</div><div class="small" id="accTip">Tap a dot to read it. Drag to move. Pinch or scroll to zoom.</div>`+
    `<div style="margin-top:8px"><button class="btn ghost" id="accReset">Reset to 1 week</button></div>`;
  document.getElementById('accReset').onclick=function(){V=week();draw();};
  const svg=document.getElementById('accSvg');
  svg.querySelectorAll('.accDot').forEach(c=>c.addEventListener('click',()=>{
    const tip=document.getElementById('accTip');if(tip)tip.textContent=new Date(+c.dataset.t).toLocaleString('en-ZA')+' · accuracy '+c.dataset.v+'%';
  }));
  if(!host.__acc){host.__acc=1;attach(host,L,pw);}
}
function clamp(a,b){
  const minSpan=3*36e5;let sp=b-a;
  if(sp<minSpan){const m=(a+b)/2;a=m-minSpan/2;b=m+minSpan/2;sp=minSpan;}
  if(sp>FULLMAX){a=b-FULLMAX;}
  return {a,b};
}
function attach(svg,L,pw){
  const ptrs=new Map();let drag=null,pinch=null;
  const tAt=cx=>{const sv=svg.querySelector('#accSvg')||svg;const r=sv.getBoundingClientRect();const fx=((cx-r.left)/r.width*320-L)/pw;return V.a+Math.min(1,Math.max(0,fx))*(V.b-V.a);};
  const zoom=(f,cx)=>{const c=tAt(cx);V=clamp(c-(c-V.a)*f,c+(V.b-c)*f);draw();};
  svg.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.25:0.8,e.clientX);},{passive:false});
  svg.addEventListener('pointerdown',e=>{
    if(!e.target.closest||!e.target.closest('#accSvg'))return;
    ptrs.set(e.pointerId,{x:e.clientX});
    if(ptrs.size===1)drag={x:e.clientX,a:V.a,b:V.b,moved:false};
    if(ptrs.size===2){const [q,r]=[...ptrs.values()];pinch={d:Math.abs(q.x-r.x),a:V.a,b:V.b,c:tAt((q.x+r.x)/2)};drag=null;}
  });
  svg.addEventListener('pointermove',e=>{
    if(!ptrs.has(e.pointerId))return;ptrs.get(e.pointerId).x=e.clientX;
    if(pinch&&ptrs.size===2){const [q,r]=[...ptrs.values()];const d=Math.abs(q.x-r.x);if(pinch.d>5&&d>5){const f=pinch.d/d;V=clamp(pinch.c-(pinch.c-pinch.a)*f,pinch.c+(pinch.b-pinch.c)*f);draw();}return;}
    if(drag){const rect=(svg.querySelector('#accSvg')||svg).getBoundingClientRect();const dt=-(e.clientX-drag.x)/rect.width*320/pw*(drag.b-drag.a);if(Math.abs(e.clientX-drag.x)>4)drag.moved=true;if(drag.moved){V={a:drag.a+dt,b:drag.b+dt};draw();}}
  });
  const up=e=>{ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;if(ptrs.size===0)drag=null;};
  svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',up);
}
function ensure(){
  if(document.getElementById('gAcc'))return;
  const car=document.getElementById('gCar');if(!car||!car.parentNode)return;
  const card=document.createElement('div');card.className='card';
  card.innerHTML='<div class="label">Car claim accuracy over time (%)</div><div id="gAcc"></div>';
  car.parentNode.parentNode.insertBefore(card,car.parentNode.nextSibling);
}
window.farrPaintAccGraph=function(){try{ensure();V=week();draw();}catch(e){}};
window.farrAccTest={get:()=>V,pts:pts,draw:draw,trend:trend};
})();

/* ---------- 2.2.8.5: Relay Info page (Settings). Reads only the relay /api/v1/status. Additions only. ---------- */
let RI=null, RIBusy=false;          // RI = {j: status json, from: 'relay'|'sheet', seen: ms, phone}
const RI_SHOWN=['relay1_on','relay2_on','wifi_rssi','wifi_channel','uptime_s','free_heap','min_free_heap','wifi_connects','wifi_disconnects','last_disconnect_reason','espnow_rssi_waveshare','espnow_age_ms_waveshare','espnow_rx_waveshare','espnow_rssi_crowpanel','espnow_age_ms_crowpanel','espnow_rx_crowpanel','latched_relay1','latched_relay2','fw_diag','led_eskom_green','led_eskom_red','led_ev_green','led_ev_red','led_fixes','reset_reason','tx_power_set_qdbm','tx_power_now_qdbm','tx_power_now_dbm','since_boot','boot_no','restart_reason_text','time_valid','time_local','log_flash_ok','ignored_frames','relay_log','monitor_tx_ok','monitor_tx_fail','reachable','address','checkedAt','message','ok'];
const RI_WHY={0:'unknown',1:'owner OFF',2:'restart',3:'power loss',4:'update',5:'fault'};
function riYes(v){return v===undefined||v===null?'--':(v===true||v===1||v==='1')?'yes':'no';}
function riAge(ms){return ms===undefined?'--':(+ms<0?'not heard':'heard '+Math.round(+ms/1000)+' s ago');}
function riRows(j){
  const L=[];const add=(a,b)=>{if(b!==undefined&&b!==null&&b!=='')L.push([a,String(b)]);};
  add('Firmware',j.fw_diag);
  if(j.uptime_s!==undefined)add('Uptime',fmtUp(j.uptime_s)+(j.since_boot?' ('+j.since_boot+')':''));
  add('Boot number',j.boot_no);
  if(j.restart_reason_text)add('Restart reason',j.restart_reason_text);
  else if(j.reset_reason!==undefined)add('Restart reason',RST_WORDS[+j.reset_reason]||('code '+j.reset_reason));
  if(j.reset_reason!==undefined&&j.restart_reason_text)add('Chip reset code',(RST_WORDS[+j.reset_reason]||'code')+' ('+j.reset_reason+')');
  if(j.wifi_rssi!==undefined)add('Wi-Fi signal',j.wifi_rssi+' dBm ('+rssiWord(j.wifi_rssi)+')');
  add('Wi-Fi channel',j.wifi_channel);
  add('Wi-Fi connects',j.wifi_connects);add('Wi-Fi drops',j.wifi_disconnects);add('Last drop reason code',j.last_disconnect_reason);
  if(j.tx_power_set_qdbm!==undefined)add('TX power set',(+j.tx_power_set_qdbm/4)+' dBm');
  if(j.tx_power_now_dbm!==undefined)add('TX power now',j.tx_power_now_dbm+' dBm');
  else if(j.tx_power_now_qdbm!==undefined)add('TX power now',(+j.tx_power_now_qdbm/4)+' dBm');
  if(j.espnow_age_ms_crowpanel!==undefined)add('CrowPanel (ESP-NOW)',riAge(j.espnow_age_ms_crowpanel)+' · '+j.espnow_rssi_crowpanel+' dBm'+(j.espnow_rx_crowpanel!==undefined?' · '+j.espnow_rx_crowpanel+' frames':''));
  if(j.espnow_age_ms_waveshare!==undefined)add('Waveshare (ESP-NOW)',riAge(j.espnow_age_ms_waveshare)+' · '+j.espnow_rssi_waveshare+' dBm'+(j.espnow_rx_waveshare!==undefined?' · '+j.espnow_rx_waveshare+' frames':''));
  if(j.relay1_on!==undefined)add('Relay 1 (Eskom)',j.relay1_on?'ON':'OFF');
  if(j.relay2_on!==undefined)add('Relay 2 (EV)',j.relay2_on?'ON':'OFF');
  if(j.latched_relay1!==undefined)add('Relay 1 latched',riYes(j.latched_relay1));
  if(j.latched_relay2!==undefined)add('Relay 2 latched',riYes(j.latched_relay2));
  if(j.led_eskom_green!==undefined)add('LEDs (Eskom green/red · EV green/red)',j.led_eskom_green+'/'+j.led_eskom_red+' · '+j.led_ev_green+'/'+j.led_ev_red);
  add('LED corrections',j.led_fixes);add('Ignored frames',j.ignored_frames);
  if(j.free_heap!==undefined)add('Free memory',Math.round(j.free_heap/1024)+' kB');
  if(j.min_free_heap!==undefined)add('Lowest memory',Math.round(j.min_free_heap/1024)+' kB');
  if(j.time_valid!==undefined)add('Real time valid',riYes(j.time_valid));
  add('Relay clock',j.time_local);
  if(j.log_flash_ok!==undefined)add('Log in flash OK',riYes(j.log_flash_ok));
  if(j.monitor_tx_ok!==undefined)add('Home Monitor sends ok · failed',j.monitor_tx_ok+' · '+j.monitor_tx_fail);
  Object.keys(j).forEach(k=>{if(RI_SHOWN.includes(k))return;const v=j[k];if(v!==null&&typeof v==='object')return;add(k.replace(/_/g,' '),v);});   // any new field a later firmware adds
  return L;
}
function riLogRows(j){
  const a=Array.isArray(j.relay_log)?j.relay_log.slice():[];
  a.sort((x,y)=>((+y.boot||0)-(+x.boot||0))||((+y.since_boot_s||0)-(+x.since_boot_s||0)));   // newest first
  return a.map(e=>{
    const when=e.time&&e.time!=='--'?e.time:('boot '+(e.boot===undefined?'?':e.boot)+', '+(e.since_boot||(e.since_boot_s!==undefined?fmtUp(e.since_boot_s):'')));
    const why=(typeof e.why==='string')?e.why:(RI_WHY[+e.why]||('code '+e.why));
    const rl=e.relay===undefined?'':(e.relay==0||e.relay==='both'?'':'relay '+e.relay);
    return [when,[rl,why,e.src?('from '+e.src):'',e.extra?('('+e.extra+')'):''].filter(Boolean).join(' · ')];
  });
}
function riText(){
  if(!RI)return 'No relay data yet.';
  const j=RI.j,t=['FARR Q relay info · '+new Date().toLocaleString('en-ZA'),'Source: '+(RI.from==='sheet'?'Google Sheet copy, seen '+tstamp(RI.seen)+(RI.phone?' by '+RI.phone:''):'relay board, just now')];
  riRows(j).forEach(r=>t.push(r[0]+': '+r[1]));
  const lg=riLogRows(j);t.push('','OFF / restart log, newest first ('+lg.length+'):');
  lg.forEach(r=>t.push(r[0]+' · '+r[1]));
  return t.join('\n');
}
function riPaint(msg){
  const el=$('relayInfoBody');if(!el)return;
  let h='';
  if(msg)h+='<div class="card small">'+esc(msg)+'</div>';
  if(RI){
    const j=RI.j;
    h+='<div class="small" style="margin:0 0 8px">'+(RI.from==='sheet'?'Copy from the Google Sheet, seen '+esc(ago(RI.seen))+(RI.phone?' by '+esc(RI.phone):'')+'. Not live.':'Live from the relay board, '+esc(ago(RI.seen))+'.')+'</div>';
    h+=section('Relay board',riRows(j).map(r=>R(esc(r[0]),esc(r[1]))).join('')||'<div class="small">Nothing reported</div>');
    const lg=riLogRows(j);
    h+=section('Relay log: ON, OFF and restarts, newest first',lg.length?lg.map(r=>R(esc(r[0]),esc(r[1]))).join(''):'<div class="small">No entries yet. (Firmware 2.4 logs OFF and restart events; 2.5 will keep 50 and add ON events.)</div>');
  }else h+='<div class="card small">No relay data yet. Tap Refresh when this phone is on the home Wi-Fi.</div>';
  const sh=RI_SHEET;
  h+=section('Last seen from the Sheet',sh?R('Seen',esc(tstamp(sh.seen))+' ('+esc(ago(sh.seen))+')')+(sh.phone?R('By phone',esc(sh.phone)):'')+(sh.status&&sh.status.fw_diag?R('Firmware',esc(sh.status.fw_diag)):'')+(sh.status&&sh.status.boot_no!==undefined?R('Boot number',esc(sh.status.boot_no)):''):'<div class="small">Empty. Fills when a phone at home taps Refresh here and the Sheet script 2.2.8.5 is deployed. Firmware 2.5 will push it by itself.</div>');
  el.innerHTML=h;
}
let RI_SHEET=null;
try{RI_SHEET=JSON.parse(localStorage.getItem('farrq.relayInfoSheet')||'null');}catch(e){}
async function relayInfoLoad(manual){
  if(RIBusy)return;RIBusy=true;riPaint(RI?'':'Loading…');
  let live=null,err='';
  try{const j=await call('relayDetails');if(j&&j.reachable!==false&&!j.error)live=j;else err=(j&&(j.message||j.error))||'Relay not reachable';}catch(e){err=String(e&&e.message||e);}
  if(live){
    RI={j:live,from:'relay',seen:live.checkedAt||Date.now()};
    riPaint();
    if(manual&&rmOn()){try{await call('remotePush',{kind:'relay',sent:Date.now(),relay:live});say('Copied to the Sheet');}catch(e){}}
  }else{
    let note='Relay not reachable from here ('+err+'). It answers only on the home Wi-Fi.';
    if(rmOn()){
      try{
        const r=await call('remotePush',{kind:'pull',sent:Date.now(),wantRelay:true});
        if(r&&r.relay&&r.relay.status&&Object.keys(r.relay.status).length){
          RI_SHEET={seen:+r.relay.seen||0,phone:r.relay.phone||'',status:r.relay.status};
          try{localStorage.setItem('farrq.relayInfoSheet',JSON.stringify(RI_SHEET));}catch(e){}
          RI={j:r.relay.status,from:'sheet',seen:RI_SHEET.seen,phone:RI_SHEET.phone};
          note='Relay not reachable from here. Showing the last copy from the Sheet.';
        }else if(!RI)note+=' The Sheet has no relay copy yet.';
      }catch(e){if(!RI)note+=' Sheet: '+String(e&&e.message||e);}
    }
    riPaint(note);
  }
  RIBusy=false;
}
window.farrRelayInfoRefresh=function(){relayInfoLoad(true);};
window.farrRelayInfoCopy=function(){
  const t=riText();
  try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(()=>say('Copied'),()=>{if(N)N.shareText(t,'FARR Q relay info');});return;}}catch(e){}
  if(N)N.shareText(t,'FARR Q relay info');
};
window.farrRelayInfoTest={rows:riRows,log:riLogRows,text:riText,set:j=>{RI={j:j,from:'relay',seen:Date.now()};riPaint();}};

/* ---------- screen changes (called from go()) ---------- */
window.farrOnScreen=function(id){
  screen=id;
  clearTimeout(timer);clearTimeout(relayTimer);
  if(id==='home'){paintHomeCard();tick();relayLoop();}
  if(id==='meter'){paintMeter();paintSessions();loadMeterConfig();tick();}
  if(id==='relay'){RELAY=null;paintRelay();paintRelayAuto();loadMeterConfig();tick();relayLoop();}
  if(id==='graph')window.farrPaintAccGraph();
  if(id==='alerts')paintAlerts();
  if(id==='conn'){paintConn();paintRemote();tick();}
  if(id==='info'){renderInfo();tick();}
  if(id==='relayinfo'){relayInfoLoad(false);tick();}
  if(id==='set'){const a=sync('alerts');const u=a&&a.unread;const el=$('alertsRowSub');if(el)el.textContent=u?u+' new alert'+(u>1?'s':''):'Every alert, notifications and background checks';}
};
})();
