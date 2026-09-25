// 매주 토요일 18시(한국 시간) — 부모에게 자녀별 주간 용돈 정산 알림 (휴대폰 푸시 · 이메일)
// GitHub Actions(.github/workflows/weekly-allowance.yml)가 실행합니다.
//
// 필요한 GitHub Secrets
//   FIREBASE_SERVICE_ACCOUNT : Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → '새 비공개 키 생성' JSON 전체
//   GMAIL_USER, GMAIL_APP_PASSWORD : 보내는 Gmail 주소와 앱 비밀번호 (없으면 이메일은 건너뜀)
// 선택 환경변수
//   SITE_URL  : 알림을 눌렀을 때 열 주소 (기본 https://nkdddd.github.io/nogang/)
//   WEEK_ID   : 특정 주(토요일 YYYY-MM-DD)로 다시 보내기
//   FORCE=1   : 이미 보낸 주도 다시 보내기
//   DRY_RUN=1 : 실제로 보내지 않고 내용만 출력

export function lastClosedSaturdayKST(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);          // UTC → 한국 시간
  const dow = kst.getUTCDay(), hour = kst.getUTCHours();
  let back = (dow + 1) % 7;                                         // 토요일까지 거슬러 갈 날 수
  if (back === 0 && hour < 18) back = 7;
  const sat = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - back));
  return sat.toISOString().slice(0, 10);
}
const won = n => "₩" + Number(n || 0).toLocaleString("ko-KR");
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function labelOf(weekId) {
  const sat = new Date(weekId + "T00:00:00Z"), sun = new Date(sat.getTime() - 6 * 864e5);
  return `${sun.getUTCMonth() + 1}.${sun.getUTCDate()}~${sat.getUTCMonth() + 1}.${sat.getUTCDate()}`;
}

