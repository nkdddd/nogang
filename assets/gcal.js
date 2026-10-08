/* ============================================================
 *  📅 구글 캘린더 동기화 (우리집 학습플래너)
 *  - 연결할 구글 이메일을 물어보고 그 계정으로 로그인해 추가해요 (여러 이메일 가능: 엄마 · 아이 …)
 *  - 플래너 → 구글: 할 일을 'OO 학습플래너' 캘린더에 종일 일정으로 (추가 · 수정 · 완료 · 삭제가 따라가요)
 *  - 구글 → 플래너: 연결한 계정의 구글 캘린더 일정(학원 · 약속 등)을 일정 · 할 일 화면에 읽기 전용으로
 *  - Google Identity Services 토큰(약 1시간, 이메일마다) · 서버 없음: 앱을 열어 둔 동안 맞춰요
 *  - 설정: planner/{uid}/meta/gcal {on, cals:{이메일:캘린더id}, showGoogle}
 *          이 기기의 토큰: localStorage gcalToks {이메일:{t,exp}} · 맞춘 기록: gcalS:{uid}:{캘린더id} {할일id:{h,d}}
 * ============================================================ */
(function(){
const CLIENT_ID="161378084495-m7nv283jfeib599eg7mkqn8pp28jtdm3.apps.googleusercontent.com";
const SCOPE="https://www.googleapis.com/auth/calendar";
const API="https://www.googleapis.com/calendar/v3";
const BACK=30, AHEAD=90;                                        // 전체 맞추기 범위 (오늘 기준 일)
const G={uid:null, cfg:null, cfgP:null, busy:false, queue:new Map(), gev:{}, gRange:"", gLoading:false, lastErr:""};
const esc=s=>(typeof window.esc==="function")? window.esc(s) : String(s==null?"":s);
const ls={ get(k,d){ try{ return JSON.parse(localStorage.getItem(k))||d; }catch(_){ return d; } }, set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(_){} } };
const cfgRef=uid=>db.collection("planner").doc(uid).collection("meta").doc("gcal");
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const plusDay=(ds,n)=>{ const [y,m,d]=ds.split("-").map(Number); return ymd(new Date(y,m-1,d+n)); };
const evId=tid=>"np"+Array.from(new TextEncoder().encode(String(tid))).map(b=>b.toString(16).padStart(2,"0")).join("");
const rerender=()=>{ try{ if(typeof render==="function") render(); }catch(_){} };
const norm=e=>String(e||"").trim().toLowerCase();

/* ----- 이메일별 토큰 ----- */
const toks=()=>ls.get("gcalToks", {});
const tokOf=email=>{ const t=toks()[norm(email)]; return t && t.exp>Date.now()+30000? t.t : null; };
const setTok=(email,t,exp)=>{ const m=toks(); if(t) m[norm(email)]={t,exp}; else delete m[norm(email)]; ls.set("gcalToks", m); };
const accounts=()=>Object.keys((G.cfg&&G.cfg.cals)||{});
const live=()=>accounts().filter(tokOf);                       // 지금 토큰이 있는 이메일
const stale=()=>accounts().filter(e=>!tokOf(e));
const on=()=>!!(G.cfg && G.cfg.on && accounts().length);

/* ----- 설정 불러오기 (보고 있는 플래너가 바뀌면 다시) ----- */
function load(uid){
  if(!uid) return Promise.resolve(null);
  if(G.uid===uid && G.cfgP) return G.cfgP;
  G.uid=uid; G.cfg=null; G.queue.clear(); G.gev={}; G.gRange="";
  G.cfgP=cfgRef(uid).get().then(d=>{ if(G.uid!==uid) return null; G.cfg=d.exists? d.data() : {on:false}; rerender(); refreshSettings();
      if(on()) loadGIS().catch(()=>{});                       // 다시 연결 버튼을 누르자마자 로그인 창이 뜨도록 미리
      if(on() && live().length) fullSyncAll().catch(()=>{}); return G.cfg; })
    .catch(e=>{ console.warn("구글 캘린더 설정", e); G.cfg={on:false}; return G.cfg; });
  return G.cfgP;
}
function refreshSettings(){ try{ if(document.querySelector("#drawerRoot #gcalSec") && typeof drawSettings==="function") drawSettings(); }catch(_){} }

/* ----- 🔑 Google 로그인: 입력한 이메일 계정으로 (버튼을 눌렀을 때만 팝업) ----- */
let gisP=null;
function loadGIS(){
  if(window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  if(gisP) return gisP;
  gisP=new Promise((ok,no)=>{ const s=document.createElement("script"); s.src="https://accounts.google.com/gsi/client"; s.async=true; s.onload=()=>ok(); s.onerror=()=>{ gisP=null; no(new Error("Google 로그인 도구를 불러오지 못했어요")); }; document.head.appendChild(s); });
  return gisP;
}
function getToken(email, consent){
  return loadGIS().then(()=>new Promise((ok,no)=>{
    const c=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID, scope:SCOPE, hint:email||undefined,
      callback:r=>{ if(r && r.access_token) ok({t:r.access_token, exp:Date.now()+(Number(r.expires_in)||3600)*1000}); else no(new Error((r&&r.error)||"로그인 취소")); },
      error_callback:e=>no(new Error((e&&e.type)||"로그인 취소"))});
    c.requestAccessToken({prompt: consent? "consent" : "", hint:email||undefined, login_hint:email||undefined});
  }));
}
async function api(email, method, path, body, okCodes, rawTok){
  const tk=rawTok||tokOf(email);
  if(!tk) throw Object.assign(new Error("auth"), {code:401});
  const r=await fetch(API+path, {method, headers:{Authorization:"Bearer "+tk, ...(body?{"Content-Type":"application/json"}:{})}, body:body?JSON.stringify(body):undefined});
  if(r.status===401){ if(!rawTok) setTok(email,null); throw Object.assign(new Error("auth"), {code:401}); }
  if(!r.ok && !(okCodes||[]).includes(r.status)){ let m=""; try{ m=(await r.json()).error.message; }catch(_){} throw Object.assign(new Error(m||("HTTP "+r.status)), {code:r.status}); }
  return r.status===204? null : r.json().catch(()=>null);
}

