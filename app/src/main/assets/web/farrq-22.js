/* FARR Q Charge Ver_FarrQ_2.2 layer: Shelly charge graphs, battery % prompt, learning and live estimate.
   Loaded AFTER the main app script, so it can read S and E. Additive only: it never changes charging,
   never touches the entries (E) or the Google Sheet, and every part fails quietly if data is missing. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const n2=(v,d)=>v==null||isNaN(v)?'--':Number(v).toFixed(d);
const row=(a,b)=>`<div class="row"><span>${a}</span><b style="text-align:right">${b}</b></div>`;
const say=m=>{try{toast(m);}catch(e){}};
const call=(m,a)=>window.farrCall?window.farrCall(m,a):Promise.reject(new Error('Only works inside the Android app'));
const syncc=(m,a)=>window.farrSync?window.farrSync(m,a):null;
const rate=()=>{try{return +S.rateHome||3.88;}catch(e){return 3.88;}};
const pack=()=>{try{return +S.pack||42.7;}catch(e){return 42.7;}};
const lossPct=()=>{try{return S.loss==null||isNaN(+S.loss)?10:+S.loss;}catch(e){return 10;}};
const hhmm=ts=>new Date(ts).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'});
const dstamp=ts=>new Date(ts).toLocaleString('en-ZA',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const dur=s=>{s=Math.max(0,Math.round(s||0));const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?h+' h '+m+' min':m+' min';};
const durMin=m=>dur(m*60);
const lsGet=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v;}catch(e){return d;}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}};
const VER=()=>window.FARR_VER||'';
const DEF_PACK=42.7;

/* ---------- stored battery % readings (kept apart from the trip and charge logs) ---------- */
let PCT=lsGet('farrq.sessPct',[]);
function addPct(pct,src,kwh){
  PCT.push({ts:Date.now(),pct:Math.round(pct*10)/10,src:src||'prompt',kwh:kwh==null?null:Math.round(kwh*1000)/1000});
  PCT.sort((a,b)=>a.ts-b.ts); if(PCT.length>800)PCT=PCT.slice(-800);
  lsSet('farrq.sessPct',PCT); MODEL=null;
}
function anchors(){
  const a=PCT.map(p=>({ts:p.ts,pct:+p.pct,kwh:p.kwh,src:'session'}));
  try{(E||[]).forEach(e=>{if(e&&typeof e.pct==='number'&&e.ts&&!e.auto&&e.pct>=0&&e.pct<=100)a.push({ts:e.ts,pct:e.pct,kwh:null,src:'log'});});}catch(x){}
  return a.sort((x,y)=>x.ts-y.ts);
}

/* ---------- measured Shelly sessions and minute data ---------- */
let MSL=[],MSstamp=0;
function sessions(force){
  if(force||Date.now()-MSstamp>20000){const s=syncc('sessions');MSL=((s&&s.sessions)||[]).filter(x=>x&&x.start_ms&&x.end_ms&&x.kwh>0).sort((a,b)=>a.start_ms-b.start_ms);MSstamp=Date.now();}
  return MSL;
}
let MINS=lsGet('farrq.mins',{});
function saveMins(){
  const ks=Object.keys(MINS).sort((a,b)=>+a-+b);
  while(ks.length>60)delete MINS[ks.shift()];
  lsSet('farrq.mins',MINS);
}
async function minutesFor(startMs,endMs,open){
  if(!open&&MINS[startMs])return MINS[startMs].pts;
  const r=await call('meterMinutes',{from:Math.floor(startMs/1000)-120,to:Math.ceil(endMs/1000)+120});
  const pts=((r&&r.points)||[]).filter(p=>p[0]>=startMs-120000&&p[0]<=endMs+120000);
  if(!open&&pts.length){MINS[startMs]={pts,end:endMs};saveMins();MODEL=null;}
  return pts;
}
function cumKwh(pts,ts){let k=0;for(const p of pts){if(p[0]+60000<=ts)k+=p[1]/60000;else if(p[0]<ts)k+=p[1]/60000*((ts-p[0])/60000);}return k;}

