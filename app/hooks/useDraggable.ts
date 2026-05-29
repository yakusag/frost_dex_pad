import { useState, useEffect, useRef, useCallback } from "react";

interface Position { x: number; y: number; }

const SNAP_THRESHOLD = 60;
const EDGE_MARGIN = 8;

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function snapToEdge(x: number, y: number, w: number, h: number): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const distLeft   = x;
  const distRight  = vw - (x + w);
  const distTop    = y;
  const distBottom = vh - (y + h);

  const minH = Math.min(distLeft, distRight);
  const minV = Math.min(distTop, distBottom);

  let snappedX = x;
  let snappedY = y;

  if (minH < SNAP_THRESHOLD && minH <= minV) {
    snappedX = distLeft < distRight ? EDGE_MARGIN : vw - w - EDGE_MARGIN;
  }
  if (minV < SNAP_THRESHOLD && minV < minH) {
    snappedY = distTop < distBottom ? EDGE_MARGIN : vh - h - EDGE_MARGIN;
  }

  return { x: snappedX, y: snappedY };
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
  const [isSnapping, setIsSnapping] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number } | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);

  const savePos = useCallback((p: Position) => {
    try { localStorage.setItem(`widget-pos-${id}`, JSON.stringify(p)); } catch {}
  }, [id]);

  const startDrag = useCallback((clientX: number, clientY: number) => {
    dragStartRef.current = { mouseX: clientX, mouseY: clientY, posX: pos.x, posY: pos.y };
    setIsDragging(true);
    setIsSnapping(false);
  }, [pos]);

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragStartRef.current) return;
      if ("touches" in e) e.preventDefault();
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
      dragStartRef.current = null;

      const el = elementRef.current;
      const w = el?.offsetWidth ?? 50;
      const h = el?.offsetHeight ?? 50;

      setPos(current => {
        const snapped = snapToEdge(current.x, current.y, w, h);
        const didSnap = snapped.x !== current.x || snapped.y !== current.y;
        if (didSnap) setIsSnapping(true);
        savePos(snapped);
        return snapped;
      });
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

  useEffect(() => {
    if (!isSnapping) return;
    const t = setTimeout(() => setIsSnapping(false), 300);
    return () => clearTimeout(t);
  }, [isSnapping]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  }, [startDrag]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, [startDrag]);

  const isBottomHalf = pos.y > window.innerHeight / 2;

  return {
    pos,
    isDragging,
    isSnapping,
    elementRef,
    isBottomHalf,
    dragHandleProps: { onMouseDown: handleMouseDown, onTouchStart: handleTouchStart },
  };
}
