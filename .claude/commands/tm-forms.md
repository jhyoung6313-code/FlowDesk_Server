# tm-forms — Forms 엔진 (F-66)

설문/투표를 만들고 응답을 수집·집계. M365 Forms 경량판. 설문(Form) → 문항(FormField) → 응답(FormResponse) → 문항응답(FormAnswer) 정규화 구조.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 컨트롤러 | `backend/src/controllers/formController.js` |
| 라우트 | `backend/src/routes/forms.js` |
| 프론트 API | `frontend/src/api/forms.js` |
| 화면 | `frontend/src/pages/Forms/index.jsx` |
| 스키마 | `Form`, `FormField`, `FormResponse`, `FormAnswer` |

## 개념 구조
- **문항 유형**: 단답형(text)·장문형(textarea)·단일선택(single)·복수선택(multiple)·별점(rating)·숫자(number)·날짜(date). 선택형 보기는 `options`(JSON).
- **설문 옵션**: 상태(draft/open/closed), 익명 응답(anonymous), 재응답 허용(multiResponse).
- **응답 규칙**: `status='open'`일 때만 접수. 비익명·단일응답 설문은 중복 응답 차단. 필수 문항 미응답 시 400. 익명이면 `respondentId=null`. 다중선택 값은 JSON 배열 문자열로 저장.
- **문항 잠금**: 응답이 1건이라도 있으면 문항 변경 불가(집계 정합성 보호, 409).
- **결과 집계**: 선택형은 보기별 득표수, 별점·숫자는 평균, 텍스트는 응답 목록. **결과 열람은 작성자·관리자만**.
- **접근**: 목록은 개시된 설문 + 내가 만든 설문(관리자는 전체). 초안은 작성자·관리자만.
- **삭제**: `Form.delYn` 소프트 삭제(신규 도메인 중 정석대로 구현된 사례 — 자동화 규칙의 하드 삭제와 대비됨, [tm-automation-rules] 참조).

## API (인증 필요)

| 구분 | 엔드포인트 |
|------|-----------|
| CRUD | `GET/POST /api/forms`, `GET/PUT/DELETE /api/forms/:id` |
| 상태 변경 | `PATCH /api/forms/:id/status` |
| 응답 제출 | `POST /api/forms/:id/responses` |
| 결과 집계(작성자·관리자) | `GET /api/forms/:id/results` |

## 화면
`/forms` — 카드 목록(상태·문항/응답수) + 빌더 모달(문항 동적 추가) + 응답 모달(유형별 위젯) + 결과 모달(막대·평균). 사이드바 '협업' 그룹 '설문'.

## 미구현(후속 확장 후보)
대상자 지정·마감일 자동화, 분기(조건부 문항), CSV 내보내기, 결재/회의 연동.
