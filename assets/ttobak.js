/* ============================================================
 *  🌐 받아쓰기 프로그램(또박또박, nkdddd/mdeng) 친구와 카드 대결
 *  - 받아쓰기 프로그램의 Firebase(ttobak-ca6f8)에 부모님 Google 계정으로 한 번 연결해요 (이 기기에 기억돼요)
 *  - 받아쓰기 프로그램과 똑같은 기록을 써서, 그쪽 아이와 바로 대결해요
 *      emails/<이메일> {uid} · profiles/<uid> {name, kids:[{id,name,avatar}], online:{아이id:시각}}
 *      friends/<uid_uid> {users, from, status, names, emails} · matches/<id> {users, host, kids, who, stake, status, seed, picks, …}
 *  - 우리 아이는 'ng-<플래너 uid>' 라는 아이로 친구 가족에게 보여요
 * ============================================================ */
(function(){
const CFG={
  apiKey:"AIzaSyAF8uZGiYHJ9jyRBrZUqDD_3f9bU2idQqI", authDomain:"ttobak-ca6f8.firebaseapp.com", projectId:"ttobak-ca6f8",
  storageBucket:"ttobak-ca6f8.firebasestorage.app", messagingSenderId:"1007500368122", appId:"1:1007500368122:web:412119a3c7d54674b79143",
};
const ONLINE_MS=75*1000, BEAT_MS=30*1000, INVITE_MS=2*60*1000;
const st={on:false, ready:false, uid:null, email:"", name:"", kid:null, friends:{}, profiles:{}, matches:{}, err:""};
let app=null, auth=null, fdb=null, subs=[], profSubs={}, beat=0;
const listeners=new Set();
const emit=w=>listeners.forEach(f=>{ try{ f(w); }catch(e){ console.error(e); } });
const now=()=>Date.now();
const pairId=(a,b)=>a<b? a+"_"+b : b+"_"+a;
const warn=w=>e=>{ console.warn("[받아쓰기 친구]", w, e); st.err=(e&&e.code)||String(e&&e.message||e); emit("error"); };

function init(){
  if(app || !window.firebase) return;
  try{ app=firebase.app("ttobak"); }catch(_){ app=firebase.initializeApp(CFG, "ttobak"); }
  auth=app.auth(); fdb=app.firestore();
  auth.onAuthStateChanged(u=>{ st.ready=true; if(u) start(u); else stop(); emit("auth"); });
}
async function login(){
  init();
  const p=new firebase.auth.GoogleAuthProvider();
  p.setCustomParameters && p.setCustomParameters({prompt:"select_account"});
  try{ await auth.signInWithPopup(p); }
  catch(e){
    if(e && /popup-blocked|operation-not-supported/.test(e.code||"")) return auth.signInWithRedirect(p);
    throw e;
  }
}
async function logout(){
  if(st.on && st.kid) await fdb.collection("profiles").doc(st.uid).set({online:{[st.kid.id]:0}},{merge:true}).catch(()=>{});
  if(auth) await auth.signOut();
}
function stop(){
  subs.forEach(u=>{ try{u();}catch(_){} }); Object.values(profSubs).forEach(u=>{ try{u();}catch(_){} });
  subs=[]; profSubs={}; clearInterval(beat);
  Object.assign(st, {on:false, uid:null, email:"", name:"", friends:{}, profiles:{}, matches:{}});
  emit("friends"); emit("matches");
}
function start(u){
  if(st.on && st.uid===u.uid) return;
  if(st.on) stop();
  Object.assign(st, {on:true, uid:u.uid, email:(u.email||"").toLowerCase(), name:u.displayName||(u.email||"").split("@")[0]||"친구", err:""});
  if(st.email) fdb.collection("emails").doc(st.email).set({uid:st.uid}).catch(warn("email"));
  publish();
  subs.push(fdb.collection("friends").where("users","array-contains",st.uid).onSnapshot(s=>{
    st.friends={}; s.forEach(d=>{ st.friends[d.id]={id:d.id, ...d.data()}; });
    watchProfiles(); emit("friends");
  }, warn("friends")));
  subs.push(fdb.collection("matches").where("users","array-contains",st.uid).onSnapshot(s=>{
    st.matches={}; s.forEach(d=>{ st.matches[d.id]={id:d.id, ...d.data()}; });
    emit("matches");
  }, warn("matches")));
  clearInterval(beat); beat=setInterval(heartbeat, BEAT_MS); heartbeat();
  emit("friends");
}
function watchProfiles(){
  const want=new Set(friendUids());
  Object.keys(profSubs).forEach(u=>{ if(!want.has(u)){ profSubs[u](); delete profSubs[u]; delete st.profiles[u]; } });
  want.forEach(u=>{
    if(profSubs[u]) return;
    profSubs[u]=fdb.collection("profiles").doc(u).onSnapshot(d=>{ st.profiles[u]=d.exists? d.data() : {}; emit("friends"); }, warn("profile"));
  });
}
// 우리 아이를 친구 가족에게 보여 줘요. 받아쓰기 프로그램 아이 목록은 그대로 두고 우리 아이만 넣어요
// (받아쓰기 프로그램이 목록을 다시 쓰면 빠질 수 있어서, 30초마다 다시 넣어요)
async function publish(){
  if(!st.on || !st.kid) return;
  try{
    const ref=fdb.collection("profiles").doc(st.uid), d=await ref.get(), cur=d.exists? d.data() : {};
    const kids=(cur.kids||[]).filter(k=>k && k.id!==st.kid.id);
    kids.push({id:st.kid.id, name:st.kid.name, avatar:st.kid.avatar});
    await ref.set({name:cur.name||st.name, kids, updatedAt:now()}, {merge:true});
  }catch(e){ warn("publish")(e); }
}
function heartbeat(){
  if(!st.on || !st.kid || document.visibilityState==="hidden") return;
  publish().then(()=>fdb.collection("profiles").doc(st.uid).set({online:{[st.kid.id]:now()}},{merge:true})).catch(warn("beat"));
}
function setKid(k){
  const same=st.kid && st.kid.id===k.id && st.kid.name===k.name;
  st.kid=k;
  if(!same) heartbeat();
}

/* ----- 👫 친구 ----- */
const friendUids=()=>Object.values(st.friends).filter(f=>f.status==="ok").map(f=>f.users.find(u=>u!==st.uid));
function friendList(){
  return Object.values(st.friends).map(f=>{
    const uid=f.users.find(u=>u!==st.uid), p=st.profiles[uid]||{}, online=p.online||{};
    return {pid:f.id, uid, status:f.status, incoming:f.status==="pending" && f.from!==st.uid,
      name:p.name||(f.names||{})[uid]||"친구 가족", email:(f.emails||{})[uid]||"",
      kids:f.status==="ok"? (p.kids||[]).map(k=>({...k, online:now()-(online[k.id]||0)<ONLINE_MS})) : []};
  }).sort((a,b)=>(b.kids.some(k=>k.online)-a.kids.some(k=>k.online)) || a.name.localeCompare(b.name));
}
// 이메일로 친구 신청 → 'sent' | 'accepted' | 'already' | 'pending' | 'self' | 'bad' | 'notfound'
async function requestFriend(raw){
  const email=String(raw||"").trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "bad";
  if(email===st.email) return "self";
  const e=await fdb.collection("emails").doc(email).get();
  if(!e.exists) return "notfound";
  const other=e.data().uid, ref=fdb.collection("friends").doc(pairId(st.uid, other)), cur=await ref.get();
  if(cur.exists){
    const f=cur.data();
    if(f.status==="ok") return "already";
    if(f.from!==st.uid){ await acceptFriend(ref.id); return "accepted"; }
    return "pending";
  }
  await ref.set({users:[st.uid, other], from:st.uid, status:"pending", names:{[st.uid]:st.name}, emails:{[st.uid]:st.email, [other]:email}, createdAt:now()});
  return "sent";
}
async function acceptFriend(id){
  const ref=fdb.collection("friends").doc(id), d=await ref.get(); if(!d.exists) return;
  const f=d.data();
  await ref.update({status:"ok", names:{...(f.names||{}), [st.uid]:st.name}, emails:{...(f.emails||{}), [st.uid]:st.email}});
}
const removeFriend=id=>fdb.collection("friends").doc(id).delete();

/* ----- ⚔️ 대결 (받아쓰기 프로그램과 같은 기록) ----- */
const fresh=m=>m.status!=="invite" || now()-(m.createdAt||0)<INVITE_MS;
// 우리 아이가 낀 대결만 (같은 Google 계정의 받아쓰기 프로그램 아이 대결은 빼요)
const myMatches=()=>Object.values(st.matches).filter(m=>st.kid && m.kids && m.kids[st.uid]===st.kid.id);
async function invite(friendUid, them, stake){
  const ref=fdb.collection("matches").doc();
  await ref.set({users:[st.uid, friendUid], host:st.uid, stake:!!stake, status:"invite",
    kids:{[st.uid]:st.kid.id, [friendUid]:them.id}, who:{[st.uid]:{...st.kid}, [friendUid]:{id:them.id, name:them.name, avatar:them.avatar||""}},
    seed:Math.floor(Math.random()*2147483647), picks:{}, settled:{}, createdAt:now(), updatedAt:now()});
  return ref.id;
}

window.TTOBAK={ st, init, login, logout, setKid, publish, friendList, requestFriend, acceptFriend, removeFriend, myMatches, invite, fresh,
  db:()=>fdb, on(fn){ listeners.add(fn); return ()=>listeners.delete(fn); }, ONLINE_MS, INVITE_MS };
// 이미 연결된 기기면 바로 이어서 켜요
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", ()=>setTimeout(init, 0)); else setTimeout(init, 0);
})();
