"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Phase 1 redesign (2026-04-18):
 *   defaultTheme changed "dark" → "light" per operator direction.
 *   CSS tokens in globals.css were already correct (:root holds light
 *   values, .dark holds OLED black) — only change needed is the default.
 *
 *   Dark mode stays fully functional via the ThemeToggle component —
 *   next-themes persists the user's choice in localStorage.NEXT_THEME,
 *   so anyone who explicitly switched to dark before this flip will
 *   keep dark. Only NEW visitors (and those who haven't toggled yet)
 *   see the new light default.
 *
 *   enableSystem=false by design: operator chose (c) manual toggle only.
 *   We do NOT auto-follow OS prefers-color-scheme. Editorial decision
 *   is light-first; dark is a conscious opt-in.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      themes={["light", "dark"]}
    >
      {children}
    </NextThemesProvider>
  );
}
