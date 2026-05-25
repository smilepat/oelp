# Design — PR-1: Skill Ontology Data Model

> Feature: `p2a-ontology` · PR: **PR-1** · Phase: **Design**
> Parent plan: [`docs/01-plan/p2a-ontology-plan.md`](../01-plan/p2a-ontology-plan.md)
> Image reference: `docs/01-plan/assets/p2a-roadmap.png` (사용자 첨부)

## 1. 목표

OELP 기존 자산을 **무수정**으로 유지하면서 skill ontology를 **독립 lib 모듈**로 추가. 향후 PR-2~9가 이 모듈을 import해 확장.

**비-목표**: 기존 ontology.ts / ontology-weights.json / OntologyMap.tsx 수정 (PR-3에서 다룸).

## 2. 파일 추가 목록

| 파일 | 역할 | 크기 추정 |
|---|---|---|
| `lib/skill-ontology.ts` | TypeScript 타입 + loader + 그래프 헬퍼 | ~200 LoC |
| `lib/skill-ontology-seed.json` | 28 skill seed 데이터 | ~400 LoC |
| `schemas/skill-ontology.schema.json` | JSON Schema (AJV) | ~80 LoC |
| `scripts/validate-skill-ontology.mjs` | CI 13번째 gate | ~70 LoC |
| `tests/skill-ontology.test.ts` | Vitest (8 tests) | ~150 LoC |

기존 파일 수정: **0개**.

## 3. TypeScript 타입 정의

```ts
// lib/skill-ontology.ts
export type SkillLayer = "P" | "V" | "S" | "D" | "R" | "A";
export type GradeLevel = "elem_1_3" | "elem_4_6" | "middle" | "high" | "csat";
export type EdgeType =
  | "core_dependency"     // 핵심 의존 관계 (solid)
  | "supportive_influence"// 보조적 영향 관계 (dashed)
  | "indirect_relation";  // 간접적 연관 관계 (dotted)

export interface SkillNode {
  /** stable id, e.g. "V1", "D6", "R7" */
  id: string;
  layer: SkillLayer;
  /** Korean canonical name (이미지 라벨과 일치) */
  name: string;
  /** English short name */
  nameEn: string;
  /** one-line description */
  description: string;
  /** primary grade level (image timeline) */
  gradeLevel: GradeLevel;
  /** map to existing 5D dimensions (one or more, optional) */
  measuredByDims: string[];   // e.g. ["D2_Meaning"]
  /** map to existing QTs (optional) */
  measuredByQts: string[];    // e.g. ["TYPE-빈칸추론"]
  /** map to keyVariables in ontology.ts (optional) */
  measuredByKeyVars: string[];
  /** if true, MVP-active; if false, scheduled for v2 */
  mvpActive: boolean;
}

export interface SkillEdge {
  from: string;   // skill_id
  to: string;     // skill_id (depends on / supports / relates to)
  type: EdgeType;
  /** optional explanatory note */
  note?: string;
}

export interface SkillOntology {
  schemaVersion: 1;
  /** monotonically increasing, must match validator */
  version: string;
  nodes: SkillNode[];
  edges: SkillEdge[];
}
```

## 4. 28 Skill Seed (MVP Active)

이미지 5-tier hierarchy + 제안 텍스트 5 레이어 동시 정합. **`mvpActive: false`** 항목은 v2/Stage C 대비 placeholder (그래프 무결성용).

### 4.1 V-layer (Vocabulary, 5)

| id | name | layer | grade | dims | qts | mvpActive |
|---|---|---|---|---|---|---|
| V1 | 기본 어휘 의미 | V | elem_4_6 | D2_Meaning | — | true |
| V2 | 품사 인식 | V | elem_4_6 | D1_Form | — | true |
| V3 | 단어 가족 이해 | V | middle | D4_Network | — | true |
| V4 | 다의어 이해 | V | middle | D2_Meaning, D3_Context | — | true |
| V5 | collocation 이해 | V | middle | D4_Network | — | true |

### 4.2 S-layer (Sentence, 5)

| id | name | layer | grade | dims | keyVars | mvpActive |
|---|---|---|---|---|---|---|
| S1 | 기본 문장 구조 | S | elem_4_6 | D1_Form | — | true |
| S2 | 주어-동사 파악 | S | middle | D1_Form, D3_Context | — | true |
| S3 | 수식어 범위 파악 | S | middle | D3_Context | — | true |
| S4 | 절 구조 이해 | S | middle | D1_Form, D3_Context | — | true |
| S5 | 긴 문장 끊어 읽기 | S | high | D3_Context | paragraph_dependency | true |

