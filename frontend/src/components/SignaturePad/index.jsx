import { useRef, useEffect, useState } from 'react';
import { Modal, Button, Space, Typography } from 'antd';
import { ClearOutlined } from '@ant-design/icons';

/**
 * 마우스/터치로 서명·인감을 그려서 PNG 파일로 저장하는 패드.
 * props: open, title, onCancel, onSave(file:File)
 */
export default function SignaturePad({ open, title = '서명 그리기', onCancel, onSave }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const [hasDrawn, setHasDrawn] = useState(false);

  const W = 360, H = 150;

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1f2430';
    setHasDrawn(false);
  }, [open]);

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - rect.left) * (W / rect.width), y: (p.clientY - rect.top) * (H / rect.height) };
  };

  const start = (e) => { e.preventDefault(); drawing.current = true; last.current = pos(e); };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setHasDrawn(true);
  };
  const end = () => { drawing.current = false; };

  const clear = () => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    setHasDrawn(false);
  };

  const save = () => {
    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'signature.png', { type: 'image/png' });
      onSave?.(file);
    }, 'image/png');
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      width={420}
      footer={
        <Space>
          <Button icon={<ClearOutlined />} onClick={clear}>지우기</Button>
          <Button onClick={onCancel}>취소</Button>
          <Button type="primary" onClick={save} disabled={!hasDrawn}>저장</Button>
        </Space>
      }
    >
      <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
        아래 영역에 마우스나 손가락으로 그리세요.
      </Typography.Text>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ width: '100%', height: H, border: '1px dashed #d9d9d9', borderRadius: 8, background: '#fff', touchAction: 'none', cursor: 'crosshair' }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
    </Modal>
  );
}
