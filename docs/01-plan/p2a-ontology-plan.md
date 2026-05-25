# PDCA Plan — p2a-ontology

> Phonics-to-Academic Reading Ontology Engine를 OELP에 적용하는 계획서
> Feature: `p2a-ontology` · Phase: **Plan**
> Author: smilepat · Date: 2026-05-25 · Source proposal: 2026-05-25 23:10 KST 메모

---

## 0. 한 줄 요약

OELP의 **5D × 10 QT × 21 keyVariables** 어휘-수능 온톨로지를 깨지 않고, 제안의 **P→V→S→D→R→A 5 레이어**를 **상위 레이어**로 얹어서 현 자가진화 자산(6 closed-loops + 12 CI gates + 9 surfaces)을 그대로 재사용하는 **incremental ontology 확장** 계획.

---

## 1. 적용 범위 결정 (페르소나 충돌 해소)

### 1.0 시각 참조: 온톨로지 기반 영어 학습 로드맵

본 plan은 첨부 로드맵 이미지(`docs/01-plan/assets/p2a-roadmap.png` 권장 위치)를 정식 시각 사양으로 채택한다. 이미지의 구조:

- **최종 목표 (상단)**: 수능 영어 문제해결 역량 — 고난도 독해력 / 논리적 사고력 / 문제 해결력 / 전략적 적용력
- **중심 노드**: 의미 이해 (Reading Comprehension)
- **5-tier 계층** (위→아래):
  - T1: 문맥 이해 · 요지/주제 파악 · 세부 정보 파악
  - T2: 문장 이해력 · 글의 구조 이해 · 논리적 추론
  - T3: 기본 문법 개념 · 문법 활용력 · 어휘력 확장
  - T4: 기본 어휘력 · 기본 문장력
  - T5: 비판적 사고 (최하단 토대)
- **파닉스 토대 (별도 cluster)**: 음소 인식 · 알파벳 이해 · 소리-문자 대응 · 철자 규칙 · 음절/음운 구분 + 듣기/읽기/쓰기/말하기 기초
- **학년 타임라인 (좌측)**: 초등1-3 → 초등4-6 → 중학교 → 고등학교 → 수능
- **엣지 3종 (공식 라벨)**:
  - `핵심 의존 관계` (solid 실선, 굵게) — prerequisite
  - `보조적 영향 관계` (dashed 점선) — supports
  - `간접적 연관 관계` (dotted 더 옅은 점선) — impacts/related

### 1.1 충돌 지점 (학년 타임라인 추가)

| 제안 레이어 | 학년 타임라인 (이미지) | 페르소나 P0 (고2 수능) 적합도 | 결단 |
|---|---|---|---|
| **A. Phonics (P1-P7)** | 초등 1-3학년 | ❌ 부적합 | **MVP 제외** → Stage C 후 v2 |
| **B. Foundation (V1-V5 + S1-S5)** | 초등 4-6학년 | ⚠️ 부분 적합 (V는 5D, S 미커버) | **MVP 포함** (S 신규) |
| **C. Discourse (D1-D8)** | 중학교 | ✅ 적합 (D3_Context 분해) | **MVP 포함** (sub-skill 8개) |
| **D. Reasoning (R1-R10)** | 고등학교 | ✅ 적합 (10 QT 상위 카테고리) | **MVP 포함** (QT→R 매핑) |
| **E. Academic (A1-A10)** | 고등→수능 | ⚠️ A1-A5 일부 적합 | **A1-A5만** MVP 포함 |

**학년 컬럼은 PR-1 skill seed의 `grade_level` 필드로 저장**하여 향후 페르소나 확장 시 필터링 가능하게 함.

근거: [CLAUDE.md §7 도메인 컨벤션](../../CLAUDE.md) — 페르소나 P1 Phonics는 Phase 2 v2 Stage C (학습자 채널 확보 후) 명시.

### 1.2 MVP 적용 결단

```
✅ S-layer (Sentence) 5개 skill 신규
✅ D-layer (Discourse) 8개 sub-skill (현 D3_Context 분해)
✅ R-layer (Reasoning) 10 QT → R1-R10 상위 매핑
✅ A-layer A1-A5 (수능 비문학에 등장하는 academic 패턴)
⏸ P-layer Phonics — Stage C 활성 후
⏸ A6-A10 Academic 고급 — 페르소나 P1/P2 확정 후
```

### 1.3 데이터 저장소 결단

**Google Sheets 미사용**. 기존 OELP storage 그대로:

