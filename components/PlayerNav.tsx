"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import HelmIcon from "./HelmIcon";
import type { AccountType } from "@/lib/types";

export const rsnFromParam = (p: string) => decodeURIComponent(p).replace(/_/g, " ");

export default function PlayerNav({ rsn, type }: { rsn: string; type: AccountType }) {
  const path = usePathname();
  const base = `/player/${encodeURIComponent(rsn.replace(/ /g, "_"))}`;
  const tabs = [
    { href: base, label: "Snapshot" },
    { href: `${base}/guide`, label: "Guide" },
    { href: `${base}/setup`, label: "Setup" },
  ];
  return (
    <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="flex items-center gap-2 font-display text-2xl font-bold sm:text-3xl">
        <HelmIcon type={type} size={28} />
        {rsn}
      </h1>
      <nav className="flex gap-1 rounded-lg border border-line bg-panel p-1">
        {tabs.map((t) => {
          const on = path === t.href || decodeURIComponent(path) === decodeURIComponent(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${on ? "bg-gold/20 text-gold" : "text-muted hover:text-ink"}`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
