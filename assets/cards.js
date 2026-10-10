/* ============================================================
 *  🎴 포켓몬 카드 뽑기 · 대결 (우리집 학습플래너)
 *  - 카드 목록: assets/pokecards.js (받아쓰기 프로그램 nkdddd/mdeng 의 카드 9,524장 — 필요할 때만 불러와요)
 *    [카드 id, 이름, 종류, 세트 번호, 희귀도, 앱 등급(n r a s u), 그림 경로, 타입, 포켓몬 이름, 진화 가족]
 *  - 자녀: 공부로 카드팩을 받아 뜯기(받아쓰기 프로그램과 같은 효과) → 재료 카드로 강화(+1~+5) → 형제 · 받아쓰기 친구 · 연습 봇과 대결
 *  - 🎫 공부로 얻은 💎 슈퍼 레어 카드 PC 1시간 · 👑 스페셜 카드 PC 3시간 이용권 · 🎴 카드 걸기 대결(이기면 상대 카드)
 *  - 대결: 👆 탭 대결 (assets/tapbattle.js) — 한 판 점수 = ⚡힘(등급 + 강화×2) × 👆5초 동안 탭한 수, 3판 2선승
 *  - 부모: 카드 이름으로 찾아서 자녀에게 바로 주기 · 카드팩 더하기/빼기
 *  - 데이터
 *    planner/{자녀uid}/cards/{카드id}   내 카드 {count, 카드 정보}
 *    planner/{자녀uid}/meta/cardWallet  {tickets, claimed{날짜:n}, pity, draws, winDay, pcPasses[], escrow{}, done{}, balls…}
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
const imgOf=id=>{ const row=byId&&byId[id]; return row? (window.CARD_IMG||"")+row[6] : ""; };
const lvOf=c=>Math.max(0, Math.min(MAX_LV, Number(c.lv)||0));           // 강화 단계 (+0~+5) — 카드를 재료로 써서 올려요
const UP_COST=[1,2,3,4,5], EVO_COST=5, TRADE_N=10;                     // 강화 · 상위 카드 진화에 드는 재료 카드 수, 일반 카드 교환
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
    <img src="${eh(c.img||imgOf(c.id))}" alt="${eh(c.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">
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
// 카드 한 장 받기. opt.lv: 함께 오는 강화 단계 (대결에서 받은 카드) · opt.pass: 공부로 얻은 카드면 🎫 PC 이용권도
async function giveCard(uid, c, opt){
  opt=opt||{};
  const ref=mine(uid).collection("cards").doc(c.id);
  const d=await ref.get(), cur=d.exists && d.data().cls? d.data() : null;
  const next={id:c.id, name:c.name, img:c.img||imgOf(c.id), cls:c.cls, type:c.type||"", kind:c.kind||"", stage:c.stage||1, poke:c.poke||c.name, set:c.set||"",
    count:(cur? Number(cur.count)||1 : 0)+1, lv:Math.max(cur? Number(cur.lv)||0 : 0, Math.min(MAX_LV, Number(opt.lv)||0)), firstAt:cur? cur.firstAt : Date.now(), lastAt:Date.now()};
  await ref.set(next);
  if(CS && CS.uid===uid) CS.cards[c.id]=next;
  const pass=opt.pass? await givePass(uid, next) : null;
  return {card:next, isNew:!cur, pass};
}
// 카드 한 장 내보내기 (대결에 걸기). 마지막 한 장은 강화 단계도 함께, 겹친 카드는 +0짜리를 보내요
async function takeCard(uid, id){
  const ref=mine(uid).collection("cards").doc(id);
  const d=await ref.get(), c=d.exists? d.data() : null;
  if(!c || !c.cls) return null;
  const n=(Number(c.count)||1)-1;
  let lv=0;
  if(n<=0){ lv=lvOf(c); await ref.delete(); if(CS && CS.uid===uid) delete CS.cards[id]; }
  else { c.count=n; await ref.set(c); if(CS && CS.uid===uid) CS.cards[id]={...c, id}; }
  return {id, lv, name:c.name};
}
// 🎫 PC 이용권: 공부로 얻은 💎 슈퍼 레어 카드 1시간 · 👑 스페셜 카드 3시간
const PASS_H={s:1, u:3};
async function givePass(uid, c){
  const h=PASS_H[c.cls]; if(!h) return null;
  const W=(CS && CS.uid===uid)? CS.wallet : await loadWallet(uid);
  const p={id:Math.random().toString(36).slice(2,9), h, card:c.name, cls:c.cls, at:Date.now(), used:0};
  W.pcPasses=[...(W.pcPasses||[]), p];
  await saveWallet(uid, W);
  return p;
}
const passLeft=W=>(W.pcPasses||[]).filter(p=>!p.used);
function passesHTML(W, admin){
  const all=(W.pcPasses||[]).slice().sort((a,b)=>(a.used?1:0)-(b.used?1:0) || b.at-a.at).slice(0, admin? 30 : 8);
  if(!all.length) return "";
  const h=passLeft(W).reduce((a,p)=>a+p.h,0);
  return `<div class="r-sec">🎫 PC 이용권 ${h? `<b style="color:#B45309">${h}시간</b> 남음` : ""}</div><div class="passes">${all.map(p=>`<div class="pass ${p.used?"used":""}">
      <span style="font-size:22px">🎫</span><span class="sp"><b>PC ${p.h}시간</b><br><small>${CLS[p.cls]?CLS[p.cls].icon:""} ${eh(p.card)} · ${new Date(p.at).toLocaleDateString()}${p.used?` · 사용함`:""}</small></span>
      ${admin && !p.used? `<button class="ghost-btn" onclick="Cards.usePass('${p.id}')">사용 처리</button>` : ""}</div>`).join("")}</div>`;
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
    CS={uid, parents, cards, wallet, tab:tab||(CS&&CS.tab)||"draw", reveal:null, filter:"all", mid:(CS&&CS.mid)||null,
      players:(CS&&CS.players)||[], matches:(CS&&CS.matches)||{}, log:(CS&&CS.log)||[], local:(CS&&CS.local)||null};
    if(!state.viewingChild){ startArena(); }
    renderCards();
  }catch(e){
    console.error(e);
    hubShell("🎴 포켓몬 카드", `<div class="empty">카드를 불러오지 못했어요.<br><small>${eh(typeof firestoreDiag==="function"? firestoreDiag(e) : e.message)}</small></div>`);
  }
}
function cardsOpen(){ return !!(CS && document.querySelector("#drawerRoot .cd-tabs, #drawerRoot #arenaBody")); }
function renderCards(){
  if(!CS) return;
  if(typeof refreshPkBadge==="function") setTimeout(()=>refreshPkBadge(true), 300);
  if(CS.tab==="battle" && CS.mid){ return renderMatch(); }
  const tabs=[["draw","🎁 카드팩"],["catch","🌿 포획"],["mine","🗂️ 내 카드"],["battle","⚔️ 대결"]];
  const inv=incoming().length;
  const head=`<div class="seg cd-tabs">${tabs.map(([k,l])=>`<button class="${CS.tab===k?"on":""}" onclick="Cards.tab('${k}')">${l}${k==="battle"&&inv?` <span class="badge-dot">${inv}</span>`:""}</button>`).join("")}</div>`;
  const body= CS.tab==="mine"? mineHTML() : CS.tab==="battle"? lobbyHTML() : CS.tab==="catch"? (window.PokeCatch? PokeCatch.tabHTML() : "") : drawHTML();
  hubShell("🎴 포켓몬 카드"+(state.viewingChild?` · ${eh(state.ownerName)}`:""), head+body);
}
function drawHTML(){
  const W=CS.wallet, ds=today(), got=Number(W.claimed[ds])||0, list=dayEarned(ds), ok=list.filter(q=>q.ok).length;
  const can=Math.max(0, ok-got), ro=state.viewingChild;
  return `
    <div class="cd-ticket">
      <div><div class="cd-t-lbl">내 카드팩</div><div class="cd-t-n">🎴 ${W.tickets||0}개</div></div>
      <button class="pay-btn" ${(!ro && W.tickets>0)?"":"disabled"} onclick="Cards.draw()">🎴 카드팩 뜯기</button>
    </div>
    ${passesHTML(W)}
    <div class="r-sec">오늘 받을 수 있는 카드팩 (하루 최대 ${DAY_TICKETS.length}개)</div>
    <div class="cd-quests">${list.map(q=>`<div class="cd-q ${q.ok?"ok":""}"><span>${q.ok?"✅":"⬜"}</span>${eh(q.label)}</div>`).join("")}</div>
    <button class="ghost-btn" style="width:100%;margin-top:8px" ${(!ro && can>0)?"":"disabled"} onclick="Cards.claim()">${can>0?`🎴 카드팩 ${can}개 받기`:(got? `오늘 ${got}개 받았어요`:"공부하면 받을 수 있어요")}</button>
    <div class="cd-note">등급 확률: ${ORDER.slice().reverse().map(k=>`${CLS[k].icon} ${CLS[k].name} ${ODDS[k]}%`).join(" · ")}<br>
      ${PITY}팩 안에 아트 레어 이상 1장 보장 (지금 ${W.pity||0}/${PITY}) · 내 카드에서 다른 카드를 재료로 강화(+1~+${MAX_LV}, ⚡+2씩) · +${MAX_LV}이면 상위 카드로 진화<br>
      🎫 공부로 얻은 💎 슈퍼 레어 카드 → PC 이용권 1시간 · 👑 스페셜 카드 → 3시간 (카드팩 · 포획 · 진화)<br>
      친선 대결에서 이기면 하루 한 번 카드팩 +1 · 카드 ${won(window.CARDS?window.CARDS.length:0)}장</div>`;
}
function mineHTML(){
  const all=Object.values(CS.cards);
  const f=CS.filter||"all";
  const list=all.filter(c=>f==="all"||c.cls===f).sort((a,b)=>ORDER.indexOf(a.cls)-ORDER.indexOf(b.cls) || power(b)-power(a));
  const cnt=k=>all.filter(c=>c.cls===k).length;
  return `<div class="cd-dex">${[["all","전체",all.length],...ORDER.map(k=>[k,`${CLS[k].icon} ${CLS[k].name}`,cnt(k)])].map(([k,l,n])=>
      `<button class="${f===k?"on":""}" onclick="Cards.filter('${k}')">${l} <b>${n}</b></button>`).join("")}</div>
    ${!state.viewingChild?`<div class="cd-trade"><span>♻️ 강화 안 한 일반 카드 ${TRADE_N}장 → 카드팩 1개 <small>(지금 ${tradeable().reduce((a,x)=>a+x.n,0)}장)</small></span>
      <button class="ghost-btn" ${tradeable().reduce((a,x)=>a+x.n,0)>=TRADE_N?"":"disabled"} onclick="Cards.trade()">바꾸기</button></div>`:""}
    <div class="cd-note" style="margin-top:4px">${state.viewingChild?"":"카드를 누르면 강화 · 진화할 수 있어요. 재료: 겹친 카드(남는 장) · 일반 카드 (레어 이상은 한 장씩 꼭 남겨요)"}</div>
    <div class="cd-grid">${list.map(c=>cardTile(c,{on:state.viewingChild?"":`Cards.zoom('${c.id}')`, extra:(c.count>1?`<span class="cd-deck">×${c.count}</span>`:"")})).join("") || `<div class="empty" style="grid-column:1/-1">아직 카드가 없어요. 카드팩을 열어 보세요!</div>`}</div>`;
}
function weekBoost(){
  const days=(typeof snapWeekDays==="function")? snapWeekDays() : [];
  const min=days.reduce((a,ds)=>a+dayStats(ds).min,0);
  return Math.min(0.15, Math.floor(min/60)*0.01);           // 이번 주 공부 1시간당 +1% (최대 +15%)
}

/* ============ ⚔️ 대결 (받아쓰기 프로그램과 같은 방식) ============
 * 상대 고르기 → 서로 카드 한 장 → 3판 2선승. 판마다 두 사람이 🎲 직접 눌러 굴리고, 둘 다 굴려야 그 판 결과가 나와요.
 * 주사위 값은 대결마다 정해진 seed로 미리 정해져서 두 기기 결과가 같아요.
 * 🎴 카드 걸기: 고른 카드를 맡겨 두고(escrow) 이기면 내 카드 + 상대 카드, 지면 상대에게 가요 · 🤝 친선: 카드는 그대로, 이기면 하루 한 번 카드팩 +1
 * 형제: cardHub/{부모uid}/matches/{id} · 🌐 받아쓰기 친구: assets/ttobak.js · 🤖 연습: 이 기기에서 (항상 카드 걸기 · 주사위 숫자로만)   */
