import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { TextAlign } from '@tiptap/extension-text-align';
import { Image } from '@tiptap/extension-image';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { Tooltip, Popover, InputNumber, Button, Space } from 'antd';
import {
  BoldOutlined, ItalicOutlined, UnderlineOutlined, StrikethroughOutlined,
  FontColorsOutlined, TableOutlined, PictureOutlined,
  AlignLeftOutlined, AlignCenterOutlined, AlignRightOutlined,
  OrderedListOutlined, UnorderedListOutlined, LinkOutlined,
  RedoOutlined, UndoOutlined,
} from '@ant-design/icons';

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
      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 600 }}>표 삽입</div>
      <Space direction="vertical" style={{ width: '100%' }} size={6}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, width: 20 }}>행</span>
          <InputNumber min={1} max={20} value={rows} onChange={v => setRows(v || 1)} size="small" style={{ flex: 1 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, width: 20 }}>열</span>
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
}) {
  const [tableOpen, setTableOpen] = useState(false);
  const [fontColor, setFontColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffff00');
  const [fontSize, setFontSize] = useState('14px');
  const [fontFamily, setFontFamily] = useState(null);
  const imgInputRef = useRef(null);

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
    },
  });

  // defaultValue가 나중에 바뀌면(reply/forward 모드) 반영
  useEffect(() => {
    if (editor && defaultValue !== undefined && editor.getHTML() !== defaultValue) {
      editor.commands.setContent(defaultValue || '', false);
    }
  }, [defaultValue]);

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

  const insertLink = () => {
    const prev = editor?.getAttributes('link').href || '';
    const url = window.prompt('링크 URL 입력', prev || 'https://');
    if (!url) return;
    if (url === '') { editor?.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const btn = (active = false) => ({
    width: 26, height: 26, padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: active ? '1px solid #1677ff' : '1px solid transparent',
    borderRadius: 4,
    background: active ? '#e6f4ff' : 'transparent',
    cursor: 'pointer', fontSize: 12,
    color: active ? '#1677ff' : 'var(--fd-text-secondary)',
    flexShrink: 0,
  });
  const sep = { width: 1, height: 14, background: '#e0e0e0', margin: '0 3px', flexShrink: 0 };

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
        <Tooltip title="실행 취소 (Ctrl+Z)">
          <button type="button" style={btn()} onClick={() => editor.chain().focus().undo().run()}><UndoOutlined /></button>
        </Tooltip>
        <Tooltip title="다시 실행 (Ctrl+Y)">
          <button type="button" style={btn()} onClick={() => editor.chain().focus().redo().run()}><RedoOutlined /></button>
        </Tooltip>
        <div style={sep} />

        {/* 서체 */}
        <select value={fontFamily ?? ''} onChange={(e) => {
          const v = e.target.value || null;
          setFontFamily(v);
          if (v) editor.chain().focus().setFontFamily(v).run();
          else editor.chain().focus().unsetFontFamily().run();
        }} style={{ height: 24, fontSize: 11, border: '1px solid var(--fd-border)', borderRadius: 4, padding: '0 2px', background: 'var(--fd-surface)', width: 82 }}>
          {FONT_FAMILIES.map(f => <option key={f.value ?? '_'} value={f.value ?? ''}>{f.label}</option>)}
        </select>

        {/* 크기 */}
        <select value={fontSize} onChange={(e) => {
          setFontSize(e.target.value);
          editor.chain().focus().setFontSize(e.target.value).run();
        }} style={{ height: 24, fontSize: 11, border: '1px solid var(--fd-border)', borderRadius: 4, padding: '0 2px', background: 'var(--fd-surface)', width: 56 }}>
          {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={sep} />

        {/* 기본 서식 */}
        <Tooltip title="굵게"><button type="button" style={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()}><BoldOutlined /></button></Tooltip>
        <Tooltip title="기울임"><button type="button" style={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()}><ItalicOutlined /></button></Tooltip>
        <Tooltip title="밑줄"><button type="button" style={btn(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineOutlined /></button></Tooltip>
        <Tooltip title="취소선"><button type="button" style={btn(editor.isActive('strike'))} onClick={() => editor.chain().focus().toggleStrike().run()}><StrikethroughOutlined /></button></Tooltip>
        <div style={sep} />

        {/* 정렬 */}
        <Tooltip title="왼쪽 정렬"><button type="button" style={btn(editor.isActive({ textAlign: 'left' }))} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeftOutlined /></button></Tooltip>
        <Tooltip title="가운데 정렬"><button type="button" style={btn(editor.isActive({ textAlign: 'center' }))} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenterOutlined /></button></Tooltip>
        <Tooltip title="오른쪽 정렬"><button type="button" style={btn(editor.isActive({ textAlign: 'right' }))} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRightOutlined /></button></Tooltip>
        <div style={sep} />

        {/* 목록 */}
        <Tooltip title="번호 목록"><button type="button" style={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()}><OrderedListOutlined /></button></Tooltip>
        <Tooltip title="글머리 목록"><button type="button" style={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()}><UnorderedListOutlined /></button></Tooltip>
        <div style={sep} />

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
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fd-text-secondary)' }}>H</span>
            <div style={{ position: 'absolute', bottom: -1, left: 2, right: 2, height: 3, background: bgColor, borderRadius: 1 }} />
            <input type="color" value={bgColor}
              onChange={(e) => { setBgColor(e.target.value); editor.chain().focus().toggleHighlight({ color: e.target.value }).run(); }}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
          </label>
        </Tooltip>
        <div style={sep} />

        {/* 링크 */}
        <Tooltip title="링크 삽입">
          <button type="button" style={btn(editor.isActive('link'))} onClick={insertLink}><LinkOutlined /></button>
        </Tooltip>

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
            <div style={sep} />
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

      <style>{`
        .rich-editor-tiptap .ProseMirror {
          min-height: ${minHeight}px;
          padding: 10px 12px;
          outline: none;
          font-size: 14px;
          line-height: 1.7;
          color: var(--fd-text-primary);
          word-break: break-word;
        }
        .rich-editor-tiptap .ProseMirror p { margin: 0 0 6px; }
        .rich-editor-tiptap .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: #adb5bd;
          pointer-events: none;
          float: left;
          height: 0;
        }
        .rich-editor-tiptap .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
          margin: 8px 0;
        }
        .rich-editor-tiptap .ProseMirror table td,
        .rich-editor-tiptap .ProseMirror table th {
          border: 1px solid #d1d5db;
          padding: 6px 10px;
          min-width: 60px;
          vertical-align: top;
          position: relative;
        }
        .rich-editor-tiptap .ProseMirror table th {
          background: #f8fafc;
          font-weight: 600;
        }
        .rich-editor-tiptap .ProseMirror table .selectedCell:after {
          background: rgba(22, 119, 255, 0.12);
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .rich-editor-tiptap .ProseMirror img {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
          cursor: pointer;
        }
        .rich-editor-tiptap .ProseMirror img.ProseMirror-selectednode {
          outline: 2px solid #1677ff;
        }
        .rich-editor-tiptap .ProseMirror a { color: #1677ff; text-decoration: underline; }
        .rich-editor-tiptap .ProseMirror ul, .rich-editor-tiptap .ProseMirror ol { padding-left: 20px; margin: 4px 0; }
        .rich-editor-tiptap .ProseMirror blockquote {
          border-left: 3px solid #d1d5db;
          padding-left: 12px;
          color: #6b7280;
          margin: 8px 0;
        }
      `}</style>
    </div>
  );
}
