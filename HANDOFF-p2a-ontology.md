# Handoff — p2a-ontology v1 세션 종료

> **Date**: 2026-05-26
> **세션**: Claude Code Opus 4.7 + smilepat
> **상태**: 2 PR open + GitHub 대기 (PR #6, #7). 코드 수정 시점은 끝났고 본인 결단/외부 의존 단계로 진입.
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

- 2026-05-26 v1: 본 핸드오프 작성. PR #6 + #7 open 상태. 자율 가능한 모든 작업 소진.
