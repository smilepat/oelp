# OELP — Ontology English Learning Platform

> Phase 1 MVP + P-1 Recommendation v2 + P-1.5 Bridge + P-2 EBS Foundation
> Status: **217 Vitest tests · 7 routes · 17 lib modules · 4-layer safety net**
> Owner: [smilepat](https://github.com/smilepat) · 2026-05-23

본 레포는 [LogicFlow EdTech 생태계](https://github.com/smilepat/myprojects)의 통합 구현체다. **신규 빌드가 아니라 기존 자산 통합 레이어**.

---

## 1. 본 레포의 역할

```
┌─────────────────────────────────────────────────────────────────┐
│  smilepat/oelp  (Next.js 16 통합 앱)                            │
│                                                                 │
│   /diagnose ──► getActiveDiagnostic + GrowthRadar              │
│                  • URL ?result= 또는 paste import (P-1.5b)     │
│                                                                 │
│   /map ───────► Cytoscape.js — 10 QT + 21 keyVar + 7 distract │
│                  • weakness 색상화 (dimension-mapping 기반)    │
│                                                                 │
│   /queue ─────► buildQueueV3 + ContentGenerator chain          │
│                  • Thompson sampling (P-1)                     │
│                  • EBS-demo stub → LocalPoolGenerator fallback │
│                  • 9 → 12 validators (P-2 W6)                  │
│                  • 평가 폼 5 ratings + 메모 (P-1.5)            │
│                                                                 │
│   /sessions ──► history + summary + 양쪽 export                │
│                  • calibration JSON (calibrate.mjs 호환)       │
│                  • 전체 세션 + 평가 export                     │
│                                                                 │
│   Data:                                                         │
│   • VOCAB_POOL: vocabulary-db irt-5D 486 cards / 484 lemmas    │
│   • ontology-weights.json: 가중치 단일 소스 (auto-rollback)    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 빠른 시작

```bash
# Clone
gh repo clone smilepat/oelp
cd oelp
npm install

# Dev server
npm run dev
# → http://localhost:3000 (port 점유 시 3001 fallback)

# 전체 CI 시뮬레이션 (lint + 217 tests + C4.1 + build)
npm run ci
```

### Phase별 진입점

| 경로 | 시점 | 사용 |
|---|---|---|
| `/` 랜딩 | 첫 진입 | 4 라우트 소개 |
| `/diagnose` | dogfooding 시작 | 데모 진단 로드 또는 paste import |
| `/map` | 진단 후 | Ontology 시각화, 약점 QT 강조 |
| `/queue` | 학습 | 10 카드 풀이 + 평가 폼 |
| `/sessions` | 누적 후 | 히스토리 + calibration JSON export |

### Calibration 사이클 (학습자 응답 누적 시)

```bash
# 1. /sessions에서 "Calibration JSON" 다운로드 → data/dogfood.json
# 2. Dry-run
node scripts/calibrate.mjs --responses data/dogfood.json --min 100 --lambda 1.0 --out out/preview.json

# 3. Review weight diff manually
node scripts/promote-weights.mjs --calibration out/preview.json --dry-run

# 4. Apply with C4.1 regression gate
node scripts/calibrate.mjs --responses data/dogfood.json --min 100 --lambda 1.0 --apply
# → C4.1 PASS 시 lib/ontology-weights.json 자동 갱신
# → FAIL 시 자동 롤백 (out/promote-weights-fail.json 기록)
```

---

## 3. 라이브러리 모듈 (17)

| 파일 | 역할 |
|---|---|
| `lib/diagnostic.ts` | DiagnosticInput 컨트랙트 + base64 URL encode/decode |
| `lib/active-diagnostic.ts` | 활성 진단 localStorage (P-1.5b) |
| `lib/ontology.ts` | 10 QT + 21 keyVar + 7 dist (weights는 JSON에서 import) |
| `lib/ontology-weights.json` | **가중치 단일 소스** + calibrationHistory |
| `lib/queue.ts` | buildQueueV1/V2/V3 + dimensionsInQueue |
| `lib/leitner.ts` | 5-Box SR (vocab-learn-pat 포팅, oelp 네임스페이스) |
| `lib/recommendation.ts` | Thompson sampling + Beta posterior (P-1 W1) |
| `lib/recommendation-store.ts` | localStorage + drift reseed (P-1 W2) |
| `lib/calibration.ts` | Ridge regression (P-1 W5) |
| `lib/vocabulary-pool.ts` | 486 cards 자동 생성 (build-vocab-pool.mjs 출력) |
| `lib/session-store.ts` | 세션 영속화 + summarize (P-1.5) |
| `lib/session-export.ts` | calibration / full export 트리거 (P-1.5) |
| `lib/content-generator.ts` | ContentGenerator interface + Local/EBS impls + Chain (P-2) |
| `lib/content-validators.ts` | **12 validators** (P-2 W1-W2 V1-V9, W6 V10-V12) |
| `lib/irt-cold-start.ts` | Rasch Newton-Raphson + Fisher SE (P-2 W5) |

---

## 4. Scripts (12)

| 스크립트 | 역할 |
|---|---|
| `synthetic-validation-c4-1.mjs` | C4.1 회귀 (Kendall tau + 도메인 모순) |
| `c4-2-diversity.mjs` | C4.2 큐 다양성 (Jaccard 측정) |
| `c1-3-roundtrip.mjs` | C1.3 DiagnosticInput round-trip |
| `build-vocab-pool.mjs` | vocabulary-db CSV → vocabulary-pool.ts (auto-gen) |
| `gen-fake-responses.mjs` | 개발자 검증용 합성 응답 |
| `simulate-varied-dogfooding.mjs` | 다양한 진단 시뮬레이션 (P-1.5b) |
| `calibrate.mjs` | Ridge regression CLI (--apply chains to promote) |
| `promote-weights.mjs` | C4.1 회귀 게이트 + 자동 롤백 |
| `sync-responses-from-supabase.mjs` | events → responses (degraded mode 지원) |

---

## 5. 검증 안전망 (4중)

```
1. Vitest 217 단위 테스트 (1.95s)
   ↓
2. C4.1 dimension-mapping 회귀 (PR 마다 + weekly cron 둘 다)
   ↓
3. Next.js production build (Turbopack)
   ↓
4. promote-weights.mjs auto-rollback (가중치 변경 시 자동 검증)
```

### GitHub Actions

- **`pr-check.yml`**: PR 마다 lint + 217 tests + C4.1 + build 자동 게이트
- **`weekly-calibration.yml`**: 일요일 02:00 UTC + Supabase events → calibrate → PR 자동 생성

---

## 6. 검증 전략 ([PRD §B-5](https://github.com/smilepat/myprojects/blob/main/docs/01-plan/prd-oelp-mvp-phase1.md))

베타 N≥30 모집 불가 환경에서:
- **Dogfooding**: 본인 + 지인 1-3명
- **합성 검증**: vocabulary-db + csat-graphdb-318 직접 분석
- **본인 도메인 retrospective**: EFL 콘텐츠 개발자 5점 척도

→ 12 C 기준 자동 11/12 PASS + 1건 본인 정성 평가 잔여.

---

## 7. 문서

| 폴더 | 내용 |
|---|---|
| [`myprojects/docs/01-plan/`](https://github.com/smilepat/myprojects/tree/main/docs/01-plan) | PRD, dimension-mapping, analytics-events, phase2-backlog |
| [`myprojects/docs/02-design/`](https://github.com/smilepat/myprojects/tree/main/docs/02-design) | P-1, P-1.5 Bridge, P-2 Foundation |
| [`myprojects/docs/03-analysis/`](https://github.com/smilepat/myprojects/tree/main/docs/03-analysis) | C4.1 v1/v2, C1.3, C4.2, Playwright walkthrough, dogfooding-pass-1, vocab-cat-test blocker |
| [`myprojects/docs/04-report/`](https://github.com/smilepat/myprojects/tree/main/docs/04-report) | W12 평가, P-1 W1-W7 reports, P-1 final, P-1.5/P-1.5b, **oelp-integrated-summary** |

---

## 8. 기술 스택

- **Frontend**: Next.js 16.2.6 (App Router, Turbopack), React 19.2.4, TypeScript, Tailwind CSS 4
- **Visualizations**: Cytoscape.js 3.33.4, Chart.js 4.5.1, react-chartjs-2 5.3.1
- **Data**: vocabulary-pool (auto-gen from vocabulary-db), localStorage stores
- **Testing**: Vitest 4.1.7 (23 test files, 217 tests)
- **Backend (planned)**: vocab-cat-test FastAPI (Docker, separate container)
- **Deployment (planned)**: Vercel (Next.js) + Cloud Run (FastAPI)

**거부된 의존성**:
- Neo4j (Phase 2 P-7 spike로 평가)
- Turso (불필요)
- 별도 Node API server (Next.js Route Handlers 충분)
- Redux/Zustand (Server Components + localStorage 충분)

---

## 9. 진행 상황 종합 (2026-05-23 기준)

| Phase | 진행 |
|---|---|
| Phase 1 자동 검증 | 11/12 PASS (96%) |
| Phase 1 본인 정성 | 1/2 (C2.1 대기) |
| P-1 Recommendation v2 | 100% (8 weeks) |
| P-1.5 Bridge | 100% (1 week) |
| P-1.5b Varied Diagnostic | 100% |
| P-2 EBS Content Foundation | 100% (6 weeks) |
| dogfooding-1 | 30 응답, 90% 정답률, C4.1 gate 발동 확인 (D2 over-declared) |
| dogfooding-2 | real 30 + sim 1200 결합, C4.1 gate 재발동 (D3 under-declared, 자동 롤백) |
| **vocab-cat-test 통합** | ✅ 완료 (Python venv 우회) — pytest 177 pass, theta variance 0.03 → **C1.2 measured PASS** |

상세: [`docs/04-report/oelp-integrated-summary.md`](https://github.com/smilepat/myprojects/blob/main/docs/04-report/oelp-integrated-summary.md)

---

## 10. 다음 백로그

### 즉시 자율 가능
- Phase 2 P-7 Neo4j Spike (4주)
- 본인 dogfooding-2 (varied diagnostic 사용)
- OELP UI polish (A11y, dark mode, mobile)

### 본인 환경 의존
- vocab-cat-test Docker 통합 → C1.2 의미 stability 평가
- EBS-demo Firebase config → EBSCriteriaEngineGenerator 활성화

### 학습자 채널 의존
- Phase 2 P-3 Phonics (새 페르소나 P1)
- Phase 2 P-5 Teacher Dashboard
- C4.3 trend 4주 학습 데이터

---

## 11. 라이선스 및 기여

- 1인 프로젝트 (smilepat) — PR은 본인 단독 결재
- 라이선스: 미정 (Phase 2 P-2 완료 후 결정)
- 본 레포의 어떤 자료도 LogicFlow 생태계 외부에 무단 전재 금지
- 특히 `data/*.csv` (vocabulary-db 원본)는 별도 협의 필요 — `.gitignore`로 제외됨

---

## 12. 변경 이력 (요약)

- 2026-05-22: 레포 생성, Next.js 16 스캐폴드, Phase 1 F1/F2/F3 구현
- 2026-05-22: vocabulary-db 마운트 (486 cards), C4.2 v2 PASS
- 2026-05-22: Playwright walkthrough → RadarController 버그 fix
- 2026-05-22: P-1 8주 시작 (Thompson + Storage + buildQueueV2 + Ridge)
- 2026-05-23: P-1 W6 cron + W7 Vitest CI + W8 dogfooding 가이드
- 2026-05-23: P-1.5 Bridge (session-store + 평가 폼 + /sessions)
- 2026-05-23: **dogfooding-1 (본인) 30 응답 → C4.1 gate 자동 롤백 검증**
- 2026-05-23: P-1.5b varied diagnostic + simulator 검증
- 2026-05-23: P-2 W1-W6 (content-generator + 12 validators + buildQueueV3 + IRT cold-start)
- 2026-05-23: **dogfooding-2 (real 30 + sim 1200) → C4.1 게이트 D3 under-declared 모순 검출 → 자동 롤백**
