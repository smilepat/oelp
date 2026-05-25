@AGENTS.md

---

# OELP — Claude Code 작업 가이드

> Last updated: 2026-05-23 sprint v3 종료
> Maintainer: smilepat (solo dev)
> Sibling: smilepat/myprojects (docs) · smilepat/vocab-cat-test (FastAPI backend)

## 1. 이 레포가 뭔가

OELP = LogicFlow EdTech 생태계의 **통합 학습 플랫폼** (Next.js 16 + Vercel deployed).

- 자산 통합 레이어: vocabulary-db (private) + csat-graphdb-318 정의 + vocab-cat-test backend + vocab-learn-pat UI 패턴
- 신규 빌드가 아니라 **dispersed assets → single UX** 변환기
- Phase 1 MVP + P-1 추천 v2 + P-1.5/b Bridge + P-2 EBS Foundation **모두 완료**
- 자동 평가 12 C 기준 **12/12 measured PASS** (C1.1/C1.2 vocab-cat-test 실측 포함)

## 2. 현재 상태 (v9 sprint 종료 — Stage B 진입 + 7번째 closed-loop 후보 확정)

| 측면 | 수치 |
|---|---|
| Vitest tests | 342 (36 files) |
| Playwright e2e | 14 (12 A11y + 2 adaptive) |
| Routes | 7 (/ /diagnose /map /queue /sessions /regression-history + _not-found) |
| lib 모듈 | 20 |
| Scripts | 21 (dogfood-8 multi-archetype + d1-boost 추가) |
| Components | 12 |
| Coverage (lines) | 97.79% (threshold 93/80/95/90) |
| WCAG 2.1 AA | 12/12 (desktop + mobile, **Production URL 검증 12/12 PASS**) |
| CI 단계 | 11 (lint → vitest → schema → README freshness → C4.1 → C4.2 → build → coverage → A11y desktop/mobile → cross-link → cloud-run-smoke) |
| GitHub Actions | 3 (pr-check, weekly-calibration, vocab-cat-test-smoke + cloud-run-smoke job) |
| 외부 배포 | **Vercel + Cloud Run 양쪽 Production** (`oelp-phi.vercel.app` + `vocab-cat-api-452237528328.asia-northeast3.run.app`) |
| Analytics events | 11/11 자율 wiring 완성 (Supabase config 대기) |
| Closed-loop iterations | **6 확정** (Tier 1-3 → λ → exploration → adaptive prep → adaptive verify → cohort exploration) + **7번째 후보 발견** (D1_Form plateau) |

## 3. 자주 쓰는 명령

```bash
npm run dev              # localhost:3001 (fallback if 3000 점유)
npm run build            # production build
npm test                 # Vitest 249 tests
npm run test:coverage    # + 95% threshold gate
npm run test:a11y        # Playwright 14 e2e
npm run lint             # ESLint
npm run ci               # lint + test + C4.1 + build

# Data
node scripts/build-vocab-pool.mjs                     # vocabulary-db CSV → lib/vocabulary-pool.ts
node scripts/update-readme-counters.mjs               # README ↔ filesystem 동기화
node scripts/validate-schemas.mjs                     # 3 JSON 파일 schema 검증

# Calibration cycle
node scripts/calibrate.mjs --responses <path> --auto-lambda --min 100 --out out/preview.json
node scripts/promote-weights.mjs --calibration out/preview.json --dry-run
node scripts/promote-weights.mjs --calibration out/preview.json --reason "..."  # auto-rollback if C4.1 FAIL

# dogfooding-3 simulator
node scripts/dogfood-3-presets.mjs --learners 10 --sessions 4

# vocab-cat-test integration (Docker 미설치 시 Python venv 경로)
cd ../vocab-cat-test && ./irt_cat_engine/.venv/Scripts/uvicorn.exe irt_cat_engine.api.main:app --port 8000
ALLOWED_ORIGINS="http://localhost:3000,http://localhost:3001" node scripts/verify-vocab-cat-test.mjs
```

## 4. 아키텍처 핵심 결정 (변경 시 도큐 갱신)

### 4.1 단일 소스 원칙

- 가중치 source of truth: `lib/ontology-weights.json` (schema-protected, lastWriter required)
- QT 정의 source: `lib/ontology.ts` (자동 동기화 → dimension-mapping-consistency.test.ts)
- 5D 매핑 source: smilepat/myprojects `docs/01-plan/dimension-mapping.md` §1.2 (snapshot in tests)

세 곳이 drift 시 CI 즉시 fail (T2.3 gate).

### 4.2 4중 안전망

