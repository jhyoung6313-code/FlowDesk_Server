import React, { useEffect, useMemo, useRef, useState } from 'react';
import { check, addIgnore } from '../../utils/koSpell';

/* 한국어 오타 물결밑줄 표시 텍스트영역 (표시 전용 · 강제/자동수정 없음)
   - 입력창 뒤 backdrop 에 동일 텍스트를 그려 오타 구간에 물결 밑줄
   - 하단에 검출 요약(교정안) · 각 항목 '무시' 가능
   - Form.Item 의 value/onChange 를 그대로 사용 */
export default function SpellTextArea({
  value = '',
  onChange,
  placeholder,
  rows = 4,
  disabled = false,
  style = {},
  spellSummary = true,
  ...rest
}) {
  const taRef = useRef(null);
  const bdRef = useRef(null);
  const [matches, setMatches] = useState([]);
  const [tick, setTick] = useState(0); // 무시 목록 변경 시 재검사
  const timer = useRef(null);

  // 디바운스 검사
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMatches(check(value)), 350);
    return () => clearTimeout(timer.current);
  }, [value, tick]);

  const syncScroll = () => {
    if (bdRef.current && taRef.current) {
      bdRef.current.scrollTop = taRef.current.scrollTop;
      bdRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };

  // 오타 구간을 <span> 물결밑줄로 감싼 세그먼트
  const segments = useMemo(() => {
    if (!matches.length) return [value];
    const out = [];
    let cursor = 0;
    matches.forEach((m, i) => {
      if (m.start > cursor) out.push(value.slice(cursor, m.start));
      out.push(
        <span key={i} style={{
          textDecoration: 'underline wavy',
          textDecorationColor: m.dict ? '#d99a2b' : '#e0483d',
          textDecorationSkipInk: 'none',
        }}>{value.slice(m.start, m.end)}</span>
      );
      cursor = m.end;
    });
    if (cursor < value.length) out.push(value.slice(cursor));
    return out;
  }, [matches, value]);

  // backdrop 과 textarea 가 정확히 겹치도록 공유 박스 스타일
  const boxStyle = {
    margin: 0,
    padding: '4px 11px',
    border: '1px solid var(--fd-border, #d9d9d9)',
    borderRadius: 8,
    fontFamily: 'inherit',
    fontSize: 13,
    lineHeight: 1.5715,
    letterSpacing: 'normal',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
    boxSizing: 'border-box',
    width: '100%',
  };

  return (
    <div style={{ width: '100%' }}>
      <div style={{ position: 'relative', ...style }}>
        {/* backdrop (물결밑줄) */}
        <div
          ref={bdRef}
          aria-hidden
          style={{
            ...boxStyle,
            position: 'absolute', inset: 0, overflow: 'hidden',
            color: 'transparent', pointerEvents: 'none',
            borderColor: 'transparent', background: 'transparent',
          }}
        >
          {segments}
          {/* 마지막 줄바꿈 대응 */}
          {'​'}
        </div>
        {/* 실제 입력 */}
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onScroll={syncScroll}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          spellCheck={false}
          style={{
            ...boxStyle,
            position: 'relative',
            background: 'transparent',
            resize: 'vertical',
            outline: 'none',
            color: 'inherit',
            minHeight: rows * 22 + 10,
          }}
          {...rest}
        />
      </div>

      {/* 검출 요약 (표시 전용) */}
      {spellSummary && matches.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span style={{ color: '#e0483d', fontWeight: 600 }}>오타 의심 {matches.length}건</span>
          {matches.slice(0, 8).map((m, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: m.dict ? '#fbf0dd' : '#fbe9e6', color: m.dict ? '#b0741c' : '#c73a2f',
              borderRadius: 6, padding: '1px 8px',
            }}>
              {m.suggestion ? <>{m.wrong} → <b>{m.suggestion}</b></> : m.wrong}
              <span
                title="이 표기 무시"
                onClick={() => { addIgnore(m.wrong); setTick(t => t + 1); }}
                style={{ cursor: 'pointer', color: '#999', marginLeft: 2, fontWeight: 700 }}
              >×</span>
            </span>
          ))}
          {matches.length > 8 && <span style={{ color: '#999' }}>외 {matches.length - 8}건</span>}
        </div>
      )}
    </div>
  );
}
