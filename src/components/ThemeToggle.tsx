"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const KEY = "theme";
const listeners = new Set<() => void>();
const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

/** The theme in effect: the reader's choice if they made one, otherwise the device's. */
function read(): Theme {
  const chosen = document.documentElement.getAttribute("data-theme");
  if (chosen === "light" || chosen === "dark") return chosen;
  return darkQuery().matches ? "dark" : "light";
}

function apply(theme: Theme) {
  const root = document.documentElement;
  // Choosing the theme the device already uses goes back to following the device.
  const followDevice = theme === (darkQuery().matches ? "dark" : "light");
  try {
    if (followDevice) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Storage blocked (private mode): the choice still applies to this page.
  }
  if (followDevice) root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  const query = darkQuery();
  listeners.add(notify);
  query.addEventListener("change", notify);
  return () => {
    listeners.delete(notify);
    query.removeEventListener("change", notify);
  };
}

/**
 * Runs in <head> before the first paint: applies a saved theme (only the two
 * known values are accepted) and marks that JavaScript is available, which
 * lets infographics wait until they scroll into view.
 */
export const headScript = `(function(){var d=document.documentElement;d.classList.add("js");try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")d.setAttribute("data-theme",t)}catch(e){}})()`;

/**
 * One button that switches between light and dark. Both icons are always
 * rendered and CSS shows the right one, so the icon is correct before
 * JavaScript loads and never flashes.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => null);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="theme"
      aria-label={theme ? `Switch to ${next} theme` : "Switch theme"}
      title={theme ? `Switch to ${next} theme` : "Switch theme"}
      onClick={() => apply(next)}
    >
      {/* Moon: shown in the light theme. */}
      <svg className="theme-moon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      </svg>
      {/* Sun: shown in the dark theme. */}
      <svg className="theme-sun" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
      </svg>
    </button>
  );
}
