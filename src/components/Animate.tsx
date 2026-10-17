"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Holds the CSS animations inside until they are on screen, so each
 * infographic plays once, from the beginning, when the reader reaches it.
 * Without JavaScript the animations simply run (see the `.js` rules in
 * globals.css).
 */
export function Animate({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => node.classList.toggle("in-view", entry.isIntersecting),
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`anim ${className}`}>
      {children}
    </div>
  );
}
