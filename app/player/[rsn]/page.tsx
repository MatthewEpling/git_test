"use client";
import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import PlayerNav, { rsnFromParam } from "@/components/PlayerNav";
import WikiSyncPanel from "@/components/WikiSyncPanel";
import {
  ActivitiesCard,
  BottlenecksCard,
  ClogCard,
  DiaryGrid,
  QuestPanel,
  SkillsGrid,
  StageBadge,
  UnlocksCard,
} from "@/components/Snapshot";
import { usePlayer } from "@/lib/usePlayer";
import { evaluateGuide } from "@/lib/engine";
import { useBranches, useChecked } from "@/lib/storage";

function Snapshot() {
  const params = useParams<{ rsn: string }>();
  const search = useSearchParams();
  const rsn = rsnFromParam(params.rsn);
  const p = usePlayer(rsn, search.get("type"));
  const [checked] = useChecked(rsn);
  const [branches] = useBranches(rsn);

  const guide = useMemo(() => evaluateGuide(p.account, p.settings, checked, branches), [p.account, p.settings, checked, branches]);
  const blocking = useMemo(() => new Set(guide.bottlenecks.map((b) => b.skill as string)), [guide]);
  const next = guide.next[0];

  return (
    <div>
      <PlayerNav rsn={rsn} type={p.type} />

      <div className="no-print mb-4 flex flex-wrap items-center gap-3 text-sm">
        <button className="btn-ghost" onClick={() => p.refresh(true)} disabled={p.loading}>
          {p.loading ? "Refreshing…" : "↻ Refresh data"}
        </button>
        <span className="text-muted">
          {p.hiscores ? `Last updated ${new Date(p.hiscores.fetchedAt).toLocaleString()} · source: ${p.hiscores.source}` : p.loading ? "Loading hiscores…" : ""}
        </span>
        {!p.settings && p.settingsLoaded && (
          <Link href={`/player/${params.rsn}/setup`} className="text-gold underline">
            Set your goal & playstyle →
          </Link>
        )}
      </div>

      {p.error && (
        <div className="card mb-4 border-bad/60 text-sm">
          <b className="text-bad">Couldn't load hiscores:</b> {p.error}
          {p.hiscores && <span className="text-muted"> Showing your last saved data.</span>}
        </div>
      )}
      {p.hiscores?.warning && <div className="card mb-4 border-warn/60 text-sm text-warn">{p.hiscores.warning}</div>}

      {!p.hiscores && !p.error ? (
        <div className="card animate-pulse text-muted">Reading the hiscores…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 lg:col-span-2">
            <SkillsGrid account={p.account} blocking={blocking} />
            <WikiSyncPanel rsn={rsn} sync={p.sync} setSync={p.setSync} compact />
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              <QuestPanel
                account={p.account}
                onManual={(name, s) =>
                  p.setManual((m) => {
                    const quests = { ...m.quests };
                    if (s) quests[name] = s;
                    else delete quests[name];
                    return { ...m, quests };
                  })
                }
              />
              <DiaryGrid account={p.account} onManual={(key, v) => p.setManual((m) => ({ ...m, diaries: { ...m.diaries, [key]: v } }))} />
            </div>
            <ActivitiesCard account={p.account} />
          </div>
          <div className="min-w-0 space-y-4">
            <StageBadge account={p.account} />
            {next && (
              <Link href={`/player/${params.rsn}/guide`} className="card block hover:border-gold">
                <p className="label">Next up</p>
                <p className="mt-1 font-semibold">{next.title}</p>
                <p className="mt-1 text-sm text-muted">{next.whyNow}</p>
                <p className="mt-2 text-sm text-gold">
                  Open guide → {guide.progress.done}/{guide.progress.total} steps done
                </p>
              </Link>
            )}
            <BottlenecksCard items={guide.bottlenecks} />
            <UnlocksCard account={p.account} manual={p.manual} setManual={p.setManual} />
            <ClogCard account={p.account} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function SnapshotPage() {
  return (
    <Suspense>
      <Snapshot />
    </Suspense>
  );
}