- ontology 정의 → `lib/ontology.ts` (확장)
- skill weights → `lib/ontology-weights.json` (스키마 v2 → v3)
- contents → 기존 `lib/vocabulary-pool.ts` + 신규 `lib/passage-pool.ts`
- learner attempts → 기존 `lib/session-store.ts` (skill_id 컬럼 확장)
- skill state → 기존 `lib/recommendation-store.ts` + 신규 `lib/skill-mastery.ts`

---

## 2. 현재 OELP ↔ 제안 매핑표

### 2.1 차원 매핑

| 제안 skill | 현재 OELP 표현 | 갭 |
|---|---|---|
| V1 기본 어휘 의미 | D2_Meaning | ✅ 직접 매핑 |
| V2 품사 인식 | D1_Form (부분) | ⚠️ keyVariable로 분해 필요 |
| V3 단어 가족 | D4_Network (부분) | ⚠️ collocation과 분리 필요 |
| V4 다의어 | D2_Meaning + D3_Context | ✅ 합성으로 표현 가능 |
| V5 collocation | D4_Network | ✅ 직접 매핑 |
| **S1-S5 (Sentence)** | **❌ 없음** | **신규 dim S 또는 5 keyVariables** |
| D1 문맥 이해 | D3_Context | ✅ |
| D2 대명사/지시어 추적 | ❌ 없음 | **신규 sub-skill (D3_Context.anaphora)** |
| D3 연결어 이해 | keyVariable `connective_density` | ⚠️ skill로 승격 |
| D4 문장 간 관계 | keyVariable `coherence_gap` | ⚠️ skill로 승격 |
| D5 요지 파악 | QT 요지·주제 | ✅ |
| D6 세부 정보 | ❌ 약함 (현 QT엔 단일 세부정보 유형 없음) | **신규 QT** |
| D7 문단 구조 | keyVariable `paragraph_dependency` | ⚠️ skill로 승격 |
| D8 글 전체 구조 | QT 순서배열/문장삽입에 함축 | ⚠️ 명시화 |
| R1 인과 추론 | DIST-인과혼동 (역방향) | ⚠️ 양방향 정의 필요 |
| R2 비교-대조 | ❌ 없음 | **신규 sub-skill** |
| R3 숨은 전제 | keyVariable `claim_explicitness` (역) | ⚠️ |
| R4 필자 의도 | QT 목적·주장 | ✅ |
| R5 어조/태도 | QT 심경 | ✅ |
| R6 빈칸 추론 | QT 빈칸추론 | ✅ |
| R7 문장 삽입 | QT 문장삽입 | ✅ |
| R8 순서 배열 | QT 순서배열 | ✅ |
| R9 무관 문장 | QT 흐름무관 | ✅ |
| R10 선지 제거 전략 | DISTRACTOR_TYPES 7종 | ✅ (감춰져 있음) |
| A1-A5 academic 패턴 | keyVariable `abstractness`, `argument_structure` 등 | ⚠️ skill로 승격 |

### 2.2 자가진화 모듈 매핑

| 제안 모듈 | 현 OELP 자산 | 갭 |
|---|---|---|
| ① Error Pattern Analyzer | `lib/error-log.ts` + ErrorLogPanel | ⚠️ 오답 원인 5분류 미구현 |
| ② Skill Diagnosis Engine | `lib/diagnostic.ts` + AdaptiveDiagnostic | ✅ 5D 범위에서 작동 |
| ③ Recommendation Engine | `lib/recommendation.ts` + recommendation-store | ✅ 작동 중 |
| ④ Item Quality Evaluator | `lib/content-validators.ts` + C4.1 게이트 | ✅ 정답 근거/keyVariable 매칭 검증 |
| ⑤ Prompt Improvement Engine | ❌ 없음 (`lib/content-generator.ts`는 있으나 self-improve 루프 없음) | **신규** |

→ ⑤ Prompt Improvement Engine만 사실상 신규. ①은 분류 차원만 추가하면 됨.

---

## 3. 갭 분석 (3 카테고리)

### 3.1 데이터 모델 갭

1. **SKILL 엔티티 부재**: 현재 ontology는 QT 중심. skill_id → layer → prerequisite 그래프 필요.
2. **CONTENT_SKILL_MAP 부재**: 지문/문항이 어떤 skill을 측정하는지 명시적 매핑 없음 (keyVariable로 우회).
3. **prerequisite DAG 부재**: 학습 경로 추천이 5D weakness 기반. skill 의존성 기반 경로 없음.