/* ---------- learning ---------- */
let MODEL=null,MODELSIG='';
function sig(){return sessions().length+'/'+PCT.length+'/'+((typeof E!=='undefined'&&E)?E.length:0)+'/'+Object.keys(MINS).length+'/'+pack()+'/'+lossPct();}
function buildModel(){
  const key=sig(); if(MODEL&&MODELSIG===key)return MODEL;
  const ss=sessions().filter(s=>s.kwh>=0.2&&s.duration_s>=300), an=anchors();
  const used=new Set(), taper=[], ratioS=[], info=[];
  let sumW=0,sumB=0;
  ss.forEach((s,i)=>{
    const nextStart=i+1<ss.length?ss[i+1].start_ms:Infinity;
    let b=null,a=null;
    for(const x of an){if(x.ts<=s.start_ms+180000&&x.ts>=s.start_ms-12*3600000)b=x;}
    for(const x of an){if(x.ts>=s.end_ms-180000&&x.ts<=s.end_ms+8*3600000&&x.ts<nextStart){a=x;break;}}
    const ins=an.filter(x=>x.ts>s.start_ms+180000&&x.ts<s.end_ms-180000);
    const rec={s,b,a,ins};info.push(rec);
    if(b&&a&&a.pct-b.pct>=15){
      const batt=pack()*(a.pct-b.pct)/100, r=s.kwh/batt;
      if(r>=1.0&&r<=1.6){sumW+=s.kwh;sumB+=batt;ratioS.push(r);used.add(s.start_ms);}
    }
    if(b&&a&&a.pct>=98&&a.pct-b.pct>=3){
      const pts=[{pct:b.pct,kwh:0,min:0}];
      const mc=MINS[s.start_ms];
      if(mc)ins.forEach(x=>{if(x.pct>pts[pts.length-1].pct&&x.pct<a.pct)pts.push({pct:x.pct,kwh:cumKwh(mc.pts,x.ts),min:(x.ts-s.start_ms)/60000});});
      pts.push({pct:a.pct,kwh:s.kwh,min:(s.end_ms-s.start_ms)/60000});
      taper.push({s,pts});used.add(s.start_ms);
    }
  });
  const ratio=sumB>0&&ratioS.length>=3?sumW/sumB:null;
  const typW=(()=>{const v=ss.map(x=>x.avg_w||0).filter(x=>x>300).sort((p,q)=>p-q);return v.length?v[Math.floor(v.length/2)]:2400;})();
  MODEL={n:used.size,nRatio:ratioS.length,ratio,ratioAll:sumB>0?sumW/sumB:null,taper,typW,total:ss.length,nAnch:an.length,info,builtAt:Date.now()};
  MODELSIG=key; return MODEL;
}
function conf(n){return n>=10?'Good':n>=3?'Improving':'Rough';}
function ratioNow(M){return M.ratio!=null?M.ratio:1+lossPct()/100;}
/* what is left to reach 100% from a battery level p */
function remaining(p,liveW){
  const M=buildModel(); p=Math.max(0,Math.min(100,p));
  const R=ratioNow(M); let out;
  const rows=[];
  M.taper.forEach(t=>{
    const P=t.pts; if(P[0].pct>p+0.5)return;
    let k,m;
    if(p>=P[P.length-1].pct){k=0;m=0;}
    else{for(let i=1;i<P.length;i++){if(P[i].pct>=p){const f=(p-P[i-1].pct)/Math.max(0.01,P[i].pct-P[i-1].pct);k=P[i-1].kwh+f*(P[i].kwh-P[i-1].kwh);m=P[i-1].min+f*(P[i].min-P[i-1].min);break;}}}
    if(k!=null)rows.push({k:t.s.kwh-k,m:(P[P.length-1].min)-m});
  });
  if(rows.length){
    const wall=rows.reduce((a,x)=>a+x.k,0)/rows.length, min=rows.reduce((a,x)=>a+x.m,0)/rows.length;
    out={wall,min,basis:'learned from '+rows.length+' full charge'+(rows.length>1?'s':''),taperN:rows.length};
  }else{
    const batt=pack()*(100-p)/100, wall=batt*R, w=(liveW&&liveW>400)?liveW:M.typW;
    out={wall,min:wall/(w/1000)*60,basis:'straight-line from '+pack().toFixed(1)+' kWh'+(M.ratio!=null?' and the measured '+((M.ratio-1)*100).toFixed(0)+'% loss':' and '+lossPct()+'% loss'),taperN:0};
  }
  out.batt=out.wall/R; out.cost=out.wall*rate(); out.n=M.n; out.conf=conf(M.n); out.pct=p;
  return out;
}

