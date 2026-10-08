/* ============================================================
 *  📅 구글 캘린더 동기화 (우리집 학습플래너)
 *  - 플래너 → 구글: 할 일을 'OO 학습플래너' 캘린더에 종일 일정으로 (추가 · 수정 · 완료 · 삭제가 따라가요)
 *  - 구글 → 플래너: 내 구글 캘린더 일정(학원 · 약속 등)을 일정 · 할 일 화면에 읽기 전용으로
 *  - Google Identity Services 토큰(약 1시간) · 서버 없음: 앱을 열어 둔 동안 맞춰요
 *  - 설정: planner/{uid}/meta/gcal {on, cals:{구글계정:캘린더id}, showGoogle}
 *          이 기기에서 맞춘 기록: localStorage gcalS:{uid}:{캘린더id} {할일id:{h,d}}
 * ============================================================ */
(function(){
const CLIENT_ID="161378084495-m7nv283jfeib599eg7mkqn8pp28jtdm3.apps.googleusercontent.com";
const SCOPE="https://www.googleapis.com/auth/calendar";
const API="https://www.googleapis.com/calendar/v3";
const BACK=30, AHEAD=90;                                        // 전체 맞추기 범위 (오늘 기준 일)
const G={uid:null, cfg:null, cfgP:null, tok:null, exp:0, account:"", calId:"", needAuth:false, busy:false,
  queue:new Map(), gev:{}, gRange:"", gLoading:false, lastErr:""};
const esc=s=>(typeof window.esc==="function")? window.esc(s) : String(s==null?"":s);
const ls={ get(k,d){ try{ return JSON.parse(localStorage.getItem(k))||d; }catch(_){ return d; } }, set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(_){} } };
const cfgRef=uid=>db.collection("planner").doc(uid).collection("meta").doc("gcal");
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const plusDay=(ds,n)=>{ const [y,m,d]=ds.split("-").map(Number); return ymd(new Date(y,m-1,d+n)); };
const evId=tid=>"np"+Array.from(new TextEncoder().encode(String(tid))).map(b=>b.toString(16).padStart(2,"0")).join("");
const rerender=()=>{ try{ if(typeof render==="function") render(); }catch(_){} };

/* ----- 설정 불러오기 (보고 있는 플래너가 바뀌면 다시) ----- */
function load(uid){
  if(!uid) return Promise.resolve(null);
  if(G.uid===uid && G.cfgP) return G.cfgP;
  G.uid=uid; G.cfg=null; G.calId=""; G.queue.clear(); G.gev={}; G.gRange="";
  const t=ls.get("gcalTok",null); if(t && t.exp>Date.now()+60000){ G.tok=t.t; G.exp=t.exp; G.account=t.a||""; }
  G.cfgP=cfgRef(uid).get().then(d=>{ if(G.uid!==uid) return null; G.cfg=d.exists? d.data() : {on:false}; pickCal(); rerender(); refreshSettings(); if(G.cfg.on && tokOk()) fullSync().catch(()=>{}); return G.cfg; })
    .catch(e=>{ console.warn("구글 캘린더 설정", e); G.cfg={on:false}; return G.cfg; });
  return G.cfgP;
}
function refreshSettings(){ try{ if(document.querySelector("#drawerRoot #gcalSec") && typeof drawSettings==="function") drawSettings(); }catch(_){} }
function pickCal(){ G.calId=(G.cfg && G.cfg.cals && G.account)? (G.cfg.cals[G.account]||"") : ""; }
const on=()=>!!(G.cfg && G.cfg.on);
const tokOk=()=>!!(G.tok && G.exp>Date.now()+30000);

/* ----- 🔑 Google 로그인 (버튼을 눌렀을 때만 팝업) ----- */
let gisP=null, tokenClient=null;
function loadGIS(){
  if(window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  if(gisP) return gisP;
  gisP=new Promise((ok,no)=>{ const s=document.createElement("script"); s.src="https://accounts.google.com/gsi/client"; s.async=true; s.onload=()=>ok(); s.onerror=()=>{ gisP=null; no(new Error("Google 로그인 도구를 불러오지 못했어요")); }; document.head.appendChild(s); });
  return gisP;
}
function getToken(consent){
  return loadGIS().then(()=>new Promise((ok,no)=>{
    tokenClient=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID, scope:SCOPE,
      callback:r=>{ if(r && r.access_token){ G.tok=r.access_token; G.exp=Date.now()+(Number(r.expires_in)||3600)*1000; G.needAuth=false; ok(r); } else no(new Error((r&&r.error)||"로그인 취소")); },
      error_callback:e=>no(new Error((e&&e.type)||"로그인 취소"))});
    tokenClient.requestAccessToken({prompt: consent? "consent" : ""});
  }));
}
async function api(method, path, body, okCodes){
  if(!tokOk()){ G.needAuth=true; throw Object.assign(new Error("auth"), {code:401}); }
  const r=await fetch(API+path, {method, headers:{Authorization:"Bearer "+G.tok, ...(body?{"Content-Type":"application/json"}:{})}, body:body?JSON.stringify(body):undefined});
  if(r.status===401){ G.tok=null; G.needAuth=true; ls.set("gcalTok",null); throw Object.assign(new Error("auth"), {code:401}); }
  if(!r.ok && !(okCodes||[]).includes(r.status)){ let m=""; try{ m=(await r.json()).error.message; }catch(_){} throw Object.assign(new Error(m||("HTTP "+r.status)), {code:r.status}); }
  return r.status===204? null : r.json().catch(()=>null);
}

