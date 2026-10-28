"use client";
import { useEffect, useRef } from "react";

// Product screens lean a few degrees toward the mouse, with a soft light that follows it. Only with a
// mouse or trackpad (never on touch, where it would fight scrolling), and never with reduced motion.
export function TiltCard({ children, max = 5 }: { children: React.ReactNode; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ok = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    if (!ok.matches) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      frame = 0;
      if (!last) return;
      const r = el.getBoundingClientRect();
      const x = (last.clientX - r.left) / r.width; // 0..1
      const y = (last.clientY - r.top) / r.height;
      el.style.setProperty("--ry", `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    };
    const move = (e: PointerEvent) => {
      last = e;
      el.dataset.tilt = "on";
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const leave = () => {
      last = null;
      delete el.dataset.tilt;
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [max]);

  return (
    <div ref={ref} className="tilt-card">
      <div className="tilt-inner">
        {children}
        <span className="tilt-sheen" aria-hidden />
      </div>
    </div>
  );
}
