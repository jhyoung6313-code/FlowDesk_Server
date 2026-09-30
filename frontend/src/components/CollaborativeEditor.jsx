import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { TextAlign } from '@tiptap/extension-text-align';
import { Image } from '@tiptap/extension-image';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { Collaboration } from '@tiptap/extension-collaboration';
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Tooltip, Tag, Avatar } from 'antd';
import {
  UndoRedoButtons, TextFormatButtons, AlignButtons, ListButtons, LinkButton, Separator, editorContentCss,
} from './common/editorShared';
import { getAvatarColor } from '../utils/colors';

const base = import.meta.env.DEV ? 'http://localhost:4000' : window.location.origin;
const COLLAB_WS = base.replace(/^http/, 'ws') + '/collab';

// 실시간 공동편집 에디터(F-69) — 기존 RichEditor와 분리된 opt-in 컴포넌트(회귀 격리).
// props: room(고유 방), initialHTML(빈 문서일 때 시드), user{name}, onChange(html), minHeight, style
export default function CollaborativeEditor({ room, initialHTML = '', user, onChange, minHeight = 240, style = {} }) {
  const [status, setStatus] = useState('connecting'); // connecting | connected | disconnected
  const [peers, setPeers] = useState([]);
  const seededRef = useRef(false);

  // Y.Doc + WebsocketProvider는 room당 1회 생성 — WebsocketProvider 생성자가 즉시
  // connect()를 호출하는 부수효과가 있어 useMemo로 만들면 React StrictMode(개발 모드)의
  // 이중 렌더에서 소켓이 2개 열리고 첫 번째는 참조를 잃어 정리되지 않는다(누수).
  // ref 가드로 같은 커밋 내 두 번째 렌더 패스에서는 재생성하지 않도록 한다. room이 바뀌거나
  // (StrictMode 개발 모드의 mount→cleanup→remount 시뮬레이션으로) 이전 인스턴스가 이미 destroy된
  // 경우에는 새로 만든다 — destroyed 플래그 없이 room만 비교하면, StrictMode가 첫 렌더의 인스턴스를
  // cleanup에서 destroy한 뒤 같은 room으로 재마운트할 때 이미 죽은 provider/ydoc을 그대로 재사용해
  // 연결이 영구히 끊긴 채로 남는 문제가 있었다(room이 안 바뀌었으니 가드를 통과해버림).
  const clientRef = useRef(null);
  if (!clientRef.current || clientRef.current.room !== room || clientRef.current.destroyed) {
    const ydoc = new Y.Doc();
    const token = localStorage.getItem('token');
    const provider = new WebsocketProvider(COLLAB_WS, room, ydoc, { params: token ? { token } : {} });
    clientRef.current = { room, ydoc, provider, destroyed: false };
  }
  const { ydoc, provider } = clientRef.current;

  const myName = user?.name || '사용자';
  // 프로필에서 커스텀 아바타 색을 지정한 사용자는 그 색을 커서/아바타에도 그대로 반영한다
  // (예전에는 이름 해시로 별도 팔레트를 재구현해 메일/채팅/보드와 색이 어긋났었음).
  const myColor = getAvatarColor(user?.id, user?.avatarColor);

  const editor = useEditor({
    extensions: [
      // 협업은 자체 UndoManager를 쓰므로 StarterKit 히스토리 비활성화
      StarterKit.configure({
        undoRedo: false,
        link: { openOnClick: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } },
      }),
      TextStyle, FontSize, Color, FontFamily,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: true }), TableRow, TableHeader, TableCell,
      Collaboration.configure({ document: ydoc }),
      CollaborationCaret.configure({ provider, user: { name: myName, color: myColor } }),
    ],
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  }, [ydoc, provider]);

  // 연결 상태 + 접속자(awareness)
  useEffect(() => {
    const onStatus = ({ status }) => setStatus(status === 'connected' ? 'connected' : 'disconnected');
    provider.on('status', onStatus);

    // 최초 동기화 시 문서가 비어있으면 DB 본문으로 시드(중복 방지 가드)
    const onSync = (isSynced) => {
      if (isSynced && !seededRef.current && editor) {
        const frag = ydoc.getXmlFragment('default');
        if (frag.length === 0 && initialHTML && initialHTML.replace(/<[^>]*>/g, '').trim()) {
          editor.commands.setContent(initialHTML, false);
        }
        seededRef.current = true;
      }
    };
    provider.on('sync', onSync);

    const awareness = provider.awareness;
    const onAware = () => {
      const list = [];
      awareness.getStates().forEach((s, cid) => {
        if (s.user && cid !== awareness.clientID) list.push({ id: cid, ...s.user });
      });
      setPeers(list);
    };
    awareness.on('change', onAware);

    return () => {
      provider.off('status', onStatus);
      provider.off('sync', onSync);
      awareness.off('change', onAware);
      provider.destroy();
      ydoc.destroy();
      // 이 정리가 다시 쓰이고 있는 그 인스턴스를 대상으로 한 것일 때만 표시(room 변경으로 이미
      // 새 인스턴스가 만들어진 뒤라면 clientRef.current는 이 provider를 가리키고 있지 않다).
      if (clientRef.current && clientRef.current.provider === provider) clientRef.current.destroyed = true;
    };
  }, [provider, ydoc, editor, initialHTML]);

  if (!editor) return null;

  const statusTag = status === 'connected'
    ? <Tag color="green">● 실시간 연결됨</Tag>
    : status === 'connecting'
      ? <Tag color="gold">연결 중…</Tag>
      : <Tag color="red">연결 끊김</Tag>;

  return (
    <div style={{ border: '1px solid var(--fd-border)', borderRadius: 6, overflow: 'hidden', ...style }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2, padding: '4px 8px',
        borderBottom: '1px solid var(--fd-border)', background: 'var(--fd-surface-sunken)', flexWrap: 'wrap', rowGap: 4,
      }}>
        <UndoRedoButtons editor={editor} /><Separator />
        <TextFormatButtons editor={editor} /><Separator />
        <AlignButtons editor={editor} /><Separator />
        <ListButtons editor={editor} />
        <LinkButton editor={editor} />

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar.Group max={{ count: 5 }} size="small">
            <Tooltip title={`${myName} (나)`}><Avatar size="small" style={{ background: myColor }}>{myName[0]}</Avatar></Tooltip>
            {peers.map((p) => <Tooltip key={p.id} title={p.name}><Avatar size="small" style={{ background: p.color }}>{(p.name || '?')[0]}</Avatar></Tooltip>)}
          </Avatar.Group>
          {statusTag}
        </div>
      </div>

      <EditorContent editor={editor} className="rich-editor-tiptap collab-editor" style={{ minHeight, background: 'var(--fd-surface)' }} />

      <style>{editorContentCss('collab-editor', minHeight) + `
        /* 협업 커서 라벨(협업 전용) */
        .collab-editor .collaboration-caret__caret { border-left: 1px solid; border-right: 1px solid; margin-left: -1px; margin-right: -1px; position: relative; word-break: normal; pointer-events: none; }
        .collab-editor .collaboration-caret__label { border-radius: 3px 3px 3px 0; color: #fff; font-size: 11px; font-weight: 600; left: -1px; line-height: normal; padding: 1px 4px; position: absolute; top: -1.4em; user-select: none; white-space: nowrap; }
      `}</style>
    </div>
  );
}
