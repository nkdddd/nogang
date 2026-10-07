/* ============================================================
 *  🎴 포켓몬 카드 뽑기 · 대결 (우리집 학습플래너)
 *  - 카드 목록: assets/pokecards.js (받아쓰기 프로그램 nkdddd/mdeng 의 카드 9,524장 — 필요할 때만 불러와요)
 *    [카드 id, 이름, 종류, 세트 번호, 희귀도, 앱 등급(n r a s u), 그림 경로, 타입, 포켓몬 이름, 진화 가족]
 *  - 자녀: 공부로 카드팩(뽑기권)을 받아 뽑기 → 같은 카드는 겹쳐서 강화(+1~+5) → 덱 3장으로 형제·연습 대결
 *  - 대결: 한 판 점수 = ⚡힘(등급 + 강화×2) × 🎲주사위(1~6) × 먹이사슬(타입 ×1.5 · 진화 단계 ×1.2) × 이번 주 공부 보너스
 *  - 부모: 카드 이름으로 찾아서 자녀에게 바로 주기 · 카드팩 더하기/빼기
 *  - 데이터
 *    planner/{자녀uid}/cards/{카드id}   내 카드 {count, 카드 정보}
 *    planner/{자녀uid}/meta/cardWallet  {tickets, claimed{날짜:n}, pity, draws, deck[], winDay}
 *    cardHub/{부모uid}/decks/{자녀uid}  대결용 덱 공개본 · cardHub/{부모uid}/battles/{id} 대결 기록
 * ============================================================ */
