/* ============================================================
 *  🌿 포켓몬 포획 (받아쓰기 프로그램 nkdddd/mdeng 의 포획 타임 · 도감 · 진화)
 *  - 매일 공부를 마치면 몬스터볼 (할 일 모두 완료 +3 · 목표시간 달성 +2)
 *  - 🌿 풀숲 탐색 → 포켓몬 GO처럼 색 고리가 금색 고리 안일 때 포켓몬 쪽으로 볼을 휙! (볼 1개씩, 세 번 빗나가면 도망)
 *  - 잡으면 도감 등록 + 그 포켓몬과 관련된 카드 1장 · 같은 포켓몬 3마리면 진화(진화 장면)
 *  - 기록: planner/{자녀uid}/meta/cardWallet {balls, ballClaimed, dex[], catches{}, shinies[]}
 *  - 그림·울음소리: PokeAPI (raw.githubusercontent.com) — 못 불러오면 이모지 · 스타일: assets/pokecatch.css
 * ============================================================ */
(function(){
/* 도감: 전국도감 1~1025 (assets/pokedex.js) · 못 불러오면 받아쓰기 프로그램 js/data.js 의 85종 */
const POKEMON = (window.POKEDEX && window.POKEDEX.length)? window.POKEDEX : [
  ['피카츄', '⚡', '전기', 25, '쥐포켓몬', 'c'], ['라이츄', '⚡', '전기', 26, '쥐포켓몬', 'r'],
  ['코일', '🧲', '전기', 81, '자석포켓몬', 'c'], ['레어코일', '🧲', '전기', 82, '자석포켓몬', 'c'], ['자포코일', '🛸', '전기', 462, '자기장포켓몬', 'r'],
  ['데덴네', '🐭', '전기', 702, '안테나포켓몬', 'c'],
  ['파이리', '🔥', '불꽃', 4, '도롱뇽포켓몬', 'c'], ['리자드', '🔥', '불꽃', 5, '화염포켓몬', 'c'], ['리자몽', '🔥', '불꽃', 6, '화염포켓몬', 'r'],
  ['식스테일', '🦊', '불꽃', 37, '여우포켓몬', 'c'], ['나인테일', '🦊', '불꽃', 38, '여우포켓몬', 'r'],
  ['가디', '🐕', '불꽃', 58, '강아지포켓몬', 'c'], ['윈디', '🐕', '불꽃', 59, '전설포켓몬', 'r'],
  ['불꽃숭이', '🐵', '불꽃', 390, '꼬마원숭이포켓몬', 'c'], ['파이숭이', '🐵', '불꽃', 391, '장난꾸러기포켓몬', 'c'], ['초염몽', '🐵', '불꽃', 392, '불꽃포켓몬', 'r'],
  ['꼬부기', '💧', '물', 7, '꼬마거북포켓몬', 'c'], ['어니부기', '💧', '물', 8, '거북포켓몬', 'c'], ['거북왕', '🐢', '물', 9, '껍질포켓몬', 'r'],
  ['고라파덕', '🦆', '물', 54, '오리포켓몬', 'c'], ['골덕', '🦆', '물', 55, '오리포켓몬', 'r'],
  ['잉어킹', '🐟', '물', 129, '물고기포켓몬', 'c'], ['갸라도스', '🐉', '물', 130, '흉악포켓몬', 'r'],
  ['팽도리', '🐧', '물', 393, '펭귄포켓몬', 'c'], ['팽태자', '🐧', '물', 394, '펭귄포켓몬', 'c'], ['엠페르트', '🐧', '물', 395, '황제포켓몬', 'r'],
  ['야돈', '💤', '물', 79, '얼간이포켓몬', 'c'], ['야도란', '🐚', '물', 80, '동거포켓몬', 'r'],
  ['이상해씨', '🌱', '풀', 1, '씨앗포켓몬', 'c'], ['이상해풀', '🌿', '풀', 2, '씨앗포켓몬', 'c'], ['이상해꽃', '🌸', '풀', 3, '씨앗포켓몬', 'r'],
  ['치코리타', '🍃', '풀', 152, '잎사귀포켓몬', 'c'], ['베이리프', '🍃', '풀', 153, '잎사귀포켓몬', 'c'], ['메가니움', '🌼', '풀', 154, '허브포켓몬', 'r'],
  ['모부기', '🌳', '풀', 387, '어린잎포켓몬', 'c'], ['수풀부기', '🌳', '풀', 388, '수풀포켓몬', 'c'], ['토대부기', '🌳', '풀', 389, '대륙포켓몬', 'r'],
  ['캐터피', '🐛', '벌레', 10, '애벌레포켓몬', 'c'], ['단데기', '🟢', '벌레', 11, '번데기포켓몬', 'c'], ['버터플', '🦋', '벌레', 12, '나비포켓몬', 'r'],
  ['푸린', '🎤', '노말', 39, '풍선포켓몬', 'c'], ['푸크린', '🎤', '노말', 40, '풍선포켓몬', 'r'],
  ['나옹', '🐱', '노말', 52, '요괴고양이포켓몬', 'c'], ['페르시온', '🐈', '노말', 53, '샴고양이포켓몬', 'r'],
  ['이브이', '🤎', '노말', 133, '진화포켓몬', 'c'],
  ['구구', '🐦', '노말', 16, '아기새포켓몬', 'c'], ['피죤', '🐦', '노말', 17, '새포켓몬', 'c'], ['피죤투', '🦅', '노말', 18, '새포켓몬', 'r'],
  ['캐이시', '🥄', '에스퍼', 63, '초능력포켓몬', 'c'], ['윤겔라', '🥄', '에스퍼', 64, '초능력포켓몬', 'c'], ['후딘', '🥄', '에스퍼', 65, '초능력포켓몬', 'r'],
  ['디그다', '🕳️', '땅', 50, '두더지포켓몬', 'c'], ['닥트리오', '🕳️', '땅', 51, '두더지포켓몬', 'r'],
  ['토게피', '🥚', '페어리', 175, '바늘알포켓몬', 'c'], ['토게틱', '🕊️', '페어리', 176, '행복포켓몬', 'c'], ['토게키스', '🕊️', '페어리', 468, '축복포켓몬', 'r'],

  ['개구마르', '🐸', '물', 656, '거품개구리포켓몬', 'r'], ['개굴반장', '🐸', '물', 657, '거품개구리포켓몬', 'r'], ['개굴닌자', '🐸', '물', 658, '시노비포켓몬', 'r'],
  ['메타몽', '🟣', '노말', 132, '변신포켓몬', 'r'],
  ['먹고자', '🍙', '노말', 446, '대식가포켓몬', 'r'], ['잠만보', '😴', '노말', 143, '졸음포켓몬', 'r'],
  ['흉내내', '🎭', '에스퍼', 439, '흉내포켓몬', 'r'], ['마임맨', '🎭', '에스퍼', 122, '배리어포켓몬', 'r'],
  ['고오스', '👻', '고스트', 92, '가스상포켓몬', 'r'], ['고우스트', '👻', '고스트', 93, '가스상포켓몬', 'r'], ['팬텀', '👻', '고스트', 94, '그림자포켓몬', 'r'],
  ['롱스톤', '🪨', '바위', 95, '돌뱀포켓몬', 'r'], ['강철톤', '⛓️', '강철', 208, '철뱀포켓몬', 'r'],
  ['미뇽', '🐲', '드래곤', 147, '드래곤포켓몬', 'r'], ['신뇽', '🐲', '드래곤', 148, '드래곤포켓몬', 'r'], ['망나뇽', '🐲', '드래곤', 149, '드래곤포켓몬', 'r'],
  ['리오르', '🥋', '격투', 447, '파문포켓몬', 'r'], ['루카리오', '🥋', '격투', 448, '파동포켓몬', 'r'],

  ['썬더', '⚡', '전기', 145, '전기포켓몬', 'l'], ['파이어', '🔥', '불꽃', 146, '화염포켓몬', 'l'],
  ['프리져', '❄️', '얼음', 144, '냉동포켓몬', 'l'], ['칠색조', '🌈', '불꽃', 250, '무지개색포켓몬', 'l'],
  ['루기아', '🌊', '에스퍼', 249, '잠수포켓몬', 'l'], ['레쿠쟈', '🐉', '드래곤', 384, '천공포켓몬', 'l'],
  ['뮤츠', '🔮', '에스퍼', 150, '유전포켓몬', 'l'],

  ['뮤', '🩷', '에스퍼', 151, '신종포켓몬', 'm'], ['세레비', '🍀', '에스퍼', 251, '시간이동포켓몬', 'm'],
  ['지라치', '⭐', '강철', 385, '희망사항포켓몬', 'm'],

  ['아르세우스', '✨', '노말', 493, '창조포켓몬', 's'],
];
/* 진화: 풀숲에는 가족의 지금 모습(도감에 있는 가장 높은 단계)만 나와요.
 * 같은 모습을 EVO_NEED마리 모으면 다음 단계로 진화해요 (파이리 3 → 리자드 1, 리자드 3 → 리자몽 1) */
const EVOLUTION = [
  ['피카츄', '라이츄'], ['코일', '레어코일', '자포코일'], ['파이리', '리자드', '리자몽'], ['식스테일', '나인테일'],
  ['가디', '윈디'], ['불꽃숭이', '파이숭이', '초염몽'], ['꼬부기', '어니부기', '거북왕'], ['고라파덕', '골덕'],
  ['잉어킹', '갸라도스'], ['팽도리', '팽태자', '엠페르트'], ['야돈', '야도란'], ['이상해씨', '이상해풀', '이상해꽃'],
  ['치코리타', '베이리프', '메가니움'], ['모부기', '수풀부기', '토대부기'], ['캐터피', '단데기', '버터플'],
  ['푸린', '푸크린'], ['나옹', '페르시온'], ['구구', '피죤', '피죤투'], ['캐이시', '윤겔라', '후딘'],
  ['디그다', '닥트리오'], ['토게피', '토게틱', '토게키스'], ['개구마르', '개굴반장', '개굴닌자'],
  ['먹고자', '잠만보'], ['흉내내', '마임맨'], ['고오스', '고우스트', '팬텀'], ['롱스톤', '강철톤'],
  ['미뇽', '신뇽', '망나뇽'], ['리오르', '루카리오'],
];
const EVO_NEED = 3;

const GRADES={ c:{name:"일반",icon:"⚪"}, r:{name:"희귀",icon:"🔵"}, l:{name:"전설",icon:"🟡"}, m:{name:"신화",icon:"🟣"}, s:{name:"시크릿",icon:"🌈"} };
const SPAWN={c:76, r:21, l:2.2, m:0.6, s:0.2};          // 풀숲에서 만날 확률(%)
const MAX_MISS=3;                                       // 세 번 빗나가면 도망가요
const DAY_BALLS=[                                       // 매일 학습을 마치면 몬스터볼
  {label:"오늘 할 일 모두 완료", n:3, test:(ds,A)=>{ const ts=(state.tasks||[]).filter(t=>t.date===ds); return ts.length>0 && ts.every(t=>t.done); }},
  {label:"오늘 목표시간 달성",   n:2, test:(ds,A)=>{ const g=(typeof dayTypeGoal==="function")? dayTypeGoal(ds) : 120; return A.dayStats(ds).min>=g; }},
];
const POKE_BY=Object.fromEntries(POKEMON.map(m=>[m[0],m]));
const POKE_ART=(id,shiny)=>`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${shiny?"shiny/":""}${id}.png`;
const POKE_CRY=id=>`https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`;
const A=()=>window.__CardsAPI;
const W=()=>A().CS.wallet;
const eh=s=>A().eh(s);
const sfx=(k,a)=>A().sfx(k,a);
const reduceMotion=window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait=ms=>new Promise(r=>setTimeout(r, reduceMotion? Math.min(ms,80) : ms));
const josa=(w,j)=>{ const c=w.charCodeAt(w.length-1)-0xac00; return (c>=0 && c<=11171 && c%28)? j[0] : j[1]; };
const ro=w=>{ const c=w.charCodeAt(w.length-1)-0xac00; return c>=0 && c%28 && c%28!==8? "으로" : "로"; };
const artImg=(m,shiny,cls)=>`<img class="art ${cls||""}" src="${POKE_ART(m[3],shiny)}" alt="" loading="lazy" draggable="false" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=&quot;art-fallback&quot;>${m[1]}</span>'">`;
const ballSvg='<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" class="b-bot"/><path d="M4 50 A46 46 0 0 1 96 50 Z" class="b-top"/><path d="M4 50 H96" class="b-line"/><circle cx="50" cy="50" r="13" class="b-btn"/><circle cx="50" cy="50" r="6" class="b-dot"/></svg>';
const gradeChip=(g,shiny)=>shiny? `<span class="grade-chip gs">🌈 시크릿 ✨</span>` : `<span class="grade-chip g${g}">${GRADES[g].icon} ${GRADES[g].name}</span>`;
let cry=null;
function playCry(id){ try{ if(cry) cry.pause(); cry=new Audio(POKE_CRY(id)); cry.volume=0.4; cry.play().catch(()=>{}); }catch(_){} }

/* ----- 도감 · 진화 ----- */
const dex=()=>W().dex||(W().dex=[]);
const dexHas=n=>dex().includes(n);
const catches=()=>W().catches||(W().catches={});
// 진화 가족: 진화 전 → 진화 후 (이브이처럼 여러 갈래도 있어요)
const EVO_FROM={}, EVO_KIDS={};
if(POKEMON[0] && POKEMON[0].length>6) POKEMON.forEach(m=>{ if(m[6] && POKE_BY[m[6]]) EVO_FROM[m[0]]=m[6]; });
else EVOLUTION.forEach(l=>l.forEach((n,i)=>{ if(i) EVO_FROM[n]=l[i-1]; }));
Object.entries(EVO_FROM).forEach(([b,a])=>{ (EVO_KIDS[a]=EVO_KIDS[a]||[]).push(b); });
// 다음 진화: 아직 도감에 없는 갈래부터
const evoNext=n=>{ const k=EVO_KIDS[n]; return k && (k.find(x=>!dexHas(x)) || k[0]); };
// 풀숲에 나오는 모습: 가족의 첫 모습이나 도감에 있는 모습 중, 진화한 모습을 다 모으지 않은 것
const spawnable=n=>(!EVO_FROM[n] || dexHas(n)) && !((EVO_KIDS[n]||[]).length && EVO_KIDS[n].every(dexHas));
const canEvolve=n=>!!evoNext(n) && (catches()[n]||0)>=EVO_NEED;
const evoDots=n=>`<span class="evo-dots">${"●".repeat(Math.min(EVO_NEED,catches()[n]||0)).padEnd(EVO_NEED,"○")}</span>`;
async function save(){ await A().saveWallet(A().CS.uid, W()); }

/* ----- 오늘 받을 몬스터볼 ----- */
function ballQuests(ds){ return DAY_BALLS.map(q=>({...q, ok:q.test(ds, A())})); }
function ballsReady(ds){ const got=Number((W().ballClaimed||{})[ds])||0; return Math.max(0, ballQuests(ds).filter(q=>q.ok).reduce((a,q)=>a+q.n,0)-got); }

function pokeCard(m, shiny, locked){
  const [name,,type,id,genus,g]=m;
  if(locked) return `<div class="pcard locked g${g}"><span class="pc-no">No.${String(id).padStart(3,"0")}</span><span class="pc-art">${artImg(m,false,"sil")}</span><b>???</b>${gradeChip(g)}</div>`;
  return `<div class="pcard g${shiny?"s shiny":g}"><span class="pc-no">No.${String(id).padStart(3,"0")}</span><span class="pc-art">${artImg(m,shiny)}</span><b>${eh(name)}</b><small>${eh(genus)}</small>${gradeChip(g,shiny)}</div>`;
}
let dexOpen=false;
function tabHTML(){
  const ds=A().today(), ro=state.viewingChild, b=Number(W().balls)||0, ready=ballsReady(ds);
  const owned=dex().filter(n=>POKE_BY[n]);
  const ev=owned.filter(canEvolve);
  return `
    <div class="cd-ticket pc-top">
      <div><div class="cd-t-lbl">내 몬스터볼</div><div class="cd-t-n"><span class="mini-ball">${ballSvg}</span> ${b}개</div></div>
      <button class="pay-btn" ${(!ro && b>0)?"":"disabled"} onclick="PokeCatch.explore()">🌿 풀숲 탐색</button>
    </div>
    <div class="r-sec">오늘 공부를 마치면 몬스터볼</div>
    <div class="cd-quests">${ballQuests(ds).map(q=>`<div class="cd-q ${q.ok?"ok":""}"><span>${q.ok?"✅":"⬜"}</span>${eh(q.label)} <b style="margin-left:auto">+${q.n}</b></div>`).join("")}</div>
    <button class="ghost-btn" style="width:100%;margin-top:8px" ${(!ro && ready>0)?"":"disabled"} onclick="PokeCatch.claim()">${ready>0?`🔴 몬스터볼 ${ready}개 받기`:(Number((W().ballClaimed||{})[ds])||0)? `오늘 몬스터볼 ${(W().ballClaimed||{})[ds]}개를 받았어요` : "할 일을 다 끝내면 받을 수 있어요"}</button>
    ${ev.length?`<div class="r-sec">🧬 진화할 수 있어요!</div><div class="pc-evo">${ev.map(n=>`<button class="ghost-btn evo-cta" onclick="PokeCatch.evolve('${n}')">${eh(n)} ${EVO_NEED}마리 → ${eh(evoNext(n))}</button>`).join("")}</div>`:""}
    <div class="r-sec">📖 포켓몬 도감 ${owned.length}/${POKEMON.length} <button class="link-btn" onclick="PokeCatch.toggleDex()">${dexOpen?"접기":"펼치기"}</button></div>
    ${dexOpen? dexHTML() : ""}
    <div class="cd-note">풀숲에서 포켓몬을 만나면 몬스터볼을 던져 잡아요. 색 고리가 금색 고리 안으로 작아졌을 때, 포켓몬 쪽으로 휙! (컴퓨터는 스페이스바)<br>
      잡으면 그 포켓몬과 관련된 카드 1장 · 같은 포켓몬 ${EVO_NEED}마리면 진화 · 세 번 빗나가면 도망가요</div>`;
}

// 📖 도감: 잡은 포켓몬을 앞에 · 아직 못 잡은 포켓몬은 세대별로 따로
const GEN_NAME={1:"1세대 관동",2:"2세대 성도",3:"3세대 호연",4:"4세대 신오",5:"5세대 하나",6:"6세대 칼로스",7:"7세대 알로라",8:"8세대 가라르",9:"9세대 팔데아"};
// 분류: 세대 · 타입 · 등급. 묶음마다 잡은 수를 보여 주고, 고른 묶음만 펼쳐요 (잡은 포켓몬 앞 · 못 잡은 포켓몬 따로)
const TYPE_ORDER=["노말","불꽃","물","풀","전기","얼음","격투","독","땅","비행","에스퍼","벌레","바위","고스트","드래곤","악","강철","페어리"];
const TYPE_EMO={노말:"⚪",불꽃:"🔥",물:"💧",풀:"🌿",전기:"⚡",얼음:"❄️",격투:"🥊",독:"☠️",땅:"⛰️",비행:"🪽",에스퍼:"🔮",벌레:"🐛",바위:"🪨",고스트:"👻",드래곤:"🐉",악:"🌑",강철:"⚙️",페어리:"🧚"};
const DEX_BY={
  gen:{name:"세대", keys:()=>[...new Set(POKEMON.map(m=>m[7]||1))].sort((a,b)=>a-b), of:m=>m[7]||1, label:k=>GEN_NAME[k]||k+"세대"},
  type:{name:"타입", keys:()=>TYPE_ORDER.filter(t=>POKEMON.some(m=>m[2]===t)), of:m=>m[2], label:k=>`${TYPE_EMO[k]||""} ${k}`},
  grade:{name:"등급", keys:()=>["c","r","l","m","s"].filter(g=>POKEMON.some(m=>m[5]===g)), of:m=>m[5], label:k=>`${GRADES[k].icon} ${GRADES[k].name}`},
};
let dexBy="gen", dexKey=null, dexMiss=false;
function dexHTML(){
  const shin=W().shinies||[], by=DEX_BY[dexBy], keys=by.keys();
  const total=POKEMON.length, gotN=POKEMON.filter(m=>dexHas(m[0])).length;
  const stat=k=>{ const all=POKEMON.filter(m=>by.of(m)===k); return {all:all.length, got:all.filter(m=>dexHas(m[0])).length}; };
  if(dexKey==null || !keys.includes(dexKey)) dexKey=keys[0];
  const inK=POKEMON.filter(m=>by.of(m)===dexKey);
  const got=inK.filter(m=>dexHas(m[0])).sort((a,b)=>a[3]-b[3]), miss=inK.filter(m=>!dexHas(m[0]));
  const pct=(a,b)=>b? Math.round(a/b*100) : 0;
  return `<div class="pd-sum"><b>${gotN}</b> / ${total}종 <span class="pd-bar"><i style="width:${Math.max(gotN?1:0,pct(gotN,total))}%"></i></span><small>${pct(gotN,total)}%</small></div>
    <div class="seg pd-by">${Object.entries(DEX_BY).map(([k,v])=>`<button class="${k===dexBy?"on":""}" onclick="PokeCatch.dexBy('${k}')">${v.name}별</button>`).join("")}</div>
    <div class="pd-groups">${keys.map(k=>{ const t=stat(k); return `<button class="pd-g ${k===dexKey?"on":""} ${t.got===t.all?"full":""}" onclick="PokeCatch.dexKey('${k}')">
        <span>${eh(by.label(k))}</span><small>${t.got}/${t.all}</small><span class="pd-bar"><i style="width:${pct(t.got,t.all)}%"></i></span></button>`; }).join("")}</div>
    <div class="pd-h">✅ ${eh(by.label(dexKey))} · 잡은 포켓몬 <b>${got.length}</b>종</div>
    ${got.length? `<div class="pdex">${got.map(m=>`<div class="pd-w">${pokeCard(m, shin.includes(m[0]))}${evoNext(m[0])&&!dexHas(evoNext(m[0]))? `<div class="pd-dots">${evoDots(m[0])} ${catches()[m[0]]||0}/${EVO_NEED}</div>`:""}</div>`).join("")}</div>`
      : `<div class="cd-note" style="margin-top:0">이 묶음에서 아직 잡은 포켓몬이 없어요.</div>`}
    ${miss.length? `<button class="pd-h miss pd-tog" onclick="PokeCatch.dexMiss()">❔ 아직 못 잡은 포켓몬 <b>${miss.length}</b>종 <span>${dexMiss?"접기 ▲":"보기 ▼"}</span></button>
      ${dexMiss? `<div class="pdex locked-list">${miss.map(m=>pokeCard(m,false,true)).join("")}</div>` : ""}`
      : `<div class="cd-note">🎉 이 묶음은 모두 잡았어요!</div>`}`;
}

/* ----- 풀숲에서 만나기 ----- */
function rollWild(){
  const caughtBig=dex().some(n=>POKE_BY[n] && "lms".includes(POKE_BY[n][5]));
  let x=Math.random()*100, g="c";
  for(const k of ["s","m","l","r","c"]){ if((x-=SPAWN[k])<0){ g=k; break; } }
  const now=k=>POKEMON.filter(m=>m[5]===k && spawnable(m[0]));
  const pool=now(g).length? now(g) : now("c");
  const fresh=pool.filter(m=>!dexHas(m[0]));
  const src=(fresh.length && Math.random()<0.7)? fresh : pool;
  const m=src[Math.floor(Math.random()*src.length)] || pool[0];
  const shiny=Math.random()<(caughtBig? 0.06 : 0.03);
  return {m, name:m[0], id:m[3], type:m[2], grade:m[5], genus:m[4], shiny};
}

/* ---------- 🔴 포획 무대 (받아쓰기 프로그램의 포켓몬 GO 방식) ----------
 * 둘레의 색 고리가 작아졌다 커졌다 해요. 색 고리가 금색 고리 안일 때, 포켓몬 쪽으로 볼을 휙 던지면 잡혀요.
 * 희귀할수록 고리가 빠르고, 포켓몬이 좌우로 많이 움직여요. 볼 하나를 던질 때마다 1개씩 써요. */
const RING_COLOR={c:"#4ade80", r:"#facc15", l:"#fb923c", m:"#f97316", s:"#ef4444"};
const RING={ c:{thr:0.36,speed:2,acc:0,sway:0.28,swayMs:3200}, r:{thr:0.33,speed:2.4,acc:0.8,sway:0.38,swayMs:2700},
  l:{thr:0.3,speed:2.8,acc:1.5,sway:0.48,swayMs:2300}, m:{thr:0.29,speed:3,acc:1.8,sway:0.52,swayMs:2100}, s:{thr:0.27,speed:3.3,acc:2.2,sway:0.58,swayMs:1900} };
// 던지기 · 포획 장면은 assets/gocatch.js (받아쓰기 프로그램과 같은 파일)
function explore(){
  if(!(Number(W().balls)>0)){ toast("몬스터볼이 없어요. 오늘 공부를 마치면 받을 수 있어요","info"); return; }
  catchScene(rollWild());
}
function catchScene(q){
  document.querySelectorAll(".go-scene").forEach(x=>x.remove());
  const scene=document.createElement("div");
  document.body.appendChild(scene);
  document.body.classList.add("scene-open");
  scene.addEventListener("touchmove", e=>{ if(!e.target.closest(".go-result")) e.preventDefault(); }, {passive:false});
  const N=q.name, obj=josa(N,["을","를"]), subj=josa(N,["이","가"]);
  let g=null;
  const close=()=>{ if(g) g.stop(); document.body.classList.remove("scene-open"); scene.classList.add("out"); setTimeout(()=>scene.remove(),400); A().renderCards(); };
  scene.cleanupKeys=()=>{ if(g) g.stop(); };
  scene.className="go-scene gq-host";
  scene.innerHTML=`
    <div class="go-top"><span class="go-count" id="goBalls"></span><div class="go-name"><b>${eh(N)}</b>${gradeChip(q.grade,q.shiny)}</div>
      <button class="go-run" id="goRun">도망치기</button></div>
    <div class="go-banner" id="goBanner"><b>앗! 야생 ${eh(N)}${subj}</b><b>튀어나왔다!</b></div>
    <p class="go-msg" id="goMsg"></p>
    <p class="go-hint gq-hint" id="goHint">${matchMedia("(hover: hover) and (pointer: fine)").matches? "⌨️ 스페이스바를 누르고 · 화살표가 포켓몬을 가리킬 때 떼기" : "👆 볼을 잡고 포켓몬 쪽으로 휙! 색 고리가 작을 때"}</p>
    <div class="go-result" id="goResult" hidden></div>`;
  const $=s=>scene.querySelector(s);
  const paintBalls=()=>{ $("#goBalls").innerHTML=`<span class="mini-ball">${ballSvg}</span> ${Number(W().balls)||0}`; };
  paintBalls();
  $("#goRun").onclick=()=>close();
  g=GoCatch.create(scene, {art:artImg(q.m,q.shiny), grade:q.grade, shiny:q.shiny, legend:"lms".includes(q.grade), ring:RING[q.grade]||RING.c, color:RING_COLOR[q.grade]||"#4ade80",
    maxThrows:MAX_MISS, canThrow:()=>Number(W().balls)>0,
    onThrow:()=>{ W().balls=(Number(W().balls)||0)-1; save(); paintBalls(); $("#goHint").classList.add("gone"); },
    sfx, cry:()=>playCry(q.id)});
  scene.throwBall=h=>g.throwNow(h&&h.how? h.how : h&&h.force===false? {power:.5, dir:0} : {power:1.7, auto:true});   // 테스트용
  (async()=>{
    setTimeout(()=>{ $("#goBanner") && $("#goBanner").classList.add("gone"); }, 1500);
    const r=await g.start();
    const msg=$("#goMsg");
    if(r.caught){ msg.innerHTML=`<b class="yay-word">${eh(N)}${obj} 잡았다!</b>`; await wait(1300); msg.classList.add("fade"); return result(true, r); }
    msg.innerHTML=`<b class="miss-word">💨 ${eh(N)}${subj} 도망쳤다!</b>`; await wait(900);
    return result(false, r);
  })();
  async function result(ok, info){
    const box=$("#goResult");
    let isNew=false, rel=null;
    if(ok){
      isNew=!dexHas(N); if(isNew) dex().push(N);
      catches()[N]=(catches()[N]||0)+1;
      if(q.shiny && !(W().shinies||[]).includes(N)) W().shinies=[...(W().shinies||[]), N];
      await save();
      try{ await A().loadCatalog(); rel=A().related(N, q.shiny || "lms".includes(q.grade)); const r=await A().giveCard(A().CS.uid, rel.card, {pass:true}); A().CS.cards[rel.card.id]=r.card; rel.isNew=r.isNew; rel.pass=r.pass; }catch(e){ console.warn("관련 카드", e); }
    }
    const balls=Number(W().balls)||0;
    box.innerHTML= ok? `
      <p class="gr-title">🎉 ${eh(N)}${obj} 잡았다!</p>${info&&info.quality&&info.quality!=="none"? `<p class="gr-q ${info.quality}">${{nice:"Nice!",great:"Great!",excellent:"Excellent!"}[info.quality]} 던지기</p>`:""}
      <div class="gr-row"><div class="gr-card">${pokeCard(q.m,q.shiny)}</div>${rel? `<div class="gr-tcg">${A().cardFace(rel.card)}<small>${rel.how==="exact"?"🎯 "+eh(N)+" 카드!":rel.how==="family"?"👪 진화 가족 카드!":"✨ 비슷한 포켓몬 카드!"}</small></div>`:""}</div>
      <ul class="gr-list">
        ${isNew?`<li><span>📖 도감 새로 등록</span><b>NEW!</b></li>`:""}
        ${q.shiny?`<li><span>✨ 색이 다른 포켓몬</span><b>대박!</b></li>`:""}
        ${rel?`<li><span>🎴 ${A().CLS[rel.card.cls].icon} ${eh(rel.card.name)}</span><b>${rel.isNew?"NEW":"+1장"}</b></li>`:""}
        ${rel&&rel.pass?`<li><span>🎫 PC 이용권</span><b>${rel.pass.h}시간!</b></li>`:""}
        ${evoNext(N) && !canEvolve(N)? `<li><span>🧬 ${eh(evoNext(N))}까지</span><b>${evoDots(N)} ${catches()[N]}/${EVO_NEED}</b></li>`:""}
      </ul>
      ${canEvolve(N)?`<button class="ghost-btn evo-cta" id="evoNow">🧬 ${eh(N)} ${EVO_NEED}마리 모였어요! 눌러서 진화!</button>`:""}
      <div class="gr-btns">${balls>0?`<button class="gr-ok" id="again">🌿 한 마리 더 (볼 ${balls}개)</button>`:""}<button class="gr-ok ${balls>0?"sub":""}" id="done">확인</button></div>`
      : `<p class="gr-title miss">💨 ${eh(N)}${subj} 도망쳤어요</p>
      <p class="cd-note" style="margin:0">볼을 포켓몬 쪽으로 알맞은 세기로 휙! 색 고리가 작을 때 맞히면 Great · Excellent로 더 잘 잡혀요</p>
      <div class="gr-btns">${balls>0?`<button class="gr-ok" id="again">🌿 다시 찾기 (볼 ${balls}개)</button>`:""}<button class="gr-ok ${balls>0?"sub":""}" id="done">확인</button></div>`;
    box.hidden=false; scene.classList.add("res");
    requestAnimationFrame(()=>box.classList.add("in"));
    const ev=box.querySelector("#evoNow");
    if(ev) ev.onclick=async ()=>{ ev.remove(); const b2=await evolvePokemon(N); if(b2) box.querySelector(".gr-card").innerHTML=pokeCard(POKE_BY[b2]); };
    box.querySelector("#done").onclick=()=>{ sfx("pop"); close(); };
    const ag=box.querySelector("#again"); if(ag) ag.onclick=()=>{ sfx("pop"); scene.cleanupKeys(); scene.remove(); catchScene(rollWild()); };
  }
}
// 🎊 색종이 (작은 사각형이 흩날려요)
function confetti(){
  if(reduceMotion) return;
  const box=document.createElement("div"); box.className="go-confetti";
  const C=["#fde047","#f97316","#22c55e","#38bdf8","#a78bfa","#f472b6"];
  for(let i=0;i<40;i++){ const s=document.createElement("i");
    s.style.left=Math.random()*100+"%"; s.style.background=C[i%C.length];
    s.style.setProperty("--x",((Math.random()-.5)*160).toFixed(0)+"px"); s.style.setProperty("--r",(360+Math.random()*720).toFixed(0)+"deg");
    s.style.animationDelay=(Math.random()*.35).toFixed(2)+"s"; s.style.animationDuration=(1.6+Math.random()*1.1).toFixed(2)+"s";
    box.appendChild(s); }
  document.body.appendChild(box); setTimeout(()=>box.remove(),3300);
}

/* ----- 🎬 진화 장면 (포켓몬 · 카드 공용) ----- */
async function evoCinema({from, to, before, after, fromCry, toCry, card}){
  const el=document.createElement("div");
  el.className="evo-cine";
  el.innerHTML=`<div class="evo-rays"></div><div class="evo-stage${card?" card":""}"><div class="evo-a">${from}</div><div class="evo-b">${to}</div></div>
    <p class="evo-cap">${before}</p><div class="evo-flash"></div><button class="gr-ok evo-ok" hidden>와! 멋지다 👏</button>`;
  document.body.appendChild(el);
  const Aa=el.querySelector(".evo-a"), Bb=el.querySelector(".evo-b"), stage=el.querySelector(".evo-stage");
  await wait(30); el.classList.add("in");
  if(fromCry) playCry(fromCry);
  await wait(1500); el.classList.add("glow"); sfx("evolve");
  await wait(1000);
  let t=480, flip=false;
  while(t>45){ flip=!flip; Aa.style.opacity=flip?0:1; Bb.style.opacity=flip?1:0; stage.style.transform=`scale(${flip?1.08:0.94})`; if(flip) sfx("click"); await wait(t); t*=0.8; }
  Aa.style.opacity=0; Bb.style.opacity=1; stage.style.transform="";
  el.classList.add("burst"); sfx("catch");
  await wait(420);
  el.classList.remove("glow"); el.classList.add("reveal"); confetti();
  if(toCry) playCry(toCry);
  el.querySelector(".evo-cap").innerHTML=after;
  const ok=el.querySelector(".evo-ok");
  await wait(900); ok.hidden=false;
  await new Promise(r=>{ ok.onclick=r; });
  el.classList.add("out"); await wait(350); el.remove();
}
async function evolvePokemon(n){
  if(!canEvolve(n)) return null;
  const b=evoNext(n);
  catches()[n]-=EVO_NEED;
  catches()[b]=(catches()[b]||0)+1;
  if(!dexHas(b)) dex().push(b);
  await save();
  const ma=POKE_BY[n], mb=POKE_BY[b];
  await evoCinema({from:artImg(ma), to:artImg(mb), fromCry:ma[3], toCry:mb[3],
    before:`어라…? <b>${eh(n)}</b>의 모습이…!`, after:`축하해! <b>${eh(n)}</b>${josa(n,["은","는"])} <b>${eh(b)}</b>${ro(b)} 진화했다! 🎉`});
  return b;
}

window.PokeCatch={
  tabHTML, explore, evoCinema,
  toggleDex(){ dexOpen=!dexOpen; A().renderCards(); },
  dexBy(k){ dexBy=k; dexKey=null; dexMiss=false; A().renderCards(); },
  dexKey(k){ dexKey=dexBy==="gen"? Number(k) : k; dexMiss=false; A().renderCards(); },
  dexMiss(){ dexMiss=!dexMiss; A().renderCards(); },
  async claim(){
    const ds=A().today(), add=ballsReady(ds); if(add<=0) return;
    const w=W(); w.balls=(Number(w.balls)||0)+add; w.ballClaimed={...(w.ballClaimed||{}), [ds]:(Number((w.ballClaimed||{})[ds])||0)+add};
    const cut=fmt(addDays(new Date(),-14)); Object.keys(w.ballClaimed).forEach(k=>{ if(k<cut) delete w.ballClaimed[k]; });
    await save(); sfx("star"); toast(`🔴 몬스터볼 ${add}개를 받았어요!`,"cheer"); A().renderCards();
  },
  async evolve(n){ await evolvePokemon(n); A().renderCards(); },
  ready:()=>{ try{ return A().CS? ballsReady(A().today()) : 0; }catch(_){ return 0; } },
};

})();