function rng(seed){ let t=seed>>>0; return ()=>{ t+=0x6d2b79f5; let r=Math.imul(t^(t>>>15),1|t); r^=r+Math.imul(r^(r>>>7),61|r); return ((r^(r>>>14))>>>0)/4294967296; }; }
const mulOf=(a,b)=>bonus(a,b).mul*(1+(Number(a.boost)||0));
const scoreOf=(a,b,die)=>Math.round(power(a)*die*mulOf(a,b));
function battle(seed, a, b){
  const r=rng(seed), dice=()=>1+Math.floor(r()*6), rounds=[]; let wa=0, wb=0;
  while(wa<2 && wb<2 && rounds.length<9){
    const da=dice(), db2=dice(), sa=scoreOf(a,b,da), sb=scoreOf(b,a,db2);
    if(sa===sb){ rounds.push({da, db:db2, sa, sb, w:-1}); continue; }
    const w=sa>sb?0:1; if(w===0) wa++; else wb++;
    rounds.push({da, db:db2, sa, sb, w});
  }
  return {winner: wa>wb?0:1, rounds};
}
// 🤖 연습: 주사위 숫자로만 (같으면 다시) · 3판 2선승
function diceBattle(seed){
  const r=rng(seed), dice=()=>1+Math.floor(r()*6), rounds=[]; let wa=0, wb=0;
  while(wa<2 && wb<2 && rounds.length<40){
    const da=dice(), db2=dice();
    if(da===db2){ rounds.push({da, db:db2, sa:da, sb:db2, w:-1}); continue; }
    const w=da>db2?0:1; if(w===0) wa++; else wb++;
    rounds.push({da, db:db2, sa:da, sb:db2, w});
  }
  return {winner: wa>wb?0:1, rounds};
}
const lvIn=(c,lv)=>lv==null? lvOf(c) : lv;
const pickOf=(c,lv)=>({id:c.id, name:c.name, img:c.img||imgOf(c.id), cls:c.cls, type:c.type||"", stage:c.stage||1, lv:lvIn(c,lv), boost:weekBoost()});
const tbPick=(c,lv)=>({id:c.id, name:c.name, cls:c.cls, type:c.type||"", stage:c.stage||1, lv:lvIn(c,lv)});   // 받아쓰기 프로그램 모양 그대로 (공부 보너스 없음)
const cardById=x=>byId&&byId[x.id]? info(byId[x.id]) : {id:x.id, name:x.name||"카드", cls:CLS[x.cls]?x.cls:"n", type:x.type||"", stage:x.stage||1};
const ONLINE_MS=90000;
const TB=()=>window.TTOBAK && TTOBAK.st.on && TTOBAK.st.kid? TTOBAK : null;
const meOf=m=>m.src==="tb"? (window.TTOBAK? TTOBAK.st.uid : null) : CS.uid;
const otherOf=m=>m.users.find(u=>u!==meOf(m));
const hostOf=m=>m.host||m.from;
const keyOf=m=>(m.src||"hub")+":"+(m.src==="local"? m.seed : m.id);
const dbOf=m=>m.src==="tb"? TTOBAK.db() : db;
const refOf=m=>m.src==="tb"? TTOBAK.db().collection("matches").doc(m.id) : hub(m.hub).collection("matches").doc(m.id);
const fresh=m=>m.status!=="invite" || Date.now()-(m.createdAt||0)<(m.src==="tb"? 2 : 10)*60000;
let arenaSubs=[], beatT=0, tbOff=null;
function startArena(){
  arenaSubs.forEach(u=>{ try{u();}catch(_){} }); arenaSubs=[];
  const me=CS.uid, name=state.ownerName||state.profile.name||"";
  const beat=()=>{ if(!CS) return; CS.parents.forEach(p=>hub(p).collection("decks").doc(me).set({name, seen:Date.now()},{merge:true}).catch(()=>{})); };
  beat(); clearInterval(beatT); beatT=setInterval(()=>{ if(document.visibilityState!=="hidden") beat(); }, 30000);
  const changed=()=>{
    settleSweep();
    if(!cardsOpen()){ const n=incoming().length; if(n) toast(`⚔️ 대결 신청이 왔어요 (${n})`,"info"); return; }
    if(CS.tab==="battle" || incoming().length) renderCards();
  };
  CS.parents.forEach(p=>{
    arenaSubs.push(hub(p).collection("decks").onSnapshot(s=>{
      const others=s.docs.filter(d=>d.id!==me).map(d=>({uid:d.id, hub:p, ...d.data()}));
      CS.players=[...CS.players.filter(x=>x.hub!==p), ...others];
      if(CS.tab==="battle" && !CS.mid && cardsOpen()) renderCards();
    }, e=>console.warn("대결 상대", e)));
    arenaSubs.push(hub(p).collection("matches").where("users","array-contains",me).onSnapshot(s=>{
      Object.keys(CS.matches).forEach(id=>{ const x=CS.matches[id]; if(x.src==="hub" && x.hub===p && !x.keep && id!==CS.mid) delete CS.matches[id]; });
      s.docs.forEach(d=>{ CS.matches[d.id]={...(CS.matches[d.id]||{}), ...d.data(), id:d.id, hub:p, src:"hub"}; });
      changed();
    }, e=>console.warn("대결 기록", e)));
  });
  // 🌐 받아쓰기 친구
  if(tbOff){ tbOff(); tbOff=null; }
  if(window.TTOBAK){
    TTOBAK.init();
    TTOBAK.setKid({id:"ng-"+me, name:name||"플래너 친구", avatar:"🎓"});
    const syncTb=()=>{
      if(!CS) return;
      Object.keys(CS.matches).forEach(id=>{ const x=CS.matches[id]; if(x.src==="tb" && !x.keep && id!==CS.mid) delete CS.matches[id]; });
      if(TB()) TTOBAK.myMatches().forEach(x=>{ CS.matches[x.id]={...(CS.matches[x.id]||{}), ...x, src:"tb"}; });
    };
    syncTb();
    tbOff=TTOBAK.on(w=>{
      if(!CS) return;
      if(w==="matches"){ syncTb(); return changed(); }
      if(CS.tab==="battle" && !CS.mid && cardsOpen()) renderCards();
    });
  }
  hub(CS.parents[0]||"_").collection("battles").get().then(s=>{ CS.log=s.docs.map(d=>d.data()).filter(l=>l.aUid===me||l.bUid===me).sort((a,b)=>b.at-a.at).slice(0,5); }).catch(()=>{});
}
function incoming(){ return Object.values(CS?CS.matches:{}).filter(m=>m.status==="invite" && meOf(m) && hostOf(m)!==meOf(m) && fresh(m)); }
function curMatch(){ return CS.mid==="local"? CS.local : CS.matches[CS.mid]; }
const modeTag=m=>m.src==="local"? `<span class="bt-tag stake">👆 연습 · 카드 걸기</span>` : m.stake? `<span class="bt-tag stake">🎴 카드 걸기</span>` : `<span class="bt-tag">🤝 친선</span>`;
const srcTag=m=>m.src==="tb"? `<span class="bt-tag tb">🌐 받아쓰기</span>` : "";
function lobbyHTML(){
  const ro=state.viewingChild, has=Object.keys(CS.cards).length>0, off=(!has||ro)?"disabled":"";
  const inv=incoming(), live=Object.values(CS.matches).filter(m=>meOf(m) && ((m.status==="pick"||m.status==="roll") || (m.status==="invite" && hostOf(m)===meOf(m) && fresh(m))));
  const sibs=CS.players.filter((x,i,a)=>a.findIndex(y=>y.uid===x.uid)===i);
  const opp=m=>(m.who||{})[otherOf(m)]||{name:"상대"};
  return `
    ${inv.length?`<div class="r-sec">받은 대결 신청</div>${inv.map(m=>`<div class="list-item bt-inv">
        <span style="flex:1"><b>${eh(opp(m).name)}</b>이(가) 대결을 신청했어요! ${srcTag(m)}${modeTag(m)}</span>
        <button class="fam-btn" onclick="Cards.accept('${m.id}')">수락</button><button class="ghost-btn" style="padding:7px 12px" onclick="Cards.decline('${m.id}')">거절</button></div>`).join("")}`:""}
    ${live.length?`<div class="r-sec">진행 중인 대결</div>${live.map(m=>`<div class="list-item">
        <span style="flex:1">vs <b>${eh(opp(m).name)}</b> ${srcTag(m)}${modeTag(m)} <small style="color:#94A3B8">${m.status==="invite"?"대답 기다리는 중":m.status==="pick"?"카드 고르는 중":"주사위 굴리는 중"}</small></span>
        <button class="fam-btn" onclick="Cards.openMatch('${m.id}')">이어서</button></div>`).join("")}`:""}
    <div class="r-sec">대결 상대 고르기</div>
    ${!has?`<div class="pb-sub warn">카드가 있어야 대결할 수 있어요. 카드팩을 먼저 열어 봐요!</div>`:""}
    ${sibs.map(x=>{ const on=Date.now()-(x.seen||0)<ONLINE_MS; return `<div class="list-item bt-opp">
        <span class="bt-av">${eh((x.name||"?").slice(0,1))}</span>
        <span style="flex:1;min-width:0"><b>${eh(x.name||"형제")}</b> <small class="${on?"bt-on":"bt-off"}">${on?"● 접속 중":"○ 오프라인"}</small></span>
        <span class="bt-btns"><button class="fam-btn" ${off} onclick="Cards.invite('${x.uid}','${x.hub}',true)">🎴 걸기</button><button class="ghost-btn" ${off} onclick="Cards.invite('${x.uid}','${x.hub}',false)">🤝 친선</button></span></div>`; }).join("")
      || `<div class="cd-note" style="margin-top:0">형제가 카드 화면을 한 번 열면 여기에 나타나요.</div>`}
    <div class="list-item bt-opp"><span class="bt-av cpu">🤖</span><span style="flex:1;min-width:0"><b>연습 상대</b> <small style="color:#94A3B8;display:block">봇 카드를 보고 할지 말지 정해요 · 👆 탭 횟수 대결<br>이기면 봇 카드를 받고, 지면 내 카드가 사라져요</small></span>
      <span class="bt-btns"><button class="fam-btn" ${off} onclick="Cards.practice()">🎴 걸고 연습</button></span></div>
    ${tbHTML(off)}
    ${CS.log&&CS.log.length?`<div class="r-sec">최근 대결</div>${CS.log.map(l=>`<div class="cd-log">${eh(l.a)} ${l.win?"🏆":"·"} vs ${eh(l.b)} ${l.win?"":"🏆"} <small>${eh(l.score)}${l.stake?" · 🎴":""} · ${new Date(l.at).toLocaleDateString()}</small></div>`).join("")}`:""}
    <div class="cd-note">👆 탭 대결: 1·2판은 5초 동안 휴대폰은 화면을 톡톡(한 번 = 0.75), 컴퓨터는 Esc를 뺀 아무 키나(한 번 = 4). 점수 = ⚡카드 파워(등급 10/12/14/17/20 + 강화×2) × 👆탭 수. 🧠 3판은 화살표 순서 기억 대결(맞힌 수 × ⚡). 3판 2선승<br>
      🎴 카드 걸기: 이기면 상대 카드를 받고, 지면 내 카드가 상대에게 가요 (겹친 카드는 +0짜리를 걸어요) · 🤝 친선: 카드는 그대로, 이기면 하루 한 번 카드팩 +1</div>`;
}
// 🌐 받아쓰기(또박또박) 친구
function tbHTML(off){
  if(!window.TTOBAK || state.viewingChild) return "";
  const T=TTOBAK.st;
  if(!T.on) return `<div class="r-sec">🌐 받아쓰기 친구와 대결</div>
    <div class="tb-box"><p>받아쓰기 프로그램(또박또박)을 쓰는 친구와도 카드 대결을 할 수 있어요.<br><small>부모님 Google 계정으로 한 번 연결해 주세요 (이 기기에 기억돼요)</small></p>
      <button class="fam-btn" onclick="Cards.tbLogin()">🔗 Google 계정으로 연결</button></div>`;
  const list=TTOBAK.friendList();
  const kids=[]; list.filter(f=>f.status==="ok").forEach(f=>f.kids.filter(k=>!(T.kid && k.id===T.kid.id)).forEach(k=>kids.push({...k, fuid:f.uid, fam:f.name})));
  kids.sort((a,b)=>b.online-a.online);
  return `<div class="r-sec">🌐 받아쓰기 친구와 대결</div>
    ${list.filter(f=>f.incoming).map(f=>`<div class="list-item bt-inv"><span style="flex:1"><b>${eh(f.name)}</b> 가족이 친구 신청을 했어요 <small style="color:#94A3B8">${eh(f.email)}</small></span>
      <button class="fam-btn" onclick="Cards.tbAccept('${f.pid}')">수락</button></div>`).join("")}
    ${kids.map(k=>`<div class="list-item bt-opp"><span class="bt-av">${eh(k.avatar||(k.name||"?").slice(0,1))}</span>
        <span style="flex:1;min-width:0"><b>${eh(k.name)}</b> <small class="${k.online?"bt-on":"bt-off"}">${k.online?"● 접속 중":"○ 오프라인"}</small><small style="color:#94A3B8;display:block">${eh(k.fam)} 가족</small></span>
        <span class="bt-btns"><button class="fam-btn" ${off} onclick="Cards.tbInvite('${k.fuid}','${eh(k.id)}',true)">🎴 걸기</button><button class="ghost-btn" ${off} onclick="Cards.tbInvite('${k.fuid}','${eh(k.id)}',false)">🤝 친선</button></span></div>`).join("")
      || `<div class="cd-note" style="margin-top:0">${list.length? "친구 가족의 아이가 받아쓰기 프로그램을 켜면 여기에 나타나요." : "아직 친구가 없어요. 친구 부모님의 Google 이메일로 신청해 보세요."}</div>`}
    ${list.filter(f=>f.status==="pending" && !f.incoming).map(f=>`<div class="cd-note" style="margin-top:2px">⏳ ${eh(f.email||f.name)} — 친구 수락 기다리는 중</div>`).join("")}
    <div class="tb-add"><input class="inp" id="tbMail" type="email" placeholder="친구 부모님 Google 이메일" onkeydown="if(event.key==='Enter')Cards.tbFriend()"><button class="ghost-btn" onclick="Cards.tbFriend()">친구 신청</button></div>
    <div class="cd-note" style="margin-top:4px">연결됨: ${eh(T.email)} · 친구에게 이 이메일을 알려 주세요 · <a href="#" onclick="Cards.tbLogout();return false">연결 끊기</a>${T.err?` · <span style="color:#E5484D">${eh(T.err)}</span>`:""}</div>`;
}
function foodHTML(){
  return `<details class="cd-food"><summary>🍖 먹이사슬 보기</summary>
    <div class="cd-note" style="margin-top:6px">타입이 먹이를 만나면 ×1.5 · 진화 단계 가위바위보(기본 → 최종 진화 → 1진화 → 기본) ×1.2</div>
    ${Object.entries(FOOD).map(([k,v])=>`<div class="cd-food-row"><b>${k}</b><span>→ ${v.join(" · ")}</span></div>`).join("")}</details>`;
}

