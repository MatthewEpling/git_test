import type { AccountType } from "@/lib/types";

const COLORS: Record<AccountType, { fill: string; label: string }> = {
  ironman: { fill: "#9aa0a6", label: "Ironman" },
  hardcore: { fill: "#c0392b", label: "Hardcore Ironman" },
  ultimate: { fill: "#f2f2f2", label: "Ultimate Ironman" },
  group: { fill: "#4caf50", label: "Group Ironman" },
};

export const ACCOUNT_LABEL = (t: AccountType) => COLORS[t].label;

/** Simple drawn ironman helm (original artwork, not a game asset). */
export default function HelmIcon({ type, size = 20 }: { type: AccountType; size?: number }) {
  const c = COLORS[type];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={c.label}>
      <path
        d="M12 2c-4.4 0-8 3.2-8 7.6V18c0 1 .6 1.8 1.5 2.2L9 22h6l3.5-1.8c.9-.4 1.5-1.2 1.5-2.2V9.6C20 5.2 16.4 2 12 2z"
        fill={c.fill}
        stroke="#1a1a1a"
        strokeWidth="1.2"
      />
      <path d="M7 10h10v2.2H13.2V20h-2.4v-7.8H7z" fill="#1a1a1a" />
    </svg>
  );
}