/* ---------- SVG zoom and pan charts ---------- */
let SEL=null;                 // {open, start, end}
let DATA=null;                // {pts, marks}
let VIEW=null, FULL=null, CUR=null;
const CH=[{id:'shP',name:'Power',unit:'W',idx:1,col:'var(--cyan)'},{id:'shA',name:'Current',unit:'A',idx:2,col:'var(--gold)'},{id:'shC',name:'Cost',unit:'R',col:'var(--green)'}];
function niceStep(range,n){const raw=range/n,p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p;return (f<=1?1:f<=2?2:f<=5?5:10)*p;}
function seriesOf(c){
  const pts=DATA.pts;
  if(c.id==='shC'){let k=0;return pts.map(p=>{k+=p[1]/60000;return [p[0]+60000,k*rate()];});}
  return pts.map(p=>[p[0]+30000,p[c.idx]]);
}
function drawChart(c,host){
  const W=Math.max(260,host.clientWidth||320),H=210,ml=46,mr=10,mt=14,mb=34,pw=W-ml-mr,ph=H-mt-mb;
  const s=seriesOf(c), x0=VIEW[0], x1=VIEW[1];
  const vis=s.filter(p=>p[0]>=x0-120000&&p[0]<=x1+120000);
  let ymax=0;(vis.length?vis:s).forEach(p=>{if(p[1]>ymax)ymax=p[1];});
  let step,top;
  if(c.id==='shC'){step=50;top=Math.max(50,Math.ceil(ymax/50)*50);while(top/step>8){step*=2;top=Math.ceil(ymax/step)*step;}}
  else{ymax=Math.max(ymax*1.08,c.unit==='A'?2:100);step=niceStep(ymax,4);top=Math.ceil(ymax/step)*step;}
  const X=t=>ml+(t-x0)/(x1-x0)*pw, Y=v=>mt+ph-(v/top)*ph;
  let g='';
  for(let v=0;v<=top+1e-6;v+=step){g+=`<line x1="${ml}" x2="${W-mr}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(--line)"/><text x="${ml-6}" y="${Y(v)+4}" text-anchor="end" style="fill:var(--muted);font-size:11px">${c.unit==='R'?'R'+v:(c.unit==='A'?v.toFixed(step<1?1:0):Math.round(v))}</text>`;}
  const span=x1-x0, ts=[1,2,5,10,15,30,60,120,180,360].map(m=>m*60000).find(m=>span/m<=5)||360*60000;
  for(let t=Math.ceil(x0/ts)*ts;t<=x1;t+=ts){g+=`<line x1="${X(t)}" x2="${X(t)}" y1="${mt}" y2="${mt+ph}" style="stroke:var(--line);opacity:.5"/><text x="${X(t)}" y="${H-mb+14}" text-anchor="middle" style="fill:var(--muted);font-size:11px">${hhmm(t)}</text>`;}
  if(vis.length>1){
    let d='';vis.forEach((p,i)=>{d+=(i?'L':'M')+X(Math.max(x0,Math.min(x1,p[0])))+' '+Y(p[1]);});
    g+=`<path d="${d}" fill="none" style="stroke:${c.col}" stroke-width="2" stroke-linejoin="round"/>`;
  }else g+=`<text x="${W/2}" y="${H/2}" text-anchor="middle" style="fill:var(--muted);font-size:13px">No minute data in this view</text>`;
  DATA.marks.forEach(m=>{
    if(m.ts<x0||m.ts>x1)return;
    g+=`<line x1="${X(m.ts)}" x2="${X(m.ts)}" y1="${mt}" y2="${mt+ph}" style="stroke:var(--gold)" stroke-width="1.5" stroke-dasharray="4 3"/>`+
       `<rect x="${X(m.ts)-19}" y="${H-mb+17}" width="38" height="16" rx="4" style="fill:var(--gold)"/><text x="${X(m.ts)}" y="${H-mb+29}" text-anchor="middle" style="fill:#1a1405;font-size:11px;font-weight:700">${Math.round(m.pct)}%</text>`;
  });
  if(CUR!=null&&CUR>=x0&&CUR<=x1){
    let best=null;s.forEach(p=>{if(best==null||Math.abs(p[0]-CUR)<Math.abs(best[0]-CUR))best=p;});
    if(best){
      const bx=X(best[0]),by=Y(best[1]),lab=hhmm(best[0])+'  '+(c.unit==='R'?'R'+best[1].toFixed(2):c.unit==='A'?best[1].toFixed(2)+' A':Math.round(best[1])+' W');
      const tx=Math.min(Math.max(bx,ml+60),W-mr-60);
      g+=`<line x1="${bx}" x2="${bx}" y1="${mt}" y2="${mt+ph}" style="stroke:var(--text);opacity:.6"/><circle cx="${bx}" cy="${by}" r="4" style="fill:${c.col}"/><rect x="${tx-58}" y="${mt}" width="116" height="18" rx="4" style="fill:var(--panel);stroke:var(--line)"/><text x="${tx}" y="${mt+13}" text-anchor="middle" style="fill:var(--text);font-size:12px">${lab}</text>`;
    }
  }
  host.innerHTML=`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;touch-action:pan-y;user-select:none">${g}</svg>`;
  host._geo={ml,pw};
}
function drawAll(){
  if(!DATA||!VIEW)return;
  CH.forEach(c=>{const h=$(c.id+'Host');if(h)drawChart(c,h);});
}
function setView(a,b){
  const full=FULL[1]-FULL[0], min=Math.min(3*60000,full);
  let span=Math.max(min,Math.min(full,b-a));
  a=Math.max(FULL[0],Math.min(FULL[1]-span,a)); VIEW=[a,a+span];
}
function attach(host){
  if(host._att)return; host._att=true;
  const ptrs=new Map(); let moved=false,lastD=0;
  host.addEventListener('pointerdown',e=>{try{host.setPointerCapture(e.pointerId);}catch(x){}ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=false;lastD=0;});
  host.addEventListener('pointermove',e=>{
    const p=ptrs.get(e.pointerId); if(!p||!VIEW||!host._geo)return;
    const pw=host._geo.pw, span=VIEW[1]-VIEW[0];
    if(ptrs.size===1){
      const dx=e.clientX-p.x; if(Math.abs(dx)>0){if(Math.abs(dx)>1)moved=true; setView(VIEW[0]-dx/pw*span,VIEW[1]-dx/pw*span);}
      p.x=e.clientX;p.y=e.clientY; drawAll();
    }else if(ptrs.size===2){
      p.x=e.clientX;p.y=e.clientY;
      const [a,b]=[...ptrs.values()], d=Math.abs(a.x-b.x)||1, mid=(a.x+b.x)/2;
      if(lastD){const f=lastD/d, r=host.getBoundingClientRect(), fx=Math.max(0,Math.min(1,(mid-r.left-host._geo.ml)/pw)), cx=VIEW[0]+fx*span, ns=span*f; setView(cx-fx*ns,cx-fx*ns+ns);}
      lastD=d;moved=true;drawAll();
    }
  });
  const up=e=>{
    const had=ptrs.has(e.pointerId); ptrs.delete(e.pointerId); lastD=0;
    if(had&&!moved&&ptrs.size===0&&host._geo){const r=host.getBoundingClientRect();CUR=VIEW[0]+(e.clientX-r.left-host._geo.ml)/host._geo.pw*(VIEW[1]-VIEW[0]);drawAll();}
  };
  host.addEventListener('pointerup',up);host.addEventListener('pointercancel',up);
  host.addEventListener('wheel',e=>{
    if(!VIEW||!host._geo)return; e.preventDefault();
    const r=host.getBoundingClientRect(), fx=Math.max(0,Math.min(1,(e.clientX-r.left-host._geo.ml)/host._geo.pw)), span=VIEW[1]-VIEW[0], cx=VIEW[0]+fx*span, ns=span*(e.deltaY>0?1.25:0.8);
    setView(cx-fx*ns,cx-fx*ns+ns);drawAll();
  },{passive:false});
}

