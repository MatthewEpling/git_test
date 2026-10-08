"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import PlayerNav, { rsnFromParam } from "@/components/PlayerNav";
import HelmIcon, { ACCOUNT_LABEL } from "@/components/HelmIcon";
import { DEFAULT_SETTINGS, useSettings } from "@/lib/storage";
import type { AccountType, Settings } from "@/lib/types";

const GOALS: { v: Settings["goal"]; label: string }[] = [
  { v: "whats_next", label: "Just tell me what's next" },
  { v: "quest_cape", label: "Quest cape" },
  { v: "hard_diaries", label: "All hard diaries" },
  { v: "raids_ready", label: "Raids-ready" },
  { v: "specific", label: "Specific item / boss" },
  { v: "max_cape", label: "Max cape" },
  { v: "99_sailing", label: "99 Sailing" },
];

function Choice<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button type="button" key={o.v} onClick={() => onChange(o.v)} className={`chip ${value === o.v ? "chip-on" : ""}`} aria-pressed={value === o.v}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Setup() {
  const params = useParams<{ rsn: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const rsn = rsnFromParam(params.rsn);
  const [stored, setStored, loaded] = useSettings(rsn);
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!loaded) return;
    const urlType = search.get("type") as AccountType | null;
    setS({ ...DEFAULT_SETTINGS, ...(stored ?? {}), ...(urlType ? { accountType: urlType } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const upd = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));

  return (
    <div>
      <PlayerNav rsn={rsn} type={s.accountType} />
      <form
        className="card mx-auto max-w-2xl space-y-6 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setStored(s);
          router.push(`/player/${params.rsn}`);
        }}
      >
        <div>
          <h2 className="text-xl font-bold">Set your course</h2>
          <p className="text-sm text-muted">Saved on this device only.</p>
        </div>

        <div>
          <p className="label mb-2">Account type</p>
          <div className="flex flex-wrap gap-2">
            {(["ironman", "hardcore", "ultimate", "group"] as AccountType[]).map((t) => (
              <button type="button" key={t} onClick={() => upd("accountType", t)} className={`chip flex items-center gap-1.5 ${s.accountType === t ? "chip-on" : ""}`}>
                <HelmIcon type={t} size={14} /> {ACCOUNT_LABEL(t)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="label mb-2">Membership</p>
          <Choice value={s.membership} onChange={(v) => upd("membership", v)} options={[{ v: "p2p", label: "Members (P2P)" }, { v: "f2p", label: "Free-to-play" }]} />
          {s.membership === "f2p" && <p className="mt-2 text-sm text-warn">The guide is built for members. On F2P it only shows the few free-to-play steps.</p>}
        </div>

        <div>
          <p className="label mb-2">Playstyle</p>
          <Choice
            value={s.playstyle}
            onChange={(v) => upd("playstyle", v)}
            options={[{ v: "efficient", label: "Max efficiency" }, { v: "balanced", label: "Balanced" }, { v: "chill", label: "Chill / AFK" }]}
          />
          <p className="mt-2 text-xs text-muted">Sets the default option at each branch point. You can still pick any option.</p>
        </div>

        <label className="block">
          <span className="label">Hours per day: {s.hoursPerDay}</span>
          <input type="range" min={0.5} max={12} step={0.5} value={s.hoursPerDay} onChange={(e) => upd("hoursPerDay", Number(e.target.value))} className="mt-2 w-full accent-[rgb(var(--gold))]" />
        </label>

        <div>
          <p className="label mb-2">Main goal</p>
          <Choice value={s.goal} onChange={(v) => upd("goal", v)} options={GOALS} />
          {s.goal === "specific" && (
            <input className="input mt-2" placeholder="Which item or boss? e.g. Bow of faerdhinen" value={s.goalDetail ?? ""} onChange={(e) => upd("goalDetail", e.target.value)} />
          )}
        </div>

        <button className="btn w-full" type="submit">Save and view my account</button>
      </form>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense>
      <Setup />
    </Suspense>
  );
}
