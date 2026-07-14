import { Tooltip } from 'antd';
import {
  BoldOutlined, ItalicOutlined, UnderlineOutlined, StrikethroughOutlined,
  AlignLeftOutlined, AlignCenterOutlined, AlignRightOutlined,
  OrderedListOutlined, UnorderedListOutlined, LinkOutlined, RedoOutlined, UndoOutlined,
} from '@ant-design/icons';

// TipTap 에디터 공통 요소(RichEditor ↔ CollaborativeEditor 공유).
// 합성 원칙: 하나의 거대 툴바 대신 작은 버튼 그룹을 각 에디터가 자기 순서대로 조합한다.

// 툴바 버튼 스타일(활성/비활성)
export const btn = (active = false) => ({
  width: 26, height: 26, padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: active ? '1px solid #1677ff' : '1px solid transparent',
  borderRadius: 4,
  background: active ? '#e6f4ff' : 'transparent',
  cursor: 'pointer', fontSize: 12,
  color: active ? '#1677ff' : 'var(--fd-text-secondary)',
  flexShrink: 0,
});

// 구분선
export const SEP = { width: 1, height: 14, background: '#e0e0e0', margin: '0 3px', flexShrink: 0 };
export const Separator = () => <div style={SEP} />;

// 공통 버튼(항상 type="button" — 폼 내부에서 제출 방지)
const TBtn = ({ title, active, onClick, children }) => (
  <Tooltip title={title}>
    <button type="button" style={btn(active)} onClick={onClick}>{children}</button>
  </Tooltip>
);

export function UndoRedoButtons({ editor }) {
  return (
    <>
      <TBtn title="실행 취소 (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()}><UndoOutlined /></TBtn>
      <TBtn title="다시 실행 (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()}><RedoOutlined /></TBtn>
    </>
  );
}

export function TextFormatButtons({ editor }) {
  return (
    <>
      <TBtn title="굵게" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><BoldOutlined /></TBtn>
      <TBtn title="기울임" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><ItalicOutlined /></TBtn>
      <TBtn title="밑줄" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineOutlined /></TBtn>
      <TBtn title="취소선" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><StrikethroughOutlined /></TBtn>
    </>
  );
}

export function AlignButtons({ editor }) {
  return (
    <>
      <TBtn title="왼쪽 정렬" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeftOutlined /></TBtn>
      <TBtn title="가운데 정렬" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenterOutlined /></TBtn>
      <TBtn title="오른쪽 정렬" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRightOutlined /></TBtn>
    </>
  );
}

export function ListButtons({ editor }) {
  return (
    <>
      <TBtn title="번호 목록" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><OrderedListOutlined /></TBtn>
      <TBtn title="글머리 목록" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><UnorderedListOutlined /></TBtn>
    </>
  );
}

export function LinkButton({ editor }) {
  const insertLink = () => {
    const prev = editor?.getAttributes('link').href || '';
    const url = window.prompt('링크 URL 입력', prev || 'https://');
    if (url === null) return;                       // 취소
    if (url === '') { editor?.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };
  return <TBtn title="링크 삽입" active={editor.isActive('link')} onClick={insertLink}><LinkOutlined /></TBtn>;
}

// 공통 편집영역 CSS(.ProseMirror). className으로 스코프.
export function editorContentCss(className, minHeight) {
  return `
    .${className} .ProseMirror { min-height: ${minHeight}px; padding: 10px 12px; outline: none; font-size: 14px; line-height: 1.7; color: var(--fd-text-primary); word-break: break-word; }
    .${className} .ProseMirror p { margin: 0 0 6px; }
    .${className} .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #adb5bd; pointer-events: none; float: left; height: 0; }
    .${className} .ProseMirror table { border-collapse: collapse; width: 100%; margin: 8px 0; }
    .${className} .ProseMirror table td, .${className} .ProseMirror table th { border: 1px solid #d1d5db; padding: 6px 10px; min-width: 60px; vertical-align: top; position: relative; }
    .${className} .ProseMirror table th { background: #f8fafc; font-weight: 600; }
    .${className} .ProseMirror table .selectedCell:after { background: rgba(22, 119, 255, 0.12); content: ""; position: absolute; inset: 0; pointer-events: none; }
    .${className} .ProseMirror img { max-width: 100%; height: auto; border-radius: 4px; cursor: pointer; }
    .${className} .ProseMirror img.ProseMirror-selectednode { outline: 2px solid #1677ff; }
    .${className} .ProseMirror a { color: #1677ff; text-decoration: underline; }
    .${className} .ProseMirror ul, .${className} .ProseMirror ol { padding-left: 20px; margin: 4px 0; }
    .${className} .ProseMirror blockquote { border-left: 3px solid #d1d5db; padding-left: 12px; color: #6b7280; margin: 8px 0; }
  `;
}