/* ---------- Graphs screen: three Shelly charts for the current or a past session ---------- */
function ensureGraphDom(){
  if($('shHead'))return;
  const sg=document.getElementById('s-graph'); if(!sg)return;
  const btn=[...sg.children].filter(x=>x.tagName==='BUTTON').pop();
  const wrap=document.createElement('div'); wrap.id='shWrap';
  wrap.innerHTML=`<div class="card" id="shHead"><div class="label">Shelly charge graphs</div>
    <div class="small" id="shSub" style="margin:4px 0 8px">Pinch or drag to zoom and move. Tap a spot to read it. Gold tags are battery % you entered.</div>
    <select id="shPick" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--text);font-size:15px;font-family:inherit" onchange="farr22.pick(this.value)"></select>
    <div class="pair" style="margin-top:8px"><button class="chip" onclick="farr22.reset()">Reset zoom</button><button class="chip" onclick="farr22.askNow()">Enter battery %</button></div>
    <div id="shInfo" style="margin-top:8px"></div></div>`+
    CH.map(c=>`<div class="card"><div class="label">${c.name} (${c.unit==='R'?'Rands, R50 steps':c.unit})</div><div id="${c.id}Host" style="margin-top:6px"></div></div>`).join('');
  sg.insertBefore(wrap,btn||null);
  CH.forEach(c=>attach($(c.id+'Host')));
}
function pickList(){
  const L=window.__L22, live=L&&L.live&&L.live.charging&&L.live.session;
  const ss=sessions().slice().reverse().slice(0,60);
  const sel=$('shPick'); if(!sel)return;
  let h=''; if(live)h+=`<option value="open">Current session (charging now)</option>`;
  h+=ss.map(s=>`<option value="${s.start_ms}">${dstamp(s.start_ms)} · ${n2(s.kwh,2)} kWh · ${dur(s.duration_s)}</option>`).join('');
  if(!h)h='<option value="">No Shelly sessions yet</option>';
  sel.innerHTML=h;
  if(SEL)sel.value=SEL.open?'open':String(SEL.start);
}
async function loadSel(){
  const info=$('shInfo'); if(!SEL){if(info)info.innerHTML='<div class="small">No Shelly session to show yet. Graphs appear after the first charge measured by the Shelly.</div>';DATA=null;CH.forEach(c=>{const h=$(c.id+'Host');if(h)h.innerHTML='';});return;}
  if(info)info.innerHTML='<div class="small">Loading minute data from the Shelly…</div>';
  try{
    const end=SEL.open?Date.now():SEL.end, pts=await minutesFor(SEL.start,end,SEL.open);
    const marks=anchors().filter(a=>a.ts>=SEL.start-600000&&a.ts<=end+600000).map(a=>({ts:a.ts,pct:a.pct}));
    DATA={pts,marks};
    FULL=[SEL.start-60000,Math.max(end,(pts.length?pts[pts.length-1][0]+60000:end))+60000];
    if(!VIEW||VIEW._k!==SEL.start+(SEL.open?'o':'')){VIEW=[FULL[0],FULL[1]];VIEW._k=SEL.start+(SEL.open?'o':'');}
    else setView(VIEW[0],VIEW[1]);
    let kwh=0,pk=0;pts.forEach(p=>{kwh+=p[1]/60000;pk=Math.max(pk,p[3]||p[1]);});
    const pc=marks.length?marks.map(m=>Math.round(m.pct)+'% at '+hhmm(m.ts)).join(', '):'none entered';
    if(info)info.innerHTML=row('Started',dstamp(SEL.start))+row(SEL.open?'Running for':'Length',dur(((SEL.open?Date.now():SEL.end)-SEL.start)/1000))+row('Energy (wall)',n2(kwh,2)+' kWh')+row('Cost at home rate','R'+n2(kwh*rate(),2))+row('Peak power',Math.round(pk)+' W')+row('Battery %',esc(pc));
    drawAll();
  }catch(e){
    if(info)info.innerHTML='<div class="small">Could not read the minute data: '+esc(e.message)+'. Join the home Wi-Fi and open this page again.</div>';
    DATA=null;
  }
}
function defaultSel(){
  const L=window.__L22, live=L&&L.live&&L.live.charging&&L.live.session;
  if(live)return {open:true,start:L.live.session.start_ms};
  const ss=sessions(); const s=ss[ss.length-1]; return s?{open:false,start:s.start_ms,end:s.end_ms}:null;
}
function paintGraphs(){
  ensureGraphDom(); sessions(true);
  if(!SEL)SEL=defaultSel();
  pickList(); loadSel();
}
let graphTimer=null;
setInterval(()=>{const on=document.getElementById('s-graph');if(on&&on.classList.contains('on')&&SEL&&SEL.open&&document.visibilityState==='visible')loadSel();},60000);