### 3.2 진단 갭

1. **D6 세부 정보 QT 부재**: 수능엔 일치/불일치 유형이 있는데 OELP 10 QT엔 없음.
2. **D2 대명사 추적 측정 불가**: dimension에도 keyVariable에도 없음.
3. **S-layer 전반 측정 불가**: 긴 문장 끊어 읽기/수식어 범위 등 직접 측정 없음 (간접: D3_Context 점수로 추정).

### 3.3 자가진화 갭

1. **Prompt 재학습 루프 부재**: content-generator는 1회성 생성. 생성→검증→실패원인→프롬프트수정 루프 없음.
2. **Error pattern 5분류 부재**: error-log는 raw event만. "왜 틀렸는지" 분류기 없음.
3. **Skill mastery score 부재**: 현재 5D mastery만 있음. skill-level mastery (P/V/S/D/R/A) 별도 필요.

---

## 4. 단계 PR 로드맵

각 PR은 **기존 12 CI gate + 4중 안전망**을 통과해야 함. dogfood-N+1 시뮬레이션 사전 검증 필수 (CLAUDE.md §10.2).

### PR-1: skill ontology 데이터 모델 (Foundation)

- 신규: `lib/skill-ontology.ts` — skill_id, layer, name, prerequisite[], measured_by_dims[], measured_by_qts[]
- 신규: `schemas/skill-ontology.schema.json` + AJV validate
- 초기 시드: V1-V5, D1-D8, R1-R10, A1-A5 (S/P/A6-A10 제외)
- Vitest: skill graph 사이클 없음 / prerequisite 누락 없음 / 각 skill ≥ 1개 dim 또는 qt 매핑
- **CI gate 13번째 추가**: `validate-skill-ontology.mjs`
- 영향도: 코드 1개 lib + 1개 schema + 1개 test. 기존 코드 무수정.

### PR-2: keyVariable → skill 자동 매핑

- 수정: `scripts/check-dim-coverage.mjs` → skill coverage도 함께 점검
- 신규: `lib/skill-from-keyvar.ts` (21 keyVariables → skill_id 매핑 테이블)
- Vitest: 모든 keyVariable이 ≥1 skill에 연결 / orphan skill = 0
- 영향도: 신규 lib 1개. check-dim-coverage 확장만.

### PR-3: D-layer sub-skill 분해 (D2 대명사, D3 연결어, D4 문장간 관계, D7 문단 구조)

- 수정: `lib/ontology.ts` — 10 QT의 keyVariables에 D2/D3/D4/D7 skill_id 추가 (기존 keyVariable 유지 + skill_id 컬럼 신설)
- 신규: AdaptiveDiagnostic에 sub-skill 약점 표시 (D3_Context 점수가 낮을 때 어느 sub-skill이 원인인지)
- C4.1 게이트 영향: dimension weights는 불변. skill 매핑만 추가 → tau/contradictions 0 유지 보장.
- 사전검증: `simulate-skill-mapping.mjs` 신규 → tau 변화 0.0 확인 후 PR

### PR-4: R-layer 상위 카테고리 + 선지제거 전략 (R10)

- 신규: `lib/reasoning-strategies.ts` — DIST 7종을 R10 전략으로 표면화
- /map 페이지에 "왜 틀렸는지: distractor 분류" panel 추가
- 영향도: 기존 DISTRACTOR_TYPES 재사용. 신규 component 1개.

### PR-5: D6 세부 정보 QT 신규 (선택적, 데이터 의존)

- 신규 QT: `TYPE-일치불일치` (수능 26번 유형)
- weights JSON v2 → v3 마이그레이션 + calibrationHistory 항목 추가
- C4.1 게이트 대비: 신규 QT는 weights v3에만 등장 → tau 영향 격리
- **본인 결단 필요**: 수능 데이터셋에 일치/불일치 문항 추가 (csat-graphdb-318 확장)

### PR-6: Skill Mastery Score 별도 추적

- 신규: `lib/skill-mastery.ts` — skill_id별 0-100 점수, evidence_count, IRT update
- 기존 5D mastery는 그대로 둠 (canonical). skill mastery는 derived view.
- 신규 component: `SkillMasteryRadar.tsx` (10번째 surface) — V/D/R/A 4 axis radar

### PR-7: Error Pattern Analyzer 5분류