export function messageFor(items, label) {
  const hm = m => { m = Math.round(Number(m) || 0); return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? " " + (m % 60) + "분" : ""}` : `${m}분`; };
  const lines = items.map(i => i.amount == null ? `${i.name}: 이번 주 기록 없음`
    : i.timePay != null ? `${i.name}: ${won(i.amount)} (시간 ${won(i.timePay)} + 앱 ${won(i.appBonus)} + 모의고사 ${won(i.mockBonus)})`
    : i.payMin != null ? `${i.name}: ${won(i.amount)} (타이머 ${hm(i.payMin)} × 1시간 ${won(i.rate)})`
    : `${i.name}: ${won(i.amount)} (${i.weekMin}분)`);
  const total = items.reduce((a, i) => a + (Number(i.amount) || 0), 0);
  return {
    title: `💰 ${label} 용돈 정산`,
    body: items.length > 1 ? `합계 ${won(total)} · ` + lines.join(" / ") : (lines[0] || "연결된 자녀가 없어요"),
    total,
  };
}
export function emailHTML(parentName, items, label, siteUrl) {
  const rows = items.map(i => `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:700">${esc(i.name)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:800;font-size:16px">${i.amount == null ? "기록 없음" : won(i.amount)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#6D6B7A;font-size:12.5px">${i.amount == null ? "이번 주 플래너 기록이 없어요" :
        (i.timePay != null ? `⏱ 공부 ${i.payMin}분 × ${won(i.rate)}${i.timerBonus ? ` + 타이머 보너스 ${won(i.timerBonus)}` : ""} = ${won(i.timePay)}${i.boost ? " (시험기간)" : ""}<br>📚 학습앱 정답률 ${i.appAcc == null ? "–" : Math.round(i.appAcc * 100) + "%"} +${won(i.appBonus)} · 📝 모의고사 ${i.mockAcc == null ? "미입력" : Math.round(i.mockAcc * 100) + "%"} +${won(i.mockBonus)}<br>`
          : i.payMin != null ? `타이머 ${i.payMin}분 × 1시간당 ${won(i.rate)}${i.extMin ? ` (학습앱 ${i.extMin}분 포함)` : ""}` : `학습 ${i.weekMin}분`)
        + ` · 완료 ${i.done}/${i.planned} · 학습일 ${i.studyDays}일${i.paid ? " · 지급 완료" : ""}`}</td></tr>`).join("");
  const total = items.reduce((a, i) => a + (Number(i.amount) || 0), 0);
  return `<div style="font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:560px;margin:0 auto;color:#1C1B24">
    <div style="background:linear-gradient(135deg,#8F80FF,#6A58E6);color:#fff;border-radius:16px;padding:20px">
      <div style="font-size:13px;opacity:.9">${esc(label)} · 토요일 18시 마감</div>
      <div style="font-size:24px;font-weight:800;margin-top:4px">이번 주 용돈 정산 ${items.length > 1 ? "합계 " + won(total) : ""}</div>
    </div>
    <p style="margin:16px 4px 8px">${esc(parentName || "부모")}님, 자녀들의 이번 주 학습 결과에 따라 책정된 용돈이에요.</p>
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eee;border-radius:12px">${rows}</table>
    <p style="margin:16px 4px;font-size:13px;color:#6D6B7A">주간 용돈 = 공부한 시간 × 1시간당 금액(평소 최대 1만 원 · 시험기간 2만 원, 타이머로 잰 시간은 +10%) + 학습앱 정답률 보너스 + 주간 모의고사 보너스예요.
      플래너 → 기록 → 용돈 정산에서 금액을 고친 뒤 지급할 수 있어요.</p>
    <a href="${esc(siteUrl)}" style="display:inline-block;background:#1C1B24;color:#fff;text-decoration:none;border-radius:999px;padding:12px 20px;font-weight:800">플래너에서 정산하기 ›</a>
  </div>`;
}

// 핵심: db / messaging / mailer를 받아서 실행 (테스트에서 가짜로 바꿔 끼울 수 있게)
export async function run({ db, messaging, auth, mailer, env = {}, log = console.log }) {
  const weekId = env.WEEK_ID || lastClosedSaturdayKST();
  const label = labelOf(weekId), site = env.SITE_URL || "https://nkdddd.github.io/nogang/";
  const dry = env.DRY_RUN === "1", force = env.FORCE === "1";
  log(`주간 용돈 알림 · ${weekId} (${label})${dry ? " · DRY RUN" : ""}`);
  const parents = await db.collection("users").where("role", "==", "parent").get();
  const summary = { parents: 0, push: 0, email: 0, skipped: 0 };
  for (const p of parents.docs) {
    const pid = p.id, profile = p.data() || {};
    const noticeRef = db.collection("planner").doc(pid).collection("notices").doc(weekId);
    const prev = await noticeRef.get();
    if (prev.exists && prev.data().sentAt && !force) { summary.skipped++; continue; }
    const links = await db.collection("links").doc(pid).collection("children").get();
    if (!links.size) continue;
    const items = [];
    for (const l of links.docs) {
      const cid = l.id, snap = await db.collection("planner").doc(cid).collection("allowanceSnap").doc(weekId).get();
      let name = (l.data() || {}).name || "자녀";
      try { const u = await db.collection("users").doc(cid).get(); if (u.exists && u.data().name) name = u.data().name; } catch (_) {}
      const s = snap.exists ? snap.data() : null;
      items.push({ uid: cid, name, amount: s ? s.amount : null, pct: s ? s.pct : null, weekMin: s ? s.weekMin : null, extMin: s ? s.extMin : 0,
        payMin: s && s.payMin != null ? s.payMin : null, rate: s ? s.rate : null,
        timePay: s && s.timePay != null ? s.timePay : null, timerBonus: s ? s.timerBonus || 0 : 0, appBonus: s ? s.appBonus || 0 : 0, mockBonus: s ? s.mockBonus || 0 : 0,
        appAcc: s && s.appAcc != null ? s.appAcc : null, mockAcc: s && s.mockAcc != null ? s.mockAcc : null, boost: s ? !!s.boost : false,
        done: s ? s.done : null, planned: s ? s.planned : null, studyDays: s ? s.studyDays : null, paid: s ? !!s.paid : false, updatedAt: s ? s.updatedAt : null });
    }
    const msg = messageFor(items, label);
    const prefsDoc = await db.collection("planner").doc(pid).collection("meta").doc("notify").get();
    const prefs = Object.assign({ push: true, email: true, emailTo: "" }, prefsDoc.exists ? prefsDoc.data() : {});
    summary.parents++;
    let pushed = 0, emailed = false;

    // 📱 푸시
    if (prefs.push && messaging) {
      const toks = await db.collection("planner").doc(pid).collection("pushTokens").get();
      for (const t of toks.docs) {
        const token = t.data().token || t.id;
        const m = { token, notification: { title: msg.title, body: msg.body },
          webpush: { fcmOptions: { link: site }, notification: { icon: site + "assets/icon-192.png", badge: site + "assets/icon-192.png", tag: "allowance-" + weekId } },
          data: { weekId, link: site } };
        if (dry) { log(`  [푸시] ${profile.name || pid} → ${token.slice(0, 12)}… ${msg.title} / ${msg.body}`); pushed++; continue; }
        try { await messaging.send(m); pushed++; }
        catch (e) {
          const code = (e && (e.code || (e.errorInfo && e.errorInfo.code))) || "";
          if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code)) { await t.ref.delete(); log(`  만료된 기기 토큰 삭제: ${token.slice(0, 12)}…`); }
          else log(`  푸시 실패 (${pid}): ${code || e.message}`);
        }
      }
    }
    // ✉️ 이메일
    if (prefs.email && mailer) {
      let to = prefs.emailTo || profile.email || "";
      if (!to && auth) { try { to = (await auth.getUser(pid)).email || ""; } catch (_) {} }
      if (to) {
        const mail = { to, subject: msg.title, text: msg.body + "\n\n" + site, html: emailHTML(profile.name, items, label, site) };
        if (dry) { log(`  [메일] → ${to} · ${mail.subject}`); emailed = true; }
        else { try { await mailer(mail); emailed = true; } catch (e) { log(`  메일 실패 (${to}): ${e.message}`); } }
      }
    }
    summary.push += pushed; summary.email += emailed ? 1 : 0;
    // 앱 안 정산서 (부모가 앱을 열면 보임)
    const notice = { type: "allowance", weekId, label, items, total: msg.total, createdAt: Date.now(), read: prev.exists ? !!prev.data().read : false,
      source: "scheduler", sentAt: Date.now(), sentPush: pushed, sentEmail: emailed };
    if (dry) log(`  [정산서] ${profile.name || pid}: ${msg.body}`);
    else await noticeRef.set(notice, { merge: true });
  }
  log(`완료: 부모 ${summary.parents}명 · 푸시 ${summary.push}건 · 이메일 ${summary.email}건 · 이미 보냄 ${summary.skipped}명`);
  return summary;
}

// 직접 실행될 때 (GitHub Actions)
if (import.meta.url === `file://${process.argv[1]}`) {
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const { getMessaging } = await import("firebase-admin/messaging");
  const { getAuth } = await import("firebase-admin/auth");
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) { console.error("FIREBASE_SERVICE_ACCOUNT 시크릿이 없어요."); process.exit(1); }
  initializeApp({ credential: cert(JSON.parse(raw)) });
  let mailer = null;
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const nodemailer = (await import("nodemailer")).default;
    const tr = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
    mailer = m => tr.sendMail({ from: `"우리집 학습플래너" <${process.env.GMAIL_USER}>`, ...m });
  } else console.log("GMAIL_USER / GMAIL_APP_PASSWORD 가 없어 이메일은 건너뜁니다.");
  await run({ db: getFirestore(), messaging: getMessaging(), auth: getAuth(), mailer, env: process.env });
}
