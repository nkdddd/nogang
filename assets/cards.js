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
  if(CS.tab==="battle" && CS.mid){ return renderMatch(); }
  const tabs=[["draw","🎁 카드팩"],["mine","🗂️ 내 카드"],["battle","⚔️ 대결"]];
  const inv=incoming().length;
  const head=`<div class="seg cd-tabs">${tabs.map(([k,l])=>`<button class="${CS.tab===k?"on":""}" onclick="Cards.tab('${k}')">${l}${k==="battle"&&inv?` <span class="badge-dot">${inv}</span>`:""}</button>`).join("")}</div>`;
  const body= CS.tab==="mine"? mineHTML() : CS.tab==="battle"? lobbyHTML() : drawHTML();
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
  const all=Object.values(CS.cards);
  const f=CS.filter||"all";
  const list=all.filter(c=>f==="all"||c.cls===f).sort((a,b)=>ORDER.indexOf(a.cls)-ORDER.indexOf(b.cls) || power(b)-power(a));
  const cnt=k=>all.filter(c=>c.cls===k).length;
  return `<div class="cd-dex">${[["all","전체",all.length],...ORDER.map(k=>[k,`${CLS[k].icon} ${CLS[k].name}`,cnt(k)])].map(([k,l,n])=>
      `<button class="${f===k?"on":""}" onclick="Cards.filter('${k}')">${l} <b>${n}</b></button>`).join("")}</div>
    <div class="cd-grid">${list.map(c=>cardTile(c)).join("") || `<div class="empty" style="grid-column:1/-1">아직 카드가 없어요. 카드팩을 열어 보세요!</div>`}</div>`;
}
function weekBoost(){
  const days=(typeof snapWeekDays==="function")? snapWeekDays() : [];
  const min=days.reduce((a,ds)=>a+dayStats(ds).min,0);
  return Math.min(0.15, Math.floor(min/60)*0.01);           // 이번 주 공부 1시간당 +1% (최대 +15%)
}

