/* FARR Q Charge Ver_FarrQ_1.7 layer.
   Adds the EV meter, relays, AUTO, calibration, alerts, demo meter and diagnostics
   on top of the unchanged 1.6 screens. Talks to the Android side through window.FarrNative.
   Loaded BEFORE the main app script, so it must not read app variables (S, E, ...) at load time. */
(function(){
'use strict';
const N=window.FarrNative||null;
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

/* ---------- measured sessions (from the meter, kept on this phone) ---------- */
let MS=[], MSdemo=[];
function loadMS(){const s=sync('sessions');MS=(s&&s.sessions)||[];MSdemo=(s&&s.demo)||[];}
loadMS();
window.measuredBetween=function(a,b){
  let k=0,n=0;
  for(const x of MS){if(x.end_ms>a&&x.end_ms<=b){k+=+x.kwh||0;n++;}}
  return n?{kwh:k,count:n}:null;
};

/* ---------- backup rows (same 8 columns as 1.6, so 1.6 simply skips them) ---------- */
window.farrBackupExtra=function(){
  if(!N)return [];
  const out=[], row=(ts,kind,payload)=>{const d=new Date(ts);out.push([d.toLocaleDateString('en-ZA'),d.toLocaleTimeString('en-ZA'),kind,'','',b64e(payload),'',ts].join(','));};
  MS.forEach(x=>row(x.start_ms||x.end_ms,'meter',x));
  const a=sync('alerts'); ((a&&a.alerts)||[]).filter(x=>!x.demo).slice(0,300).forEach(x=>row(x.ts,'alert',x));
  const c=sync('config'); if(c){const k=Object.assign({},c);delete k.relayToken;delete k.mqttPass;delete k.demo;row(Date.now(),'settings17',k);}
  return out;
};
window.farrImportExtra=function(c){
  const kind=c[2];
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
  const on=document.querySelector('.screen.on'); const id=on?on.id.slice(2):'home';
  if(id==='home')return false;
  if(['meter','relay','alerts','conn','info'].includes(id))go('set');
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
  if(LIVE&&LIVE.sessionsCount!=null&&LIVE.sessionsCount!==MS.length){loadMS();try{renderHome();}catch(e){}}
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
  if(screen==='home')paintHomeCard();
  if(screen==='meter')paintMeter();
  if(screen==='relay')paintRelayAuto();
}

/* ---------- Home card ---------- */
function paintHomeCard(){
  const el=$('meterCard'); if(!el)return;
  const L=LIVE, st=statusText(L), v=L&&L.live;
  const unread=(L&&L.unread)||0;
  let h='';
  if(unread)h+=`<div class="card" style="border-color:var(--gold)" onclick="go('alerts')"><div class="small" style="color:var(--gold)">${unread} new alert${unread>1?'s':''}. Tap to open.</div></div>`;
  if(!v){
    h+=`<div class="card" onclick="go('meter')"><div class="hdr-row"><div class="label">EV meter</div><div class="small">${esc(st)}</div></div>`+
       `<div class="small">${L&&L.everSeen?'The meter is not answering. Last seen '+ago(L.lastSeen)+'.':'Meter not found yet. It will show here once it is connected at 192.168.1.128.'}</div></div>`;
    el.innerHTML=h;return;
  }
  const se=v.session;
  h+=`<div class="card" onclick="go('meter')"><div class="hdr-row"><div class="label">EV meter${L.demo?' · DEMO':''}</div><div class="small">${esc(st)}</div></div>`+
     `<div class="big">${n2(v.watts,0)} W</div>`+
     R('Current',n2(v.amps,2)+' A')+
     R('This session',se?n2(se.kwh,2)+' kWh · R'+n2(se.kwh*rate(),2)+' · '+dur(se.duration_s):'--')+
     R('Today',n2(v.today_kwh,2)+' kWh · R'+n2((v.today_kwh||0)*rate(),2))+
     R('Mode',esc(v.mode||'--'))+
     R('EV relay',v.relay&&v.relay.reachable?(v.relay.relay2_on?'ON':'OFF'):'unknown')+
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
  try{const c=await call('meterConfigSet',obj);CFG=c||CFG;if(msgEl)$(msgEl).textContent=okText||'Saved to the meter.';say(okText||'Saved to the meter');paintModeChips();return true;}
  catch(e){const t='Could not reach the meter: '+e.message;if(msgEl)$(msgEl).textContent=t;say(t);return false;}
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
function paintModeChips(){
  const m=(CFG&&CFG.mode)||(LIVE&&LIVE.live&&LIVE.live.mode)||'MANUAL';
  if($('modeManual')){$('modeManual').classList.toggle('on',m==='MANUAL');$('modeAuto').classList.toggle('on',m==='AUTO');}
}
function paintRelayAuto(){
  const v=LIVE&&LIVE.live;
  paintModeChips();
  const a=v&&v.auto;
  $('autoState').textContent=!v?'Meter not connected, so AUTO cannot run yet.':
    v.mode!=='AUTO'?'MANUAL: the meter never switches anything.':
    'AUTO is '+(a&&a.state?a.state:'watching')+(a&&a.below_s?' · below the level for '+a.below_s+' s':'')+'.';
}
function paintRelay(){
  const r=RELAY;
  $('rStatus').textContent=!r?'Checking…':r.connected?'Connected':'Not reachable';
  $('rRows').innerHTML=r&&r.connected?
    R('Relay 1 · Eskom input',r.relay1On?'ON':'OFF')+R('Relay 2 · EV charger',r.relay2On?'ON':'OFF')+R('Relay says',esc(r.message||''))
    :`<div class="small">${esc((r&&r.message)||'')}</div>`;
}
async function relayLoop(){
  clearTimeout(relayTimer);
  if(screen!=='relay'||document.visibilityState!=='visible')return;
  try{RELAY=await call('relayStatus');}catch(e){RELAY={connected:false,message:e.message};}
  paintRelay();
  relayTimer=setTimeout(relayLoop,3000);
}
async function relayCmd(path){
  try{RELAY=await call('relay',{path});paintRelay();say(RELAY.connected?'Done':'Relay did not answer: '+(RELAY.message||''));}
  catch(e){say('Relay did not answer: '+e.message);}
}
window.farrRelay=function(n,on){
  if(n===1&&!on&&!confirm('Switch Relay 1 (Eskom input) OFF?'))return;
  relayCmd('/api/v1/relay/'+n+'/'+(on?'on':'off'));
};
window.farrCharge=function(start){
  if(!confirm(start?'START CHARGING: Eskom ON, then EV ON?':'STOP CHARGING: EV OFF, then Eskom OFF?'))return;
  relayCmd(start?'/api/v1/charge/start':'/api/v1/charge/stop');
};
window.farrMode=function(m){
  if(m==='AUTO'&&!confirm('Switch to AUTO? The meter will switch the EV relay OFF when charging finishes.'))return;
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
window.farrClearAlerts=()=>{if(confirm('Clear the alert list on this phone?')){sync('clearAlerts');paintAlerts();}};
window.farrSyncNow=async function(){say('Checking the meter…');try{const r=await call('sync');say(r.message||'Done');}catch(e){say(e.message);}loadMS();if(screen==='alerts')paintAlerts();};

/* ---------- Connections ---------- */
let mqOn=false;
function paintConn(){
  const c=sync('config')||{};
  $('cf_meter').value=c.meterUrl||'';$('cf_relay').value=c.relayUrl||'';$('cf_token').value=c.relayToken||'';
  $('cf_mqhost').value=c.mqttHost||'';$('cf_mqport').value=c.mqttPort||'';$('cf_mquser').value=c.mqttUser||'';$('cf_mqpass').value=c.mqttPass||'';
  mqOn=!!c.mqttEnabled;paintMq();
  $('connMsg').textContent=c.pendingMeter?'Waiting to send these to the meter when it is found.':'';
}
function paintMq(){$('mqOn').classList.toggle('on',mqOn);$('mqOff').classList.toggle('on',!mqOn);}
window.farrMq=on=>{mqOn=on;paintMq();};
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
  const c=sync('config')||{};
  $('demoOn').classList.toggle('on',!!c.demo);$('demoOff').classList.toggle('on',!c.demo);
  $('demoRelay').checked=!!c.demoRealRelay;
}
window.farrDemo=async function(on){
  if(!on&&!confirm('Switch the demo meter off? Demo sessions and demo alerts are removed.'))return;
  try{await call('demo',{on});}catch(e){say(e.message);}
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
 'Do the same check for the relay board at 192.168.1.127 if you like; do not change the relay board itself.']],
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
 'Relay command failed: check the relay board is on, at 192.168.1.127, and the token in Connections matches.',
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
  try{const [d,r]=await Promise.allSettled([call('meterDiag'),call('relayStatus')]);DIAG={meter:d.status==='fulfilled'?d.value:{error:d.reason.message},relay:r.status==='fulfilled'?r.value:{connected:false,message:r.reason.message}};}catch(e){}
  if(screen==='info')el.innerHTML=infoHTML();
}
function kv(o,skip){
  if(!o||typeof o!=='object')return '<div class="small">'+esc(o)+'</div>';
  return Object.keys(o).filter(k=>!(skip||[]).includes(k)).map(k=>{const v=o[k];return R(esc(k),esc(v&&typeof v==='object'?JSON.stringify(v):v));}).join('');
}
function infoData(){
  const app=sync('appInfo')||{}, st=sync('state')||{}, c=Object.assign({},sync('config')||{});
  if(c.relayToken)c.relayToken='••••'+c.relayToken.slice(-2);
  if(c.mqttPass)c.mqttPass='••••';
  const al=sync('alerts')||{alerts:[]};
  let s1={};try{s1={rateHome:S.rateHome,rateStation:S.rateStation,rateSolar:S.rateSolar,loss:S.loss,pack:S.pack,claim:S.claim,petrol:S.petrol,compare:S.compare,theme:S.theme,entries:E.length,firstEntry:E.length?tstamp(E[0].ts):'--',lastEntry:E.length?tstamp(E[E.length-1].ts):'--'};}catch(e){}
  return {app,st,c,al,s1};
}
function infoHTML(){
  const {app,st,c,al,s1}=infoData(), L=LIVE&&LIVE.live?LIVE.live:(st.lastLive||null), M=DIAG&&DIAG.meter, RL=DIAG&&DIAG.relay;
  let h='';
  h+=section('App',kv(app)+R('Background check last ran',ago(st.lastPoll))+R('Last full sync with meter',ago(st.lastSync))+R('Meter last seen',ago(st.lastSeen))+
    R('Measured sessions on this phone',MS.length)+R('Alerts on this phone',(al.alerts||[]).length)+R('Notifications',st.notifAllowed?'allowed':'not allowed')+
    R('Checks while sleeping',st.batteryExempt?'allowed':'limited')+R('On Wi-Fi now',st.onWifi?'yes':'no')+R('Demo meter',c.demo?'ON':'off'));
  h+=section('FARR Q settings (same as 1.6)',kv(s1));
  h+=section('Connections and meter settings stored on this phone',kv(c));
  h+=section('Meter, live reading'+(LIVE&&LIVE.demo?' (DEMO)':''),L?kv(L):'<div class="small">No reading from the meter yet. Address: '+esc(c.meterUrl)+'</div>');
  h+=section('Meter, diagnostics',M?kv(M):'<div class="small">Loading…</div>');
  h+=section('Relay board',RL?kv(RL):'<div class="small">Loading…</div>');
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
    '== Meter live ==',j(L),'== Meter diag ==',j(DIAG&&DIAG.meter),'== Relay ==',j(DIAG&&DIAG.relay),
    '== Alerts (last 50) ==',(al.alerts||[]).slice(0,50).map(x=>tstamp(x.ts)+' '+(x.demo?'DEMO ':'')+x.level+': '+x.text).join('\n')].join('\n');
  if(N)N.shareText(t,'FARR Q diagnostics');
};

/* ---------- screen changes (called from go()) ---------- */
window.farrOnScreen=function(id){
  screen=id;
  clearTimeout(timer);clearTimeout(relayTimer);
  if(id==='home'){paintHomeCard();tick();}
  if(id==='meter'){paintMeter();paintSessions();loadMeterConfig();tick();}
  if(id==='relay'){RELAY=null;paintRelay();paintRelayAuto();loadMeterConfig();tick();relayLoop();}
  if(id==='alerts')paintAlerts();
  if(id==='conn')paintConn();
  if(id==='info')renderInfo();
  if(id==='set'){const a=sync('alerts');const u=a&&a.unread;const el=$('alertsRowSub');if(el)el.textContent=u?u+' new alert'+(u>1?'s':''):'Every alert, notifications and background checks';}
};
})();
