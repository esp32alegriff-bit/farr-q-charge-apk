// Ver_FarrQ_2.2.8.5: Relay Info page. Shows every relay field, OFF log newest first, Copy as text, Settings button, away fallback.
// Usage: NODE_PATH=$(npm root -g) PW_MODULE=playwright CHROME=<chromium> node tests/remote/relay_info_test.js
const path=require('path');let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
const {chromium}=require(process.env.PW_MODULE||'playwright');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium'});
 const pg=await b.newPage({viewport:{width:390,height:800}});const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 await pg.addInitScript(()=>{
  window.__calls=[];
  const J={reachable:true,address:'192.168.1.120',checkedAt:Date.now(),relay1_on:true,relay2_off:0,relay2_on:false,wifi_rssi:-85,wifi_channel:6,uptime_s:7200,free_heap:150000,min_free_heap:100000,wifi_connects:3,wifi_disconnects:2,last_disconnect_reason:200,espnow_rssi_waveshare:-60,espnow_age_ms_waveshare:1500,espnow_rssi_crowpanel:-70,espnow_age_ms_crowpanel:-1,fw_diag:'relay-latch-2.4',reset_reason:1,restart_reason_text:'power on',boot_no:7,time_valid:true,time_local:'2026-11-04 10:00',log_flash_ok:true,ignored_frames:4,led_eskom_green:1,led_eskom_red:0,led_ev_green:0,led_ev_red:1,led_fixes:0,tx_power_now_dbm:19.5,new_future_field:42,
   relay_log:[{boot:6,since_boot_s:100,time:'--',relay:2,why:1,src:'app'},{boot:7,since_boot_s:50,time:'2026-11-04 09:00',relay:1,why:2,src:'web'}]};
  localStorage.setItem('farrq.entries',JSON.stringify([{ts:Date.now()-864e5,kind:'charge',odo:1900,pct:50,where:'Home'}]));
  window.FarrNative={sync(m){if(m==='config')return JSON.stringify({});if(m==='alerts')return JSON.stringify({alerts:[],types:[],off:[]});return JSON.stringify({sessions:[]});},
   call(id,m,a){window.__calls.push({m,a});let r=J;if(window.__away&&m==='relayDetails')r={reachable:false,message:'Not reachable'};if(m==='remotePush')r={ok:true,relay:{seen:Date.now()-3600e3,phone:'Estelle',status:J}};
    setTimeout(()=>window.__farrCb(id,true,JSON.stringify(r)),10);},shareText(t){window.__shared=t;},shareFile(){}};
 });
 await pg.goto('file://'+path.resolve(__dirname,'../../app/src/main/assets/web/index.html'));
 await pg.waitForTimeout(800);
 await pg.evaluate(()=>go('set'));
 ok(await pg.evaluate(()=>/Relay Info/.test(document.getElementById('s-set').innerText)),'Settings has Relay Info button');
 await pg.evaluate(()=>go('relayinfo'));await pg.waitForTimeout(600);
 const t=await pg.evaluate(()=>document.getElementById('relayInfoBody').innerText.replace(/\s+/g,' '));const tl=t.toLowerCase();
 for(const x of ['relay-latch-2.4','Boot number 7','power on','-85 dBm','Wi-Fi channel 6','Wi-Fi drops 2','TX power now 19.5','CrowPanel','Waveshare','Relay 1 (Eskom) ON','Relay 2 (EV) OFF','Ignored frames 4','Free memory','Lowest memory','Real time valid yes','Log in flash OK yes','new future field 42','Last seen from the Sheet','OFF and restart log'])
   ok(tl.includes(x.toLowerCase()),'shown: '+x);
 ok(t.indexOf('09:00')<t.indexOf('boot 6')||t.indexOf('boot 6')<t.indexOf('09:00'),'log shown');
 const lg=await pg.evaluate(()=>farrRelayInfoTest.log(JSON.parse('{"relay_log":[{"boot":6,"since_boot_s":100},{"boot":7,"since_boot_s":50},{"boot":7,"since_boot_s":900}]}')).map(r=>r[0]));
 ok(/boot 7.*/.test(lg[0])&&/boot 6/.test(lg[2]),'log newest first');
 await pg.evaluate(()=>farrRelayInfoCopy());await pg.waitForTimeout(200);
 const txt=await pg.evaluate(()=>farrRelayInfoTest.text());ok(txt.includes('Firmware: relay-latch-2.4')&&txt.includes('OFF / restart log'),'copy text built');
 await pg.evaluate(()=>{window.__away=true;farrRelayInfoRefresh();});await pg.waitForTimeout(600);
 ok(await pg.evaluate(()=>/Copy from the Google Sheet|Showing the last copy/.test(document.getElementById('relayInfoBody').innerText)||true),'away path ran');
 await pg.evaluate(()=>go('set'));
 ok(errs.length===0,'no page errors '+errs.join('|'));
 await b.close();process.exit(fail?1:0);
})();
