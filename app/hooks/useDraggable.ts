import { useState, useEffect, useRef, useCallback } from "react";

interface Position { x: number; y: number; }

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

export function useDraggable(id: string, defaultPos: Position) {
  const getInitialPos = (): Position => {
    try {
      const saved = localStorage.getItem(`widget-pos-${id}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return defaultPos;
  };

  const [pos, setPos] = useState<Position>(getInitialPos);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number } | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);

  const savePos = useCallback((p: Position) => {
    try { localStorage.setItem(`widget-pos-${id}`, JSON.stringify(p)); } catch {}
  }, [id]);

  const startDrag = useCallback((clientX: number, clientY: number) => {
    dragStartRef.current = { mouseX: clientX, mouseY: clientY, posX: pos.x, posY: pos.y };
    setIsDragging(true);
  }, [pos]);

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragStartRef.current) return;
      const client = "touches" in e ? e.touches[0] : e;
      const dx = client.clientX - dragStartRef.current.mouseX;
      const dy = client.clientY - dragStartRef.current.mouseY;
      const el = elementRef.current;
      const w = el?.offsetWidth ?? 50;
      const h = el?.offsetHeight ?? 50;
      const newX = clamp(dragStartRef.current.posX + dx, 0, window.innerWidth - w);
      const newY = clamp(dragStartRef.current.posY + dy, 0, window.innerHeight - h);
      setPos({ x: newX, y: newY });
    };

    const onEnd = () => {
      setIsDragging(false);
      setPos(p => { savePos(p); return p; });
      dragStartRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [isDragging, savePos]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  }, [startDrag]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, [startDrag]);

  const isBottomHalf = pos.y > window.innerHeight / 2;

  return {
    pos,
    isDragging,
    elementRef,
    isBottomHalf,
    dragHandleProps: { onMouseDown: handleMouseDown, onTouchStart: handleTouchStart },
  };
}
