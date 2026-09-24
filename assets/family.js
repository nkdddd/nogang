/* ============================================================
 *  가족 연결 (신청 → 승인) — 플래너 · 학습앱 공용
 *
 *  familyRequests/{id} = {
 *    fromUid, fromName, fromEmail, fromRole: "parent"|"child",
 *    toEmail(소문자), toUid, toName, status: "pending"|"accepted"|"declined"|"canceled"|"unlinked",
 *    createdAt, respondedAt
 *  }
 *  - 부모 → 자녀, 자녀 → 부모 어느 쪽이든 상대 이메일로 신청하고, 받은 사람이 승인합니다.
 *  - 승인되면 부모 쪽에 links/{부모uid}/children/{자녀uid} = {name, requestId, addedAt} 가 만들어지고,
 *    부모는 그 자녀의 플래너·학습앱 기록을 볼 수 있습니다.
 *    (자녀가 승인한 경우 부모가 다음에 접속할 때 syncLinks가 연결을 만듭니다)
 * ============================================================ */
(function(){
  const lower=s=>String(s||"").trim().toLowerCase();
  const col=db=>db.collection("familyRequests");
  const now=()=>Date.now();

  // 내가 보낸 신청 / 나에게 온 신청
  async function listMine(db, user){
    const email=lower(user.email);
    const [sent, recv]=await Promise.all([
      col(db).where("fromUid","==",user.uid).get(),
      email? col(db).where("toEmail","==",email).get() : Promise.resolve({docs:[]}),
    ]);
    const map=d=>({id:d.id, ...d.data()});
    const byTime=(a,b)=>(b.respondedAt||b.createdAt||0)-(a.respondedAt||a.createdAt||0);
    return { sent:sent.docs.map(map).sort(byTime), received:recv.docs.map(map).sort(byTime) };
  }

  // 신청 보내기
  async function send(db, user, profile, toEmail){
    const email=lower(toEmail);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("이메일 형식을 확인해 주세요.");
    if(email===lower(user.email)) throw new Error("내 이메일로는 신청할 수 없어요.");
    const {sent}=await listMine(db, user);
    if(sent.some(r=>r.toEmail===email && (r.status==="pending"||r.status==="accepted")))
      throw new Error("이미 신청했거나 연결된 계정이에요.");
    await col(db).add({
      fromUid:user.uid, fromName:profile.name||"", fromEmail:lower(user.email), fromRole:profile.role==="parent"?"parent":"child",
      toEmail:email, toUid:"", toName:"", status:"pending", createdAt:now(), respondedAt:0,
    });
  }

  // 받은 신청에 답하기 (승인 / 거절)
  async function respond(db, user, profile, req, accept){
    await col(db).doc(req.id).update({
      status: accept? "accepted":"declined", toUid:user.uid, toName:profile.name||"", respondedAt:now(),
    });
    // 내가 부모이고 자녀의 신청을 승인했다면 바로 연결
    if(accept && profile.role==="parent" && req.fromRole!=="parent"){
      await db.collection("links").doc(user.uid).collection("children").doc(req.fromUid)
        .set({name:req.fromName||"자녀", requestId:req.id, addedAt:now()});
    }
  }

  // 자녀: 부모와의 연결 해제 (부모가 다음에 접속하면 링크가 지워짐)
  async function leave(db, req){ await col(db).doc(req.id).update({status:"unlinked", respondedAt:now()}); }

  async function cancel(db, req){ await col(db).doc(req.id).update({status:"canceled", respondedAt:now()}); }

  // 부모: 승인된 신청을 links에 반영 (자녀가 승인한 경우)
  async function syncLinks(db, user, profile){
    if(!profile || profile.role!=="parent") return 0;
    let n=0;
    try{
      const {sent, received}=await listMine(db, user);
      const ok=sent.filter(r=>r.status==="accepted" && r.toUid && r.fromRole==="parent");
      for(const r of ok){
        const ref=db.collection("links").doc(user.uid).collection("children").doc(r.toUid);
        const d=await ref.get();
        if(!d.exists){ await ref.set({name:r.toName||"자녀", requestId:r.id, addedAt:now()}); n++; }
      }
      // 자녀 쪽에서 연결을 해제한 경우 링크 정리
      const all=[...sent, ...received];
      const links=await db.collection("links").doc(user.uid).collection("children").get();
      for(const l of links.docs){
        const rid=(l.data()||{}).requestId; if(!rid) continue;
        const r=all.find(x=>x.id===rid);
        if(r && r.status==="unlinked"){ await l.ref.delete(); n++; }
      }
    }catch(e){ console.warn("가족 연결 동기화", e); }
    return n;
  }

  // 연결 해제: 링크 삭제 + 관련 신청을 'unlinked'로 (다시 자동 연결되지 않도록)
  async function unlink(db, user, childUid){
    await db.collection("links").doc(user.uid).collection("children").doc(childUid).delete();
    try{
      const {sent, received}=await listMine(db, user);
      const rel=[...sent.filter(r=>r.toUid===childUid), ...received.filter(r=>r.fromUid===childUid)]
        .filter(r=>r.status==="accepted");
      for(const r of rel) await col(db).doc(r.id).update({status:"unlinked", respondedAt:now()});
    }catch(e){ console.warn("신청 상태 정리", e); }
  }

  // 자녀: 나와 연결된 부모 목록 (승인된 신청 기준)
  function parentsOf(list, user){
    const out={};
    list.sent.filter(r=>r.status==="accepted" && r.fromRole!=="parent").forEach(r=>{ out[r.toUid||r.toEmail]={name:r.toName||r.toEmail, email:r.toEmail, req:r}; });
    list.received.filter(r=>r.status==="accepted" && r.fromRole==="parent").forEach(r=>{ out[r.fromUid]={name:r.fromName||r.fromEmail, email:r.fromEmail, req:r}; });
    return Object.values(out);
  }

  window.Family={listMine, send, respond, cancel, leave, syncLinks, unlink, parentsOf};
})();