### 4.3 D-layer (Discourse, 8)

| id | name | layer | grade | dims | keyVars | mvpActive |
|---|---|---|---|---|---|---|
| D1 | 문맥 이해 | D | middle | D3_Context | context_clue | true |
| D2 | 대명사·지시어 추적 | D | middle | D3_Context | — | true |
| D3 | 연결어 이해 | D | middle | D3_Context | connective_density, discourse_marker_density | true |
| D4 | 문장 간 관계 파악 | D | high | D3_Context | coherence_gap, coherence_disruption | true |
| D5 | 요지 파악 | D | high | D3_Context, D4_Network | topic_sentence_position, topic_abstractness | true |
| D6 | 세부 정보 파악 | D | high | D3_Context | — | true |
| D7 | 문단 구조 파악 | D | high | D3_Context | paragraph_dependency, discourse_structure | true |
| D8 | 글 전체 구조 이해 | D | csat | D4_Network | discourse_structure, given_sentence_role | true |

### 4.4 R-layer (Reasoning, 10)

QT 직접 매핑 우선.

| id | name | layer | grade | qts | mvpActive |
|---|---|---|---|---|---|
| R1 | 원인-결과 추론 | R | high | — (distractor DIST-인과혼동 역방향) | true |
| R2 | 비교-대조 추론 | R | high | — | true |
| R3 | 숨은 전제 파악 | R | high | TYPE-주장 | true |
| R4 | 필자 의도 추론 | R | high | TYPE-목적, TYPE-주장 | true |
| R5 | 어조·태도 파악 | R | high | TYPE-심경 | true |
| R6 | 빈칸 추론 | R | csat | TYPE-빈칸추론 | true |
| R7 | 문장 삽입 | R | csat | TYPE-문장삽입 | true |
| R8 | 순서 배열 | R | csat | TYPE-순서배열 | true |
| R9 | 무관 문장 제거 | R | csat | TYPE-흐름무관 | true |
| R10 | 선지 제거 전략 | R | csat | (전체) | true |

### 4.5 A-layer (Academic, 5 active)

| id | name | layer | grade | dims | keyVars | mvpActive |
|---|---|---|---|---|---|---|
| A1 | 추상 개념 이해 | A | high | D2_Meaning, D4_Network | abstractness, topic_abstractness | true |
| A2 | 개념 간 관계 파악 | A | csat | D4_Network | discourse_structure | true |
| A3 | 정의-예시 구조 이해 | A | csat | D3_Context | argument_structure | true |
| A4 | 주장-근거 구조 이해 | A | csat | D3_Context, D4_Network | argument_structure, claim_explicitness | true |
| A5 | 이론-반론-재반박 구조 | A | csat | D4_Network | — | true |

**합계**: V5 + S5 + D8 + R10 + A5 = **33 skill** (Plan은 28 추정이었으나 design 단계에서 정밀 카운트). P-layer 7개와 A6-A10은 별도 v2 seed로 분리 — 본 PR-1 미포함.

## 5. 주요 엣지 (이미지 의존 관계 매핑)

이미지 hierarchy를 데이터화. 모든 엣지는 `from -> to` (depends on / supports / impacts).

### 5.1 핵심 의존 관계 (core_dependency, 18개)

```
V1 -> V4      V1 의미가 다의어 V4 전제
V2 -> S1      품사 인식이 문장구조 전제
V2 -> S3      수식어 범위 파악 전제
S1 -> S2      기본구조 → 주어-동사
S1 -> S4      기본구조 → 절구조
S2 -> S5      주어-동사 → 끊어읽기
S3 -> S5
S4 -> S5
S5 -> D1      긴 문장 → 문맥 이해
D1 -> D5      문맥 → 요지
D2 -> D4      대명사 추적 → 문장 간 관계
D3 -> D4      연결어 → 문장 간 관계
D4 -> D7      문장 간 → 문단 구조
D5 -> D7
D7 -> D8      문단 → 글 전체 구조
D5 -> R4      요지 → 필자 의도
D8 -> R7      글 구조 → 문장삽입
D8 -> R8      글 구조 → 순서배열
```

### 5.2 보조적 영향 관계 (supportive_influence, 12개)

```
V3 -> V4
V5 -> D1
V4 -> R6      다의어 → 빈칸추론
A1 -> R3      추상개념 → 숨은 전제
A1 -> R6
A4 -> R3
A4 -> D5
A2 -> D8
R1 -> R3
R1 -> R6
R5 -> R4
D3 -> R7      연결어 → 문장삽입
```

### 5.3 간접적 연관 관계 (indirect_relation, 8개)

