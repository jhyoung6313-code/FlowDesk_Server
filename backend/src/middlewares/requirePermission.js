// ─────────────────────────────────────────────────────────────
// 권한 그룹 기반 접근 제어 미들웨어
// role(admin/member)과 무관하게, 사용자의 permissions 집합에
// 지정한 권한 키가 있어야 통과시킨다. (직무분리 — admin 자동 통과 아님)
// 반드시 authenticate 뒤에 부착한다.
// ─────────────────────────────────────────────────────────────

function requirePermission(permissionKey) {
  return (req, res, next) => {
    const perms = req.user?.permissions || [];
    if (!perms.includes(permissionKey)) {
      return res.status(403).json({ error: '해당 기능에 대한 권한이 없습니다.' });
    }
    next();
  };
}

module.exports = { requirePermission };
