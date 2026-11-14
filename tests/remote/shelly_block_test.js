// Ver_FarrQ_2.2.8.5_A: verdicts worked out afterwards from the saved records, wall kWh per 100 km learned from real odometers,
// odometer worked out without a loss figure, no double count, trip start after a full Shelly charge, real start time of the running charge.
// Usage: NODE_PATH=$(npm root -g) PW_MODULE=playwright CHROME=<chromium> node tests/remote/shelly_block_test.js
const path=require('path');let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
const {chromium}=require(process.env.PW_MODULE||'playwright');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium'});
 const ctx=await b.newContext({viewport:{width:390,height:800},timezoneId:'Africa/Johannesburg',locale:'en-ZA'});
 const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 await pg.clock.install({time:new Date('2026-11-10T12:00:00+02:00').getTime()});
 await pg.addInitScript(()=>{
  const T=(d,h,m)=>new Date(2026,10,d,h,m,0).getTime();
  const S=[
   {start_ms:T(2,11,47),end_ms:T(2,13,24),kwh:4.16,cost:16.13,peak_w:2810},   // 0 the start charge: full (you said so), 1981 km
   {start_ms:T(3,18,0),end_ms:T(3,20,0),kwh:3.0,cost:11.64,peak_w:2800},      // 1 the phone at home saw a relay off, nothing else known: not completed
   {start_ms:T(3,20,2),end_ms:T(3,20,5),kwh:0.05,cost:0.19,peak_w:1700},      // 2 too short
   {start_ms:T(4,8,0),end_ms:T(4,10,0),kwh:10.0,cost:38.8,peak_w:2800},       // 3 77% typed 10 min before it: the kWh fit 100%. Real odometer 2041
   {start_ms:T(5,12,0),end_ms:T(5,13,0),kwh:1.5,cost:5.82,peak_w:2800},       // 4 nothing else known: the Shelly alone says the car stopped by itself
   {start_ms:T(6,18,0),end_ms:T(6,21,0),kwh:8.0,cost:31.04,peak_w:2800},      // 5 100% typed the next morning, same odometer: full. Real odometer 2091
   {start_ms:T(8,10,0),end_ms:T(8,11,0),kwh:2.0,cost:7.76,peak_w:2800},       // 6 went on again 5 min later: a pause
   {start_ms:T(8,11,5),end_ms:T(8,12,0),kwh:2.0,cost:7.76,peak_w:2800},       // 7 the relay's own log has an OFF at the stop
   {start_ms:T(9,15,0),end_ms:T(9,16,0),kwh:2.5,cost:9.7,peak_w:2800},        // 8 85% typed after it, same odometer: not completed
   {start_ms:T(10,6,0),end_ms:T(10,9,0),kwh:7.0,cost:27.16,peak_w:2800,duration_s:10800}       // 9 the relay copy shows both relays ON since before the start: full
  ];
  const A=[
   {ts:T(3,20,1),type:'charge_not_full',level:'info',text:'Charge ended before full, 3.00 kWh. A relay was switched off while the car was charging.'},
   {ts:T(10,9,20),type:'charge_full_unsure',level:'info',text:'Charge ended, 7.00 kWh, not sure it was full. Not decided in time.'},
   {ts:T(10,10,28),type:'session_start',level:'info',text:'Charging started'}
  ];
  const E=[
   {ts:T(1,8,0),kind:'start',odo:1900,pct:50},
   {ts:T(4,7,50),kind:'trip',odo:2041,pct:77},
   {ts:T(6,17,55),kind:'trip',odo:2091,pct:80},
   {ts:T(6,20,0),kind:'charge',odo:2091,pct:95,where:'Home'},                 // typed while charge 5 was still running
   {ts:T(7,6,0),kind:'charge',odo:2091,pct:100,where:'Home'},
   {ts:T(9,16,10),kind:'charge',odo:2091,pct:85,where:'Home'}
  ];
  localStorage.setItem('farrq.entries',JSON.stringify(E));
  localStorage.setItem('farrq.remoteLive',JSON.stringify({at:T(10,11,58),charging:true,watts:2600,today:10.9,month:50,total:200}));
  localStorage.setItem('farrq.relayInfoSheet',JSON.stringify({seen:T(10,11,0),phone:'Relay board',status:{relay1_on:true,relay2_on:true,relay1_on_s:18060,relay2_on_s:18059,
   relay_log:[{time:'2026-11-08 12:00:20 CAT',relay:2,src:'C',why:'Relay switched OFF (owner)'},{time:'2026-11-10 05:59:00 CAT',relay:1,src:'H',why:'Relay switched ON (owner)'}]}}));
  window.FarrNative={sync(m){if(m==='config')return JSON.stringify({});if(m==='alerts')return JSON.stringify({alerts:A,types:[],off:[]});return JSON.stringify({sessions:S});},call(){},shareText(){},shareFile(){}};
 });
 await pg.goto('file://'+path.resolve(__dirname,'../../app/src/main/assets/web/index.html'));
 await pg.waitForTimeout(1200);
 const c=await pg.evaluate(()=>{const r=window.farrShelly.calc();return {eff:r.eff,odo:r.odo,firm:r.firm,pool:r.pool,poolN:r.poolN,base:r.base,minKm:r.minKm,
   fulls:r.fulls.map(f=>({pool:f.pool,poolN:f.poolN,km:f.km,odo:f.odo,real:f.real})),v:r.all.map(x=>x.v.k),by:r.all.map(x=>x.v.by||'')};});
 ok(c.v.join(',')==='full,not_full,short,full,full,full,not_full,not_full,not_full,full','verdicts: '+c.v.join(','));
 ok(/relay off/.test(c.by[1]),'1: '+c.by[1]);
 ok(/fit 100% from 77%/.test(c.by[3]),'3: '+c.by[3]);
 ok(/Shelly only/.test(c.by[4]),'4: '+c.by[4]);
 ok(/100% typed/.test(c.by[5]),'5: '+c.by[5]);
 ok(/again 5 min later/.test(c.by[6]),'6: '+c.by[6]);
 ok(/relay was switched off at the stop/.test(c.by[7]),'7: '+c.by[7]);
 ok(/85% typed/.test(c.by[8]),'8: '+c.by[8]);
 ok(/relays stayed on/.test(c.by[9]),'9 (the old "not sure" alert does not win): '+c.by[9]);
 // wall kWh per 100 km: 1981 -> 2041 km on 13.05 kWh, 2041 -> 2091 km on 9.5 kWh
 const eff=(13.05+9.5)/110*100;
 ok(c.eff.n===2&&Math.abs(c.eff.v-eff)<1e-6,'learned from 2 full-to-full stretches: '+c.eff.v.toFixed(3)+' wall kWh per 100 km');
 ok(c.fulls.length===4&&c.fulls[0].real===2041&&c.fulls[2].real===2091&&c.fulls[1].real==null,'full charges carry the real odometer where one was read');
 ok(Math.abs(c.fulls[0].odo-(1981+13.0/eff*100))<0.01,'worked out at the first full: '+c.fulls[0].odo.toFixed(1)+' against the real 2041');
 ok(Math.abs(c.odo-(2091+13.5/eff*100))<0.01&&c.firm&&c.pool===0,'odometer now: last real full (2091) plus 13.5 kWh, firm: '+c.odo.toFixed(1));
 const t=await pg.evaluate(()=>document.getElementById('shellyCard').textContent.replace(/\s+/g,' '));
 for(const x of ['Details','charging now','Odometer from the car','Odometer worked out','Power per 100 km used for this','Since the last full charge','Driven at least','Full charges','real 2041 km','Latest charges','Full (100%)','Not completed','Totals','Check the odometer','What the words mean','Other numbers','Battery % typed in last'])
   ok(t.toLowerCase().includes(x.toLowerCase()),'shown: '+x);
 ok(!/Loss 10%|Loss 13\.3%|12\.8 kWh/.test(t),'no loss figures and no 12.8 in the block');
 ok(/10 charges|9 charges/.test(t)&&/0 not sure/.test(t),'totals have no "not sure" left');
 // Home: away wording, real start time, wall figures
 const m=await pg.evaluate(()=>document.getElementById('meterCard').innerText.replace(/\s+/g,' '));
 ok(/Away from home/.test(m)&&!/Meter not found yet/.test(m),'away from home is not "meter not found"');
 ok(/Charging for 1 h 30 min/.test(m)&&/Started at 10:28/.test(m),'running charge: real start time from the Sheet, whole minutes');
 ok(/Power bought per 100 km \(wall\) 20\.5 kWh/.test(m)&&/Cost per km \(wall\) R0\.80/.test(m),'wall kWh per 100 km and cost per km on Home');
 ok(!/\bthen\b/i.test(m)&&!/Odometer/.test(m),'Home says no "then" and keeps the odometer under Details');
 ok(await pg.evaluate(()=>{const d=document.getElementById('shDet');return d&&!d.open;}),'Details is closed until you open it');
 ok(!/Guessed from battery/.test(m),'nothing estimated from battery %: the charge typed while charging is not counted twice');
 // the log: no double count, and the trip after an unlogged full charge starts at 100%
 const d=await pg.evaluate(()=>{const r=derive();const ch=r.filter(x=>x.type==='charge'&&!x.auto);const tr=r.filter(x=>x.type==='trip');
   return {w:ch.map(x=>+x.wall.toFixed(2)),m:ch.map(x=>x.measured),t:tr.map(x=>({km:x.km,used:+x.used.toFixed(2),eff:x.countEff,h:+x.hours.toFixed(1)}))};});
 ok(d.w[0]===0&&d.w[1]===8&&d.m[0]&&d.m[1],'charge log typed while charging carries 0 kWh, the next one carries the 8.00 measured: '+JSON.stringify(d.w));
 ok(d.t[1].km===50&&Math.abs(d.t[1].used-8.54)<0.01&&d.t[1].eff&&d.t[1].h===28.9,'trip after an unlogged full charge starts at 100% from its end: '+JSON.stringify(d.t[1]));
 ok(await pg.evaluate(()=>{const s={end_ms:new Date(2026,10,10,9,0,0).getTime()};return window.farrVerdict(s)==='full';}),'farrVerdict gives the same verdict to the Learning page');
 // odometer check box
 await pg.evaluate(()=>{document.getElementById('shDet').open=true;});await pg.waitForTimeout(100);
 await pg.fill('#shOdo','2300');await pg.click('#shellyCard button.btn:not(.ghost)');await pg.waitForTimeout(200);
 const c2=await pg.evaluate(()=>{const r=window.farrShelly.calc();return {base:r.base,odo:r.odo,st:JSON.parse(localStorage.getItem('farrq.shelly'))};});
 ok(c2.base.how==='typed'&&c2.odo===2300&&c2.st.src==='typed'&&c2.st.odo===2300,'typed odometer becomes the new counting point, stored in the same form as 2.2.8.5');
 await pg.fill('#shOdo','2310');await pg.click('#shellyCard button.btn:not(.ghost)');await pg.waitForTimeout(200);
 ok(await pg.evaluate(()=>JSON.parse(localStorage.getItem('farrq.shellyTyped')||'[]').length)===2,'every typed odometer is kept, not only the latest');
 const cr=await pg.evaluate(()=>{const r=farr22.reportData(0).calc.find(c=>c.s.start_ms===new Date(2026,10,10,6,0,0).getTime());return r?{st:r.status,after:r.after}:null;});
 ok(cr&&cr.st==='calc'&&cr.after===100,'a full charge with no log gets a worked-out battery % ('+JSON.stringify(cr)+')');
 await pg.evaluate(()=>window.farrShellyReset());await pg.waitForTimeout(200);
 ok(await pg.evaluate(()=>localStorage.getItem('farrq.shelly')===null&&localStorage.getItem('farrq.shellyTyped')===null),'the typed odometers can be forgotten');
 ok(await pg.evaluate(()=>{const o=JSON.parse(localStorage.getItem('farrq.verdicts')||'{}');return Object.values(o).some(v=>v.k==='full')}),'verdicts that came from the relay copy or an alert are kept on this phone');
 ok(errs.length===0,'no page errors '+errs.join('|'));
 await b.close();console.log(fail?'FAILED '+fail:'ALL PASSED');process.exit(fail?1:0);
})();
