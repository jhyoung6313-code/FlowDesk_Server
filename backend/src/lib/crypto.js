// ─────────────────────────────────────────────────────────────
// 민감정보 컬럼 암호화 유틸 (AES-256-GCM)
// 주민등록번호·계좌번호·연락처 등 신용정보/고유식별정보 저장 시 사용.
// - 키: .env DATA_ENCRYPTION_KEY (32바이트 = 64 hex)
// - 형식: iv(12B):authTag(16B):cipherText 를 base64 로 직렬화
// ⚠️ 비밀번호는 단방향(bcrypt)을 사용하며 이 모듈을 쓰지 않는다.
// ─────────────────────────────────────────────────────────────

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;       // GCM 권장 96bit
const KEY_LENGTH = 32;      // 256bit
const SEPARATOR = ':';

function getKey() {
  const hex = process.env.DATA_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('DATA_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다. 민감정보 암호화 불가.');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`DATA_ENCRYPTION_KEY 길이 오류: 32바이트(64 hex)여야 합니다. (현재 ${key.length}바이트)`);
  }
  return key;
}

// 평문 → 암호문(base64). null/undefined 는 그대로 통과.
function encrypt(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') return plainText;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(SEPARATOR);
}

// 암호문 → 평문. 형식이 아니면 원본 반환(마이그레이션 호환).
function decrypt(cipherText) {
  if (cipherText === null || cipherText === undefined || cipherText === '') return cipherText;
  const parts = String(cipherText).split(SEPARATOR);
  if (parts.length !== 3) return cipherText; // 암호화되지 않은 기존 데이터
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

// 검색용 결정적 해시(HMAC-SHA256). 동일 평문 → 동일 해시이므로
// 암호화 컬럼을 동등조건 검색해야 할 때 별도 인덱스 컬럼으로 사용.
function blindIndex(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') return plainText;
  return crypto.createHmac('sha256', getKey()).update(String(plainText)).digest('hex');
}

module.exports = { encrypt, decrypt, blindIndex };
