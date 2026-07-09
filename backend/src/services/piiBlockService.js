// ─────────────────────────────────────────────────────────────
// 개인정보/신용정보 입력 차단 로그 서비스 (append-only)
// ⚠️ 차단된 원문은 저장하지 않는다(관리자 포함 누구도 열람 불가).
//    기록 식별용 마스킹본(masked)만 남긴다.
// 기록 실패가 본 요청 흐름을 막지 않도록 예외를 삼킨다.
// ─────────────────────────────────────────────────────────────

const prisma = require('../lib/prisma');
const { getClientIp } = require('./auditService');
const { maskPhone, maskAccount } = require('../utils/masking');

// 원문 부분 마스킹(짧으면 전부 마스킹) — 유형 미지정 시 폴백
function maskGeneric(s) {
  const t = String(s);
  if (t.length <= 3) return '*'.repeat(t.length);
  return t[0] + '*'.repeat(Math.min(t.length - 3, 8)) + t.slice(-2);
}

// 유형별 식별용 마스킹. 주민번호는 생년월일(앞 6자리)만 노출하고 나머지는 가린다.
function maskByType(piiType, match) {
  switch (piiType) {
    case '주민등록번호': {
      // 901201-1234567 → 901201-******* (생년월일까지만 노출, 성별·일련번호 마스킹)
      const m = String(match).replace(/(\d{6})[-\s]?\d{7}/, '$1-*******');
      return m;
    }
    case '신용카드번호': return maskAccount(match); // 뒤 4자리만 노출
    case '계좌번호':    return maskAccount(match); // 뒤 4자리만 노출
    case '연락처':      return maskPhone(match);   // 010-****-5678
    default:            return maskGeneric(match);
  }
}

/**
 * 차단 1건 기록.
 * @param {object} p
 * @param {object} p.req        Express req (사용자/IP/UA/엔드포인트 추출)
 * @param {string} p.piiType    탐지 유형(주민등록번호 등)
 * @param {string} p.match      탐지된 원문 조각
 * @param {string} [p.fieldPath] 탐지된 body 필드 경로
 */
async function record({ req, piiType, match, fieldPath }) {
  try {
    await prisma.piiBlockLog.create({
      data: {
        userId: req?.user?.id ?? null,
        username: req?.user?.username ?? null,
        piiType,
        fieldPath: fieldPath ? String(fieldPath).slice(0, 100) : null,
        masked: maskByType(piiType, match),
        endpoint: req ? `${req.method} ${req.originalUrl}`.slice(0, 120) : null,
        ipAddress: getClientIp(req),
        userAgent: req?.headers?.['user-agent'] ?? null,
      },
    });
  } catch (err) {
    console.error('[pii-block] 기록 실패:', err.message);
  }
}

module.exports = { record, maskGeneric, maskByType };
