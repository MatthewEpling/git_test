"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("ironnav:theme", next);
    } catch {}
    setTheme(next);
  };
  return (
    <button onClick={flip} className="btn-ghost" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
      {theme === "dark" ? "☀" : "☾"}<span className="hidden sm:inline">{theme === "dark" ? " Light" : " Dark"}</span>
    </button>
  );
}
