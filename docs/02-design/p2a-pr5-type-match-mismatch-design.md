# Design — PR-5: TYPE-일치불일치 신규 QT (parking lot)

> Feature: `p2a-ontology` · PR: **PR-5** · Status: **deferred (data-dependent)**
> Parent plan: [`docs/01-plan/p2a-ontology-plan.md`](../01-plan/p2a-ontology-plan.md) §3.2
> Related QT mapping: `lib/ontology.ts` QUESTION_TYPES (currently 10)
> Skill seed: `lib/skill-ontology-seed.json` D6 (세부 정보 파악)

## 1. 왜 지금은 코드 변경 0건인가

PR-5는 신규 수능 유형 `TYPE-일치불일치` (수능 26번 — 글의 내용 일치 / 불일치 판단)를 추가합니다. 추가 즉시 다음 게이트가 영향 받습니다:

1. **C4.1 derivation** — `kv-dim-mapping.ts` 가 10 QT 모두를 순회 → tau 재계산
2. **Calibration history** — `ontology-weights.json` v3 마이그레이션 필요 + `lastWriter` 갱신
3. **Recommendation engine** — 신규 QT가 priority 계산에 포함
4. **C4.1 baseline (tau 0.6)** — 신규 QT의 declared vs derived 비교로 tau 흔들림 가능

데이터(`csat-graphdb-318` 확장)가 없는 상태에서 placeholder weights로 코드를 변경하면 **위 4 게이트 모두 위험 노출**. 따라서 본 PR-5는 **design doc + 검증 시뮬레이터만** 제공하고, 실제 코드 변경은 데이터 도착 후 별도 PR-5b로 진행.

## 2. 신규 QT 사양 (proposed)

```ts
// 추후 lib/ontology.ts QUESTION_TYPES 끝에 추가될 항목 (proposed)
{
  id: "TYPE-일치불일치",
  name: "내용 일치/불일치",
  numberRange: "26-28",          // 수능 영어 26-28번 (도표/실용/일치)
  pointValue: 2,
  keyVariables: [
    "detail_density",            // 신규 — 지문 내 사실 진술 밀도
    "lexical_paraphrase_distance" // 신규 — 정답·오답 선지가 지문을 얼마나 바꿔 표현했는지
  ],
  skillIds: ["D6", "V1", "V4"],  // 세부 정보 + 어휘 의미 + 다의어
  weights: w("TYPE-일치불일치"), // ontology-weights.json v3
}
```

### Proposed 5D weights v3

| Dim | 비중 | 근거 |
|---|---|---|
| D1_Form | 0.05 | 베이스라인 (다른 QT 동일) |
| D2_Meaning | 0.40 | **핵심** — 정답·오답 변별이 단어 의미 정확성 |
| D3_Context | 0.30 | 지문 내 위치 추적 |
| D4_Network | 0.10 | paraphrase 동의어 인지 |
| D5_Usage | 0.15 | 시제·조건 변형 탐지 |

Sum = 1.00. C4.1 derivation 시 `detail_density` 와 `lexical_paraphrase_distance` 가 D2/D3 위주로 매핑되도록 `kv-dim-mapping.ts` 확장 필요.

### 신규 keyVariables 2개 (ontology-weights.json + check-dim-coverage 영향)

`detail_density`, `lexical_paraphrase_distance` 2개 추가 시:

- `validate-skill-ontology.mjs` orphan check: D6 skill의 `measuredByKeyVars`에 두 개 모두 등록 필수
- `check-dim-coverage.mjs`: D2/D3 coverage에 자동 반영 (skill→dim mapping 따라)

### 신규 distractor pattern 0건

기존 7 DIST가 모두 적용 — 일치/불일치 유형 특유의 신규 함정은 없다고 판단 (수능 26번도 부분일치, 반대논지, 시제왜곡 함정 동일).

## 3. C4.1 영향 사전 예측 (시뮬레이터 미실행)

데이터 확보 후 다음 절차:

1. 위 weights 추가
2. `kv-dim-mapping.ts` 에 2 신규 keyVariable 매핑 (각 0.5 D2 / 0.5 D3 등)
3. `scripts/simulate-skill-mapping.mjs` 재실행 → tau / contradictions 변동 사전 측정
4. tau ≥ 0.55 + contradictions = 0 이면 PR open

본 시뮬레이터는 PR-3에서 이미 가용 — 데이터 도착 시 즉시 재사용.

## 4. csat-graphdb-318 데이터 확장 요구사항

본인 결단 영역 (Claude 자율 불가). 필요 작업:

1. `csat-graphdb-318` 에 수능 26-28번 문항 ~30개 추가 (기존 565문항 → 595)
2. 각 문항에 다음 메타데이터:
   - `keyVariables: ["detail_density", "lexical_paraphrase_distance"]`
   - `expectedDistractorPatterns: [...]` (기존 7종 활용)
   - `passageType`: practical / chart / consistency_check
3. 분포 검증: 6 평가원 모의고사 + 3 수능 기출
4. PR-5b open

## 5. 실 활성화 시 PR-5b 체크리스트 (참고용)

본 PR이 머지된 후, 데이터 도착 시 본인이 실행할 순서:

```bash
# 1. csat-graphdb-318 확장 검증
node scripts/synthetic-validation-c4-1.mjs   # tau pre

# 2. lib/ontology.ts QUESTION_TYPES 끝에 TYPE-일치불일치 entry 추가
# 3. lib/ontology-weights.json weights 항목 + lastWriter 갱신 + calibrationHistory 추가
# 4. lib/kv-dim-mapping.ts KV_DIM_MAPPING에 2개 entry
# 5. lib/skill-ontology-seed.json D6 노드의 measuredByKeyVars에 2개 추가
node scripts/validate-skill-ontology.mjs     # orphan check
node scripts/simulate-skill-mapping.mjs       # tau preserved

# 6. tau ≥ 0.55 확인 후 PR open
git checkout -b feature/p2a-pr5b-type-match
git commit -m "feat(ontology): PR-5b — TYPE-일치불일치 QT activation"
```

## 6. 위험과 안전망

| 위험 | 안전망 |
|---|---|
| C4.1 tau가 신규 QT로 흔들림 | `simulate-skill-mapping.mjs` 사전 검증 + 자동 rollback |
| 신규 keyVariable orphan 발생 | `validate-skill-ontology.mjs` gate 13 |
| weights v3 마이그레이션 실패 | `validate-schemas.mjs` AJV 검증 |
| 기존 10 QT 가중치 회귀 | 가중치 JSON `lastWriter` 보호 + `promote-weights` rollback |

## 7. 변경 이력

- 2026-05-26 v1 (parking lot): 코드 변경 0건. 데이터 확보 시 PR-5b 실행.
