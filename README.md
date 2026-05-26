# OELP — Ontology English Learning Platform

> Phase 1 MVP + P-1 Recommendation v2 + P-1.5 Bridge + P-2 EBS Foundation + v4 Adaptive Exploration + v5 Stage A 소진 + v8 Cloud Run 배포 + v9-v19 D1 plateau + 9 surfaces + 9 모니터링 도구 + retention 6 층위 정합
> Status: **442 Vitest tests · 7 routes · 26 lib modules · 35 scripts · 14 components · 4-layer safety net**
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

# 전체 CI 시뮬레이션 (lint + 442 tests + C4.1 + build)
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

## 3. 라이브러리 모듈 (26)

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
| `lib/plateau-detection.ts` | D1 plateau 자동 감지 (v13, PlateauWarningPanel 의존) |
| `lib/retention-analysis.ts` | 학습자 휴학 cycle 자동 분류 (v19, RetentionDashboard 의존) |

---

## 4. Scripts (35)

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
| `mock-vocab-cat-test.mjs` | vocab-cat-test FastAPI mock (offline dogfooding용 — `/health` `/start` `/respond` `/results`) |
| `dogfood-7-cohort.mjs` | multi-learner cohort forecast (N=1/5/10/30/50 + `--exploration on`로 풀 QT 커버) |
| `dogfood-8-learning-curve.mjs` | 단일 학습자 종방향 학습 곡선 (multi-archetype + `--d1-boost`로 옵션 A 시뮬) |
| `check-dim-coverage.mjs` | keyVariable 매핑 자동 진단 (v10 D1_Form hidden defect 같은 갭 자동 검출) |
| `dogfood-9-dim-plateau-scan.mjs` | 5 dim × 5 archetype plateau scan matrix (D1 systemic defect 일반화 검증) |
| `simulate-option-a-prime.mjs` | 옵션 A' 4 파일 PR 사전 in-memory 검증 (C4.1 게이트 PASS/FAIL 예측) |
| `dogfood-10-option-a-prime-matrix.mjs` | 옵션 A' 적용 시 5×5 matrix 변화 사전 측정 (production weight in-memory override, SAFE verdict 자동 출력) |
| `dogfood-11-weight-sensitivity.mjs` | 5 dim weight sensitivity 시뮬 — D1만 MAJOR, 다른 dim SAFE (미래 PR 안전 가이드) |
| `bundle-size-audit.mjs` | Next.js 16 Turbopack production bundle size 측정 (현 1.58MB, threshold 3MB 47% 마진) |
| `dogfood-12-forgetting-curve.mjs` | Ebbinghaus forgetting 추가 24주 sim — D1 negative gap -72% finding (시간 차원 정당화) |
| `c4-3-trend-cli.mjs` | lib/trend-analysis CLI 래퍼 — CI/cron에서 누적 데이터 직접 trend 분석 |
| `dogfood-13-forgetting-plus-option-a-prime.mjs` | forgetting + 옵션 A' 결합 sim — D1 +113~160%p 회복, side effect 0, SAFE |
| `dogfood-14-spike-pattern.mjs` | 휴학 후 복귀 시나리오 sim (24w 중 8w active) — 모든 dim negative gap |
| `web-vitals-audit.mjs` | Production HTTP TTFB / size / compression baseline (6 routes) |
| `dogfood-15-spike-variants.mjs` | 다양한 휴학 길이 (1w/2w/4w/8w/cycle) 비교 — 단일 휴학 안전, 반복 cycle만 치명적 |

---

## 5. 검증 안전망 (4중)

```
1. Vitest 442 단위 테스트 (1.95s)
   ↓
2. C4.1 dimension-mapping 회귀 (PR 마다 + weekly cron 둘 다)
   ↓
3. Next.js production build (Turbopack)
   ↓
4. promote-weights.mjs auto-rollback (가중치 변경 시 자동 검증)
```

### GitHub Actions

