import { useState, useRef, useCallback, useEffect } from 'react';

const MIN_LEFT = 400;
const MIN_RIGHT = 220;
const STORAGE_KEY = 'editorSplit';

/**
 * ResizableSplit — renders left and right panels with a draggable divider.
 *
 * Props:
 *   left({ focused, onToggleFocus }) — render prop for left panel
 *   right()                          — render prop for right panel
 */
export default function ResizableSplit({ left, right }) {
  const containerRef = useRef(null);
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : null; // null = flex auto
  });
  const [isFocused, setIsFocused] = useState(false);
  const [savedWidth, setSavedWidth] = useState(null);
  const dragging = useRef(false);

  const onMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const container = containerRef.current;
      const startLeft = container
        ? container.querySelector('.split-left').offsetWidth
        : (leftWidth ?? 600);

      const onMove = (me) => {
        if (!dragging.current) return;
        const cont = containerRef.current;
        if (!cont) return;
        const totalW = cont.offsetWidth - 4; // 4px for divider
        const newLeft = Math.min(
          totalW - MIN_RIGHT,
          Math.max(MIN_LEFT, startLeft + me.clientX - startX),
        );
        setLeftWidth(newLeft);
        localStorage.setItem(STORAGE_KEY, String(newLeft));
      };

      const onUp = () => {
        dragging.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [],
  );

  const toggleFocus = useCallback(() => {
    if (!isFocused) {
      setSavedWidth(leftWidth);
      setIsFocused(true);
    } else {
      setLeftWidth(savedWidth);
      setIsFocused(false);
    }
  }, [isFocused, leftWidth, savedWidth]);

  // F key shortcut to toggle focus (when not in a text input)
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'f' && e.key !== 'F') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      toggleFocus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleFocus]);

  return (
    <div
      className="resizable-split"
      ref={containerRef}
      style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}
    >
      <div
        className="split-left"
        style={{
          width: isFocused ? '100%' : leftWidth !== null ? leftWidth : undefined,
          flex: leftWidth !== null && !isFocused ? 'none' : 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {left({ focused: isFocused, onToggleFocus: toggleFocus })}
      </div>
      {!isFocused && (
        <>
          <div
            className="split-divider"
            onMouseDown={onMouseDown}
            style={{
              width: 4,
              cursor: 'col-resize',
              background: '#d8d6d0',
              flexShrink: 0,
              userSelect: 'none',
            }}
          />
          <div
            className="split-right"
            style={{ flex: 1, minWidth: MIN_RIGHT, overflow: 'auto' }}
          >
            {right()}
          </div>
        </>
      )}
    </div>
  );
}