- 수정: `lib/error-log.ts` → error_category enum (vocab_unknown / structure_misread / anaphora_lost / discourse_drift / distractor_trap)
- 분류기: 응답 + skill mastery + distractor 선택을 입력으로 카테고리 산출
- /sessions 페이지에 분류별 막대 차트
- 사전검증: dogfood-16 시나리오 — 합성 응답 데이터에 분류 정확도 ≥ 80%

### PR-8: Prompt Improvement Engine MVP

- 신규: `lib/prompt-evolution.ts` — content-generator 출력 → C4.1 게이트 통과율 → 실패 시 prompt template diff 제안
- 신규 script: `scripts/prompt-iterate.mjs` (manual trigger, cron 미추가)
- LLM 호출 없이 **rule-based**로 시작 (실패 패턴 → template 수정 규칙)
- LLM 통합은 PR-9로 분리 (cost/latency separate review)

### PR-9 (옵션): A-layer A1-A5 정식 등록

- 수능 비문학 지문에 한정해 A1-A5 skill 매핑 추가
- A6-A10은 페르소나 P2 확정 후 별도 PR

### 단계별 의존성

```
PR-1 ── PR-2 ── PR-3 ──┬── PR-4
                       ├── PR-5 (데이터 의존)
                       └── PR-6 ── PR-7 ── PR-8 ── PR-9
```

---

## 5. 4중 안전망과의 정합

| 안전망 | p2a-ontology 영향 | 보장 방법 |
|---|---|---|
| Vitest 387 tests | 신규 +25개 예상 (PR당 ~3개) | 회귀 0건 PR merge 조건 |
| C4.1 게이트 (tau ≥ 0.4) | PR-3/PR-5에서 위험 | `simulate-skill-mapping.mjs` 사전 검증 |
| Next.js build | 신규 lib 추가만, 영향 미미 | build success |
| promote-weights auto-rollback | PR-5 weights v3에서 필요 | weights JSON `lastWriter` 갱신 + reason 명시 |

---

## 6. 검증 계획 (dogfooding 신규 시나리오)

CLAUDE.md §10 closed-loop 패턴 따라:

- **dogfood-16**: error pattern 분류기 정확도 (합성 응답 300개)
- **dogfood-17**: skill mastery score 수렴 속도 (10 학습자 × 4 sessions)
- **dogfood-18**: D-layer sub-skill 분해 후 recommendation 변화 (현 5D vs skill 기반 추천 비교)
- **dogfood-19** (선택): prompt-evolution 1 사이클 — 100 문항 생성 → C4.1 검증 → 실패 분류 → 템플릿 수정 → 재생성 100문항 → 통과율 변화

각 dogfood는 [§10.2 발견→코드→검증→정책 패턴](../../CLAUDE.md) 따라 finding 문서 + PRD 등록 + 시뮬 → 코드 prep → 테스트 순.

---

## 6.5 대시보드: 온톨로지 그래프 시각화 (필수 요구)

추가 요구사항: **파닉스부터 academic reading까지 세부 역량을 노드로, 선행·지원·영향 관계를 연결선으로, 진단 결과를 색상/크기로** 표현하고, **약점 노드와 원인 하위 노드 추적으로 학습 경로 추천**까지 잇는 화면.

### 6.5.1 현 자산 (재사용)

- `components/OntologyMap.tsx` — Cytoscape.js 기반, 10 QT + 21 keyVar + 7 DIST + cluster 표시. 5D 점수로 weakness 색상(w0~w4 5분류).
- `lib/ontology.ts::buildOntologyElements()` — 노드/엣지 생성기.
- `app/map/page.tsx` — /map 라우트 (이미 D1 indicator 등 활성).

### 6.5.2 확장 사항 (PR 매핑)

| 요구 | 구현 매핑 | 신규/확장 |
|---|---|---|
| 노드: P→V→S→D→R→A 5 레이어 표시 | PR-1 skill ontology + buildOntologyElements 확장 | 확장 |
| 엣지 3종 (이미지 공식 라벨): `핵심 의존 관계` / `보조적 영향 관계` / `간접적 연관 관계` | PR-1 schema `edge_type` enum + Cytoscape edge style classes | 확장 |
| 노드 색상: 학습자 진단 결과 (5분류 유지) | 기존 WEAKNESS_COLORS 그대로 + skill mastery score 연동 | 확장 |
| 노드 크기: evidence_count 또는 mastery confidence | PR-6 SkillMasteryRadar 데이터 재사용 → Cytoscape `width/height: mapData(...)` | 확장 |
| 약점 노드 → 원인 하위 노드 추적 | PR-1 prerequisite DAG 역방향 traversal + 클릭 시 highlight | **신규** |
| 다음 학습 경로 추천 | 기존 `lib/recommendation.ts` + skill ontology BFS | 확장 |
| 학생/교사 view 분리 | 학생: 본인 진단 / 교사 dashboard route 신규 (`/teacher`) | **신규 라우트 (옵션)** |