/* ---------- History: list of Shelly sessions to graph ---------- */
function paintHistShelly(){
  const h=document.getElementById('s-hist'); if(!h)return;
  let c=$('histShelly'); if(!c){c=document.createElement('div');c.className='card';c.id='histShelly';h.appendChild(c);}
  const ss=sessions(true).slice().reverse().slice(0,25), an=anchors();
  if(!ss.length){c.innerHTML='<div class="label">Shelly charge sessions</div><div class="small" style="margin-top:6px">No Shelly sessions yet.</div>';return;}
  c.innerHTML='<div class="label">Shelly charge sessions</div><div class="small" style="margin:4px 0 6px">Tap Graph to see power, current and cost over time.</div>'+ss.map(s=>{
    const pc=an.filter(a=>a.ts>=s.start_ms-600000&&a.ts<=s.end_ms+600000).map(a=>Math.round(a.pct)+'%').join(' → ');
    return `<div class="row"><div>${dstamp(s.start_ms)}<div class="small">${n2(s.kwh,2)} kWh · ${dur(s.duration_s)} · R${n2(s.kwh*rate(),2)}${pc?' · '+esc(pc):''}</div></div><button class="chip" onclick="farr22.show(${s.start_ms})">Graph</button></div>`;
  }).join('');
}

