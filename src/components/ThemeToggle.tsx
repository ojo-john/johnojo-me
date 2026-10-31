"use client";

import { useSyncExternalStore } from "react";
import { effectiveTheme, storedTheme, THEME_KEY, type Theme } from "@/lib/theme";

const DEVICE_DARK = "(prefers-color-scheme: dark)";
/** Fired after a manual switch so every toggle re-reads the mode. */
const CHANGED = "themechange";

function current(): Theme {
  return effectiveTheme(storedTheme(document.documentElement.dataset.theme ?? null), window.matchMedia(DEVICE_DARK).matches);
}

/** The browser bar colour follows the page background, including after a manual switch. */
function syncBrowserBar() {
  const bg = getComputedStyle(document.body).backgroundColor;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", bg));
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DEVICE_DARK);
  media.addEventListener("change", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** Header button that switches between light and dark mode and remembers the choice on this device. */
export function ThemeToggle() {
  // Null on the server, which can't see the visitor's setting: a same-size placeholder renders until hydration.
  const theme = useSyncExternalStore<Theme | null>(subscribe, current, () => null);

  if (!theme) return <span className="theme-btn" aria-hidden="true" />;
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="find theme-btn"
      type="button"
      data-track={`theme: ${next}`}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          // Storage blocked: the switch still applies for this page view.
        }
        syncBrowserBar();
        window.dispatchEvent(new Event(CHANGED));
      }}
    >
      <span className="ico" aria-hidden="true">
        {theme === "dark" ? "☀" : "☾"}
      </span>
    </button>
  );
}