/* ----- 대결 방 화면 ----- */
function arenaShell(m, inner){
  const me=meOf(m), other=otherOf(m), A=m.who[me]||{name:"나"}, B=m.who[other]||{name:"상대"};
  hubShell("⚔️ 카드 대결", `<div class="bt-arena"><div class="bt-top"><button class="ghost-btn" style="padding:6px 12px" onclick="Cards.leave()">‹ 목록</button> ${srcTag(m)}${modeTag(m)}</div>
    <div class="vs"><span class="vs-kid"><span class="bt-av">${eh((A.name||"나").slice(0,1))}</span><b>${eh(A.name)}</b></span><span class="vs-x">VS</span>
      <span class="vs-kid"><span class="bt-av ${other==="cpu"?"cpu":""}">${other==="cpu"?"🤖":eh(B.avatar||(B.name||"?").slice(0,1))}</span><b>${eh(B.name)}</b></span></div>
    <div id="arenaBody">${inner}</div></div>`);
}
function renderMatch(){
  const m=curMatch();
  if(!m){ CS.mid=null; return renderCards(); }
  const me=meOf(m);
  if(!me){ return hubShell("⚔️ 카드 대결", `<div class="bt-wait">🌐 받아쓰기 프로그램 연결이 끊겼어요. 목록에서 다시 연결해 주세요.</div><div class="bt-row"><button class="fam-btn" onclick="Cards.leave()">목록으로</button></div>`); }
  const other=otherOf(m), them=(m.who[other]||{}).name||"상대";
  const quit=`<button class="ghost-btn" onclick="Cards.cancel()">그만하기</button>`;
  if(m.status==="invite"){
    if(!fresh(m)) return arenaShell(m, `<div class="bt-wait">⌛ 대답이 없어서 대결 신청이 끝났어요.</div><div class="bt-row"><button class="fam-btn" onclick="Cards.leave()">목록으로</button></div>`);
    return arenaShell(m, `<div class="bt-wait">⏳ <b>${eh(them)}</b>의 대답을 기다려요…<br><small>${m.src==="tb"? "친구가 받아쓰기 프로그램을 켜 두어야 해요 (2분 동안)" : "같은 시간에 카드 화면을 열고 있어야 해요"}</small></div><div class="bt-row">${quit}</div>`);
  }
  if(m.status==="declined"||m.status==="cancel"){
    return arenaShell(m, `<div class="bt-wait">${m.status==="declined"? `🙅 ${eh(them)}이(가) 다음에 하재요.` : "대결을 그만했어요."}${m.stake?"<br><small>건 카드는 돌려받아요</small>":""}</div><div class="bt-row"><button class="fam-btn" onclick="Cards.leave()">목록으로</button></div>`);
  }
  if(m.src==="local" && m.status==="offer"){              // 🤖 봇 카드를 보고 대결할지 정해요
    const A=m.picks[me], B=m.picks.cpu, d=tapPw(B)-tapPw(A);
    const how= d>0? `봇 카드가 ⚡${d} 더 세요` : d<0? `내 카드가 ⚡${-d} 더 세요` : "힘이 똑같아요";
    const odds=Math.round(botWinRate(m)*100);
    return arenaShell(m, `<p class="bt-say">🤖 봇은 이 카드를 냈어! <small>${how} · 이길 확률 약 ${odds}% · 싫으면 거부해도 돼요 (건 카드는 돌려받아요)</small></p>
      <div class="arena"><div class="fighter">${cardFace(A,"mid")}<b>${eh(A.name)}</b><span class="pw">⚡${tapPw(A)}</span>${pkLine(A)}</div>
        <div class="score">VS</div>
        <div class="fighter">${cardFace(B,"mid")}<b>${eh(B.name)}</b><span class="pw">⚡${tapPw(B)}</span>${pkLine(B)}</div></div>
      <div class="bt-row"><button class="fam-btn" onclick="Cards.acceptBot()">⚔️ 대결!</button><button class="ghost-btn" onclick="Cards.refuseBot()">🙅 거부하기</button></div>`);
  }
  if(m.status==="pick"){
    const mine=(m.picks||{})[me];
    if(mine){
      return arenaShell(m, `<div class="bt-pick">${cardFace(mine,"mid")}<p>내 카드: <b>${eh(mine.name)}</b> · ⚡${TapBattle.power(mine)}${mine.type?` · ${eh(mine.type)}`:""}${m.stake?" · 🎴 걸었어요":""}</p>${pkLine(mine)}</div>
        <div class="bt-wait">⏳ ${eh(them)}이(가) 카드를 고르는 중…</div><div class="bt-row">${quit}</div>`);
    }
    if(CS.ask && CS.ask.mid===CS.mid && CS.cards[CS.ask.id]){
      const c=CS.cards[CS.ask.id], opts=TapBattle.partners(c, myCatches()), base=TapBattle.basePower({cls:c.cls, lv:m.stake && (Number(c.count)||1)>1? 0 : lvOf(c)});   // 겹친 카드를 걸면 +0짜리가 나가요
      return arenaShell(m, `<p class="bt-say">🐾 짝꿍 포켓몬과 함께 나갈까? <small>카드와 맞는 포켓몬만 나갈 수 있어요 · 같은 포켓몬 ⚡+${TapBattle.PARTNER.same} · 진화 가족 ⚡+${TapBattle.PARTNER.family}${m.stake? " · 카드 걸기라 짝꿍도 함께 걸어요 (이기면 상대 짝꿍을 받고, 지면 내 짝꿍 한 마리가 가요)" : " · 친선 대결이라 포켓몬은 그대로예요"}</small></p>
        <div class="bt-pick bt-ask">${cardFace(c,"mid")}<p><b>${eh(c.name)}</b> · ⚡${base}</p></div>
        <div class="bt-pks">${opts.map(o=>`<button class="bt-pkbtn ${o.m}" onclick="Cards.pickWith('${c.id}','${eh(o.name)}')"><b>🐾 ${eh(o.name)}</b><small>${pmName(o.m)} · ⚡${base} → ⚡${base+TapBattle.PARTNER[o.m]} · ${o.n}마리</small></button>`).join("")}
          <button class="bt-pkbtn none" onclick="Cards.pickWith('${c.id}','')"><b>카드만</b><small>⚡${base}</small></button></div>
        <div class="bt-row"><button class="ghost-btn" onclick="Cards.cancelAsk()">다른 카드 고르기</button></div>`);
    }
    const owned=Object.values(CS.cards).sort((a,b)=>power(b)-power(a));
    const pkHas=c=>TapBattle.partners(c, myCatches()).length? `<span class="cd-pk">🐾</span>` : "";
    const say= m.src==="local"? `걸 카드를 골라! <small>봇이 비슷한 카드(더 세거나 약할 수도)를 내요 · 보고 싫으면 거부할 수 있어요 · 이기면 봇 카드를 받고, 지면 이 카드는 사라져요</small>`
      : m.stake? `걸 카드를 골라! <small>점수 = ⚡카드 파워 × 👆탭 수 · 지면 이 카드가 ${eh(them)}에게 가요</small>`
      : `대결할 카드를 골라! <small>점수 = ⚡카드 파워 × 👆탭 수 · 친선 대결이라 카드는 그대로예요</small>`;
    return arenaShell(m, `<p class="bt-say">${say}</p>
      <div class="cd-grid">${owned.map(c=>cardTile(c,{on:`Cards.confirmPick('${c.id}')`, extra:(c.count>1?`<span class="cd-deck">×${c.count}</span>`:"")+pkHas(c)})).join("")}</div>
      <p class="cd-note" style="text-align:center">🐾 표시 카드는 짝꿍 포켓몬(잡은 포켓몬 중 같은 포켓몬 · 진화 가족)과 함께 나갈 수 있어요</p><div class="bt-row">${quit}</div>`);
  }
  rollView(m);
}
function bonusTag(P,Q,m){ if(m && m.dice) return ""; const b=bonus(P,Q); return b.why.length? `<span class="bt-edge">${b.why.join(" ")}</span>` : ""; }
function rollSides(m){
  const me=meOf(m), other=otherOf(m), first=m.users[0]===me;
  const rounds=(m.rounds||[]).map(r=>first? r : {ta:r.tb, tb:r.ta, da:r.db, db:r.da, sa:r.sb, sb:r.sa, w:r.w===-1?-1:1-r.w});
  return {me, other, rounds, A:m.picks[me], B:m.picks[other]};
}
const tapPw=c=>TapBattle.power(c);
// 👆 탭 대결: 판마다 5초 동안 탭 → ⚡기본 파워 × 👆탭 수. 둘 다 끝내야 그 판 결과가 나와요
function rollView(m){
  if(m.mode!=="tap"){                                       // 예전 주사위 대결 (업데이트 전에 시작한 것)
    return arenaShell(m, `<div class="bt-wait">🎲 예전 주사위 방식으로 시작한 대결이에요.<br><small>그만하고 새로 신청해 주세요 (건 카드는 돌려받아요)</small></div>
      <div class="bt-row"><button class="fam-btn" onclick="Cards.dropLegacy()">그만하기</button></div>`);
  }
  const {me, other, rounds, A, B}=rollSides(m);
  let root=document.getElementById("arena");
  if(!root || root.dataset.mid!==m.id){
    arenaShell(m, `<div class="arena" id="arena" data-mid="${m.id}" data-shown="0">
        <div class="fighter" id="fA">${cardFace(A,"mid")}<b>${eh(A.name)}</b><span class="pw">⚡${tapPw(A)}</span>${pkLine(A)}<span class="die" id="dA">👆</span><small class="die-how" id="hA"></small></div>
        <div class="score" id="bScore">0 : 0</div>
        <div class="fighter" id="fB">${cardFace(B,"mid")}<b>${eh(B.name)}</b><span class="pw">⚡${tapPw(B)}</span>${pkLine(B)}<span class="die" id="dB">👆</span><small class="die-how" id="hB"></small><small class="die-note" id="nB"></small></div>
      </div>
      <p class="cd-note bt-rule">1·2판 ⚡힘 × 👆5초 탭 · 3판 ⚡힘 × 🧠화살표 기억 · 3판 2선승</p>
      <div class="roll-ctl" id="rollCtl"></div><div class="rounds" id="bRounds"></div><div id="bEnd"></div>`);
    root=document.getElementById("arena");
  }
  const taps=m.taps||{}, mine=(taps[me]||[]).length, theirs=(taps[other]||[]).length;
  let shown=+root.dataset.shown;
  for(; shown<rounds.length; shown++){ const i=shown; revealChain=revealChain.then(()=>revealRound(rounds, i, A, B)); }
  root.dataset.shown=shown;
  const ctl=document.getElementById("rollCtl");
  if(m.status==="done"){
    ctl.innerHTML="";
    if(!root.dataset.end){ root.dataset.end="1"; revealChain=revealChain.then(()=>battleEnd(m)); }
    return;
  }
  const cur=rounds.length;
  document.getElementById("nB").textContent= theirs>cur? "✅ 탭 끝! (숫자는 비밀)" : "";
  if(mine>cur){
    ctl.innerHTML=`<p class="bt-wait">⏳ 상대가 탭하길 기다려요…</p>`;
    clearTimeout(rollView.t);
    rollView.t=setTimeout(()=>{
      const now=curMatch();
      if(!now || now.status!=="roll" || ((now.taps||{})[other]||[]).length>cur || !document.getElementById("rollCtl")) return;
      document.getElementById("rollCtl").insertAdjacentHTML("beforeend", `<button class="ghost-btn" id="proxyRoll">⏩ 상대가 안 와요 (이번 판 상대 0번으로)</button>`);
      document.getElementById("proxyRoll").onclick=()=>{ if(!confirm("상대가 이번 판을 하지 않은 것으로(0번) 처리할까요?")) return; document.getElementById("proxyRoll").disabled=true; matchTap(m, other, cur, 0); };
    }, 45000);
    return;
  }
  const btn=document.getElementById("rollBtn");
  const hint= theirs>cur? "상대는 벌써 탭했어! 너도 힘껏!" : "";
  if(btn && +btn.dataset.r===cur){ document.getElementById("rollHint").textContent=hint; return; }
  const done=rounds.filter(x=>x.w!==-1), tension=done.filter(x=>x.w===0).length===1 && done.filter(x=>x.w===1).length===1;
  const mode=TapBattle.roundMode(cur);                     // 1 · 2판 👆 탭, 3판부터 🧠 화살표 기억
  ctl.innerHTML=`<button class="roll-btn" id="rollBtn" data-r="${cur}">${mode==="memory"? "🧠" : "👆"} ${tension?"🔥 마지막 판":`${cur+1}판`} ${mode==="memory"? "화살표 기억 대결!" : "탭 시작!"}</button><p class="cd-note" style="text-align:center" id="rollHint">${mode==="memory"? "화살표 10개를 한 번 보고 순서대로 · 처음 틀리기 전까지 맞힌 수 × ⚡카드 힘" : ""}${hint? " "+hint : ""}</p>`;
  document.getElementById("rollBtn").onclick=async ()=>{
    document.getElementById("rollBtn").disabled=true;
    const n=await TapBattle.play({mode, label: tension? "🔥 마지막 판!" : `${cur+1}판`, who:`${eh((m.who[me]||{}).name||"나")} · ${eh(A.name)}`, power:tapPw(A)});
    document.getElementById("dA") && (document.getElementById("dA").textContent=tapPw(A)*n);
    matchTap(m, me, cur, n);
  };
}
/* ----- 🎲 주사위 무대 (받아쓰기 프로그램의 3D 주사위) ----- */
const PIPS={1:[[50,50]],2:[[28,28],[72,72]],3:[[26,26],[50,50],[74,74]],4:[[28,28],[72,28],[28,72],[72,72]],5:[[26,26],[74,26],[50,50],[26,74],[74,74]],6:[[28,24],[72,24],[28,50],[72,50],[28,76],[72,76]]};
const dieSvg=n=>`<svg viewBox="0 0 100 100" aria-label="${n}"><rect x="5" y="5" width="90" height="90" rx="20" class="die-body"/>${PIPS[n].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="${n===1?13:9}" class="${n===1?"pip one":"pip"}"/>`).join("")}</svg>`;
const CUBE_ROT={1:[0,0],2:[0,-90],3:[-90,0],4:[90,0],5:[0,90],6:[0,180]};
const cubeHTML=()=>`<div class="cube">${[1,6,2,5,3,4].map(n=>`<div class="cf f${n}">${dieSvg(n)}</div>`).join("")}</div>`;
const reduceMotion=window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const dwait=ms=>new Promise(r=>setTimeout(r, reduceMotion? Math.min(ms,60) : ms));
const sfx=(k,a)=>{ try{ window.SFX && SFX.play(k,a); }catch(_){} };
let revealChain=Promise.resolve(), dstage=null, stageWho=null, stageClose=0;
function openStage(label, tension){
  clearTimeout(stageClose);
  if(dstage && document.body.contains(dstage.el)){ dstage.el.classList.toggle("tension", !!tension); dstage.label.textContent=label; return dstage; }
  const who=stageWho||{me:{name:"나"}, them:{name:"상대"}};
  const pane=(side,p)=>`<div class="dice-pane ${side}"><p class="pane-who">${eh(p.name)}${side==="me"?" <small>(나)</small>":""}</p>
    <div class="dice-floor"><div class="dice-fly">${cubeHTML()}</div><div class="dice-shadow"></div></div><p class="dice-num"></p><p class="pane-note"></p></div>`;
  const el=document.createElement("div");
  el.className="dice-stage"+(tension?" tension":"");
  el.innerHTML=`<p class="dice-label">${label}</p>${pane("me",who.me)}<div class="dice-vs">VS</div>${pane("them",who.them)}<div class="dice-banner"></div>`;
  document.body.appendChild(el);
  const P=side=>{ const r=el.querySelector(".dice-pane."+side); return {root:r, fly:r.querySelector(".dice-fly"), cube:r.querySelector(".cube"), num:r.querySelector(".dice-num"), note:r.querySelector(".pane-note")}; };
  dstage={el, label:el.querySelector(".dice-label"), banner:el.querySelector(".dice-banner"), me:P("me"), them:P("them")};
  requestAnimationFrame(()=>el.classList.add("in"));
  return dstage;
}
async function closeStage(after){
  const st=dstage; if(!st) return;
  await dwait(after||0);
  if(dstage!==st) return;
  dstage=null; st.el.classList.add("out"); await dwait(320); st.el.remove();
}
function restPane(p, value, note){
  p.fly.getAnimations().forEach(a=>a.cancel()); p.cube.getAnimations().forEach(a=>a.cancel());
  p.root.classList.toggle("secret", !value); p.root.classList.toggle("landed", !!value);
  const [fx,fy]=CUBE_ROT[value||5];
  p.cube.style.transform= value? `rotateX(${fx}deg) rotateY(${fy}deg)` : `rotateX(${fx-20}deg) rotateY(${fy+30}deg)`;
  p.num.innerHTML= value? `${value}` : ""; p.note.textContent=note||"";
}
async function rollPane(p, value, from){
  p.root.classList.remove("secret","landed"); p.num.innerHTML=""; p.note.textContent="";
  const [fx,fy]=CUBE_ROT[value];
  p.cube.style.transform=`rotateX(${fx-25}deg) rotateY(${fy+35}deg)`;
  p.fly.classList.add("shaking");
  const tense=dstage && dstage.el.classList.contains("tension");
  sfx(tense? "drumroll" : "diceShake");
  await dwait(tense? 1000 : 600);
  p.fly.classList.remove("shaking");
  const D=1400, hops=[0.34,0.62,0.82,0.93];
  sfx("diceRoll", hops.map(h=>h*D/1000));
  const spinX=720+360*Math.floor(Math.random()*2), spinY=1080+360*Math.floor(Math.random()*2);
  if(!reduceMotion && p.fly.animate){
    const [sx,sy]=from;
    p.fly.animate([
      {transform:`translate(${sx}, ${sy}) scale(.55)`},
      {transform:"translate(0,0) scale(1)", offset:hops[0]},
      {transform:"translate(0,-14%) scale(1.05)", offset:(hops[0]+hops[1])/2},
      {transform:"translate(0,0) scale(1)", offset:hops[1]},
      {transform:"translate(0,-6%) scale(1.02)", offset:(hops[1]+hops[2])/2},
      {transform:"translate(0,0) scale(1)", offset:hops[2]},
      {transform:"translate(0,-2%) scale(1)", offset:(hops[2]+hops[3])/2},
      {transform:"translate(0,0) scale(1)"},
    ], {duration:D, easing:"linear"});
    await p.cube.animate([
      {transform:`rotateX(${fx-spinX}deg) rotateY(${fy-spinY}deg) rotateZ(90deg)`},
      {transform:`rotateX(${fx}deg) rotateY(${fy}deg) rotateZ(0deg)`},
    ], {duration:D, easing:"cubic-bezier(.2,.65,.25,1)"}).finished;
  }
  p.cube.style.transform=`rotateX(${fx}deg) rotateY(${fy}deg)`;
  sfx("diceLand");
  p.root.classList.add("landed");
  p.num.innerHTML=`${value}${value===6?" <small>최고!</small>":value===1?" <small>앗!</small>":"!"}`;
  if(value===6){ sfx("diceBig"); confetti(); }
  await dwait(800);
}
const scoreHow=(P,Q,taps,sc)=>`⚡${tapPw(P)} × 👆${taps} = <b>${sc}점</b>`;
async function revealRound(rounds, i, A, B){
  if(!document.getElementById("arena")) return;
  const r=rounds[i];
  // 큰 숫자 = 점수 (⚡카드 힘 × 👆탭 수), 아래에 풀이
  const ic=TapBattle.MODE_ICON[TapBattle.roundMode(i)];
  document.getElementById("dA").textContent=r.sa; document.getElementById("hA").textContent=`⚡${tapPw(A)} × ${ic}${r.ta}`;
  if(document.getElementById("dB")){ document.getElementById("dB").textContent=r.sb; document.getElementById("hB").textContent=`⚡${tapPw(B)} × ${ic}${r.tb}`; }
  document.getElementById("nB").textContent="";
  const win= r.w===-1? null : r.w===0;
  sfx(win===true?"roundWin":win===false?"roundLose":"pop");
  await TapBattle.banner(`<b>${win===null?"🤝 비겼어요! 한 번 더!":win?"👍 이 판은 내가 이겼어!":"💥 이 판은 상대가 이겼어!"}</b><small>나 ${scoreHow(A,B,r.ta,r.sa)}</small><small>상대 ${scoreHow(B,A,r.tb,r.sb)}</small>`, win===true?"win":win===false?"lose":"");
  const lines=document.getElementById("bRounds"); if(!lines) return;
  lines.insertAdjacentHTML("beforeend", `<span class="rd ${r.w===0?"w":r.w===1?"l":""}">${i+1}판 <b>${r.sa}</b> : <b>${r.sb}</b> ${r.w===-1?"🤝":r.w===0?"👍":"💥"}</span>`);
  const won=rounds.slice(0,i+1);
  document.getElementById("bScore").textContent=`${won.filter(x=>x.w===0).length} : ${won.filter(x=>x.w===1).length}`;
  const f= r.w===0? document.getElementById("fA") : r.w===1? document.getElementById("fB") : null;
  if(f){ f.classList.remove("hit"); void f.offsetWidth; f.classList.add("hit"); }
  await dwait(300);
}
function confetti(){
  if(reduceMotion) return;
  const box=document.createElement("div"); box.className="bt-confetti";
  for(let i=0;i<22;i++){ const s=document.createElement("span"); s.textContent=["⭐","🌟","✨","🎉","💛","🧡"][i%6];
    s.style.left=Math.random()*100+"%"; s.style.animationDelay=Math.random()*0.3+"s"; s.style.fontSize=18+Math.random()*22+"px"; box.appendChild(s); }
  document.body.appendChild(box); setTimeout(()=>box.remove(), 2600);
}
async function battleScene(won, n){
  const el=document.createElement("div");
  el.className="bt-over "+(won?"win":"lose");
  const winSub= (n.got? `🎴 <b>${eh(n.got.name)}</b> 카드를 받았어요!${n.local?"":" 내 카드도 돌아왔어요"}` : n.reward? "🎴 카드팩 +1 (오늘 첫 승리)" : n.stake? "" : "오늘 승리 보상은 이미 받았어요")
    + (n.gotPk? `<br>🐾 <b>${eh(n.gotPk)}</b>도 데려왔어요!` : "");
  const loseSub= (n.lost? (n.local? `<b>${eh(n.lost.name)}</b> 카드가 사라졌어요…` : `<b>${eh(n.lost.name)}</b> 카드가 상대에게 갔어요`) : "카드는 그대로예요. 다음엔 꼭 이길 거야 💪")
    + (n.lostPk? `<br>🐾 <b>${eh(n.lostPk)}</b> 한 마리도 ${n.local? "떠났어요" : "상대에게 갔어요"}` : "");
  el.innerHTML= won
    ? `<div class="bt-rays"></div><p class="bt-big">🏆</p><p class="bt-word">승리!</p>${n.got?`<div class="bt-got">${cardFace(n.got,"mid")}</div>`:""}<p class="bt-sub">${winSub}</p><button class="bt-ok">좋아! 👍</button>`
    : `<div class="bt-rain">${Array.from({length:28},()=>`<i style="left:${Math.random()*100}%;animation-delay:${(Math.random()*1.2).toFixed(2)}s;animation-duration:${(0.7+Math.random()*0.6).toFixed(2)}s"></i>`).join("")}</div>
       <p class="bt-big">😢</p><p class="bt-word">아쉽다…</p><p class="bt-sub">${loseSub}</p><button class="bt-ok">다시 힘내기 💪</button>`;
  document.body.appendChild(el);
  await dwait(20); el.classList.add("in");
  if(won){ sfx("victory"); confetti(); setTimeout(confetti,700); setTimeout(confetti,1500); } else sfx("defeat");
  const ok=el.querySelector(".bt-ok");
  await dwait(1200); ok.classList.add("ready");
  await new Promise(r=>{ ok.onclick=r; });
  el.classList.add("out"); await dwait(350); el.remove();
}
async function battleEnd(m){
  if(!document.getElementById("arena")) return;
  const {me, other}=rollSides(m);
  const won=m.winner===me;
  await settleSweep();
  const n=(CS.notes||{})[keyOf(m)]||{won, stake:!!m.stake};
  await battleScene(won, n);
  const end=document.getElementById("bEnd"); if(!end) return;
  const again= m.src==="local"? "Cards.practice()" : m.src==="tb"? `Cards.tbInvite('${other}','${eh((m.kids||{})[other]||"")}',${!!m.stake})` : `Cards.invite('${other}','${m.hub}',${!!m.stake})`;
  end.innerHTML=`<p class="bt-result ${won?"win":"lose"}">${won?"🏆 이겼어요!":"😢 아쉽게 졌어요"}</p>
    <div class="bt-row"><button class="fam-btn" onclick="${again}">⚔️ 한 번 더</button><button class="ghost-btn" onclick="Cards.leave()">목록으로</button></div>`;
}
function logBattle(m, me, other, won){
  const rs=rollSides(m).rounds, w=rs.filter(x=>x.w===0).length, l=rs.filter(x=>x.w===1).length;
  const logDoc={aUid:CS.uid, a:(m.who[me]||{}).name||"", bUid:other, b:(m.who[other]||{}).name||"상대", win:won, stake:!!m.stake, src:m.src||"hub", score:`${w} : ${l}`, at:Date.now()};
  if(CS.parents[0]) hub(CS.parents[0]).collection("battles").add(logDoc).catch(()=>{});
  CS.log=[logDoc, ...(CS.log||[])].slice(0,5);
}

/* ----- 🎴 대결 정리: 건 카드 돌려받기 · 이긴 카드 받기 (받아쓰기 프로그램의 settleSocial과 같은 방식) ----- */
let sweeping=null, sweepAgain=false;
function settleSweep(){
  if(!CS) return Promise.resolve();
  if(sweeping){ sweepAgain=true; return sweeping; }
  sweeping=(async()=>{ do{ sweepAgain=false; await sweepOnce(); }while(sweepAgain); })()
    .catch(e=>console.warn("대결 정리", e)).finally(()=>{ sweeping=null; });
  return sweeping;
}
async function sweepOnce(){
  const W=CS.wallet; W.escrow=W.escrow||{}; W.done=W.done||{}; CS.notes=CS.notes||{};
  let changed=false;
  for(const m of Object.values(CS.matches)){
    const me=meOf(m); if(!me || !m.users || !m.users.includes(me)) continue;
    const key=keyOf(m), other=otherOf(m), s=m.settled||{};
    if(W.done[key]){ if(!s[me] || s[other]) markSettled(m); continue; }
    if(s[me]){ W.done[key]=1; changed=true; continue; }            // 예전 방식으로 이미 정리한 대결
    const expired=m.status==="invite" && !fresh(m), esc=W.escrow[key];
    const them=((m.who||{})[other]||{}).name||"상대";
    if(m.status==="done"){
      const won=m.winner===me, note={won, stake:!!m.stake};
      if(won && m.stake){
        if(esc){ await giveCard(CS.uid, cardById(esc), {lv:esc.lv}); if(esc.pk) pokeAdd(esc.pk); }
        const got=(m.picks||{})[other];
        if(got){ const r=await giveCard(CS.uid, cardById(got), {lv:got.lv}); note.got=r.card; if(got.pk){ pokeAdd(got.pk); note.gotPk=got.pk; } }
      }else if(won){
        if(W.winDay!==today()){ W.winDay=today(); W.tickets=(Number(W.tickets)||0)+1; note.reward=true; }
      }else if(m.stake){ note.lost=esc||{name:((m.picks||{})[me]||{}).name||"카드"}; if(esc&&esc.pk) note.lostPk=esc.pk; }
      CS.notes[key]=note;
      logBattle(m, me, other, won);
      if(m.id!==CS.mid){
        if(note.got) toast(`⚔️ ${them}와(과)의 대결에서 이겨서 '${note.got.name}' 카드를 받았어요!`,"cheer");
        else if(note.lost) toast(`⚔️ '${note.lost.name}' 카드가 ${them}에게 갔어요`,"info");
        else if(won) toast(`⚔️ ${them}와(과)의 대결에서 이겼어요!`,"cheer");
      }
    }else if(m.status==="cancel" || m.status==="declined" || expired){
      if(esc){ await giveCard(CS.uid, cardById(esc), {lv:esc.lv}); if(esc.pk) pokeAdd(esc.pk); }
      if(expired && hostOf(m)===me) refOf(m).update({status:"cancel", updatedAt:Date.now()}).catch(()=>{});
    }else continue;
    delete W.escrow[key]; W.done[key]=1; changed=true;
    if(m.id===CS.mid) m.keep=true;     // 상대가 기록을 지워도 이 화면에서는 끝까지 보여 줘요
    markSettled(m);
  }
  if(changed){
    const ks=Object.keys(W.done); if(ks.length>200) ks.slice(0, ks.length-200).forEach(k=>delete W.done[k]);
    await saveWallet(CS.uid, W);
    if(cardsOpen() && !CS.mid && CS.tab!=="battle") renderCards();
  }
}
// 내 쪽 정리 끝 표시. 둘 다 끝나면 기록을 지워요
function markSettled(m){
  if(m.src==="local") return;
  const me=meOf(m), other=otherOf(m), ref=refOf(m);
  return dbOf(m).runTransaction(async t=>{
    const d=await t.get(ref); if(!d.exists) return;
    const s=d.data().settled||{};
    if(s[other]) t.delete(ref); else if(!s[me]) t.update(ref, {settled:{...s, [me]:true}});
  }).catch(()=>{});
}

/* ----- 대결 기록 바꾸기 (형제·받아쓰기 친구: Firestore 트랜잭션 · 연습: 이 기기) ----- */
async function matchPick(m, c, pk){
  const key=keyOf(m), W=CS.wallet; W.escrow=W.escrow||{};
  let lv=lvOf(c);
  if(pk && !((myCatches()[pk.name]||0)>0)) pk=null;
  if(m.stake){                                            // 이 카드 (+ 🐾 짝꿍 한 마리)를 맡겨 둬요 (이기면 돌아와요)
    const t=await takeCard(CS.uid, c.id); if(!t) throw new Error("nocard");
    lv=t.lv; W.escrow[key]={...t, cls:c.cls, type:c.type||"", stage:c.stage||1};
    if(pk && pokeTake(pk.name)) W.escrow[key].pk=pk.name;
    await saveWallet(CS.uid, W);
  }
  if(m.src==="local") return localPick(m, c, lv, pk);
  const card=m.src==="tb"? tbPick(c, lv) : pickOf(c, lv), me=meOf(m), ref=refOf(m);
  if(pk){ card.pk=pk.name; card.pm=pk.m; }
  try{
    await dbOf(m).runTransaction(async t=>{
      const d=(await t.get(ref)).data();
      if(!d || d.status!=="pick") throw new Error("closed");
      const picks={...(d.picks||{}), [me]:card}, upd={picks, updatedAt:Date.now()};
      if(picks[d.users[0]] && picks[d.users[1]]) Object.assign(upd, TapBattle.startFields());   // 👆 탭 대결 시작
      t.update(ref, upd);
    });
  }catch(e){
    const t=W.escrow[key];
    if(t){ delete W.escrow[key]; await giveCard(CS.uid, cardById(t), {lv:t.lv}); if(t.pk) pokeAdd(t.pk); await saveWallet(CS.uid, W); }
    throw e;
  }
}
// 🤖 연습: 봇과 탭 대결 — 봇 카드를 먼저 보여 주고(offer) 대결할지 거부할지 골라요
async function localPick(m, c, lv, pk){
  const me=CS.uid, mineP=pickOf(c, lv), cpu=cpuCard(mineP);
  if(pk){ mineP.pk=pk.name; mineP.pm=pk.m; const bp=TapBattle.botPartner(cpu); if(bp){ cpu.pk=bp.name; cpu.pm=bp.m; } }   // 내가 짝꿍을 데려오면 봇도 데려와요
  m.picks={[me]:mineP, cpu}; m.status="offer";
  renderCards();
}
const rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
/* 🎯 연습봇 난이도: 기본 승률 35%~55% — 내 카드가 셀수록 올라가요 (힘이 같으면 45%)
   - 카드 힘 비율로 목표 승률을 정하고(모의 실험으로 맞춘 값), 그만큼 봇 1판 탭 수를 조금 올리거나 내려요
   - 1판: 봇 = 내 탭 수 ±3 (+ 난이도 보정) · 2판부터: 그 기준값에서 0~7번 더하거나 빼요
   - 2판부터 내가 1판보다 더 많이 탭하면 그만큼 더 잘 이겨요 */
const botWinRate=m=>{ const me=Object.keys(m.picks).find(k=>k!=="cpu"), r=TapBattle.power(m.picks[me])/TapBattle.power(m.picks.cpu);
  return Math.max(.35, Math.min(.55, .45+(r-1)*.5)); };
function botTaps(m, round, mine){
  const me=Object.keys(m.picks).find(k=>k!=="cpu"), ratio=TapBattle.power(m.picks[me])/TapBattle.power(m.picks.cpu);
  let raw;
  if(round===0 || m.botBase==null){
    const bias=(.5-botWinRate(m))/.14;                          // 승률 1%p ≈ 탭 0.07번 (모의 실험)
    m.botBase=Math.max(0, mine+Math.round(Math.random()*6-3+bias)); raw=m.botBase;
  }else if(TapBattle.roundMode(round)==="memory"){           // 🧠 기억 대결: 내가 맞힌 수 ±3 근처 (같은 승률 보정)
    raw=Math.min(TapBattle.MEM_LEN, Math.max(0, mine+Math.round(Math.random()*6-3+(.5-botWinRate(m))/.14*.5)));
  }else raw=Math.max(0, m.botBase+(Math.random()<.5? 1 : -1)*rnd(0,7));
  return Math.round(raw*ratio);                                 // ⚡힘 차이만큼 봇 탭 수를 맞춰요 (위 승률이 되게)
}
async function localSettle(m){
  const me=CS.uid, key=keyOf(m), W=CS.wallet, won=m.winner===me, esc=(W.escrow||{})[key], note={won, stake:true, local:true};
  if(W.done && W.done[key]) return;
  if(won){
    if(esc){ await giveCard(CS.uid, cardById(esc), {lv:esc.lv}); if(esc.pk) pokeAdd(esc.pk); }
    const g=await giveCard(CS.uid, cardById(m.picks.cpu), {lv:m.picks.cpu.lv}); note.got=g.card;
    if(m.picks.cpu.pk){ pokeAdd(m.picks.cpu.pk); note.gotPk=m.picks.cpu.pk; }
  }else{ note.lost=esc||{name:(m.picks[me]||{}).name||"카드"}; if(esc&&esc.pk) note.lostPk=esc.pk; }
  if(W.escrow) delete W.escrow[key]; W.done=W.done||{}; W.done[key]=1;
  await saveWallet(CS.uid, W);
  CS.notes=CS.notes||{}; CS.notes[key]=note;
  logBattle(m, me, "cpu", won);
}
// 연습 대결 전에 그만두면 맡긴 카드 · 짝꿍을 돌려줘요
async function refundLocal(m){
  const key=keyOf(m), W=CS.wallet, t=(W.escrow||{})[key];
  if(t){ delete W.escrow[key]; await giveCard(CS.uid, cardById(t), {lv:t.lv}); if(t.pk) pokeAdd(t.pk); await saveWallet(CS.uid, W); }
  m.status="cancel";
}
/* 🐾 짝꿍 포켓몬 (잡은 포켓몬: cardWallet.catches{이름:마리 수} · dex[이름]) — 카드와 맞는 포켓몬만 함께 나가요 */
const myCatches=()=>CS.wallet.catches||(CS.wallet.catches={});
const pokeAdd=n=>{ const W=CS.wallet, c=myCatches(); c[n]=(c[n]||0)+1; W.dex=W.dex||[]; if(!W.dex.includes(n)) W.dex.push(n); };
const pokeTake=n=>{ const c=myCatches(); if(!((c[n]||0)>0)) return false; c[n]-=1; return true; };
const pmName=pm=>pm==="same"? "같은 포켓몬" : "진화 가족";
const pkLine=c=>c&&c.pk? `<span class="bt-pk">${eh(TapBattle.partnerTag(c))}</span>` : "";
// 탭 수 내기 (round: 0부터)
async function matchTap(m, who, round, n){
  if(m.src==="local"){
    let upd=TapBattle.addTaps(m, who, round, n); if(!upd) return;
    Object.assign(m, upd);
    if(m.status==="roll"){ upd=TapBattle.addTaps(m, "cpu", round, botTaps(m, round, n)); if(upd) Object.assign(m, upd); }
    if(m.status==="done") await localSettle(m);
    return rollView(m);
  }
  const ref=refOf(m);
  return dbOf(m).runTransaction(async t=>{
    const d=(await t.get(ref)).data();
    const upd=TapBattle.addTaps(d, who, round, n);
    if(upd) t.update(ref, upd);
  }).catch(()=>toast("앗, 연결이 끊겼어요. 다시 눌러 봐요","info"));
}
// 🤖 봇 카드: 내 카드와 비슷하게 — 등급은 한 단계 아래 · 같음 · 한 단계 위, 강화는 ±1 (더 세거나 약할 수도 있어요)
function cpuCard(mine){
  const UP=["n","r","a","s","u"], i=Math.max(0, UP.indexOf(mine.cls));
  const cls=UP[Math.max(0, Math.min(UP.length-1, i+rnd(-1,1)))];
  const all=byCls[cls]&&byCls[cls].length? byCls[cls] : byCls[mine.cls]&&byCls[mine.cls].length? byCls[mine.cls] : byCls.n;
  const pool=all.length>1? all.filter(r=>r[0]!==mine.id) : all;
  const x=info(pool[Math.floor(Math.random()*pool.length)]);
  return {...pickOf(x, Math.max(0, Math.min(MAX_LV, (Number(mine.lv)||0)+rnd(-1,1)))), boost:0};
}

/* ============ ⭐ 강화 · 🌟 진화 · ♻️ 교환 (받아쓰기 프로그램 방식, 별 대신 '재료 카드') ============ */
// 재료로 쓸 수 있는 카드: 겹친 카드(남는 장)부터, 그다음 강화 안 한 다른 카드. 등급 낮은 것부터
function materials(exceptId, onlyCls){
  const out=[];
  Object.values(CS.cards).forEach(c=>{
    if(onlyCls && c.cls!==onlyCls) return;
    // 강화할 카드 · 강화한 카드 · 레어 이상 카드는 한 장은 꼭 남겨요 (겹친 장만 재료). 일반 카드는 한 장짜리도 재료
    const keep=(c.id===exceptId || lvOf(c)>0 || c.cls!=="n")? 1 : 0;
    const n=Math.max(0,(Number(c.count)||1)-keep);
    if(n>0) out.push({c, n, dup:(Number(c.count)||1)>1});
  });
  return out.sort((a,b)=>(b.dup-a.dup) || ORDER.indexOf(b.c.cls)-ORDER.indexOf(a.c.cls) || power(a.c)-power(b.c));
}
const tradeable=()=>materials(null,"n");
async function useMaterials(list, need){
  const used=[]; let left=need;
  for(const x of list){ if(!left) break; const k=Math.min(left, x.n); left-=k; used.push({c:x.c, k}); }
  for(const u of used){
    const c=CS.cards[u.c.id], n=(Number(c.count)||1)-u.k, ref=mine(CS.uid).collection("cards").doc(c.id);
    if(n<=0){ await ref.delete(); delete CS.cards[c.id]; } else { c.count=n; await ref.set(c); }
  }
  return used;
}
function evolveTarget(c){
  const row=byId[c.id]; if(!row) return null;
  const up=ORDER.slice().reverse(); const from=up.indexOf(c.cls);
  for(const [k,how] of [[8,"mon"],[9,"family"]]){
    if(!row[k]) continue;
    for(const cls of up.slice(from+1)){
      const list=byCls[cls].filter(d=>d[k]===row[k] && d[0]!==c.id);
      if(list.length) return {cls, list, how};
    }
  }
  return null;
}
function zoomHTML(c){
  const lv=lvOf(c), cost=UP_COST[lv], evo=cost==null? evolveTarget(c) : null, mats=materials(c.id), have=mats.reduce((a,x)=>a+x.n,0);
  const need=cost!=null? cost : EVO_COST;
  const stars="★".repeat(lv)+"☆".repeat(MAX_LV-lv);
  const K=CLS[c.cls];
  return `<div class="zm">
    <div class="zm-card">${cardFace(c,"big")}</div>
    <div class="zm-info"><span class="cd-rar" style="--rc:${K.color}">${K.icon} ${K.name}</span><b>${eh(c.name)}${lv?` <em>+${lv}</em>`:""}</b>
      <small>${eh(c.kind||"")}${c.type?` · ${eh(c.type)} 타입`:""}${c.set?` · ${eh(c.set)}`:""} · ${c.count||1}장 · ⚡${power(c)}</small>
      <p class="zm-stars">${stars}</p></div>
    ${cost!=null
      ? `<button class="pay-btn" ${have>=cost?"":"disabled"} onclick="Cards.enhance('${c.id}')">⭐ 재료 카드 ${cost}장으로 +${lv+1} 강화</button>`
      : evo? `<p class="zm-line">🌟 +${MAX_LV} 최고 단계! ${evo.how==="mon"?`같은 ${eh(c.poke||c.name)}`:`${eh(c.poke||c.name)} 진화 가족`}의 ${CLS[evo.cls].icon} ${CLS[evo.cls].name} 카드로 진화할 수 있어요</p>
             <button class="pay-btn" ${have>=EVO_COST?"":"disabled"} onclick="Cards.evolve('${c.id}')">🌟 재료 카드 ${EVO_COST}장으로 상위 카드로 진화</button>`
           : `<p class="zm-line">👑 이 포켓몬에서 가장 높은 카드예요</p>`}
    ${(cost!=null||evo)? `<small class="zm-mat">${have>=need? `재료로 쓸 카드 ${have}장 (겹친 카드 → 낮은 등급부터)` : `재료 카드가 ${need-have}장 더 필요해요 (지금 ${have}장 · 카드팩을 열거나 포켓몬을 잡아요)`}</small>`:""}
    <button class="ghost-btn" style="width:100%;margin-top:8px" onclick="Cards.tab('mine')">닫기</button>
  </div>`;
}


/* ============ 🎴 카드팩 뜯기 (받아쓰기 프로그램과 똑같이: 톡톡톡 세 번 → 찢어지고 → 카드가 올라와 타입 효과와 함께 뒤집혀요) ============ */
const BALL_SVG='<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" class="b-bot"/><path d="M4 50 A46 46 0 0 1 96 50 Z" class="b-top"/><path d="M4 50 H96" class="b-line"/><circle cx="50" cy="50" r="13" class="b-btn"/><circle cx="50" cy="50" r="6" class="b-dot"/></svg>';
const classChip=k=>`<span class="class-chip c${k}">${CLS[k].icon} ${CLS[k].name}</span>`;
function openPack(){
  const W=CS.wallet; if(state.viewingChild || !(W.tickets>0)) return;
  document.querySelectorAll(".pk-open").forEach(x=>x.remove());
  const k=rollClass(Number(W.pity)||0), pool=byCls[k].length? byCls[k] : byCls.n;
  const card=info(pool[Math.floor(Math.random()*pool.length)]);
  const el=document.createElement("div");
  el.className="pk-open";
  el.innerHTML=`<button class="pk-x" aria-label="닫기">✕</button>
    <h3>🎴 카드팩 뜯기</h3><p class="pk-left">남은 카드팩 ${W.tickets}개</p>
    <div class="pack-stage">
      <div class="pack pb"><div class="pack-top"></div><div class="pack-body"><span class="pack-ball">${BALL_SVG}</span><b>카드팩</b><small>POKÉMON CARD</small></div></div>
      <div class="flip" hidden><div class="flip-in"><div class="face back"><span class="pack-ball">${BALL_SVG}</span></div><div class="face front">${cardFace(card)}</div></div></div>
      <p class="tap-hint">👆 톡! 톡! 톡!</p>
    </div>
    <div class="reveal-info" aria-live="polite"></div>
    <div class="pk-btns"></div>`;
  document.body.appendChild(el);
  const $=q=>el.querySelector(q), pack=$(".pack");
  const close=()=>{ el.remove(); document.body.classList.remove("fx-on"); document.querySelectorAll(".fx-dim,.fx-canvas").forEach(x=>x.remove()); renderCards(); };
  $(".pk-x").onclick=close;
  let taps=0, opening=false;
  pack.addEventListener("click", async ()=>{
    if(opening) return;
    taps++;
    sfx(taps<3? "crinkle" : "tear");
    pack.classList.remove("shake"); void pack.offsetWidth; pack.classList.add("shake", "t"+Math.min(taps,3));
    if(taps<3) return;
    opening=true; $(".pk-x").hidden=true;
    // 뜯은 순간 기록해요 (중간에 나가도 카드는 받아요)
    let r;
    try{
      W.tickets-=1; W.draws=(Number(W.draws)||0)+1; W.pity=(k==="a"||k==="s"||k==="u")? 0 : (Number(W.pity)||0)+1;
      await saveWallet(CS.uid, W);
      r=await giveCard(CS.uid, card, {pass:true});
    }catch(e){ console.error(e); toast("카드를 저장하지 못했어요. 인터넷을 확인해 주세요","info"); return close(); }
    $(".tap-hint").hidden=true;
    pack.classList.add("torn");
    await dwait(650);
    const flip=$(".flip"); flip.hidden=false; flip.classList.add("rise");
    await dwait(600);
    try{ if(typeof CardFX!=="undefined") await CardFX.play(card.type, card.cls, flip); }catch(_){}
    flip.classList.add("turn", "c"+card.cls);
    if(card.cls==="u") setTimeout(confetti, 500);
    $(".reveal-info").innerHTML=`${classChip(card.cls)}<b>${eh(card.name)}</b><small>${eh(card.kind)}${card.set?` · ${eh(card.set)}`:""}${card.type?` · ${eh(card.type)} 타입`:""} · ⚡${power(r.card)}</small>
      ${r.pass? `<p class="pass-chip">🎫 PC 이용권 ${r.pass.h}시간 획득!</p>` : ""}
      <p class="cd-note" style="margin:0">${r.isNew? "🗂️ 새 카드! 내 카드에 넣었어요." : `이미 가진 카드예요 (${r.card.count}장) · 강화 재료로 쓸 수 있어요`}</p>`;
    $(".pk-left").textContent=`남은 카드팩 ${W.tickets}개`;
    $(".pk-btns").innerHTML=`${W.tickets>0? `<button class="main" data-a="more">🎴 한 팩 더 (${W.tickets})</button>` : ""}<button data-a="mine">🗂️ 내 카드</button><button data-a="close">닫기</button>`;
    $(".pk-btns").onclick=e=>{ const a=e.target.closest("button"); if(!a) return; sfx("pop");
      if(a.dataset.a==="more"){ el.remove(); openPack(); } else { if(a.dataset.a==="mine") CS.tab="mine"; close(); } };
  });
}

const Cards={
  open:drawCards,
  zoom(id){ const c=CS.cards[id]; if(!c) return; hubShell("🗂️ 카드", zoomHTML(c)); },
  async enhance(id){
    const c=CS.cards[id], lv=lvOf(c), cost=UP_COST[lv]; if(!c||cost==null) return;
    const mats=materials(id); if(mats.reduce((a,x)=>a+x.n,0)<cost) return;
    const preview=[]; let left=cost; for(const x of mats){ if(!left) break; const k=Math.min(left,x.n); left-=k; preview.push(`${x.c.name}${k>1?` ×${k}`:""}`); }
    if(!confirm(`'${c.name}'을(를) +${lv+1} 강화할까요?\n\n재료로 사라지는 카드: ${preview.join(", ")}`)) return;
    await useMaterials(mats, cost);
    c.lv=lv+1; await mine(CS.uid).collection("cards").doc(id).set(c);
    sfx("star"); toast(`⭐ ${c.name} +${c.lv} 강화! ⚡${power(c)}`,"cheer");
    Cards.zoom(id);
    const z=document.querySelector(".zm-card .pk"); if(z){ z.classList.add("powerup"); }
  },
  async evolve(id){
    const c=CS.cards[id]; if(!c||lvOf(c)<MAX_LV) return;
    const evo=evolveTarget(c); if(!evo) return;
    const mats=materials(id); if(mats.reduce((a,x)=>a+x.n,0)<EVO_COST) return;
    if(!confirm(`'${c.name}' +${MAX_LV} 카드를 ${CLS[evo.cls].name} 카드로 진화시킬까요?\n재료 카드 ${EVO_COST}장이 사라지고, 이 카드는 새 카드로 바뀌어요.`)) return;
    await useMaterials(mats, EVO_COST);
    const fromFace=cardFace(c,"big");
    const row=evo.list[Math.floor(Math.random()*evo.list.length)], next=info(row);
    // 진화한 카드 한 장 → 새 카드 (겹친 장은 +0으로 남아요)
    const ref=mine(CS.uid).collection("cards").doc(id), n=(Number(c.count)||1)-1;
    if(n<=0){ await ref.delete(); delete CS.cards[id]; } else { c.count=n; c.lv=0; await ref.set(c); }
    const r=await giveCard(CS.uid, next, {pass:true}); CS.cards[next.id]=r.card;
    if(r.pass) toast(`🎫 PC 이용권 ${r.pass.h}시간을 받았어요!`,"cheer");
    if(window.PokeCatch) await PokeCatch.evoCinema({card:true, from:fromFace, to:cardFace(r.card,"big"),
      before:`어라…? <b>${eh(c.name)}</b> 카드가 빛나기 시작했어!`, after:`${CLS[next.cls].icon} <b>${eh(next.name)}</b> 카드로 진화했어! 🎉`});
    Cards.zoom(next.id);
  },
  async trade(){
    const mats=tradeable(); if(mats.reduce((a,x)=>a+x.n,0)<TRADE_N) return;
    if(!confirm(`강화 안 한 일반 카드 ${TRADE_N}장을 카드팩 1개로 바꿀까요? (겹친 카드부터 써요)`)) return;
    await useMaterials(mats, TRADE_N);
    CS.wallet.tickets=(Number(CS.wallet.tickets)||0)+1; await saveWallet(CS.uid, CS.wallet);
    sfx("star"); toast("♻️ 카드팩 1개를 받았어요","cheer"); CS.tab="draw"; renderCards();
  },
  tab(k){ CS.tab=k; CS.reveal=null; CS.mid=null; renderCards(); },
  filter(k){ CS.filter=k; renderCards(); },
  async claim(){
    const W=CS.wallet, ds=today(), got=Number(W.claimed[ds])||0, ok=dayEarned(ds).filter(q=>q.ok).length, add=ok-got;
    if(add<=0) return;
    W.tickets=(Number(W.tickets)||0)+add; W.claimed={...W.claimed, [ds]:ok};
    const cut=fmt(addDays(new Date(),-14)); Object.keys(W.claimed).forEach(k=>{ if(k<cut) delete W.claimed[k]; });
    await saveWallet(CS.uid, W); toast(`🎴 카드팩 ${add}개를 받았어요`,"cheer"); renderCards();
  },
  draw(){ openPack(); },
  // 형제에게 대결 신청 (stake: 🎴 카드 걸기)
  async invite(uid, hubId, stake){
    const x=CS.players.find(p=>p.uid===uid)||{name:"형제"}, me=CS.uid;
    const ref=hub(hubId).collection("matches").doc();
    const doc={users:[me, uid], from:me, host:me, stake:!!stake, who:{[me]:{name:state.ownerName||state.profile.name||"나"}, [uid]:{name:x.name||"형제"}},
      seed:Math.floor(Math.random()*2147483647), status:"invite", picks:{}, rolled:{}, settled:{}, createdAt:Date.now(), updatedAt:Date.now()};
    try{ await ref.set(doc); }catch(e){ console.error(e); alert("대결을 신청하지 못했어요.\n\nFirebase 보안 규칙에 카드 대결(matches) 규칙이 필요해요. 저장소의 firestore.rules 를 다시 게시해 주세요."); return; }
    CS.matches[ref.id]={...doc, id:ref.id, hub:hubId, src:"hub"};
    sfx("pop"); CS.tab="battle"; CS.mid=ref.id; renderCards();
  },
  // 🌐 받아쓰기 친구
  async tbLogin(){
    try{ await TTOBAK.login(); }catch(e){ console.error(e); if(!/popup-closed|cancelled-popup/.test(e&&e.code||"")) alert("Google 계정으로 연결하지 못했어요.\n"+((e&&e.code)||e)); }
  },
  async tbLogout(){ if(!confirm("받아쓰기 프로그램 연결을 끊을까요?")) return; await TTOBAK.logout(); renderCards(); },
  async tbFriend(){
    const v=(document.getElementById("tbMail")||{}).value;
    try{
      const r=await TTOBAK.requestFriend(v);
      toast({sent:"친구 신청을 보냈어요. 친구 쪽에서 수락하면 대결할 수 있어요", accepted:"친구가 됐어요!", already:"이미 친구예요", pending:"친구 수락을 기다리는 중이에요",
        self:"내 이메일이에요", bad:"이메일을 확인해 주세요", notfound:"받아쓰기 프로그램에 연결한 적이 없는 이메일이에요"}[r]||r, r==="sent"||r==="accepted"?"good":"info");
    }catch(e){ console.error(e); toast("친구 신청을 하지 못했어요","info"); }
    renderCards();
  },
  async tbAccept(pid){ try{ await TTOBAK.acceptFriend(pid); toast("친구가 됐어요!","good"); }catch(e){ console.error(e); toast("수락하지 못했어요","info"); } },
  async tbInvite(fuid, kidId, stake){
    if(!TB()) return toast("받아쓰기 프로그램에 먼저 연결해 주세요","info");
    const f=TTOBAK.friendList().find(x=>x.uid===fuid), k=f && f.kids.find(x=>x.id===kidId);
    if(!k) return toast("친구를 찾지 못했어요","info");
    try{
      const id=await TTOBAK.invite(fuid, k, stake);
      const T=TTOBAK.st;
      CS.matches[id]={id, src:"tb", users:[T.uid, fuid], host:T.uid, stake:!!stake, status:"invite", kids:{[T.uid]:T.kid.id, [fuid]:k.id},
        who:{[T.uid]:{...T.kid}, [fuid]:{id:k.id, name:k.name, avatar:k.avatar||""}}, picks:{}, settled:{}, createdAt:Date.now()};
      sfx("pop"); CS.tab="battle"; CS.mid=id; renderCards();
    }catch(e){ console.error(e); toast("대결을 신청하지 못했어요","info"); }
  },
  async accept(id){ const m=CS.matches[id]; if(!m) return; await refOf(m).update({status:"pick", updatedAt:Date.now()}).catch(()=>{}); m.status="pick"; CS.mid=id; renderCards(); },
  async decline(id){ const m=CS.matches[id]; if(!m) return; await refOf(m).update({status:"declined", updatedAt:Date.now()}).catch(()=>{}); renderCards(); },
  openMatch(id){ CS.mid=id; renderCards(); },
  // 🤖 연습: 항상 카드 걸기 · 같은 등급 · 같은 강화 봇 카드 · 주사위 숫자로만
  practice(){
    const me=CS.uid;
    CS.local={id:"local", src:"local", users:[me,"cpu"], who:{[me]:{name:state.ownerName||state.profile.name||"나"}, cpu:{name:"연습 봇"}},
      seed:Math.floor(Math.random()*2147483647), status:"pick", stake:true, dice:true, picks:{}, rolled:{}};
    CS.tab="battle"; CS.mid="local"; renderCards();
  },
  confirmPick(id){
    const m=curMatch(), c=CS.cards[id]; if(!m||!c) return;
    const opts=TapBattle.partners(c, myCatches());
    if(opts.length){ CS.ask={id, mid:CS.mid}; renderCards(); return; }        // 🐾 맞는 포켓몬이 있으면 짝꿍부터 골라요
    Cards.pickWith(id, "");
  },
  // 🐾 짝꿍과 함께 (pk: 포켓몬 이름, ""이면 카드만)
  pickWith(id, pk){
    const m=curMatch(), c=CS.cards[id]; CS.ask=null; if(!m||!c) return renderCards();
    const opt=pk? TapBattle.partners(c, myCatches()).find(o=>o.name===pk) : null;
    const pkNote=opt? `\n🐾 짝꿍 ${opt.name} (${pmName(opt.m)} ⚡+${TapBattle.PARTNER[opt.m]})${m.stake? " — 지면 이 포켓몬 한 마리도 상대에게 가요" : ""}` : "";
    const dupNote=m.stake && (Number(c.count)||1)>1 && lvOf(c)? `\n(겹친 카드라 +0짜리 한 장을 걸어요)` : "";
    const msg= m.src==="local"? `'${c.name}' 카드를 걸고 연습할까요?\n봇이 비슷한 카드를 내면 보고 대결할지 정해요 (👆 5초 동안 탭한 수)\n이기면 봇 카드를 받고, 지면 이 카드는 사라져요.${dupNote}`
      : m.stake? `'${c.name}' (⚡${power(c)}) 카드를 걸까요?\n지면 이 카드가 상대에게 가요.${dupNote}`
      : `'${c.name}' (⚡${power(c)})로 대결할까요?\n점수 = ⚡${power(c)} × 👆탭 수`;
    if(!confirm(msg+pkNote)) return renderCards();
    sfx("pop");
    matchPick(m, c, opt).catch(e=>{ console.warn(e); toast("대결이 이미 끝났어요","info"); CS.mid=null; renderCards(); });
  },
  cancelAsk(){ CS.ask=null; renderCards(); },
  acceptBot(){ const m=curMatch(); if(!m || m.status!=="offer") return; sfx("pop"); Object.assign(m, TapBattle.startFields()); renderCards(); },
  async refuseBot(){ const m=curMatch(); if(!m || m.status!=="offer") return; await refundLocal(m); toast("대결을 거부했어요. 건 카드는 돌려받았어요","info"); CS.mid=null; CS.local=null; renderCards(); },
  async cancel(){
    const m=curMatch(); if(!m) return;
    if(m.src==="local" && m.status==="offer") await refundLocal(m);
    if(m.src!=="local" && (m.status==="invite"||m.status==="pick")){
      await refOf(m).update({status:"cancel", updatedAt:Date.now()}).catch(()=>{});
      m.status="cancel"; settleSweep();
    }
    CS.mid=null; CS.local=null; renderCards();
  },
  async leave(){
    const m=curMatch();
    if(m && m.src==="local" && m.status==="offer") await refundLocal(m);   // 대결 전이면 건 카드를 돌려받아요
    if(m && m.src==="local" && m.status==="roll"){       // 연습 중간에 나가면 진 걸로 (건 카드는 사라져요)
      if(!confirm("지금 나가면 진 것으로 처리돼서 건 카드가 사라져요. 나갈까요?")) return;
      Object.assign(m, {status:"done", winner:"cpu"}); await localSettle(m);
    }
    closeStage(); CS.mid=null; renderCards();
  },
  async dropLegacy(){ const m=curMatch(); if(!m) return; await refOf(m).update({status:"cancel", updatedAt:Date.now()}).catch(()=>{}); m.status="cancel"; settleSweep(); CS.mid=null; renderCards(); },
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
        <div class="me-row" style="margin-top:6px"><button class="ghost-btn" onclick="Cards.balls(3)">몬스터볼 +3</button><button class="ghost-btn" onclick="Cards.balls(-1)">−1</button><span style="font-size:12px;color:#64748B;align-self:center">지금 ${Number(k.wallet.balls)||0}개 · 잡은 포켓몬 ${(k.wallet.dex||[]).length}종</span></div>
      </div>
      ${passesHTML(k.wallet, true)}
      <div class="r-sec">카드 찾아서 주기</div>
      <input class="inp" id="cdQ" value="${eh(CA.q)}" placeholder="포켓몬 이름 (예: 피카츄, 리자몽)" onkeydown="if(event.key==='Enter')Cards.search(this.value)">
      <button class="pay-btn" style="width:100%;margin-top:8px" onclick="Cards.search(document.getElementById('cdQ').value)">찾기</button>
      ${CA.q? `<div class="cd-note">${res.length? `${res.length>=60?"60장까지 보여요":res.length+"장"} · 카드를 누르면 ${eh(k.name)}에게 줘요` : "찾는 카드가 없어요"}</div>
        <div class="cd-grid">${res.map(c=>cardTile({...c,count:1},{on:`Cards.grant('${c.id}')`, extra: k.cards[c.id]? `<span class="cd-deck">보유 ${k.cards[c.id].count}</span>` : ""})).join("")}</div>` : ""}`:""}
    <div class="cd-note">카드 ${won(window.CARDS.length)}장 · 받아쓰기 프로그램과 같은 포켓몬 카드 목록이에요. 자녀는 공부해서 받은 카드팩으로 뽑아요.</div>`);
}
// 위쪽 포켓몬 버튼 배지용: 카드팩 · 몬스터볼 · 오늘 받을 수 있는 카드팩
Cards.counts=async uid=>{
  const W=await loadWallet(uid), ds=today();
  return {tickets:Number(W.tickets)||0, balls:Number(W.balls)||0, packClaim:Math.max(0, dayEarned(ds).filter(q=>q.ok).length-(Number((W.claimed||{})[ds])||0))};
};
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
  async usePass(pid){
    const k=CA.kids[CA.kid]; if(!k) return;
    const W=await loadWallet(k.uid), p=(W.pcPasses||[]).find(x=>x.id===pid); if(!p||p.used) return;
    if(!confirm(`${k.name}의 PC 이용권 ${p.h}시간을 사용 처리할까요?`)) return;
    p.used=Date.now(); await saveWallet(k.uid, W);
    k.wallet=W; toast(`🎫 PC ${p.h}시간 사용 처리했어요`,"good"); renderAdmin();
  },
  async balls(n){
    const k=CA.kids[CA.kid]; if(!k) return;
    const W=await loadWallet(k.uid); W.balls=Math.max(0,(Number(W.balls)||0)+n); await saveWallet(k.uid, W);
    k.wallet=W; toast(`${k.name} 몬스터볼 ${W.balls}개`,"good"); renderAdmin();
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
.cd-trade{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#F6F6FC;border-radius:12px;padding:9px 12px;font-size:13px;margin-bottom:6px}.cd-trade small{color:#94A3B8}
.zm{display:flex;flex-direction:column;align-items:center;gap:8px}
.zm-card .pk.big{width:min(62vw,240px)}
.zm-card .pk.powerup{animation:btHit .7s cubic-bezier(.3,1.6,.5,1);box-shadow:0 0 24px 6px #FDE047}
.zm-info{text-align:center;display:flex;flex-direction:column;gap:2px}.zm-info b{font-size:18px}.zm-info b em{font-style:normal;color:#B45309}.zm-info small{color:#64748B;font-size:12px}
.zm-stars{margin:2px 0 0;color:#F59E0B;font-size:20px;letter-spacing:2px}
.zm-line{font-size:13px;text-align:center;margin:0;color:#475569}
.zm-mat{color:#94A3B8;font-size:12px;text-align:center}
.zm .pay-btn{width:100%}
.cd-kid{border:1px solid var(--line,#E4E4EA);border-radius:12px;padding:10px;margin-bottom:8px}
.cd-kid-h{display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px}.cd-kid-h span{color:#64748B;font-size:12px}

.badge-dot{display:inline-flex;min-width:17px;height:17px;padding:0 5px;border-radius:9px;background:#E5484D;color:#fff;font-size:10.5px;font-weight:800;align-items:center;justify-content:center;margin-left:3px}
.bt-av{width:32px;height:32px;border-radius:50%;background:#EFECFD;color:#5B4DF0;font-weight:900;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;margin-right:8px;font-size:15px}
.bt-av.cpu{background:#F1F5F9}
.bt-on{color:#0E9F6E;font-weight:700}.bt-off{color:#94A3B8}
.bt-inv{background:#FFFBEB;border-color:#F5DFA6}
.bt-top{margin-bottom:6px}
.vs{display:flex;align-items:center;justify-content:center;gap:16px;margin:4px 0 12px}
.vs-kid{display:flex;flex-direction:column;align-items:center;gap:4px}.vs-kid .bt-av{margin:0;width:44px;height:44px;font-size:19px}.vs-kid b{font-size:15px}
.vs-x{font-weight:900;font-size:26px;color:#E5484D}
.bt-wait{text-align:center;color:#64748B;padding:18px 8px;font-size:14.5px}.bt-wait small{color:#94A3B8}
.bt-row{display:flex;gap:8px;justify-content:center;margin-top:12px}
.bt-say{font-weight:800;text-align:center;margin:4px 0 10px}.bt-say small{display:block;font-weight:600;color:#94A3B8;font-size:12px;margin-top:2px}
.bt-pick{display:flex;flex-direction:column;align-items:center;gap:6px}.pk.mid{width:120px}
.bt-pk{display:inline-block;margin-top:2px;font-size:11.5px;font-weight:800;color:#047857;background:#D1FAE5;border-radius:999px;padding:1px 8px}
.bt-pks{display:flex;flex-direction:column;gap:8px;margin:10px 0}.bt-pkbtn{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;border:1.5px solid #E2E8F0;background:#fff;border-radius:12px;padding:10px 12px;cursor:pointer;font:inherit}
.bt-pkbtn b{font-size:15px}.bt-pkbtn small{color:#64748B;font-size:12px}.bt-pkbtn.same{border-color:#34D399;background:#ECFDF5}.bt-pkbtn.family{border-color:#93C5FD;background:#EFF6FF}
.cd-pk{position:absolute;left:4px;bottom:4px;font-size:14px;background:#fff;border-radius:999px;padding:0 3px;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.fighter .die-how{display:block;font-size:12px;font-weight:800;color:#64748B;margin-top:-2px}
.arena{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}
.fighter{display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;min-width:0}
.fighter .pk{width:min(100%,130px)}.fighter b{font-size:13.5px}.fighter .pw{font-size:12px;color:#64748B}
.fighter.hit .pk{animation:btHit .6s cubic-bezier(.3,1.6,.5,1);box-shadow:0 0 18px 4px #FDE047}
@keyframes btHit{0%{transform:scale(1)}40%{transform:scale(1.12)}100%{transform:scale(1)}}
.bt-edge{font-size:10.5px;color:#B45309;background:#FFF7E8;border-radius:6px;padding:1px 6px}
.score{font-weight:900;font-size:24px}
.die{display:inline-grid;place-items:center;width:52px;height:52px;font-size:40px;line-height:1}
.die svg{width:100%;height:100%;filter:drop-shadow(0 3px 0 rgba(34,54,92,.25))}
.die-body{fill:#fff;stroke:#1C1B22;stroke-width:5}.pip{fill:#1C1B22}.pip.one{fill:#E5484D}
.die-note{font-size:12px;color:#0E9F6E;min-height:1.2em}
.roll-ctl{text-align:center;margin-top:12px}
.roll-btn{border:0;background:#5B4DF0;color:#fff;font-weight:900;font-size:17px;border-radius:14px;padding:14px 22px;cursor:pointer;animation:btPop 1.2s ease-in-out infinite;box-shadow:0 6px 18px rgba(91,77,240,.35)}
.roll-btn:disabled{opacity:.6;animation:none}
@media (prefers-reduced-motion:reduce){.roll-btn,.dice-stage.tension .dice-label,.bt-rays,.pk.c-u::after,.pk.c-s::after{animation:none}}
@keyframes btPop{50%{transform:scale(1.06)}}
.rounds{display:flex;flex-wrap:wrap;gap:4px 6px;justify-content:center;margin-top:6px}
.rounds .rd{font-size:12px;color:#475569;background:#F1F5F9;border-radius:999px;padding:2px 9px;line-height:1.5}.rounds .rd.w{background:#FEF3C7;color:#92400E}.rounds .rd.l{background:#F1F5F9;color:#64748B}
/* 📱 대결 화면은 휴대폰 한 화면 안에 (세로로 넘기지 않게) */
.bt-arena .bt-top{margin-bottom:2px}
.bt-arena .vs{gap:10px;margin:0 0 6px}.bt-arena .vs-kid{flex-direction:row;gap:6px}.bt-arena .vs-kid .bt-av{width:28px;height:28px;font-size:13px}.bt-arena .vs-kid b{font-size:13.5px}.bt-arena .vs-x{font-size:18px}
.bt-arena .bt-say{margin:0 0 6px;font-size:14px}.bt-arena .bt-say small{font-size:11.5px;line-height:1.4}
.bt-arena .pk.mid{width:min(26vw,15vh,120px)}.bt-arena .bt-ask .pk.mid{width:min(22vw,12vh,100px)}
.bt-arena .fighter .pk{width:min(100%,26vw,17vh,130px)}
.bt-arena .fighter b{font-size:12.5px;line-height:1.25}
.bt-arena .die{width:auto;height:auto;min-height:34px;font-size:30px;font-weight:900;font-variant-numeric:tabular-nums}
.bt-arena .bt-pks{gap:6px;margin:6px 0}.bt-arena .bt-pkbtn{padding:7px 11px}.bt-arena .bt-pkbtn b{font-size:14px}
.bt-arena .bt-pick{gap:3px}.bt-arena .bt-pick p{margin:0;font-size:13px}
.bt-arena .roll-ctl{margin-top:6px}.bt-arena .roll-btn{padding:11px 20px;font-size:16px}
.bt-arena .bt-row{margin-top:8px}.bt-arena .bt-result{margin:6px 0 0;font-size:18px}
.bt-arena .bt-rule{text-align:center;margin:4px 0 0;font-size:11.5px}
.bt-arena .bt-wait{padding:10px 8px}
.bt-result{text-align:center;font-weight:900;font-size:20px;margin:14px 0 4px}.bt-result.win{color:#B45309}.bt-result.lose{color:#64748B}
.dice-stage{--s:min(24vw,34vh,170px);position:fixed;inset:0;z-index:95;overflow:hidden;display:grid;grid-template:"label label label" auto "me vs them" 1fr / 1fr auto 1fr;background:#0b1026;opacity:0;transition:opacity .25s}
@media (max-aspect-ratio:1/1){.dice-stage{--s:min(34vw,19vh,150px);grid-template:"label" auto "me" 1fr "vs" auto "them" 1fr / 1fr}}
.dice-stage.in{opacity:1}.dice-stage.out{opacity:0}
.dice-label{grid-area:label;justify-self:center;margin:0;padding:14px 0 4px;color:#fff;font-weight:900;font-size:24px;text-shadow:0 2px 0 rgba(0,0,0,.4)}
.dice-stage.tension .dice-label{color:#fde68a;animation:btPop .6s ease-in-out infinite}
.dice-pane{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:8px;min-height:0;transition:box-shadow .3s}
.dice-pane.me{grid-area:me;background:radial-gradient(circle at 50% 60%,rgba(59,130,246,.45),rgba(30,58,138,.25) 70%)}
.dice-pane.them{grid-area:them;background:radial-gradient(circle at 50% 60%,rgba(239,68,68,.4),rgba(127,29,29,.25) 70%)}
.dice-stage.tension .dice-pane{background:radial-gradient(circle at 50% 60%,rgba(220,38,38,.5),rgba(69,10,10,.4) 70%)}
.dice-pane.winner{box-shadow:inset 0 0 0 5px #fde047,inset 0 0 40px rgba(253,224,71,.6)}
.dice-vs{grid-area:vs;align-self:center;justify-self:center;font-weight:900;font-size:30px;color:#fde047;text-shadow:0 3px 0 rgba(0,0,0,.4);padding:0 6px}
.pane-who{margin:0;color:#fff;font-weight:800;font-size:16px}.pane-who small{opacity:.7}
.pane-note{margin:0;color:#cbd5e1;font-size:13px;min-height:1.2em}
.dice-floor{position:relative;width:var(--s);height:calc(var(--s)*1.15);display:grid;place-items:end center;perspective:900px}
.dice-fly{width:var(--s);height:var(--s);transform-style:preserve-3d;position:relative;z-index:1}
.dice-fly.shaking{animation:diceShake .09s linear infinite}
@keyframes diceShake{25%{transform:translate(-6px,3px) rotate(-4deg)}75%{transform:translate(6px,-3px) rotate(4deg)}}
.cube{position:absolute;inset:0;transform-style:preserve-3d}
.cf{position:absolute;inset:0;backface-visibility:hidden}.cf svg{width:100%;height:100%;display:block}.cf .die-body{stroke-width:3}
.cf.f1{transform:translateZ(calc(var(--s)/2))}.cf.f6{transform:rotateY(180deg) translateZ(calc(var(--s)/2))}
.cf.f2{transform:rotateY(90deg) translateZ(calc(var(--s)/2))}.cf.f5{transform:rotateY(-90deg) translateZ(calc(var(--s)/2))}
.cf.f3{transform:rotateX(90deg) translateZ(calc(var(--s)/2))}.cf.f4{transform:rotateX(-90deg) translateZ(calc(var(--s)/2))}
.dice-shadow{position:absolute;bottom:-8px;width:80%;height:16px;border-radius:50%;background:rgba(0,0,0,.45);filter:blur(6px)}
.dice-pane.landed .dice-fly{filter:drop-shadow(0 0 20px rgba(253,224,71,.85))}
.dice-pane.secret .dice-fly{filter:blur(3px) brightness(.55);animation:btBob 1.4s ease-in-out infinite}
.dice-pane.secret .dice-floor::after{content:"?";position:absolute;inset:0;z-index:2;display:grid;place-items:center;font-weight:900;font-size:calc(var(--s)*.6);color:#fff;text-shadow:0 3px 0 rgba(0,0,0,.4)}
@keyframes btBob{50%{transform:translateY(-5px) rotate(-4deg)}}
.dice-num{margin:0;min-height:1.1em;color:#fde047;font-weight:900;font-size:42px;line-height:1;text-shadow:0 3px 0 rgba(0,0,0,.35)}.dice-num small{font-size:20px;color:#fff}
.dice-pane.landed .dice-num{animation:btHit .6s cubic-bezier(.3,1.6,.5,1)}
.dice-banner{position:absolute;left:50%;top:50%;z-index:3;display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none;opacity:0;transform:translate(-50%,-50%) scale(.6);transition:opacity .25s,transform .4s cubic-bezier(.3,1.6,.5,1)}
.dice-banner.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
.dice-banner b{font-weight:900;font-size:24px;padding:8px 20px;border-radius:999px;background:#fff;color:#1C1B22;white-space:nowrap;box-shadow:0 6px 20px rgba(0,0,0,.4)}
.dice-banner.win b{background:#fde047;color:#7c2d12;box-shadow:0 0 30px rgba(253,224,71,.8)}.dice-banner.lose b{background:#cbd5e1;color:#1e293b}
.dice-banner small{color:#fff;font-size:14px;background:rgba(0,0,0,.5);border-radius:999px;padding:1px 10px}
.bt-over{position:fixed;inset:0;z-index:96;display:grid;place-items:center;align-content:center;gap:10px;overflow:hidden;text-align:center;opacity:0;transition:opacity .35s;padding:20px}
.bt-over.in{opacity:1}.bt-over.out{opacity:0}
.bt-over.win{background:radial-gradient(circle at 50% 40%,#b45309,#3b1d05 75%)}.bt-over.lose{background:linear-gradient(#334155,#0f172a)}
.bt-rays{position:absolute;inset:-60%;background:repeating-conic-gradient(from 0deg,rgba(253,224,71,.22) 0 9deg,transparent 9deg 18deg);animation:btRays 8s linear infinite}
@keyframes btRays{to{transform:rotate(360deg)}}
.bt-big{position:relative;margin:0;font-size:90px;line-height:1}
.bt-over.win.in .bt-big{animation:btTrophy 1s cubic-bezier(.3,1.6,.5,1)}
@keyframes btTrophy{0%{transform:scale(0) rotate(-30deg)}60%{transform:scale(1.3) rotate(8deg)}}
.bt-word{position:relative;margin:0;font-weight:900;font-size:56px;line-height:1;color:#fde047;text-shadow:0 5px 0 rgba(0,0,0,.35)}
.bt-over.lose .bt-word{color:#cbd5e1;font-size:44px}
.bt-sub{position:relative;margin:0;color:#fff;font-size:16px}
.bt-ok{position:relative;margin-top:10px;opacity:0;transition:opacity .3s;border:0;background:#fff;color:#1C1B22;font-weight:900;font-size:17px;border-radius:14px;padding:13px 26px;cursor:pointer}
.bt-ok.ready{opacity:1}
.bt-rain{position:absolute;inset:0;pointer-events:none}
.bt-rain i{position:absolute;top:-10%;width:2px;height:60px;background:linear-gradient(transparent,rgba(186,230,253,.7));animation:btRain 1s linear infinite}
@keyframes btRain{to{transform:translateY(120vh)}}
.bt-confetti{position:fixed;inset:0;z-index:97;pointer-events:none}
.bt-confetti span{position:absolute;top:-40px;animation:btFall 2.2s ease-in forwards}
@keyframes btFall{to{transform:translateY(110vh) rotate(540deg)}}
`;
const st=document.createElement("style"); st.textContent=css+`.bt-tag{display:inline-block;font-size:10.5px;font-weight:800;border-radius:6px;padding:1px 6px;margin-left:3px;background:#F1F5F9;color:#475569;vertical-align:middle}
.bt-tag.stake{background:#FEF3C7;color:#92400E}.bt-tag.tb{background:#E0F2FE;color:#075985}
.bt-opp{margin-bottom:6px;flex-wrap:wrap}.bt-btns{display:flex;gap:6px;margin-left:auto}.bt-btns button{padding:7px 11px;white-space:nowrap}
.tb-box{background:#F0F9FF;border:1px solid #BAE6FD;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.tb-box p{margin:0;font-size:13.5px;line-height:1.5}.tb-box small{color:#64748B}
.tb-add{display:flex;gap:6px;margin-top:6px}.tb-add .inp{flex:1;min-width:0}
.bt-got{position:relative;width:120px}.bt-got .pk{width:120px}
`; document.head.appendChild(st);

