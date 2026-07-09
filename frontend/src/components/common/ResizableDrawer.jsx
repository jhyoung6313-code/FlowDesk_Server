import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Drawer, theme } from 'antd';

/**
 * AntD Drawer 래퍼 - 좌우 너비 드래그 리사이즈 지원.
 * 기존 Drawer와 동일한 props를 그대로 전달받으며, `width`는 초기 너비로 사용된다.
 * placement이 'left' / 'right'(기본)일 때만 리사이즈 핸들이 노출된다.
 */
export default function ResizableDrawer({
  width = 378,
  minWidth = 280,
  maxWidth,
  placement = 'right',
  open,
  children,
  zIndex,
  styles: stylesProp,
  ...rest
}) {
  const { token } = theme.useToken();
  const [curWidth, setCurWidth] = useState(width);
  const draggingRef = useRef(false);

  // 드로어 바탕색을 회색 계열로 (라이트/다크 모드 모두 대응)
  const grayBg = token.colorBgLayout;
  const mergedStyles = {
    ...stylesProp,
    header: { background: grayBg, ...(stylesProp?.header || {}) },
    body: { background: grayBg, ...(stylesProp?.body || {}) },
    footer: { background: grayBg, ...(stylesProp?.footer || {}) },
  };

  // 외부에서 초기 width가 바뀌면 반영 (드래그 중이 아닐 때만)
  useEffect(() => {
    if (!draggingRef.current) setCurWidth(width);
  }, [width]);

  const resizable = placement === 'left' || placement === 'right';

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    draggingRef.current = true;
    const max = maxWidth ?? Math.min(window.innerWidth - 80, 1400);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMove = (ev) => {
      if (!draggingRef.current) return;
      let w = placement === 'right'
        ? window.innerWidth - ev.clientX
        : ev.clientX;
      w = Math.max(minWidth, Math.min(max, w));
      setCurWidth(w);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [placement, minWidth, maxWidth]);

  const baseZ = zIndex ?? 1000;

  return (
    <>
      <Drawer
        {...rest}
        styles={mergedStyles}
        open={open}
        placement={placement}
        width={curWidth}
        zIndex={zIndex}
      >
        {children}
      </Drawer>
      {open && resizable && (
        <div
          onMouseDown={handleMouseDown}
          title="드래그하여 너비 조절"
          style={{
            position: 'fixed',
            top: 0,
            [placement === 'right' ? 'right' : 'left']: curWidth - 3,
            width: 6,
            height: '100vh',
            cursor: 'col-resize',
            zIndex: baseZ + 5,
          }}
        />
      )}
    </>
  );
}