```
V3 -> A1
A3 -> A4
A4 -> A5
R10 -> R6     선지제거 전략 → 빈칸추론
R10 -> R7
R10 -> R8
R10 -> R9
D6 -> R10     세부 정보 → 선지 변별
```

**합계**: 18 + 12 + 8 = **38 edges**.

## 6. JSON Schema (요지)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Skill Ontology",
  "type": "object",
  "required": ["schemaVersion", "version", "nodes", "edges"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "version": { "type": "string", "pattern": "^v\\d+-\\d{4}-\\d{2}-\\d{2}$" },
    "nodes": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id","layer","name","nameEn","description","gradeLevel","mvpActive"],
        "properties": {
          "id": { "type": "string", "pattern": "^[PVSDRA][0-9]+$" },
          "layer": { "enum": ["P","V","S","D","R","A"] },
          "gradeLevel": { "enum": ["elem_1_3","elem_4_6","middle","high","csat"] },
          "measuredByDims": { "type":"array", "items":{ "type":"string" } },
          "measuredByQts":  { "type":"array", "items":{ "type":"string" } },
          "measuredByKeyVars": { "type":"array", "items":{ "type":"string" } },
          "mvpActive": { "type": "boolean" }
        }
      }
    },
    "edges": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["from","to","type"],
        "properties": {
          "from": { "type": "string" },
          "to":   { "type": "string" },
          "type": { "enum": ["core_dependency","supportive_influence","indirect_relation"] }
        }
      }
    }
  }
}
```

## 7. Validator (CI 13번째 gate)

`scripts/validate-skill-ontology.mjs`가 점검할 7가지:

1. AJV JSON Schema 통과
2. node id 유일성
3. edge.from / edge.to 모두 존재하는 node 참조
4. **순환 의존 0건** (core_dependency 한정 DAG 검증)
5. mvpActive=true skill 모두 ≥1 의 dim/qt/keyVar 매핑
6. layer P 노드 = 0 (PR-1에선 P 제외 명시)
7. version 필드 형식 + seed 파일과 일치

실패 시 exit 1 (CI block).

## 8. Vitest 테스트 (8개)

```
1. loadSkillOntology() returns 33 nodes
2. layer 분포: V=5, S=5, D=8, R=10, A=5
3. 모든 edge.from/to가 존재하는 노드
4. core_dependency subgraph는 acyclic
5. getAncestors(D7) returns [D4, D5, D2, D3, ...] (BFS)
6. getCausalRoot(R7) returns top non-dependent nodes
7. mvpActive=true 노드 모두 매핑 ≥1
8. version 문자열 형식 검증
```

## 9. CI 통합

```yaml
# .github/workflows/pr-check.yml 신규 step (Vitest 다음, schema-validate 옆)
- name: Validate skill ontology
  run: node scripts/validate-skill-ontology.mjs
```

기존 `scripts/validate-schemas.mjs`에도 skill-ontology.schema.json 자동 포함 (AJV 등록).

## 10. 영향도 분석

| 영역 | 영향 |
|---|---|
| 기존 lib/* | 무수정 |
| 기존 5D 가중치 | 무수정 |
| C4.1 게이트 (tau ≥ 0.4) | **영향 없음** (skill ontology는 weights 미수정) |
| Vitest count | 387 → 395 (+8) |
| CI gates | 12 → 13 |
| Coverage | lib/skill-ontology.ts 100% 목표 |
| Bundle size | client에서 import 안 됨 → 0 증가 |
| A11y | UI 변경 없음 → 12/12 유지 |

## 11. Open Decisions

1. ☐ skill seed JSON을 `lib/`에 둘지 `data/`에 둘지 — design 권장 `lib/` (vocab-pool-source.json 선례)
2. ☐ Edge note 필드 채울지 — 우선 빈 값 허용, 향후 LLM 추론 시 사용
3. ☐ A6-A10 placeholder를 PR-1에 넣을지 — 권장 **빼기** (불필요한 dead code 방지)

## 12. 다음 단계 (Design → Do)

이 design 승인 시 PR-1 구현 순서:

1. `lib/skill-ontology.ts` (타입 + loader + 헬퍼)
2. `lib/skill-ontology-seed.json` (33 nodes + 38 edges)
3. `schemas/skill-ontology.schema.json`
4. `scripts/validate-skill-ontology.mjs`
5. `lib/__tests__/skill-ontology.test.ts` (8 tests)
6. `npm test` + `npm run lint` 로컬 검증
7. commit `feat(skill-ontology): PR-1 data model + 33 skill seed`