/* ---------- battery % prompt during a Shelly session ---------- */
let PST=lsGet('farrq.pctState',{}), promptOpen=null, promptWhy='';
function ensurePromptDom(){
  if($('pctPrompt'))return;
  const m=$('meterCard'); if(!m)return;
  const d=document.createElement('div'); d.id='pctPrompt'; m.parentNode.insertBefore(d,m);
}
function showPrompt(why){
  ensurePromptDom(); const d=$('pctPrompt'); if(!d)return;
  promptOpen=true; promptWhy=why;
  d.innerHTML=`<div class="card" style="border-color:var(--gold)"><div class="label" style="color:var(--gold)">Battery % now?</div>
    <div class="small" style="margin:4px 0 8px">${esc(why)} Optional. It makes the charge estimates better. Charging is not affected.</div>
    <div class="pair"><input id="pctIn" type="number" inputmode="numeric" min="0" max="100" placeholder="e.g. 62" style="padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--text);font-size:18px;font-family:inherit;width:100%;box-sizing:border-box"><button class="btn gold" onclick="farr22.savePct()">Save</button></div>
    <button class="btn ghost" style="margin-top:8px" onclick="farr22.skipPct()">Skip</button></div>`;
}
function hidePrompt(){promptOpen=null;const d=$('pctPrompt');if(d)d.innerHTML='';}
function checkPrompt(L){
  const v=L&&L.live, se=v&&v.session, charging=!!(v&&v.charging&&se&&!L.demo);
  if(!charging){if(promptOpen)hidePrompt();return;}
  const sid=se.start_ms, now=Date.now();
  if(PST.sid!==sid){PST={sid,lastAsk:0,tapered:false,peak:0};lsSet('farrq.pctState',PST);}
  if(promptOpen)return;
  const lastPct=PCT.length?PCT[PCT.length-1].ts:0, last=Math.max(PST.lastAsk||0,lastPct>=sid-60000?lastPct:0);
  let why=null;
  if(!PST.lastAsk&&!(lastPct>=sid-60000))why='Charging has started.';
  else if(now-last>=30*60000)why='It has been 30 minutes or more since the last battery %.';
  else if(!PST.tapered&&se.peak_w>1000&&se.duration_s>600&&v.watts<0.85*se.peak_w&&v.watts>100){PST.tapered=true;lsSet('farrq.pctState',PST);why='The charge power is dropping, the battery is nearing full.';}
  if(why)showPrompt(why);
}

/* ---------- live estimate on Home ---------- */
function liveAnchor(se){
  const now=Date.now(), an=anchors().filter(a=>a.ts<=now);
  if(!an.length)return null;
  const a=an[an.length-1];
  return a;
}
function paintEst(){
  const el=$('liveEst'); if(!el)return;
  const L=window.__L22, v=L&&L.live, se=v&&v.session;
  if(!(v&&v.charging&&se&&!L.demo)){el.innerHTML='';return;}
  const M=buildModel(), a=liveAnchor(se);
  let p0=a?a.pct:null, enteredHere=!!(a&&a.src==='session'&&a.ts>=se.start_ms-60000), kwhSince;
  if(a){
    if(enteredHere&&a.kwh!=null)kwhSince=Math.max(0,se.kwh-a.kwh);
    else{
      kwhSince=se.kwh; const ss=sessions();
      ss.forEach(s=>{if(s.end_ms>a.ts&&s.start_ms<se.start_ms)kwhSince+=s.kwh;});
    }
  }
  if(p0==null){el.innerHTML=`<div class="card"><div class="hdr-row"><div class="label">Live charge estimate</div><div class="small">Rough</div></div><div class="small">Enter a battery % to see the time, kWh and cost to 100%. Delivered so far: ${n2(se.kwh,2)} kWh.</div><button class="btn ghost" style="margin-top:8px" onclick="farr22.askNow()">Enter battery %</button></div>`;return;}
  const R=ratioNow(M), pNow=Math.min(100,p0+100*(kwhSince/R)/pack());
  const full=pNow>=99.5, e=remaining(pNow,v.watts);
  const basis=enteredHere?'From the battery % you entered at '+hhmm(a.ts)+' and the live Shelly reading.':'Based on kWh only: the last known battery % ('+Math.round(p0)+'%) plus the energy delivered since.';
  el.innerHTML=`<div class="card"><div class="hdr-row"><div class="label">Live charge estimate</div><div class="small">${e.conf} · ${M.n} session${M.n===1?'':'s'}</div></div>`+
    row('Battery now (estimated)','≈ '+Math.round(pNow)+'%')+
    (full?row('Status','About full'):
    row('Time left to 100%',durMin(e.min))+row('Expected finish',hhmm(Date.now()+e.min*60000))+
    row('kWh still to deliver (wall)',n2(e.wall,2)+' kWh')+row('kWh still to go into battery',n2(e.batt,2)+' kWh')+
    row('Cost to 100% at home rate','R'+n2(e.cost,2)))+
    `<div class="small" style="margin-top:6px">${esc(basis)} ${esc(e.basis)}.</div>`+
    `<div class="pair" style="margin-top:8px"><button class="chip" onclick="farr22.askNow()">Enter battery %</button><button class="chip" onclick="farr22.show(${se.start_ms},true)">Charge graphs</button></div></div>`;
}

