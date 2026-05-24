# OELP — Ontology English Learning Platform

> Phase 1 MVP + P-1 Recommendation v2 + P-1.5 Bridge + P-2 EBS Foundation + v4 Adaptive Exploration
> Status: **311 Vitest tests · 7 routes · 20 lib modules · 18 scripts · 10 components · 4-layer safety net**
> Owner: [smilepat](https://github.com/smilepat) · 2026-05-24

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

# 전체 CI 시뮬레이션 (lint + 311 tests + C4.1 + build)
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

## 3. 라이브러리 모듈 (20)

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
| `lib/diagnostic-presets.ts` | 4 preset diagnostics α/β/γ/δ (P-1.5b UX) |
| `lib/regression-history.ts` + `.json` | C4.1 게이트 이벤트 audit log (T1.1) |
| `lib/vocab-pool-source.json` | CSV provenance SHA-256 + row count (T3.1) |
| `lib/error-log.ts` | localStorage 기반 client error log (A3) |
| `lib/trend-analysis.ts` | C4.3 trend-analysis (computeWindows + analyzeTrend, scaffolded) |

---

## 4. Scripts (18)

| 스크립트 | 역할 |
|---|---|
| `synthetic-validation-c4-1.mjs` | C4.1 회귀 (Kendall tau + 도메인 모순) |
| `c4-2-diversity.mjs` | C4.2 큐 다양성 (Jaccard 측정) |
| `c1-3-roundtrip.mjs` | C1.3 DiagnosticInput round-trip |
| `build-vocab-pool.mjs` | vocabulary-db CSV → vocabulary-pool.ts (auto-gen + SHA-256 provenance) |
| `gen-fake-responses.mjs` | 개발자 검증용 합성 응답 |
| `simulate-varied-dogfooding.mjs` | 다양한 진단 시뮬레이션 (P-1.5b) |
| `calibrate.mjs` | Ridge regression CLI (`--auto-lambda` N-dependent schedule) |
| `promote-weights.mjs` | C4.1 회귀 게이트 + 자동 롤백 + regression-history auto-append |
| `sync-responses-from-supabase.mjs` | events → responses (degraded mode 지원) |
| `validate-schemas.mjs` | 3 JSON 파일 AJV schema 검증 (T1.1) |
| `update-readme-counters.mjs` | README 카운터 자동 동기화 (T2.1) |
| `verify-vocab-cat-test.mjs` | vocab-cat-test multi-step CAT 흐름 검증 + 5D 매핑 |
| `dogfood-3-presets.mjs` | preset 기반 dogfooding 시뮬레이터 (seed-based, reproducible) |
| `dogfood-stage-c-sim.mjs` | Stage C 활성화 forecasting (외부 학습자 1명 mix) |
| `dogfood-4-exploration.mjs` | exploration target Fisher Info simulator (P-1 W9 prep) |
| `dogfood-5-adaptive.mjs` | shouldExplore policy long-run (R5 finding source) |
| `dogfood-6-adaptive-threshold.mjs` | adaptive `max(20, mean × 0.3)` 검증 (R5 fix, balance 0.030→0.303) |
| `check-cross-repo-links.mjs` | myprojects 크로스 레포 링크 raw HEAD 검증 |

---

## 5. 검증 안전망 (4중)

```
1. Vitest 311 단위 테스트 (1.95s)
   ↓
2. C4.1 dimension-mapping 회귀 (PR 마다 + weekly cron 둘 다)
   ↓
3. Next.js production build (Turbopack)
   ↓
4. promote-weights.mjs auto-rollback (가중치 변경 시 자동 검증)
```

### GitHub Actions

- **`pr-check.yml`**: PR 마다 lint + 311 tests + C4.1 + build 자동 게이트
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
- **Testing**: Vitest 4.1.7 (33 test files, 311 tests)
- **Backend (planned)**: vocab-cat-test FastAPI (Docker, separate container)
- **Deployment (planned)**: Vercel (Next.js) + Cloud Run (FastAPI)

**거부된 의존성**:
- Neo4j (Phase 2 P-7 spike로 평가)
- Turso (불필요)
- 별도 Node API server (Next.js Route Handlers 충분)
- Redux/Zustand (Server Components + localStorage 충분)

---

## 9. 진행 상황 종합 (2026-05-24 v4 sprint 종료)

| Phase | 진행 |
|---|---|
| Phase 1 자동 검증 | **12/12 measured PASS** (C1.1 177 pytest + C1.2 theta variance 0.03) |
| Phase 1 본인 정성 | 1/2 (C2.1 잔여 — 자율 가능) |
| P-1 Recommendation v2 | 100% (8 weeks) |
| P-1.5 Bridge | 100% (1 week) |
| P-1.5b Varied Diagnostic + preset UI | 100% |
| P-2 EBS Content Foundation | 100% (6 weeks) |
| **P-2 W7 EBS real wiring** | 100% (코드 완료, Firebase config 본인 잔여) |
| **Tier 1-3 Stability Roadmap** | 100% (7 작업 — schemas, write-protect, auto-sync, dependabot) |
| **Tier 4.1 A11y baseline** | 100% (12/12 WCAG 2.1 AA — desktop + mobile) |
| **vocab-cat-test 통합** | ✅ resolved (177 pytest, θ variance 0.03 → C1.2 measured PASS) |
| **Vercel Production 배포** | ✅ 본인 완료 |
| dogfooding-1 | 30 응답 → C4.1 D2 over → rollback |
| dogfooding-2 | 1230 응답 → C4.1 D3 under → rollback |
| dogfooding-3 (preset 시뮬레이션) | 1600 응답 → C4.1 D5 over → rollback |
| **λ schedule (auto-lambda)** | N-dependent (N<100→2.0, ..., >10k→0.5) |
| **C4.3 trend UI 통합** | TrendPanel + SessionAccuracyTrend sparkline (≥2 세션 활성, slope 회귀, /sessions wired) |
| **Stage C 활성화 forecasting** | 외부 1명만으론 게이트 FAIL 지속, 50% 비율 시 PASS 가능성 forecast |
| **v4: exploration target (P-1 W9)** | `findExplorationTarget` Fisher Info — dogfood-4로 검증 |
| **v4: shouldExplore policy** | balance-aware (b<0.1: every 2nd, b<0.5: every 4th) + R5 long-run 발견 |
| **v4: R5 fix — adaptive threshold** | `max(20, mean × 0.3)` — dogfood-6로 balance 10배 회복 검증 (0.030→0.303) |
| **v4: closed-loop iterations** | **5 cycle 누적** (Tier 1-3 → λ schedule → exploration → adaptive prep → adaptive verification) |
| **v4: analytics events 인프라** | `lib/analytics-events.ts` (11 types) + AnalyticsQueuePanel (`/sessions`) — Supabase config 대기 |

상세:
- 통합 회고: [`docs/04-report/oelp-integrated-summary.md`](https://github.com/smilepat/myprojects/blob/main/docs/04-report/oelp-integrated-summary.md) v4
- Stability sprint: [`docs/04-report/stability-roadmap-tier-1-3-complete.md`](https://github.com/smilepat/myprojects/blob/main/docs/04-report/stability-roadmap-tier-1-3-complete.md)
- Phase 2 PRD: [`docs/01-plan/prd-oelp-mvp-phase2.md`](https://github.com/smilepat/myprojects/blob/main/docs/01-plan/prd-oelp-mvp-phase2.md)
- C4.1 게이트 3 cycle: [`docs/03-analysis/dogfooding-pass-{1,2,3}.md`](https://github.com/smilepat/myprojects/tree/main/docs/03-analysis)
- **v4 exploration policy analysis**: [`docs/03-analysis/exploration-policy-long-run-analysis.md`](https://github.com/smilepat/myprojects/blob/main/docs/03-analysis/exploration-policy-long-run-analysis.md)
- **v4 adaptive threshold verification**: [`docs/03-analysis/adaptive-threshold-verification.md`](https://github.com/smilepat/myprojects/blob/main/docs/03-analysis/adaptive-threshold-verification.md)

---

## 9.5. Analytics 이벤트 인프라 (v4)

localStorage 큐에 **11개 이벤트 타입**을 누적, Supabase config 도착 시 자동 sync 예정.

| 카테고리 | 이벤트 | 발화 시점 |
|---|---|---|
| auth | `auth.signed_up` / `auth.signed_in` | 로그인 wiring 시 (현재 stub) |
| diag | `diag.started` / `diag.item_answered` / `diag.completed` | AdaptiveDiagnostic 시작 / 응답 / 완료 |
| map | `map.viewed` / `map.node_clicked` | `/map` 진입 / 노드 클릭 (TYPE/DIST/keyVar) |
| queue | `queue.started` / `queue.item_answered` / `queue.completed` | `/queue` 시작 / 카드 답변 / 평가 제출 |
| calibration | `calibration.attempted` | promote-weights 시도 시 |

운영 위젯: `/sessions` → **AnalyticsQueuePanel** (총 이벤트 / 세션 / 타입 분포 / JSON 다운로드).

Supabase config 도착 시:
1. `lib/analytics-events.ts`의 stub flush를 실제 insert로 교체
2. AnalyticsQueuePanel에 "X events pending sync" + flush button 추가
3. weekly cron이 events → responses 변환 (`sync-responses-from-supabase.mjs` 재사용)

---

## 10. Phase 2 백로그 (v2 — Stage A/B/C/D)

### Stage A — Claude 자율 가능 (즉시)
- C4.3 trend UI 통합 (lib/trend-analysis.ts 준비됨)
- A8 `/diagnose` vocab-cat-test 통계 위젯
- regression-history 검색/필터 (events 8건+ 누적 후)
- error-log mock test 추가로 coverage → 100%
- **v4: AdaptiveQueuePanel v2** — Supabase 연결 시 sync 카운터/버튼
- **v4: queue.item_answered wiring** — `/queue` 카드 답변 즉시 logEvent

### Stage B — 본인 1-2시간 결단
- ☐ Cloud Run vocab-cat-test 배포 ([runbook](https://github.com/smilepat/myprojects/blob/main/docs/03-analysis/vocab-cat-test-cloudrun-runbook.md))
- ☐ EBS-demo Firebase config (코드는 wired)
- ☐ vocab-cat-test PR #2 merge (CORS 1줄, pending)

### Stage C — 학습자 채널 의존 (현재 0명 → ≥1명 활성화)
- P-3 Phonics 페르소나 P1 정의 + reading-roadmap 재활성화 (6주)
- P-5 Teacher Dashboard 페르소나 P2 + B2B (8주)
- P-1 W9+ Recommendation refinement (외부 학습자 ridge calibration, 4주)
- 첫 자기-개선 calibration cycle (Stage C sim forecast: 외부 ≥ 50% 비율)

### Stage D — 재평가 트리거 후 (Phase 3 후보)
- P-7 Neo4j re-evaluation (학습자 ≥ 1000 또는 multi-hop 명시 요구 시)
- P-4 React Native hybrid mobile
- P-6 AI Tutor conversational

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
- 2026-05-23 v2 sprint: **Tier 1-3 stability roadmap** (7 작업) — JSON schemas + write-protection + auto-doc sync + Dependabot
- 2026-05-23 v2 sprint: **Tier 4.1 A11y** baseline (axe-core 6 routes × 2 viewports = 12 WCAG 2.1 AA PASS)
- 2026-05-23 v2 sprint: **vocab-cat-test 실제 통합** (Python venv 경로) + PR #1 fix merged + AdaptiveDiagnostic UI + weekly cron CI
- 2026-05-23 v2 sprint: **Vercel Production 배포** (본인 완료) + Cloud Run runbook 준비
- 2026-05-23 v2 sprint: EBSCriteriaEngineGenerator stub → 실 wiring (Firebase config 본인 잔여)
- 2026-05-23 v2 sprint: A4 mobile 반응형 + A3 error boundary + A6 coverage gate (95.51%) + A5 /sessions 운영 패널 + A7 leitner/session-export 0%→100%
- 2026-05-23 v3 sprint: **dogfooding-3 preset 시뮬레이션** (1600 응답) → C4.1 D5 over-declared → 롤백 (3 cycle 누적)
- 2026-05-23 v3 sprint: **λ schedule (auto-lambda)** N-dependent + C4.3 trend-analysis 인프라 (scaffolded)
- 2026-05-23 v3 sprint: **Stage C 활성화 forecasting** (외부 1명 simulation) + Phase 2 PRD 정식화
- 2026-05-23 v3 sprint: OELP + myprojects **CLAUDE.md** 정비 (작업 컨티뉴이티 기반)
- 2026-05-24 v4 sprint: **P-1 W9 exploration target** (`findExplorationTarget` Fisher Info) — dogfood-4 검증
- 2026-05-24 v4 sprint: **shouldExplore balance-aware policy** + buildQueueV3 `useExploration` 통합 (`/queue` 자동 적용)
- 2026-05-24 v4 sprint: **R5 long-run 발견** — dogfood-5 (500 sess) balance 0.030 악화 → exploration-policy-long-run-analysis.md
- 2026-05-24 v4 sprint: **R5 fix — adaptive threshold** `max(20, mean × 0.3)` — dogfood-6 balance 0.030→0.303 (10x 회복) 검증
- 2026-05-24 v4 sprint: **analytics events 인프라** (lib/analytics-events.ts 11 types, /diagnose /queue /map /AdaptiveDiagnostic wired)
- 2026-05-24 v4 sprint: **AnalyticsQueuePanel** /sessions 위젯 (Supabase config 시 flush button으로 진화 예정)
- 2026-05-24 v4 sprint: **5 closed-loop iteration 누적** (Tier 1-3 → λ schedule → exploration target → adaptive prep → adaptive verification)
