# tm-views — 시각화 뷰 (F-08·09·12·16·20·21·26~28·33)

캘린더·간트·칸반·대시보드·마일스톤·캘린더메모 등 업무 시각화.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 캘린더 | `frontend/src/pages/Calendar/index.jsx` |
| 간트 | `frontend/src/pages/Gantt/index.jsx` |
| 칸반 | `frontend/src/pages/Kanban/` (또는 Tasks?view=kanban) |
| 대시보드 | `frontend/src/pages/Dashboard/index.jsx` |
| 마일스톤(Admin) | `frontend/src/pages/Admin/Milestones.jsx` |
| 캘린더메모 컨트롤러 | `backend/src/controllers/calendarNoteController.js` |
| 마일스톤 컨트롤러 | `backend/src/controllers/milestoneController.js` |
| 테마/스킨 스토어 | `frontend/src/store/themeStore.js` |
| 스킨 정의 | `frontend/src/utils/skins.js` |

## 기능 상세

- **F-08 캘린더**: FullCalendar v6, 시작~마감 범위 표시, 드래그로 날짜 변경. `GET /api/tasks/calendar`
- **F-09 간트**: gantt-task-react, 팀별 그룹화·의존 화살표. `GET /api/tasks/gantt`
- **F-12 칸반**: 상태 컬럼(대기/진행중/완료/보류) 드래그 상태 변경. `PATCH /api/tasks/:id/status`
- **F-16 대시보드**: Recharts 통계 위젯(상태별/파트별/우선순위별 도넛·바, D-Day). 게시판 위젯·주간 일정/자원 위젯 연동([tm-bbs]·[tm-schedule])
- **F-16 대시보드 위젯 카탈로그 (v2.15)**: 블록 그리드(`react-grid-layout`) + 편집 모드 "+ 위젯"으로 추가 위젯 5종(`x-counts`·`x-approvals`·`x-meetings`·`x-actions`·`x-okr`, 기본 숨김). 정의 `pages/Dashboard/extraWidgets.jsx`(`EXTRA_BLOCKS`), 저장 `PUT /api/settings/dashboard-layout`(`{v:1,layout,enabled}`, 블록 id가 키라 변경 금지). 내 하루 집계 필요 위젯이 켜졌을 때만 `GET /api/me/today` 호출
- **메인 화면 레이아웃 선택 (v2.16)**: `기본 대시보드`(기존 위젯 그리드) 외에 A 커맨드 센터·C 포커스 모드·E 보드 퍼스트·F 데일리 브리프를 선택(헤더 테마 팝오버 → 메인 화면). 개인 설정 `PUT /api/settings/preferences {home:{layout:'classic'|'command'|'focus'|'board'|'brief'}}`. 라우터 `pages/Dashboard/HomeRouter.jsx`, 레이아웃 `pages/Dashboard/layouts/*Home.jsx`, 공유 데이터 `layouts/useHomeData.js`, 목록 `utils/homeLayouts.js`, 상태 `preferenceStore.homeLayout`. 새 레이아웃 추가 = `homeLayouts.js` 항목 + `HomeRouter` LAYOUTS 매핑 + 컴포넌트 1개
- **레일 메뉴 개인화 (v2.15)**: `utils/navRegistry.jsx`(NAV_ITEMS 20개·DEFAULT_PINNED), `store/preferenceStore.js`(navPinned), `components/Layout/NavCustomizer.jsx`(편집 모달), `Sidebar.jsx` 레일 렌더. 저장 `PUT /api/settings/preferences {nav:{pinned:[경로...]}}`
- **F-20 디자인 스킨 (구 컬러 테마)**: ⚠️ **[v2.14]** 색상 테마 선택은 제거되고 **디자인 스킨 8종**(기본·뉴브루탈·클레이·미니멀모노·아우로라글래스·소프트팝·슬릭다크·페이퍼)으로 대체. 스킨이 형태(`--fd-sk-*`)+강조색+자연 모드를 함께 정의. `skins.js` 정의, `themeStore` 관리(localStorage+서버), `App.jsx`가 AntD 표면/테두리 토큰을 스킨에 연결. 라이트/다크 토글은 유지(스킨 선택 시 자연 모드 자동 전환)
- **F-21 마일스톤**: 날짜·색상·설명 이정표, 캘린더·간트 표시. `GET/POST /api/milestones`, `PUT/DELETE /api/milestones/:id`
- **F-26 캘린더 메모**: 특정 날짜 자유 메모(200자). `GET/POST /api/calendar-notes`, `PUT/DELETE /api/calendar-notes/:id`
- **F-27 뷰 전환**: 업무 페이지 리스트/칸반/캘린더 3뷰
- **F-28 대시보드 위젯**: 위젯별 최소화/펼치기, 반응형
- **F-33 지연 표시**: 마감 경과+미완료를 "지연" 배지 (목록/칸반/대시보드 공통)