window.Cards=Cards;
// 포획(assets/pokecatch.js)에서 쓰는 공용 도구
window.__CardsAPI={ get CS(){ return CS; }, giveCard, info, cardFace, cardTile, saveWallet, renderCards, dayStats, CLS, eh, today, sfx,
  related:(name, glow)=>{                                     // 잡은 포켓몬과 관련된 카드 한 장 (받아쓰기 프로그램처럼)
    const rel=(window.CARD_REL||{})[name]||[[],[],[]], C=window.CARDS, w=[];
    rel[0].forEach(i=>w.push([C[i],3,"exact"])); rel[1].forEach(i=>w.push([C[i],1,"family"])); rel[2].forEach(i=>w.push([C[i],1,"similar"]));
    if(!w.length) C.forEach(c=>{ if(c[8]===name || c[1].includes(name)) w.push([c,3,"exact"]); });   // 관계표에 없는 포켓몬은 이름으로 찾아요
    if(!w.length) C.forEach(c=>w.push([c,1,"any"]));
    const odds=glow? {r:45,a:30,s:18,u:7} : ODDS;
    let classes=[...new Set(w.map(x=>x[0][5]))].filter(k=>odds[k]>0); if(!classes.length) classes=[...new Set(w.map(x=>x[0][5]))];
    let roll=Math.random()*classes.reduce((a,k)=>a+(odds[k]||1),0);
    const cls=classes.find(k=>(roll-=(odds[k]||1))<0)||classes[0];
    const inC=w.filter(x=>x[0][5]===cls); let r=Math.random()*inC.reduce((a,x)=>a+x[1],0);
    const hit=inC.find(x=>(r-=x[1])<0)||inC[0];
    return {card:info(hit[0]), how:hit[2]};
  },
  loadCatalog:()=>loadCatalog().then(index) };
window.drawCards=drawCards;
window.drawCardAdmin=drawCardAdmin;
})();
