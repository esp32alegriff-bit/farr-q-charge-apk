// Loads the real app page in Chromium with a fake Android bridge. Usage: node ui_test.js
const {chromium}=require(process.env.PW_MODULE||'playwright');
const path=require('path');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium'});
 const pg=await b.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 const T=Date.now()-6*3600e3;
 await pg.addInitScript(({T})=>{
  const cfg={remoteUrl:'',remoteToken:'',remoteName:'',meterUrl:'x'};
  window.__calls=[];
  const sess=[{start_ms:T+3600e3,end_ms:T+3600e3*2,kwh:10,duration_s:3600,peak_w:7000,end_reason:'below_threshold'}];
  window.FarrNative={sync(m,a){a=JSON.parse(a||'{}');
    if(m==='config')return JSON.stringify(cfg);
    if(m==='setConfig'){Object.assign(cfg,a);return JSON.stringify(cfg);}
    if(m==='sessions')return JSON.stringify({sessions:window.__sess||sess});
    return JSON.stringify({});},
   call(id,m,a){window.__calls.push({m,a:JSON.parse(a)});setTimeout(()=>window.__farrCb(id,true,JSON.stringify({ok:true,message:'Sheet updated'})),10);},
   shareText(){},shareFile(){}};
  localStorage.setItem('farrq.entries',JSON.stringify([
   {ts:T-3600e3,kind:'charge',odo:1000,pct:50,where:'Home'},
   {ts:T,kind:'trip',odo:1040,pct:40,where:''}]));
 },{T});
 await pg.goto('file://'+path.resolve(__dirname,'../../app/src/main/assets/web/index.html'));
 await pg.waitForTimeout(1500);
 const r=await pg.evaluate(()=>{const d=derive();return {n:d.length,auto:d.filter(x=>x.auto).map(x=>({wall:x.wall,pct:x.pct,w:x.where})),s:summ(rowsFor('all')).charges};});
 let f=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++;};
 ok(r.auto.length===1,'one auto row for unlogged session');
 ok(r.auto[0]&&r.auto[0].wall===10&&r.auto[0].w==='Home','auto row = measured kWh at Home');
 ok(r.auto[0]&&r.auto[0].pct>40,'battery % estimated above last reading ('+(r.auto[0]&&r.auto[0].pct)+')');
 // real charge log after the session hides the auto row
 await pg.evaluate(({T})=>{E.push({ts:T+3600e3*3,kind:'charge',odo:1040,pct:80,where:'Home'});},{T});
 ok(await pg.evaluate(()=>derive().filter(x=>x.auto).length)===0,'real charge log replaces auto row');
 await pg.evaluate(()=>{E.pop();});
 ok(await pg.evaluate(()=>localStorage.getItem('farrq.entries').includes('"auto"'))===false,'auto rows never stored in the log');
 // history tag
 await pg.evaluate(()=>{go('hist');});await pg.waitForTimeout(300);
 ok((await pg.evaluate(()=>document.body.innerText)).includes('AUTO'),'History shows AUTO tag');
 // connections card
 await pg.evaluate(()=>{go('conn');});await pg.waitForTimeout(300);
 ok(await pg.evaluate(()=>!!document.getElementById('rm_url')),'Connections has View from anywhere card');
 ok((await pg.evaluate(()=>document.getElementById('rmMsg').textContent)).startsWith('Off'),'shows Off until set up');
 await pg.fill('#rm_url','http://bad');await pg.evaluate(()=>farrRemoteSave());
 ok((await pg.evaluate(()=>window.__calls.filter(c=>c.m==='remotePush').length))===0,'http address refused, nothing sent');
 await pg.fill('#rm_url','https://script.google.com/macros/s/abc/exec');await pg.fill('#rm_token','pw');await pg.fill('#rm_name','Antonio');
 await pg.evaluate(()=>farrRemoteSave());await pg.waitForTimeout(500);
 const c=await pg.evaluate(()=>window.__calls.filter(c=>c.m==='remotePush'));
 ok(c.length===1,'Save sends one copy');
 const p=c[0]&&c[0].a;
 ok(p&&p.kind==='app'&&p.charges.length===1&&p.charges[0].auto,'payload has the auto charge');
 ok(p&&p.readings.length===2&&p.trips.length===1&&p.sessions.length===1,'payload has readings, trip, session');
 ok(p&&!('token' in p),'JS never adds the password to the payload');
 ok((await pg.evaluate(()=>document.getElementById('rmMsg').textContent)).includes('Sheet updated'),'status shows result');
 // backup/diagnostics must not leak password
 const leak=await pg.evaluate(()=>{try{return JSON.stringify(window.farrInfoData?farrInfoData():'')}catch(e){return ''}});
 ok(!leak.includes('"pw"'),'diagnostics do not show the password');
 ok(errs.length===0,'no page errors '+errs.join(';'));
 console.log(f?'FAILED '+f:'ALL PASS');await b.close();process.exit(f?1:0);
})();
