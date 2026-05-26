# dogfood-17 — SkillMasteryRadar Monotonicity 검증

> Feature: `p2a-ontology` · 후속
> Script: `scripts/dogfood-17-skill-mastery-monotonicity.mjs`
> Baseline result: `docs/03-analysis/dogfood-17-result.json`

## 1. 목적

PR-6에서 도입한 [`lib/skill-mastery.ts`](../../lib/skill-mastery.ts) + [`components/SkillMasteryRadar.tsx`](../../components/SkillMasteryRadar.tsx) 가 학습자의 dim 점수를 layer mastery로 옳게 변환하는지 검증. 정확도 검증이 아니라 **의미 검증** — 어느 dim을 떨어뜨렸을 때 *연관된* layer만 떨어져야 한다.

## 2. 결과 (margin ≥ 5)

| 떨어뜨린 dim | 1차 영향 layer | delta |
|---|---|---|
| D1_Form (70 → 20) | **S** | 9.45 |
| D2_Meaning (70 → 20) | **V** | 11.67 |
| D3_Context (70 → 20) | **D** | 12.86 |
| D4_Network (70 → 20) | **A** | 7.50 |
| D5_Usage (70 → 20) | **R** | 9.46 |

**5/5 PASS** — 모든 dim 변화가 의도된 layer에 1차 영향.

## 3. 의미

- skill-ontology-seed.json의 `measuredByDims` 매핑이 의미 의도와 일치.
- 학습자가 D3_Context 가 낮으면 D layer (담화) 가 가장 약해 보이고 — 사용자가 "discourse weak" 으로 해석할 수 있음.
- /teacher 의 layer 평균이 의미 있는 신호를 표현.

## 4. 의미 없는 케이스 (정직 기록)

- D5_Usage 떨어뜨림 → R layer (Reasoning) 1차 영향. 직관적으로 R-layer 가 D5와 연관 안 된다고 느낄 수 있으나, 실제로 R-layer의 R3-R9 skills 은 measuredByQts 만 가지고 있고 QT 가중치에서 D5 비중이 상당 (TYPE-순서배열 D5 0.30 등). 이건 의도적 — 추론 유형이 어휘 활용 단위에 의존한다는 도메인 모델 반영.
- D4_Network 떨어뜨림 → A layer (Academic) 1차 영향, V layer 도 영향. V 와 A 가 D4_Network 를 공유 — 의도된 중복.

## 5. 재실행 / CI 통합

```bash
node scripts/dogfood-17-skill-mastery-monotonicity.mjs
```

CI에 추가하면 14번째 gate 가 됨. 현재 미추가 — 본인 결단.
