import React, { useRef, useState, useEffect } from 'react';
import { Tooltip } from 'antd';
import {
  BoldOutlined, ItalicOutlined, UnderlineOutlined,
  StrikethroughOutlined, FontColorsOutlined,
} from '@ant-design/icons';

const FONT_SIZES = ['10', '12', '13', '14', '16', '18', '20', '24', '28', '32'];
const FONT_FAMILIES = [
  { value: '', label: '기본' },
  { value: 'Arial', label: 'Arial' },
  { value: "'Malgun Gothic', sans-serif", label: '맑은 고딕' },
  { value: "'Gulim', sans-serif", label: '굴림' },
  { value: "'Nanum Gothic', sans-serif", label: '나눔고딕' },
  { value: 'Georgia', label: 'Georgia' },
  { value: "'Courier New', monospace", label: 'Courier' },
];

export default function RichEditor({
  defaultValue = '',
  onChange,
  placeholder = '내용을 입력하세요',
  minHeight = 80,
  style = {},
}) {
  const editorRef = useRef(null);
  const savedRangeRef = useRef(null);
  const [fontColor, setFontColor] = useState('#000000');
  const [fontSize, setFontSize] = useState('14');
  const [fontFamily, setFontFamily] = useState('');

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = defaultValue ?? '';
    }
  }, []); // mount 시 한 번만

  const exec = (cmd) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, null);
  };

  const applySpan = (prop, val, setter) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setter(val); return; }
    const range = sel.getRangeAt(0);
    const frag = range.extractContents();
    const span = document.createElement('span');
    span.style[prop] = prop === 'fontSize' ? `${val}px` : val;
    span.appendChild(frag);
    range.insertNode(span);
    sel.removeAllRanges();
    const nr = document.createRange();
    nr.selectNodeContents(span);
    sel.addRange(nr);
    setter(val);
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    if (!savedRangeRef.current) return;
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  };

  const handleInput = () => {
    onChange?.(editorRef.current?.innerHTML ?? '');
  };

  const btn = {
    width: 26, height: 26, padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid transparent', borderRadius: 4,
    background: 'transparent', cursor: 'pointer',
    fontSize: 12, color: 'var(--fd-text-secondary)', flexShrink: 0,
  };
  const sep = { width: 1, height: 14, background: '#e0e0e0', margin: '0 3px', flexShrink: 0 };

  return (
    <div style={{ border: '1px solid var(--fd-border)', borderRadius: 6, overflow: 'hidden', ...style }}>
      {/* 서식 툴바 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '4px 8px', borderBottom: '1px solid var(--fd-border)',
        background: 'var(--fd-surface-sunken)', flexWrap: 'wrap',
      }}>
        <Tooltip title="굵게"><button type="button" style={btn} onMouseDown={(e) => { e.preventDefault(); exec('bold'); }}><BoldOutlined /></button></Tooltip>
        <Tooltip title="기울임"><button type="button" style={btn} onMouseDown={(e) => { e.preventDefault(); exec('italic'); }}><ItalicOutlined /></button></Tooltip>
        <Tooltip title="밑줄"><button type="button" style={btn} onMouseDown={(e) => { e.preventDefault(); exec('underline'); }}><UnderlineOutlined /></button></Tooltip>
        <Tooltip title="취소선"><button type="button" style={btn} onMouseDown={(e) => { e.preventDefault(); exec('strikeThrough'); }}><StrikethroughOutlined /></button></Tooltip>
        <div style={sep} />
        <select
          value={fontSize}
          onChange={(e) => applySpan('fontSize', e.target.value, setFontSize)}
          style={{ height: 24, fontSize: 11, border: '1px solid var(--fd-border)', borderRadius: 4, padding: '0 2px', cursor: 'pointer', background: 'var(--fd-surface)', width: 54 }}
        >
          {FONT_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
        </select>
        <select
          value={fontFamily}
          onChange={(e) => applySpan('fontFamily', e.target.value, setFontFamily)}
          style={{ height: 24, fontSize: 11, border: '1px solid var(--fd-border)', borderRadius: 4, padding: '0 2px', cursor: 'pointer', background: 'var(--fd-surface)', width: 80 }}
        >
          {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <div style={sep} />
        <Tooltip title="글자 색상">
          <label
            onMouseDown={saveSelection}
            style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0 3px' }}
          >
            <FontColorsOutlined style={{ fontSize: 13, color: 'var(--fd-text-secondary)' }} />
            <div style={{ position: 'absolute', bottom: -1, left: 2, right: 2, height: 3, background: fontColor, borderRadius: 1 }} />
            <input
              type="color"
              value={fontColor}
              onChange={(e) => {
                restoreSelection();
                document.execCommand('foreColor', false, e.target.value);
                setFontColor(e.target.value);
              }}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
            />
          </label>
        </Tooltip>
      </div>

      {/* 편집 영역 */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        className="rich-editor-body"
        style={{
          minHeight,
          padding: '8px 10px',
          fontSize: 14,
          lineHeight: 1.6,
          outline: 'none',
          cursor: 'text',
          wordBreak: 'break-word',
          color: 'var(--fd-text-primary)',
          background: 'var(--fd-surface)',
        }}
      />
    </div>
  );
}
