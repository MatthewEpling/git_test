"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import HelmIcon, { ACCOUNT_LABEL } from "@/components/HelmIcon";
import { readRecent, rememberRecent } from "@/lib/storage";
import { skillIcon } from "@/lib/skills";
import type { AccountType } from "@/lib/types";

const TYPES: AccountType[] = ["ironman", "hardcore", "ultimate", "group"];
const slug = (rsn: string) => encodeURIComponent(rsn.trim().replace(/\s+/g, "_"));

export default function Home() {
  const router = useRouter();
  const [rsn, setRsn] = useState("");
  const [type, setType] = useState<AccountType>("ironman");
  const [recent, setRecent] = useState<{ rsn: string; type: string }[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => setRecent(readRecent()), []);

  const go = (name: string, t: string) => {
    const clean = name.trim();
    if (!/^[A-Za-z0-9 _-]{1,12}$/.test(clean)) {
      setErr("RuneScape names are 1–12 letters, numbers, spaces, - or _.");
      return;
    }
    rememberRecent(clean, t);
    let hasSettings = false;
    try {
      hasSettings = Boolean(localStorage.getItem(`ironnav:settings:${clean.toLowerCase().replace(/[\s_-]+/g, " ")}`));
    } catch {}
    router.push(`/player/${slug(clean)}${hasSettings ? "" : "/setup"}?type=${t}`);
  };

  return (
    <div className="mx-auto max-w-2xl py-8 sm:py-16">
      <div className="text-center">
        <div className="mb-4 flex justify-center gap-1.5 opacity-90">
          {["Sailing", "Farming", "Slayer", "Herblore", "Hunter"].map((s) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={s} src={skillIcon(s)} alt="" width={25} height={25} className="h-6 w-6 object-contain" />
          ))}
        </div>
        <h1 className="font-display text-4xl font-bold text-gold sm:text-5xl">Iron Navigator</h1>
        <p className="mt-3 text-lg text-muted">
          A personalised, checkable progression guide for your Ironman — Sailing included.
        </p>
      </div>

      <form
        className="card mt-8 space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          go(rsn, type);
        }}
      >
        <label className="block">
          <span className="label">Enter your Ironman name</span>
          <input
            className="input mt-1 text-lg"
            value={rsn}
            onChange={(e) => {
              setRsn(e.target.value);
              setErr("");
            }}
            maxLength={12}
            placeholder="e.g. Iron Gloves"
            autoFocus
            autoComplete="off"
          />
        </label>
        <fieldset>
          <legend className="label mb-2">Account type</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TYPES.map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setType(t)}
                className={`flex items-center justify-center gap-2 rounded-md border px-2 py-2 text-sm ${
                  type === t ? "border-gold bg-gold/15 text-gold" : "border-line text-muted hover:border-gold/50"
                }`}
                aria-pressed={type === t}
              >
                <HelmIcon type={t} size={18} />
                {ACCOUNT_LABEL(t).replace(" Ironman", "")}
              </button>
            ))}
          </div>
        </fieldset>
        {err && <p className="text-sm text-bad">{err}</p>}
        <button className="btn w-full text-lg" type="submit">
          Chart my course
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        We read your hiscores automatically. For quests, diaries and collection log, sync with the{" "}
        <Link href="/sync" className="text-gold underline">
          WikiSync RuneLite plugin
        </Link>
        .
      </p>

      {recent.length > 0 && (
        <div className="mt-8">
          <p className="label mb-2 text-center">Recent</p>
          <div className="flex flex-wrap justify-center gap-2">
            {recent.map((r) => (
              <button key={r.rsn} className="chip flex items-center gap-1.5" onClick={() => go(r.rsn, r.type)}>
                <HelmIcon type={r.type as AccountType} size={14} />
                {r.rsn}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
