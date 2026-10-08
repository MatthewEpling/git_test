export type AccountType = "ironman" | "hardcore" | "ultimate" | "group";

export type SkillName =
  | "Attack" | "Hitpoints" | "Mining"
  | "Strength" | "Agility" | "Smithing"
  | "Defence" | "Herblore" | "Fishing"
  | "Ranged" | "Thieving" | "Cooking"
  | "Prayer" | "Crafting" | "Firemaking"
  | "Magic" | "Fletching" | "Woodcutting"
  | "Runecraft" | "Slayer" | "Farming"
  | "Construction" | "Hunter" | "Sailing";

export type SkillEntry = {
  level: number;   // 1 when unranked and we cannot know; see `ranked`
  xp: number | null;
  rank: number | null;
  ranked: boolean; // false = hiscores returned -1 (below rank threshold)
};

export type ActivityEntry = { name: string; score: number; rank: number | null };

export type HiscoresResult = {
  rsn: string;
  requestedType: AccountType;
  /** Which hiscore table actually returned data */
  source: "ironman" | "hardcore" | "ultimate" | "main" | "wiseoldman";
  /** Set when player is on main hiscores but not the requested iron table */
  warning?: string;
  skills: Record<SkillName, SkillEntry>;
  overall: { level: number | null; xp: number | null; rank: number | null };
  activities: ActivityEntry[]; // bosses, clues, minigames with score > 0
  fetchedAt: string;
};

export type QuestStatus = "done" | "in_progress" | "not_started";

export type DiaryTier = "Easy" | "Medium" | "Hard" | "Elite";

export type WikiSyncData = {
  username: string;
  timestamp?: string;
  quests: Record<string, QuestStatus>;
  diaries: Record<string, Partial<Record<DiaryTier, { complete: boolean; done: number; total: number }>>>;
  levels: Partial<Record<SkillName, number>>;
  combatAchievements: number[];
  collectionLog: number[];
  collectionLogCount: number | null;
  questPoints: number | null;
};

export type Settings = {
  accountType: AccountType;
  membership: "p2p" | "f2p";
  playstyle: "efficient" | "balanced" | "chill";
  hoursPerDay: number;
  goal:
    | "quest_cape"
    | "hard_diaries"
    | "raids_ready"
    | "specific"
    | "max_cape"
    | "99_sailing"
    | "whats_next";
  goalDetail?: string;
};

export type StepCategory =
  | "quest" | "diary" | "sailing" | "combat" | "runs" | "resources" | "gear" | "skill";

export type Step = {
  id: string;
  chapter: 1 | 2 | 3 | 4;
  title: string;
  category: StepCategory;
  requirements: {
    skills?: Partial<Record<SkillName, number>>;
    quests?: string[];
    diaries?: string[]; // "Ardougne Easy"
    items?: string[];
  };
  bring?: string[];
  instructions: string;
  whyNow: string;
  unlocks?: string[];
  estMinutes?: number;
  wikiUrl?: string;
  branch?: {
    prompt?: string;
    options: { label: string; style: "efficient" | "chill" | "goal"; stepIds: string[] }[];
  };
  skipNote?: string;
  /** Auto-complete rule checked against synced/hiscore data */
  completesWhen?: {
    quests?: string[];
    questsStarted?: string[];
    diaries?: string[];
    skills?: Partial<Record<SkillName, number>>;
  };
  /** Sailing steps: what this saves elsewhere */
  saves?: string;
  /** Per-account-type notes */
  notes?: { hardcore?: string; ultimate?: string; group?: string };
  /** Steps that only appear when a branch option chose them */
  branchOnly?: boolean;
  /** Playable on a free-to-play account (everything else is members) */
  f2p?: boolean;
};

export type StepStatus = "done" | "ready" | "blocked";

export type EvaluatedStep = Step & {
  status: StepStatus;
  missing: string[];
  autoDone: boolean;
  synthetic?: boolean;
};
