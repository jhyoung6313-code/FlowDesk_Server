import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { TextAlign } from '@tiptap/extension-text-align';
import { Image } from '@tiptap/extension-image';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { Tooltip, Popover, InputNumber, Button, Space } from 'antd';
import { FontColorsOutlined, TableOutlined, PictureOutlined } from '@ant-design/icons';
import {
  btn, Separator, UndoRedoButtons, TextFormatButtons, AlignButtons, ListButtons, LinkButton, editorContentCss,
} from './common/editorShared';
import { applySpellHighlight, clearSpellHighlight } from '../utils/spellHighlight';
import { addIgnore } from '../utils/koSpell';

const FONT_SIZES = ['10px','12px','13px','14px','16px','18px','20px','24px','28px','32px'];
const FONT_FAMILIES = [
  { value: null, label: '기본' },
  { value: 'Arial', label: 'Arial' },
  { value: "'Malgun Gothic', sans-serif", label: '맑은 고딕' },
  { value: "'Gulim', sans-serif", label: '굴림' },
  { value: "'Nanum Gothic', sans-serif", label: '나눔고딕' },
  { value: 'Georgia', label: 'Georgia' },
  { value: "'Courier New', monospace", label: 'Courier' },
];

function TableInsertPopover({ editor, onClose }) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  return (
    <div style={{ width: 180 }}>
      <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>표 삽입</div>
      <Space direction="vertical" style={{ width: '100%' }} size={6}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, width: 20 }}>행</span>
          <InputNumber min={1} max={20} value={rows} onChange={v => setRows(v || 1)} size="small" style={{ flex: 1 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, width: 20 }}>열</span>
          <InputNumber min={1} max={10} value={cols} onChange={v => setCols(v || 1)} size="small" style={{ flex: 1 }} />
        </div>
        <Button type="primary" size="small" block onClick={() => {
          editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
          onClose();
        }}>삽입</Button>
      </Space>
    </div>
  );
}

