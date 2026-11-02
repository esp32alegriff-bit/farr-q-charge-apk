// Ver_FarrQ_2.2.8.4: separate Shelly block on Home. Verdicts, two odometer values, km from kWh, real odometer entry.
// Usage: NODE_PATH=$(npm root -g) PW_MODULE=playwright CHROME=<chromium> node tests/remote/shelly_block_test.js
const path=require('path');let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
const {chromium}=require(process.env.PW_MODULE||'playwright');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium'});
 const pg=await b.newPage({viewport:{width:390,height:800}});const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 await pg.clock.install({time:new Date(2026,10,3,12,0,0).getTime()});
 await pg.addInitScript(()=>{
  const T=(d,h,m)=>new Date(2026,10,d,h,m,0).getTime();
  const S=[
   {start_ms:T(2,11,47),end_ms:T(2,13,24),kwh:4.16,cost:16.13,peak_w:2810},                // the start charge, full (you said so)
   {start_ms:T(2,18,0),end_ms:T(2,20,0),kwh:3.0,cost:11.64,peak_w:2800},                  // relay went off: not completed
   {start_ms:T(2,20,2),end_ms:T(2,20,5),kwh:0.05,cost:0.19,peak_w:1700},                  // too short
   {start_ms:T(3,8,0),end_ms:T(3,9,0),kwh:2.5,cost:9.7,peak_w:2800},                      // full
   {start_ms:T(3,10,0),end_ms:T(3,10,30),kwh:1.0,cost:3.88,peak_w:2700}                   // no verdict: not sure
  ];
  const A=[
   {ts:T(2,20,5),type:'charge_not_full',level:'info',text:'Charge ended before full, 3.00 kWh. A relay was switched off while the car was charging.'},
   {ts:T(3,9,6),type:'charge_full',level:'info',text:'Full charge recorded, 2.50 kWh. The car stopped by itself.'}
  ];
  localStorage.setItem('farrq.entries',JSON.stringify([{ts:T(1,8,0),kind:'charge',odo:1900,pct:50,where:'Home'}]));
  window.FarrNative={sync(m){if(m==='config')return JSON.stringify({});if(m==='alerts')return JSON.stringify({alerts:A,types:[],off:[]});return JSON.stringify({sessions:S});},call(){},shareText(){},shareFile(){}};
 });
 await pg.goto('file://'+path.resolve(__dirname,'../../app/src/main/assets/web/index.html'));
 await pg.waitForTimeout(1200);
 const c=await pg.evaluate(()=>{const r=window.farrShelly.calc();return {eff:r.eff,odo:r.odo,pool:r.pool,poolN:r.poolN,fulls:r.fulls.map(f=>({pool:f.pool,poolN:f.poolN,km:f.km,odo:f.odo})),v:r.all.map(x=>x.v.k),seed:!!r.seedSess,minKm:r.minKm};});
 ok(c.v.join(',')==='full,not_full,short,full,none','verdicts: '+c.v.join(','));
 ok(c.seed,'start charge found');
 ok(c.eff.v===12.8,'efficiency 12.8 when app figure is missing or outside 10-13: '+JSON.stringify(c.eff));
 const km0=5.5/1.10/0.128, km1=5.5/1.133/0.128;
 ok(c.fulls.length===1&&Math.abs(c.fulls[0].pool-5.5)<1e-9&&c.fulls[0].poolN===2,'one full after the start: pool 5.5 kWh in 2 charges');
 ok(Math.abs(c.fulls[0].km[0]-km0)<0.01&&Math.abs(c.fulls[0].km[1]-km1)<0.01,'km at 10% and 13.3%: '+c.fulls[0].km.map(x=>x.toFixed(2)));
 ok(Math.abs(c.odo[0]-(1981+km0))<0.01&&Math.abs(c.odo[1]-(1981+km1))<0.01,'two odometer values: '+c.odo.map(x=>x.toFixed(1)));
 ok(Math.abs(c.pool-1.0)<1e-9&&c.poolN===1,'since the last full: 1.0 kWh in 1 charge (not sure counts as kWh)');
 const t=await pg.evaluate(()=>document.getElementById('shellyCard').innerText.replace(/\s+/g,' '));
 for(const x of ['Shelly meter · true data','1 · Where we start','1981 km','91% to 100%','2 · Odometer estimate','Efficiency used','12.8 kWh per 100 km','Loss 10% (app setting)','Loss 13.3% (learned in the Sheet)','3 · Since the last full charge','Driven at least','4 · Full charges after the start','5 · Latest Shelly charges','Full (100%)','Not completed','Not sure','Too short, ignored','6 · Totals','7 · Your real odometer','How to read this'])
   ok(t.toLowerCase().includes(x.toLowerCase()),'shown: '+x);
 ok(/Last 7 days/.test(t)&&/This month/.test(t),'totals shown');
 // other blocks untouched
 const other=await pg.evaluate(()=>!!document.getElementById('meterCard')&&!!document.getElementById('homeRelay'));
 ok(other,'other Home blocks still there');
 // typing the real odometer
 await pg.fill('#shOdo','2050');await pg.evaluate(()=>window.farrShelly.paint(false));
 ok(await pg.inputValue('#shOdo')==='2050','typed value survives a repaint');
 await pg.click('text=Use this');await pg.waitForTimeout(300);
 const c2=await pg.evaluate(()=>{const r=window.farrShelly.calc();return {odo:r.odo,pool:r.pool,src:r.anchor.src};});
 ok(c2.src==='typed'&&Math.abs(c2.odo[0]-2050)<1e-9&&Math.abs(c2.odo[1]-2050)<1e-9,'real odometer becomes the new start: '+JSON.stringify(c2));
 ok(c2.pool===0,'kWh since the typed odometer restart at 0');
 await pg.click('text=Go back to the 1981 km start');await pg.waitForTimeout(300);
 ok((await pg.evaluate(()=>window.farrShelly.calc().anchor.odo))===1981,'reset goes back to 1981');
 ok(errs.length===0,'no page errors '+errs.join('|'));
 await b.close();process.exit(fail?1:0);
})();
