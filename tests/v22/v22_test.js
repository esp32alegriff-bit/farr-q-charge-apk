// Ver_FarrQ_2.2: graphs, battery % prompt, learning, live estimate. Usage: NODE_PATH=$(npm root -g) PW_MODULE=playwright node tests/v22/v22_test.js
const {chromium}=require(process.env.PW_MODULE||'playwright');
const path=require('path');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium'});
 const pg=await b.newPage({viewport:{width:400,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 const D=3600e3, T0=Date.now()-40*24*D;
 await pg.addInitScript(({T0,D})=>{
  // 12 past sessions: 30% -> 100%, 37 kWh wall, power 2600 W then taper to 1200 W
  const sess=[],entries=[];let seq=0;
  for(let i=0;i<12;i++){const st=T0+i*3*24*D;sess.push({seq:++seq,start_ms:st,end_ms:st+4*D,kwh:37,duration_s:4*3600,avg_w:2300,peak_w:2650});
    entries.push({ts:st-1800e3,kind:'trip',odo:1000+i*50,pct:30,where:''});entries.push({ts:st+4*D+600e3,kind:'charge',odo:1010+i*50,pct:100,where:'Home'});}
  entries.push({ts:Date.now()-2*D,kind:'trip',odo:2000,pct:45,where:''});
  entries.sort((a,b)=>a.ts-b.ts);
  const now=Date.now(), start=now-40*60e3;
  window.__live={online:true,demo:false,everSeen:true,lastSeen:now,unread:0,sessionsCount:sess.length,live:{charging:true,watts:2500,amps:11,session:{start_ms:start,duration_s:2400,kwh:1.7,peak_w:2600,avg_w:2550},today_kwh:1.7,mode:'MANUAL',relay:{}}};
  window.__calls=[];
  window.FarrNative={sync(m,a){if(m==='config')return JSON.stringify({meterUrl:'x'});if(m==='sessions')return JSON.stringify({sessions:sess});return '{}';},
   call(id,m,a){a=JSON.parse(a);window.__calls.push({m,a});let r={};
    if(m==='live')r=window.__live;
    if(m==='meterMinutes'){const pts=[];for(let t=a.from;t<=a.to;t+=60){const f=(t-a.from)/Math.max(1,a.to-a.from);const w=f<0.8?2600:Math.max(300,2600-(f-0.8)*5*2300);pts.push([t*1000,Math.round(w),Math.round(w/230*100)/100,Math.round(w*1.02)]);}r={points:pts};}
    setTimeout(()=>window.__farrCb(id,true,JSON.stringify(r)),5);},shareText(){},shareFile(){}};
  localStorage.setItem('farrq.entries',JSON.stringify(entries));
 },{T0,D});
 await pg.goto('file://'+path.resolve(__dirname,'../../app/src/main/assets/web/index.html'));
 await pg.waitForTimeout(2500);
 let f=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++;};
 // prompt at session start
 ok(await pg.evaluate(()=>!!document.getElementById('pctIn')),'battery % prompt shown at session start');
 await pg.evaluate(()=>farr22.skipPct());
 ok(await pg.evaluate(()=>!document.getElementById('pctIn')),'skip hides the prompt');
 // live estimate before any entered %: kWh only
 let t=await pg.evaluate(()=>document.getElementById('liveEst').innerText);
 ok(/live charge estimate/i.test(t)&&/time left to 100%/i.test(t),'live estimate panel shows');
 ok(/kWh only/.test(t),'marked based on kWh only when no % entered');
 // learning
 const M=await pg.evaluate(()=>{const m=farr22.model();return {n:m.n,ratio:m.ratio,nr:m.nRatio};});
 ok(M.n===12&&M.nr===12,'12 sessions used ('+JSON.stringify(M)+')');
 ok(M.ratio>0.8*37/(42.7*0.7)&&Math.abs(M.ratio-37/(42.7*0.7))<0.01,'measured ratio '+M.ratio);
 ok(/Good/.test(t),'confidence Good with 12 sessions');
 // enter a %
 await pg.evaluate(()=>{farr22.askNow();});
 await pg.fill('#pctIn','60');await pg.evaluate(()=>farr22.savePct());await pg.waitForTimeout(400);
 t=await pg.evaluate(()=>document.getElementById('liveEst').innerText);
 ok(/you entered/.test(t)&&!/kWh only/.test(t),'estimate uses entered %');
 ok(await pg.evaluate(()=>JSON.parse(localStorage.getItem('farrq.sessPct')).length)===1,'% stored with time');
 // taper learned after minute data fetched
 await pg.evaluate(()=>go('learn'));await pg.waitForTimeout(1500);
 const lt=await pg.evaluate(()=>document.getElementById('learnBody').innerText);
 ok(/sessions used for learning/i.test(lt)&&/taper near 100%/i.test(lt),'learning page renders');
 await pg.fill('#lnPct','80');await pg.waitForTimeout(200);
 ok(/Time to 100%/.test(await pg.evaluate(()=>document.getElementById('lnOut').innerText)),'estimate from any %');
 // graphs
 await pg.evaluate(()=>go('graph'));await pg.waitForTimeout(1200);
 ok(await pg.evaluate(()=>document.querySelectorAll('#shP svg,#shA svg,#shC svg').length+document.querySelectorAll('#shPHost svg,#shAHost svg,#shCHost svg').length)===3,'three charts drawn');
 const cost=await pg.evaluate(()=>document.getElementById('shCHost').innerText);
 ok(/R0/.test(cost)&&/R50/.test(cost),'cost axis in R50 steps');
 ok(/60%/.test(await pg.evaluate(()=>document.getElementById('shPHost').innerText)),'% marker on the power chart');
 const span0=await pg.evaluate(()=>document.getElementById('shPHost').innerHTML);
 await pg.evaluate(()=>document.getElementById('shPHost').scrollIntoView());await pg.waitForTimeout(200);
 const box=await pg.locator('#shPHost').boundingBox();
 await pg.mouse.move(box.x+200,box.y+100);await pg.mouse.wheel(0,-300);await pg.waitForTimeout(200);
 ok(await pg.evaluate(()=>document.getElementById('shPHost').innerHTML)!==span0,'wheel zoom changes the time axis');
 // past session via history
 await pg.evaluate(()=>go('hist'));await pg.waitForTimeout(300);
 ok(/shelly charge sessions/i.test(await pg.evaluate(()=>document.body.innerText)),'history lists Shelly sessions');
 await pg.evaluate(()=>{document.querySelector('#histShelly button.chip').click();});await pg.waitForTimeout(1200);
 ok(await pg.evaluate(()=>document.getElementById('shPick').value)!=='open','past session picked from history');
 ok(await pg.evaluate(()=>document.getElementById('shInfo').innerText.includes('Energy')),'past session graphed');
 // settings row
 await pg.evaluate(()=>go('set'));
 ok((await pg.evaluate(()=>document.body.innerText)).includes('Learning and estimates'),'settings has the learning row');
 ok(errs.length===0,'no page errors '+errs.join('|'));
 await b.close();process.exit(f?1:0);
})();