/* ============ ⚔️ 대결 (받아쓰기 프로그램과 같은 방식) ============
 * 상대 고르기 → 서로 카드 한 장 → 3판 2선승. 판마다 두 사람이 🎲 직접 눌러 굴리고, 둘 다 굴려야 그 판 결과가 나와요.
 * 주사위 값은 대결마다 정해진 seed로 미리 정해져서 두 기기 결과가 같아요.
 * 형제: cardHub/{부모uid}/matches/{id} 로 실시간 · 🤖 연습 상대: 이 기기에서 바로                                */
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
const pickOf=c=>({id:c.id, name:c.name, img:c.img, cls:c.cls, type:c.type||"", stage:c.stage||1, count:c.count||1, boost:weekBoost()});
const ONLINE_MS=90000;
let arenaSubs=[], beatT=0;
function startArena(){
  arenaSubs.forEach(u=>{ try{u();}catch(_){} }); arenaSubs=[];
  const me=CS.uid, name=state.ownerName||state.profile.name||"";
  const beat=()=>{ if(!CS) return; CS.parents.forEach(p=>hub(p).collection("decks").doc(me).set({name, seen:Date.now()},{merge:true}).catch(()=>{})); };
  beat(); clearInterval(beatT); beatT=setInterval(()=>{ if(document.visibilityState!=="hidden") beat(); }, 30000);
  CS.parents.forEach(p=>{
    arenaSubs.push(hub(p).collection("decks").onSnapshot(s=>{
      const others=s.docs.filter(d=>d.id!==me).map(d=>({uid:d.id, hub:p, ...d.data()}));
      CS.players=[...CS.players.filter(x=>x.hub!==p), ...others];
      if(CS.tab==="battle" && !CS.mid && cardsOpen()) renderCards();
    }, e=>console.warn("대결 상대", e)));
    arenaSubs.push(hub(p).collection("matches").where("users","array-contains",me).onSnapshot(s=>{
      Object.keys(CS.matches).forEach(id=>{ if(CS.matches[id].hub===p && !CS.matches[id].keep) delete CS.matches[id]; });
      s.docs.forEach(d=>{ CS.matches[d.id]={...(CS.matches[d.id]||{}), ...d.data(), id:d.id, hub:p}; });
      if(!cardsOpen()){ const n=incoming().length; if(n) toast(`⚔️ 대결 신청이 왔어요 (${n})`,"info"); return; }
      if(CS.tab==="battle") renderCards(); else if(incoming().length) renderCards();
    }, e=>console.warn("대결 기록", e)));
  });
  hub(CS.parents[0]||"_").collection("battles").get().then(s=>{ CS.log=s.docs.map(d=>d.data()).filter(l=>l.aUid===me||l.bUid===me).sort((a,b)=>b.at-a.at).slice(0,5); }).catch(()=>{});
}
const fresh=m=>m.status!=="invite" || Date.now()-(m.createdAt||0)<10*60000;
function incoming(){ return Object.values(CS?CS.matches:{}).filter(m=>m.status==="invite" && m.from!==CS.uid && fresh(m)); }
function curMatch(){ return CS.mid==="local"? CS.local : CS.matches[CS.mid]; }
function lobbyHTML(){
  const ro=state.viewingChild, me=CS.uid, has=Object.keys(CS.cards).length>0;
  const inv=incoming(), live=Object.values(CS.matches).filter(m=>(m.status==="pick"||m.status==="roll") || (m.status==="invite" && m.from===me && fresh(m)));
  const sibs=CS.players.filter((x,i,a)=>a.findIndex(y=>y.uid===x.uid)===i);
  const opp=m=>m.who? m.who[m.users.find(u=>u!==me)] : {name:"상대"};
  return `
    ${inv.length?`<div class="r-sec">받은 대결 신청</div>${inv.map(m=>`<div class="list-item bt-inv">
        <span style="flex:1"><b>${eh(opp(m).name)}</b>이(가) 대결을 신청했어요!</span>
        <button class="fam-btn" onclick="Cards.accept('${m.id}')">수락</button><button class="ghost-btn" style="padding:7px 12px" onclick="Cards.decline('${m.id}')">거절</button></div>`).join("")}`:""}
    ${live.length?`<div class="r-sec">진행 중인 대결</div>${live.map(m=>`<div class="list-item">
        <span style="flex:1">vs <b>${eh(opp(m).name)}</b> <small style="color:#94A3B8">${m.status==="invite"?"대답 기다리는 중":m.status==="pick"?"카드 고르는 중":"주사위 굴리는 중"}</small></span>
        <button class="fam-btn" onclick="Cards.openMatch('${m.id}')">이어서</button></div>`).join("")}`:""}
    <div class="r-sec">대결 상대 고르기</div>
    ${!has?`<div class="pb-sub warn">카드가 있어야 대결할 수 있어요. 카드팩을 먼저 열어 봐요!</div>`:""}
    ${sibs.map(x=>{ const on=Date.now()-(x.seen||0)<ONLINE_MS; return `<div class="list-item" style="margin-bottom:6px">
        <span class="bt-av">${eh((x.name||"?").slice(0,1))}</span>
        <span style="flex:1;min-width:0"><b>${eh(x.name||"형제")}</b> <small class="${on?"bt-on":"bt-off"}">${on?"● 접속 중":"○ 오프라인"}</small></span>
        <button class="fam-btn" ${(!has||ro)?"disabled":""} onclick="Cards.invite('${x.uid}','${x.hub}')">⚔️ 대결 신청</button></div>`; }).join("")
      || `<div class="cd-note" style="margin-top:0">형제가 카드 화면을 한 번 열면 여기에 나타나요.</div>`}
    <div class="list-item" style="margin-bottom:6px"><span class="bt-av cpu">🤖</span><span style="flex:1"><b>연습 상대</b> <small style="color:#94A3B8">언제든 · 비슷한 등급 카드</small></span>
      <button class="fam-btn" ${(!has||ro)?"disabled":""} onclick="Cards.practice()">⚔️ 대결</button></div>
    ${CS.log&&CS.log.length?`<div class="r-sec">최근 대결</div>${CS.log.map(l=>`<div class="cd-log">${eh(l.a)} ${l.win?"🏆":"·"} vs ${eh(l.b)} ${l.win?"":"🏆"} <small>${eh(l.score)} · ${new Date(l.at).toLocaleDateString()}</small></div>`).join("")}`:""}
    ${foodHTML()}
    <div class="cd-note">한 판 점수 = ⚡힘(등급 + 강화×2) × 🎲주사위 × 먹이사슬(타입 ×1.5 · 진화 단계 ×1.2) × 이번 주 공부 보너스(+${Math.round(weekBoost()*100)}%). 3판 2선승 · 져도 카드는 잃지 않아요 · 이기면 하루 한 번 카드팩 +1</div>`;
}
function foodHTML(){
  return `<details class="cd-food"><summary>🍖 먹이사슬 보기</summary>
    <div class="cd-note" style="margin-top:6px">타입이 먹이를 만나면 ×1.5 · 진화 단계 가위바위보(기본 → 최종 진화 → 1진화 → 기본) ×1.2</div>
    ${Object.entries(FOOD).map(([k,v])=>`<div class="cd-food-row"><b>${k}</b><span>→ ${v.join(" · ")}</span></div>`).join("")}</details>`;
}

