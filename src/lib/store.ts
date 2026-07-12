import { useEffect, useState, useCallback } from "react";

const KEY = "sl_game_state_v1";

export type Quest = {
  id: string;
  text: string;
  reward: number;
  done: boolean;
  type: "daily" | "weekly" | "main";
};

export type ActivityLog = {
  id: string;
  ts: number;
  message: string;
};

export type ChapterProgress = {
  page: number;
  total: number;
  finished: boolean;
  lastReadAt: number;
};

export type GameState = {
  playerName: string;
  level: number;
  exp: number;
  gold: number;
  hp: number;
  mp: number;
  fatigue: number;
  streak: number;
  lastActive: number; // day timestamp
  stats: { str: number; agi: number; vit: number; int: number; per: number };
  statPoints: number; // manual points available
  equippedTitle: string; // active title
  equippedGear: { weapon: string | null; armor: string | null; accessory: string | null }; // active gear items
  dailyChestClaimed: boolean; // daily loop claim check
  chaptersRead: number;
  totalPagesRead: number;
  totalReadingMs: number;
  shadows: string[]; // unlocked shadow soldiers
  inventory: string[]; // purchased items
  achievements: string[];
  quests: Quest[];
  questsRefreshedAt: number;
  activity: ActivityLog[];
  progress: Record<string, ChapterProgress>;
  lastReadChapter: string | null; // ID of last chapter read
  onboarded: boolean;
};

export type ShopItem = {
  name: string;
  desc: string;
  cost: number;
  type: "consumable" | "weapon" | "armor" | "accessory";
  bonuses?: { str?: number; agi?: number; vit?: number; int?: number; per?: number };
};

export const SHOP_ITEMS: ShopItem[] = [
  // Consumables
  { name: "High-Grade Potion", desc: "A premium potion that restores 30 HP and -10 Fatigue.", cost: 50, type: "consumable" },
  { name: "Mana Crystal", desc: "A glowing crystal that restores 40 MP.", cost: 80, type: "consumable" },
  { name: "Elixir of Focus", desc: "A highly concentrated potion. +50 HP, +50 MP, -30 Fatigue.", cost: 100, type: "consumable" },
  { name: "Rune of Reading", desc: "A mystical rune. Shatter to absorb +300 EXP instantly.", cost: 200, type: "consumable" },
  { name: "Shadow Sigil", desc: "Carries the aura of a Monarch. Fully restores MP.", cost: 300, type: "consumable" },
  { name: "Blessed Elixir of Life", desc: "Dungeon reward. Fully heals HP and resets Fatigue to 0.", cost: 400, type: "consumable" },
  // Weapons
  { name: "Hunter's Dagger", desc: "E-Rank starter dagger. +3 STR, +3 AGI.", cost: 120, type: "weapon", bonuses: { str: 3, agi: 3 } },
  { name: "Kasaka's Venom Fang", desc: "Iconic C-Rank dagger. Grants +5 STR, +10 AGI.", cost: 300, type: "weapon", bonuses: { str: 5, agi: 10 } },
  { name: "Knight Killer", desc: "B-Rank dagger designed for armor penetration. +15 STR, +5 AGI.", cost: 500, type: "weapon", bonuses: { str: 15, agi: 5 } },
  { name: "Baruka's Dagger", desc: "A-Rank ice dagger. Grants +25 AGI, +15 PER.", cost: 800, type: "weapon", bonuses: { agi: 25, per: 15 } },
  { name: "Demon King's Shortsword", desc: "S-Rank dual shortswords. +40 STR, +30 AGI, +20 PER.", cost: 1200, type: "weapon", bonuses: { str: 40, agi: 30, per: 20 } },
  { name: "Blade of the Monarch", desc: "The Monarch's own blade. +60 STR, +40 AGI, +30 INT.", cost: 2000, type: "weapon", bonuses: { str: 60, agi: 40, int: 30 } },
  // Armor
  { name: "Awakened Hunter's Vest", desc: "Woven from D-Rank hide. +8 VIT, +4 AGI.", cost: 220, type: "armor", bonuses: { vit: 8, agi: 4 } },
  { name: "Monarch's Cloak", desc: "A shadowy cloak fit for a ruler. +15 VIT, +20 INT.", cost: 400, type: "armor", bonuses: { vit: 15, int: 20 } },
  { name: "Red Knight's Armor", desc: "Heavy plate armor worn by blood-red commanders. +30 VIT.", cost: 600, type: "armor", bonuses: { vit: 30 } },
  { name: "Shadow Sovereign Plate", desc: "Plate forged in the Monarch's domain. +45 VIT, +25 STR.", cost: 1000, type: "armor", bonuses: { vit: 45, str: 25 } },
  // Accessories
  { name: "Ring of Insight", desc: "Sharpens focus. +10 PER, +10 INT.", cost: 350, type: "accessory", bonuses: { per: 10, int: 10 } },
  { name: "Amulet of the Ant King", desc: "Beru's blessing. +25 AGI, +15 PER.", cost: 700, type: "accessory", bonuses: { agi: 25, per: 15 } },
  { name: "Shadow Monarch's Crown", desc: "Legendary crown. +50 to all stats.", cost: 1500, type: "accessory", bonuses: { str: 50, agi: 50, vit: 50, int: 50, per: 50 } },
];

