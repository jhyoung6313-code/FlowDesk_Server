// 메모 색상 팔레트 (백엔드 memoController COLORS 와 키 일치)
export const MEMO_PALETTE = {
  yellow: { bg: '#fff7cc', border: '#f4e08a', dot: '#f5d34e' },
  pink:   { bg: '#ffe0ec', border: '#f5b8cf', dot: '#f78cb0' },
  blue:   { bg: '#dcefff', border: '#a9d2f5', dot: '#5aa9ec' },
  green:  { bg: '#dbf7e3', border: '#a6e4ba', dot: '#54c279' },
  purple: { bg: '#ece0ff', border: '#cbb4f0', dot: '#a87de8' },
  orange: { bg: '#ffe6cc', border: '#f5c79a', dot: '#f5a04e' },
  gray:   { bg: '#eceef1', border: '#cdd2d8', dot: '#9aa3ad' },
};

export const MEMO_COLOR_KEYS = Object.keys(MEMO_PALETTE);

export const memoColor = (key) => MEMO_PALETTE[key] || MEMO_PALETTE.yellow;
