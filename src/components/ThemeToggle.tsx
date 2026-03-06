"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    setMounted(true);
    const el = document.documentElement;
    const dark = el.dataset.theme === "dark";
    setIsDark(dark);
  }, []);

  function toggle() {
    if (animating) return;
    const next = !isDark;

    // Add transitioning class so all elements smoothly cross-fade
    document.documentElement.classList.add("theme-transitioning");
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Safari Private Mode — silently ignore
    }
    setIsDark(next);

    // Flip animation on the icon
    setAnimating(true);
    setTimeout(() => setAnimating(false), 400);

    // Remove transition class after animation completes
    setTimeout(
      () => document.documentElement.classList.remove("theme-transitioning"),
      350,
    );
  }

  // Don't render until client-side to avoid hydration mismatch
  if (!mounted) return null;

  return (
    <button
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        border: "2px solid var(--ink)",
        background: "var(--surface2)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        boxShadow: "var(--shadow-xs)",
        flexShrink: 0,
        transition: "transform 0.1s, box-shadow 0.1s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translate(-1px, -1px)";
        e.currentTarget.style.boxShadow = "3px 3px 0 var(--ink)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "var(--shadow-xs)";
      }}
    >
      <span
        style={{
          display: "inline-block",
          animation: animating ? "theme-flip 0.4s ease both" : "none",
          lineHeight: 1,
        }}
      >
        {isDark ? "☀️" : "🌙"}
      </span>
    </button>
  );
}