(function(){
const CLS={
  n:{name:"일반",     icon:"⚪", color:"#94A3B8", bg:"#F8FAFC", pw:10},
  r:{name:"레어",     icon:"🔷", color:"#3B82F6", bg:"#EFF6FF", pw:12},
  a:{name:"아트 레어", icon:"🎨", color:"#EC4899", bg:"#FDF2F8", pw:14},
  s:{name:"슈퍼 레어", icon:"💎", color:"#8B5CF6", bg:"#F5F3FF", pw:17},
  u:{name:"스페셜",   icon:"👑", color:"#F59E0B", bg:"#FFFBEB", pw:20},
};
const ORDER=["u","s","a","r","n"];
const ODDS={n:70, r:22, a:6, s:1.7, u:0.3};          // 카드팩 (받아쓰기 프로그램과 같은 확률)
const PITY=10;                                        // 10팩 안에 아트 레어 이상 1장 보장
const MAX_LV=5;
const FOOD={                                          // 타입 먹이사슬: 왼쪽이 오른쪽을 먹어요(×1.5). 모두 3가지를 먹고 3가지에 먹혀요
  불꽃:["풀","얼음","강철"], 물:["불꽃","땅","바위"], 풀:["물","땅","바위"], 전기:["물","비행","강철"],
  얼음:["풀","드래곤","비행"], 격투:["노말","얼음","악"], 독:["풀","페어리","고스트"], 땅:["불꽃","전기","독"],
  비행:["격투","벌레","땅"], 에스퍼:["격투","독","노말"], 벌레:["에스퍼","악","페어리"], 바위:["불꽃","얼음","비행"],
  고스트:["에스퍼","강철","벌레"], 드래곤:["물","전기","독"], 악:["에스퍼","고스트","노말"], 강철:["바위","페어리","드래곤"],
  페어리:["드래곤","격투","악"], 노말:["벌레","전기","고스트"],
};
const STAGE_NAME={1:"기본",2:"1진화",3:"최종 진화"}, STAGE_EATS={1:3,3:2,2:1};   // 진화 단계 가위바위보(×1.2)
const stageOf=kind=>/2진화|VMAX|VSTAR|M진화|BREAK|메가진화|V-UNION/.test(kind||"")? 3 : /1진화|레벨업/.test(kind||"")? 2 : 1;
const DAY_TICKETS=[                                   // 하루에 받는 카드팩 (최대 4개)
  {label:"오늘 공부 1시간",                 test:s=>s.min>=60},
  {label:"오늘 공부 2시간",                 test:s=>s.min>=120},
  {label:"타이머로 30분 이상",               test:s=>s.timed>=30},
  {label:"학습앱 10문제 이상 · 정답률 80%↑", test:s=>s.appN>=10 && s.appAcc>=0.8},
];

const hub=p=>db.collection("cardHub").doc(p);
const mine=uid=>db.collection("planner").doc(uid);
const walletRef=uid=>mine(uid).collection("meta").doc("cardWallet");
const eh=s=>typeof esc==="function"? esc(s) : String(s==null?"":s);
const today=()=>fmt(new Date());
const won=n=>Number(n||0).toLocaleString();

/* ----- 카드 목록 불러오기 (1.3MB, 처음 열 때 한 번) ----- */
let catalogP=null;
function loadCatalog(){
  if(window.CARDS) return Promise.resolve();
  if(catalogP) return catalogP;
  catalogP=new Promise((ok,no)=>{ const sc=document.createElement("script"); sc.src="assets/pokecards.js"; sc.onload=()=>ok(); sc.onerror=()=>{ catalogP=null; no(new Error("카드 목록을 불러오지 못했어요")); }; document.head.appendChild(sc); });
  return catalogP;
}
let byCls=null, byId=null;
function index(){
  if(byCls) return;
  byCls={n:[],r:[],a:[],s:[],u:[]}; byId={};
  window.CARDS.forEach(row=>{ (byCls[row[5]]||byCls.n).push(row); byId[row[0]]=row; });
}
// 목록의 한 줄 → 카드 정보
function info(row){
  return {id:row[0], name:row[1], kind:row[2], set:(window.CARD_SETS||[])[row[3]]||"", rarity:row[4], cls:CLS[row[5]]?row[5]:"n",
    img:(window.CARD_IMG||"")+row[6], type:row[7]||"", poke:row[8]||row[1], stage:stageOf(row[2])};
}
const lvOf=c=>Math.max(0, Math.min(MAX_LV, (Number(c.count)||1)-1));      // 같은 카드 겹치면 +1 강화
const power=c=>(CLS[c.cls]||CLS.n).pw + lvOf(c)*2;
function bonus(a,b){
  let mul=1; const why=[];
  if((FOOD[a.type]||[]).includes(b.type)){ mul*=1.5; why.push(`🍖 ${a.type}→${b.type}`); }
  if(a.stage && b.stage && STAGE_EATS[a.stage]===b.stage){ mul*=1.2; why.push(`🔄 ${STAGE_NAME[a.stage]}→${STAGE_NAME[b.stage]}`); }
  return {mul, why};
}

/* ----- 카드 그림 ----- */
function cardFace(c, cls){
  const K=CLS[c.cls]||CLS.n, lv=lvOf(c);
  return `<div class="pk ${cls||""} c-${c.cls} ${lv?"lv"+lv:""}" style="--rc:${K.color}">
    <img src="${eh(c.img)}" alt="${eh(c.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">
    <span class="pk-fb"><b>${eh(c.name)}</b><small>${eh(c.type||"")}</small></span>
    ${lv?`<span class="pk-lv">+${lv}</span>`:""}</div>`;
}
function cardTile(c, opts){
  opts=opts||{};
  const K=CLS[c.cls]||CLS.n;
  return `<div class="cd-tile ${opts.sel?"sel":""}" style="--rc:${K.color};--rb:${K.bg}" ${opts.on?`onclick="${opts.on}"`:""}>
    ${cardFace(c)}
    <div class="cd-meta"><span class="cd-rar">${K.icon} ${K.name}</span><span class="cd-pw">⚡${power(c)}</span></div>
    <div class="cd-name">${eh(c.name)}</div>
    ${opts.extra||""}
  </div>`;
}

/* ----- 가족 · 지갑 · 내 카드 ----- */
async function familyParents(){
  if(state.profile.role==="parent") return [state.user.uid];
  try{
    const L=await Family.listMine(db, state.user), out=new Set();
    L.sent.filter(r=>r.status==="accepted" && r.fromRole!=="parent" && r.toUid).forEach(r=>out.add(r.toUid));
    L.received.filter(r=>r.status==="accepted" && r.fromRole==="parent" && r.fromUid).forEach(r=>out.add(r.fromUid));
    return [...out];
  }catch(e){ console.warn("가족 찾기", e); return []; }
}
async function loadWallet(uid){
  const d=await walletRef(uid).get();
  return {tickets:0, claimed:{}, pity:0, draws:0, deck:[], ...(d.exists? d.data() : {})};
}
async function saveWallet(uid, w){ await walletRef(uid).set(w); }
async function loadMyCards(uid){
  const s=await mine(uid).collection("cards").get();
  const out={}; s.docs.forEach(d=>{ const x=d.data(); if(x && x.cls) out[d.id]={...x, id:d.id}; }); return out;   // 예전 링크 카드(cls 없음)는 제외
}
async function giveCard(uid, c){
  const ref=mine(uid).collection("cards").doc(c.id);
  const d=await ref.get(), cur=d.exists && d.data().cls? d.data() : null;
  const next={id:c.id, name:c.name, img:c.img, cls:c.cls, type:c.type, kind:c.kind, stage:c.stage, poke:c.poke, set:c.set,
    count:(cur? Number(cur.count)||1 : 0)+1, firstAt:cur? cur.firstAt : Date.now(), lastAt:Date.now()};
  await ref.set(next);
  return {card:next, isNew:!cur};
}

/* ----- 오늘 받을 수 있는 카드팩 ----- */
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
function rollClass(pity){
  const pool = pity>=PITY-1? {a:ODDS.a, s:ODDS.s, u:ODDS.u} : ODDS;
  const tot=Object.values(pool).reduce((a,b)=>a+b,0);
  let x=Math.random()*tot;
  for(const k of Object.keys(pool)){ x-=pool[k]; if(x<0) return k; }
  return "n";
}

/* ============ 자녀 화면 ============ */
let CS=null;
async function drawCards(tab){
  if(state.profile.role==="parent" && !state.viewingChild){ return drawCardAdmin(); }
  hubShell("🎴 포켓몬 카드", `<div class="empty">카드 불러오는 중…</div>`);
  try{
    const uid=state.ownerUid;
    if(typeof ensureExt==="function") await ensureExt();
    const [_, parents, cards, wallet]=await Promise.all([loadCatalog(), state.viewingChild? [state.user.uid] : familyParents(), loadMyCards(uid), loadWallet(uid)]);
    index();
    CS={uid, parents, cards, wallet, tab:tab||(CS&&CS.tab)||"draw", reveal:null, battle:null, opps:null, filter:"all"};
    renderCards();
  }catch(e){
    console.error(e);
    hubShell("🎴 포켓몬 카드", `<div class="empty">카드를 불러오지 못했어요.<br><small>${eh(typeof firestoreDiag==="function"? firestoreDiag(e) : e.message)}</small></div>`);
  }
}
function renderCards(){
  if(!CS) return;
  const tabs=[["draw","🎁 카드팩"],["mine","🗂️ 내 카드"],["battle","⚔️ 대결"]];
  const head=`<div class="seg cd-tabs">${tabs.map(([k,l])=>`<button class="${CS.tab===k?"on":""}" onclick="Cards.tab('${k}')">${l}</button>`).join("")}</div>`;
  const body= CS.tab==="mine"? mineHTML() : CS.tab==="battle"? battleHTML() : drawHTML();
  hubShell("🎴 포켓몬 카드"+(state.viewingChild?` · ${eh(state.ownerName)}`:""), head+body);
}
function drawHTML(){
  const W=CS.wallet, ds=today(), got=Number(W.claimed[ds])||0, list=dayEarned(ds), ok=list.filter(q=>q.ok).length;
  const can=Math.max(0, ok-got), ro=state.viewingChild;
  let rev="";
  if(CS.reveal){
    const R=CS.reveal, K=CLS[R.card.cls];
    rev=`<div class="cd-reveal c-${R.card.cls}"><div class="cd-flip">${cardFace(R.card,"big")}</div>
      <div class="cd-rv-txt">${K.icon} <b style="color:${K.color}">${K.name}</b> · ${eh(R.card.name)}</div>
      <div class="cd-rv-sub">${R.isNew?"✨ 새 카드!":`🔁 겹친 카드 → <b>+${lvOf(R.card)} 강화</b> (⚡${power(R.card)})`}${R.card.type?` · ${eh(R.card.type)} 타입`:""}</div></div>`;
  }
  return `
    <div class="cd-ticket">
      <div><div class="cd-t-lbl">내 카드팩</div><div class="cd-t-n">🎴 ${W.tickets||0}개</div></div>
      <button class="pay-btn" ${(!ro && W.tickets>0)?"":"disabled"} onclick="Cards.draw()">카드팩 열기</button>
    </div>
    ${rev}
    <div class="r-sec">오늘 받을 수 있는 카드팩 (하루 최대 ${DAY_TICKETS.length}개)</div>
    <div class="cd-quests">${list.map(q=>`<div class="cd-q ${q.ok?"ok":""}"><span>${q.ok?"✅":"⬜"}</span>${eh(q.label)}</div>`).join("")}</div>
    <button class="ghost-btn" style="width:100%;margin-top:8px" ${(!ro && can>0)?"":"disabled"} onclick="Cards.claim()">${can>0?`🎴 카드팩 ${can}개 받기`:(got? `오늘 ${got}개 받았어요`:"공부하면 받을 수 있어요")}</button>
    <div class="cd-note">등급 확률: ${ORDER.slice().reverse().map(k=>`${CLS[k].icon} ${CLS[k].name} ${ODDS[k]}%`).join(" · ")}<br>
      ${PITY}팩 안에 아트 레어 이상 1장 보장 (지금 ${W.pity||0}/${PITY}) · 같은 카드가 또 나오면 +1 강화(최대 +${MAX_LV}, 강화마다 ⚡+2)<br>
      대결에서 이기면 하루 한 번 카드팩 +1 · 카드 ${won(window.CARDS?window.CARDS.length:0)}장</div>`;
}
function mineHTML(){
  const all=Object.values(CS.cards), deck=CS.wallet.deck||[];
  const f=CS.filter||"all";
  const list=all.filter(c=>f==="all"||c.cls===f).sort((a,b)=>ORDER.indexOf(a.cls)-ORDER.indexOf(b.cls) || power(b)-power(a));
  const cnt=k=>all.filter(c=>c.cls===k).length;
  return `<div class="cd-dex">${[["all","전체",all.length],...ORDER.map(k=>[k,`${CLS[k].icon} ${CLS[k].name}`,cnt(k)])].map(([k,l,n])=>
      `<button class="${f===k?"on":""}" onclick="Cards.filter('${k}')">${l} <b>${n}</b></button>`).join("")}</div>
    <div class="cd-note" style="margin-top:0">${state.viewingChild?"":"카드를 눌러 대결 덱(3장)에 넣거나 빼요."}</div>
    <div class="cd-grid">${list.map(c=>cardTile(c,{sel:deck.includes(c.id), on:state.viewingChild?"":`Cards.toggleDeck('${c.id}')`,
       extra:deck.includes(c.id)?`<span class="cd-deck">덱 ${deck.indexOf(c.id)+1}</span>`:""})).join("") || `<div class="empty" style="grid-column:1/-1">아직 카드가 없어요. 카드팩을 열어 보세요!</div>`}</div>`;
}
function deckCards(){ return (CS.wallet.deck||[]).map(id=>CS.cards[id]).filter(Boolean); }
function weekBoost(){
  const days=(typeof snapWeekDays==="function")? snapWeekDays() : [];
  const min=days.reduce((a,ds)=>a+dayStats(ds).min,0);
  return Math.min(0.15, Math.floor(min/60)*0.01);           // 이번 주 공부 1시간당 +1% (최대 +15%)
}
function battleHTML(){
  const d=deckCards(), boost=weekBoost(), B=CS.battle;
  let res="";
  if(B){
    res=`<div class="cd-battle ${B.win?"win":"lose"}">
      <div class="cd-b-ttl">${B.win?"🏆 승리!":"😤 아쉽게 졌어요"} <span>${B.score}</span></div>
      ${B.rounds.map((r,i)=>`<div class="cd-round">
        <div class="cd-side ${r.w===0?"w":""}">${cardFace(r.a,"sm")}<div><b>${r.sa}</b><small>⚡${r.pa} × 🎲${r.da}${r.ma>1?` × ${+r.ma.toFixed(2)}`:""}</small></div></div>
        <span class="cd-vs">R${i+1}</span>
        <div class="cd-side r ${r.w===1?"w":""}"><div><b>${r.sb}</b><small>⚡${r.pb} × 🎲${r.db}${r.mb>1?` × ${+r.mb.toFixed(2)}`:""}</small></div>${cardFace(r.b,"sm")}</div></div>`).join("")}
      ${B.reward?`<div class="cd-note" style="text-align:center">🎴 승리 보상 카드팩 +1</div>`:""}
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
        <span style="flex:1;min-width:0"><b>${eh(o.name)}</b> <small style="color:#94A3B8">${o.cpu?"연습 상대":`덱 ⚡${o.cards.reduce((a,c)=>a+(Number(c.pw)||10),0)} · 보너스 +${Math.round((o.boost||0)*100)}%`}</small></span>
        <button class="fam-btn" ${(d.length<3||state.viewingChild)?"disabled":""} onclick="Cards.fight(${i})">대결</button></div>`).join("")}
    ${CS.log&&CS.log.length?`<div class="r-sec">최근 대결</div>${CS.log.map(l=>`<div class="cd-log">${eh(l.a)} ${l.win?"🏆":"·"} vs ${eh(l.b)} ${l.win?"":"🏆"} <small>${eh(l.score)} · ${new Date(l.at).toLocaleDateString()}</small></div>`).join("")}`:""}
    <details class="cd-food"><summary>🍖 먹이사슬 보기</summary>
      <div class="cd-note" style="margin-top:6px">타입이 먹이를 만나면 ×1.5, 진화 단계 가위바위보(기본→최종 진화→1진화→기본)는 ×1.2</div>
      ${Object.entries(FOOD).map(([k,v])=>`<div class="cd-food-row"><b>${k}</b><span>→ ${v.join(" · ")}</span></div>`).join("")}
    </details>
    <div class="cd-note">3판 2선승. 한 판 점수 = ⚡힘(등급 + 강화×2) × 🎲주사위 × 먹이사슬 × 공부 보너스. 져도 카드는 잃지 않아요.</div>`;
}
async function loadOpps(){
  const opps=[], seen=new Set([CS.uid]), log=[];
  for(const p of CS.parents){
    try{
      (await hub(p).collection("decks").get()).docs.forEach(d=>{
        if(seen.has(d.id)) return; seen.add(d.id);
        const x=d.data(); if(x.cards && x.cards.length===3 && x.cards.every(c=>c.cls)) opps.push({uid:d.id, name:x.name||"형제", cards:x.cards, boost:Number(x.boost)||0});
      });
      (await hub(p).collection("battles").get()).docs.forEach(d=>log.push(d.data()));
    }catch(e){ console.warn("대결 상대", e); }
  }
  // 연습 상대: 내 덱과 비슷한 등급의 무작위 카드
  const mineD=deckCards();
  const cpu=mineD.map(c=>{ const pool=byCls[c.cls]&&byCls[c.cls].length? byCls[c.cls] : byCls.n; const x=info(pool[Math.floor(Math.random()*pool.length)]); return {...x, count:1, pw:power({...x,count:1})}; });
  if(cpu.length===3) opps.push({cpu:true, name:"🤖 연습 상대", cards:cpu, boost:0.05});
  CS.opps=opps;
  CS.log=log.filter(l=>l.aUid===CS.uid||l.bUid===CS.uid).sort((a,b)=>b.at-a.at).slice(0,5);
}
async function publishDeck(){
  const d=deckCards();
  const doc={name:state.ownerName||state.profile.name||"", cards:d.map(c=>({id:c.id, name:c.name, img:c.img, cls:c.cls, type:c.type||"", stage:c.stage||1, count:c.count||1, pw:power(c)})), boost:weekBoost(), updatedAt:Date.now()};
  await Promise.all(CS.parents.map(p=>hub(p).collection("decks").doc(CS.uid).set(doc).catch(e=>console.warn("덱 공개", e))));
}

const Cards={
  open:drawCards,
  tab(k){ CS.tab=k; CS.reveal=null; if(k==="battle"){ CS.opps=null; renderCards(); loadOpps().then(renderCards); } else renderCards(); },
  filter(k){ CS.filter=k; renderCards(); },
  async claim(){
    const W=CS.wallet, ds=today(), got=Number(W.claimed[ds])||0, ok=dayEarned(ds).filter(q=>q.ok).length, add=ok-got;
    if(add<=0) return;
    W.tickets=(Number(W.tickets)||0)+add; W.claimed={...W.claimed, [ds]:ok};
    const cut=fmt(addDays(new Date(),-14)); Object.keys(W.claimed).forEach(k=>{ if(k<cut) delete W.claimed[k]; });
    await saveWallet(CS.uid, W); toast(`🎴 카드팩 ${add}개를 받았어요`,"cheer"); renderCards();
  },
  async draw(){
    const W=CS.wallet; if(!(W.tickets>0)) return;
    const k=rollClass(Number(W.pity)||0), pool=byCls[k].length? byCls[k] : byCls.n;
    const c=info(pool[Math.floor(Math.random()*pool.length)]);
    W.tickets-=1; W.draws=(Number(W.draws)||0)+1; W.pity=(k==="a"||k==="s"||k==="u")? 0 : (Number(W.pity)||0)+1;
    await saveWallet(CS.uid, W);
    const r=await giveCard(CS.uid, c);
    CS.cards[c.id]=r.card; CS.reveal=r;
    if((W.deck||[]).includes(c.id)) publishDeck();
    renderCards();
    if(k==="u") toast("👑 스페셜 카드!","cheer"); else if(k==="s") toast("💎 슈퍼 레어!","cheer"); else if(k==="a") toast("🎨 아트 레어!","cheer");
  },
  async toggleDeck(id){
    const W=CS.wallet; let d=[...(W.deck||[])].filter(x=>CS.cards[x]);
    if(d.includes(id)) d=d.filter(x=>x!==id);
    else { if(d.length>=3){ toast("덱은 3장까지예요. 먼저 한 장을 빼 주세요","info"); return; } d.push(id); }
    W.deck=d; await saveWallet(CS.uid, W); if(d.length===3) publishDeck(); renderCards();
  },
  async fight(i){
    const o=CS.opps[i], me=deckCards(); if(!o || me.length<3) return;
    const mb=weekBoost(), dice=()=>1+Math.floor(Math.random()*6);
    const rounds=[0,1,2].map(k=>{
      const a=me[k], b=o.cards[k];
      const pa=power(a), pb=Number(b.pw)||power(b), da=dice(), db2=dice();
      const ma=bonus(a,b).mul*(1+mb), mbb=bonus(b,a).mul*(1+(o.boost||0));
      let sa=Math.round(pa*da*ma), sb=Math.round(pb*db2*mbb);
      return {a, b, pa, pb, da, db:db2, ma, mb:mbb, sa, sb, w: sa===sb? (pa>=pb?0:1) : (sa>sb?0:1)};
    });
    const w=rounds.filter(r=>r.w===0).length, win=w>=2, score=`${w} : ${3-w}`;
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

/* ============ 부모 화면: 카드 찾아서 주기 · 카드팩 ============ */
let CA=null;
async function drawCardAdmin(){
  hubShell("🎴 포켓몬 카드 관리", `<div class="empty">불러오는 중…</div>`);
  try{
    await loadCatalog(); index();
    const kids=await Promise.all((state.children||[]).map(async ch=>{
      const [cards, wallet]=await Promise.all([loadMyCards(ch.uid).catch(()=>({})), loadWallet(ch.uid).catch(()=>({tickets:0}))]);
      return {...ch, cards, wallet};
    }));
    CA={kids, q:(CA&&CA.q)||"", kid:(CA&&CA.kid)||0};
    renderAdmin();
  }catch(e){
    console.error(e);
    hubShell("🎴 포켓몬 카드 관리", `<div class="empty">불러오지 못했어요.<br><small>${eh(typeof firestoreDiag==="function"? firestoreDiag(e) : e.message)}</small></div>`);
  }
}
function searchCards(q){
  q=String(q||"").trim(); if(!q) return [];
  const out=[];
  for(const row of window.CARDS){ if(row[1].includes(q) || (row[8]||"").includes(q)){ out.push(info(row)); if(out.length>=60) break; } }
  return out.sort((a,b)=>ORDER.indexOf(a.cls)-ORDER.indexOf(b.cls));
}
function renderAdmin(){
  const kids=CA.kids, k=kids[CA.kid];
  const res=searchCards(CA.q);
  hubShell("🎴 포켓몬 카드 관리", `
    ${kids.length? `<div class="cd-dex">${kids.map((x,i)=>`<button class="${i===CA.kid?"on":""}" onclick="Cards.pickKid(${i})">${eh(x.name)} <b>🎴${Number(x.wallet.tickets)||0}</b></button>`).join("")}</div>` : `<div class="cd-note">연결된 자녀가 없어요. ⋯ 메뉴 → 가족 연결에서 먼저 연결하세요.</div>`}
    ${k?`<div class="cd-kid">
        <div class="cd-kid-h"><b>${eh(k.name)}</b><span>카드팩 ${Number(k.wallet.tickets)||0}개 · 카드 ${Object.keys(k.cards).length}종</span></div>
        <div class="me-row"><button class="ghost-btn" onclick="Cards.tickets(1)">카드팩 +1</button><button class="ghost-btn" onclick="Cards.tickets(3)">카드팩 +3</button><button class="ghost-btn" onclick="Cards.tickets(-1)">−1</button></div>
      </div>
      <div class="r-sec">카드 찾아서 주기</div>
      <input class="inp" id="cdQ" value="${eh(CA.q)}" placeholder="포켓몬 이름 (예: 피카츄, 리자몽)" onkeydown="if(event.key==='Enter')Cards.search(this.value)">
      <button class="pay-btn" style="width:100%;margin-top:8px" onclick="Cards.search(document.getElementById('cdQ').value)">찾기</button>
      ${CA.q? `<div class="cd-note">${res.length? `${res.length>=60?"60장까지 보여요":res.length+"장"} · 카드를 누르면 ${eh(k.name)}에게 줘요` : "찾는 카드가 없어요"}</div>
        <div class="cd-grid">${res.map(c=>cardTile({...c,count:1},{on:`Cards.grant('${c.id}')`, extra: k.cards[c.id]? `<span class="cd-deck">보유 ${k.cards[c.id].count}</span>` : ""})).join("")}</div>` : ""}`:""}
    <div class="cd-note">카드 ${won(window.CARDS.length)}장 · 받아쓰기 프로그램과 같은 포켓몬 카드 목록이에요. 자녀는 공부해서 받은 카드팩으로 뽑아요.</div>`);
}
Object.assign(Cards, {
  pickKid(i){ CA.kid=i; renderAdmin(); },
  search(q){ CA.q=String(q||"").trim(); renderAdmin(); },
  async grant(id){
    const k=CA.kids[CA.kid], row=byId[id]; if(!k||!row) return;
    const c=info(row);
    if(!confirm(`${k.name}에게 '${c.name}'(${CLS[c.cls].name}) 카드를 줄까요?`)) return;
    const r=await giveCard(k.uid, c); k.cards[id]=r.card;
    toast(`${k.name}에게 '${c.name}' 카드를 줬어요`+(r.isNew?"":` (+${lvOf(r.card)})`),"good"); renderAdmin();
  },
  async tickets(n){
    const k=CA.kids[CA.kid]; if(!k) return;
    const W=await loadWallet(k.uid); W.tickets=Math.max(0,(Number(W.tickets)||0)+n); await saveWallet(k.uid, W);
    k.wallet=W; toast(`${k.name} 카드팩 ${W.tickets}개`,"good"); renderAdmin();
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
.cd-tile{position:relative;background:var(--rb,#fff);border:2px solid var(--rc,#E2E8F0);border-radius:12px;padding:6px;min-width:0}
.cd-tile[onclick]{cursor:pointer}.cd-tile.sel{box-shadow:0 0 0 3px #6A58E6}
.cd-tile.empty-slot{display:flex;align-items:center;justify-content:center;min-height:150px;border-style:dashed;color:#94A3B8;font-size:12px;cursor:pointer;background:#fff}
.pk{position:relative;aspect-ratio:63/88;border-radius:7px;overflow:hidden;background:linear-gradient(160deg,#fff,var(--rc,#CBD5E1));display:flex;align-items:center;justify-content:center}
.pk img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#fff}
.pk-fb{display:flex;flex-direction:column;align-items:center;gap:2px;color:#fff;text-align:center;padding:6px;text-shadow:0 1px 2px rgba(0,0,0,.35)}
.pk-fb b{font-size:12px}.pk-fb small{font-size:10px;opacity:.9}
.pk-lv{position:absolute;top:4px;left:4px;background:rgba(0,0,0,.65);color:#FFD54A;font-size:10.5px;font-weight:900;border-radius:6px;padding:1px 5px}
.pk.c-s,.pk.c-u,.pk.c-a{box-shadow:0 0 0 2px var(--rc) inset}
.pk.c-u::after,.pk.c-s::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.45) 45%,transparent 60%);background-size:250% 100%;animation:pkShine 2.6s linear infinite;pointer-events:none}
@keyframes pkShine{from{background-position:150% 0}to{background-position:-100% 0}}
.pk.lv3,.pk.lv4,.pk.lv5{outline:2px solid #FFD54A;outline-offset:-2px}
.pk.sm{width:44px;flex:0 0 44px}.pk.sm .pk-fb{display:none}.pk.big{width:180px}
.cd-meta{display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-size:10.5px;gap:4px}
.cd-rar{color:var(--rc);font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cd-pw{color:#334155;font-weight:800}
.cd-name{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cd-deck{position:absolute;top:-8px;left:-6px;background:#6A58E6;color:#fff;font-size:10.5px;font-weight:800;border-radius:8px;padding:2px 6px;z-index:1}
.cd-reveal{display:flex;flex-direction:column;align-items:center;margin:14px 0 4px}
.cd-flip{animation:cdFlip .8s ease-out}
@keyframes cdFlip{0%{transform:rotateY(90deg) scale(.7);opacity:0}60%{transform:rotateY(-10deg) scale(1.05);opacity:1}100%{transform:none}}
.cd-reveal.c-u .cd-flip,.cd-reveal.c-s .cd-flip{filter:drop-shadow(0 0 14px rgba(245,158,11,.55))}
.cd-rv-txt{margin-top:10px;font-size:14px}.cd-rv-sub{font-size:12.5px;color:#64748B;margin-top:3px}
.cd-dex{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.cd-dex button{border:1px solid var(--line,#E4E4EA);background:#fff;border-radius:999px;padding:6px 11px;font-size:12px;font-weight:700;color:#475569;cursor:pointer}
.cd-dex button.on{background:#1C1B22;border-color:#1C1B22;color:#fff}.cd-dex b{margin-left:2px}
.cd-battle{border-radius:14px;padding:12px;margin:12px 0;background:#F8FAFC;border:1px solid #E2E8F0}
.cd-battle.win{background:#FFFBEB;border-color:#F5DFA6}
.cd-b-ttl{font-weight:900;font-size:16px;text-align:center;margin-bottom:8px}.cd-b-ttl span{color:#64748B;font-size:13px;margin-left:6px}
.cd-round{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:6px 0}
.cd-side{display:flex;align-items:center;gap:7px;flex:1;opacity:.5;min-width:0}.cd-side.r{justify-content:flex-end;text-align:right}
.cd-side.w{opacity:1}.cd-side b{font-size:17px;display:block}.cd-side small{font-size:10.5px;color:#64748B;white-space:nowrap}
.cd-vs{font-size:11px;color:#94A3B8;font-weight:800}
.cd-log{font-size:12.5px;padding:6px 2px;border-bottom:1px solid #F1F5F9}
.cd-food{margin-top:12px;font-size:12.5px}.cd-food summary{cursor:pointer;font-weight:800;color:#475569}
.cd-food-row{display:flex;gap:8px;padding:4px 2px;border-bottom:1px solid #F1F5F9}.cd-food-row b{width:46px}
.cd-kid{border:1px solid var(--line,#E4E4EA);border-radius:12px;padding:10px;margin-bottom:8px}
.cd-kid-h{display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px}.cd-kid-h span{color:#64748B;font-size:12px}
`;
const st=document.createElement("style"); st.textContent=css; document.head.appendChild(st);

window.Cards=Cards;
window.drawCards=drawCards;
window.drawCardAdmin=drawCardAdmin;
})();
