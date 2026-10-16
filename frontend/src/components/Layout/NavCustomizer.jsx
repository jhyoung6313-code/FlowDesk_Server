import React from 'react';
import { Modal, Checkbox, Button, Space, Empty } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, UndoOutlined } from '@ant-design/icons';
import { NAV_ITEMS, NAV_GROUPS, NAV_BY_KEY, DEFAULT_PINNED } from '../../utils/navRegistry';
import usePreferenceStore from '../../store/preferenceStore';

/* 레일 메뉴 편집: 체크로 고정/해제, 위·아래 버튼으로 순서 변경 */
export default function NavEditModal({ open, onClose }) {
  const pinned = usePreferenceStore((s) => s.navPinned);
  const setPinned = usePreferenceStore((s) => s.setNavPinned);

  const toggle = (key, on) => setPinned(on ? [...pinned, key] : pinned.filter((k) => k !== key));
  const move = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= pinned.length) return;
    const next = [...pinned];
    [next[idx], next[j]] = [next[j], next[idx]];
    setPinned(next);
  };

  return (
    <Modal
      title="메뉴 편집"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="reset" icon={<UndoOutlined />} onClick={() => setPinned(DEFAULT_PINNED)}>기본값으로</Button>,
        <Button key="ok" type="primary" onClick={onClose}>완료</Button>,
      ]}
      width={640}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>표시할 메뉴</div>
          {NAV_GROUPS.map((g) => (
            <div key={g.key} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>{g.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {NAV_ITEMS.filter((i) => i.group === g.key).map((i) => (
                  <Checkbox key={i.key} checked={pinned.includes(i.key)} onChange={(e) => toggle(i.key, e.target.checked)}>
                    <Space size={6}>{i.icon}{i.title}</Space>
                  </Checkbox>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>순서 (위에서 아래로)</div>
          {pinned.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="고정된 메뉴가 없습니다 (전체 메뉴에서 이동 가능)" />
          ) : (
            pinned.map((k, idx) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                <Space size={6} style={{ flex: 1 }}>{NAV_BY_KEY[k].icon}{NAV_BY_KEY[k].title}</Space>
                <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => move(idx, -1)} />
                <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={idx === pinned.length - 1} onClick={() => move(idx, 1)} />
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