/* ----- 학습플래너 캘린더 찾기 · 만들기 ----- */
async function ensureCalendar(){
  const pri=await api("GET","/calendars/primary");
  G.account=(pri && pri.id)||"";
  ls.set("gcalTok", {t:G.tok, exp:G.exp, a:G.account});
  const cals={...((G.cfg&&G.cfg.cals)||{})};
  let id=cals[G.account];
  if(id){ try{ await api("GET","/calendars/"+encodeURIComponent(id)); }catch(e){ if(e.code===404||e.code===403) id=""; else throw e; } }
  if(!id){
    const who=(state.ownerName||state.profile&&state.profile.name||"").trim();
    const c=await api("POST","/calendars",{summary:`📚 ${who? who+" " : ""}학습플래너`, description:"우리집 학습플래너에서 자동으로 맞추는 캘린더예요. 여기서 고친 내용은 플래너에서 다시 덮어써요.", timeZone:"Asia/Seoul"});
    id=c.id;
  }
  cals[G.account]=id;
  G.cfg={...(G.cfg||{}), on:true, cals, showGoogle:G.cfg&&G.cfg.showGoogle===false? false : true, at:Date.now(), by:state.user.uid};
  await cfgRef(G.uid).set(G.cfg);
  G.calId=id;
}

/* ----- 할 일 → 구글 일정 ----- */
function toEvent(t){
  const su=(typeof subjById==="function")? subjById(t.subjectId) : null, tb=(typeof tbById==="function")? tbById(t.textbookId) : null;
  const stars=n=>n==null||n===""? "" : "★".repeat(n)+"☆".repeat(5-n);
  const title=`${t.done?"✅":"📘"} ${su?su.name:"학습"}${t.unit?" · "+t.unit:""} (${Number(t.plannedMin)||0}분)`;
  const lines=[tb&&`교재: ${tb.name}`, t.method&&`방법: ${t.method}${t.episode?" "+t.episode:""}`, t.plannedNote&&`목표: ${t.plannedNote}`,
    t.done&&`완료 · ${Number(t.actualMin)||0}분${t.doneStars!=null?` · 이행 ${stars(t.doneStars)}`:""}${t.underStars!=null?` · 이해 ${stars(t.underStars)}`:""}`,
    t.understood&&`메모: ${t.understood}`, t.parentComment&&`부모 코멘트: ${t.parentComment}`].filter(Boolean);
  lines.push("", "우리집 학습플래너에서 자동으로 맞춘 일정이에요 (https://nkdddd.github.io/nogang/)");
  return {summary:title.slice(0,250), description:lines.join("\n"), start:{date:t.date}, end:{date:plusDay(t.date,1)},
    transparency:"transparent", status:"confirmed", reminders:{useDefault:false, overrides:[]}, colorId:t.done?"10":undefined,
    extendedProperties:{private:{np:"1", task:String(t.id)}}};
}
const hashOf=t=>{ const e=toEvent(t); return JSON.stringify([e.summary,e.description,e.start.date,e.colorId||""]); };
const synced=()=>ls.get(`gcalS:${G.uid}:${G.calId}`, {});
const saveSynced=m=>ls.set(`gcalS:${G.uid}:${G.calId}`, m);
async function upsert(t){
  const id=evId(t.id), path=`/calendars/${encodeURIComponent(G.calId)}/events/${id}`, body=toEvent(t);
  try{ await api("PUT", path, body); }
  catch(e){ if(e.code===404) await api("POST", `/calendars/${encodeURIComponent(G.calId)}/events`, {...body, id}); else throw e; }
  const m=synced(); m[t.id]={h:hashOf(t), d:t.date}; saveSynced(m);
}
async function removeEv(tid){
  await api("DELETE", `/calendars/${encodeURIComponent(G.calId)}/events/${evId(tid)}`, null, [404,410]);
  const m=synced(); delete m[tid]; saveSynced(m);
}