```
1. Vitest 249 단위 테스트 (PR마다)
2. C4.1 도메인 모순 게이트 (Kendall tau ≥ 0.4 + contradictions = 0)
3. Next.js production build
4. promote-weights.mjs auto-rollback (가중치 변경 시도 시)
```

**3 cycles 누적 검증**: dogfooding-1 (D2 over), dogfooding-2 (D3 under), dogfooding-3 (D5 over) — 모두 자동 catch + rollback. `/regression-history` 페이지에서 시각화.

### 4.3 λ schedule (auto-lambda)

`scripts/calibrate.mjs --auto-lambda`:
- N < 100 → λ=2.0
- 100-500 → 1.5
- 500-2000 → 1.0
- 2000-10k → 0.7
- > 10000 → 0.5

dogfooding-3 L2 finding으로 도입. 외부 학습자 N≥50 누적 시 threshold 재조정.

## 5. 흔한 함정 (committed-and-fixed 이력)

### 5.1 TypeScript narrowing across closures
`if (!plan) return <Loading/>` 만으로는 nested function closures 안에서 narrowing 안됨.
**해결**: `const planNonNull = plan;` 후 `planNonNull.*` 사용 (app/queue/page.tsx 사례)

### 5.2 Chart.js 4.x RadarController 명시 등록
v4부터 `Chart.register(RadarController)` 필요. components/GrowthRadar.tsx에 등록됨.

### 5.3 ESLint react-hooks/set-state-in-effect (Next 16)
useEffect 안에서 setState는 strict rule로 차단.
**해결책 둘**:
- `useSyncExternalStore` (localStorage 구독 시) — /sessions, /regression-history 사용
- `// eslint-disable-next-line react-hooks/set-state-in-effect` (one-shot URL+localStorage hydration) — /diagnose, /queue 사용

### 5.4 PowerShell UTF-8 BOM
`Out-File -Encoding utf8` 가 BOM 추가 → GitHub API JSON 파싱 실패. UTF8Encoding($false) 사용.

### 5.5 Bash chained chained command directory
`cd subdir && cmd && cd ..` 패턴 회피. 절대 경로 사용. (Claude는 working directory가 다른 곳에서 호출되기도 함)

### 5.6 vocab-cat-test 5D 차원 명 매핑
vocab-cat-test (semantic/contextual/form/relational/pragmatic) ↔ OELP (D2/D3/D1/D4/D5).
**위치**: components/AdaptiveDiagnostic.tsx DIM_MAP, scripts/verify-vocab-cat-test.mjs DIM_MAP. 둘 다 일치 유지.

### 5.7 vocab-cat-test CORS for OELP dev
**(Resolved 2026-05-23)** PR #2 merged → ALLOWED_ORIGINS 기본값에 `http://localhost:3000`, `localhost:3001` 자동 포함. env var 무설정 동작.

### 5.8 isDiagnosticInput vs schema 분리
`lib/diagnostic.ts isDiagnosticInput`은 permissive (typeof === "object" → null 허용).
엄격한 검증은 `schemas/diagnostic-input.schema.json` AJV. 의도된 분리.

## 6. CI 강제 조건 (PR Block 사유)