/* ----- 학습플래너 캘린더 찾기 · 만들기 (이메일마다 하나) ----- */
async function ensureCalendar(email){
  const cals={...((G.cfg&&G.cfg.cals)||{})};
  let id=cals[email];
  if(id){ try{ await api(email,"GET","/calendars/"+encodeURIComponent(id)); }catch(e){ if(e.code===404||e.code===403) id=""; else throw e; } }
  if(!id){
    const who=(state.ownerName||state.profile&&state.profile.name||"").trim();
    const c=await api(email,"POST","/calendars",{summary:`📚 ${who? who+" " : ""}학습플래너`, description:"우리집 학습플래너에서 자동으로 맞추는 캘린더예요. 여기서 고친 내용은 플래너에서 다시 덮어써요.", timeZone:"Asia/Seoul"});
    id=c.id;
  }
  cals[email]=id;
  G.cfg={...(G.cfg||{}), on:true, cals, showGoogle:G.cfg&&G.cfg.showGoogle===false? false : true, at:Date.now(), by:state.user.uid};
  await cfgRef(G.uid).set(G.cfg);
  return id;
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
const calOf=email=>(G.cfg&&G.cfg.cals||{})[email];
const sKey=email=>`gcalS:${G.uid}:${calOf(email)}`;
const synced=email=>ls.get(sKey(email), {});
const saveSynced=(email,m)=>ls.set(sKey(email), m);
async function upsert(email, t){
  const cal=encodeURIComponent(calOf(email)), id=evId(t.id), body=toEvent(t);
  try{ await api(email,"PUT", `/calendars/${cal}/events/${id}`, body); }
  catch(e){ if(e.code===404) await api(email,"POST", `/calendars/${cal}/events`, {...body, id}); else throw e; }
  const m=synced(email); m[t.id]={h:hashOf(t), d:t.date}; saveSynced(email,m);
}
async function removeEv(email, tid){
  await api(email,"DELETE", `/calendars/${encodeURIComponent(calOf(email))}/events/${evId(tid)}`, null, [404,410]);
  const m=synced(email); delete m[tid]; saveSynced(email,m);
}

/* ----- 바뀐 것 모아서 보내기 (토큰이 있는 이메일 모두에) ----- */
function enqueue(uid, op, t){
  if(uid!==G.uid || !on()) return;
  G.queue.set(op==="del"? t : t.id, op==="del"? {op:"del", id:t} : {op:"up", t});
  clearTimeout(enqueue.tm); enqueue.tm=setTimeout(()=>flush().catch(()=>{}), 600);
}
async function flush(){
  if(G.busy || !on() || !live().length) return;
  G.busy=true;
  try{
    while(G.queue.size){
      const [k,job]=G.queue.entries().next().value;
      for(const email of live()){
        try{ if(job.op==="del") await removeEv(email, job.id); else await upsert(email, job.t); }
        catch(e){ if(e.code!==401){ G.lastErr=e.message; console.warn("구글 캘린더", email, e); } }
      }
      G.queue.delete(k);                                      // 토큰이 없던 이메일은 다시 연결할 때 전체 맞추기로 따라가요
    }
  }finally{ G.busy=false; rerender(); }
}
// 할 일 화면이 새로 읽힐 때마다: 이 기기에서 맞춘 기록과 다르면 보내요 (다른 기기에서 바꾼 것도 따라가요)
function onTasks(uid, tasks, start, end){
  if(uid!==G.uid || !on()) return;
  for(const email of live()){
    const m=synced(email), ids=new Set();
    tasks.forEach(t=>{ ids.add(String(t.id)); const s=m[t.id]; if(!s || s.h!==hashOf(t)) G.queue.set(t.id, {op:"up", t}); });
    Object.entries(m).forEach(([id,s])=>{ if(s.d>=start && s.d<=end && !ids.has(id)) G.queue.set(id, {op:"del", id}); });
  }
  if(G.queue.size) flush().catch(()=>{});
}
// 전체 맞추기 (한 이메일): 오늘 -30일 ~ +90일. 구글에서 지운 일정도 다시 만들고, 플래너에 없는 일정은 지워요
async function fullSync(email){
  if(!tokOf(email)) return;
  if(!calOf(email)) await ensureCalendar(email);
  const cal=encodeURIComponent(calOf(email)), today=ymd(new Date()), from=plusDay(today,-BACK), to=plusDay(today,AHEAD);
  const snap=await db.collection("planner").doc(G.uid).collection("tasks").where("date",">=",from).where("date","<=",to).get();
  const tasks=snap.docs.map(d=>({id:d.id, ...d.data()}));
  const evs=[]; let pageToken="";
  do{
    const q=new URLSearchParams({privateExtendedProperty:"np=1", timeMin:from+"T00:00:00+09:00", timeMax:plusDay(to,1)+"T00:00:00+09:00", singleEvents:"true", maxResults:"2500", showDeleted:"false"});
    if(pageToken) q.set("pageToken", pageToken);
    const r=await api(email,"GET", `/calendars/${cal}/events?${q}`);
    (r.items||[]).forEach(e=>evs.push(e)); pageToken=r.nextPageToken||"";
  }while(pageToken);
  const have={}; evs.forEach(e=>{ const tid=e.extendedProperties&&e.extendedProperties.private&&e.extendedProperties.private.task; if(tid) have[tid]=e; });
  const m=synced(email), ids=new Set(tasks.map(t=>String(t.id)));
  for(const t of tasks){ const e=have[t.id], w=toEvent(t);
    if(!e || e.summary!==w.summary || (e.description||"")!==w.description || (e.start&&e.start.date)!==t.date){
      try{ await upsert(email, t); }catch(err){ if(err.code===401) throw err; G.lastErr=err.message; } }
    else m[t.id]={h:hashOf(t), d:t.date}; }
  const m2={...synced(email), ...m}; saveSynced(email, m2);
  for(const tid of Object.keys(have)) if(!ids.has(tid)){ try{ await removeEv(email, tid); }catch(err){ if(err.code===401) throw err; } }
}
async function fullSyncAll(){ for(const email of live()) await fullSync(email); G.gRange=""; rerender(); }

/* ----- 구글 → 플래너: 연결한 계정의 구글 캘린더 일정 보기 (읽기 전용) ----- */
function want(from, to){
  if(!on() || !live().length || G.cfg.showGoogle===false) return;
  const key=from+"~"+to+"|"+live().join(","); if(G.gRange===key || G.gLoading) return;
  G.gLoading=true;
  (async()=>{
    const out={}, mine=new Set(Object.values(G.cfg.cals||{})), seen=new Set();
    for(const email of live()){
      const list=await api(email,"GET","/users/me/calendarList?minAccessRole=reader&maxResults=50").catch(()=>({items:[]}));
      const cals=(list.items||[]).filter(c=>c.selected!==false && !mine.has(c.id) && !seen.has(c.id)).slice(0,8);
      for(const c of cals){
        seen.add(c.id);
        const q=new URLSearchParams({timeMin:from+"T00:00:00+09:00", timeMax:plusDay(to,1)+"T00:00:00+09:00", singleEvents:"true", orderBy:"startTime", maxResults:"250"});
        const r=await api(email,"GET", `/calendars/${encodeURIComponent(c.id)}/events?${q}`).catch(()=>({items:[]}));
        (r.items||[]).forEach(e=>{
          if(e.status==="cancelled" || !e.start) return;
          const allDay=!!e.start.date, s=allDay? e.start.date : (e.start.dateTime||"").slice(0,10);
          const eEnd=allDay? plusDay(e.end.date,-1) : ((e.end&&e.end.dateTime)||"").slice(0,10)||s;
          for(let d=s; d<=eEnd && d<=to; d=plusDay(d,1)){ if(d<from) continue;
            (out[d]=out[d]||[]).push({title:e.summary||"(제목 없음)", time:allDay? "" : (e.start.dateTime||"").slice(11,16), color:c.backgroundColor||"#94A3B8"}); }
        });
      }
    }
    Object.values(out).forEach(L=>L.sort((a,b)=>(a.time||"").localeCompare(b.time||"")));
    G.gev=out; G.gRange=key;
  })().catch(e=>{ console.warn("구글 일정", e); G.gRange=key; }).finally(()=>{ G.gLoading=false; rerender(); });
}
function dayHTML(ds, compact){
  const L=(G.gev||{})[ds]; if(!L || !L.length || !on() || G.cfg.showGoogle===false) return "";
  if(compact) return L.map(e=>`<div class="gc-ev" style="--gc:${e.color}" title="구글 캘린더 일정">${e.time?`<b>${esc(e.time)}</b> `:""}${esc(e.title)}</div>`).join("");
  return `<div class="gc-day"><div class="gc-h">📅 구글 캘린더</div>${L.map(e=>`<div class="gc-ev" style="--gc:${e.color}">${e.time?`<b>${esc(e.time)}</b> `:"<b>종일</b> "}${esc(e.title)}</div>`).join("")}</div>`;
}
// 일정 탭 위 작은 상태 칩
function chipHTML(){
  if(!on()) return "";
  const st=stale();
  if(st.length) return `<button class="gc-chip warn" onclick="GCal.reauth('${esc(st[0])}')">📅 다시 연결 · ${esc(st[0])}${st.length>1?` 외 ${st.length-1}`:""}</button>`;
  return `<button class="gc-chip" onclick="GCal.syncNow()">📅 구글 캘린더 ${accounts().length}개 연결됨${G.busy||G.queue.size?" · 맞추는 중…":""}</button>`;
}
function settingsHTML(){
  loadGIS().catch(()=>{});
  if(!G.cfg) return `<div class="cd-note">불러오는 중…</div>`;
  const who=state.viewingChild? `${esc(state.ownerName)}의 플래너` : "내 플래너";
  const list=accounts();
  return `<div class="gc-set">
      <p>${who}의 할 일을 <b>구글 캘린더</b>에 자동으로 넣고, 그 계정의 구글 일정(학원 · 약속)을 플래너 일정에서 함께 봐요.</p>
      ${list.map(e=>{ const ok=!!tokOf(e); return `<div class="gc-acc"><span class="gc-dot ${ok?"ok":""}"></span><div style="flex:1;min-width:0"><b>${esc(e)}</b><small>${ok?"연결됨":"다시 연결이 필요해요 (1시간마다)"}</small></div>
          ${ok? `<button class="ghost-btn" onclick="GCal.syncNow('${esc(e)}')">🔄</button>` : `<button class="fam-btn" onclick="GCal.reauth('${esc(e)}')">연결</button>`}
          <button class="ghost-btn" onclick="GCal.remove('${esc(e)}')">빼기</button></div>`; }).join("")}
      <button class="pay-btn" style="width:100%;margin-top:8px" onclick="GCal.add()">＋ 연결할 구글 이메일 추가</button>
      ${list.length? `<div class="gc-row" style="margin-top:8px"><span>구글 일정 함께 보기</span><label class="gc-sw"><input type="checkbox" ${G.cfg.showGoogle===false?"":"checked"} onchange="GCal.setShow(this.checked)"><i></i></label></div>` : ""}
      ${G.lastErr?`<div class="cd-note" style="color:#E5484D">최근 오류: ${esc(G.lastErr)}</div>`:""}
      <div class="cd-note">이메일마다 '${who}' 전용 캘린더가 생겨요. 할 일은 종일 일정으로 들어가고 완료하면 ✅로 바뀌어요. 오늘 기준 ${BACK}일 전 ~ ${AHEAD}일 뒤를 맞추고, 구글 로그인은 약 1시간마다 다시 눌러야 해요.</div></div>`;
}

/* ----- 📧 연결할 이메일 묻기 ----- */
function askEmail(){
  return new Promise(res=>{
    const root=document.getElementById("modalRoot");
    const sugg=[...new Set([state.user&&state.user.email, ...accounts()].filter(Boolean).map(norm))].filter(e=>!accounts().includes(e) && /@gmail\.com$|@googlemail\.com$/.test(e));
    root.innerHTML=`<div class="overlay pop-ov"><div class="modal pop">
      <div class="modal-head"><h3>📅 구글 캘린더 연결</h3><button class="icon-btn sm" id="gcX">✕</button></div>
      <div class="modal-body">
        <div class="ds-q" style="margin-top:0">어느 구글 계정의 캘린더에 넣을까요?</div>
        <input class="inp" id="gcMail" type="email" inputmode="email" autocomplete="email" placeholder="예: mom@gmail.com" value="${esc(sugg[0]||"")}">
        <div class="cd-note">다음 화면에서 이 이메일로 구글 로그인을 해요. 엄마 · 아이처럼 여러 이메일을 하나씩 추가할 수 있어요.</div>
        <div class="cd-note" id="gcErr" style="color:#E5484D"></div>
      </div>
      <div class="modal-foot tm-foot"><button class="tm-btn" id="gcNo">취소</button><button class="tm-btn save" id="gcOk">구글 로그인</button></div></div></div>`;
    const done=v=>{ root.innerHTML=""; res(v); };
    const ok=()=>{ const v=norm(document.getElementById("gcMail").value);
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)){ document.getElementById("gcErr").textContent="이메일을 확인해 주세요"; return; }
      done(v); };
    document.getElementById("gcOk").onclick=ok; document.getElementById("gcNo").onclick=()=>done(null); document.getElementById("gcX").onclick=()=>done(null);
    document.getElementById("gcMail").onkeydown=e=>{ if(e.key==="Enter") ok(); };
    setTimeout(()=>{ const i=document.getElementById("gcMail"); if(i) i.focus(); }, 50);
  });
}
// 로그인한 계정이 입력한 이메일과 같은지 확인하고 토큰을 저장해요
async function signIn(email, consent){
  const r=await getToken(email, consent);
  const pri=await api(null,"GET","/calendars/primary",null,null,r.t);
  const real=norm(pri && pri.id);
  if(real && real!==email){
    if(!confirm(`입력한 이메일은 ${email} 인데, ${real} 계정으로 로그인했어요.\n${real} 로 연결할까요?`)) throw Object.assign(new Error("다른 계정"), {code:401});
    email=real;
  }
  setTok(email, r.t, r.exp);
  return email;
}

