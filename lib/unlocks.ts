import type { Account, Known } from "./account";

export type Unlock = {
  id: string;
  label: string;
  /** How we decide. "manual" = player ticks it; we never guess. */
  check: (a: Account) => Known;
  how: string;
  manual?: boolean;
};

const quest = (name: string) => (a: Account): Known => {
  const s = a.quest(name);
  return s === "unknown" ? "unknown" : s === "done";
};
const started = (name: string) => (a: Account): Known => {
  const s = a.quest(name);
  return s === "unknown" ? "unknown" : s !== "not_started";
};
const manual = (id: string) => (a: Account): Known => {
  const v = a.manual.unlocks[id];
  return v === undefined ? "unknown" : v;
};

export const UNLOCKS: Unlock[] = [
  { id: "fairy_rings", label: "Fairy rings", check: started("Fairytale II - Cure a Queen"), how: "Start Fairytale II" },
  { id: "spirit_trees", label: "Spirit trees", check: quest("Tree Gnome Village"), how: "Tree Gnome Village" },
  { id: "avas", label: "Ava's device", check: quest("Animal Magnetism"), how: "Animal Magnetism" },
  {
    id: "birdhouses",
    label: "Birdhouses",
    check: (a) => {
      const q = quest("Bone Voyage")(a);
      return q === true ? a.level("Hunter") >= 5 : q;
    },
    how: "Bone Voyage + Hunter 5",
  },
  { id: "miscellania", label: "Kingdom of Miscellania", check: quest("Throne of Miscellania"), how: "Throne of Miscellania" },
  { id: "ectophial", label: "Ectophial", check: quest("Ghosts Ahoy"), how: "Ghosts Ahoy" },
  { id: "ardy_cloak", label: "Ardougne cloak", check: (a) => a.diary("Ardougne Easy"), how: "Ardougne Easy diary" },
  { id: "barrows_gloves", label: "Barrows gloves", check: quest("Recipe for Disaster"), how: "Recipe for Disaster" },
  { id: "faceguard", label: "Neitiznot faceguard", check: manual("faceguard"), how: "Fremennik Isles + Slayer 60, Basilisk Knights", manual: true },
  { id: "ds2", label: "Dragon Slayer II", check: quest("Dragon Slayer II"), how: "Quest" },
  { id: "sote", label: "Song of the Elves", check: quest("Song of the Elves"), how: "Quest" },
  { id: "dt1", label: "Desert Treasure I", check: quest("Desert Treasure I"), how: "Quest" },
  { id: "dt2", label: "Desert Treasure II", check: quest("Desert Treasure II - The Fallen Empire"), how: "Quest" },
  { id: "graceful", label: "Graceful", check: manual("graceful"), how: "Marks of grace from rooftops", manual: true },
  { id: "slayer_helm", label: "Slayer helm", check: manual("slayer_helm"), how: "Malevolent masquerade + Crafting 55", manual: true },
  { id: "bonecrusher", label: "Bonecrusher / Ash sanctifier", check: manual("bonecrusher"), how: "See wiki for unlock", manual: true },
  { id: "herb_sack", label: "Herb sack / Seed box", check: manual("herb_sack"), how: "Tithe Farm", manual: true },
  { id: "pandemonium", label: "Pandemonium (Sailing)", check: quest("Pandemonium"), how: "Quest" },
  { id: "prying_times", label: "Prying Times (crowbar)", check: quest("Prying Times"), how: "Sailing 12, Smithing 30" },
];

export const SHIP_TIERS = ["None yet", "Raft", "Skiff", "Sloop", "Larger"] as const;
