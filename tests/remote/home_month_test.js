// Ver_FarrQ_2.2.8.3: Home charging this month is counted by when the energy was charged (not the log date), plus groups A-E under the EV meter block.
// Usage: NODE_PATH=$(npm root -g) PW_MODULE=playwright CHROME=<chromium> node tests/remote/home_month_test.js
const path=require('path');let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
const {chromium}=require(process.env.PW_MODULE||'playwright');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium'});
 const pg=await b.newPage({viewport:{width:390,height:800}});const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 const NOW=new Date(2026,10,15,16,30,0).getTime();           // Sun 15 Nov 2026 16:30 (fixed)
 await pg.clock.install({time:NOW});
 await pg.addInitScript(()=>{
  const NOW=new Date(2026,10,15,16,30,0).getTime(),from=new Date(2026,10,1).getTime(),H=36e5,D=864e5,M=6e4;
  const E=[
   {ts:from-2*D,kind:'charge',odo:1000,pct:20,where:'Home'},
   {ts:from+2*D+8*H,kind:'trip',odo:1100,pct:80},                       // 100 km, 60% used
   {ts:from+3*D,kind:'charge',odo:1100,pct:30,where:'Station'},          // station: left out
   {ts:from+5*D+8*H,kind:'charge',odo:1100,pct:100,where:'Home'},        // estimated: no meter session behind it
   {ts:NOW-2*H,kind:'trip',odo:1160,pct:70}
  ];
  const S=[
   {start_ms:from-3*H,end_ms:from-2*H,kwh:3,cost:11.64},               // last month: left out
   {start_ms:from-1*H,end_ms:from+1*H,kwh:2.6,cost:10.09},            // straddles the month start: half counts
   {start_ms:from+9*D+10*H,end_ms:from+9*D+11*H,kwh:2,cost:7.76},
   {start_ms:from+9*D+11*H+5*M,end_ms:from+9*D+12*H,kwh:1,cost:3.88}, // 5 min after the one before: a pause
   {start_ms:from+12*D,end_ms:from+12*D+H,kwh:2,cost:7.76}
  ];
  localStorage.setItem('farrq.entries',JSON.stringify(E));
  localStorage.setItem('farrq.remoteLive',JSON.stringify({at:NOW-6*M,got:NOW,today:2,month:9,total:112.8,watts:2600,charging:true}));
  window.FarrNative={sync(m){return m==='config'?JSON.stringify({}):JSON.stringify({sessions:S});},call(){},shareText(){},shareFile(){}};
 });
 await pg.goto('file://'+path.resolve(__dirname,'../../app/src/main/assets/web/index.html'));
 await pg.waitForTimeout(1000);
 const a=await pg.evaluate(()=>{const r=JSON.parse(localStorage.getItem('farrq.remoteLive'));return window.farrHomeMonth(r.at,r);});
 // measured: 1.3 (half of straddler) + 2 + 1 + 2 + running 2 = 8.3 ; estimated: one Home charge 20.. wait derived from entries
 ok(Math.abs(a.mKwh-8.3)<0.001,'measured counts by charge time: '+a.mKwh.toFixed(3)+' (expect 8.3, last-month 3 kWh left out, straddler halved)');
 ok(a.eKwh>0,'estimated row from battery % has energy: '+a.eKwh.toFixed(2));
 ok(Math.abs(a.kwh-(a.mKwh+a.eKwh))<1e-9&&Math.abs(a.cost-(a.mCost+a.eCost))<1e-9,'measured + estimated = total');
 ok(a.pauses===1,'one pause counted (5 min gap): '+a.pauses);
 ok(a.running===2,'running charge counted: '+a.running);
 const t=await pg.evaluate(()=>window.farrRemoteBlockHTML().replace(/<[^>]*>/g,' ').replace(/\s+/g,' '));
 for(const g of ['Today','This month','Last charge','The car this month'])ok(t.includes(g),'group shown: '+g);
 for(const l of ['Charging?','Charging for (about)','Started at (about)','This charge so far','Charges today','Used today',
   'When','Used','Used so far','Guessed from battery %','Charges','Each day, on average','Guess for the whole month',
   'Km driven','Km driven since the last charge','Power bought per 100 km (wall)','Cost per km (wall)'])ok(t.includes(l),'item shown: '+l);
 ok(/Charging for \(about\)\s*\d+ min|Charging for \(about\)\s*\d+ h/.test(t),'charging-for has a value: '+t.slice(t.indexOf('Charging for'),t.indexOf('Charging for')+60));
 ok(/This charge so far\s*2\.00 kWh · R7\.76/.test(t),'this charge so far 2.00 kWh R7.76');
 ok(!/\bthen\b/i.test(t)&&t.includes('Copy from the Sheet'),'the word "then" is gone from the Home block');
 ok(!/Odometer|Home rate|Meter total|Pauses/.test(t),'odometer, settings, meter total and pauses are not on the Home block');
 const det=await pg.evaluate(()=>window.farrShelly.html().replace(/<[^>]*>/g,' ').replace(/\s+/g,' '));
 ok(/Short pauses in a charge, this month\s*1/.test(det),'pauses row = 1 (under Details)');
 ok(/Price per kWh \(setting\)\s*R3\.88/.test(det),'rate shown (under Details)');
 ok(det.includes('Meter total, ever')&&det.includes('Home phone last sent')&&det.includes('Odometer'),'meter total, phone last sent and odometer are under Details');
 ok(!/Home charging this month/.test(t),'old wrong row removed');
 // not charging: items that need a running charge show --
 const t2=await pg.evaluate(()=>{const r=JSON.parse(localStorage.getItem('farrq.remoteLive'));r.charging=false;r.watts=0;localStorage.setItem('farrq.remoteLive',JSON.stringify(r));return window.farrRemoteBlockHTML().replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');});
 ok(/Charging\?\s*no/.test(t2)&&!/Charging for|This charge so far/.test(t2),'not charging: the running-charge rows are left out');
 ok(errs.length===0,'no page errors '+errs.join('|'));
 await b.close();process.exit(fail?1:0);
})();