/* ----- 바뀐 것 모아서 보내기 ----- */
function enqueue(uid, op, t){
  if(uid!==G.uid || !on()) return;
  G.queue.set(op==="del"? t : t.id, op==="del"? {op:"del", id:t} : {op:"up", t});
  if(!tokOk()){ G.needAuth=true; return; }
  clearTimeout(enqueue.tm); enqueue.tm=setTimeout(()=>flush().catch(()=>{}), 600);
}
async function flush(){
  if(G.busy || !on() || !G.calId || !tokOk()) return;
  G.busy=true;
  try{
    while(G.queue.size){
      const [k,job]=G.queue.entries().next().value;
      try{ if(job.op==="del") await removeEv(job.id); else await upsert(job.t); G.queue.delete(k); }
      catch(e){ if(e.code===401){ rerender(); break; } G.lastErr=e.message; G.queue.delete(k); console.warn("구글 캘린더", e); }
    }
  }finally{ G.busy=false; }
}
// 할 일 화면이 새로 읽힐 때마다: 이 기기에서 맞춘 기록과 다르면 보내요 (다른 기기에서 바꾼 것도 따라가요)
function onTasks(uid, tasks, start, end){
  if(uid!==G.uid || !on() || !G.calId) return;
  const m=synced(), ids=new Set();
  tasks.forEach(t=>{ ids.add(String(t.id)); const s=m[t.id]; if(!s || s.h!==hashOf(t)) G.queue.set(t.id, {op:"up", t}); });
  Object.entries(m).forEach(([id,s])=>{ if(s.d>=start && s.d<=end && !ids.has(id)) G.queue.set(id, {op:"del", id}); });
  if(G.queue.size){ if(tokOk()) flush().catch(()=>{}); else G.needAuth=true; }
}
// 전체 맞추기: 오늘 -30일 ~ +90일 (구글에서 지운 일정도 다시 만들고, 플래너에 없는 일정은 지워요)
async function fullSync(){
  if(!on() || !tokOk()) return;
  if(!G.calId) await ensureCalendar();
  const today=ymd(new Date()), from=plusDay(today,-BACK), to=plusDay(today,AHEAD);
  const snap=await db.collection("planner").doc(G.uid).collection("tasks").where("date",">=",from).where("date","<=",to).get();
  const tasks=snap.docs.map(d=>({id:d.id, ...d.data()}));
  const evs=[]; let pageToken="";
  do{
    const q=new URLSearchParams({privateExtendedProperty:"np=1", timeMin:from+"T00:00:00+09:00", timeMax:plusDay(to,1)+"T00:00:00+09:00", singleEvents:"true", maxResults:"2500", showDeleted:"false"});
    if(pageToken) q.set("pageToken", pageToken);
    const r=await api("GET", `/calendars/${encodeURIComponent(G.calId)}/events?${q}`);
    (r.items||[]).forEach(e=>evs.push(e)); pageToken=r.nextPageToken||"";
  }while(pageToken);
  const have={}; evs.forEach(e=>{ const tid=e.extendedProperties&&e.extendedProperties.private&&e.extendedProperties.private.task; if(tid) have[tid]=e; });
  const m=synced(), ids=new Set(tasks.map(t=>String(t.id)));
  tasks.forEach(t=>{ const e=have[t.id]; const want=toEvent(t);
    if(!e || e.summary!==want.summary || (e.description||"")!==want.description || (e.start&&e.start.date)!==t.date) G.queue.set(t.id, {op:"up", t});
    else m[t.id]={h:hashOf(t), d:t.date}; });
  saveSynced(m);
  Object.keys(have).forEach(tid=>{ if(!ids.has(tid)) G.queue.set(tid, {op:"del", id:tid}); });
  await flush();
  G.lastSync=Date.now();
}

