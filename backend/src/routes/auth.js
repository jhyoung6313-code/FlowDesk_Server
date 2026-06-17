const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const authController = require('../controllers/authController');

// 로그인 (1단계: 아이디+비밀번호)
router.post('/login', authController.login);
// 로그인 (2단계: OTP 검증)
router.post('/login/totp', authController.verifyLoginTotp);
// 로그인 중 OTP 최초 등록 (ENFORCE_OTP=true, 미등록 사용자)
router.post('/login/totp-setup', authController.setupLoginTotp);
router.post('/login/totp-enroll', authController.verifyLoginTotpSetup);

// 계정 신청 (1단계: 정보 입력 → QR 코드 반환)
router.post('/register', authController.register);
// 계정 신청 (2단계: OTP 인증 → 계정 활성화)
router.post('/register/verify', authController.verifyRegisterTotp);

// 비밀번호 초기화 (비로그인 상태, OTP 인증 필요)
router.post('/reset-password/request',    authController.requestPasswordReset);
router.post('/reset-password/verify-otp', authController.verifyResetOtp);
router.post('/reset-password/confirm',    authController.confirmPasswordReset);

router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
router.put('/password', authenticate, authController.changePassword);
// 내 프로필(조직 정보: 관리부서/직책/직급) 수정
router.put('/profile', authenticate, authController.updateProfile);
// 미사용 화면 잠금 시간 설정
router.put('/idle-timeout', authenticate, authController.updateIdleTimeout);
// 화면 잠금 해제용 비밀번호 검증
router.post('/verify-password', authenticate, authController.verifyPassword);

// OTP 설정 (로그인된 사용자)
router.post('/otp/setup', authenticate, authController.setupOtp);
router.post('/otp/verify', authenticate, authController.verifySetupOtp);
router.post('/otp/disable', authenticate, authController.disableOtp);

module.exports = router;
