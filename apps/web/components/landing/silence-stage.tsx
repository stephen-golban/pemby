"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Runs the landing page's one orchestrated motion: the near misses fall from a loose pile into
 * their blocker groups the first time the card scrolls into view.
 *
 * Content is visible by default. The start state is only applied from here, after hydration,
 * and only when the card is still below the fold, so no-JS, reduced-motion and already-visible
 * cases never hide anything.
 */
export function SilenceStage({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.85) return;

    el.dataset.motion = "armed";
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          el.dataset.motion = "play";
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