export function getStatsWithGear(state: GameState) {
  const stats = { ...state.stats };
  const gear = state.equippedGear;
  if (!gear) return stats;
  const gearList = [gear.weapon, gear.armor, gear.accessory];
  for (const gearName of gearList) {
    if (!gearName) continue;
    const item = SHOP_ITEMS.find(i => i.name === gearName);
    if (item?.bonuses) {
      for (const [stat, val] of Object.entries(item.bonuses)) {
        if (val) {
          stats[stat as keyof typeof stats] += val;
        }
      }
    }
  }
  return stats;
}

// Shadow soldiers unlock when the reader completes the manhwa chapter where
// Sung Jin-Woo canonically arises them (approximate canon numbers). The order
// matters and drives the reveal sequence in Shadow Army.
export const SHADOW_UNLOCKS: { name: string; chapter: number; arc: string }[] = [
  { name: "Igris",   chapter: 46,  arc: "Cartenon Demon Castle" },
  { name: "Iron",    chapter: 48,  arc: "D-Rank Dungeon Break" },
  { name: "Tank",    chapter: 55,  arc: "Alpha Ice Bear Raid" },
  { name: "Kaisel",  chapter: 82,  arc: "Kamish Raid — Sky Dragon" },
  { name: "Beru",    chapter: 110, arc: "Jeju Island — Ant King" },
  { name: "Greed",   chapter: 128, arc: "US Hunters Confrontation" },
  { name: "Fangs",   chapter: 128, arc: "US Hunters Confrontation" },
  { name: "Tusk",    chapter: 137, arc: "High Orc Shaman" },
  { name: "Bellion", chapter: 158, arc: "Monarch's Domain" },
  { name: "Kamish",  chapter: 178, arc: "Final Battle Summon" },
];

const SHADOWS_POOL = SHADOW_UNLOCKS.map(s => s.name);

export function expForNextLevel(level: number) {
  return Math.floor(100 * Math.pow(1.25, level - 1));
}

const DAILY_QUESTS_POOL: Omit<Quest, "done">[] = [
  { id: "d1", text: "Daily Warmup: Read 5 pages", reward: 20, type: "daily" },
  { id: "d2", text: "Hunter's Routine: Read 15 pages", reward: 40, type: "daily" },
  { id: "d3", text: "Dungeon Exploration: Finish 1 chapter", reward: 60, type: "daily" },
  { id: "d4", text: "Deep Raid: Finish 2 chapters", reward: 100, type: "daily" },
  { id: "d5", text: "Shadow Extraction: Bookmark a page", reward: 35, type: "daily" },
  { id: "d6", text: "Critical Study: Read a page in night mode", reward: 25, type: "daily" },
  { id: "d7", text: "Speed Sweep: Scroll 10 pages total", reward: 30, type: "daily" },
  { id: "d8", text: "Endurance Raid: Read for 5 continuous minutes", reward: 50, type: "daily" },
  { id: "d9", text: "Gate Clearance: Complete a chapter without bookmarking", reward: 45, type: "daily" },
];

