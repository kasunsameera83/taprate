"use client";
import { useEffect, useState, type RefObject } from "react";

// Small motion helpers for the landing page. Everything here backs off completely when the visitor has
// asked their device for reduced motion, and scroll work is batched into one update per frame.

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/**
 * Writes how far an element has travelled through the screen (0 = just below the screen, 1 = reached
 * `end` of the screen height) into a CSS variable on that element, without re-rendering React.
 */
export function useScrollVar(ref: RefObject<HTMLElement | null>, name = "--p", start = 0.95, end = 0.35) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.style.setProperty(name, "1");
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight || 1;
      const top = el.getBoundingClientRect().top;
      const p = Math.min(1, Math.max(0, (vh * start - top) / (vh * (start - end))));
      el.style.setProperty(name, p.toFixed(3));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref, name, start, end]);
}
