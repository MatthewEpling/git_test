import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";
import version from "@/data/version.json";
import { WIKI_DATA_DATE } from "@/lib/gamedata";

export const metadata: Metadata = {
  title: "Iron Navigator — OSRS Ironman progression guide",
  description: "Enter your Ironman name and get a personalised, checkable progression guide — Sailing included.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const themeScript = `try{var t=localStorage.getItem('ironnav:theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@400;500;600;700&family=Pixelify+Sans:wght@500&display=swap"
        />
      </head>
      <body className="flex min-h-screen flex-col">
        <header className="no-print sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="whitespace-nowrap font-display text-lg font-bold text-gold sm:text-xl">Iron Navigator</span>
            </Link>
            <nav className="flex items-center gap-2 text-sm">
              <Link href="/sync" className="btn-ghost whitespace-nowrap">Sync help</Link>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="no-print border-t border-line px-4 py-6 text-center text-xs text-muted">
          <p>
            Game data and images from the{" "}
            <a className="underline hover:text-gold" href="https://oldschool.runescape.wiki" target="_blank" rel="noreferrer">
              Old School RuneScape Wiki
            </a>{" "}
            under{" "}
            <a className="underline hover:text-gold" href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noreferrer">
              CC BY-NC-SA 3.0
            </a>
            . Hiscores from Jagex; fallback via Wise Old Man.
          </p>
          <p className="mt-1">
            Iron Navigator is a fan project and is not affiliated with or endorsed by Jagex. RuneScape and Old School RuneScape are trademarks of Jagex Ltd.
          </p>
          <p className="mt-1">
            Guide last checked {version.guideCheckedOn} against {version.checkedAgainst}. Quest &amp; diary data generated {WIKI_DATA_DATE}.
          </p>
        </footer>
      </body>
    </html>
  );
}