/* ----- 구글 → 플래너: 내 구글 캘린더 일정 보기 (읽기 전용) ----- */
function want(from, to){
  if(!on() || !tokOk() || !G.cfg || G.cfg.showGoogle===false) return;
  const key=from+"~"+to; if(G.gRange===key || G.gLoading) return;
  G.gLoading=true;
  (async()=>{
    const list=await api("GET","/users/me/calendarList?minAccessRole=reader&maxResults=50");
    const cals=(list.items||[]).filter(c=>c.selected!==false && c.id!==G.calId && !(G.cfg.cals&&Object.values(G.cfg.cals).includes(c.id))).slice(0,8);
    const out={};
    for(const c of cals){
      const q=new URLSearchParams({timeMin:from+"T00:00:00+09:00", timeMax:plusDay(to,1)+"T00:00:00+09:00", singleEvents:"true", orderBy:"startTime", maxResults:"250"});
      const r=await api("GET", `/calendars/${encodeURIComponent(c.id)}/events?${q}`).catch(()=>({items:[]}));
      (r.items||[]).forEach(e=>{
        if(e.status==="cancelled") return;
        const allDay=!!(e.start&&e.start.date), s=allDay? e.start.date : (e.start.dateTime||"").slice(0,10);
        const eEnd=allDay? plusDay(e.end.date,-1) : (e.end&&e.end.dateTime||"").slice(0,10)||s;
        for(let d=s; d<=eEnd && d<=to; d=plusDay(d,1)){ if(d<from) continue;
          (out[d]=out[d]||[]).push({title:e.summary||"(제목 없음)", time:allDay? "" : (e.start.dateTime||"").slice(11,16), color:c.backgroundColor||"#94A3B8", link:e.htmlLink}); }
      });
    }
    Object.values(out).forEach(L=>L.sort((a,b)=>(a.time||"").localeCompare(b.time||"")));
    G.gev=out; G.gRange=key;
  })().catch(e=>{ if(e.code!==401) console.warn("구글 일정", e); G.gRange=key; }).finally(()=>{ G.gLoading=false; rerender(); });
}
function dayHTML(ds, compact){
  const L=(G.gev||{})[ds]; if(!L || !L.length || !on() || (G.cfg&&G.cfg.showGoogle===false)) return "";
  if(compact) return L.map(e=>`<div class="gc-ev" style="--gc:${e.color}" title="구글 캘린더 일정">${e.time?`<b>${esc(e.time)}</b> `:""}${esc(e.title)}</div>`).join("");
  return `<div class="gc-day"><div class="gc-h">📅 구글 캘린더</div>${L.map(e=>`<div class="gc-ev" style="--gc:${e.color}">${e.time?`<b>${esc(e.time)}</b> `:"<b>종일</b> "}${esc(e.title)}</div>`).join("")}</div>`;
}
// 일정 탭 위 작은 상태 칩
function chipHTML(){
  if(!on()) return "";
  if(!tokOk()) return `<button class="gc-chip warn" onclick="GCal.reauth()">📅 구글 캘린더 다시 연결${G.queue.size?` · ${G.queue.size}개 대기`:""}</button>`;
  return `<button class="gc-chip" onclick="GCal.syncNow()">📅 구글 캘린더 연결됨${G.busy||G.queue.size?" · 맞추는 중…":""}</button>`;
}
function settingsHTML(){
  if(!G.cfg) return `<div class="cd-note">불러오는 중…</div>`;
  const who=state.viewingChild? `${esc(state.ownerName)}의 플래너` : "내 플래너";
  if(!on()) return `<div class="gc-set"><p>${who}의 할 일을 <b>구글 캘린더</b>에 자동으로 넣고, 구글 캘린더 일정(학원 · 약속)을 플래너 일정에서 함께 봐요.</p>
      <button class="pay-btn" style="width:100%" onclick="GCal.connect()">📅 Google 계정으로 연결</button>
      <div class="cd-note">'${who}' 전용 캘린더가 새로 생겨요. 할 일은 종일 일정으로 들어가고 완료하면 ✅로 바뀌어요.</div></div>`;
  return `<div class="gc-set">
      <div class="gc-row"><span>상태</span><b>${tokOk()? `✅ 연결됨${G.account?` · ${esc(G.account)}`:""}` : "⏸ 다시 연결이 필요해요 (1시간마다)"}</b></div>
      <div class="gc-row"><span>구글 일정 함께 보기</span><label class="gc-sw"><input type="checkbox" ${G.cfg.showGoogle===false?"":"checked"} onchange="GCal.setShow(this.checked)"><i></i></label></div>
      ${G.lastErr?`<div class="cd-note" style="color:#E5484D">최근 오류: ${esc(G.lastErr)}</div>`:""}
      <div class="me-row" style="margin-top:8px">${tokOk()? `<button class="ghost-btn" onclick="GCal.syncNow()">🔄 지금 맞추기</button>` : `<button class="fam-btn" onclick="GCal.reauth()">🔑 다시 연결</button>`}
        <button class="ghost-btn" onclick="GCal.disconnect()">연결 끊기</button></div>
      <div class="cd-note">오늘 기준 ${BACK}일 전 ~ ${AHEAD}일 뒤의 할 일을 맞춰요. 앱을 열어 둔 동안 바로 반영되고, 구글 로그인은 약 1시간마다 다시 눌러야 해요.</div></div>`;
}