순서대로 (10 stages):
1. `npm run lint` (ESLint, 0 errors)
2. `npm test` (Vitest 305 pass)
3. `npm run test:coverage` (lines ≥ 93, branches ≥ 80, funcs ≥ 95, stmts ≥ 90)
4. `node scripts/validate-schemas.mjs` (3 JSON schemas)
5. `node scripts/update-readme-counters.mjs --check` (README drift 0)
6. `node scripts/synthetic-validation-c4-1.mjs` (Kendall tau ≥ 0.4, contradictions = 0)
7. `node scripts/c4-2-diversity.mjs` (Jaccard non-blocking)
8. `npm run build` (Next.js build success)
9. A11y e2e (axe-core, 6 routes × 2 viewports = 12 WCAG 2.1 AA)
10. `node scripts/check-cross-repo-links.mjs` (smilepat/* /blob/ URLs 404 ≤ 0)

하나라도 fail이면 PR merge 차단.

## 7. 도메인 컨벤션

- **페르소나 P0**: 고2 EFL 학습자 (수능 D-365)
- 베타 모집 불가 — dogfooding + 합성 검증 + 본인 정성 평가가 검증 채널
- 페르소나 P1 (Phonics, 초등) / P2 (Teacher Dashboard, B2B) 등은 Phase 2 v2 Stage C (학습자 채널 확보 후만)
- 데이터 자산: vocabulary-db 9183 단어, csat-text-master 50지문, csat-graphdb-318 565문항 모두 private 또는 internal

## 8. 작업 시 자주 참조하는 docs

| 주제 | docs/* 위치 (myprojects) |
|---|---|
| PRD | `01-plan/prd-oelp-mvp-phase1.md` |
| 5D × QT 매핑 | `01-plan/dimension-mapping.md` |
| 백로그 | `01-plan/phase2-backlog.md` + `phase2-backlog-v2.md` |
| C4.1 v2 weights | `03-analysis/synthetic-validation-c4-1-v2.md` |
| dogfooding 5 cycles | `03-analysis/dogfooding-pass-{1,2,3,4}.md` + `exploration-policy-long-run-analysis.md` |
| D5 root cause | `03-analysis/d5-bias-root-cause-analysis.md` |
| vocab-cat-test 통합 | `03-analysis/vocab-cat-test-integration-resolved.md` (+ Cloud Run runbook) |
| Vercel 배포 | `03-analysis/vercel-deployment-runbook.md` |
| 통합 회고 | `04-report/oelp-integrated-summary.md` v4 |
| Stability sprint | `04-report/stability-roadmap-tier-1-3-complete.md` + `stability-roadmap-v2.md` |
| Phase 2 PRD | `01-plan/prd-oelp-mvp-phase2.md` + `phase2-backlog-v2.md` |
| W9 exploration | `02-design/phase2-p1-recommendation-w9-exploration.md` |
| Stage C forecast | `03-analysis/stage-c-activation-simulation.md` |
| Phase 2 chunk template | `04-report/_template-phase2-chunk-end.md` |
| Docs INDEX (auto) | `docs/INDEX.md` |

## 9. 본인이 해야 할 (Claude 자율 불가) 잔여

1. ☐ Cloud Run vocab-cat-test 배포 (30분, runbook 준비)
2. ☐ EBS-demo Firebase config (30분, 코드는 이미 wired)
3. ✅ vocab-cat-test PR #2 merge (CORS) — **resolved 2026-05-23**
4. ☐ 학습자 채널 ≥ 1명 확보 (Stage C 활성화)
5. ☐ 본인 dogfooding-3+ 진행 (preset UI 사용 후 calibration)

## 10. Sprint 작업 시 권장 순서 (5 dogfooding cycles 학습 기반)

### 10.1 일반 작업 순서
1. 깨질 위험이 있는 부분 → tests 먼저 (vitest + e2e)
2. Schema 변경 → schemas/*.json + AJV validate + Vitest negative cases
3. 새 lib module → coverage 그대로 유지 (95%+) 또는 tests 동시 추가
4. 새 route → A11y suite에 자동 포함 (e2e/a11y.spec.ts ROUTES 추가)
5. 새 cross-repo URL → check-cross-repo-links.mjs CI gate 자동 검증
6. 새 myprojects 문서 → INDEX.md 자동 (myprojects CI gate)
7. README 카운터 갱신 → 자동 (`npm run test:coverage` 후 commit 시)
8. PR 전 `npm run ci` 시뮬레이션

### 10.2 발견 → 코드 → 검증 → 정책 패턴 (4 closed-loops 적용)
시뮬레이션이나 실측에서 새 finding 발견 시:
1. **발견 명시**: docs/03-analysis/{finding-name}.md 작성 (정량 데이터 포함)
2. **PRD 등록**: prd-oelp-mvp-phase2.md §5 R{N} 추가 (severity + 검증 방법)
3. **코드 prep**: lib에 helper 추가 + `off` default (외부 데이터 도착 시 활성)
4. **테스트**: positive + negative + boundary 케이스
5. **시뮬레이터 검증**: dogfood-N+1 시나리오 작성 (재현성 위해 seeded)

→ Tier 1-3 / λ schedule / exploration / adaptive threshold (R5) 4건 이 패턴 따름.

### 10.3 dogfooding cycle 진행 체크리스트
- 본인/외부 학습자 응답 누적 → /sessions calibration JSON export
- `node scripts/calibrate.mjs --responses <path> --auto-lambda --min 100 --out out/preview.json` (dry-run)
- `node scripts/promote-weights.mjs --calibration out/preview.json --dry-run` (변경 검토)
- `node scripts/promote-weights.mjs --calibration out/preview.json --reason "..."` (apply, C4.1 게이트 + auto-rollback + regression-history auto-append)
- 결과 → docs/03-analysis/dogfooding-pass-{N}.md

## 11. 변경 이력

- 2026-05-23 v1: 초기 (Phase 1 + P-1 + P-1.5 + P-2 완료)
- 2026-05-23 v2: Tier 1-4 stability + Vercel 배포 + vocab-cat-test 통합
- 2026-05-23 v3: dogfooding-3 + λ schedule + C4.3 scaffolding + 본 CLAUDE.md 정비
- 2026-05-24 v4: 5 dogfooding cycles + W9 exploration + R5 long-run + CI 10 gates + §10 closed-loop 패턴 명시
- 2026-05-24 v5-v7: Stage A 백로그 소진 (mock script / dogfood-7 / CalibrationEventSync / coverage 97.79%) + 6번째 closed-loop 확정
- 2026-05-24 v8: **Cloud Run 배포 완료** (asia-northeast3, 7/7 PASS) + Vercel env wiring + cloud-run-smoke CI (11번째 gate) + EBS 옵션 B 재정의 (1-2일 PR)
- 2026-05-24 v9: dogfood-8 다중 archetype + 옵션 A 정량 검증 → **D1_Form plateau가 5 archetype 모두에서 0%** + 옵션 A1 (TYPE-제목 weight 0.05→0.20) **66-70% 회복** 입증 → 7번째 closed-loop 후보 PR ready
- 2026-05-24 v10: **C4.1 게이트가 옵션 A1 단독을 거부** ("선언만 있고 keyVariables 근거 없음") → 안전망 가치 정량 입증 + 옵션 A' 정식 설계 (4 파일 동시 PR — keyVariables 신규 3개 + weight) + weak-D1 archetype 추가로 A3 D5 약화 부작용 발견 → A1 single 안전성 재확인
- 2026-05-24 v11: **check-dim-coverage.mjs 신규** (keyVariable 매핑 자동 진단, exit 1 if missing dim) + **dogfood-9 5×5 plateau matrix scan** (D1 plateau가 모든 5 archetype에 일반화 확정 + 다른 4 dim 안전성 검증) + content-validators V3/V6 edge case 커버리지 92→95% + session memory v9-v11 갱신
- 2026-05-24 v12: **check-dim-coverage CI gate (12번째)** + **simulate-option-a-prime.mjs** (본인 4 파일 PR 사전 in-memory 검증 → tau 1.0→0.5 PASS, contradictions 0) + dogfood-9 정식 보고서 (myprojects) + 옵션 A' PR safe 사전 확인 완료
- 2026-05-24 v13: **simulate-option-a-prime contract test** (7 sentinel tests) + **dogfood-10** (옵션 A' 효과 사전 측정 → D1 0%→66-81%, D3 -3%p, **SAFE verdict**) + **lib/plateau-detection.ts + PlateauWarningPanel** (13번째 component, 학습자 4주+ 누적 시 자동 활성 + D1 plateau 발견 시 옵션 A' PR 권장) → 옵션 A' PR **4중 안전성 확보** (시뮬 / 매트릭스 / 실 검증 / CI gate)
- 2026-05-25 v14: **Phase 2 PRD R6 정식 등록** (D1_Form structural defect) + R4 EBS 정정 + **/map D1 indicator** (derived 0% QT에 옵션 A' PR 권장 메시지 자동) → 단일 finding이 PRD/시뮬/도구/실 UI/탐색 UI 6 층위 정합 표현 → 본인 PR **5중 안전성** (PRD 정식 등록 추가)
- 2026-05-25 v15: **dogfood-11 weight sensitivity** (5 dim 각 +0.15 boost 시뮬 → D1만 MAJOR, 다른 dim SAFE — 미래 PR 안전 가이드) + **QueuePlateauNotice** (8번째 surface, /queue에서 D1 targeting + plateau confirmed 시 경고) + **bundle-size-audit.mjs** (현 1.58MB / 3MB 47% 마진)
- 2026-05-25 v16: **dogfood-12 forgetting curve** (24주 Ebbinghaus sim → D1 **negative gap -72%**, 학습 없음 + forgetting 누적 = 시간 갈수록 악화 → 옵션 A' PR **시간 차원 정당화**) + **scripts/c4-3-trend-cli.mjs** (lib/trend-analysis CLI 래퍼, CI/cron 사용 가능) → 운영 모니터링 도구 6→8
- 2026-05-25 v17: **dogfood-13 forgetting + 옵션 A' 결합** (weak-D1/D2/D3에서 D1 **+113~160%p 회복**, side effect 0, SAFE verdict) + **dogfood-12 정식 보고서** (myprojects docs) + c4-3-trend-cli **8 contract tests** (sentinel: D1 slope=0) → 옵션 A' PR 시간 차원 정당화 **3 단계 완성** (plateau → negative gap → 회복)
- 2026-05-25 v18: **AGENTS.md 갱신** (다음 세션 Claude onboarding 컨텍스트 9 절) + **dogfood-14 spike pattern** (휴학×2 후 모든 dim negative gap → 학습자 retention > 모집) + **web-vitals-audit.mjs** (production HTTP TTFB/size/compression baseline) → 운영 모니터링 도구 8→9
