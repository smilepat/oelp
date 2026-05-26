# dogfood-16 — Error Pattern Classifier 합성 정확도 검증

> Feature: `p2a-ontology` · PR-7b
> Script: `scripts/dogfood-16-error-pattern-accuracy.mjs`
> Baseline result: `docs/03-analysis/dogfood-16-result.json`

## 1. 목적

PR-7에서 추가한 [`lib/error-pattern-analyzer.ts`](../../lib/error-pattern-analyzer.ts)의 분류 정확도가 **plan §6 기준 80%** 이상을 만족하는지 합성 데이터로 사전 검증. 실 학습자 데이터가 없는 상태(베타 모집 불가, [feedback_beta_recruiting](../../CLAUDE.md))에서 채택할 수 있는 유일한 검증 채널.

## 2. 방법

- 5개 카테고리 각각 60개 시나리오 = N=300
- 각 시나리오: 알려진 true category + 그에 맞도록 5D 점수 / distractor 선택 구성
- 30% 시나리오에 잡음 주입: weak/strong 갭 축소 + secondary weakness 추가 (분류 모호성)
- seed=17 결정적 PRNG (mulberry32) — 재현 가능
- 정확도 ≥ 80% 게이트 통과 시 exit 0, 미만 exit 1

## 3. 결과 (seed=17, n=300, noise=30%)

| 측면 | 값 |
|---|---|
| 전체 정확도 | **97.3%** ✅ (target 80%) |
| Clean (잡음 0) | 100.0% (218/218) |
| Noisy (잡음 주입) | 90.2% (74/82) |

### 카테고리별 정밀도/재현율

| Category | TP | Precision | Recall | F1 |
|---|---|---|---|---|
| vocab_unknown | 59/60 | 1.000 | 0.983 | 0.992 |
| structure_misread | 60/60 | 0.882 | 1.000 | 0.938 |
| anaphora_lost | 56/60 | 1.000 | 0.933 | 0.966 |
| discourse_drift | 57/60 | 1.000 | 0.950 | 0.974 |
| distractor_trap | 60/60 | 1.000 | 1.000 | 1.000 |

structure_misread 정밀도 88.2%가 가장 낮음 — noisy 시나리오에서 다른 카테고리가 잘못 흡수되는 케이스. 후속 PR-9 LLM 모델 비교 시 우선 개선 후보.

## 4. 해석

- **Clean 100%**: 분류 규칙이 의도대로 작동. 분류 로직 자체에 결함 없음.
- **Noisy 90%**: 일반적 진단 데이터 가까운 조건에서도 80% 게이트 안정적 통과.
- 1차 production 도입 안전. 단, 잡음 비율 더 높은 실 데이터에서 추가 측정 필요.

## 5. 한계 (정직 기록)

1. **합성 데이터는 분류 규칙의 mirror** — 실 학습자 응답 패턴은 더 비선형적.
2. **anaphora_lost / discourse_drift 구분이 QT 기반**: 실제로는 sub-skill (D2 대명사 추적)이 측정되어야 정확. PR-3 sub-skill 분해 후 PR-9에서 개선.
3. **distractor selection 데이터 미수집**: 현 OELP는 어느 distractor를 골랐는지 기록하지 않음. PR-7c 또는 별도 PR에서 session-store 확장 필요.

## 6. 재실행

```bash
node scripts/dogfood-16-error-pattern-accuracy.mjs --n 300 --seed 17
# 옵션
node scripts/dogfood-16-error-pattern-accuracy.mjs --n 500 --seed 42 --noise 0.5 --target 0.75
```

## 7. CI 통합 (선택)

`npm run ci` 또는 GitHub Actions에 다음 단계로 추가 가능:

```yaml
- name: Error pattern classifier accuracy (dogfood-16)
  run: node scripts/dogfood-16-error-pattern-accuracy.mjs --n 300 --seed 17
```

본 PR에서는 CI 추가 안 함 — 현 게이트 12+1=13에 추가 부담 vs 도구 안정성 trade-off는 본인 결단.