- **`pr-check.yml`**: PR 마다 lint + 442 tests + C4.1 + build 자동 게이트
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
- **Testing**: Vitest 4.1.7 (47 test files, 442 tests)
- **Backend (planned)**: vocab-cat-test FastAPI (Docker, separate container)
- **Deployment (planned)**: Vercel (Next.js) + Cloud Run (FastAPI)

**거부된 의존성**:
- Neo4j (Phase 2 P-7 spike로 평가)
- Turso (불필요)
- 별도 Node API server (Next.js Route Handlers 충분)
- Redux/Zustand (Server Components + localStorage 충분)

---

## 9. 진행 상황 종합 (2026-05-25 v19 sprint 종료 — retention 6 층위 정합 + RetentionDashboard 9번째 surface)

| Phase | 진행 |
|---|---|
| Phase 1 자동 검증 | **12/12 measured PASS** (C1.1 177 pytest + C1.2 theta variance 0.03) |
| Phase 1 본인 정성 | 1/2 (C2.1 잔여 — 자율 가능) |
| P-1 Recommendation v2 | 100% (8 weeks) |
| P-1.5 Bridge | 100% (1 week) |
| P-1.5b Varied Diagnostic + preset UI | 100% |
| P-2 EBS Content Foundation | 100% (6 weeks) |
| **P-2 W7 EBS wiring** | stub 수준 (v8 발견: contract mismatch + 인증 + 도메인 mismatch 3건 — [gap 분석](https://github.com/smilepat/myprojects/blob/main/docs/03-analysis/ebs-demo-integration-gap.md), adapter PR 1-2일 필요) |
| **Tier 1-3 Stability Roadmap** | 100% (7 작업 — schemas, write-protect, auto-sync, dependabot) |
| **Tier 4.1 A11y baseline** | 100% (12/12 WCAG 2.1 AA — desktop + mobile) |
| **vocab-cat-test 통합** | ✅ resolved (177 pytest, θ variance 0.03 → C1.2 measured PASS) |
| **Vercel Production 배포** | ✅ 본인 완료 |
| **Cloud Run vocab-cat-api 배포** | ✅ 2026-05-24 — `vocab-cat-api-452237528328.asia-northeast3.run.app` (1Gi/1cpu, allow-unauth, 9183 vocab, end-to-end 7/7 PASS) |
| **Vercel env NEXT_PUBLIC_VOCAB_CAT_TEST_URL** | ✅ Production + Development 연결 → `/diagnose` fallback panel 자동 해제 |
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
| **v5: queue.item_answered wiring** | /queue submit() 즉시 emit → 11 이벤트 자율 wiring **11/11 완료** (auth/calibration만 Supabase 대기 종속) |
| **v5: SessionAccuracyTrend sparkline** | C4.3 UI **실측 활성** — ≥2 세션부터 linear slope + ARIA, 5번째 closed-loop |
| **v5: error-log 100% lines coverage** | SSR 5건 + 비-배열 storage branch → 100/96.15/100/100 |
| **v5: AdaptiveDiagnosticStats (A8)** | /diagnose θ 추이 sparkline + KR1.1 (SD ≤ 0.3) + KR1.2 (≤ 25문항) badge + 최근 5건 |
| **v5: Stage A 백로그 소진** | 자율 가능한 6개 모두 완료 또는 Supabase 종속으로 분리. 다음 자율: coverage gap / mock script / dogfood-7 |
| **v6: mock-vocab-cat-test FastAPI stub** | offline dogfooding 가능 (CORS + seeded RNG + 7 contract tests). [가이드](https://github.com/smilepat/myprojects/blob/main/docs/03-analysis/dogfooding-without-backend.md) |
| **v7: dogfood-7 cohort forecast** | N=10/30/50 시뮬 6 seed 교차. baseline 4-8/10 → **exploration on 10/10 모든 seed**. 6번째 closed-loop 확정 ([analysis](https://github.com/smilepat/myprojects/blob/main/docs/03-analysis/dogfooding-7-cohort-forecast.md)) |
| **v7: CalibrationEventSync** | regression-history → analytics queue mirror. **11/11 analytics events 자율 wiring 완성** |
| **v7: coverage push** | diagnostic.ts 60→100%, analytics-events 76→100%, content-generator 89→96% lines. 전체 97.79% |
| **v8: Cloud Run 배포 ✅** | `vocab-cat-api-452237528328.asia-northeast3.run.app` (1Gi/1cpu, 9183 vocab, 7/7 PASS). Stage B-1 완료 |
| **v8: Vercel env wiring + redeploy** | `NEXT_PUBLIC_VOCAB_CAT_TEST_URL` Production+Development. `oelp-phi.vercel.app` /diagnose fallback panel 해제 |
| **v8: cloud-run-smoke CI job** | Sunday 03:00 UTC + workflow_dispatch. Cloud Run /health + verify-vocab-cat-test 자동. **11번째 CI gate** |
| **v8: 6번째 closed-loop 확정** | cohort exploration policy 영구화 (forecast → empirical 검증 → policy) |
| **v9: dogfood-8 다중 archetype** | 5 archetype 모두 D1_Form 0% gap closed → **archetype-independent structural defect** 확정 |
| **v9: 옵션 A 정량 검증** | TYPE-제목 D1 weight 0.05→0.20 simulation → 모든 archetype 66-70% gap 회복 입증 ([gap 분석](https://github.com/smilepat/myprojects/blob/main/docs/03-analysis/dogfooding-8-learning-curve-d1-plateau.md)) |
| **v9: 7번째 closed-loop 후보 PR ready** | D1_Form plateau breaker — `ontology-weights.json` TYPE-제목 1행만 수정. C4.1 게이트가 검증. Stage C 실 데이터 도착 시 검증 |
| **v10: 옵션 A1 단독 C4.1 거부** | weight 단독 변경은 도메인 모순 자동 catch ("선언만 있고 keyVariables 근거 없음") → 안전망 가치 정량 입증 |
| **v10: 옵션 A' 4 파일 동시 PR 설계** | dimension-mapping + kv-dim-mapping + ontology + weights 동시 변경 plan (1일 작업) |
| **v11: check-dim-coverage + dogfood-9** | keyVariable 매핑 자동 진단 + 5×5 plateau matrix scan (D1 5/5 archetype 일반화 확정) |
| **v12: 12번째 CI gate** | check-dim-coverage workflow 통합 (현재 D1 MISSING non-blocking, 옵션 A' PR 후 strict 활성) |
| **v12: simulate-option-a-prime** | 본인 4 파일 PR 사전 in-memory 검증 — tau 1.0→0.5, contradictions 0 → **시뮬 PASS** |
| **v13: dogfood-10 옵션 A' 효과 사전 측정** | production weight in-memory override → D1 +66-81%p 회복, D3 dominant -3%p, 다른 dim 변동 0 → **SAFE verdict** |
| **v13: PlateauWarningPanel** (`/sessions`) | 13번째 component, 학습자 4주+ 누적 시 자동 활성, D1 plateau 발견 시 옵션 A' PR 권장 메시지 + 설계 문서 링크 |
| **v13: 옵션 A' 4중 안전성 확보** | 시뮬 (simulate) / 매트릭스 (dogfood-10) / 실 검증 (PlateauWarningPanel) / CI gate (check-dim-coverage) — 본인 PR risk-free |
| **v14: Phase 2 PRD R6 정식 등록** | D1_Form structural defect를 PRD R6로 추가 (myprojects), R4 EBS 정정 — **5중 안전성** (PRD 정식 등록 추가) |
| **v14: /map UI D1 indicator** | 선택된 QT의 derived D1 = 0% 시 옵션 A' PR 권장 메시지 자동 표시. 6 층위 정합성 (PRD/시뮬/도구/실 UI/탐색 UI/설계) |
| **v15: dogfood-11 weight sensitivity** | 5 dim 각 +0.15 boost 시뮬 → D1만 MAJOR, 다른 dim SAFE (효과 미미). 미래 가중치 조정 PR 안전 가이드 |
| **v15: QueuePlateauNotice + bundle-size-audit** | 8번째 자동 활성 surface (큐 D1 targeting + plateau 시 경고) + 운영 모니터링 도구 (현 1.58MB / 3MB 47% 마진) |
| **v16: dogfood-12 forgetting curve** | 24주 Ebbinghaus sim → D1 **negative gap -72%** (학습 없음 + forgetting 누적 = 시간 갈수록 악화) → 옵션 A' PR 시간 차원 정당화 |
| **v16: c4-3-trend-cli.mjs** | lib/trend-analysis CLI 래퍼. CI/cron에서 누적 데이터 직접 분석 가능. 운영 모니터링 도구 6→8 |
| **v17: dogfood-13 forgetting + 옵션 A' 결합** | weak-D1/D2/D3에서 D1 **+113~160%p 회복**, side effect 0 → 시간 차원 정당화 **3 단계 완성** (plateau → negative gap → 회복) |
| **v17: c4-3-trend-cli 8 contract tests** | sentinel (D1 slope=0) → 옵션 A' PR 후 자동 flip, CLI ↔ lib drift 보호 |
| **v18: AGENTS.md + dogfood-14 + web-vitals-audit** | 다음 세션 onboarding 컨텍스트 9 절 + 휴학 후 복귀 sim (학습 패턴이 weight보다 중요) + production HTTP baseline → 운영 도구 8→9 |
| **v19: PRD R7 + dogfood-15 + RetentionDashboard** | 학습자 retention risk 정식 등록 + 단일 휴학 8w 안전 vs 반복 cycle만 치명적(-57.3%) 임계 정밀화 + 9번째 자동 활성 surface (safe/single-break/repeated-cycle 자동 분류) |

상세:
- 통합 회고: [`docs/04-report/oelp-integrated-summary.md`](https://github.com/smilepat/myprojects/blob/main/docs/04-report/oelp-integrated-summary.md) v19 (retention 6 층위 정합)
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

### Stage A — Claude 자율 가능 (v5 시점 사실상 소진 ☑️)

**기존 명목 항목 모두 완료**:

- ✅ C4.3 trend UI 통합 → v5: SessionAccuracyTrend sparkline (≥2 세션 즉시 활성)
- ✅ A8 `/diagnose` vocab-cat-test 통계 위젯 → v5: AdaptiveDiagnosticStats
- ✅ regression-history 검색/필터 → v2 sprint에서 완료
- ✅ error-log coverage 100% lines → v5: SSR-safety + 비-배열 storage branch
- ✅ queue.item_answered wiring → v5
- ⏸️ AdaptiveQueuePanel v2 — Supabase config 도착 후 자동 발생 (Stage B 종속)

**v5 시점 새 자율 후보** (필요 시):

- coverage 다음 gap: `lib/diagnostic.ts` 60% lines + `lib/analytics-events.ts` downloadEventQueue
- `scripts/mock-vocab-cat-test.mjs` — FastAPI 부재 시 offline dogfooding 가능하게
- `dogfood-7` — multi-learner cohort sim (Stage C forecast 정밀화)
- docs 보강 / cross-link refresh

### Stage B — 본인 1-2시간 결단
- ✅ Cloud Run vocab-cat-test 배포 ([runbook](https://github.com/smilepat/myprojects/blob/main/docs/03-analysis/vocab-cat-test-cloudrun-runbook.md)) — 2026-05-24 완료
- ⚠️ ~~EBS-demo Firebase config (코드는 wired)~~ — v8 발견: stub 수준. [gap 분석](https://github.com/smilepat/myprojects/blob/main/docs/03-analysis/ebs-demo-integration-gap.md), adapter PR 1-2일 필요
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
