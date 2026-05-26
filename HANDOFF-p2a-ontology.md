# Handoff — p2a-ontology v1 세션 종료

> **Date**: 2026-05-26 (v1) → 2026-05-26 후속 갱신 (v2) → 2026-05-26 Plan A 실행 (v3)
> **세션**: Claude Code Opus 4.7 + smilepat
> **상태 (v3)**: 🟡 **Plan A 실행 완료, GH Actions backlog 대기 중** — `pr-check.yml` 의 `npm ci` → `npm ci --include=optional` 수정 commit `339832b3` push 완료. 추가 force-trigger empty commit `eff0006`도 push. 그러나 GitHub Actions 가 새 commit (149b9e4, 339832b, eff0006) 에 대해 새 run 을 생성하지 않음 (이전 run 1fa21f40 이 04:57Z 부터 `queued` 상태 정체). `gh workflow run` manual dispatch 도 HTTP 500. **GH Actions infrastructure backlog 또는 free-tier minutes 소진 가능성**. 본인이 다음 세션에서 (1) run 자동 재개 확인 (2) 안 풀리면 GH billing 페이지 확인. 자세한 사항 §9 참조.
> **목적**: 다음 세션 (본인 단독 / 다른 Claude 세션) 이 이 문서 한 장으로 즉시 재개 가능하게.

---

## 0. 한 줄 요약

p2a-ontology v1 (Phonics-to-Academic Reading Ontology Engine) 의 코드 작업이 모두 완료되어 `feature/p2a-ontology` 브랜치에 **15 commits** + `chore/lint-cleanup` 브랜치에 **2 commits** 로 푸시 완료. **PR #6 + #7 리뷰/merge 만 본인이 진행하면 됨**. 나머지 7개 후속 항목은 외부 데이터/비용/UX 결단 의존.

---

## 1. Open PR 상태

### PR #6 — feature/p2a-ontology (15 commits)
**URL**: https://github.com/smilepat/oelp/pull/6

| commit | 내용 |
|---|---|
| `a302409` | **PR-1**: 6-layer skill graph data model + 33-node seed |
| `f59416c` | **PR-2**: keyVar→skill reverse index + 7 orphan rescue |
| `525d257` | **PR-3**: QT.skillIds column + simulate-skill-mapping (tau 0.6 preserved) |
| `48ea0ea` | **PR-4**: R10 distractor elimination surface |
| `e67f24f` | **PR-3.5**: OntologyMap skill layer overlay (33 nodes + 3 edge types) |
| `2b7c851` | **PR-3.6**: weakness→cause traceback violet panel |
| `44202fb` | **PR-6**: SkillMasteryRadar (10th surface) + skill-mastery derive |
| `202ac41` | **PR-7**: 5-category error pattern classifier |
| `5f8e4e5` | **PR-8**: prompt evolution rule-based MVP |
| `d9110f7` | **PR-7b**: dogfood-16 classifier accuracy (97.3%) |
| `a1b246d` | **PR-7c**: ErrorCategoryChart on /sessions (11th surface) |
| `1d479df` | **PR-3.7**: /teacher dashboard skeleton (8th route, 12th surface) |
| `ff5f8fb` | **PR-5 parking**: TYPE-일치불일치 design (no code) |
| `1b1a9d2` | a11y palette + session distractorPicked extension |
| `e43c042` | v20 sync: docs + dogfood-17 (5/5 monotonicity) + web-vitals /teacher |

### PR #7 — chore/lint-cleanup (2 commits)
**URL**: https://github.com/smilepat/oelp/pull/7

| commit | 내용 |
|---|---|
| `4830fec` | 9 baseline lint errors → 0 (AdaptiveDiagnostic / PlateauWarningPanel / queue) |
| `6441475` | irt-cold-start T7 PRNG 시드 → 5/5 결정적 통과 |

---

## 2. 검증 상태 (마지막 push 시점)

