"use client";
import { useRef } from "react";
import { useScrollVar } from "./motion";

// One feature row on the landing page. As it scrolls into view, the product picture tilts up from the
// page and settles flat while the text rises beside it, scrubbed by scroll position (--p, 0 to 1).
// With reduced motion, everything simply sits in place.
export function ShowcaseRow({ flip, text, screen }: { flip: boolean; text: React.ReactNode; screen: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollVar(ref, "--p", 0.98, 0.5);
  return (
    <div ref={ref} className="sc-row grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={`sc-text ${flip ? "lg:order-2" : ""}`}>{text}</div>
      <div className={`sc-screen min-w-0 ${flip ? "sc-flip lg:order-1" : ""}`}>{screen}</div>
    </div>
  );
}
