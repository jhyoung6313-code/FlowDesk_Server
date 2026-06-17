// ─────────────────────────────────────────────────────────────
// 감사 로깅 미들웨어
//  1) auditAction(action): 특정 라우트에 부착해 개인정보 조회/반출 자동 기록
//  2) auditForbidden:      응답 status 가 403 일 때 권한거부 자동 기록(전역 부착)
// 응답 전송 후(on 'finish') 기록하므로 본 요청 지연이 없다.
// ─────────────────────────────────────────────────────────────

const audit = require('../services/auditService');
const { AUDIT_ACTION } = require('../config/security');

// 라우트별 부착: 예) router.get('/export', auditAction(AUDIT_ACTION.DATA_EXPORT), handler)
function auditAction(action, resourceResolver) {
  return (req, res, next) => {
    res.on('finish', () => {
      // 2xx 성공 응답만 "처리됨"으로 기록 (실패는 별도 규칙)
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      const resource = typeof resourceResolver === 'function'
        ? resourceResolver(req)
        : `${req.method} ${req.baseUrl}${req.path}`;
      audit.record({
        action,
        req,
        resource,
        success: ok,
        detail: ok ? undefined : `status=${res.statusCode}`,
      });
    });
    next();
  };
}

// 전역 부착: 403 응답이면 권한거부 기록
function auditForbidden(req, res, next) {
  res.on('finish', () => {
    if (res.statusCode === 403) {
      audit.record({
        action: AUDIT_ACTION.PERMISSION_DENIED,
        req,
        resource: `${req.method} ${req.originalUrl}`,
        success: false,
      });
    }
  });
  next();
}

module.exports = { auditAction, auditForbidden };
