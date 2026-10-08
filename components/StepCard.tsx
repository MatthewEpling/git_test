"use client";
import type { Evaluated } from "@/lib/engine";
import type { AccountType } from "@/lib/types";

export const CATEGORY: Record<string, { icon: string; label: string }> = {
  quest: { icon: "📜", label: "Quests" },
  diary: { icon: "🗺️", label: "Diaries" },
  sailing: { icon: "⛵", label: "Sailing" },
  combat: { icon: "⚔️", label: "Combat" },
  runs: { icon: "🌱", label: "Runs" },
  resources: { icon: "💰", label: "Resources" },
  gear: { icon: "🎒", label: "Gear" },
  skill: { icon: "📈", label: "Training" },
};

const fmtMins = (m?: number) => (!m ? null : m < 60 ? `~${m} min` : `~${Math.round((m / 60) * 10) / 10} h`);

export default function StepCard({
  step,
  accountType,
  onToggle,
  onBranch,
}: {
  step: Evaluated;
  accountType: AccountType;
  onToggle: (id: string, value: boolean | null) => void;
  onBranch: (id: string, index: number) => void;
}) {
  const done = step.status === "done";
  const note = step.notes?.[accountType as "hardcore" | "ultimate" | "group"];
  const cat = CATEGORY[step.category];

  return (
    <article
      id={`step-${step.id}`}
      className={`card scroll-mt-24 transition ${done ? "opacity-60" : ""} ${step.synthetic ? "border-dashed" : ""} ${
        step.category === "sailing" && !done ? "border-sea/50" : ""
      }`}
    >
      <div className="flex gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[rgb(var(--gold))]"
          checked={done}
          onChange={(e) => onToggle(step.id, e.target.checked === step.autoDone ? null : e.target.checked)}
          aria-label={`Mark ${step.title} ${done ? "not done" : "done"}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-pixel text-sm text-muted">{step.synthetic ? "+" : step.id}</span>
            <h3 className={`font-body text-base font-semibold ${done ? "line-through" : ""}`}>
              <span className="mr-1" aria-hidden>
                {cat?.icon}
              </span>
              {step.title}
            </h3>
            {step.status === "ready" && <span className="rounded bg-good/15 px-1.5 text-xs font-semibold text-good">Ready</span>}
            {step.status === "blocked" && <span className="rounded bg-bad/15 px-1.5 text-xs font-semibold text-bad">Blocked</span>}
            {step.autoDone && <span className="rounded bg-panel2 px-1.5 text-xs text-muted">auto-detected</span>}
            {step.synthetic && <span className="rounded bg-panel2 px-1.5 text-xs text-muted">inserted training</span>}
          </div>

          {step.status === "blocked" && step.missing.length > 0 && (
            <p className="mt-1 text-sm text-bad">Needs: {step.missing.join(" · ")}</p>
          )}

          <p className="mt-2 text-sm">{step.instructions}</p>
          <p className="mt-1 text-sm italic text-muted">Why now: {step.whyNow}</p>

          {step.saves && (
            <p className="mt-2 rounded bg-sea/10 px-2 py-1 text-sm text-sea">
              <b>⛵ Saves elsewhere:</b> {step.saves}
            </p>
          )}
          {note && (
            <p className="mt-2 rounded bg-warn/10 px-2 py-1 text-sm text-warn">
              <b>{accountType === "hardcore" ? "⚠ Hardcore" : accountType === "ultimate" ? "Ultimate" : "Group"}:</b> {note}
            </p>
          )}

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {step.bring?.length ? <span>Bring: {step.bring.join(", ")}</span> : null}
            {step.requirements.items?.length ? <span>Also: {step.requirements.items.join("; ")}</span> : null}
            {step.unlocks?.length ? <span className="text-good">Unlocks: {step.unlocks.join(", ")}</span> : null}
            {fmtMins(step.estMinutes) && <span>{fmtMins(step.estMinutes)}</span>}
            {step.wikiUrl && (
              <a href={step.wikiUrl} target="_blank" rel="noreferrer" className="underline hover:text-gold">
                Wiki ↗
              </a>
            )}
          </div>
          {step.skipNote && <p className="mt-2 text-xs font-semibold text-gold">Skip or continue? {step.skipNote}</p>}

          {step.branch && (
            <div className="mt-3">
              {step.branch.prompt && <p className="label mb-2">{step.branch.prompt}</p>}
              <div className="grid gap-2 sm:grid-cols-3">
                {step.branch.options.map((o, i) => (
                  <button
                    key={o.label}
                    onClick={() => onBranch(step.id, i)}
                    className={`rounded-md border p-3 text-left text-sm transition ${
                      step.chosenBranch === i ? "border-gold bg-gold/15" : "border-line hover:border-gold/50"
                    }`}
                    aria-pressed={step.chosenBranch === i}
                  >
                    <span className="label block">Option {String.fromCharCode(65 + i)} · {o.style}</span>
                    <span className="font-semibold">{o.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
