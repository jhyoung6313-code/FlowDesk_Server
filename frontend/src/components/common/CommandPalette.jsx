import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Input, Spin, Empty, Tag } from 'antd';
import {
  SearchOutlined,
  UnorderedListOutlined,
  AppstoreOutlined,
  SnippetsOutlined,
  BookOutlined,
  ApartmentOutlined,
  MessageOutlined,
  ReadOutlined,
  FileDoneOutlined,
} from '@ant-design/icons';
import { globalSearch } from '../../api/search';

const GROUP_ICONS = {
  task: <UnorderedListOutlined />,
  card: <AppstoreOutlined />,
  memo: <SnippetsOutlined />,
  playbook: <BookOutlined />,
  wbs: <ApartmentOutlined />,
  chat: <MessageOutlined />,
  bbs: <ReadOutlined />,
  approval: <FileDoneOutlined />,
};

const GROUP_COLORS = {
  task: 'blue',
  card: 'geekblue',
  memo: 'gold',
  playbook: 'purple',
  wbs: 'cyan',
  chat: 'green',
  bbs: 'magenta',
  approval: 'orange',
};

// 종류 필터 칩 목록
const CATEGORIES = [
  { key: 'task', label: '업무' },
  { key: 'card', label: '보드' },
  { key: 'memo', label: '메모' },
  { key: 'playbook', label: '플레이북' },
  { key: 'wbs', label: '프로젝트' },
  { key: 'chat', label: '채팅' },
  { key: 'bbs', label: '게시판' },
  { key: 'approval', label: '전자결재' },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedCats, setSelectedCats] = useState([]); // [] = 전체
  const [refine, setRefine] = useState('');
  const navigate = useNavigate();
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  // 종류 필터 + 결과 내 재검색 적용
  const displayGroups = useMemo(() => {
    const rf = refine.trim().toLowerCase();
    return groups
      .filter((g) => selectedCats.length === 0 || selectedCats.includes(g.key))
      .map((g) => ({
        ...g,
        items: rf
          ? g.items.filter((it) => `${it.title} ${it.subtitle || ''}`.toLowerCase().includes(rf))
          : g.items,
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, selectedCats, refine]);

  // 평탄화된 항목 리스트 (키보드 네비게이션용)
  const flatItems = useMemo(() => {
    const out = [];
    displayGroups.forEach((g) => g.items.forEach((it) => out.push({ ...it, _group: g.key, _label: g.label })));
    return out;
  }, [displayGroups]);

  // 결과에 실제로 존재하는 종류만 칩으로 노출
  const availableCats = useMemo(() => {
    const keys = new Set(groups.map((g) => g.key));
    return CATEGORIES.filter((c) => keys.has(c.key));
  }, [groups]);

  // 전역 단축키: Ctrl+F / Cmd+F
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const openHandler = () => setOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener('flowdesk:open-search', openHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('flowdesk:open-search', openHandler);
    };
  }, []);

  // 모달 열릴 때 입력창 포커스
  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQ('');
      setGroups([]);
      setSelectedCats([]);
      setRefine('');
    }
  }, [open]);

  // 디바운스 검색
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await globalSearch(q.trim());
        setGroups(data.groups || []);
        setActiveIdx(0);
      } catch {
        setGroups([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  const go = (item) => {
    if (!item) return;
    setOpen(false);
    navigate(item.path);
  };

  const onKeyDown = (e) => {
    if (flatItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % flatItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(flatItems[activeIdx]);
    }
  };

  let runningIdx = -1;

  return (
    <Modal
      open={open}
      onCancel={() => setOpen(false)}
      footer={null}
      closable={false}
      width={620}
      styles={{ body: { padding: 0 } }}
      style={{ top: 90 }}
      destroyOnClose
    >
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--fd-border, #f0f0f0)' }}>
        <Input
          ref={inputRef}
          size="large"
          bordered={false}
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          placeholder="업무·보드·메모·플레이북·프로젝트·채팅 통합 검색…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          style={{ fontSize: 16 }}
        />
      </div>

      {/* 종류 필터 칩 + 결과 내 재검색 */}
      {groups.length > 0 && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--fd-border, #f0f0f0)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Tag.CheckableTag
            checked={selectedCats.length === 0}
            onChange={() => setSelectedCats([])}
            style={{ fontSize: 13, borderRadius: 20, padding: '2px 12px' }}
          >
            전체
          </Tag.CheckableTag>
          {availableCats.map((c) => (
            <Tag.CheckableTag
              key={c.key}
              checked={selectedCats.includes(c.key)}
              onChange={(chk) => setSelectedCats((prev) => chk ? [...prev, c.key] : prev.filter((k) => k !== c.key))}
              style={{ fontSize: 13, borderRadius: 20, padding: '2px 12px' }}
            >
              {c.label}
            </Tag.CheckableTag>
          ))}
          <Input
            size="small"
            allowClear
            prefix={<SearchOutlined style={{ color: '#bbb', fontSize: 13 }} />}
            placeholder="결과 내 재검색"
            value={refine}
            onChange={(e) => setRefine(e.target.value)}
            style={{ width: 150, marginLeft: 'auto' }}
          />
        </div>
      )}

      <div style={{ maxHeight: 460, overflowY: 'auto', padding: '8px 8px 12px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin /></div>
        ) : q.trim() && flatItems.length === 0 ? (
          <Empty description="검색 결과가 없습니다." style={{ padding: '32px 0' }} />
        ) : !q.trim() ? (
          <div style={{ padding: '28px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            <SearchOutlined style={{ fontSize: 28, display: 'block', marginBottom: 10 }} />
            키워드를 입력하세요. <Tag style={{ margin: '0 4px' }}>↑</Tag><Tag>↓</Tag> 이동 ·
            <Tag style={{ margin: '0 4px' }}>Enter</Tag> 이동 · <Tag style={{ marginLeft: 4 }}>Esc</Tag> 닫기
          </div>
        ) : (
          displayGroups.map((g) => (
            <div key={g.key} style={{ marginBottom: 6 }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase',
                padding: '8px 12px 4px', letterSpacing: 0.5,
              }}>
                {g.label}
              </div>
              {g.items.map((item) => {
                runningIdx += 1;
                const idx = runningIdx;
                const active = idx === activeIdx;
                return (
                  <div
                    key={`${g.key}-${item.id}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => go(item)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                      background: active ? 'var(--fd-hover-bg, #f1f5f9)' : 'transparent',
                    }}
                  >
                    <span style={{ color: '#64748b', fontSize: 15 }}>{GROUP_ICONS[g.icon] || <SearchOutlined />}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 500,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div style={{
                          fontSize: 13, color: '#94a3b8',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                    <Tag color={GROUP_COLORS[g.key]} style={{ fontSize: 13, margin: 0 }}>{g.label}</Tag>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
