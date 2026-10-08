// firestore.rules 를 Firebase(splan-5512)에 그대로 게시해요 (GitHub Actions: .github/workflows/deploy-rules.yml)
//   FIREBASE_SERVICE_ACCOUNT : 주간 용돈 알림에 쓰는 것과 같은 서비스 계정 JSON (저장소 Secrets)
//   DRY_RUN=1 이면 규칙 문법만 확인하고 게시하지 않아요
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getSecurityRules } from "firebase-admin/security-rules";

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!sa.project_id) { console.error("FIREBASE_SERVICE_ACCOUNT 가 없어요"); process.exit(1); }
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const source = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const rules = getSecurityRules();
try {
  if (process.env.DRY_RUN === "1") {
    const rs = await rules.createRuleset({ name: "firestore.rules", content: source });   // 문법이 틀리면 여기서 실패해요
    console.log("✅ 문법 확인:", rs.name);
    await rules.deleteRuleset(rs.name);
  } else {
    const rs = await rules.releaseFirestoreRulesetFromSource(source);
    console.log("✅ 게시했어요:", rs.name, "·", sa.project_id);
  }
} catch (e) {
  console.error("❌ 규칙을 게시하지 못했어요:", e.code || "", e.message);
  if (/permission|PERMISSION/.test(String(e.message))) console.error("서비스 계정에 'Firebase Rules Admin' 권한이 필요해요 (Google Cloud 콘솔 → IAM).");
  process.exit(1);
}
