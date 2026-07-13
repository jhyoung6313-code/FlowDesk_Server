# tm-ledger — 가계부 (F-45)

수입/지출 내역·카테고리·예산·반복거래·월별 통계.

## 관련 파일

| 구분 | 경로 |
|------|------|
| 가계부 페이지 | `frontend/src/pages/Ledger/` |
| Ledger API 함수 | `frontend/src/api/ledger.js` |
| 컨트롤러 | `backend/src/controllers/ledgerController.js` |
| 라우트 | `backend/src/routes/ledger.js` |
| 스키마 | LedgerCategory, LedgerEntry, LedgerBudget, LedgerRecurring |

## F-45 상세
- **내역(LedgerEntry)**: 수입(income)/지출(expense) 등록·수정·삭제, 카테고리 분류
- **카테고리(LedgerCategory)**: 수입/지출 카테고리
- **예산(LedgerBudget)**: 월별 예산(카테고리+년월 unique)
- **반복 거래(LedgerRecurring)**: 월별 자동 생성
- **통계**: 월별 차트(Recharts)
- API:
  - `GET/POST /api/ledger/entries`
  - `GET/POST /api/ledger/categories`
  - `GET/POST /api/ledger/budgets`
  - `GET/POST /api/ledger/recurrings`
