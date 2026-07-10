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
  chaptersRead: number;
  totalPagesRead: number;
  totalReadingMs: number;
  shadows: string[]; // unlocked shadow soldiers
  achievements: string[];
  quests: Quest[];
  questsRefreshedAt: number;
  activity: ActivityLog[];
  progress: Record<string, ChapterProgress>;
  onboarded: boolean;
};

const SHADOWS_POOL = [
  "Igris", "Iron", "Tank", "Tusk", "Beru", "Bellion", "Kaisel", "Greed", "Kamish", "Fangs",
];

const DAILY_QUESTS: Omit<Quest, "done">[] = [
  { id: "d1", text: "Read 10 pages", reward: 30, type: "daily" },
  { id: "d2", text: "Finish 1 chapter", reward: 60, type: "daily" },
  { id: "d3", text: "Shadow Extraction: Bookmark a page", reward: 20, type: "daily" },
];
const WEEKLY_QUESTS: Omit<Quest, "done">[] = [
  { id: "w1", text: "Complete 5 chapters", reward: 200, type: "weekly" },
  { id: "w2", text: "Read for 60 minutes total", reward: 250, type: "weekly" },
];
const MAIN_QUESTS: Omit<Quest, "done">[] = [
  { id: "m1", text: "Reach Level 5 — Awakening", reward: 500, type: "main" },
  { id: "m2", text: "Reach Level 10 — E-Rank Hunter", reward: 1000, type: "main" },
  { id: "m3", text: "Reach Level 25 — Shadow Monarch's Ascension", reward: 5000, type: "main" },
];

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
    chaptersRead: 0,
    totalPagesRead: 0,
    totalReadingMs: 0,
    shadows: [],
    achievements: [],
    quests: [
      ...DAILY_QUESTS.map((q) => ({ ...q, done: false })),
      ...WEEKLY_QUESTS.map((q) => ({ ...q, done: false })),
      ...MAIN_QUESTS.map((q) => ({ ...q, done: false })),
    ],
    questsRefreshedAt: 0,
    activity: [
      { id: "boot", ts: Date.now(), message: "[SYSTEM] You have been chosen. Welcome, Player." },
    ],
    progress: {},
    onboarded: false,
  };
}

export function expForNextLevel(level: number) {
  return Math.floor(100 * Math.pow(1.25, level - 1));
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
      return {
        ...s,
        quests: s.quests.map((q) => (q.type === "daily" ? { ...q, done: false } : q)),
        questsRefreshedAt: Date.now(),
        lastActive: Date.now(),
        streak: isNewDay ? (wasYesterday ? s.streak + 1 : 1) : s.streak,
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
        exp += amount;
        const newActivity = [...s.activity];
        while (exp >= expForNextLevel(level)) {
          exp -= expForNextLevel(level);
          level += 1;
          stats = {
            str: stats.str + 2,
            agi: stats.agi + 2,
            vit: stats.vit + 2,
            int: stats.int + 3,
            per: stats.per + 1,
          };
          notify(`LEVEL UP → ${level}`, "levelup");
          newActivity.unshift({
            id: crypto.randomUUID(),
            ts: Date.now(),
            message: `[SYSTEM] Level up! You are now level ${level}.`,
          });
          // shadow unlock every 3 levels
          if (level % 3 === 0) {
            const next = SHADOWS_POOL[shadows.length % SHADOWS_POOL.length];
            if (!shadows.includes(next)) {
              shadows = [...shadows, next];
              newActivity.unshift({
                id: crypto.randomUUID(),
                ts: Date.now(),
                message: `[SYSTEM] Shadow "${next}" has joined your army.`,
              });
              notify(`Shadow ${next} extracted`, "info");
            }
          }
        }
        // main quest checks
        const quests = s.quests.map((q) => {
          if (q.done) return q;
          if (q.id === "m1" && level >= 5) return { ...q, done: true };
          if (q.id === "m2" && level >= 10) return { ...q, done: true };
          if (q.id === "m3" && level >= 25) return { ...q, done: true };
          return q;
        });
        if (reason) {
          newActivity.unshift({
            id: crypto.randomUUID(),
            ts: Date.now(),
            message: `[EXP +${amount}] ${reason}`,
          });
        }
        return { ...s, exp, level, stats, shadows, achievements, quests, activity: newActivity.slice(0, 60) };
      });
    },
    [notify],
  );

  const completeQuest = useCallback(
    (id: string) => {
      setState((s) => {
        const q = s.quests.find((x) => x.id === id);
        if (!q || q.done) return s;
        notify(`Quest complete: ${q.text}`, "quest");
        return {
          ...s,
          quests: s.quests.map((x) => (x.id === id ? { ...x, done: true } : x)),
          gold: s.gold + Math.floor(q.reward / 3),
          activity: [
            { id: crypto.randomUUID(), ts: Date.now(), message: `[QUEST] ${q.text} — cleared. +${q.reward} EXP` },
            ...s.activity,
          ].slice(0, 60),
        };
      });
      // gain exp after the state settles — use setTimeout to sequence
      const q = state.quests.find((x) => x.id === id);
      if (q && !q.done) gainExp(q.reward);
    },
    [gainExp, notify, state.quests],
  );

  const recordPageRead = useCallback(
    (chapterId: string, page: number, total: number, readingMs = 0) => {
      setState((s) => {
        const prev = s.progress[chapterId];
        const wasFinished = prev?.finished;
        const finished = page >= total - 1;
        const newProgress: ChapterProgress = {
          page,
          total,
          finished,
          lastReadAt: Date.now(),
        };
        let chaptersRead = s.chaptersRead;
        let quests = s.quests;
        if (finished && !wasFinished) {
          chaptersRead += 1;
          quests = quests.map((q) => (q.id === "d2" && !q.done ? { ...q, done: true } : q));
        }
        // daily read-pages quest
        const totalRead = s.totalPagesRead + 1;
        if (totalRead >= 10) {
          quests = quests.map((q) => (q.id === "d1" && !q.done ? { ...q, done: true } : q));
        }
        return {
          ...s,
          progress: { ...s.progress, [chapterId]: newProgress },
          totalPagesRead: totalRead,
          totalReadingMs: s.totalReadingMs + readingMs,
          chaptersRead,
          quests,
          mp: Math.max(0, Math.min(100, s.mp - 0.5)),
          fatigue: Math.min(100, s.fatigue + 0.3),
        };
      });
      gainExp(5);
    },
    [gainExp],
  );

  const bookmark = useCallback(() => {
    setState((s) => ({
      ...s,
      quests: s.quests.map((q) => (q.id === "d3" && !q.done ? { ...q, done: true } : q)),
    }));
    notify("Page bookmarked", "info");
  }, [notify]);

  const setPlayerName = useCallback((name: string) => {
    setState((s) => ({ ...s, playerName: name }));
  }, []);

  const rest = useCallback(() => {
    setState((s) => ({ ...s, mp: 100, fatigue: Math.max(0, s.fatigue - 40), hp: Math.min(100, s.hp + 20) }));
    notify("You feel refreshed.", "info");
  }, [notify]);

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
  };
}
