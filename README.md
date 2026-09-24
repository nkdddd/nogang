# 우리집 학습플래너 (통합판)

학습플래너에 **천문장 트레이너 · MD 중학영단어 · 그래머 인사이드**를 합치고, 화면을 하루틀 형태(아래쪽 메뉴 + ✨ 빠른 계획)로 바꾼 버전입니다.

## 파일

| 경로 | 내용 |
|---|---|
| `index.html` | 플래너 본체 (사이트 첫 화면). 아래쪽 메뉴 **할 일 · 일정 · 학습 · 기록**, ✨ 빠른 계획, ⋯ 메뉴 |
| `apps/sentence.html` | 천문장 트레이너 (문장방 · 문법방) |
| `apps/words.html` | MD 중학영단어 1800 (단어장 · 어근) |
| `apps/grammar.html` | 그래머 인사이드 트레이너 (레벨 1~3) |

학습 탭에서 앱을 누르면 플래너 위에 전체 화면으로 열립니다. 같은 사이트·같은 Firebase 프로젝트라 **한 번 로그인하면 네 화면 모두 같은 계정**으로 동작합니다. 각 앱 파일은 단독으로 열어도 됩니다.

## 통합 데이터베이스 (Firebase 프로젝트 `splan-5512`)

```
users/{uid}                     프로필 {name, role: parent|child, linkCode}  ← 네 앱 공용
codes/{6자리}                   가족 연결 코드 → {uid, name}
links/{부모uid}/children/{uid}  부모-자녀 연결                               ← 네 앱 공용

planner/{uid}/
  tasks/{id}                    학습 계획·실행 기록
  meta/categories, meta/settings  과목·교재·학습방법 / 목표·용돈 기준·학습앱 인정 설정(extApps)
  diary, daygoals, daytypes, payouts, weekcaps, certs, coupons
  apps/sentence                 천문장 학습 상태 + summary + dayLog{날짜: 문장 수}
  apps/words                    MD영단어 state(날짜별 log 포함) + summary
  apps/grammar                  그래머 인사이드 상태 + summary + dayLog{날짜: {sec, answered, correct, cards}}

shares/{코드}                   천문장 공유 요약 (앱 안의 공유 코드 기능)
giUsers/{uid}, giFriendRequests 그래머 인사이드 친구 랭킹용 공개 요약
```

- 플래너는 연결 코드 없이 `planner/{uid}/apps/*`를 직접 읽어 **날짜별 학습시간**으로 인정합니다
  (문장 1개 1.5분, 신규 단어 1분·복습 0.5분, 문법 집중 1분 = 1분 · 앱별 하루 30분, 합계 60분 상한 — ⋯ 메뉴 → 학습앱 인정 시간에서 조정).
- 인정 시간은 할 일 화면·학습 탭·이번 주 용돈 정산의 학습시간에 더해집니다. 부모가 자녀를 보고 있으면 그 자녀의 기록으로 계산합니다.
- Firestore 보안 규칙은 부모 계정이 연결된 자녀의 `planner/{자녀uid}/**`(특히 `apps/*`)를 읽을 수 있어야 합니다.