const ui=async fn=>{ try{ await fn(); }catch(e){ console.error(e); if(e.code!==401) alert("구글 캘린더: "+(e.message||e)); } rerender(); refreshSettings(); };
window.GCal={
  load, onTasks, want, dayHTML, chipHTML, settingsHTML, get state(){ return G; },
  onSave(uid,t){ enqueue(uid,"up",t); }, onDelete(uid,id){ enqueue(uid,"del",id); },
  connect(){ return ui(async()=>{ await load(state.ownerUid); await getToken(true); await ensureCalendar(); toast("📅 구글 캘린더에 연결했어요. 할 일을 넣는 중…","good"); await fullSync(); toast("📅 구글 캘린더와 맞췄어요","good"); }); },
  reauth(){ return ui(async()=>{ await getToken(false); if(on()){ await ensureCalendar(); await fullSync(); } G.gRange=""; toast("📅 구글 캘린더와 맞췄어요","good"); }); },
  syncNow(){ return ui(async()=>{ if(!tokOk()) await getToken(false); await fullSync(); G.gRange=""; toast("📅 구글 캘린더와 맞췄어요","good"); }); },
  setShow(v){ return ui(async()=>{ G.cfg={...G.cfg, showGoogle:!!v}; await cfgRef(G.uid).set(G.cfg); G.gRange=""; }); },
  disconnect(){ if(!confirm("구글 캘린더 연결을 끊을까요?\n(이미 만든 구글 일정은 그대로 남아요. 지우려면 구글 캘린더에서 학습플래너 캘린더를 삭제하세요)")) return;
    return ui(async()=>{ G.cfg={...G.cfg, on:false}; await cfgRef(G.uid).set(G.cfg); G.queue.clear(); G.gev={}; if(G.tok && window.google&&google.accounts&&google.accounts.oauth2) google.accounts.oauth2.revoke(G.tok, ()=>{}); G.tok=null; ls.set("gcalTok",null); }); },
};
})();
