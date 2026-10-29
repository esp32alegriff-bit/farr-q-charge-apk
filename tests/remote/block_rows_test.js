// Ver_FarrQ_2.2.6: the "EV meter copied from the Sheet" block shows the last battery %, who logged it, car km, odometer and the last finished charge.
// It must use only data 2.2.5 already sends and receives (nothing new is asked from the Sheet, nothing new is sent).
// Usage: NODE_PATH=$(npm root -g) PW_MODULE=playwright CHROME=<chromium> node tests/remote/block_rows_test.js
const path=require('path');
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
const {chromium}=require(process.env.PW_MODULE||'playwright');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium'});
 const pg=await b.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 const now=Date.now(), H=3600e3;
 await pg.addInitScript(()=>{
  const cfg={remoteUrl:'https://script.google.com/macros/s/abc/exec',remoteToken:'pw',remoteName:'Antonio',meterUrl:'x'};
  window.__calls=[];window.__store=[];window.__meter=null;window.__readings=[];
  const key=s=>(s.store_id||'')+'#'+(s.seq||0)+'#'+s.start_ms;
  window.FarrNative={sync(m,a){a=JSON.parse(a||'{}');
    if(m==='config')return JSON.stringify(cfg);
    if(m==='setConfig'){Object.assign(cfg,a);return JSON.stringify(cfg);}
    if(m==='sessions')return JSON.stringify({sessions:window.__store});
    if(m==='importExtra'){if(a.kind==='meter'){const o=a.obj;if(!window.__store.some(s=>key(s)===key(o)))window.__store.push(o);}return '{}';}
    return JSON.stringify({});},
   call(id,m,a){window.__calls.push({m,a:JSON.parse(a)});setTimeout(()=>window.__farrCb(id,true,JSON.stringify({ok:true,message:'Sheet updated',script:'2.2.5',readings:window.__readings,meter:window.__meter})),10);},
   shareText(){},shareFile(){}};
  const t=Date.now();
  localStorage.setItem('farrq.entries',JSON.stringify([{ts:t-30*3600e3,kind:'charge',odo:1000,pct:50,where:'Home'},{ts:t-20*3600e3,kind:'trip',odo:1040,pct:40}]));
 });
 await pg.goto('file://'+path.resolve(__dirname,'../../app/src/main/assets/web/index.html'));
 await pg.waitForTimeout(1200);

 // nothing synced yet: the block adds nothing and does not break
 let t0=await pg.evaluate(()=>{try{return typeof farrRemoteExtraRows==='function'?farrRemoteExtraRows().replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim():'NOFUNC';}catch(e){return 'ERR '+e.message;}});
 ok(t0!=='NOFUNC'&&!t0.startsWith('ERR'),'helper exists and runs');
 ok(t0.includes('Last battery % logged')&&t0.includes('40%'),'before any sync it shows this phone\'s own last reading (40%)');
 ok(!t0.includes('Last charge'),'no finished charge yet: no charge rows');

 // the Sheet answers with Estelle's newer Anytime log and one finished charge
 const B={start_ms:now-5*H,end_ms:now-3*H,kwh:8.25,minutes:120,peak_w:2810,end_reason:'below_threshold',cost:32.01,tariff:3.88};
 const live={updated_ms:now-3*H,charging:true,watts:2600,today_kwh:13.75,month_kwh:99.5,total_kwh:900};
 await pg.evaluate(({B,live,now,H})=>{
  window.__meter={sessions:[B],live};
  window.__readings=[
   {ts:now-2*H,kind:'trip',odo:1100,pct:87,where:'',carKm:346,phone:'Estelle the Wife'},
   {ts:now-20*H,kind:'trip',odo:1040,pct:40,where:'',carKm:'',phone:'Antonio'}];
 },{B,live,now,H});
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(800);
 const html=await pg.evaluate(()=>farrRemoteBlockHTML());
 const txt=html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
 ok(html.includes('EV meter · copied from the Sheet'),'the block is still there');
 ok(/Last battery % logged\s*87%\s*·\s*Estelle the Wife/.test(txt),'last battery % 87% and who logged it');
 ok(/Car said\s*346 km/.test(txt),'car said 346 km');
 ok(/Odometer\s*1100 km/.test(txt),'odometer 1100 km');
 ok(/Last charge\s*8\.25 kWh · 120 min · R32\.01/.test(txt),'last finished charge: 8.25 kWh, 120 min, R32.01');
 ok(txt.includes('Last charge ended'),'last charge end time shown');
 ok(txt.includes('Charging then')&&txt.includes('Day total then')&&txt.includes('Month total then'),'old rows unchanged');

 // an older local entry gets its name from the Sheet, nothing else changes
 const who=await pg.evaluate(()=>JSON.parse(localStorage.getItem('farrq.entries')||'[]').map(e=>({ts:e.ts,pct:e.pct,who:e.who})));
 ok(who.some(e=>e.pct===40&&e.who==='Antonio'),'older local entry gets "Antonio" from the Sheet');

 // 2.2.5 compatibility: nothing new is sent to the Sheet
 const sent=await pg.evaluate(()=>JSON.stringify(window.__calls.map(c=>c.a)));
 ok(!sent.includes('"who"'),'the payload sent to the Sheet never carries "who"');
 const keys=await pg.evaluate(()=>{const c=window.__calls.filter(x=>x.a&&x.a.kind==='app').pop();return c?Object.keys(c.a).sort().join(','):'';});
 ok(keys==='autoRemove,charges,kind,readings,sent,sessions,summary,trips,wantMeter,wantReadings',"payload keys are exactly the 2.2.5 keys ("+keys+")");
 const rk=await pg.evaluate(()=>{const c=window.__calls.filter(x=>x.a&&x.a.kind==='app').pop();return c&&c.a.readings[0]?Object.keys(c.a.readings[0]).sort().join(','):'';});
 ok(rk==='carKm,kind,odo,pct,ts,where',"each reading sent has exactly the 2.2.5 fields ("+rk+")");

 // a Sheet reply without a phone name (older script) shows no name and does not break
 await pg.evaluate(({now,H})=>{window.__readings=[{ts:now-1*H,kind:'trip',odo:1110,pct:85,where:'',carKm:340}];},{now,H});
 await pg.evaluate(()=>farrRemoteSend());await pg.waitForTimeout(800);
 const t2=(await pg.evaluate(()=>farrRemoteBlockHTML())).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
 ok(/Last battery % logged\s*85%\s/.test(t2)&&!/85%\s*·/.test(t2),'no phone name: shows 85% with no name, no error');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs.join(' | '):''));
 await b.close();
 console.log(fail?('FAILED '+fail):'ALL PASS');process.exit(fail?1:0);
})();
