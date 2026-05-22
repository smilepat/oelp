# OELP — Ontology English Learning Platform

> Phase 1 MVP: Diagnosis + Ontology Map + Learning Queue
> Status: Scaffold (2026-05-22) — implementation not started
> Owner: [smilepat](https://github.com/smilepat)

본 레포는 [LogicFlow EdTech 생태계](https://github.com/smilepat/myprojects)의 통합 구현체다. **신규 빌드가 아니라 기존 자산 통합 레이어**임을 분명히 한다.

---

## 1. 본 레포의 역할

```
┌──────────────────────────────────────────────────────────┐
│  smilepat/oelp  (THIS REPO — Next.js 16 통합 앱)         │
│                                                          │
│   ┌─ F1 진단 ──────► vocab-cat-test (IRT 2PL/3PL CAT)    │
│   ├─ F2 Map ───────► csat-graphdb-318 (microskill graph) │
│   └─ F3 학습큐 ────► vocabulary-db + csat-text-master    │
│                       (read-only SQLite 마운트)          │
│                                                          │
│   재사용 컴포넌트:                                       │
│   • 5D Radar  ◄── vocab-learn-pat (React 19 컴포넌트)    │
│   • Leitner SR ◄── vocab-learn-pat (lib/spaced-rep.ts)   │
└──────────────────────────────────────────────────────────┘
```

---

## 2. 문서

설계/검증 문서는 [smilepat/myprojects/docs/01-plan/](https://github.com/smilepat/myprojects/tree/main/docs/01-plan)에 모여 있다:

| 문서 | 역할 |
|---|---|
| [prd-oelp-mvp-phase1.md](https://github.com/smilepat/myprojects/blob/main/docs/01-plan/prd-oelp-mvp-phase1.md) | 메인 PRD. Persona P0(수능 D-365 고2), F1/F2/F3 정의, 12 C 기준, 6 리스크 |
| [dimension-mapping.md](https://github.com/smilepat/myprojects/blob/main/docs/01-plan/dimension-mapping.md) | 5D × 10 QuestionType 가중치 행렬 (ground truth) |
| [analytics-events.md](https://github.com/smilepat/myprojects/blob/main/docs/01-plan/analytics-events.md) | 10 이벤트 타입 × Supabase 스키마 (dogfooding + 미래 활성화 준비) |
| [phase2-backlog.md](https://github.com/smilepat/myprojects/blob/main/docs/01-plan/phase2-backlog.md) | 8 Phase 2 항목 + 정성 게이트 자동 승격 룰 |

추적 이슈: [csat-graphdb-318#5](https://github.com/smilepat/csat-graphdb-318/issues/5) (R1 가중치 calibration)

---

## 3. 기술 스택 ([PRD §B-8](https://github.com/smilepat/myprojects/blob/main/docs/01-plan/prd-oelp-mvp-phase1.md))

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, Cytoscape.js, Chart.js
- **Backend**: Next.js Route Handlers + FastAPI (vocab-cat-test 별도 컨테이너)
- **DB**: SQLite (vocabulary-db, csat-text-master read-only mount) + 기존 graph store
- **Auth**: Supabase Auth
- **배포**: Vercel (Next.js) + Cloud Run (FastAPI)

**도입 거부**: Neo4j (Phase 2 평가), Turso, 별도 Node API server, Redux/Zustand (Next.js Server Components로 충분 가정)

---

## 4. 검증 전략 ([PRD §B-5](https://github.com/smilepat/myprojects/blob/main/docs/01-plan/prd-oelp-mvp-phase1.md))

베타 N≥30 모집 불가 환경 (2026-05-22 확인). 따라서:
- **Dogfooding**: 본인 + 지인 1-3명
- **합성 검증**: csat-graphdb-318 565문항 + vocabulary-db 9183 어휘 직접 SQL 분석
- **본인 도메인 retrospective**: EFL 콘텐츠 개발자 관점에서 5점 척도 평가

→ 통계 KPI 대신 12개 정성 + 합성 C 기준 (PRD §B-5 참조).

---

## 5. 시작하기 (Implementation Pending)

스캐폴드만 생성됨. 실제 구현은 별도 작업 시 시작:

```bash
# (예정)
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir
```

설치 후 추가할 의존성:
- `cytoscape` `cytoscape-react`
- `chart.js` `react-chartjs-2`
- `@supabase/supabase-js`
- `better-sqlite3` (vocabulary-db, csat-text-master 마운트)

---

## 6. 기여 및 라이선스

- 1인 프로젝트 (smilepat). PR은 본인 단독 결재.
- 라이선스: 미정. Phase 1 종료 후 결정.
- 본 레포의 어떤 자료도 LogicFlow 생태계 외부에 무단 전재 금지 (특히 vocabulary-db, csat-text-master 등 DB 자산은 별도 협의 필요).

---

## 7. 변경 이력

- 2026-05-22 — 레포 생성, README 작성. 구현 미시작.