const ui=async fn=>{ try{ await fn(); }catch(e){ console.error(e); if(e.code!==401 && !/취소|popup_closed/.test(e.message||"")) alert("구글 캘린더: "+(e.message||e)); } rerender(); refreshSettings(); };
window.GCal={
  load, onTasks, want, dayHTML, chipHTML, settingsHTML, get state(){ return G; },
  onSave(uid,t){ enqueue(uid,"up",t); }, onDelete(uid,id){ enqueue(uid,"del",id); },
  add(){ return ui(async()=>{
    await load(state.ownerUid);
    let email=await askEmail(); if(!email) return;
    email=await signIn(email, true);
    await ensureCalendar(email);
    toast(`📅 ${email} 캘린더에 연결했어요. 할 일을 넣는 중…`,"good");
    await fullSync(email); G.gRange="";
    toast("📅 구글 캘린더와 맞췄어요","good");
  }); },
  connect(){ return this.add(); },
  reauth(email){ return ui(async()=>{ email=norm(email||stale()[0]||""); if(!email) return; const got=await signIn(email, false); if(!calOf(got)) await ensureCalendar(got); await fullSync(got); G.gRange=""; toast("📅 구글 캘린더와 맞췄어요","good"); }); },
  syncNow(email){ return ui(async()=>{ if(email){ await fullSync(norm(email)); } else await fullSyncAll(); G.gRange=""; toast("📅 구글 캘린더와 맞췄어요","good"); }); },
  setShow(v){ return ui(async()=>{ G.cfg={...G.cfg, showGoogle:!!v}; await cfgRef(G.uid).set(G.cfg); G.gRange=""; }); },
  remove(email){ email=norm(email);
    if(!confirm(`${email} 연결을 뺄까요?\n(이미 만든 구글 일정은 그대로 남아요. 지우려면 구글 캘린더에서 학습플래너 캘린더를 삭제하세요)`)) return;
    return ui(async()=>{ const cals={...(G.cfg.cals||{})}; delete cals[email];
      G.cfg={...G.cfg, cals, on:Object.keys(cals).length>0}; await cfgRef(G.uid).set(G.cfg);
      const t=tokOf(email); if(t && window.google&&google.accounts&&google.accounts.oauth2) google.accounts.oauth2.revoke(t, ()=>{});
      setTok(email,null); G.gev={}; G.gRange=""; }); },
};
})();