const WEEKLY_QUESTS_POOL: Omit<Quest, "done">[] = [
  { id: "w1", text: "Weekly Raid: Complete 5 chapters", reward: 200, type: "weekly" },
  { id: "w2", text: "Weekly Grind: Read 100 pages total", reward: 300, type: "weekly" },
  { id: "w3", text: "Elite Gate: Complete 10 chapters", reward: 500, type: "weekly" },
  { id: "w4", text: "Mana Recovery: Complete a volume", reward: 400, type: "weekly" },
  { id: "w5", text: "Legendary Scholar: Read 200 pages total", reward: 600, type: "weekly" },
  { id: "w6", text: "Speed Raider: Finish 3 chapters", reward: 350, type: "weekly" },
];

const MAIN_QUESTS: Omit<Quest, "done">[] = [
  { id: "m1", text: "Reach Level 5 — Awakening", reward: 500, type: "main" },
  { id: "m2", text: "Reach Level 10 — E-Rank Hunter", reward: 1000, type: "main" },
  { id: "m3", text: "Reach Level 15 — B-Rank Dungeon Raider", reward: 2000, type: "main" },
  { id: "m4", text: "Reach Level 20 — A-Rank Guildmaster", reward: 3500, type: "main" },
  { id: "m5", text: "Reach Level 25 — Shadow Monarch's Ascension", reward: 5000, type: "main" },
  { id: "m6", text: "Reach Level 40 — National Level Hunter", reward: 10000, type: "main" },
];

function getRandomSubarray<T>(arr: T[], size: number): T[] {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, size);
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function initialState(): GameState {
  return {
    playerName: "Sung Jin-Woo",
    level: 1,
    exp: 0,
    gold: 0,
    hp: 100,
    mp: 100,
    fatigue: 0,
    streak: 0,
    lastActive: 0,
    stats: { str: 10, agi: 10, vit: 10, int: 10, per: 10 },
    statPoints: 5,
    equippedTitle: "E-Rank Hunter",
    equippedGear: { weapon: null, armor: null, accessory: null },
    dailyChestClaimed: false,
    chaptersRead: 0,
    totalPagesRead: 0,
    totalReadingMs: 0,
    shadows: [],
    inventory: [],
    achievements: [],
    quests: [
      ...DAILY_QUESTS_POOL.slice(0, 4).map((q) => ({ ...q, done: false })),
      ...WEEKLY_QUESTS_POOL.slice(0, 2).map((q) => ({ ...q, done: false })),
      ...MAIN_QUESTS.map((q) => ({ ...q, done: false })),
    ],
    questsRefreshedAt: 0,
    activity: [
      { id: "boot", ts: 0, message: "[SYSTEM] You have been chosen. Welcome, Player." },
    ],
    progress: {},
    lastReadChapter: null,
    onboarded: false,
  };
}

function load(): GameState {
  if (typeof window === "undefined") return initialState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState();
    return { ...initialState(), ...JSON.parse(raw) };
  } catch {
    return initialState();
  }
}

