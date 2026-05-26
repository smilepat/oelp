# OELP Handoff Document (v19, 2026-05-25)

> 다음 작업자/세션 (Claude or 본인)을 위한 인계 문서.
> 본 문서는 19 sprints 동안 진화한 OELP 상태를 한 번에 파악 가능하게 정리.
> 정합성: 본 문서 ↔ [CLAUDE.md](./CLAUDE.md) ↔ [AGENTS.md](./AGENTS.md) ↔ [myprojects/docs/04-report/oelp-integrated-summary.md](https://github.com/smilepat/myprojects/blob/main/docs/04-report/oelp-integrated-summary.md) ↔ [README.md](./README.md)

---

## 0. 한 줄 요약

**OELP는 19 sprint 동안 코드 + 시뮬 + 운영 도구 + 자동 활성 UI까지 완비된 상태**. 본인 결단 잔여는 D1 옵션 A' PR (1일, 5중 안전성 + 3단계 정량 정당화) + EBS adapter PR (1-2일) + 외부 학습자 1명 모집 + retention 유지.

---

## 1. 현재 상태 스냅샷 (v20 종료 — p2a-ontology v1 PR open)

| 측면 | 수치 |
|---|---:|
| Vitest tests | **486** (53 files) |
| Playwright e2e | **16** (14 A11y desktop+mobile + 2 adaptive) |
| Routes | **8** (+ /teacher) |
| lib 모듈 | **31** (+ skill-ontology, skill-from-keyvar, skill-mastery, skill-causal-trace, reasoning-strategies, error-pattern-analyzer, prompt-evolution, teacher-aggregate, teacher-mock-learners) |
| Scripts (oelp) | **37** (+ validate-skill-ontology, simulate-skill-mapping, prompt-iterate, dogfood-16) |
| Components | **17** (+ SkillMasteryRadar, ErrorCategoryChart, SkillHeatmap) |
| Coverage lines | 98.26% (PR #6 머지 후 재측정 필요) |
| WCAG 2.1 AA | **16/16** (8 routes × 2 viewports, /teacher heatmap palette WCAG AA verified) |
| CI gates | **13** (+ validate-skill-ontology) |
| GitHub Actions | 3 (pr-check, weekly-calibration, vocab-cat-test-smoke) |
| myprojects docs | 57 |
| **PRD risks** | R1-R7 (R6 D1_Form + R7 retention) |
| **Closed-loop iterations** | 6 확정 + 7번째 PR-ready + p2a-ontology 자가진화 5모듈 |
| **자동 활성 surfaces** | **12** (+ SkillMasteryRadar, ErrorCategoryChart, SkillHeatmap) |
| **운영 모니터링 도구** | **10** (+ dogfood-16 분류기 정확도) |
| Production | Vercel + Cloud Run 양쪽 |
| **Open PRs** | #6 (p2a-ontology, 14 commits) + #7 (lint cleanup, 2 commits) |

---

## 2. Production 환경 (운영 중)

### 2.1 Vercel (Frontend)
- **URL**: `https://oelp-phi.vercel.app`
- **Team**: `prompt-improvement-dm-pat`
- **Env vars**: `NEXT_PUBLIC_VOCAB_CAT_TEST_URL` → Cloud Run alias

### 2.2 Cloud Run (Backend, vocab-cat-test FastAPI)
- **URL**: `https://vocab-cat-api-452237528328.asia-northeast3.run.app`
- **GCP project**: `gen-lang-client-0081580267`
- **Region**: `asia-northeast3` (Seoul)
- **Resources**: 1Gi memory, 1 CPU, allow-unauthenticated
- **ALLOWED_ORIGINS**: `https://oelp-phi.vercel.app,http://localhost:3000,http://localhost:3001`
- **Vocab DB**: 9183 words (SQLite)
- **End-to-end verify**: 7/7 PASS (θ stability, 5D dimension scores)

### 2.3 CI/CD
- **pr-check.yml**: 매 PR마다 lint + 387 tests + C4.1 + build + A11y desktop/mobile × 5 routes + cross-link + dim-coverage (12 gates)
- **weekly-calibration.yml**: 일요일 02:00 UTC + Supabase events → calibrate → PR 자동 생성
- **vocab-cat-test-smoke.yml**: 일요일 03:00 UTC + cloud-run-smoke (deployed revision 회귀 감지)

---

## 3. 본인 결단 미해결 항목 (4건)

### 3.1 ✅ Cloud Run 배포 (v8 완료)
- 2026-05-24 smilepat 위임 + Claude 30분 실행 완료
- runbook: [vocab-cat-test-cloudrun-runbook.md](https://github.com/smilepat/myprojects/blob/main/docs/03-analysis/vocab-cat-test-cloudrun-runbook.md)

### 3.2 ⚠️ EBS adapter PR (1-2일, 설계 완료)
- 옵션 B (Firebase config 30분)가 실제로는 stub 발견 (v8)
- 진짜 갭: contract mismatch + 인증 + 도메인 mismatch
- 설계: [ebs-oelp-vocab-adapter-design.md](https://github.com/smilepat/myprojects/blob/main/docs/02-design/ebs-oelp-vocab-adapter-design.md)
- 분석: [ebs-demo-integration-gap.md](https://github.com/smilepat/myprojects/blob/main/docs/03-analysis/ebs-demo-integration-gap.md)
- 우선순위: Stage C N=10+ 도달 후 추진 (LocalPool 486 카드 한도 도달)

### 3.3 ⚠️ D1_Form 옵션 A' PR (1일, 5중 안전성 + 3단계 정당화)
- **핵심 발견 (v9-v17)**: 21 keyVariables 모두 D2-D5만 매핑 → D1 derived 0% → 모든 학습 큐가 D1 강화 못 시킴 (structural defect)
- **시뮬 정당화 3단계**:
  - dogfood-8~11: D1 0% plateau (정체)
  - dogfood-12: D1 -72% negative gap (시간 갈수록 악화)
  - dogfood-13: 옵션 A' 적용 시 D1 +85~95% 회복, side effect 0 (SAFE)
- **5중 안전성**:
  1. `simulate-option-a-prime.mjs` — in-memory 사전 검증 → tau 0.5 PASS
  2. `dogfood-10-option-a-prime-matrix.mjs` — 효과 사전 측정 → SAFE
  3. `PlateauWarningPanel` — 학습자 4주+ 누적 시 실 검증
  4. `check-dim-coverage.mjs` CI gate — MISSING → OK 자동 flip
  5. Phase 2 PRD R6 정식 등록
- **4 파일 동시 PR**:
  - `myprojects/docs/01-plan/dimension-mapping.md` — 신규 3 keyVariables (morphological_complexity / orthographic_irregularity / word_length_distribution)
  - `lib/kv-dim-mapping.ts` — D1 매핑 3개 추가
  - `lib/ontology.ts` — TYPE-제목 keyVariables 배열에 2개 추가
  - `lib/ontology-weights.json` — TYPE-제목 weight 재조정 (D1=0.20)
- 설계: [d1-plateau-option-a-prime.md](https://github.com/smilepat/myprojects/blob/main/docs/02-design/d1-plateau-option-a-prime.md)
- **risk-free 상태** — 본인 진행 시 시뮬 결과대로 C4.1 통과 예상

### 3.4 ☐ 외부 학습자 1명 모집 + retention 유지
- **모집** trigger: Stage C 진입 활성화 (6 closed-loops + 9 surfaces 활성)
- **retention** challenge (v18-v19 finding):
  - 단발성 휴학 8w까지 안전 (RetentionDashboard `single-break`)
  - **반복 cycle (≥ 2번 휴학) 치명적** (`repeated-cycle`, dogfood-15 -57.3%)
- **자동 알림**: RetentionDashboard가 학습자 도착 시 자동 활성, repeated-cycle 감지 시 Phase 2 R7 정책 발동 권장 메시지 표시

---

## 4. 자율 작업 패턴 (v4-v19 누적)

### 4.1 5 카테고리 (지속 활용)

1. **코드 품질** (v4-v11): coverage push, test 추가, refactor
2. **시뮬 도구** (v9-v19): dogfood-3~15 (15 dogfood 시리즈)
3. **운영 위젯** (v5-v19): 14 components, 9 자동 활성 surfaces
4. **문서 메인테넌스** (모든 sprint): myprojects 통합 회고, PRD R6/R7, INDEX
5. **운영 모니터링** (v11+ 신규): 9 도구 (check-dim-coverage / simulate / dogfood-9~15 / bundle-audit / c4-3-trend-cli / web-vitals-audit)

### 4.2 자율 작업 패턴 정합성 maturity

D1_Form finding의 **6 층위 정합성** (v14 완성):
- PRD R6 → 시뮬 (dogfood-9~13) → 도구 (check-dim-coverage / simulate-option-a-prime) → 실 UI (PlateauWarningPanel) → 탐색 UI (/map indicator) → 설계 (d1-plateau-option-a-prime.md)

Retention finding의 **6 층위 정합성** (v19 완성):
- 발견 (dogfood-14) → 정밀화 (dogfood-15) → PRD R7 → lib (retention-analysis) → UI (RetentionDashboard) → 정책

→ **단일 finding이 자율 작업의 모든 표현 차원에서 일관 표현**.

---

## 5. 학습자 도착 시 자동 활성 chain (9 surfaces)

학습자 1명 도착 + Cloud Run 진단 → /queue 학습 → /sessions 누적 시 자동 작동:

| # | Component | 신설 | 활성 시점 |
|---|---|---|---|
| 1 | TrendPanel | v5 | ≥2 세션 (accuracy sparkline) / ≥4 세션 (5D trend) |
| 2 | PosteriorBalancePanel | v4 | 즉시 (Beta posterior + balance) |
| 3 | AnalyticsQueuePanel | v5 | 즉시 (11 이벤트 분포) |
| 4 | AdaptiveDiagnosticStats | v5 | ≥2 진단 (θ history + KR1.1/1.2) |
| 5 | CalibrationEventSync | v7 | 즉시 (audit log mirror) |
| 6 | PlateauWarningPanel | v13 | ≥4 세션 (D1 plateau confirm/refute) |
| 7 | /map D1 indicator | v14 | QT 선택 시 (derived 0% 알림) |
| 8 | QueuePlateauNotice | v15 | 큐 D1 targeting + plateau 시 |
| 9 | **RetentionDashboard** | v19 | 즉시 (휴학 cycle 자동 분류 safe/single-break/repeated-cycle) |

---

## 6. 운영 모니터링 도구 (9개)

| 도구 | 신설 | 용도 | 사용 명령 |
|---|---|---|---|
| `check-dim-coverage.mjs` | v11 | keyVariable 매핑 갭 진단 | `node scripts/check-dim-coverage.mjs` |
| `simulate-option-a-prime.mjs` | v12 | 옵션 A' PR 사전 검증 | `node scripts/simulate-option-a-prime.mjs` |
| `dogfood-9-dim-plateau-scan.mjs` | v11 | 5×5 plateau matrix | `node scripts/dogfood-9-dim-plateau-scan.mjs` |
| `dogfood-10-option-a-prime-matrix.mjs` | v13 | 옵션 A' 효과 사전 측정 | `node scripts/dogfood-10-option-a-prime-matrix.mjs` |
| `dogfood-11-weight-sensitivity.mjs` | v15 | 5 dim weight sensitivity | `node scripts/dogfood-11-weight-sensitivity.mjs` |
| `bundle-size-audit.mjs` | v15 | Production bundle size | `node scripts/bundle-size-audit.mjs` |
| `dogfood-12-forgetting-curve.mjs` | v16 | 24주 forgetting 시뮬 | `node scripts/dogfood-12-forgetting-curve.mjs --weeks 24` |
| `dogfood-15-spike-variants.mjs` | v19 | 휴학 cycle 정밀 비교 | `node scripts/dogfood-15-spike-variants.mjs` |
| `c4-3-trend-cli.mjs` | v16 | CI/cron trend analysis | `node scripts/c4-3-trend-cli.mjs --input <file>` |
| `web-vitals-audit.mjs` | v18 | Production HTTP baseline | `node scripts/web-vitals-audit.mjs` |

---

## 7. 절대 위반 금지 (안전 정책)

1. **production weight 직접 변경 금지** — `lib/ontology-weights.json`은 `scripts/promote-weights.mjs`만 변경 가능 (lastWriter enforcement)
2. **synthetic data로 production weight update 절대 불가** — 시뮬에서 검증된 가설도 `git revert` 필수
3. **LogicFlow 생태계 외부 무단 전재 금지** — vocabulary-db 원본 (data/*.csv) 영구 gitignored
4. **본인 결단 영역 자율 시도 금지** — Cloud Run (✅ 완료), EBS adapter, 옵션 A', 학습자 모집은 본인 영역. 자율로는 설계 + 시뮬 + 안전성 확보까지만.

---

## 8. 다음 권장 액션 우선순위

### 8.1 본인이 할 일 (옵션, dev-flow 순)

1. **D1 옵션 A' PR** (1일, 가장 risk-free) — 4 파일 동시 변경. 모든 사전 검증 완료. 시뮬 결과대로 C4.1 통과 예상.
2. **EBS adapter PR** (1-2일) — Stage C N=10+ 도달 후 추진 권장 (LocalPool 한도 도달 시)
3. **학습자 1명 모집** — 본인 EFL 콘텐츠 채널 활용 + RetentionDashboard 자동 retention 감지

### 8.2 다음 세션 자율 후보 (필요 시)

- (a) dogfood-16 — Leitner SR + dim-level forgetting 통합 sim (실 학습자 도착 후 정밀화 필요)
- (b) 새 archetype (advanced learner: D1=85+) sim — 옵션 A' 적용 후 천장 도달 시 새 plateau 가능성
- (c) Lighthouse / headless browser perf audit (현재 web-vitals-audit는 server-side HTTP만)
- (d) lib/leitner.ts 통합 (item-level forgetting을 dim-level과 결합)
- (e) Phase 3 preview design (Phase 2 종료 후 다음 phase 미리)

---

## 9. 핵심 함정 / 디버깅 메모

### 9.1 gcloud `--set-env-vars` 콤마 escape
콤마가 env var entry 구분자로 해석됨. custom delimiter prefix 필요:
```bash
gcloud run deploy ... --set-env-vars "^|^ALLOWED_ORIGINS=https://a.com,https://b.com"
```

### 9.2 CI npm ci platform mismatch
Windows에서 생성한 lock file이 Linux platform deps 누락 (`@emnapi/runtime`, `@img/sharp-linux-*`). cloud-run-smoke job은 minimal install로 우회:
```yaml
- run: npm install --no-save --no-audit --no-fund ajv ajv-formats
```

### 9.3 vocab-cat-test private repo
OELP workflow에서 actions/checkout 시 default GITHUB_TOKEN으로 403. PAT 등록 또는 repo public 필요. 임시 해결: `continue-on-error: true`.

### 9.4 Korean 키 cp949 mangling
`ontology-weights.json` Korean 키 (`TYPE-제목` 등) 터미널에서 mangle. Python UTF-8 강제:
```python
d = json.load(open('lib/ontology-weights.json', encoding='utf-8'))
key = next(k for k in d['weights'] if k.endswith('제목'))
```

### 9.5 Vercel env multiple environments 한 번에 추가 불가
```
echo "v" | vercel env add KEY production preview development  # → Invalid arguments
```
한 번에 하나씩:
```
echo "v" | vercel env add KEY production
echo "v" | vercel env add KEY development
# Preview는 main이 production branch라 skip 가능
```

### 9.6 lib/trend-analysis.ts ↔ c4-3-trend-cli.mjs drift
CLI는 lib 로직을 JS로 재구현 (ESM-CJS interop 회피). 두 구현 drift 위험 → `tests/c4-3-trend-cli.test.ts` 8 sentinel tests로 보호.

---

## 10. 빠른 시작 (새 세션용)

```bash
# Clone
gh repo clone smilepat/oelp
cd oelp
npm install

# Dev server
npm run dev                # http://localhost:3000

# 전체 CI 시뮬 (12 gates)
npm run ci

# 운영 모니터링 9 도구 한 번에
node scripts/check-dim-coverage.mjs        # D1 hidden defect 감지
node scripts/bundle-size-audit.mjs         # bundle size 1.58MB / 3MB
node scripts/web-vitals-audit.mjs          # production HTTP baseline
node scripts/simulate-option-a-prime.mjs   # 옵션 A' PR safe?

# 학습자 도착 시 (Stage C)
# 1. https://oelp-phi.vercel.app/diagnose 접속
# 2. 진단 시작 → 학습 큐 풀이 → 세션 누적
# 3. /sessions 페이지에서 9 surfaces 자동 활성 확인
#    특히 RetentionDashboard로 휴학 cycle 자동 감지
```

---

## 11. 참고 문서 (우선 읽을 순서)

1. **본 HANDOFF.md** (이 문서) — 한 번에 핵심 컨텍스트
2. [README.md](./README.md) §9 — 진행 상황 표 (v19 sprint 종료)
3. [AGENTS.md](./AGENTS.md) — 자율 작업 안전 정책 + 첫 진입 순서
4. [CLAUDE.md](./CLAUDE.md) §11 — sprint별 변경 이력
5. [myprojects oelp-integrated-summary.md](https://github.com/smilepat/myprojects/blob/main/docs/04-report/oelp-integrated-summary.md) §1-§26 — 19 sprint 통합 회고
6. [myprojects PRD R1-R7](https://github.com/smilepat/myprojects/blob/main/docs/01-plan/prd-oelp-mvp-phase2.md) — Phase 2 정식 헌장

---

## 12. 변경 이력

- 2026-05-25 v19: 본 HANDOFF.md 작성 (19 sprints 누적 인계)
- 2026-05-25 v19+: §13 다음 작업 시작 지침 추가 (clone 후 즉시 적용 가능)

---

## 13. 다음 작업 시작 지침 (clone 후 즉시 적용 가능)

> **새 환경에서 OELP를 처음 clone한 직후 또는 새 Claude session 시작 시 본 절을 읽으면 작업 즉시 시작 가능.**

### 13.1 새 Claude session 시작 시 (3가지 시나리오)

#### A. 자율 작업 계속 (가장 흔함)
새 세션에서 단순히:
```
진행
```
또는
```
다음 작업을 진행해
```

→ Claude가 자동으로 `HANDOFF.md`, `CLAUDE.md`, `AGENTS.md` 로드해서 v19 상태에서 v20 sprint 시작. 4-task 시퀀스 자동 제안.

#### B. 특정 영역 작업 지시
```
D1 옵션 A' PR을 작성해줘. 시뮬 결과 SAFE이고 4 파일 동시 변경 설계 완료 상태.
```
```
EBS adapter PR 진행. Stage C 진입 전이지만 미리 작성하고 싶음.
```
```
학습자 모집 채널 후보 5개 brainstorm해줘.
```
→ 본인 결단 영역 명시적으로 위임. Claude가 그 영역에서만 작업.

#### C. 상태 점검만
```
v19까지 어디까지 왔는지 요약해줘
```
```
다음 후보 4가지 보여줘
```
→ Claude가 HANDOFF.md 기반으로 상태 보고만 하고 멈춤.

### 13.2 작업 시작 전 체크리스트

```bash
# 1. 두 레포 모두 main 최신
cd /c/tmp/oelp && git pull && git log --oneline -3
cd /c/tmp/myprojects && git pull && git log --oneline -3

# 2. CI 상태 (최근 PR 통과 + 일요일 cron 정상)
cd /c/tmp/oelp && gh run list --limit 3

# 3. 운영 상태 (선택)
curl -sI https://oelp-phi.vercel.app/
curl -s https://vocab-cat-api-452237528328.asia-northeast3.run.app/health
```

### 13.3 자율 vs 본인 결단 구분 (트리거)

#### 자율 진행 가능 (Claude 단독)
- 시뮬레이션 (dogfood-16~)
- 코드 품질 (coverage push, refactor)
- 운영 위젯 (15번째 component+)
- 문서 메인테넌스 (회고, INDEX)
- 운영 모니터링 도구 확장
- → 트리거: `진행` / `다음 작업` / `자율로`

#### 본인 결단 필요 (smilepat 직접)
- `lib/ontology-weights.json` 변경 (옵션 A' PR)
- `lib/kv-dim-mapping.ts` + `lib/ontology.ts` 동시 변경
- EBS adapter (인증 token 발급 + Gemini quota)
- 외부 학습자 모집 (본인 채널)
- → 트리거: 명시적 위임 ("내가 결단할게" / "이 PR 진행해줘")

### 13.4 v20+ 예상 시나리오 (3가지)

#### A. 학습자 모집 후 데이터 도착
- RetentionDashboard, PlateauWarningPanel 등 9 surfaces 자동 활성
- C4.1 게이트 첫 실 calibration cycle 시작
- v18 시뮬 모델 vs 실측 일치성 검증

#### B. 본인이 옵션 A' PR 진행
- 4 파일 동시 변경 → C4.1 게이트 통과 (시뮬 예측대로)
- D1 plateau finding의 7번째 closed-loop 영구화
- `check-dim-coverage` CI gate `D1 MISSING → OK` 자동 flip
- 관련 tests (T4 in `dim-coverage-script.test.ts`) 자동 fail → 문서 갱신

#### C. 자율 진행 계속 (학습자 모집 지연)
- `dogfood-16`: Leitner SR + dim-level forgetting 통합 sim
- 다른 dim sensitivity 정밀화
- Phase 3 preview 설계

### 13.5 작업 종료 시 (handoff 갱신)

새 sprint 마무리 후:

1. **HANDOFF.md §1 수치 갱신** (387 → 새 값)
2. **HANDOFF.md §12 변경 이력 한 줄 추가**
3. **CLAUDE.md §11 v20 변경 이력 추가**
4. **myprojects/docs/04-report/oelp-integrated-summary.md §27 v20 신설**
5. **README §9 표 + §1 status badge 갱신**
6. **모두 commit + push**

Claude에게 한 줄로:
```
HANDOFF + CLAUDE + README + myprojects v20 통합 회고 갱신해
```

### 13.6 안전 가이드 (절대 위반 금지 — Claude도 본인도)

다음은 자율 작업 시 Claude가 절대 하지 않도록 본인이 알아두기:

- **`lib/ontology-weights.json` production 값 변경 후 push** — synthetic 검증만 가능, 항상 `git revert`
- **`scripts/promote-weights.mjs --apply`** — 본인이 실 학습자 데이터로만 실행 (Claude 자율 금지)
- **EBS adapter PR을 자율로 작성하고 merge** — 인증 token + Firebase config 본인 영역
- **vocab-cat-test 백엔드 직접 수정 후 Cloud Run 재배포** — 본인이 빌드 검증 후

→ Claude가 위 영역 시도하면 즉시 중단 + `git revert` 요청.

### 13.7 한 줄 요약

> 새 세션에서 `진행` 한 단어만 보내면 Claude가 HANDOFF.md 로드해서 v20 sprint 자율 시작. 본인 결단 영역은 명시적 위임 필요. 작업 종료 시 §13.5 따라 HANDOFF 갱신.

### 13.8 추천 첫 프롬프트 템플릿

```
v19 끝났음. 다음 후보 4가지 dev-flow 순으로 보여주고, 자율 진행 가능한 거 1순위부터 4개 진행해.
```

또는 가장 짧게:

```
진행해
```

→ 둘 다 동일하게 작동. v19 상태 인지 + 다음 자율 후보 자동 선택 + 4-task 시퀀스 시작.

### 13.9 Clone 후 첫 환경 셋업 (한 번만)

```bash
# 1. 두 레포 clone
gh repo clone smilepat/oelp
gh repo clone smilepat/myprojects  # 옵션, 보고서 작업 시 필요

# 2. OELP 의존성
cd oelp
npm install

# 3. 운영 모니터링 도구 점검 (한 번에 확인)
node scripts/check-dim-coverage.mjs      # D1 MISSING 정상 (옵션 A' PR 전)
node scripts/bundle-size-audit.mjs       # 1.58MB / 3MB 정상
node scripts/web-vitals-audit.mjs        # production HTTP baseline

# 4. CI 시뮬 (12 gates)
npm run ci

# 5. Production 확인
curl -sI https://oelp-phi.vercel.app/    # 200 OK
```

위 6 명령 통과하면 환경 정상. 새 Claude session 시작 + `진행` 가능.