### 6.5.3 신규 PR 추가

위 §4 로드맵에 다음 추가:

**PR-3.5: OntologyMap에 skill 레이어 노드/엣지 표시** (PR-3 직후, PR-4 이전)

- 수정: `lib/ontology.ts::buildOntologyElements` — V/S/D/R/A skill 노드 + 3종 엣지 추가 (V는 D2_Meaning과 합쳐 표시하지 않고 별도 layer cluster로)
- 수정: `components/OntologyMap.tsx` — edge style (prerequisite=실선/supports=점선/impacts=화살표)
- 수정: `app/map/page.tsx` — layer 필터 토글 (P/V/S/D/R/A 체크박스, default V+D+R only)
- A11y: 기존 12/12 PASS 유지 (Cytoscape canvas는 ARIA 부재 — fallback table view 신규 추가)
- 사전검증: dogfood-18 시각화 부분 — 노드 수 폭증으로 렌더 느려지지 않는지 (10 QT + 28 skill = 38 노드, 안전)

**PR-3.6: 약점→원인 추적 인터랙션**

- 신규: `lib/skill-causal-trace.ts` — skill_id 입력 → prerequisite DAG 역방향 BFS → "이 약점이 막혀있는 원인 후보 ≤3"
- 수정: OntologyMap onNodeClick → 클릭한 약점 노드의 원인 경로 highlight (Cytoscape `addClass('causal-path')`)
- /map 페이지 사이드 패널에 "다음 학습 추천 ≤5 (원인 노드 우선)"

**PR-3.7 (옵션): 교사 dashboard `/teacher` 라우트**

- 학습자 N명 집계 view (현 single-learner /map → multi-learner heatmap)
- 본인 결단: 외부 학습자 ≥3명 확보 후 시작 (현재 데이터 불충분)

### 6.5.4 정합 보장

- A11y: 12/12 유지 (Cytoscape canvas + fallback `<table role="grid">` 동시 렌더)
- 성능: 38 노드 × 60 엣지 — Cytoscape cose layout 안전 영역
- 색상 일관성: 기존 WEAKNESS_COLORS 5 단계 유지 (color-blind safe 검증 별도)

---

## 7. 비-범위 (out of scope)

명시적으로 **이번 feature에서 다루지 않는** 항목:

- ❌ Phonics 레이어 P1-P7 (페르소나 P1 활성 후 v2)
- ❌ Academic A6-A10 (페르소나 P2 활성 후 v2)
- ❌ Google Sheets 마이그레이션 (storage 결단 §1.3)
- ❌ Apps Script 자동화 (Cloud Run/Vercel 재사용)
- ❌ 학습자 채널 모집 (외부 학습자 확보는 본인 결단 영역)
- ❌ LLM 문항 생성 production (PR-8은 rule-based, LLM은 cost review 별도 PR)

---

## 8. 본인 결단 필요 항목

Claude 자율 불가:

1. ☐ PR-5 (TYPE-일치불일치) 진행 여부 — csat-graphdb-318 데이터 확장 필요
2. ☐ PR-8/PR-9의 LLM 통합 cost ceiling 결정
3. ☐ A-layer A1-A5 weights 초기값 결정 (또는 calibrate 자동화)
4. ☐ skill ontology 초기 시드의 prerequisite 그래프 검토 (도메인 전문가 판단)
5. ☐ 이 plan을 myprojects docs/01-plan/로 옮길지 OELP 내부에 둘지

---

## 9. 다음 단계 (Plan → Design)

이 plan이 승인되면:

1. `/pdca design p2a-ontology` 실행
2. PR-1 데이터 모델 상세 설계 (skill-ontology.ts 타입 정의 + schema fields)
3. 시드 데이터 (V1-V5, D1-D8, R1-R10, A1-A5 = 28 skill) 작성
4. C4.1-호환 시뮬레이터 `simulate-skill-mapping.mjs` 설계

→ Design 단계에서 PR-1 단독으로 implementable 수준까지 구체화.

---

## 10. 변경 이력

- 2026-05-25 v1: 초기 작성. 페르소나 충돌 해소 §1, 매핑 §2, 갭 §3, 9 PR 로드맵 §4.