| Gate | 값 | 비고 |
|---|---|---|
| Vitest | **486/486** | 53 test files |
| Playwright A11y | **16/16** | 8 routes × 2 viewports + 2 adaptive |
| validate-skill-ontology.mjs | **PASS** | 33 nodes / 38 edges / 21 keyVars / 0 cycle / 0 orphan / 0 phantom |
| simulate-skill-mapping.mjs | **PASS** | Kendall tau 0.6 baseline 보존 |
| synthetic-validation-c4-1 | **PASS** | tau 0.6, contradictions 0 |
| dogfood-16 (classifier 정확도) | **97.3%** | target 80%, noisy 90.2% |
| dogfood-17 (monotonicity) | **5/5 PASS** | D1→S, D2→V, D3→D, D4→A, D5→R |
| npm run build | **10/10 페이지** PASS | /teacher 추가 |
| npm run lint (PR #7) | **0 errors** | 18 warnings 유지 |
| Bundle size | 1.66 MB / 3 MB | 55% margin |
| /teacher TTFB (local) | 7 ms | 54.2 KB compressed |

---

## 3. 본인 결단 필요 — 7 항목 (외부 의존)

### 즉시 가능

#### A. PR #6 + PR #7 GitHub 리뷰/merge
- PR #6: 15 commits를 그대로 squash merge 또는 commit chain 보존 merge
- PR #7: lint cleanup, 별도 PR이므로 #6 전후 어느 쪽이든
- merge 후 main 브랜치의 카운터 reset, README 자동 동기화

### 데이터 확보 후

#### B. PR-5b 활성화 — TYPE-일치불일치 신규 QT
- **트리거**: `csat-graphdb-318` 에 수능 26-28번 ~30문항 추가
- **체크리스트**: [docs/02-design/p2a-pr5-type-match-mismatch-design.md §5](docs/02-design/p2a-pr5-type-match-mismatch-design.md)
- **단계**: ontology.ts entry + weights v3 + kv-dim-mapping 확장 + simulate-skill-mapping 사전 검증 → PR open
- **위험**: C4.1 tau가 흔들릴 수 있음 → simulate가 사전에 catch

### 외부 인력 / 비용

#### C. PR-9 LLM 통합
- **트리거**: Anthropic SDK + cost ceiling 결단
- **현 상태**: PR-8에서 rule-based prompt-evolution 베이스라인 확보
- **PR-9 작업**: lib/prompt-evolution.ts 에 LLM 변형 호출 추가, ConfigurableContentGenerator 신규
- **검증**: A/B compare against rule-based (PR-8) — accuracy ≥ rule + cost 측정

#### D. 외부 학습자 ≥3명 확보
- **트리거**: 학습자 채널 (학원 / 학교 / 베타) 확보
- **/teacher 자동 효과**: mock mode toggle → real data path (`lib/teacher-aggregate.ts` 의 `LearnerInput[]` 입력만 바꾸면 됨)
- **추가 코드 필요**: multi-user session storage (현 `oelp.sessions.default` → per-user keys)

#### E. 본인 dogfooding 첫 실측 사이클
- 본인이 /diagnose + /queue 진행 → /sessions 에 데이터 축적
- `npm run dev` → 진단 → 큐 세션 4주 진행
- `node scripts/calibrate.mjs --responses <export.json> --auto-lambda --min 100 --out out/preview.json`
- `node scripts/promote-weights.mjs --calibration out/preview.json --reason "본인 dogfooding-1"`
- C4.1 게이트 + auto-rollback 활성화 확인

### UX 결단

#### F. /queue UI distractor 캡처
- **현 상태**: SessionResponseRecord 에 `distractorPicked?` 옵셔널 필드 (1b1a9d2 commit) — 백엔드 준비 완료
- **필요 작업**: /queue 페이지에서 어느 distractor 골랐는지 기록
  - 옵션 A: 자동 추론 — 선택한 option index 기반으로 distractor 매핑 (각 option에 메타데이터 필요)
  - 옵션 B: 명시 라벨 — 학습자가 "이건 함정인 듯" 라벨링 (UX 복잡도 증가)
  - 옵션 C: vocab card 스키마에 `optionDistractorMap: Record<number, string>` 추가 (Schema 변경)

#### G. CI gate 추가 결단
- **dogfood-16** (정확도 분류기) → CI gate 14 후보
- **dogfood-17** (monotonicity) → CI gate 15 후보
- **trade-off**: 게이트 증가 = 안정성 ↑ / PR 시간 ↑
- 본인 판단: 현 13 게이트로 충분 vs 안정성 추가

---

## 4. 재개 시 빠른 시작 가이드

### 4.1 환경 확인 (60초)

```bash
cd C:\tmp\oelp
git status                                     # clean인지 확인
git log --oneline main..feature/p2a-ontology   # 15 commits 보임
git log --oneline main..chore/lint-cleanup     # 2 commits
gh pr list                                     # #6 #7 open 상태
npm test                                       # 486/486 expected
node scripts/validate-skill-ontology.mjs       # PASS expected
node scripts/simulate-skill-mapping.mjs        # tau 0.6 PASS expected
```

### 4.2 어디서부터 작업하나?

| 시나리오 | 우선순위 | 다음 액션 |
|---|---|---|
| PR 머지 했음, 새 feature 시작 | 보통 | bkit `/pdca plan <feature>` 또는 직접 시작 |
| 데이터 확장 도착 | 높음 | PR-5b 활성 — [§3.B 체크리스트](docs/02-design/p2a-pr5-type-match-mismatch-design.md#5-실-활성화-시-pr-5b-체크리스트-참고용) |
| LLM 통합 결심 | 중간 | PR-9 design 신규 — `docs/02-design/p2a-pr9-llm-integration-design.md` 작성 |
| 학습자 확보 | 매우 높음 | /teacher mock → real, multi-user session storage 신규 |
| Dogfooding 첫 실측 | 즉시 가능 | §3.E 명령어 실행 |

### 4.3 핵심 파일 맵

```
lib/
  skill-ontology.ts          # PR-1 — 그래프 헬퍼 (getAncestors, detectCycle 등)
  skill-ontology-seed.json   # 33 nodes / 38 edges (canonical)
  skill-from-keyvar.ts       # PR-2 — keyVar → skill 역방향 인덱스
  reasoning-strategies.ts    # PR-4 — R10 7종 회피 전략
  skill-mastery.ts           # PR-6 — 5D → layer 변환
  skill-causal-trace.ts      # PR-3.6 — 약점→원인 BFS
  error-pattern-analyzer.ts  # PR-7 — 5분류기 (rule-based)
  prompt-evolution.ts        # PR-8 — 프롬프트 개선 루프
  teacher-aggregate.ts       # PR-3.7 — 반 단위 집계
  teacher-mock-learners.ts   # PR-3.7 — 5명 합성 프로필

components/
  SkillMasteryRadar.tsx      # 10번째 surface
  ErrorCategoryChart.tsx     # 11번째 surface
  SkillHeatmap.tsx           # 12번째 surface

scripts/
  validate-skill-ontology.mjs           # CI gate 13
  simulate-skill-mapping.mjs            # PR-3 사전 검증
  prompt-iterate.mjs                    # PR-8 ops 도구
  dogfood-16-error-pattern-accuracy.mjs # 97.3% baseline
  dogfood-17-skill-mastery-monotonicity.mjs # 5/5 PASS baseline

docs/
  01-plan/p2a-ontology-plan.md              # 전체 계획 (이미지 반영됨)
  02-design/p2a-pr1-skill-ontology-design.md
  02-design/p2a-pr5-type-match-mismatch-design.md  # 활성 체크리스트
  03-analysis/dogfood-16-*                  # 분류기 정확도 보고서
  03-analysis/dogfood-17-*                  # monotonicity 보고서
```

### 4.4 알아두면 좋은 것

- **C4.1 게이트는 weights 변경 시에만 흔들림**. skill ontology 확장은 무영향 — simulate-skill-mapping.mjs로 확인 가능.
- **기존 5D mastery 가 canonical**. skill mastery는 derived view — 5D 변경 없이 skill 추가 가능.
- **P-layer (Phonics) 는 v1에서 의도적 제외**. 페르소나 P1 (초등) Stage C 활성 후 v2.
- **A6-A10도 v2 대기**. 페르소나 P2 확정 후.
- **/teacher 는 mock mode 디폴트 ON**. multi-user storage 활성 후 toggle off.
- **distractor 캡처 인프라는 준비됨** (`SessionResponseRecord.distractorPicked?`). UI wiring만 필요.

---

## 5. 알려진 제한 / 정직 기록

1. **dogfood-16 합성 100% / noisy 90.2%** — 합성 시나리오는 분류 규칙의 부분 mirror. 실 학습자 응답은 더 비선형적일 수 있음.
2. **/teacher mock 5명** — 실 데이터 패턴과 다름. dogfood-9 archetype에서 차용했으나 실 분포 대체 불가.
3. **skill-from-keyvar phantom check** — 신규 keyVar 추가 시 skill seed 동기화 필수 (CI gate 13이 catch).
4. **C4.1 tau 0.6 baseline** — PR-5b TYPE-일치불일치 추가 시 흔들릴 수 있음. simulate-skill-mapping이 사전 검증.
5. **9 lint warnings 잔존** — unused-vars 만 남음, PR #7 머지 후 별도 cleanup PR로 처리 가능.
6. **PR #6 15 commits 큰 PR** — squash vs commit chain 보존은 본인 선호 결정.

---

## 6. 메모리 / 컨텍스트 보존

자동 메모리 시스템 (`C:\Users\eltko\.claude\projects\C--Users-eltko\memory\`) 에 다음 두 항목 신규/갱신:

- `project_session_20260526.md` — 본 세션 작업 요약 + PR 링크
- `project_oelp_p2a_ontology.md` — p2a-ontology v1 architecture 영구 기록

다음 세션에서 `MEMORY.md` index를 통해 자동 로드됨.

---

## 7. 변경 이력

- **v3** (2026-05-26 동일 세션 연속): Plan A 실행 — `pr-check.yml` 의 `npm ci --include=optional` 수정 + force-trigger empty commit. GH Actions 가 새 commit 에 대해 run 미생성 → §9 추가, §0 상태 배너 갱신.
- 2026-05-26 v1: 본 핸드오프 작성. PR #6 + #7 open 상태. 자율 가능한 모든 작업 소진.
- 2026-05-26 v2: 후속 세션에서 CI 실패(lockfile drift) 발견 → §8 신규 + 상단 상태 배너 정정. 머지 선결 조건 명시.

---

## 8. CI 차단 — lockfile drift (v2 신규)

### 8.1 증상

- PR #6 (run `26433153570`) · PR #7 (run `26430241591`) — 둘 다 `test-and-build` job FAILURE
- Vercel preview deploy 는 SUCCESS · Sourcery review SUCCESS · `mergeable=MERGEABLE` (conflict 없음)
- 즉 코드 자체는 valid, **CI 환경 의존성만** 문제

### 8.2 원인

```
npm error code EUSAGE
npm error `npm ci` can only install packages when your package.json and
package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock
file with `npm install` before continuing.
npm error
npm error Missing: @emnapi/runtime@1.10.0 from lock file
npm error Missing: @emnapi/core@1.10.0 from lock file
```

- `package.json` 에 `@emnapi/*` 직접 의존 0건 · `package-lock.json` 에 15회 출현 → **transitive optional dep**
- Windows 로컬에서 `npm install` 시 "up to date" 반환 (Windows에선 emnapi 불필요) 하지만 **Linux CI(`npm ci`)에선 platform-specific optional dep 필요**
- 결론: **Windows 로컬에서 생성된 lockfile이 Linux용 optional dep 항목을 누락** — cross-platform drift

### 8.3 Recovery 옵션

**Plan A — CI 워크플로 수정** (추천, 최소 침습)
```
1. main 브랜치에 hotfix PR — .github/workflows/*.yml 의 `npm ci` 를 `npm ci --include=optional`
   또는 `npm install --no-save` (npm v10 기준 동작 차이 사전 검증)
2. 두 PR(#6, #7) 을 main 에 rebase → CI 재실행
3. 머지 진행
```
예상 +15분 · 1줄 변경 · risk 낮음

**Plan B — lockfile 전면 재생성**
```
1. WSL/Docker Linux 환경에서 rm package-lock.json && npm install
2. 두 PR 브랜치에 각각 적용 + push
3. 머지 진행
```
예상 +30분 · 큰 diff · 다른 dep 버전도 흔들릴 risk

**Plan C — dogfooding 먼저, CI fix 보류**
```
1. plan 1/2(머지) 보류, plan 3(dogfooding) 먼저 시작
2. 백그라운드로 CI fix
```
예상 +0분 · 단점: PR stale, /teacher 등 신규 라우트 production 진입 지연

### 8.4 production 배포 검증 (참고)

- **Production URL**: https://oelp-phi.vercel.app (HTTP 200 live)
- `/` 200 ✅ · `/diagnose` 200 ✅ · `/teacher` 404 ⚠️ (PR #6 머지 전이라 미배포)
- PR #6 merge 후 자동 production 갱신 예정 (Vercel ↔ GitHub 연동)

### 8.5 v1 → v2 진술 정정

v1 §0 "코드 수정 시점은 끝났고 본인 결단/외부 의존 단계로 진입" 은 **부분만 사실**. CI fix 는 외부 의존 아닌 **자율 가능한 코드/워크플로 수정 작업**. 다음 세션은 머지 전에 Plan A/B/C 선택 후 실행 필요.

### 8.6 부수 발견

- `data/` 디렉토리에 untracked JSON 9건 (`dogfood-*.json`, `fake-responses.json` 등) — `.gitignore` 등록 또는 정리 결단 필요
- Node 20 deprecation 경고 (2026-06-02 부터 Node 24 강제) — 별도 PR 권장

---

## 9. Plan A 실행 결과 — GH Actions backlog 정체 (v3)

### 9.1 실행한 변경

| Commit | 내용 |
|---|---|
| `339832b3` | `pr-check.yml` Install deps step: `npm ci` → `npm ci --include=optional` (3행 +주석) |
| `eff0006` | Empty commit "force CI re-run" — GH Actions 가 339832b 에 대해 run 안 만들어서 강제 trigger 시도 |

코드 fix 자체는 정확. Linux runner 가 `--include=optional` 으로 `@emnapi/*` 를 lockfile 무관하게 보강 설치하게 됨.

### 9.2 차단 사유 — GH Actions side

- 새 commit (149b9e4, 339832b, eff0006) 3건 모두 workflow run 미생성. `gh api repos/smilepat/oelp/actions/runs?head_sha=...` 결과 0건.
- 이전 run (1fa21f40, 04:57Z) 은 `queued` 상태로 정체. 04:57Z 부터 진행 안 됨.
- `gh workflow run pr-check.yml --ref feature/p2a-ontology` → **HTTP 500 Failed to run workflow dispatch**
- Repo Actions 권한 확인: `{"allowed_actions":"all","enabled":true}` — 정상
- Workflow state: `active` — 정상

**가장 가능성 높은 원인**:
1. **GH Actions free-tier minutes 소진** (smilepat 계정) — 매월 1일 reset
2. **GH Actions infrastructure backlog** — status.github.com 확인 필요

### 9.3 다음 세션 액션

**Step 1** — `gh run list --limit 3` 으로 queue 풀렸는지 확인. 풀렸다면 `gh pr checks 6 --watch` 로 새 run 결과 대기 → 통과 시 §9.4 로.

**Step 2** — 아직도 정체 시 https://github.com/settings/billing/summary 에서 Actions usage 확인. minutes 소진이면 다음 달 1일까지 대기 또는 plan upgrade.

**Step 3** — backlog 가 정말 풀리지 않으면 Plan B 전환 (WSL/Docker 에서 `rm package-lock.json && npm install` 로 lockfile 재생성). 이 경우 339832b commit 은 revert 또는 유지 (둘 다 호환).

### 9.4 CI 통과 후 머지 순서

1. PR #6 squash merge (main → 자동 production 배포 → `/teacher` 활성)
2. PR #7 rebase against main (workflow fix 가 main 에 있으므로 자동으로 CI 통과 예정) → squash merge
3. Dependabot PR #2 (checkout v6), #1 (upload-artifact v7), #3-5 (npm deps) 검토 후 merge
4. dogfooding 첫 사이클 시작 (`/diagnose` → `/queue` → `promote-weights.mjs`)

### 9.5 부수 정리

- Empty commit `eff0006` 은 머지 시 squash 되어 history 에서 사라짐 — 문제 없음
- HANDOFF v3 commit 후 본 세션 종료. 본인이 다음 세션에서 §9.3 Step 1 부터 재개.

