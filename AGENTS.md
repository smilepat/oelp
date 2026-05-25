<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# OELP Agent 자율 작업 컨텍스트 (v17 시점, 2026-05-25)

본 레포는 17 sprint 동안 자율 + 본인 결단을 혼합한 진화 경로를 거침. 새 Claude session이 들어왔을 때 핵심 컨텍스트:

## 1. 절대 위반 금지 (안전 정책)

- **production weight 직접 변경 금지** — `lib/ontology-weights.json` 은 `scripts/promote-weights.mjs` 만 변경 가능 (lastWriter enforcement)
- **synthetic data로 production weight update 절대 불가** — 시뮬에서 검증된 가설도 git revert 필수
- **LogicFlow 생태계 외부 무단 전재 금지** — vocabulary-db 원본 (data/*.csv) 영구 gitignored
- **본인 결단 영역 자율 시도 금지** — Cloud Run (✅), EBS adapter (1-2일), 옵션 A' (1일), 학습자 모집 (☐) 은 모두 본인 결단 영역. 자율로는 설계 + 시뮬 + 안전성 확보까지만.

## 2. 핵심 D1_Form 컨텍스트 (v9~v17 누적)

- 21 keyVariables 모두 D2-D5만 매핑 → D1_Form derived 0%
- weight matrix 모든 10 QT에서 D1 = 0.05 (학습 임계 0.15 미달)
- 5 archetype 시뮬 모두에서 D1 plateau (dogfood-9)
- forgetting 추가 시 D1 -72% negative gap (dogfood-12)
- **옵션 A' PR**: 4 파일 동시 변경으로 해결 (1일 작업, 본인 결단)
- **사전 검증 완료**: simulate-option-a-prime (PASS) + dogfood-10 (SAFE) + dogfood-13 forgetting+옵션 A' (D1 +113~160%p, side effect 0)

## 3. 자율 작업 5 카테고리 (v4-v17 누적)

1. **코드 품질**: coverage push, test 추가, refactor (v4-v11)
2. **시뮬 도구**: dogfood-3~13 (v9-v17)
3. **운영 위젯**: 13 components, 8 자동 활성 surfaces (v5-v15)
4. **문서 메인테넌스**: myprojects 통합 회고, PRD R6, INDEX (모든 sprint)
5. **운영 모니터링** (v11+ 신규): check-dim-coverage / simulate-option-a-prime / dogfood-9~13 / bundle-audit / c4-3-trend-cli

자율 가능한 다음 후보 발굴 시 위 5 카테고리에서 고르거나 새 카테고리 발견 시 명시.

## 4. 학습자 도착 시 자동 활성 chain (8 surfaces)

학습자 1명 도착 + Cloud Run 진단 → /queue 학습 → /sessions 누적 시:

1. TrendPanel (v5) — accuracy + 5D trend
2. PosteriorBalancePanel (v4) — Beta posterior + balance
3. AnalyticsQueuePanel (v5) — 11 이벤트 분포
4. AdaptiveDiagnosticStats (v5) — θ history + KR1.1/1.2
5. CalibrationEventSync (v7) — audit log mirror
6. PlateauWarningPanel (v13) — D1 plateau 자동 confirm
7. /map D1 indicator (v14) — derived 0% 알림
8. QueuePlateauNotice (v15) — 큐 D1 targeting + plateau 경고

## 5. 운영 모니터링 도구 (8개)

| 도구 | 용도 |
|---|---|
| `scripts/check-dim-coverage.mjs` | keyVariable 매핑 갭 자동 진단 (CI gate 12) |
| `scripts/simulate-option-a-prime.mjs` | 옵션 A' PR 사전 검증 |
| `scripts/dogfood-9-dim-plateau-scan.mjs` | 5×5 plateau matrix |
| `scripts/dogfood-10-option-a-prime-matrix.mjs` | 옵션 A' 효과 사전 측정 |
| `scripts/dogfood-11-weight-sensitivity.mjs` | 5 dim weight sensitivity |
| `scripts/bundle-size-audit.mjs` | Production bundle size |
| `scripts/dogfood-12-forgetting-curve.mjs` | 24주 forgetting 시뮬 |
| `scripts/dogfood-13-forgetting-plus-option-a-prime.mjs` | 옵션 A' + forgetting 결합 |
| `scripts/c4-3-trend-cli.mjs` | CI/cron trend analysis |

## 6. 첫 진입 시 권장 순서

1. **`HANDOFF.md` §13** → 다음 작업 시작 지침 (clone 후 즉시 적용 가능, 가장 우선) ⭐
2. **HANDOFF.md §1-§12** → 19 sprints 누적 인계 + 핵심 함정 메모
3. **CLAUDE.md §2 status table** → 현 누적 수치
4. **CLAUDE.md §11 변경 이력** → v1~v19 한 줄 요약
5. **본 AGENTS.md** → 안전 정책 + 본인 결단 영역
6. **README.md §10 Stage A/B/C/D** → 다음 자율 가능 후보
7. **myprojects/docs/04-report/oelp-integrated-summary.md** → 7번째 closed-loop PR-ready 상태

## 7. 본인 결단 미해결 항목 (v17 시점)

1. ⚠️ **EBS adapter PR** (1-2일) — 설계 완료, contract mismatch + 인증 + 도메인 mismatch 해결
2. ⚠️ **D1_Form 옵션 A' PR** (1일) — 5중 안전성 + 3단계 정량 정당화 완료, risk-free
3. ☐ **외부 학습자 1명 모집** — 8 surfaces + 6 closed-loops 활성화 trigger

자율 진행 시 위 3건과 무관한 영역에서 작업.

## 8. dev workflow 핵심 명령

```bash
npm test                              # Vitest 379 tests
npm run build                         # Next.js Turbopack build
npm run ci                            # lint + tests + C4.1 + build (12 gates)
node scripts/check-dim-coverage.mjs   # keyVariable 매핑 진단
node scripts/update-readme-counters.mjs  # README ↔ filesystem 동기화
node scripts/check-cross-repo-links.mjs  # myprojects 링크 검증
```

## 9. Production 환경

- **Vercel**: `https://oelp-phi.vercel.app` (alias)
- **Cloud Run vocab-cat-api**: `https://vocab-cat-api-452237528328.asia-northeast3.run.app`
- **Vercel env** `NEXT_PUBLIC_VOCAB_CAT_TEST_URL` 자동 연결
- **CI**: weekly cron 03:00 UTC (vocab-cat-test-smoke + weekly-calibration)