/* ---------- Learning and estimates page ---------- */
function curveSVG(M){
  const ps=[50,55,60,65,70,75,80,85,90,95,98], d=ps.map(p=>({p,e:remaining(p,M.typW)}));
  const W=Math.max(280,($('learnBody')&&$('learnBody').clientWidth-28)||320),H=170,ml=44,mr=10,mt=10,mb=26,pw=W-ml-mr,ph=H-mt-mb;
  const mx=Math.max(30,...d.map(x=>x.e.min)), top=Math.ceil(mx/30)*30;
  const X=p=>ml+(p-50)/48*pw, Y=m=>mt+ph-m/top*ph;
  let g='';for(let v=0;v<=top;v+=top/4)g+=`<line x1="${ml}" x2="${W-mr}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(--line)"/><text x="${ml-6}" y="${Y(v)+4}" text-anchor="end" style="fill:var(--muted);font-size:11px">${Math.round(v)}m</text>`;
  ps.filter((p,i)=>i%2===0).forEach(p=>{g+=`<text x="${X(p)}" y="${H-8}" text-anchor="middle" style="fill:var(--muted);font-size:11px">${p}%</text>`;});
  g+=`<path d="${d.map((x,i)=>(i?'L':'M')+X(x.p)+' '+Y(x.e.min)).join('')}" fill="none" style="stroke:var(--cyan)" stroke-width="2.5"/>`;
  d.forEach(x=>{g+=`<circle cx="${X(x.p)}" cy="${Y(x.e.min)}" r="3" style="fill:${x.e.taperN?'var(--green)':'var(--muted)'}"/>`;});
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}
let learnBusy=false;
async function prefetch(){
  if(learnBusy)return; learnBusy=true; let got=0;
  try{
    const M=buildModel();
    for(const r of M.info){
      if(got>=6)break;
      if(r.ins.length&&r.b&&r.a&&!MINS[r.s.start_ms]){try{await minutesFor(r.s.start_ms,r.s.end_ms,false);got++;}catch(e){break;}}
    }
  }finally{learnBusy=false;}
  return got;
}
function paintLearn(){
  const body=$('learnBody'); if(!body)return;
  sessions(true);
  const M=buildModel(), c=conf(M.n), R=ratioNow(M);
  const rebuilt=lsGet('farrq.learnVer','');
  if(rebuilt!==VER()){lsSet('farrq.learnVer',VER());MODEL=null;}
  const rows=[50,60,70,80,85,90,95,98].map(p=>{const e=remaining(p,M.typW);return `<div class="row"><span>${p}% → 100%</span><b style="text-align:right">${durMin(e.min)} · ${n2(e.wall,1)} kWh · R${n2(e.cost,0)}</b></div>`;}).join('');
  body.innerHTML=
    `<div class="card"><div class="hdr-row"><div class="label">How sure the estimates are</div><div class="small"><b>${c}</b></div></div>`+
    row('Shelly sessions stored',M.total)+row('Sessions used for learning',M.n)+row('Full charges used for the taper',M.taper.length)+
    row('Battery % readings stored',M.nAnch)+
    `<div class="small" style="margin-top:6px">Rough is 0 to 2 sessions, Improving is 3 to 9, Good is 10 or more. Until there is enough history the app uses ${pack().toFixed(1)} kWh and the ${lossPct()}% loss from Settings.</div></div>`+
    `<div class="card"><div class="label">Wall to battery</div>`+
    row('Used now',M.ratio!=null?'measured '+R.toFixed(2)+' (loss ≈ '+((R-1)*100).toFixed(0)+'%)':'setting '+R.toFixed(2)+' (loss '+lossPct()+'%)')+
    row('Sessions with start and end %',M.nRatio)+
    `<div class="small" style="margin-top:6px">${M.ratio!=null?'The measured value is used because 3 or more sessions have a start and end battery %.':'The measured value is used once 3 sessions have a start and end battery %.'} Your Settings value is not changed.</div></div>`+
    `<div class="card"><div class="label">Taper near 100%</div><div class="small" style="margin:4px 0 6px">Time left to 100% from each battery level. Green dots are learned, grey dots are straight-line.</div><div id="learnCurve">${curveSVG(M)}</div>${rows}</div>`+
    `<div class="card"><div class="label">Estimate from any battery %</div><div class="field" style="margin-top:8px"><label for="lnPct">Battery % now</label><input id="lnPct" type="number" inputmode="numeric" min="0" max="100" oninput="farr22.est()"></div><div id="lnOut" class="small">Type a battery % to see the time, kWh and cost to 100%.</div></div>`+
    `<div class="card"><div class="small" id="lnFetch">Figures rebuilt from all stored sessions for ${esc(VER())}. Minute detail for older sessions is fetched from the Shelly when you are on home Wi-Fi.</div><button class="btn ghost" style="margin-top:8px" onclick="farr22.fetch()">Fetch charge detail now</button></div>`;
  prefetch().then(n=>{if(n){MODEL=null;if(document.getElementById('s-learn').classList.contains('on'))paintLearn();}}).catch(()=>{});
}
function estFromInput(){
  const el=$('lnOut'), v=parseFloat(($('lnPct')||{}).value); if(!el)return;
  if(isNaN(v)||v<0||v>100){el.textContent='Type a battery % between 0 and 100.';return;}
  const L=window.__L22, w=L&&L.live&&L.live.charging?L.live.watts:null, e=remaining(v,w);
  el.innerHTML=row('Time to 100%',durMin(e.min))+row('Finish if started now',hhmm(Date.now()+e.min*60000))+row('kWh from the wall',n2(e.wall,2)+' kWh')+row('kWh into the battery',n2(e.batt,2)+' kWh')+row('Cost at home rate','R'+n2(e.cost,2))+row('Confidence',e.conf+' · '+e.n+' session'+(e.n===1?'':'s'))+`<div class="small" style="margin-top:6px">${esc(e.basis)}.</div>`;
}

