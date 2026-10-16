/* 메인(홈) 화면 레이아웃 목록 — 개인 설정 `home.layout` 에 저장.
   'classic' 은 기존 대시보드(위젯 그리드)로, 아래 새 레이아웃은 교체가 아니라 선택지로 추가된다. */
export const HOME_LAYOUTS = [
  { key: 'classic', name: '기본 대시보드', desc: '위젯 드래그·크기조절 (기존 화면)' },
  { key: 'command', name: 'A · 커맨드 센터', desc: '다크 벤토 타일, 숫자 중심' },
  { key: 'focus',   name: 'C · 포커스 모드', desc: '지금 할 일 하나에 집중 + 타이머' },
  { key: 'board',   name: 'E · 보드 퍼스트', desc: '파스텔 칸반이 메인, 드래그 상태변경' },
  { key: 'brief',   name: 'F · 데일리 브리프', desc: '신문 1면식 에디토리얼' },
];

export const DEFAULT_HOME_LAYOUT = 'classic';
export const HOME_LAYOUT_KEYS = HOME_LAYOUTS.map((l) => l.key);
export const isHomeLayout = (k) => HOME_LAYOUT_KEYS.includes(k);
