import { Tag } from 'antd';

// 민감도 라벨(F-67) 단일 진실 원천 — 셀렉트 옵션 + 배지 렌더링.
// 사용처: BBS 작성 폼/상세, 위키 편집 헤더/문서.
export const SENSITIVITY_OPTIONS = [
  { value: 'public', label: '🌐 공개' },
  { value: 'internal', label: '🏢 사내한' },
  { value: 'confidential', label: '🔒 기밀' },
];

const META = {
  internal: { color: 'orange', label: '🏢 사내한' },
  confidential: { color: 'red', label: '🔒 기밀' },
};

// public은 배지를 표시하지 않음(기본값이라 노이즈 방지)
export default function SensitivityTag({ value, style }) {
  const m = META[value];
  if (!m) return null;
  return <Tag color={m.color} style={style}>{m.label}</Tag>;
}