/* ---------- wiring ---------- */
const farr22={
  onLive(L){
    window.__L22=L;
    try{ensurePromptDom();checkPrompt(L);}catch(e){}
    try{paintEst();}catch(e){}
    try{if(L&&L.online&&!farr22._pf){farr22._pf=true;setTimeout(()=>prefetch().catch(()=>{}),4000);}}catch(e){}
  },
  savePct(){
    const x=parseFloat(($('pctIn')||{}).value);
    if(isNaN(x)||x<0||x>100){say('Enter a battery % from 0 to 100');return;}
    const L=window.__L22, se=L&&L.live&&L.live.session;
    addPct(x,'prompt',se?se.kwh:null); PST.lastAsk=Date.now(); lsSet('farrq.pctState',PST);
    hidePrompt(); say('Battery '+Math.round(x)+'% saved'); paintEst(); if(SEL)loadSel();
  },
  skipPct(){PST.lastAsk=Date.now();lsSet('farrq.pctState',PST);hidePrompt();},
  askNow(){
    const L=window.__L22, charging=L&&L.live&&L.live.charging;
    if(!charging){say('Battery % can be entered while a Shelly charge is running');return;}
    if(!document.getElementById('s-home').classList.contains('on'))go('home');
    showPrompt('You asked to enter the battery %.');
    const d=$('pctPrompt');if(d&&d.scrollIntoView)d.scrollIntoView({block:'center'});
  },
  pick(v){
    if(v==='open'){const L=window.__L22;SEL=L&&L.live&&L.live.session?{open:true,start:L.live.session.start_ms}:null;}
    else{const s=sessions().find(x=>String(x.start_ms)===String(v));SEL=s?{open:false,start:s.start_ms,end:s.end_ms}:null;}
    VIEW=null;CUR=null;loadSel();
  },
  show(startMs,open){
    sessions(true);
    if(open){const L=window.__L22;SEL=L&&L.live&&L.live.session?{open:true,start:L.live.session.start_ms}:null;}
    else{const s=sessions().find(x=>x.start_ms===startMs);SEL=s?{open:false,start:s.start_ms,end:s.end_ms}:null;}
    VIEW=null;CUR=null;go('graph');
    const h=$('shHead');if(h&&h.scrollIntoView)h.scrollIntoView();
  },
  reset(){if(FULL){VIEW=[FULL[0],FULL[1]];VIEW._k=SEL?SEL.start+(SEL.open?'o':''):'';CUR=null;drawAll();}},
  est:estFromInput,
  fetch(){const el=$('lnFetch');if(el)el.textContent='Fetching from the Shelly…';prefetch().then(n=>{MODEL=null;paintLearn();say(n?'Fetched '+n+' session'+(n>1?'s':''):'Nothing new to fetch');}).catch(e=>{if(el)el.textContent='Could not reach the Shelly: '+e.message;});},
  model:buildModel,remaining:remaining,anchors:anchors,addPct:addPct
};
window.farr22=farr22;
const prevOn=window.farrOnScreen;
window.farrOnScreen=function(id){
  if(prevOn)prevOn(id);
  try{
    if(id==='graph')paintGraphs();
    if(id==='hist')paintHistShelly();
    if(id==='learn')paintLearn();
    if(id==='home'){ensurePromptDom();paintEst();}
  }catch(e){}
};
try{ensurePromptDom();}catch(e){}
})();
