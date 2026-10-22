import { useEffect, useRef, useState } from 'react';

/** Animate `value` toward its latest target; integers tick as integers. */
export function useTickingNumber(target: number, durationMs: number): number {
  const [shown, setShown] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const from = current.current;
    if (from === target || durationMs <= 0) {
      current.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const integral = Number.isInteger(target) && Number.isInteger(from);
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      const raw = from + (target - from) * eased;
      const value = t === 1 ? target : integral ? Math.round(raw) : Math.round(raw * 10) / 10;
      current.current = value;
      setShown(value);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return shown;
}