/* ----- 대결 방 화면 ----- */
function arenaShell(m, inner){
  const me=CS.uid, other=m.users.find(u=>u!==me), A=m.who[me]||{name:"나"}, B=m.who[other]||{name:"상대"};
  hubShell("⚔️ 카드 대결", `<div class="bt-top"><button class="ghost-btn" style="padding:6px 12px" onclick="Cards.leave()">‹ 목록</button></div>
    <div class="vs"><span class="vs-kid"><span class="bt-av">${eh((A.name||"나").slice(0,1))}</span><b>${eh(A.name)}</b></span><span class="vs-x">VS</span>
      <span class="vs-kid"><span class="bt-av ${other==="cpu"?"cpu":""}">${other==="cpu"?"🤖":eh((B.name||"?").slice(0,1))}</span><b>${eh(B.name)}</b></span></div>
    <div id="arenaBody">${inner}</div>`);
}
function renderMatch(){
  const m=curMatch(), me=CS.uid;
  if(!m){ CS.mid=null; return renderCards(); }
  const other=m.users.find(u=>u!==me), them=(m.who[other]||{}).name||"상대";
  const quit=`<button class="ghost-btn" onclick="Cards.cancel()">그만하기</button>`;
  if(m.status==="invite"){
    return arenaShell(m, `<div class="bt-wait">⏳ <b>${eh(them)}</b>의 대답을 기다려요…<br><small>같은 시간에 카드 화면을 열고 있어야 해요</small></div><div class="bt-row">${quit}</div>`);
  }
  if(m.status==="declined"||m.status==="cancel"){
    return arenaShell(m, `<div class="bt-wait">${m.status==="declined"? `🙅 ${eh(them)}이(가) 다음에 하재요.` : "대결을 그만했어요."}</div><div class="bt-row"><button class="fam-btn" onclick="Cards.leave()">목록으로</button></div>`);
  }
  if(m.status==="pick"){
    const mine=(m.picks||{})[me];
    if(mine){
      return arenaShell(m, `<div class="bt-pick">${cardFace(mine,"mid")}<p>내 카드: <b>${eh(mine.name)}</b> · ⚡${power(mine)}${mine.type?` · ${eh(mine.type)}`:""}</p></div>
        <div class="bt-wait">⏳ ${eh(them)}이(가) 카드를 고르는 중…</div><div class="bt-row">${quit}</div>`);
    }
    const owned=Object.values(CS.cards).sort((a,b)=>power(b)-power(a));
    return arenaShell(m, `<p class="bt-say">대결할 카드를 골라! <small>점수 = ⚡힘 × 🎲주사위 · 먹이를 만나면 ×1.5</small></p>
      <div class="cd-grid">${owned.map(c=>cardTile(c,{on:`Cards.confirmPick('${c.id}')`})).join("")}</div>${foodHTML()}<div class="bt-row">${quit}</div>`);
  }
  rollView(m);
}
function bonusTag(P,Q){ const b=bonus(P,Q); return b.why.length? `<span class="bt-edge">${b.why.join(" ")}</span>` : ""; }
function rollSides(m){
  const me=CS.uid, other=m.users.find(u=>u!==me), first=m.users[0]===me;
  const rounds=(m.rounds||[]).map(r=>first? r : {da:r.db, db:r.da, sa:r.sb, sb:r.sa, w:r.w===-1?-1:1-r.w});
  return {me, other, rounds, A:m.picks[me], B:m.picks[other]};
}
function rollView(m){
  const {me, other, rounds, A, B}=rollSides(m);
  stageWho={me:m.who[me]||{name:"나"}, them:m.who[other]||{name:"상대"}};
  let root=document.getElementById("arena");
  if(!root || root.dataset.mid!==m.id){
    arenaShell(m, `<div class="arena" id="arena" data-mid="${m.id}" data-shown="0">
        <div class="fighter" id="fA">${cardFace(A,"mid")}<b>${eh(A.name)}</b><span class="pw">⚡${power(A)}${A.type?` ${eh(A.type)}`:""}</span>${bonusTag(A,B)}<span class="die" id="dA">🎲</span></div>
        <div class="score" id="bScore">0 : 0</div>
        <div class="fighter" id="fB">${cardFace(B,"mid")}<b>${eh(B.name)}</b><span class="pw">⚡${power(B)}${B.type?` ${eh(B.type)}`:""}</span>${bonusTag(B,A)}<span class="die" id="dB">🎲</span><small class="die-note" id="nB"></small></div>
      </div>
      <div class="roll-ctl" id="rollCtl"></div><div class="rounds" id="bRounds"></div><div id="bEnd"></div>`);
    root=document.getElementById("arena");
  }
  const rolled=m.rolled||{}, mine=rolled[me]||0, theirs=rolled[other]||0;
  const doneN=m.status==="done"? rounds.length : Math.min(mine, theirs);
  let shown=+root.dataset.shown;
  for(; shown<doneN; shown++){ const i=shown; revealChain=revealChain.then(()=>revealRound(rounds, i, A, B)); }
  root.dataset.shown=shown;
  const ctl=document.getElementById("rollCtl");
  if(doneN>=rounds.length){
    ctl.innerHTML="";
    if(!root.dataset.end){ root.dataset.end="1"; revealChain=revealChain.then(()=>battleEnd(m)); }
    return;
  }
  const cur=doneN;
  document.getElementById("nB").textContent= theirs>cur? "✅ 굴렸어!" : "";
  if(mine>cur){
    ctl.innerHTML=`<p class="bt-wait">⏳ 상대가 주사위를 굴리길 기다려요…</p>`;
    clearTimeout(rollView.t);
    rollView.t=setTimeout(()=>{
      const now=curMatch();
      if(!now || now.status!=="roll" || ((now.rolled||{})[other]||0)>cur || !document.getElementById("rollCtl")) return;
      document.getElementById("rollCtl").insertAdjacentHTML("beforeend", `<button class="ghost-btn" id="proxyRoll">⏩ 상대 주사위도 굴려 주기</button>`);
      document.getElementById("proxyRoll").onclick=()=>{ document.getElementById("proxyRoll").disabled=true; matchRoll(m, other, cur+1); };
    }, 20000);
    return;
  }
  const btn=document.getElementById("rollBtn");
  if(btn && +btn.dataset.r===cur){ document.getElementById("rollHint").textContent= theirs>cur? "상대는 벌써 굴렸어! 너도 굴려!" : ""; return; }
  ctl.innerHTML=`<button class="roll-btn" id="rollBtn" data-r="${cur}">🎲 ${cur+1}판 주사위 굴리기!</button><p class="cd-note" style="text-align:center" id="rollHint">${theirs>cur?"상대는 벌써 굴렸어! 너도 굴려!":""}</p>`;
  document.getElementById("rollBtn").onclick=async ()=>{
    document.getElementById("rollBtn").disabled=true;
    const done=rounds.slice(0,cur);
    const tension=done.filter(x=>x.w===0).length===1 && done.filter(x=>x.w===1).length===1;
    const st=openStage(tension? "🔥 마지막 판!" : `${cur+1}판`, tension);
    const latest=curMatch()||m, theyRolled=((latest.rolled||{})[other]||0)>cur;
    restPane(st.them, 0, theyRolled? "✅ 벌써 굴렸어! 두근두근…" : "⏳ 상대가 굴리길 기다려요");
    await rollPane(st.me, rounds[cur].da, ["-60vw","-40vh"]);
    document.getElementById("dA").innerHTML=dieSvg(rounds[cur].da);
    matchRoll(m, me, cur+1);
    if(!theyRolled && other!=="cpu") closeStage(700); else stageClose=setTimeout(()=>closeStage(), 8000);
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
const scoreHow=(P,Q,die,sc)=>{ const x=mulOf(P,Q); return `⚡${power(P)} × 🎲${die}${x>1.0001?` × ${+x.toFixed(2)}`:""} = <b>${sc}</b>`; };
async function revealRound(rounds, i, A, B){
  if(!document.getElementById("arena")) return;
  const r=rounds[i];
  document.getElementById("dA").innerHTML=dieSvg(r.da);
  document.getElementById("nB").textContent="";
  const before=rounds.slice(0,i);
  const tension=before.filter(x=>x.w===0).length===1 && before.filter(x=>x.w===1).length===1;
  const st=openStage(tension? "🔥 마지막 판!" : `${i+1}판`, tension);
  restPane(st.me, r.da);
  await rollPane(st.them, r.db, ["60vw","40vh"]);
  document.getElementById("dB") && (document.getElementById("dB").innerHTML=dieSvg(r.db));
  const win= r.w===-1? null : r.w===0;
  st.banner.innerHTML=`<b>${win===null?"🤝 비겼어요! 한 번 더!":win?"👍 이 판은 내가 이겼어!":"💥 이 판은 상대가 이겼어!"}</b><small>나 ${scoreHow(A,B,r.da,r.sa)}</small><small>상대 ${scoreHow(B,A,r.db,r.sb)}</small>`;
  st.banner.className="dice-banner show "+(win===true?"win":win===false?"lose":"tie");
  const w=win===true? st.me : win===false? st.them : null; if(w) w.root.classList.add("winner");
  sfx(win===true?"roundWin":win===false?"roundLose":"pop");
  await dwait(1600);
  await closeStage();
  const lines=document.getElementById("bRounds"); if(!lines) return;
  lines.insertAdjacentHTML("beforeend", `<p class="rd">${i+1}판: ${scoreHow(A,B,r.da,r.sa)} vs ${scoreHow(B,A,r.db,r.sb)} ${r.w===-1?"🤝 비김":r.w===0?"👍 내가 이김":"💥 상대가 이김"}</p>`);
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
async function battleScene(won, reward){
  const el=document.createElement("div");
  el.className="bt-over "+(won?"win":"lose");
  el.innerHTML= won
    ? `<div class="bt-rays"></div><p class="bt-big">🏆</p><p class="bt-word">승리!</p><p class="bt-sub">${reward?"🎴 카드팩 +1 (오늘 첫 승리)":"오늘 승리 보상은 이미 받았어요"}</p><button class="bt-ok">좋아! 👍</button>`
    : `<div class="bt-rain">${Array.from({length:28},()=>`<i style="left:${Math.random()*100}%;animation-delay:${(Math.random()*1.2).toFixed(2)}s;animation-duration:${(0.7+Math.random()*0.6).toFixed(2)}s"></i>`).join("")}</div>
       <p class="bt-big">😢</p><p class="bt-word">아쉽다…</p><p class="bt-sub">카드는 그대로예요. 다음엔 꼭 이길 거야 💪</p><button class="bt-ok">다시 힘내기 💪</button>`;
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
  const {me, other, A, B}=rollSides(m);
  const won=m.winner===me, them=(m.who[other]||{}).name||"상대";
  let reward=false;
  if(!(m.settled||{})[me]){
    const W=CS.wallet;
    if(won && W.winDay!==today()){ W.winDay=today(); W.tickets=(Number(W.tickets)||0)+1; reward=true; await saveWallet(CS.uid, W); }
    const w=rollSides(m).rounds.filter(x=>x.w===0).length, l=rollSides(m).rounds.filter(x=>x.w===1).length;
    const logDoc={aUid:me, a:(m.who[me]||{}).name||"", bUid:other, b:them, win:won, score:`${w} : ${l}`, at:Date.now()};
    if(CS.parents[0]) hub(CS.parents[0]).collection("battles").add(logDoc).catch(()=>{});
    CS.log=[logDoc, ...(CS.log||[])].slice(0,5);
    matchSettle(m);
  }
  await battleScene(won, reward);
  const end=document.getElementById("bEnd"); if(!end) return;
  end.innerHTML=`<p class="bt-result ${won?"win":"lose"}">${won?"🏆 이겼어요!":"😢 아쉽게 졌어요"}</p>
    <div class="bt-row"><button class="fam-btn" onclick="${other==="cpu"?"Cards.practice()":`Cards.invite('${other}','${m.hub}')`}">⚔️ 한 번 더</button><button class="ghost-btn" onclick="Cards.leave()">목록으로</button></div>`;
}

/* ----- 대결 기록 바꾸기 (형제: Firestore 트랜잭션 · 연습: 이 기기) ----- */
async function matchPick(m, card){
  if(m.id==="local"){
    m.picks[CS.uid]=card;
    const cpu=cpuCard(card);
    m.picks.cpu=cpu;
    const r=battle(m.seed, m.picks[m.users[0]], m.picks[m.users[1]]);
    Object.assign(m, {status:"roll", winner:m.users[r.winner], rounds:r.rounds, rolled:{}});
    return renderCards();
  }
  const ref=hub(m.hub).collection("matches").doc(m.id), me=CS.uid;
  await db.runTransaction(async t=>{
    const d=(await t.get(ref)).data();
    if(!d || d.status!=="pick") throw new Error("closed");
    const picks={...(d.picks||{}), [me]:card}, upd={picks, updatedAt:Date.now()};
    if(picks[d.users[0]] && picks[d.users[1]]){
      const r=battle(d.seed, picks[d.users[0]], picks[d.users[1]]);
      Object.assign(upd, {status:"roll", winner:d.users[r.winner], rounds:r.rounds, rolled:{}});
    }
    t.update(ref, upd);
  });
}
function matchRoll(m, who, n){
  if(m.id==="local"){
    m.rolled={...(m.rolled||{}), [who]:n, cpu:n};          // 연습 상대는 바로 따라 굴려요
    if((m.rolled[CS.uid]||0)>=m.rounds.length) m.status="done";
    return rollView(m);
  }
  const ref=hub(m.hub).collection("matches").doc(m.id);
  return db.runTransaction(async t=>{
    const d=(await t.get(ref)).data();
    if(!d || d.status!=="roll") return;
    const rolled={...(d.rolled||{})}; rolled[who]=Math.max(rolled[who]||0, n);
    const upd={rolled, updatedAt:Date.now()};
    if(d.users.every(u=>(rolled[u]||0)>=d.rounds.length)) upd.status="done";
    t.update(ref, upd);
  }).catch(()=>toast("앗, 연결이 끊겼어요. 다시 눌러 봐요","info"));
}
async function matchSettle(m){
  if(m.id==="local"){ m.settled={[CS.uid]:true}; return; }
  const ref=hub(m.hub).collection("matches").doc(m.id), other=m.users.find(u=>u!==CS.uid);
  m.keep=true;   // 상대가 기록을 지워도 이 화면에서는 끝까지 보여 줘요
  try{
    const d=await ref.get(), cur=d.exists? d.data() : null;
    if(!cur) return;
    if((cur.settled||{})[other]) await ref.delete(); else await ref.update({settled:{...(cur.settled||{}), [CS.uid]:true}});
  }catch(_){}
}
function cpuCard(mine){
  const pool=byCls[mine.cls]&&byCls[mine.cls].length? byCls[mine.cls] : byCls.n;
  const x=info(pool[Math.floor(Math.random()*pool.length)]);
  return {...pickOf({...x, count:1}), boost:0.05};
}

const Cards={
  open:drawCards,
  tab(k){ CS.tab=k; CS.reveal=null; CS.mid=null; renderCards(); },
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
    renderCards();
    if(k==="u") toast("👑 스페셜 카드!","cheer"); else if(k==="s") toast("💎 슈퍼 레어!","cheer"); else if(k==="a") toast("🎨 아트 레어!","cheer");
  },
  // 형제에게 대결 신청
  async invite(uid, hubId){
    const x=CS.players.find(p=>p.uid===uid)||{name:"형제"}, me=CS.uid;
    const ref=hub(hubId).collection("matches").doc();
    const doc={users:[me, uid], from:me, who:{[me]:{name:state.ownerName||state.profile.name||"나"}, [uid]:{name:x.name||"형제"}},
      seed:Math.floor(Math.random()*2147483647), status:"invite", picks:{}, rolled:{}, settled:{}, createdAt:Date.now(), updatedAt:Date.now()};
    try{ await ref.set(doc); }catch(e){ console.error(e); alert("대결을 신청하지 못했어요.\n\nFirebase 보안 규칙에 카드 대결(matches) 규칙이 필요해요. 저장소의 firestore.rules 를 다시 게시해 주세요."); return; }
    CS.matches[ref.id]={...doc, id:ref.id, hub:hubId};
    sfx("pop"); CS.tab="battle"; CS.mid=ref.id; renderCards();
  },
  async accept(id){ const m=CS.matches[id]; if(!m) return; await hub(m.hub).collection("matches").doc(id).update({status:"pick", updatedAt:Date.now()}).catch(()=>{}); m.status="pick"; CS.mid=id; renderCards(); },
  async decline(id){ const m=CS.matches[id]; if(!m) return; await hub(m.hub).collection("matches").doc(id).update({status:"declined", updatedAt:Date.now()}).catch(()=>{}); renderCards(); },
  openMatch(id){ CS.mid=id; renderCards(); },
  practice(){
    const me=CS.uid;
    CS.local={id:"local", users:[me,"cpu"], who:{[me]:{name:state.ownerName||state.profile.name||"나"}, cpu:{name:"연습 상대"}},
      seed:Math.floor(Math.random()*2147483647), status:"pick", picks:{}, rolled:{}};
    CS.tab="battle"; CS.mid="local"; renderCards();
  },
  confirmPick(id){
    const m=curMatch(), c=CS.cards[id]; if(!m||!c) return;
    const why=(FOOD[c.type]||[]).length? `${c.type} 타입이 먹는 것: ${FOOD[c.type].join(" · ")} · ` : "";
    if(!confirm(`'${c.name}' (⚡${power(c)})로 대결할까요?\n${why}${STAGE_NAME[c.stage||1]}`)) return;
    sfx("pop");
    matchPick(m, pickOf(c)).catch(()=>{ toast("대결이 이미 끝났어요","info"); CS.mid=null; renderCards(); });
  },
  async cancel(){
    const m=curMatch(); if(!m) return;
    if(m.id!=="local" && (m.status==="invite"||m.status==="pick")) await hub(m.hub).collection("matches").doc(m.id).update({status:"cancel", updatedAt:Date.now()}).catch(()=>{});
    CS.mid=null; CS.local=null; renderCards();
  },
  leave(){ closeStage(); CS.mid=null; renderCards(); },
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
.rounds .rd{font-size:12.5px;color:#475569;margin:6px 0;line-height:1.5}
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
const st=document.createElement("style"); st.textContent=css; document.head.appendChild(st);

window.Cards=Cards;
window.drawCards=drawCards;
window.drawCardAdmin=drawCardAdmin;
})();
