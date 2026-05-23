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

## 2. 현재 상태 (v3 sprint 종료)

| 측면 | 수치 |
|---|---|
| Vitest tests | 249 (27 files) |
| Playwright e2e | 14 (12 A11y + 2 adaptive) |
| Routes | 7 (/ /diagnose /map /queue /sessions /regression-history + _not-found) |
| lib 모듈 | 18 |
| Scripts | 13 |
| Coverage (lines) | 95.51% (threshold 93/80/95/90) |
| WCAG 2.1 AA | 12/12 (desktop + mobile) |
| CI 단계 | 8 (lint → vitest → schema → README freshness → C4.1 → C4.2 → build → coverage) |
| GitHub Actions | 3 (pr-check, weekly-calibration, vocab-cat-test-smoke) |
| Dependabot | 4 npm groups + Actions ecosystem |
| 외부 배포 | Vercel Production |

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

순서대로:
1. `npm run lint` (ESLint, 0 errors)
2. `npm test` (Vitest 249 pass)
3. `node scripts/validate-schemas.mjs` (3 JSON schemas)
4. `node scripts/update-readme-counters.mjs --check` (README drift 0)
5. `node scripts/synthetic-validation-c4-1.mjs` (Kendall tau ≥ 0.4, contradictions = 0)
6. `node scripts/c4-2-diversity.mjs` (Jaccard non-blocking)
7. `npm run build` (Next.js build success)
8. `npm run test:coverage` (lines ≥ 93, branches ≥ 80, funcs ≥ 95, stmts ≥ 90)

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
| dogfooding 3 cycles | `03-analysis/dogfooding-pass-{1,2,3}.md` |
| vocab-cat-test 통합 | `03-analysis/vocab-cat-test-integration-resolved.md` (+ Cloud Run runbook) |
| Vercel 배포 | `03-analysis/vercel-deployment-runbook.md` |
| 통합 회고 | `04-report/oelp-integrated-summary.md` v3 |
| Stability sprint | `04-report/stability-roadmap-tier-1-3-complete.md` |

## 9. 본인이 해야 할 (Claude 자율 불가) 잔여

1. ☐ Cloud Run vocab-cat-test 배포 (30분, runbook 준비)
2. ☐ EBS-demo Firebase config (30분, 코드는 이미 wired)
3. ✅ vocab-cat-test PR #2 merge (CORS) — **resolved 2026-05-23**
4. ☐ 학습자 채널 ≥ 1명 확보 (Stage C 활성화)
5. ☐ 본인 dogfooding-3+ 진행 (preset UI 사용 후 calibration)

## 10. Sprint 작업 시 권장 순서 (개발 흐름 친화)

1. 깨질 위험이 있는 부분 → tests 먼저 (vitest + e2e)
2. Schema 변경 → schemas/*.json + AJV validate + Vitest negative cases
3. 새 lib module → coverage 그대로 유지 (95%+) 또는 tests 동시 추가
4. 새 route → A11y suite에 자동 포함 (e2e/a11y.spec.ts ROUTES 추가)
5. README 카운터 갱신 → 자동 (`npm run test:coverage` 후 commit 시)
6. PR 전 `npm run ci` 시뮬레이션

## 11. 변경 이력

- 2026-05-23 v1: 초기 (Phase 1 + P-1 + P-1.5 + P-2 완료)
- 2026-05-23 v2: Tier 1-4 stability + Vercel 배포 + vocab-cat-test 통합
- 2026-05-23 v3: dogfooding-3 + λ schedule + C4.3 scaffolding + 본 CLAUDE.md 정비
