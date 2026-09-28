/* ============================================================
 *  🎴 카드 뽑기 · 대결 (우리집 학습플래너)
 *  - 부모: 카드 이미지 링크를 붙여 넣어 가족 카드풀에 등록 · 자녀에게 카드/뽑기권 직접 지급
 *  - 자녀: 공부로 뽑기권을 얻어 뽑기 → 같은 카드는 겹쳐서 레벨업 → 덱 3장으로 형제·연습 대결
 *  - 데이터
 *    cardHub/{부모uid}/pool/{카드id}    카드풀 {name, img, rarity, power} — 부모만 쓰기, 가족 읽기
 *    cardHub/{부모uid}/decks/{자녀uid}  대결용 덱 공개본 — 자녀 본인 쓰기, 가족 읽기
 *    cardHub/{부모uid}/battles/{id}     대결 기록 — 가족 읽기/만들기
 *    planner/{자녀uid}/cards/{카드id}   내 카드 {count, …카드 정보}
 *    planner/{자녀uid}/meta/cardWallet  {tickets, claimed{날짜:n}, pity, draws, deck[], winDay}
 *  - 카드는 링크(이미지 주소)로만 관리해요. 이미지를 저장소에 올리지 않아요.
 * ============================================================ */
(function(){
const RAR={
  C:{name:"일반", w:60, lo:30, hi:50, color:"#94A3B8", bg:"#F1F5F9"},
  R:{name:"희귀", w:28, lo:50, hi:70, color:"#3B82F6", bg:"#EFF6FF"},
  E:{name:"영웅", w:10, lo:70, hi:90, color:"#A855F7", bg:"#FAF5FF"},
  L:{name:"전설", w:2,  lo:90, hi:110, color:"#F59E0B", bg:"#FFFBEB"},
};
const ORDER=["L","E","R","C"];
const PITY=10;              // 10번 연속 영웅 미만이면 다음은 영웅 이상
const MAX_LV=5;
const DAY_TICKETS=[         // 하루에 얻는 뽑기권 (최대 4장)
  {id:"m60",  label:"오늘 공부 1시간",            test:s=>s.min>=60},
  {id:"m120", label:"오늘 공부 2시간",            test:s=>s.min>=120},
  {id:"t30",  label:"타이머로 30분 이상",          test:s=>s.timed>=30},
  {id:"acc",  label:"학습앱 10문제 이상 · 정답률 80%↑", test:s=>s.appN>=10 && s.appAcc>=0.8},
];

const hub=p=>db.collection("cardHub").doc(p);
const mine=uid=>db.collection("planner").doc(uid);
const walletRef=uid=>mine(uid).collection("meta").doc("cardWallet");
const eh=s=>typeof esc==="function"? esc(s) : String(s==null?"":s);
const today=()=>fmt(new Date());

function hash(s){ let h=2166136261; for(const c of String(s)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return Math.abs(h); }
function basePower(c){ if(Number(c.power)>0) return Number(c.power); const r=RAR[c.rarity]||RAR.C; return r.lo + hash(c.id)%(r.hi-r.lo+1); }
function level(c){ return Math.max(1, Math.min(MAX_LV, Number(c.count)||1)); }
function power(c){ return Math.round(basePower(c)*(1+0.15*(level(c)-1))); }
function parseRarity(v){
  v=String(v||"").trim().toUpperCase();
  if(/^(L|전설|LEGEND)/.test(v)) return "L";
  if(/^(E|영웅|EPIC|SR|UR)/.test(v)) return "E";
  if(/^(R|희귀|RARE)/.test(v)) return "R";
  return "C";
}
function nameFromUrl(u){
  try{ const f=decodeURIComponent(new URL(u).pathname.split("/").pop()||""); return f.replace(/\.[a-z0-9]+$/i,"").replace(/[_-]+/g," ").slice(0,30)||"카드"; }catch(_){ return "카드"; }
}
function cardImg(c, cls){
  const r=RAR[c.rarity]||RAR.C;
  return `<div class="cd-img ${cls||""}" style="--rc:${r.color}">
    <img src="${eh(c.img)}" alt="${eh(c.name)}" loading="lazy" referrerpolicy="no-referrer"
      onerror="this.remove()">
    <span class="cd-fb">${eh(c.name)}</span></div>`;
}
function cardTile(c, opts){
  opts=opts||{};
  const r=RAR[c.rarity]||RAR.C;
  return `<div class="cd-tile ${opts.sel?"sel":""} ${opts.locked?"locked":""}" style="--rc:${r.color};--rb:${r.bg}" ${opts.on?`onclick="${opts.on}"`:""}>
    ${cardImg(c)}
    <div class="cd-meta"><span class="cd-rar">${r.name}</span>${opts.locked?"":`<span class="cd-pw">⚔ ${opts.pw!=null?opts.pw:power(c)}</span>`}</div>
    <div class="cd-name">${eh(c.name)}${c.count>1?` <b>Lv${level(c)}</b>`:""}</div>
    ${opts.extra||""}
  </div>`;
}

/* ----- 가족(부모) 찾기 ----- */
async function familyParents(){
  if(state.profile.role==="parent") return [state.user.uid];
  try{
    const L=await Family.listMine(db, state.user), out=new Set();
    L.sent.filter(r=>r.status==="accepted" && r.fromRole!=="parent" && r.toUid).forEach(r=>out.add(r.toUid));
    L.received.filter(r=>r.status==="accepted" && r.fromRole==="parent" && r.fromUid).forEach(r=>out.add(r.fromUid));
    return [...out];
  }catch(e){ console.warn("가족 찾기", e); return []; }
}
async function loadPool(parents){
  const out={};
  await Promise.all(parents.map(async p=>{
    try{ (await hub(p).collection("pool").get()).docs.forEach(d=>{ out[d.id]={...d.data(), id:d.id, hub:p}; }); }
    catch(e){ console.warn("카드풀", e); }
  }));
  return out;
}
async function loadWallet(uid){
  const d=await walletRef(uid).get();
  return {tickets:0, claimed:{}, pity:0, draws:0, deck:[], ...(d.exists? d.data() : {})};
}
async function saveWallet(uid, w){ await walletRef(uid).set(w); }
async function loadMyCards(uid){
  const s=await mine(uid).collection("cards").get();
  const out={}; s.docs.forEach(d=>{ out[d.id]={...d.data(), id:d.id}; }); return out;
}
async function giveCard(uid, c){
  const ref=mine(uid).collection("cards").doc(c.id);
  const d=await ref.get(), cur=d.exists? d.data() : null;
  const next={id:c.id, name:c.name, img:c.img, rarity:c.rarity, power:Number(c.power)||0,
    count:(cur? Number(cur.count)||1 : 0)+1, firstAt:cur? cur.firstAt : Date.now(), lastAt:Date.now()};
  await ref.set(next);
  return {card:next, isNew:!cur};
}

/* ----- 오늘의 뽑기권 ----- */
function dayStats(ds){
  const tasks=(state.tasks||[]).filter(t=>t.date===ds);
  const X=(typeof extData==="function")? extData() : {};
  const focus=Math.round(Number(((X&&X.focusFree)||{})[ds])||0);
  const task=tasks.reduce((a,t)=>a+verifiedMin(t),0);
  const timed=tasks.reduce((a,t)=>a+timedMin(t),0)+focus;
  const app=(typeof extCreditedOn==="function")? extCreditedOn(ds, X).total : 0;
  const acc=(typeof appAccuracy==="function" && X)? appAccuracy([ds], X) : {total:0, acc:null};
  return {min:task+focus+app, timed, appN:acc.total, appAcc:acc.acc||0};
}
function dayEarned(ds){ const s=dayStats(ds); return DAY_TICKETS.map(q=>({...q, ok:q.test(s)})); }

/* ----- 뽑기 ----- */
function rollRarity(pity, avail){
  let pool=ORDER.filter(k=>avail[k]);
  if(pity>=PITY-1 && pool.some(k=>k==="E"||k==="L")) pool=pool.filter(k=>k==="E"||k==="L");
  const tot=pool.reduce((a,k)=>a+RAR[k].w,0);
  let x=Math.random()*tot;
  for(const k of pool){ x-=RAR[k].w; if(x<0) return k; }
  return pool[pool.length-1];
}

/* ============ 자녀 화면 ============ */
let CS=null;   // {uid, parents, pool, cards, wallet, tab, pick}
async function drawCards(tab){
  const uid=state.ownerUid;
  if(state.profile.role==="parent" && !state.viewingChild){ return drawCardAdmin(); }
  hubShell("🎴 카드", `<div class="empty">불러오는 중…</div>`);
  try{
    if(typeof ensureExt==="function") await ensureExt();
    const parents=state.viewingChild? [state.user.uid] : await familyParents();
    const [pool, cards, wallet]=await Promise.all([loadPool(parents), loadMyCards(uid), loadWallet(uid)]);
    CS={uid, parents, pool, cards, wallet, tab:tab||(CS&&CS.tab)||"draw", reveal:null, battle:null, opps:null};
    renderCards();
  }catch(e){
    console.error(e);
    hubShell("🎴 카드", `<div class="empty">카드를 불러오지 못했어요.<br><small>${eh(typeof firestoreDiag==="function"? firestoreDiag(e) : e.message)}</small><br><br>Firebase 보안 규칙에 <b>cardHub</b> 규칙이 필요해요. 저장소의 firestore.rules 를 다시 게시해 주세요.</div>`);
  }
}
function renderCards(){
  if(!CS) return;
  const tabs=[["draw","🎁 뽑기"],["mine","🃏 내 카드"],["battle","⚔️ 대결"]];
  const head=`<div class="seg cd-tabs">${tabs.map(([k,l])=>`<button class="${CS.tab===k?"on":""}" onclick="Cards.tab('${k}')">${l}</button>`).join("")}</div>`;
  const body= CS.tab==="mine"? mineHTML() : CS.tab==="battle"? battleHTML() : drawHTML();
  hubShell("🎴 카드"+(state.viewingChild?` · ${eh(state.ownerName)}`:""), head+body);
}
function poolSize(){ return Object.keys(CS.pool).length; }
function drawHTML(){
  const W=CS.wallet, ds=today(), got=Number(W.claimed[ds])||0, list=dayEarned(ds), ok=list.filter(q=>q.ok).length;
  const can=Math.max(0, ok-got), n=poolSize();
  const ro=state.viewingChild;
  let rev="";
  if(CS.reveal){
    const R=CS.reveal;
    rev=`<div class="cd-reveal"><div class="cd-flip">${cardTile(R.card)}</div>
      <div class="cd-rv-txt">${R.isNew?"✨ 새 카드!":`🔁 겹친 카드 → <b>Lv${level(R.card)}</b> (⚔ ${power(R.card)})`}</div></div>`;
  }
  return `
    <div class="cd-ticket">
      <div><div class="cd-t-lbl">내 뽑기권</div><div class="cd-t-n">🎟 ${W.tickets||0}장</div></div>
      <button class="pay-btn" ${(!ro && W.tickets>0 && n)?"":"disabled"} onclick="Cards.draw()">카드 뽑기</button>
    </div>
    ${n? "" : `<div class="pb-sub warn" style="margin:8px 0">아직 카드풀이 비어 있어요. 부모님이 카드 링크를 등록하면 뽑을 수 있어요.</div>`}
    ${rev}
    <div class="r-sec">오늘 얻을 수 있는 뽑기권 (하루 최대 ${DAY_TICKETS.length}장)</div>
    <div class="cd-quests">${list.map(q=>`<div class="cd-q ${q.ok?"ok":""}"><span>${q.ok?"✅":"⬜"}</span>${eh(q.label)}</div>`).join("")}</div>
    <button class="ghost-btn" style="width:100%;margin-top:8px" ${(!ro && can>0)?"":"disabled"} onclick="Cards.claim()">${can>0?`🎟 뽑기권 ${can}장 받기`:(got? `오늘 ${got}장 받았어요`:"공부하면 받을 수 있어요")}</button>
    <div class="cd-note">등급 확률: 일반 ${RAR.C.w}% · 희귀 ${RAR.R.w}% · 영웅 ${RAR.E.w}% · 전설 ${RAR.L.w}% · ${PITY}번 안에 영웅 이상 1장 보장 (지금 ${W.pity||0}/${PITY})<br>
      같은 카드가 또 나오면 레벨업 (최대 Lv${MAX_LV}, 레벨마다 공격력 +15%). 대결에서 이기면 하루 한 번 뽑기권 +1.</div>`;
}
function mineHTML(){
  const list=Object.values(CS.cards).sort((a,b)=>ORDER.indexOf(a.rarity)-ORDER.indexOf(b.rarity) || power(b)-power(a));
  const n=poolSize(), have=Object.keys(CS.cards).filter(id=>CS.pool[id]).length;
  const deck=CS.wallet.deck||[];
  const missing=Object.values(CS.pool).filter(c=>!CS.cards[c.id]).sort((a,b)=>ORDER.indexOf(a.rarity)-ORDER.indexOf(b.rarity));
  return `<div class="cd-dex"><b>도감 ${have}/${n}</b><div class="metric-track"><div class="metric-fill" style="width:${n?Math.round(have/n*100):0}%;background:#F59E0B"></div></div></div>
    <div class="cd-note" style="margin-top:0">${state.viewingChild?"":"카드를 눌러 대결 덱(3장)에 넣거나 뺄 수 있어요."}</div>
    <div class="cd-grid">${list.map(c=>cardTile(c,{sel:deck.includes(c.id), on:state.viewingChild?"":`Cards.toggleDeck('${c.id}')`,
       extra:deck.includes(c.id)?`<span class="cd-deck">덱 ${deck.indexOf(c.id)+1}</span>`:""})).join("") || `<div class="empty" style="grid-column:1/-1">아직 카드가 없어요. 뽑기에서 첫 카드를 뽑아 보세요!</div>`}</div>
    ${missing.length?`<div class="r-sec">아직 못 모은 카드 ${missing.length}장</div>
      <div class="cd-grid">${missing.map(c=>cardTile({...c, name:"???"},{locked:true})).join("")}</div>`:""}`;
}
function deckCards(){ return (CS.wallet.deck||[]).map(id=>CS.cards[id]).filter(Boolean); }
function weekBoost(){
  // 이번 주 공부 1시간당 +1% (최대 +15%) — 공부를 많이 할수록 대결에 유리
  const days=(typeof allowanceWeekDays==="function")? allowanceWeekDays() : [];
  const min=days.reduce((a,ds)=>a+dayStats(ds).min,0);
  return Math.min(0.15, Math.floor(min/60)*0.01);
}
function battleHTML(){
  const d=deckCards(), boost=weekBoost();
  const B=CS.battle;
  let res="";
  if(B){
    res=`<div class="cd-battle ${B.win?"win":"lose"}">
      <div class="cd-b-ttl">${B.win?"🏆 승리!":"😤 아쉽게 졌어요"} <span>${B.score}</span></div>
      ${B.rounds.map((r,i)=>`<div class="cd-round">
        <div class="cd-side ${r.me>=r.op?"w":""}">${cardImg(r.a,"sm")}<b>${r.me}</b></div>
        <span class="cd-vs">R${i+1}</span>
        <div class="cd-side ${r.op>r.me?"w":""}"><b>${r.op}</b>${cardImg(r.b,"sm")}</div></div>`).join("")}
      ${B.reward?`<div class="cd-note" style="text-align:center">🎟 승리 보상 뽑기권 +1</div>`:""}
    </div>`;
  }
  const opps=CS.opps;
  return `
    <div class="r-sec">내 덱 (${d.length}/3) · 이번 주 공부 보너스 +${Math.round(boost*100)}%</div>
    <div class="cd-grid three">${[0,1,2].map(i=>d[i]? cardTile(d[i]) : `<div class="cd-tile empty-slot" onclick="Cards.tab('mine')">+ 카드 넣기</div>`).join("")}</div>
    ${res}
    <div class="r-sec">대결 상대</div>
    ${d.length<3? `<div class="pb-sub warn">내 카드에서 덱 3장을 먼저 골라 주세요.</div>` : ""}
    ${opps==null? `<div class="empty">불러오는 중…</div>` :
      opps.map((o,i)=>`<div class="list-item" style="margin-bottom:6px">
        <span style="flex:1;min-width:0"><b>${eh(o.name)}</b> <small style="color:#94A3B8">${o.cpu?"연습 상대":`덱 ⚔ ${o.cards.reduce((a,c)=>a+c.pw,0)} · 보너스 +${Math.round((o.boost||0)*100)}%`}</small></span>
        <button class="fam-btn" ${(d.length<3||state.viewingChild)?"disabled":""} onclick="Cards.fight(${i})">대결</button></div>`).join("")}
    ${CS.log&&CS.log.length?`<div class="r-sec">최근 대결</div>${CS.log.map(l=>`<div class="cd-log">${eh(l.a)} ${l.win?"🏆":"·"} vs ${eh(l.b)} ${l.win?"":"🏆"} <small>${eh(l.score)} · ${new Date(l.at).toLocaleDateString()}</small></div>`).join("")}`:""}
    <div class="cd-note">3판 2선승. 각 판은 카드 공격력 × (1 + 이번 주 공부 보너스) × 운(±15%)으로 겨뤄요. 져도 카드는 잃지 않아요.</div>`;
}
async function loadOpps(){
  const opps=[], seen=new Set([CS.uid]), log=[];
  for(const p of CS.parents){
    try{
      (await hub(p).collection("decks").get()).docs.forEach(d=>{
        if(seen.has(d.id)) return; seen.add(d.id);
        const x=d.data(); if(x.cards && x.cards.length===3) opps.push({uid:d.id, name:x.name||"형제", cards:x.cards, boost:Number(x.boost)||0});
      });
      (await hub(p).collection("battles").get()).docs.forEach(d=>log.push(d.data()));
    }catch(e){ console.warn("대결 상대", e); }
  }
  const pool=Object.values(CS.pool);
  if(pool.length>=3){
    const pick=[...pool].sort(()=>Math.random()-0.5).slice(0,3).map(c=>({...c, pw:basePower(c)}));
    opps.push({cpu:true, name:"🤖 연습 상대", cards:pick, boost:0.05});
  }
  CS.opps=opps;
  CS.log=log.filter(l=>l.aUid===CS.uid||l.bUid===CS.uid).sort((a,b)=>b.at-a.at).slice(0,5);
}
async function publishDeck(){
  const d=deckCards();
  const doc={name:state.ownerName||state.profile.name||"", cards:d.map(c=>({id:c.id, name:c.name, img:c.img, rarity:c.rarity, pw:power(c)})), boost:weekBoost(), updatedAt:Date.now()};
  await Promise.all(CS.parents.map(p=>hub(p).collection("decks").doc(CS.uid).set(doc).catch(e=>console.warn("덱 공개", e))));
}

const Cards={
  open:drawCards,
  admin:()=>drawCardAdmin(),
  tab(k){ CS.tab=k; CS.reveal=null; if(k==="battle" && CS.opps==null){ renderCards(); loadOpps().then(renderCards); } else renderCards(); },
  async claim(){
    const W=CS.wallet, ds=today(), got=Number(W.claimed[ds])||0, ok=dayEarned(ds).filter(q=>q.ok).length, add=ok-got;
    if(add<=0) return;
    W.tickets=(Number(W.tickets)||0)+add; W.claimed={...W.claimed, [ds]:ok};
    // 오래된 기록 정리 (14일)
    const cut=fmt(addDays(new Date(),-14)); Object.keys(W.claimed).forEach(k=>{ if(k<cut) delete W.claimed[k]; });
    await saveWallet(CS.uid, W); toast(`🎟 뽑기권 ${add}장을 받았어요!`,"cheer"); renderCards();
  },
  async draw(){
    const W=CS.wallet; if(!(W.tickets>0)) return;
    const pool=Object.values(CS.pool); if(!pool.length) return;
    const avail={}; pool.forEach(c=>{ (avail[c.rarity]=avail[c.rarity]||[]).push(c); });
    const rk=rollRarity(Number(W.pity)||0, avail);
    const list=avail[rk], c=list[Math.floor(Math.random()*list.length)];
    W.tickets-=1; W.draws=(Number(W.draws)||0)+1; W.pity=(rk==="E"||rk==="L")? 0 : (Number(W.pity)||0)+1;
    await saveWallet(CS.uid, W);
    const r=await giveCard(CS.uid, c);
    CS.cards[c.id]=r.card; CS.reveal=r;
    if((W.deck||[]).includes(c.id)) publishDeck();
    renderCards();
    if(rk==="L") toast("🌟 전설 카드!","cheer"); else if(rk==="E") toast("💜 영웅 카드!","cheer");
  },
  async toggleDeck(id){
    const W=CS.wallet; let d=[...(W.deck||[])];
    if(d.includes(id)) d=d.filter(x=>x!==id);
    else { if(d.length>=3){ toast("덱은 3장까지예요. 먼저 한 장을 빼 주세요","info"); return; } d.push(id); }
    W.deck=d; await saveWallet(CS.uid, W); if(d.length===3) publishDeck(); renderCards();
  },
  async fight(i){
    const o=CS.opps[i], me=deckCards(); if(!o || me.length<3) return;
    const mb=weekBoost(), luck=()=>0.85+Math.random()*0.3;
    const rounds=[0,1,2].map(k=>{
      const a=me[k], b=o.cards[k];
      return {a, b, me:Math.round(power(a)*(1+mb)*luck()), op:Math.round((Number(b.pw)||basePower(b))*(1+(o.boost||0))*luck())};
    });
    const w=rounds.filter(r=>r.me>=r.op).length, win=w>=2, score=`${w} : ${3-w}`;
    const W=CS.wallet; let reward=false;
    if(win && W.winDay!==today()){ W.winDay=today(); W.tickets=(Number(W.tickets)||0)+1; reward=true; await saveWallet(CS.uid, W); }
    CS.battle={rounds, win, score, reward};
    const logDoc={aUid:CS.uid, a:state.ownerName||"", bUid:o.uid||"cpu", b:o.name, win, score, at:Date.now()};
    if(CS.parents[0]) hub(CS.parents[0]).collection("battles").add(logDoc).catch(()=>{});
    CS.log=[logDoc, ...(CS.log||[])].slice(0,5);
    publishDeck();
    renderCards();
  },
};

/* ============ 부모 화면: 카드풀 · 지급 ============ */
let CA=null;
async function drawCardAdmin(){
  hubShell("🎴 카드 관리", `<div class="empty">불러오는 중…</div>`);
  try{
    const p=state.user.uid;
    const pool=await loadPool([p]);
    const kids=await Promise.all((state.children||[]).map(async ch=>{
      const [cards, wallet]=await Promise.all([loadMyCards(ch.uid).catch(()=>({})), loadWallet(ch.uid).catch(()=>({tickets:0}))]);
      return {...ch, cards, wallet};
    }));
    CA={p, pool, kids};
    renderAdmin();
  }catch(e){
    console.error(e);
    hubShell("🎴 카드 관리", `<div class="empty">불러오지 못했어요.<br><small>${eh(typeof firestoreDiag==="function"? firestoreDiag(e) : e.message)}</small><br><br>Firebase 보안 규칙에 <b>cardHub</b> 규칙이 필요해요. 저장소의 firestore.rules 를 다시 게시해 주세요.</div>`);
  }
}
function renderAdmin(){
  const pool=Object.values(CA.pool).sort((a,b)=>ORDER.indexOf(a.rarity)-ORDER.indexOf(b.rarity) || (a.name||"").localeCompare(b.name||""));
  const cnt=k=>pool.filter(c=>c.rarity===k).length;
  const opts=pool.map(c=>`<option value="${c.id}">[${RAR[c.rarity].name}] ${eh(c.name)}</option>`).join("");
  hubShell("🎴 카드 관리", `
    <div class="r-sec" style="margin-top:0">카드 링크 등록</div>
    <textarea class="textarea" id="cdAdd" rows="4" placeholder="한 줄에 카드 하나 — 이미지 링크만 붙여도 돼요&#10;https://…/pikachu.png&#10;피카츄 | https://…/pikachu.png | 희귀&#10;리자몽 | https://…/charizard.jpg | 전설 | 105"></textarea>
    <div class="cd-note" style="margin-top:4px">형식: <b>이름 | 이미지 링크 | 등급(일반·희귀·영웅·전설) | 공격력(선택)</b>. 카드 이미지를 길게 누르거나 오른쪽 클릭 → <b>이미지 주소 복사</b>로 링크를 얻을 수 있어요.</div>
    <button class="pay-btn" style="width:100%;margin-top:8px" onclick="Cards.addLinks()">카드풀에 추가</button>

    <div class="r-sec">자녀에게 지급</div>
    ${CA.kids.length? CA.kids.map((k,i)=>`<div class="cd-kid">
        <div class="cd-kid-h"><b>${eh(k.name)}</b><span>🎟 ${Number(k.wallet.tickets)||0}장 · 카드 ${Object.keys(k.cards).length}종</span></div>
        <div class="me-row"><select class="inp" id="cdGive-${i}">${opts||"<option value=''>카드풀이 비어 있어요</option>"}</select>
          <button class="fam-btn" onclick="Cards.grant(${i})">카드 주기</button></div>
        <div class="me-row" style="margin-top:6px">
          <button class="ghost-btn" onclick="Cards.tickets(${i},1)">뽑기권 +1</button>
          <button class="ghost-btn" onclick="Cards.tickets(${i},3)">뽑기권 +3</button>
          <button class="ghost-btn" onclick="Cards.tickets(${i},-1)">−1</button></div>
      </div>`).join("") : `<div class="cd-note">연결된 자녀가 없어요. ⋯ 메뉴 → 가족 연결에서 먼저 연결하세요.</div>`}

    <div class="r-sec">카드풀 ${pool.length}장 <small style="color:#94A3B8;font-weight:600">전설 ${cnt("L")} · 영웅 ${cnt("E")} · 희귀 ${cnt("R")} · 일반 ${cnt("C")}</small></div>
    <div class="cd-grid">${pool.map(c=>cardTile(c,{extra:`<div class="cd-adm">
        <select onchange="Cards.setRarity('${c.id}',this.value)">${ORDER.map(k=>`<option value="${k}" ${c.rarity===k?"selected":""}>${RAR[k].name}</option>`).join("")}</select>
        <button onclick="Cards.remove('${c.id}')" title="삭제">✕</button></div>`})).join("") || `<div class="empty" style="grid-column:1/-1">아직 카드가 없어요. 위에 카드 링크를 붙여 넣어 주세요.</div>`}</div>
  `);
}
Object.assign(Cards, {
  async addLinks(){
    const el=document.getElementById("cdAdd"); const lines=(el.value||"").split(/\n/).map(s=>s.trim()).filter(Boolean);
    let n=0, bad=0;
    for(const line of lines){
      const parts=line.split("|").map(s=>s.trim());
      const urlIdx=parts.findIndex(s=>/^https?:\/\//i.test(s));
      if(urlIdx<0){ bad++; continue; }
      const img=parts[urlIdx];
      const rest=parts.filter((_,i)=>i!==urlIdx);
      const name=(rest[0] && !/^(일반|희귀|영웅|전설|[CREL])$/i.test(rest[0]) && !/^\d+$/.test(rest[0]))? rest[0] : nameFromUrl(img);
      const rar=parseRarity(rest.find(s=>/^(일반|희귀|영웅|전설|[CREL]|SR|UR|RARE|EPIC|LEGEND)/i.test(s))||"");
      const pw=Number(rest.find(s=>/^\d+$/.test(s)))||0;
      const id="c"+hash(img).toString(36);
      const doc={name:name.slice(0,30), img, rarity:rar, power:pw, addedAt:Date.now()};
      await hub(CA.p).collection("pool").doc(id).set(doc);
      CA.pool[id]={...doc, id, hub:CA.p}; n++;
    }
    toast(`카드 ${n}장을 등록했어요`+(bad?` (링크 없는 줄 ${bad}개 제외)`:""),"good");
    renderAdmin();
  },
  async setRarity(id, r){
    const {hub:_h, id:_i, ...doc}=CA.pool[id];
    await hub(CA.p).collection("pool").doc(id).set({...doc, rarity:r});
    CA.pool[id].rarity=r; renderAdmin();
  },
  async remove(id){
    if(!confirm(`'${CA.pool[id].name}' 카드를 카드풀에서 뺄까요?\n(이미 가진 자녀의 카드는 그대로 남아요)`)) return;
    await hub(CA.p).collection("pool").doc(id).delete(); delete CA.pool[id]; renderAdmin();
  },
  async grant(i){
    const k=CA.kids[i], id=(document.getElementById("cdGive-"+i)||{}).value, c=CA.pool[id];
    if(!k || !c) return;
    const r=await giveCard(k.uid, c); k.cards[id]=r.card;
    toast(`${k.name}에게 '${c.name}' 카드를 줬어요`+(r.isNew?"":` (Lv${level(r.card)})`),"good"); renderAdmin();
  },
  async tickets(i, n){
    const k=CA.kids[i]; if(!k) return;
    const W=await loadWallet(k.uid); W.tickets=Math.max(0,(Number(W.tickets)||0)+n); await saveWallet(k.uid, W);
    k.wallet=W; toast(`${k.name} 뽑기권 ${W.tickets}장`,"good"); renderAdmin();
  },
});

// 스타일
const css=`
.cd-tabs{margin:0 0 12px}
.cd-ticket{display:flex;align-items:center;justify-content:space-between;gap:10px;background:linear-gradient(135deg,#FFF7E8,#FDF2FF);border:1px solid #F5DFA6;border-radius:14px;padding:14px}
.cd-t-lbl{font-size:12px;color:#8A6516}.cd-t-n{font-size:22px;font-weight:900;color:#1C1B22}
.cd-quests{display:grid;gap:6px}.cd-q{display:flex;gap:8px;align-items:center;font-size:13px;padding:9px 11px;border-radius:10px;background:#F8FAFC;color:#64748B}
.cd-q.ok{background:#F3FBF7;color:#0E7A55;font-weight:700}
.cd-note{font-size:11.5px;color:#94A3B8;line-height:1.55;margin-top:10px}
.cd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px}
.cd-grid.three{grid-template-columns:repeat(3,1fr)}
.cd-tile{position:relative;background:var(--rb,#fff);border:2px solid var(--rc,#E2E8F0);border-radius:12px;padding:6px;cursor:default;min-width:0}
.cd-tile[onclick]{cursor:pointer}.cd-tile.sel{box-shadow:0 0 0 3px #6A58E6}
.cd-tile.locked .cd-img img{filter:brightness(0) opacity(.25)}
.cd-tile.empty-slot{display:flex;align-items:center;justify-content:center;min-height:150px;border-style:dashed;color:#94A3B8;font-size:12px;cursor:pointer;background:#fff}
.cd-img{position:relative;aspect-ratio:63/88;border-radius:8px;overflow:hidden;background:linear-gradient(160deg,#fff,var(--rc,#CBD5E1));display:flex;align-items:center;justify-content:center}
.cd-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff}
.cd-img .cd-fb{font-size:12px;font-weight:800;color:#fff;text-align:center;padding:6px;text-shadow:0 1px 2px rgba(0,0,0,.3)}
.cd-img.sm{width:46px;flex:0 0 46px}
.cd-meta{display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-size:10.5px}
.cd-rar{color:var(--rc);font-weight:800}.cd-pw{color:#334155;font-weight:700}
.cd-name{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cd-name b{color:#6A58E6;font-size:11px}
.cd-deck{position:absolute;top:-8px;left:-6px;background:#6A58E6;color:#fff;font-size:10.5px;font-weight:800;border-radius:8px;padding:2px 6px}
.cd-reveal{display:flex;flex-direction:column;align-items:center;margin:14px 0 4px}
.cd-flip{width:150px;animation:cdFlip .7s ease-out}
@keyframes cdFlip{0%{transform:rotateY(90deg) scale(.7);opacity:0}60%{transform:rotateY(-10deg) scale(1.05);opacity:1}100%{transform:none}}
.cd-rv-txt{margin-top:8px;font-size:13.5px;font-weight:700}
.cd-dex{display:flex;align-items:center;gap:10px;margin-bottom:8px}.cd-dex .metric-track{flex:1}
.cd-battle{border-radius:14px;padding:12px;margin:12px 0;background:#F8FAFC;border:1px solid #E2E8F0}
.cd-battle.win{background:#FFFBEB;border-color:#F5DFA6}
.cd-b-ttl{font-weight:900;font-size:16px;text-align:center;margin-bottom:8px}.cd-b-ttl span{color:#64748B;font-size:13px;margin-left:6px}
.cd-round{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0}
.cd-side{display:flex;align-items:center;gap:8px;flex:1;opacity:.55}.cd-side:last-child{justify-content:flex-end}
.cd-side.w{opacity:1}.cd-side b{font-size:17px}.cd-vs{font-size:11px;color:#94A3B8;font-weight:800}
.cd-log{font-size:12.5px;padding:6px 2px;border-bottom:1px solid #F1F5F9}
.cd-kid{border:1px solid var(--line,#E4E4EA);border-radius:12px;padding:10px;margin-bottom:8px}
.cd-kid-h{display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px}.cd-kid-h span{color:#64748B;font-size:12px}
.cd-adm{display:flex;gap:4px;margin-top:5px}.cd-adm select{flex:1;min-width:0;font-size:11px;border:1px solid #E2E8F0;border-radius:6px;padding:3px}
.cd-adm button{border:0;background:#FFF5F6;color:#A5323A;border-radius:6px;padding:3px 7px;cursor:pointer}
`;
const st=document.createElement("style"); st.textContent=css; document.head.appendChild(st);

window.Cards=Cards;
window.drawCards=drawCards;
window.drawCardAdmin=drawCardAdmin;
})();