function save(state: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

type Notify = (msg: string, kind?: "info" | "levelup" | "quest" | "danger") => void;

export function useGameState(notify: Notify) {
  const [state, setState] = useState<GameState>(() => initialState());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) save(state);
  }, [state, hydrated]);

  // Daily refresh + streak
  useEffect(() => {
    if (!hydrated) return;
    const today = todayKey();
    if (state.questsRefreshedAt && new Date(state.questsRefreshedAt).toDateString() === new Date().toDateString()) return;
    setState((s) => {
      const isNewDay = !s.lastActive || new Date(s.lastActive).toDateString() !== new Date().toDateString();
      const wasYesterday = s.lastActive && (Date.now() - s.lastActive) < 1000 * 60 * 60 * 48;
      
      const lastWeekNum = s.questsRefreshedAt ? getWeekNumber(new Date(s.questsRefreshedAt)) : 0;
      const currentWeekNum = getWeekNumber(new Date());
      const isNewWeek = lastWeekNum !== currentWeekNum;

      const mainQuests = s.quests.filter((q) => q.type === "main");
      const weeklyQuests = isNewWeek 
        ? getRandomSubarray(WEEKLY_QUESTS_POOL, 2).map((q) => ({ ...q, done: false }))
        : s.quests.filter((q) => q.type === "weekly");

      const newDailies = getRandomSubarray(DAILY_QUESTS_POOL, 4).map((q) => ({ ...q, done: false }));

      return {
        ...s,
        quests: [
          ...newDailies,
          ...weeklyQuests,
          ...mainQuests,
        ],
        questsRefreshedAt: Date.now(),
        lastActive: Date.now(),
        streak: isNewDay ? (wasYesterday ? s.streak + 1 : 1) : s.streak,
        dailyChestClaimed: false, // Reset chest daily
      };
    });
    void today;
  }, [hydrated]); // eslint-disable-line

  const addActivity = useCallback((message: string) => {
    setState((s) => ({
      ...s,
      activity: [{ id: crypto.randomUUID(), ts: Date.now(), message }, ...s.activity].slice(0, 60),
    }));
  }, []);

  const gainExp = useCallback(
    (amount: number, reason?: string) => {
      setState((s) => {
        let { exp, level, stats, shadows, achievements } = s;
        const statsWithGear = getStatsWithGear(s);
        
        // INT multiplier for EXP gains: +1.5% per INT point
        const multiplier = 1 + (statsWithGear.int * 0.015);
        const actualGain = Math.round(amount * multiplier);
        
        exp += actualGain;
        const newActivity = [...s.activity];
        let statPoints = s.statPoints || 0;
        let gold = s.gold;

        while (exp >= expForNextLevel(level)) {
          exp -= expForNextLevel(level);
          level += 1;
          
          // Small automatic bump to stats
          stats = {
            str: stats.str + 1,
            agi: stats.agi + 1,
            vit: stats.vit + 1,
            int: stats.int + 1,
            per: stats.per + 1,
          };
          
          // Grant manual points
          statPoints += 5;
          
          // Gold on Level Up: level * 100 Gold + STR multiplier (+2% per STR point)
          const baseLvlGold = level * 100;
          const strMultiplier = 1 + (statsWithGear.str * 0.02);
          const lvlUpGoldReward = Math.round(baseLvlGold * strMultiplier);
          gold += lvlUpGoldReward;

          notify(`LEVEL UP → ${level}`, "levelup");
          newActivity.unshift({
            id: crypto.randomUUID(),
            ts: Date.now(),
            message: `[SYSTEM] Level up! You are now level ${level}. Unused Stat Points +5. Earned ${lvlUpGoldReward} Gold.`,
          });

          // Shadow soldiers are arisen through story progression, not level.
          // See recordPageRead where finished chapters trigger unlocks.
        }
        
        // main quest checks
        const quests = s.quests.map((q) => {
          if (q.done) return q;
          if (q.id === "m1" && level >= 5) return { ...q, done: true };
          if (q.id === "m2" && level >= 10) return { ...q, done: true };
          if (q.id === "m3" && level >= 15) return { ...q, done: true };
          if (q.id === "m4" && level >= 20) return { ...q, done: true };
          if (q.id === "m5" && level >= 25) return { ...q, done: true };
          if (q.id === "m6" && level >= 40) return { ...q, done: true };
          return q;
        });

        if (reason) {
          newActivity.unshift({
            id: crypto.randomUUID(),
            ts: Date.now(),
            message: `[EXP +${actualGain}] ${reason}`,
          });
        }
        
        return { 
          ...s, 
          exp, 
          level, 
          stats, 
          statPoints,
          gold,
          shadows, 
          achievements, 
          quests, 
          activity: newActivity.slice(0, 60) 
        };
      });
    },
    [notify],
  );

  const completeQuest = useCallback(
    (id: string) => {
      let questRewardExp = 0;
      setState((s) => {
        const q = s.quests.find((x) => x.id === id);
        if (!q || q.done) return s;
        questRewardExp = q.reward;
        
        // Gold reward based on STR (+2% gold per STR point)
        const statsWithGear = getStatsWithGear(s);
        const baseGold = Math.floor(q.reward / 3);
        const strMultiplier = 1 + (statsWithGear.str * 0.02);
        const goldReward = Math.round(baseGold * strMultiplier);

        notify(`Quest complete: ${q.text}`, "quest");
        return {
          ...s,
          quests: s.quests.map((x) => (x.id === id ? { ...x, done: true } : x)),
          gold: s.gold + goldReward,
          activity: [
            { id: crypto.randomUUID(), ts: Date.now(), message: `[QUEST] ${q.text} — cleared. +${goldReward} Gold` },
            ...s.activity,
          ].slice(0, 60),
        };
      });
      
      if (questRewardExp > 0) {
        setTimeout(() => gainExp(questRewardExp, `Quest Cleared: ${id}`), 10);
      }
    },
    [gainExp, notify],
  );

  const recordPageRead = useCallback(
    (chapterId: string, page: number, total: number, readingMs = 0, chapterOrder?: number) => {
      let goldEarned = 0;
      let expEarned = 5;
      let isCrit = false;

      setState((s) => {
        const prev = s.progress[chapterId];
        const wasFinished = prev?.finished;
        const finished = page >= total - 1;
        const newProgressRec: ChapterProgress = {
          page,
          total,
          finished,
          lastReadAt: Date.now(),
        };
        const newProgress = { ...s.progress, [chapterId]: newProgressRec };
        const chaptersRead = Object.values(newProgress).filter((p) => p.finished).length;

        // Dynamic multipliers based on stats
        const statsWithGear = getStatsWithGear(s);
        
        // PER Critical Comprehension check: +0.5% critical chance per PER point
        isCrit = Math.random() < (statsWithGear.per * 0.005);
        expEarned = isCrit ? 15 : 5;

        // VIT reduces HP loss by 1.5% per point (capped at 90% reduction)
        const vitReduction = Math.min(0.9, statsWithGear.vit * 0.015);
        const hpLoss = 0.4 * (1 - vitReduction);

        // INT reduces MP loss by 1.0% per point (capped at 90% reduction)
        const intReduction = Math.min(0.9, statsWithGear.int * 0.01);
        const mpLoss = 0.5 * (1 - intReduction);

        // AGI reduces Fatigue gain by 1.0% per point (capped at 90% reduction)
        const agiReduction = Math.min(0.9, statsWithGear.agi * 0.01);
        const fatigueGain = 0.3 * (1 - agiReduction);

        let gold = s.gold;
        const newActivity = [...s.activity];

        let shadows = s.shadows;

        // Raid Clear Reward: 20 Gold on Chapter completion + arise any shadow
        // whose canonical chapter threshold is now reached.
        if (finished && !wasFinished) {
          goldEarned = 20;
          gold += goldEarned;
          newActivity.unshift({
            id: crypto.randomUUID(),
            ts: Date.now(),
            message: `[SYSTEM] Raid Cleared! (Chapter ${chaptersRead} completed). +20 Gold.`,
          });

          if (typeof chapterOrder === "number" && chapterOrder > 0) {
            for (const su of SHADOW_UNLOCKS) {
              if (chapterOrder >= su.chapter && !shadows.includes(su.name)) {
                shadows = [...shadows, su.name];
                newActivity.unshift({
                  id: crypto.randomUUID(),
                  ts: Date.now(),
                  message: `[SYSTEM] ARISE. Shadow "${su.name}" has answered the Monarch. (${su.arc})`,
                });
                notify(`ARISE — ${su.name}`, "levelup");
              }
            }
          }
        }

        // Quest progress evaluations
        let quests = s.quests;
        
        // Daily Warmup (5 pages) & Routine (15 pages) & Grind (100 pages) & Legendary Scholar (200 pages) & Speed Sweep (10 pages)
        const totalRead = s.totalPagesRead + 1;
        if (totalRead >= 5) quests = quests.map((q) => (q.id === "d1" && !q.done ? { ...q, done: true } : q));
        if (totalRead >= 15) quests = quests.map((q) => (q.id === "d2" && !q.done ? { ...q, done: true } : q));
        if (totalRead >= 10) quests = quests.map((q) => (q.id === "d7" && !q.done ? { ...q, done: true } : q));
        if (totalRead >= 100) quests = quests.map((q) => (q.id === "w2" && !q.done ? { ...q, done: true } : q));
        if (totalRead >= 200) quests = quests.map((q) => (q.id === "w5" && !q.done ? { ...q, done: true } : q));

        // Endurance Raid (5 minutes continuous study)
        const totalTimeMs = s.totalReadingMs + readingMs;
        if (totalTimeMs >= 300000) quests = quests.map((q) => (q.id === "d8" && !q.done ? { ...q, done: true } : q));

        // Chapter Quest clears (D3, D4, D9, W1, W3, W4, W6)
        if (finished && !wasFinished) {
          quests = quests.map((q) => (q.id === "d3" && !q.done ? { ...q, done: true } : q));
          quests = quests.map((q) => (q.id === "d9" && !q.done ? { ...q, done: true } : q));
          
          if (chaptersRead >= 2) quests = quests.map((q) => (q.id === "d4" && !q.done ? { ...q, done: true } : q));
          if (chaptersRead >= 3) quests = quests.map((q) => (q.id === "w6" && !q.done ? { ...q, done: true } : q));
          if (chaptersRead >= 5) quests = quests.map((q) => (q.id === "w1" && !q.done ? { ...q, done: true } : q));
          if (chaptersRead >= 10) quests = quests.map((q) => (q.id === "w3" && !q.done ? { ...q, done: true } : q));
          if (chaptersRead >= 4) quests = quests.map((q) => (q.id === "w4" && !q.done ? { ...q, done: true } : q));
        }

        // Night mode page read (D6)
        quests = quests.map((q) => (q.id === "d6" && !q.done ? { ...q, done: true } : q));

        return {
          ...s,
          progress: newProgress,
          totalPagesRead: totalRead,
          totalReadingMs: totalTimeMs,
          chaptersRead,
          quests,
          gold,
          hp: Math.max(0, s.hp - hpLoss),
          mp: Math.max(0, s.mp - mpLoss),
          fatigue: Math.min(100, s.fatigue + fatigueGain),
          lastReadChapter: chapterId,
          shadows,
          activity: newActivity.slice(0, 60),
        };
      });

      // Grant EXP
      setTimeout(() => {
        gainExp(expEarned, isCrit ? "[CRITICAL COMPREHENSION]" : "Page read");
      }, 10);
    },
    [gainExp],
  );

  const bookmark = useCallback(() => {
    setState((s) => ({
      ...s,
      quests: s.quests.map((q) => (q.id === "d5" && !q.done ? { ...q, done: true } : q)),
    }));
    notify("Page bookmarked", "info");
  }, [notify]);

  const setPlayerName = useCallback((name: string) => {
    setState((s) => ({ ...s, playerName: name }));
  }, []);

  const rest = useCallback(() => {
    setState((s) => ({ ...s, mp: 100, fatigue: 0, hp: 100 }));
    notify("You feel refreshed.", "info");
  }, [notify]);

  const buyItem = useCallback(
    (itemId: string, cost: number) => {
      if (state.gold < cost) {
        notify("Insufficient Gold", "danger");
        return;
      }
      
      const itemDef = SHOP_ITEMS.find(i => i.name === itemId);
      const isGear = itemDef && itemDef.type !== "consumable";
      
      if (isGear && state.inventory.includes(itemId)) {
        notify("Weapon/Armor already owned", "danger");
        return;
      }

      notify(`Purchased: ${itemId}`, "info");
      setState((s) => {
        return {
          ...s,
          gold: s.gold - cost,
          inventory: [...s.inventory, itemId],
          activity: [
            {
              id: crypto.randomUUID(),
              ts: Date.now(),
              message: `[SYSTEM] Purchased "${itemId}" for ${cost} Gold.`,
            },
            ...s.activity,
          ].slice(0, 60),
        };
      });
    },
    [notify, state.gold, state.inventory],
  );

  const allocateStatPoint = useCallback(
    (statName: "str" | "agi" | "vit" | "int" | "per") => {
      if (!state.statPoints || state.statPoints <= 0) {
        notify("No available stat points", "danger");
        return;
      }

      notify(`Increased ${statName.toUpperCase()} by 1`, "info");
      setState((s) => {
        return {
          ...s,
          statPoints: s.statPoints - 1,
          stats: {
            ...s.stats,
            [statName]: s.stats[statName] + 1,
          },
          activity: [
            {
              id: crypto.randomUUID(),
              ts: Date.now(),
              message: `[SYSTEM] Allocated 1 point to ${statName.toUpperCase()}.`,
            },
            ...s.activity,
          ].slice(0, 60),
        };
      });
    },
    [notify, state.statPoints],
  );

  const equipTitle = useCallback(
    (titleName: string) => {
      notify(`Title Equipped: ${titleName}`, "quest");
      setState((s) => {
        return {
          ...s,
          equippedTitle: titleName,
          activity: [
            {
              id: crypto.randomUUID(),
              ts: Date.now(),
              message: `[SYSTEM] Equipped Title: "${titleName}".`,
            },
            ...s.activity,
          ].slice(0, 60),
        };
      });
    },
    [notify],
  );

  const useItem = useCallback(
    (itemName: string) => {
      if (!state.inventory.includes(itemName)) {
        notify("Item not found in inventory", "danger");
        return;
      }

      const itemDef = SHOP_ITEMS.find(i => i.name === itemName);
      if (!itemDef) return;

      let msg = "";
      if (itemDef.type === "consumable") {
        if (itemName === "High-Grade Potion") {
          msg = "Consumed High-Grade Potion. Restored 30 HP!";
        } else if (itemName === "Mana Crystal") {
          msg = "Crushed Mana Crystal. Restored 40 MP!";
        } else if (itemName === "Elixir of Focus") {
          msg = "Consumed Elixir of Focus. concentration restored!";
        } else if (itemName === "Rune of Reading") {
          msg = "Shattered Rune of Reading. Wisdom absorbed (+300 EXP)!";
        } else if (itemName === "Shadow Sigil") {
          msg = "Activated Shadow Sigil. MP fully restored!";
        } else if (itemName === "Blessed Elixir of Life") {
          msg = "Drank Blessed Elixir of Life! HP & Fatigue restored!";
        }
      } else {
        const gear = state.equippedGear || { weapon: null, armor: null, accessory: null };
        const slot = itemDef.type;
        const currentEquipped = gear[slot as keyof typeof gear];
        if (currentEquipped === itemName) {
          msg = `Unequipped ${itemName}`;
        } else {
          msg = `Equipped ${itemName}`;
        }
      }

      notify(msg, "info");

      setState((s) => {
        let hp = s.hp;
        let mp = s.mp;
        let fatigue = s.fatigue;
        let equippedGear = { ...s.equippedGear };
        let nextInventory = [...s.inventory];

        if (itemDef.type === "consumable") {
          if (itemName === "High-Grade Potion") {
            hp = Math.min(100, hp + 30);
            fatigue = Math.max(0, fatigue - 10);
          } else if (itemName === "Mana Crystal") {
            mp = Math.min(100, mp + 40);
          } else if (itemName === "Elixir of Focus") {
            hp = Math.min(100, hp + 50);
            mp = Math.min(100, mp + 50);
            fatigue = Math.max(0, fatigue - 30);
          } else if (itemName === "Shadow Sigil") {
            mp = 100;
          } else if (itemName === "Blessed Elixir of Life") {
            hp = 100;
            fatigue = 0;
          }

          const idx = nextInventory.indexOf(itemName);
          if (idx > -1) nextInventory.splice(idx, 1);
        } else {
          const slot = itemDef.type;
          const currentEquipped = equippedGear[slot as keyof typeof equippedGear];
          if (currentEquipped === itemName) {
            equippedGear[slot as keyof typeof equippedGear] = null;
          } else {
            equippedGear[slot as keyof typeof equippedGear] = itemName;
          }
        }

        return {
          ...s,
          hp,
          mp,
          fatigue,
          inventory: nextInventory,
          equippedGear,
          activity: [
            {
              id: crypto.randomUUID(),
              ts: Date.now(),
              message: `[SYSTEM] ${msg}`,
            },
            ...s.activity,
          ].slice(0, 60),
        };
      });

      // Rune of Reading EXP gain is triggered asynchronously outside state
      if (itemName === "Rune of Reading" && itemDef.type === "consumable") {
        setTimeout(() => gainExp(300, "Rune of Reading"), 15);
      }
    },
    [notify, gainExp, state.inventory, state.equippedGear],
  );

  const claimDailyChest = useCallback(() => {
    const dailyQuests = state.quests.filter(q => q.type === "daily");
    const allDone = dailyQuests.every(q => q.done);
    if (!allDone) {
      notify("Clear all daily quests first!", "danger");
      return;
    }
    if (state.dailyChestClaimed) {
      notify("Daily chest already claimed today!", "danger");
      return;
    }

    // Roll random consumable
    const consumables = SHOP_ITEMS.filter(item => item.type === "consumable");
    const randomItem = consumables[Math.floor(Math.random() * consumables.length)].name;
    
    notify(`Cleared Dailies! Received 150 Gold, +100 EXP, and 1x ${randomItem}`, "levelup");
    setState((s) => {
      return {
        ...s,
        gold: s.gold + 150,
        inventory: [...s.inventory, randomItem],
        dailyChestClaimed: true,
        activity: [
          {
            id: crypto.randomUUID(),
            ts: Date.now(),
            message: `[SYSTEM] Claimed Daily Reward Chest: +150 Gold, +100 EXP, and 1x ${randomItem}.`
          },
          ...s.activity
        ].slice(0, 60)
      };
    });

    setTimeout(() => gainExp(100, "Daily Quest Reward Chest"), 15);
  }, [gainExp, notify, state.quests, state.dailyChestClaimed]);

  const deleteProgress = useCallback((chapterId: string) => {
    setState((s) => {
      const newProgress = { ...s.progress };
      delete newProgress[chapterId];
      const chaptersRead = Object.values(newProgress).filter((p) => p.finished).length;
      return {
        ...s,
        progress: newProgress,
        chaptersRead,
      };
    });
  }, []);

  const finishOnboarding = useCallback(() => {
    setState((s) => ({ ...s, onboarded: true }));
  }, []);

  return {
    state,
    hydrated,
    gainExp,
    completeQuest,
    recordPageRead,
    bookmark,
    setPlayerName,
    rest,
    addActivity,
    finishOnboarding,
    buyItem,
    allocateStatPoint,
    equipTitle,
    useItem,
    claimDailyChest,
    deleteProgress,
  };
}