export default function RichEditor({
  defaultValue = '',
  onChange,
  placeholder = '내용을 입력하세요',
  minHeight = 120,
  style = {},
  spell = true,
}) {
  const [tableOpen, setTableOpen] = useState(false);
  const [fontColor, setFontColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffff00');
  const [fontSize, setFontSize] = useState('14px');
  const [fontFamily, setFontFamily] = useState(null);
  const imgInputRef = useRef(null);
  const spellTimer = useRef(null);
  const [spellMatches, setSpellMatches] = useState([]);

  // 오타 검사(디바운스) — DOM 변형 없이 CSS Highlight로 밑줄
  const scheduleSpell = (ed) => {
    if (!spell || !ed) return;
    clearTimeout(spellTimer.current);
    spellTimer.current = setTimeout(() => {
      try { setSpellMatches(applySpellHighlight(ed.view.dom)); } catch { /* ignore */ }
    }, 400);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } },
      }),
      TextStyle,
      FontSize,
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: defaultValue,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
      scheduleSpell(editor);
    },
  });

  // defaultValue가 나중에 바뀌면(reply/forward 모드) 반영
  useEffect(() => {
    if (editor && defaultValue !== undefined && editor.getHTML() !== defaultValue) {
      editor.commands.setContent(defaultValue || '', false);
      scheduleSpell(editor);
    }
  }, [defaultValue]);

  // 최초 생성 시 1회 검사 + 언마운트 시 하이라이트 정리
  useEffect(() => {
    if (editor && spell) scheduleSpell(editor);
    return () => { clearTimeout(spellTimer.current); clearSpellHighlight(); };
  }, [editor]);

  const insertImage = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      editor?.chain().focus().setImage({ src: ev.target.result, alt: file.name }).run();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // btn·Separator·링크·기본 서식 버튼은 common/editorShared로 공유(RichEditor ↔ CollaborativeEditor)

  if (!editor) return null;

  return (
    <div style={{ border: '1px solid var(--fd-border)', borderRadius: 6, overflow: 'hidden', ...style }}>
      {/* 툴바 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '4px 8px', borderBottom: '1px solid var(--fd-border)',
        background: 'var(--fd-surface-sunken)', flexWrap: 'wrap', rowGap: 4,
      }}>
        {/* Undo/Redo */}
        <UndoRedoButtons editor={editor} />
        <Separator />

        {/* 서체 */}
        <select value={fontFamily ?? ''} onChange={(e) => {
          const v = e.target.value || null;
          setFontFamily(v);
          if (v) editor.chain().focus().setFontFamily(v).run();
          else editor.chain().focus().unsetFontFamily().run();
        }} style={{ height: 24, fontSize: 13, border: '1px solid var(--fd-border)', borderRadius: 4, padding: '0 2px', background: 'var(--fd-surface)', width: 82 }}>
          {FONT_FAMILIES.map(f => <option key={f.value ?? '_'} value={f.value ?? ''}>{f.label}</option>)}
        </select>

        {/* 크기 */}
        <select value={fontSize} onChange={(e) => {
          setFontSize(e.target.value);
          editor.chain().focus().setFontSize(e.target.value).run();
        }} style={{ height: 24, fontSize: 13, border: '1px solid var(--fd-border)', borderRadius: 4, padding: '0 2px', background: 'var(--fd-surface)', width: 56 }}>
          {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <Separator />

        {/* 기본 서식 */}
        <TextFormatButtons editor={editor} />
        <Separator />

        {/* 정렬 */}
        <AlignButtons editor={editor} />
        <Separator />

        {/* 목록 */}
        <ListButtons editor={editor} />
        <Separator />

        {/* 글자 색상 */}
        <Tooltip title="글자 색상">
          <label style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 3px', flexShrink: 0 }}>
            <FontColorsOutlined style={{ fontSize: 13, color: 'var(--fd-text-secondary)' }} />
            <div style={{ position: 'absolute', bottom: -1, left: 2, right: 2, height: 3, background: fontColor, borderRadius: 1 }} />
            <input type="color" value={fontColor}
              onChange={(e) => { setFontColor(e.target.value); editor.chain().focus().setColor(e.target.value).run(); }}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
          </label>
        </Tooltip>

        {/* 형광펜 */}
        <Tooltip title="형광펜">
          <label style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 3px', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fd-text-secondary)' }}>H</span>
            <div style={{ position: 'absolute', bottom: -1, left: 2, right: 2, height: 3, background: bgColor, borderRadius: 1 }} />
            <input type="color" value={bgColor}
              onChange={(e) => { setBgColor(e.target.value); editor.chain().focus().toggleHighlight({ color: e.target.value }).run(); }}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
          </label>
        </Tooltip>
        <Separator />

        {/* 링크 */}
        <LinkButton editor={editor} />

        {/* 표 삽입 */}
        <Popover open={tableOpen} onOpenChange={setTableOpen} trigger="click" placement="bottomLeft" arrow={false}
          content={<TableInsertPopover editor={editor} onClose={() => setTableOpen(false)} />}>
          <Tooltip title="표 삽입">
            <button type="button" style={btn(editor.isActive('table'))} onClick={() => setTableOpen(v => !v)}><TableOutlined /></button>
          </Tooltip>
        </Popover>

        {/* 이미지 삽입 */}
        <Tooltip title="이미지 삽입">
          <label style={{ ...btn(), cursor: 'pointer' }}>
            <PictureOutlined />
            <input ref={imgInputRef} type="file" accept="image/*" onChange={insertImage}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
          </label>
        </Tooltip>

        {/* 표 조작 버튼 (표 안에 커서가 있을 때만) */}
        {editor.isActive('table') && (
          <>
            <Separator />
            <Tooltip title="열 왼쪽에 추가"><button type="button" style={btn()} onClick={() => editor.chain().focus().addColumnBefore().run()}>←열</button></Tooltip>
            <Tooltip title="열 오른쪽에 추가"><button type="button" style={btn()} onClick={() => editor.chain().focus().addColumnAfter().run()}>열→</button></Tooltip>
            <Tooltip title="열 삭제"><button type="button" style={{ ...btn(), color: '#ef4444' }} onClick={() => editor.chain().focus().deleteColumn().run()}>열×</button></Tooltip>
            <Tooltip title="행 위에 추가"><button type="button" style={btn()} onClick={() => editor.chain().focus().addRowBefore().run()}>↑행</button></Tooltip>
            <Tooltip title="행 아래에 추가"><button type="button" style={btn()} onClick={() => editor.chain().focus().addRowAfter().run()}>행↓</button></Tooltip>
            <Tooltip title="행 삭제"><button type="button" style={{ ...btn(), color: '#ef4444' }} onClick={() => editor.chain().focus().deleteRow().run()}>행×</button></Tooltip>
            <Tooltip title="표 삭제"><button type="button" style={{ ...btn(), color: '#ef4444' }} onClick={() => editor.chain().focus().deleteTable().run()}>표×</button></Tooltip>
          </>
        )}
      </div>

      {/* 편집 영역 */}
      <EditorContent
        editor={editor}
        className="rich-editor-tiptap"
        style={{ minHeight, background: 'var(--fd-surface)' }}
      />

      {/* 오타 검출 요약 (표시 전용) */}
      {spell && spellMatches.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderTop: '1px solid var(--fd-border)',
          background: 'var(--fd-surface-sunken)', fontSize: 13,
        }}>
          <span style={{ color: '#e0483d', fontWeight: 600 }}>오타 의심 {spellMatches.length}건</span>
          {spellMatches.slice(0, 8).map((m, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: m.dict ? '#fbf0dd' : '#fbe9e6', color: m.dict ? '#b0741c' : '#c73a2f',
              borderRadius: 6, padding: '1px 8px',
            }}>
              {m.suggestion ? <>{m.wrong} → <b>{m.suggestion}</b></> : m.wrong}
              <span title="이 표기 무시" onClick={() => { addIgnore(m.wrong); if (editor) setSpellMatches(applySpellHighlight(editor.view.dom)); }}
                style={{ cursor: 'pointer', color: '#999', marginLeft: 2, fontWeight: 700 }}>×</span>
            </span>
          ))}
          {spellMatches.length > 8 && <span style={{ color: '#999' }}>외 {spellMatches.length - 8}건</span>}
        </div>
      )}

      <style>{editorContentCss('rich-editor-tiptap', minHeight)}</style>
      <style>{`::highlight(ko-spell){ text-decoration: underline wavy #e0483d; text-decoration-skip-ink: none; }`}</style>
    </div>
  );
}
