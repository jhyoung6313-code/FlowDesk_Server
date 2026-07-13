# tm-okr — OKR/목표 관리 (F-60)

분기·연간 목표(Objective)와 핵심결과(KeyResult)를 정의하고 진척을 자동 집계.
회사→부서/팀→개인 계층으로 목표 정렬. KR을 업무([tm-core])에 연결하면 완료율로 진척 자동화.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 컨트롤러(진척 계산 포함) | `backend/src/controllers/okrController.js` |
| 라우트 | `backend/src/routes/okr.js` |
| 프론트 API | `frontend/src/api/okr.js` |
| 화면 | `frontend/src/pages/Okr/index.jsx` |
| 스키마 | `OkrCycle`, `Objective`, `KeyResult`, `KeyResultLink`, `KeyResultCheckin` |

## 개념 구조
주기(OkrCycle) → 목표(Objective, `parentId` 정렬 트리) → 핵심결과(KeyResult) → 체크인(KeyResultCheckin) / 업무 연결(KeyResultLink)

- **주기**: 연도·분기(예: 2026 Q3)·기간·활성여부. 관리자만 생성/삭제
- **목표(Objective)**: 범위(company/dept/team/personal)·책임자·상태(on_track/at_risk/off_track)·진척(KR 평균 자동). 소프트 삭제. 수정 권한: 책임자·관리자
- **핵심결과(KeyResult)**: 측정 유형(number/percent/boolean), 시작값·목표값·현재값, 담당자, `autoProgress`
- **체크인**: 주기적 현재값·신뢰도(1~10)·코멘트 이력. 기록 시 KR 현재값 갱신
- **업무 연결(KeyResultLink)**: KR↔업무(task) 연결. `autoProgress` KR은 연결 업무 완료율로 진척 자동화

## 진척 계산 (okrController)
- **KR**: `krProgress = (현재-시작)/(목표-시작)` 0~100 클램프. boolean은 목표 도달 시 100
- **Objective**: 소속 KR 진척률 평균 (`recomputeObjective`)
- **autoProgress**: 연결된 task 중 `status='done'` 비율 → currentValue 환산 (`refreshAutoProgress`)
- 체크인·KR 수정·연결 변경 시 자동 재계산

## API (마운트 `/api/okr`, 인증 필요)

| 구분 | 엔드포인트 |
|------|-----------|
| 주기 | `GET /api/okr/cycles`, `POST /api/okr/cycles`(관리자), `DELETE /api/okr/cycles/:id`(관리자) |
| 트리 | `GET /api/okr/tree?cycleId=` (목표+KR+진척) |
| 목표 | `POST /api/okr/objectives`, `PUT/DELETE /api/okr/objectives/:id` |
| KR | `POST /api/okr/objectives/:objId/key-results`, `PUT/DELETE /api/okr/key-results/:krId` |
| 체크인 | `GET/POST /api/okr/key-results/:krId/checkins` |
| 업무 연결 | `GET/POST /api/okr/key-results/:krId/links`, `DELETE .../links/:linkId` |

## 화면
`/okr` — 주기 선택 + 주기 전체 진척 배너 + 목표 카드(진척바·상태·KR 리스트·체크인·업무 연결).
KR 편집 모달의 자동진척 체크박스 + KR 행의 연결 버튼으로 업무 연결/해제. 사이드바 'OKR' 메뉴(뷰 그룹, `FlagOutlined`).

## 미구현(후속 확장 후보)
목표 정렬(alignment) 트리 시각화, 보드카드([tm-board])·WBS([tm-wbs]) 연결(현재 업무만), 진척 히트맵 대시보드.
기획: `docs/제안기능_기획서.md` F-60
