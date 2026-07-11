import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Menu,
  X,
  Home,
  Library,
  Swords,
  BarChart3,
  History,
  Ghost,
  Trophy,
  Store,
  Upload,
  Bookmark,
  Sun,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  Trash2,
  ChevronLeft,
  ChevronRight,
  FileText,
  ImageIcon,
  FolderOpen,
  Download,
  Flame,
  Shield,
  Gem,
  Sparkles,
} from "lucide-react";
import {
  listChapters,
  saveChapter,
  savePreloadedChapter,
  getPages,
  deleteChapter,
  updateChapterMeta,
  parseFilename,
  migrateToVersion3,
  type Chapter,
} from "@/lib/db";
import { useGameState, expForNextLevel, SHOP_ITEMS, getStatsWithGear } from "@/lib/store";
import jinwoo3 from "@/assets/Jinwoo3.gif";
import jinwoo2 from "@/assets/Jinwoo2.gif";
import jinwoo from "@/assets/Jinwoo.gif";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Solo Leveling Reader" },
      {
        name: "description",
        content:
          "Offline Solo Leveling manhwa reader with a System-style gamified progress tracker. Level up as you read.",
      },
      { property: "og:title", content: "Solo Leveling Reader" },
      {
        property: "og:description",
        content:
          "A premium offline PWA that turns reading Solo Leveling into a leveling experience.",
      },
    ],
  }),
  component: App,
});

type View =
  | "home"
  | "library"
  | "reader"
  | "quests"
  | "stats"
  | "history"
  | "inventory"
  | "achievements"
  | "shop";

type Toast = {
  id: string;
  msg: string;
  kind: "info" | "levelup" | "quest" | "danger";
};

// ---------- Sound (optional beep) ----------
let audioCtx: AudioContext | null = null;
function beep(freq = 660, dur = 0.08, vol = 0.05) {
  try {
    if (typeof window === "undefined") return;
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.type = "square";
    g.gain.value = vol;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch { }
}

// ---------- Shared UI ----------
function SysPanel({
  children,
  className = "",
  glow = true,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div className={`sys-panel ${glow ? "sys-panel-corners" : ""} p-4 ${className}`}>
      {children}
    </div>
  );
}

function SysBar({ value, max, color = "cyan" }: { value: number; max: number; color?: "cyan" | "red" | "gold" | "purple" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const grad =
    color === "red"
      ? "linear-gradient(90deg, oklch(0.45 0.22 25), oklch(0.75 0.24 25))"
      : color === "gold"
        ? "linear-gradient(90deg, oklch(0.55 0.16 90), oklch(0.85 0.17 90))"
        : color === "purple"
          ? "linear-gradient(90deg, oklch(0.40 0.22 300), oklch(0.70 0.25 300))"
          : undefined;
  return (
    <div className="sys-bar">
      <div
        className="sys-bar-fill"
        style={{ width: `${pct}%`, ...(grad ? { background: grad } : {}) }}
      />
    </div>
  );
}

function SysBtn({
  onClick,
  children,
  className = "",
  disabled,
  danger,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className={`sys-btn ${danger ? "!text-[color:var(--color-danger-glow)] !border-[color:var(--color-danger-glow)]/60" : ""} ${className}`}
      onClick={() => {
        beep(danger ? 220 : 720);
        onClick?.();
      }}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// ---------- App root ----------
function App() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((msg: string, kind: Toast["kind"] = "info") => {
    const t = { id: crypto.randomUUID(), msg, kind };
    setToasts((s) => [...s, t]);
    beep(kind === "levelup" ? 880 : kind === "danger" ? 200 : 640, 0.1, 0.06);
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== t.id)), kind === "levelup" ? 2600 : 2200);
  }, []);

  const game = useGameState(notify);
  const [view, setView] = useState<View>("home");
  const [navOpen, setNavOpen] = useState(false);
  const [readingChapter, setReadingChapter] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  // Reset scroll to top on navigation/view transitions
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, readingChapter]);

  const reloadChapters = useCallback(async () => {
    const c = await listChapters();
    setChapters(c);
  }, []);

  useEffect(() => {
    reloadChapters();
  }, [reloadChapters, refreshTick]);

  // Load preloaded build-time chapters metadata if present
  useEffect(() => {
    if (!game.hydrated) return;
    (async () => {
      // Run migration to clear sample chapters
      await migrateToVersion3();

      try {
        const res = await fetch("/chapters/metadata.json");
        if (!res.ok) return;
        const preloads = await res.json();
        if (!Array.isArray(preloads)) return;

        const existing = await listChapters();
        let added = false;

        for (const pre of preloads) {
          const match = existing.find(
            (c) => c.id === pre.id || (c.volume === pre.volume && c.order === pre.order)
          );
          if (!match) {
            await savePreloadedChapter({
              id: pre.id,
              title: pre.title,
              volume: pre.volume,
              order: pre.order,
              pageCount: pre.pageCount,
              createdAt: Date.now(),
              isPreloaded: true,
              preloadedPages: pre.preloadedPages
            });
            added = true;
          }
        }
        if (added) {
          await reloadChapters();
        }
      } catch (e) {
        console.log("No preloaded build-time chapters found.", e);
      }
    })();
  }, [game.hydrated, reloadChapters]);


  const openReader = (id: string) => {
    setReadingChapter(id);
    setView("reader");
  };

  return (
    <div className="min-h-screen sys-scan pb-32 relative">
      {/* Ambient particles */}
      <div className="pointer-events-none fixed inset-0 opacity-40">
        <div className="absolute top-10 left-10 w-1 h-1 bg-cyan-glow rounded-full animate-sys-pulse" />
        <div className="absolute top-40 right-20 w-1 h-1 bg-cyan-glow rounded-full animate-sys-pulse" />
        <div className="absolute bottom-40 left-1/3 w-1 h-1 bg-cyan-glow rounded-full animate-sys-pulse" />
      </div>

      <main className="max-w-2xl mx-auto px-4 pt-6 animate-sys-slide-in" key={view}>
        {view === "home" && <HomeView game={game} onGoto={setView} />}
        {view === "library" && (
          <LibraryView
            chapters={chapters}
            progress={game.state.progress}
            lastReadChapter={game.state.lastReadChapter}
            onOpen={openReader}
            onImport={async () => setRefreshTick((n) => n + 1)}
            onDelete={async (id) => {
              await deleteChapter(id);
              game.deleteProgress(id);
              setRefreshTick((n) => n + 1);
            }}
            notify={notify}
          />
        )}
        {view === "reader" && readingChapter && (
          <ReaderView
            key={readingChapter}
            chapterId={readingChapter}
            chapters={chapters}
            game={game}
            progress={game.state.progress[readingChapter]}
            onPage={(p, total, ms) => game.recordPageRead(readingChapter, p, total, ms)}
            onBookmark={game.bookmark}
            onBack={() => setView("library")}
            onChapterChange={(id) => setReadingChapter(id)}
          />
        )}
        {view === "quests" && <QuestsView game={game} />}
        {view === "stats" && <StatsView game={game} />}
        {view === "history" && <HistoryView game={game} chapters={chapters} onOpen={openReader} />}
        {view === "inventory" && <InventoryView game={game} />}
        {view === "achievements" && <AchievementsView game={game} />}
        {view === "shop" && <ShopView game={game} />}
      </main>

      {/* Center-button nav */}
      {view !== "reader" && <SystemNavButton onClick={() => setNavOpen(true)} />}

      {navOpen && (
        <SystemNavModal
          current={view}
          onSelect={(v) => {
            setView(v);
            setNavOpen(false);
          }}
          onClose={() => setNavOpen(false)}
        />
      )}

      {/* Toasts */}
      <div className="fixed top-4 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map((t) =>
          t.kind === "levelup" ? (
            <div key={t.id} className="animate-sys-level-up sys-panel sys-panel-corners px-8 py-4 text-center">
              <div className="text-xs tracking-[0.4em] text-cyan-glow sys-text-glow">SYSTEM</div>
              <div className="text-3xl font-bold sys-text-glow mt-1 system-font">{t.msg}</div>
            </div>
          ) : (
            <div
              key={t.id}
              className={`sys-panel px-4 py-2 text-sm animate-sys-slide-in ${t.kind === "danger" ? "!border-[color:var(--color-danger-glow)]/60" : ""}`}
            >
              <span className="text-cyan-glow system-font tracking-widest mr-2">[SYSTEM]</span>
              {t.msg}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

// ---------- Navigation ----------
function SystemNavButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="fixed bottom-6 left-0 right-0 flex justify-center z-40 pointer-events-none">
      <button
        onClick={() => {
          beep(560, 0.06);
          onClick();
        }}
        className="pointer-events-auto relative w-12 h-12 rounded-full flex items-center justify-center animate-sys-pulse"
        style={{
          background: "radial-gradient(circle, oklch(0.20 0.10 240 / 0.9), oklch(0.08 0.03 260 / 0.95))",
          border: "2px solid var(--color-cyan-glow)",
          boxShadow:
            "0 0 14px var(--color-cyan-glow), inset 0 0 12px oklch(0.65 0.22 230 / 0.4)",
        }}
        aria-label="Open System menu"
      >
        <Menu className="w-5 h-5 text-cyan-glow" style={{ filter: "drop-shadow(0 0 4px var(--color-cyan-glow))" }} />
        <span className="absolute -bottom-5 text-[9px] tracking-[0.3em] text-cyan-glow system-font">SYSTEM</span>
      </button>
    </div>
  );
}

const NAV_ITEMS: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Status", icon: Home },
  { id: "library", label: "Library", icon: Library },
  { id: "quests", label: "Quests", icon: Swords },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "history", label: "History", icon: History },
  { id: "inventory", label: "Shadow Army", icon: Ghost },
  { id: "achievements", label: "Achievements", icon: Trophy },
  { id: "shop", label: "Shop", icon: Store },
];

function SystemNavModal({
  current,
  onSelect,
  onClose,
}: {
  current: View;
  onSelect: (v: View) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="sys-panel sys-panel-corners animate-sys-modal-in w-full max-w-md p-6">
        <div className="text-center mb-4">
          <div className="text-[10px] tracking-[0.5em] text-cyan-glow system-font">◆ SYSTEM ◆</div>
          <h2 className="text-xl mt-1 sys-text-glow system-font">STATUS WINDOW</h2>
          <div className="h-px mt-2 bg-gradient-to-r from-transparent via-cyan-glow/60 to-transparent" />
        </div>
        <div className="flex flex-col gap-1.5">
          {NAV_ITEMS.map((n) => {
            const Icon = n.icon;
            const active = current === n.id;
            return (
              <button
                key={n.id}
                onClick={() => {
                  beep(720, 0.05);
                  onSelect(n.id);
                }}
                className={`flex items-center gap-3 px-4 py-3 text-left transition-all border ${active
                  ? "border-cyan-glow bg-cyan-glow/10 sys-text-glow"
                  : "border-cyan-glow/30 hover:border-cyan-glow hover:bg-cyan-glow/5"
                  }`}
              >
                <Icon className="w-5 h-5 text-cyan-glow" />
                <span className="system-font tracking-widest text-sm">{n.label}</span>
                <span className="ml-auto text-cyan-glow/60">›</span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex justify-center">
          <SysBtn onClick={onClose} danger>
            <span className="flex items-center gap-2">
              <X className="w-4 h-4" /> CLOSE
            </span>
          </SysBtn>
        </div>
      </div>
    </div>
  );
}

// ---------- Home ----------
function HomeView({ game, onGoto }: { game: ReturnType<typeof useGameState>; onGoto: (v: View) => void }) {
  const { state, setPlayerName, completeQuest, rest } = game;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(state.playerName);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  useEffect(() => setName(state.playerName), [state.playerName]);
  const expNext = expForNextLevel(state.level);

  const gear = state.equippedGear || { weapon: null, armor: null, accessory: null };
  const hasMonarchItem = gear.armor === "Monarch's Cloak" || gear.accessory === "Shadow Monarch's Crown";
  const playerClass = hasMonarchItem ? "SHADOW MONARCH" : "NECROMANCER";
  const currentPortrait = state.level >= 31 ? jinwoo : state.level >= 21 ? jinwoo2 : jinwoo3;

  // PWA install prompt detection
  useEffect(() => {
    console.log("[pwa] checking installability...");

    const handler = (e: Event) => {
      console.log("[pwa] beforeinstallprompt event fired");
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Check if already installed
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    console.log("[pwa] is standalone:", isStandalone);
    if (isStandalone) {
      setShowInstallPrompt(false);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowInstallPrompt(false);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="space-y-4">
      <SysPanel>
        <div className="flex gap-3 sm:gap-5 items-start">
          <div className="w-28 h-36 rounded-lg overflow-hidden border-2 border-cyan-glow/60 shadow-[0_0_15px_rgba(6,182,212,0.4)] bg-black/50 shrink-0 relative flex items-center justify-center">
            <img
              src={currentPortrait}
              alt="Sung Jin-Woo Avatar"
              className="w-full h-full object-cover scale-[1.5] origin-center"
            />
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
          </div>
          <div className="flex-1 flex flex-col justify-between h-36 min-w-0">
            <div className="min-w-0">
              <div className="text-[10px] tracking-[0.4em] text-cyan-glow/80 system-font">PLAYER</div>
              {editing ? (
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => {
                    setPlayerName(name.trim() || "Player");
                    setEditing(false);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="bg-transparent border-b border-cyan-glow/60 outline-none text-xl sm:text-2xl system-font sys-text-glow w-full min-w-0"
                />
              ) : (
                <h1
                  className="text-xl sm:text-2xl system-font sys-text-glow cursor-pointer truncate"
                  onClick={() => setEditing(true)}
                >
                  {state.playerName}
                </h1>
              )}
              <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 system-font tracking-widest truncate">
                CLASS · <span className="sys-text-gold">{playerClass}</span>
              </div>
            </div>

            <div className="flex items-end justify-between border-t border-cyan-glow/20 pt-2">
              <div>
                <div className="text-[10px] tracking-[0.4em] text-cyan-glow/80 system-font">LEVEL</div>
                <div className="text-4xl system-font sys-text-glow font-bold">{state.level}</div>
              </div>
              <div className="text-right">
                <div className="text-[9px] text-muted-foreground system-font tracking-widest">RANK</div>
                <span className="text-sm system-font sys-text-gold tracking-widest font-bold font-mono">
                  {state.level >= 25 ? "S-RANK" : state.level >= 20 ? "A-RANK" : state.level >= 15 ? "B-RANK" : state.level >= 10 ? "C-RANK" : state.level >= 5 ? "D-RANK" : "E-RANK"}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <StatLine label="HP" value={state.hp} max={100} color="red" />
          <StatLine label="MP" value={state.mp} max={100} color="cyan" />
          <StatLine label="EXP" value={state.exp} max={expNext} color="gold" showVal />
          <StatLine label="FATIGUE" value={state.fatigue} max={100} color="purple" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] system-font tracking-widest text-cyan-glow/80">
          <div className="sys-panel !p-2 !px-3">STREAK · <span className="sys-text-gold">{state.streak}d</span></div>
          <div className="sys-panel !p-2 !px-3">GOLD · <span className="sys-text-gold">{state.gold}</span></div>
          <div className="sys-panel !p-2 !px-3">CHAPTERS · <span className="sys-text-glow">{state.chaptersRead}</span></div>
        </div>
      </SysPanel>

      {showInstallPrompt && (
        <SysPanel>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] tracking-[0.4em] text-cyan-glow/80 system-font">INSTALL APP</div>
              <div className="text-xs text-muted-foreground mt-1">Add to home screen for offline access</div>
            </div>
            <SysBtn onClick={handleInstall}>
              <span className="flex items-center gap-2">
                <Download className="w-4 h-4" /> INSTALL
              </span>
            </SysBtn>
          </div>
        </SysPanel>
      )}

      <SysPanel>
        <div className="flex items-center justify-between mb-3">
          <h3 className="system-font tracking-[0.3em] text-cyan-glow text-sm">DAILY QUESTS</h3>
          <button className="text-xs text-cyan-glow/70 system-font tracking-widest" onClick={() => onGoto("quests")}>
            VIEW ALL ›
          </button>
        </div>
        <div className="space-y-2">
          {state.quests.filter((q) => q.type === "daily").map((q) => (
            <div
              key={q.id}
              className={`w-full flex items-center gap-3 px-3 py-2 border text-left transition-all ${q.done ? "border-cyan-glow/20 opacity-50 bg-cyan-glow/5" : "border-cyan-glow/40"
                }`}
            >
              <div
                className={`w-4 h-4 border flex items-center justify-center ${q.done ? "bg-cyan-glow/40 border-cyan-glow" : "border-cyan-glow"}`}
              >
                {q.done && <span className="text-[10px] sys-text-glow">✓</span>}
              </div>
              <span className={`flex-1 text-sm system-font tracking-wide ${q.done ? "line-through" : ""}`}>{q.text}</span>
              <span className="text-xs sys-text-gold system-font">+{q.reward} EXP</span>
            </div>
          ))}
        </div>
      </SysPanel>

      <div className="grid grid-cols-2 gap-3">
        <SysBtn onClick={() => onGoto("library")} className="!py-4">
          <Library className="w-4 h-4 inline mr-2" /> LIBRARY
        </SysBtn>
        <SysBtn onClick={rest} className="!py-4">
          REST · +HP
        </SysBtn>
      </div>

      <SysPanel>
        <h3 className="system-font tracking-[0.3em] text-cyan-glow text-sm mb-3">SYSTEM LOG</h3>
        <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
          {state.activity.slice(0, 12).map((a) => (
            <div key={a.id} className="text-xs system-font text-cyan-glow/80 tracking-wide">
              <span className="text-cyan-glow/50" suppressHydrationWarning>
                {game.hydrated
                  ? new Date(a.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : "--:--"}
              </span>{" "}
              {a.message}
            </div>
          ))}
        </div>
      </SysPanel>
    </div>
  );
}

function StatLine({
  label,
  value,
  max,
  color,
  showVal,
}: {
  label: string;
  value: number;
  max: number;
  color: "red" | "cyan" | "gold" | "purple";
  showVal?: boolean;
}) {
  return (
    <div>
      <div className="flex justify-between text-[10px] system-font tracking-widest mb-1">
        <span className={color === "red" ? "sys-text-danger" : color === "gold" ? "sys-text-gold" : "text-cyan-glow"}>
          {label}
        </span>
        <span className="text-cyan-glow/70">
          {showVal ? `${Math.floor(value)} / ${max}` : `${Math.floor((value / max) * 100)}%`}
        </span>
      </div>
      <SysBar value={value} max={max} color={color} />
    </div>
  );
}

// ---------- Library ----------
function LibraryView({
  chapters,
  progress,
  lastReadChapter,
  onOpen,
  onImport,
  onDelete,
  notify,
}: {
  chapters: Chapter[];
  progress: Record<string, { page: number; total: number; finished: boolean; lastReadAt: number }>;
  lastReadChapter: string | null;
  onOpen: (id: string) => void;
  onImport: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  notify: (m: string, k?: any) => void;
}) {
  const imgInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{
    label: string;
    current: number;
    total: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const blobToBase64 = async (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const base64ToBlob = async (base64Data: string): Promise<Blob> => {
    const parts = base64Data.split(";base64,");
    const contentType = parts[0].split(":")[1] || "image/png";
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
  };

  const handleExportBackup = async () => {
    try {
      setUploading({ label: "PREPARING BACKUP", current: 0, total: 1 });
      const data = [];
      const totalChapters = chapters.length;

      for (let i = 0; i < chapters.length; i++) {
        const c = chapters[i];
        setUploading({
          label: `BACKING UP: ${c.title}`,
          current: i + 1,
          total: totalChapters,
        });
        const pages = await getPages(c.id);
        const pageData = [];
        for (const p of pages) {
          const base64 = await blobToBase64(p.blob);
          pageData.push({ order: p.order, dataUrl: base64 });
        }
        data.push({
          chapter: c,
          pages: pageData,
        });
      }

      const json = JSON.stringify(data);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shadow_hunter_backup_${Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      notify("Backup exported successfully", "info");
    } catch (err: any) {
      notify(`Export failed: ${err.message}`, "danger");
    } finally {
      setUploading(null);
    }
  };

  const handleImportBackup = async (file: File) => {
    try {
      setUploading({ label: "READING BACKUP FILE", current: 0, total: 1 });
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) {
        throw new Error("Invalid backup format");
      }

      const totalChapters = data.length;
      setUploading({ label: "IMPORTING BACKUP", current: 0, total: totalChapters });

      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const { chapter, pages } = item;
        if (!chapter || !Array.isArray(pages)) continue;

        setUploading({
          label: `RESTORE: ${chapter.title}`,
          current: i + 1,
          total: totalChapters,
        });

        const blobs: Blob[] = [];
        for (const p of pages) {
          const blob = await base64ToBlob(p.dataUrl);
          blobs.push(blob);
        }

        await saveChapter(chapter, blobs);
      }

      notify("Backup imported successfully", "info");
      await onImport();
    } catch (err: any) {
      notify(`Import failed: ${err.message}`, "danger");
    } finally {
      setUploading(null);
    }
  };

  const handleImages = async (files: FileList) => {
    if (!files.length) return;
    setImportError(null);
    try {
      const arr = Array.from(files);
      const imageFiles = arr.filter(
        (f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name),
      );
      if (!imageFiles.length) {
        throw new Error("No supported image files found in the selection.");
      }

      // Group files by their relative path folders
      const groups: Record<string, { parentName: string; files: File[] }> = {};
      for (const file of imageFiles) {
        const relativePath = file.webkitRelativePath || "";
        const parts = relativePath.split("/");
        let folderPath = "Imported";
        let parentName = "Imported";

        if (parts.length > 1) {
          folderPath = parts.slice(0, -1).join("/");
          parentName = parts[parts.length - 2];
        }

        if (!groups[folderPath]) {
          groups[folderPath] = { parentName, files: [] };
        }
        groups[folderPath].files.push(file);
      }

      const groupEntries = Object.entries(groups);
      let totalProcessed = 0;
      const totalImages = imageFiles.length;

      setUploading({ label: "IMPORTING FOLDERS", current: 0, total: totalImages });

      for (const [folderPath, group] of groupEntries) {
        // Sort files numerically by name
        group.files.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true }),
        );

        let meta = parseFilename(group.parentName);
        if (meta.order === 0 && group.files.length > 0) {
          const fileMeta = parseFilename(group.files[0].name);
          if (fileMeta.order !== 0) {
            meta = {
              volume: fileMeta.volume,
              order: fileMeta.order,
              title: group.parentName !== "Imported" ? group.parentName : fileMeta.title,
            };
          }
        }

        const pages: Blob[] = [];
        for (let i = 0; i < group.files.length; i++) {
          pages.push(group.files[i]);
          totalProcessed++;
          setUploading({
            label: `IMPORTING: ${meta.title || "Chapter"}`,
            current: totalProcessed,
            total: totalImages,
          });
        }

        await saveChapter(
          {
            id: crypto.randomUUID(),
            title: meta.title || `Chapter ${meta.order || Date.now()}`,
            volume: meta.volume,
            order: meta.order,
            pageCount: pages.length,
            createdAt: Date.now(),
          },
          pages,
        );
      }

      notify(`Successfully imported ${groupEntries.length} chapter(s)`, "info");
      await onImport();
    } catch (err: any) {
      const msg = err?.message || "Import failed";
      setImportError(msg);
      notify(msg, "danger");
    } finally {
      setUploading(null);
    }
  };

  const handlePdfs = async (files: FileList) => {
    if (!files.length) return;
    setImportError(null);
    try {
      const { pdfToPageBlobs } = await import("@/lib/pdf-import");
      const arr = Array.from(files);
      for (const file of arr) {
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
          throw new Error(`Not a PDF: ${file.name}`);
        }
        setUploading({ label: `RENDERING ${file.name}`, current: 0, total: 1 });
        const pages = await pdfToPageBlobs(file, (c, t) =>
          setUploading({ label: `RENDERING ${file.name}`, current: c, total: t }),
        );
        const meta = parseFilename(file.name);
        await saveChapter(
          {
            id: crypto.randomUUID(),
            title: meta.title || file.name.replace(/\.pdf$/i, ""),
            volume: meta.volume,
            order: meta.order,
            pageCount: pages.length,
            createdAt: Date.now(),
          },
          pages,
        );
        notify(`PDF imported: ${file.name} (${pages.length} pages)`, "info");
      }
      await onImport();
    } catch (err: any) {
      const msg = err?.message || "PDF import failed";
      setImportError(msg);
      notify(msg, "danger");
    } finally {
      setUploading(null);
    }
  };

  const grouped = useMemo(() => {
    const g: Record<number, Chapter[]> = {};
    chapters.forEach((c) => {
      (g[c.volume] ??= []).push(c);
    });
    return g;
  }, [chapters]);

  const renameChapter = async (c: Chapter) => {
    const t = prompt("Chapter title:", c.title);
    if (t) {
      await updateChapterMeta(c.id, { title: t });
      await onImport();
    }
  };

  return (
    <div className="space-y-4">
      <SysPanel>
        <div className="flex items-center justify-between">
          <h2 className="system-font tracking-[0.3em] text-cyan-glow sys-text-glow">LIBRARY</h2>
          {lastReadChapter && chapters.find(c => c.id === lastReadChapter) && (
            <button
              onClick={() => onOpen(lastReadChapter)}
              className="text-xs sys-text-gold system-font tracking-widest hover:opacity-70 flex items-center gap-1"
            >
              <Bookmark className="w-3 h-3" /> RESUME READING
            </button>
          )}
        </div>
      </SysPanel>

      {Object.entries(grouped)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([vol, list]) => (
          <SysPanel key={vol}>
            <h3 className="system-font tracking-[0.3em] text-cyan-glow text-sm mb-3">
              VOLUME {String(vol).padStart(2, "0")}
            </h3>
            <div className="space-y-2">
              {list
                .sort((a, b) => a.order - b.order)
                .map((c) => {
                  const p = progress[c.id];
                  const pct = p ? Math.floor(((p.page + 1) / p.total) * 100) : 0;
                  return (
                    <div key={c.id} className="border border-cyan-glow/30 p-3 hover:border-cyan-glow transition-all">
                      <div className="flex items-center gap-2">
                        <button className="flex-1 text-left" onClick={() => onOpen(c.id)}>
                          <div className="system-font tracking-wide text-cyan-glow">
                            Ch. {String(c.order).padStart(3, "0")} — {c.title}
                          </div>
                          <div className="text-[10px] system-font tracking-widest text-muted-foreground mt-1">
                            {c.pageCount} PAGES · {p?.finished ? "COMPLETED" : p ? `${pct}%` : "UNREAD"}
                          </div>
                        </button>
                        <button
                          onClick={() => renameChapter(c)}
                          className="text-xs text-cyan-glow/60 hover:text-cyan-glow px-2"
                        >
                          EDIT
                        </button>
                        <button
                          onClick={() => confirm(`Delete "${c.title}"?`) && onDelete(c.id)}
                          className="text-cyan-glow/40 hover:sys-text-danger"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {p && p.page > 0 && (
                        <div className="mt-2">
                          <SysBar value={p.page + 1} max={p.total} color="gold" />
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </SysPanel>
        ))}

      {chapters.length === 0 && !uploading && (
        <SysPanel>
          <p className="text-center text-cyan-glow/70 system-font tracking-widest text-sm py-8">
            [ NO CHAPTERS FOUND ]<br />
            <span className="text-xs opacity-70">Import your chapter images to begin.</span>
          </p>
        </SysPanel>
      )}
    </div>
  );
}

// ---------- Reader ----------
function ReaderView({
  chapterId,
  chapters,
  game,
  progress,
  onPage,
  onBookmark,
  onBack,
  onChapterChange,
}: {
  chapterId: string;
  chapters: Chapter[];
  game: ReturnType<typeof useGameState>;
  progress?: { page: number; total: number; finished?: boolean };
  onPage: (page: number, total: number, ms: number) => void;
  onBookmark: () => void;
  onBack: () => void;
  onChapterChange: (id: string) => void;
}) {
  const [pages, setPages] = useState<{ id: string; url: string; order: number }[]>([]);
  const [zoom, setZoom] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [nightMode, setNightMode] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(2);
  const [currentPage, setCurrentPage] = useState(progress?.page ?? 0);
  const [showControls, setShowControls] = useState(true);
  const ignoreScroll = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef<number>(Date.now());
  const lastPageRef = useRef<number>(progress?.page ?? 0);

  const isExhausted = game.state.hp <= 0 || game.state.mp <= 0 || game.state.fatigue >= 80;

  const handleViewportClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a")) return;
    beep(720, 0.03, 0.02);
    setShowControls((prev) => !prev);
  };

  const sortedChapters = useMemo(() => {
    return [...chapters].sort((a, b) => a.volume - b.volume || a.order - b.order);
  }, [chapters]);

  const currentIndex = useMemo(() => {
    return sortedChapters.findIndex((c) => c.id === chapterId);
  }, [sortedChapters, chapterId]);

  const prevChapter = currentIndex > 0 ? sortedChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < sortedChapters.length - 1 ? sortedChapters[currentIndex + 1] : null;

  useEffect(() => {
    setCurrentPage(progress?.page ?? 0);
    lastPageRef.current = progress?.page ?? 0;
    startedAt.current = Date.now();
  }, [chapterId, progress?.page]);

  useEffect(() => {
    let alive = true;
    const currentChapter = chapters.find((c) => c.id === chapterId);

    if (currentChapter?.isPreloaded && currentChapter.preloadedPages) {
      const urls = currentChapter.preloadedPages.map((url, idx) => ({
        id: `${chapterId}_${idx}`,
        url,
        order: idx,
      }));
      setPages(urls);
    } else {
      (async () => {
        const list = await getPages(chapterId);
        if (!alive) return;
        const urls = list.map((p) => ({ id: p.id, url: URL.createObjectURL(p.blob), order: p.order }));
        setPages(urls);
      })();
    }

    return () => {
      alive = false;
      setPages((old) => {
        old.forEach((p) => {
          if (p.url.startsWith("blob:")) {
            URL.revokeObjectURL(p.url);
          }
        });
        return [];
      });
    };
  }, [chapterId, chapters]);

  // Restore scroll ONLY ONCE when pages first load for a new chapterId
  const lastLoadedChapter = useRef<string | null>(null);

  useEffect(() => {
    if (pages.length) {
      ignoreScroll.current = true;
      const t = setTimeout(() => {
        ignoreScroll.current = false;
      }, 400); // 400ms buffer to absorb the initial scrollIntoView / scrollTo

      if (lastLoadedChapter.current !== chapterId) {
        lastLoadedChapter.current = chapterId;
        if (progress?.page) {
          const el = document.getElementById(`page-${progress.page}`);
          el?.scrollIntoView({ block: "start" });
        } else {
          window.scrollTo(0, 0);
        }
      }
      return () => clearTimeout(t);
    } else {
      // Reset ref when pages are cleared (chapter changing)
      lastLoadedChapter.current = null;
    }
  }, [pages.length, chapterId, progress?.page]);

  // Track current page based on vertical scroll viewport alignment (highly robust for long webtoons)
  useEffect(() => {
    if (!pages.length) return;

    const handleScroll = () => {
      if (!ignoreScroll.current) {
        setShowControls(false);
      }

      const elements = document.querySelectorAll("[data-page-el]");
      if (!elements.length) return;
      const midY = window.innerHeight / 2;

      let activeIdx = 0;
      let minDistance = Infinity;

      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const idx = Number((el as HTMLElement).dataset.index);

        // Calculate distance from center of page element to center of screen
        const elementMid = rect.top + rect.height / 2;
        const dist = Math.abs(elementMid - midY);

        if (dist < minDistance) {
          minDistance = dist;
          activeIdx = idx;
        }
      });

      // If we are scrolled all the way to the bottom of the page, force last page active
      const isAtBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 20);
      if (isAtBottom) {
        activeIdx = pages.length - 1;
      }

      if (!isNaN(activeIdx) && activeIdx !== lastPageRef.current) {
        lastPageRef.current = activeIdx;
        setCurrentPage(activeIdx);
        const ms = Date.now() - startedAt.current;
        startedAt.current = Date.now();
        onPage(activeIdx, pages.length, ms);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // Run once on load/render to set initial state
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [pages, onPage]);

  // Auto scroll
  useEffect(() => {
    if (!autoScroll) return;
    setShowControls(false);
    const id = setInterval(() => {
      window.scrollBy({ top: autoSpeed * 3, behavior: "auto" });
    }, 30);
    return () => clearInterval(id);
  }, [autoScroll, autoSpeed]);

  const pct = pages.length ? Math.floor(((currentPage + 1) / pages.length) * 100) : 0;

  return (
    <div onClick={handleViewportClick} className="min-h-screen relative">
      {/* Top bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`sticky top-0 z-30 -mx-4 px-4 py-2 backdrop-blur-md bg-background/70 border-b border-cyan-glow/30 transition-all duration-300 transform ${showControls ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
          }`}
      >
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="sys-btn !py-2 !px-3">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <div className="text-[10px] system-font tracking-widest text-cyan-glow/70">
              PAGE {currentPage + 1} / {pages.length || "…"}
            </div>
            <SysBar value={pages.length ? currentPage + 1 : 0} max={pages.length || 1} color="gold" />
          </div>
          <span className="text-xs sys-text-gold system-font">{pct}%</span>
        </div>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <button className="sys-btn !py-1 !px-2 !text-[10px]" onClick={() => setNightMode((n) => !n)}>
            <Sun className="w-3 h-3 inline mr-1" /> {nightMode ? "NIGHT" : "DAY"}
          </button>
          <button className="sys-btn !py-1 !px-2 !text-[10px]" onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}>
            <ZoomOut className="w-3 h-3" />
          </button>
          <button className="sys-btn !py-1 !px-2 !text-[10px]" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>
            <ZoomIn className="w-3 h-3" />
          </button>
          <button className="sys-btn !py-1 !px-2 !text-[10px]" onClick={() => setBrightness((b) => (b >= 1.4 ? 0.6 : b + 0.2))}>
            BRIGHT · {brightness.toFixed(1)}
          </button>
          <button className="sys-btn !py-1 !px-2 !text-[10px]" onClick={() => setAutoScroll((a) => !a)}>
            {autoScroll ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </button>
          {autoScroll && (
            <button className="sys-btn !py-1 !px-2 !text-[10px]" onClick={() => setAutoSpeed((s) => (s >= 6 ? 1 : s + 1))}>
              SPD · {autoSpeed}
            </button>
          )}
          <button className="sys-btn !py-1 !px-2 !text-[10px]" onClick={onBookmark}>
            <Bookmark className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="mt-3 space-y-2">
        {pages.map((p, i) => (
          <div
            key={p.id}
            id={`page-${i}`}
            data-page-el
            data-index={i}
            style={{ transform: `scale(${zoom})`, transformOrigin: "top center", filter: `brightness(${brightness}) ${nightMode ? "contrast(1.15) hue-rotate(200deg) saturate(0.7)" : ""}` }}
          >
            <img src={p.url} alt={`Page ${i + 1}`} className="w-full block" loading="lazy" />
          </div>
        ))}
        {!pages.length && (
          <div className="text-center py-20 text-cyan-glow/60 system-font tracking-widest">
            [ LOADING PAGES... ]
          </div>
        )}
      </div>

      {isExhausted && (
        <div className="min-h-[80vh] flex items-center justify-center p-4">
          <div className="sys-panel sys-panel-corners max-w-md w-full p-6 text-center border-[color:var(--color-danger-glow)] !border-[color:var(--color-danger-glow)]/60 relative animate-sys-pulse">
            <div className="text-xs tracking-[0.4em] sys-text-danger system-font mb-2">
              [SYSTEM WARNING · EMERGENCY]
            </div>
            <h2 className="text-2xl system-font sys-text-danger font-bold tracking-wider mb-4 animate-sys-pulse">
              STATE OF EXHAUSTION
            </h2>
            <div className="w-full h-[1px] bg-red-600/30 my-4" />
            <p className="text-xs text-muted-foreground system-font tracking-wide leading-relaxed mb-6 text-left">
              Your physical and mental strength have depleted below standard hunter thresholds.
              All actions (reading) have been suspended by the System.
              You must execute recovery before attempting to continue training.
            </p>
            <div className="sys-panel !p-4 bg-red-950/20 border-red-500/20 text-left mb-6 space-y-2 text-xs system-font">
              <div className="flex justify-between">
                <span className="text-red-400">HP (Vitality)</span>
                <span className="sys-text-danger font-bold">{Math.floor(game.state.hp)} / 100</span>
              </div>
              <div className="sys-bar"><div className="sys-bar-fill !bg-red-600" style={{ width: `${game.state.hp}%` }} /></div>

              <div className="flex justify-between mt-2">
                <span className="text-cyan-400">MP (Mana/Motivation)</span>
                <span className="text-cyan-glow font-bold">{Math.floor(game.state.mp)} / 100</span>
              </div>
              <div className="sys-bar"><div className="sys-bar-fill !bg-cyan-600" style={{ width: `${game.state.mp}%` }} /></div>

              <div className="flex justify-between mt-2">
                <span className="text-purple-400">FATIGUE (Stress)</span>
                <span className="text-purple-400 font-bold">{Math.floor(game.state.fatigue)} / 100</span>
              </div>
              <div className="sys-bar"><div className="sys-bar-fill !bg-purple-600" style={{ width: `${game.state.fatigue}%` }} /></div>
            </div>
            <SysBtn
              onClick={() => {
                game.rest();
              }}
              danger
              className="w-full !py-3 tracking-[0.2em] font-bold"
            >
              [ REST AND RECOVER ]
            </SysBtn>
          </div>
        </div>
      )}

      {/* Pager: previous / next chapter */}
      {!isExhausted && pages.length > 0 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`sticky bottom-6 z-30 mt-4 flex justify-between gap-2 px-1 transition-all duration-300 transform ${showControls ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0 pointer-events-none"
            }`}
        >
          <button
            className="sys-btn !py-2 !px-3 flex items-center gap-1"
            disabled={!prevChapter}
            onClick={() => {
              if (prevChapter) {
                window.scrollTo(0, 0);
                onChapterChange(prevChapter.id);
              }
            }}
          >
            <ChevronLeft className="w-4 h-4" /> PREV CH
          </button>
          <div className="sys-panel !p-2 !px-3 text-[10px] system-font tracking-widest text-cyan-glow/80 self-center">
            PAGE {currentPage + 1} / {pages.length}
          </div>
          <button
            className="sys-btn !py-2 !px-3 flex items-center gap-1"
            disabled={!nextChapter || !progress?.finished}
            onClick={() => {
              if (nextChapter) {
                window.scrollTo(0, 0);
                onChapterChange(nextChapter.id);
              }
            }}
          >
            {!progress?.finished ? "CH LOCKED" : "NEXT CH"} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Quests ----------
function QuestsView({ game }: { game: ReturnType<typeof useGameState> }) {
  const { state } = game;
  const claimDailyChest = (game as any).claimDailyChest;

  const dailyQuests = state.quests.filter((q) => q.type === "daily");
  const dailyDoneCount = dailyQuests.filter((q) => q.done).length;
  const allDailiesDone = dailyQuests.length > 0 && dailyDoneCount === dailyQuests.length;

  const sections: { title: string; type: "daily" | "weekly" | "main" }[] = [
    { title: "DAILY QUESTS", type: "daily" },
    { title: "WEEKLY QUESTS", type: "weekly" },
    { title: "MAIN STORY", type: "main" },
  ];

  const statsWithGear = getStatsWithGear(state);

  return (
    <div className="space-y-4">
      {/* Daily Quest Loot Box Panel */}
      <SysPanel className="relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="system-font tracking-[0.2em] text-cyan-glow text-xs sys-text-glow">DAILY QUEST REWARD CHEST</h3>
            <p className="text-[10px] text-muted-foreground system-font tracking-wide mt-1">
              Clear all {dailyQuests.length} daily quests to unlock a random consumable and 150 Gold!
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] system-font text-cyan-glow/80 tracking-widest">{dailyDoneCount} / {dailyQuests.length} CLEARED</div>
          </div>
        </div>
        <div className="mt-3">
          <SysBar value={dailyDoneCount} max={Math.max(1, dailyQuests.length)} color="cyan" />
        </div>
        <div className="mt-3 flex justify-end">
          {state.dailyChestClaimed ? (
            <div className="text-[10px] system-font tracking-widest text-muted-foreground border border-muted-foreground/30 px-3 py-2 w-full text-center">
              [ CHEST CLAIMED · RESET AT MIDNIGHT ]
            </div>
          ) : allDailiesDone ? (
            <button
              onClick={() => {
                beep(880, 0.1);
                claimDailyChest();
              }}
              className="w-full py-2 text-xs system-font tracking-widest bg-cyan-glow/20 text-cyan-glow border border-cyan-glow animate-pulse hover:bg-cyan-glow/30"
            >
              ★ EXTRACT REWARD CHEST ★
            </button>
          ) : (
            <div className="text-[10px] system-font tracking-widest text-cyan-glow/40 border border-cyan-glow/10 px-3 py-2 w-full text-center">
              [ REWARD LOCKED · COMPLETE ALL DAILY QUESTS ]
            </div>
          )}
        </div>
      </SysPanel>

      {sections.map((s) => (
        <SysPanel key={s.type}>
          <h3 className="system-font tracking-[0.3em] text-cyan-glow text-sm mb-3 sys-text-glow">{s.title}</h3>
          <div className="space-y-2">
            {state.quests.filter((q) => q.type === s.type).map((q) => {
              const goldReward = Math.round((q.reward / 3) * (1 + statsWithGear.str * 0.02));
              return (
                <div
                  key={q.id}
                  className={`w-full flex items-center gap-3 px-3 py-2 border text-left transition-all ${q.done
                    ? "border-cyan-glow/20 opacity-60 bg-cyan-glow/5"
                    : "border-cyan-glow/40"
                    }`}
                >
                  <div className={`w-4 h-4 border flex items-center justify-center ${q.done ? "bg-cyan-glow/40 border-cyan-glow" : "border-cyan-glow/60"
                    }`}>
                    {q.done && <div className="w-1.5 h-1.5 bg-cyan-glow" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs system-font truncate ${q.done ? "line-through text-cyan-glow/40" : "text-cyan-glow"}`}>
                      {q.text}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5 system-font tracking-widest">
                      Dungeon Rank: {s.type === "daily" ? "E-Rank" : s.type === "weekly" ? "B-Rank" : "S-Rank"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-cyan-glow/70 system-font block">+{q.reward} EXP</span>
                    <span className="text-[10px] sys-text-gold system-font block">+{goldReward} G</span>
                  </div>
                </div>
              );
            })}
          </div>
        </SysPanel>
      ))}
    </div>
  );
}

// ---------- Stats ----------
function StatsView({ game }: { game: ReturnType<typeof useGameState> }) {
  const { state } = game;
  const allocateStatPoint = (game as any).allocateStatPoint;
  const equipTitle = (game as any).equipTitle;
  const currentPortrait = state.level >= 31 ? jinwoo : state.level >= 21 ? jinwoo2 : jinwoo3;

  const baseStats = state.stats;
  const statsWithGear = getStatsWithGear(state);
  const gear = state.equippedGear || { weapon: null, armor: null, accessory: null };

  const statsList = [
    {
      key: "str" as const,
      abbr: "STR",
      name: "Strength",
      desc: "Increases quest Gold payouts (+2% gold per point).",
      bonus: statsWithGear.str - baseStats.str,
    },
    {
      key: "agi" as const,
      abbr: "AGI",
      name: "Agility",
      desc: "Reduces fatigue accumulated while reading (-1.0% per point).",
      bonus: statsWithGear.agi - baseStats.agi,
    },
    {
      key: "vit" as const,
      abbr: "VIT",
      name: "Vitality",
      desc: "Increases Max HP and reduces HP loss rate (-1.5% per point).",
      bonus: statsWithGear.vit - baseStats.vit,
    },
    {
      key: "int" as const,
      abbr: "INT",
      name: "Intelligence",
      desc: "Increases Max MP and amplifies EXP gained (+1.5% per point).",
      bonus: statsWithGear.int - baseStats.int,
    },
    {
      key: "per" as const,
      abbr: "PER",
      name: "Perception",
      desc: "Comprehension Critical Rate (+0.5% chance for triple EXP).",
      bonus: statsWithGear.per - baseStats.per,
    },
  ];

  const nextLvlExp = expForNextLevel(state.level);

  let rank = "E-RANK";
  if (state.level >= 25) rank = "S-RANK";
  else if (state.level >= 20) rank = "A-RANK";
  else if (state.level >= 15) rank = "B-RANK";
  else if (state.level >= 10) rank = "C-RANK";
  else if (state.level >= 5) rank = "D-RANK";

  const hasMonarchItem = gear.armor === "Monarch's Cloak" || gear.accessory === "Shadow Monarch's Crown";
  const playerClass = hasMonarchItem ? "SHADOW MONARCH" : "NECROMANCER";

  const achievementsList = [
    { name: "E-Rank Hunter", desc: "Default rank of all awakened players.", unlocked: true },
    { name: "Awakened", desc: "Unlocks at level 2.", unlocked: state.level >= 2 },
    { name: "Diligent Hunter", desc: "Read at least 10 chapters.", unlocked: state.chaptersRead >= 10 },
    { name: "Iron Will", desc: "Unlock a 7-day reading streak.", unlocked: state.streak >= 7 },
    { name: "Shadow Monarch", desc: "Reach level 25 or acquire the Crown.", unlocked: state.level >= 25 || state.inventory.includes("Shadow Monarch's Crown") },
    { name: "Bibliophile", desc: "Read 500 pages total.", unlocked: state.totalPagesRead >= 500 },
  ];

  return (
    <div className="space-y-4">
      {/* Premium Profile Card */}
      <SysPanel className="relative border-cyan-glow/60 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-cyan-glow/50 animate-sys-scan opacity-60 pointer-events-none" />

        <h2 className="system-font tracking-[0.3em] text-cyan-glow sys-text-glow mb-4">PLAYER STATUS</h2>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="w-full md:w-1/3 flex flex-col items-center justify-center border border-cyan-glow/20 p-4 bg-cyan-glow/5 rounded relative">
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-cyan-glow/60 shadow-[0_0_15px_rgba(6,182,212,0.4)] relative group mb-2 bg-black/50 flex items-center justify-center">
              <img
                src={currentPortrait}
                alt="Sung Jin-Woo Portrait"
                className="w-full h-full object-cover scale-[1.5] origin-center transition-transform duration-500 group-hover:scale-[1.65]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 pointer-events-none" />
            </div>
            <div className="text-sm system-font text-cyan-glow font-semibold tracking-widest text-center truncate w-full">
              {state.playerName}
            </div>
            <div className="text-[10px] system-font text-cyan-glow/60 tracking-widest mt-1 text-center border border-cyan-glow/20 px-2 py-0.5 rounded">
              [{state.equippedTitle || "NO TITLE"}]
            </div>
            <div className="w-full border-t border-cyan-glow/25 mt-4 pt-3 flex flex-col gap-1.5 text-center">
              <div>
                <span className="text-[9px] text-muted-foreground system-font tracking-widest block">HUNTER RANK</span>
                <span className="text-base system-font sys-text-gold tracking-widest font-bold font-mono text-center block">
                  {rank}
                </span>
              </div>
              <div className="mt-1">
                <span className="text-[9px] text-muted-foreground system-font tracking-widest block">PLAYER CLASS</span>
                <span className="text-[11px] system-font text-cyan-glow tracking-widest font-bold block">
                  {playerClass}
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-between border border-cyan-glow/20 p-3 bg-cyan-glow/5">
            <h4 className="text-[10px] system-font tracking-[0.2em] text-cyan-glow/80 border-b border-cyan-glow/20 pb-1 mb-2">EQUIPPED GEAR</h4>

            <div className="grid grid-cols-3 gap-2">
              <div className="border border-cyan-glow/20 bg-black/40 p-2 flex flex-col items-center justify-center rounded">
                <div className="text-[8px] text-muted-foreground system-font tracking-widest">WEAPON</div>
                <div className="h-10 flex items-center justify-center mt-1">
                  {gear.weapon ? <Flame className="w-6 h-6 text-cyan-glow" /> : <Sparkles className="w-6 h-6 text-cyan-glow/20" />}
                </div>
                <div className="text-[8px] text-cyan-glow/80 system-font truncate w-full text-center mt-1">
                  {gear.weapon || "EMPTY"}
                </div>
              </div>
              <div className="border border-cyan-glow/20 bg-black/40 p-2 flex flex-col items-center justify-center rounded">
                <div className="text-[8px] text-muted-foreground system-font tracking-widest">ARMOR</div>
                <div className="h-10 flex items-center justify-center mt-1">
                  {gear.armor ? <Shield className="w-6 h-6 text-cyan-glow" /> : <Sparkles className="w-6 h-6 text-cyan-glow/20" />}
                </div>
                <div className="text-[8px] text-cyan-glow/80 system-font truncate w-full text-center mt-1">
                  {gear.armor || "EMPTY"}
                </div>
              </div>
              <div className="border border-cyan-glow/20 bg-black/40 p-2 flex flex-col items-center justify-center rounded">
                <div className="text-[8px] text-muted-foreground system-font tracking-widest">ACCESSORY</div>
                <div className="h-10 flex items-center justify-center mt-1">
                  {gear.accessory ? <Gem className="w-6 h-6 text-cyan-glow" /> : <Sparkles className="w-6 h-6 text-cyan-glow/20" />}
                </div>
                <div className="text-[8px] text-cyan-glow/80 system-font truncate w-full text-center mt-1">
                  {gear.accessory || "EMPTY"}
                </div>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex justify-between text-[10px] system-font text-cyan-glow/70 tracking-widest mb-1">
                <span>EXP PROGRESS</span>
                <span>{state.exp} / {nextLvlExp} ({Math.floor((state.exp / nextLvlExp) * 100)}%)</span>
              </div>
              <SysBar value={state.exp} max={nextLvlExp} color="cyan" />
            </div>
          </div>
        </div>
      </SysPanel>

      {/* Core Stats Points Allocation Panel */}
      <SysPanel>
        <div className="flex justify-between items-center border-b border-cyan-glow/20 pb-2 mb-3">
          <h3 className="system-font tracking-[0.2em] text-cyan-glow text-sm sys-text-glow">CORE ABILITY SCORES</h3>
          {state.statPoints > 0 && (
            <span className="text-[10px] border border-cyan-glow/50 px-2 py-1 system-font text-cyan-glow bg-cyan-glow/10 animate-pulse">
              POINTS AVAILABLE: {state.statPoints}
            </span>
          )}
        </div>

        <div className="space-y-3">
          {statsList.map((st) => {
            const currentVal = statsWithGear[st.key];
            const hasUnused = state.statPoints > 0;
            return (
              <div key={st.key} className="sys-panel !p-3 border border-cyan-glow/30 hover:border-cyan-glow/60 transition-all flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="system-font text-cyan-glow font-bold text-sm tracking-widest block">{st.abbr}</span>
                    <span className="text-muted-foreground text-xs system-font font-mono">— {st.name}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/90 system-font mt-1 leading-normal">
                    {st.desc}
                  </p>
                </div>
                <div className="flex items-center justify-end gap-3 shrink-0">
                  <div className="text-right shrink-0">
                    <span className="text-2xl system-font font-bold sys-text-glow">{currentVal}</span>
                    {st.bonus > 0 && (
                      <span className="text-xs sys-text-gold font-mono ml-1.5" title="Gear Bonus">
                        (+{st.bonus})
                      </span>
                    )}
                  </div>
                  {hasUnused && (
                    <button
                      onClick={() => {
                        beep(880, 0.05);
                        allocateStatPoint(st.key);
                      }}
                      className="w-8 h-8 flex items-center justify-center border border-cyan-glow bg-cyan-glow/10 text-cyan-glow hover:bg-cyan-glow/20 text-lg font-bold system-font rounded"
                      title="Spend 1 Stat Point"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SysPanel>

      {/* Title Cabinet Selector */}
      <SysPanel>
        <h3 className="system-font tracking-[0.2em] text-cyan-glow text-sm mb-3 sys-text-glow">TITLES CABINET</h3>
        <p className="text-[10px] text-muted-foreground system-font tracking-wide mb-3">
          Achievements unlock special titles. Equip them to customize your profile!
        </p>

        <div className="grid grid-cols-2 gap-2">
          {achievementsList.map((a) => {
            const isEquipped = state.equippedTitle === a.name;
            return (
              <button
                key={a.name}
                disabled={!a.unlocked}
                onClick={() => {
                  if (a.unlocked && !isEquipped) {
                    beep(800, 0.05);
                    equipTitle(a.name);
                  }
                }}
                className={`border p-2.5 text-left transition-all ${isEquipped
                  ? "border-cyan-glow bg-cyan-glow/15 text-cyan-glow"
                  : a.unlocked
                    ? "border-cyan-glow/40 hover:border-cyan-glow/85 hover:bg-cyan-glow/5 text-cyan-glow/70"
                    : "border-cyan-glow/10 opacity-30 cursor-not-allowed"
                  }`}
              >
                <div className="text-xs font-semibold system-font tracking-wider flex items-center gap-1.5">
                  {a.name}
                  {isEquipped && <span className="text-[8px] bg-cyan-glow/20 px-1 py-0.5 rounded text-cyan-glow">ACTIVE</span>}
                </div>
                <div className="text-[8px] text-muted-foreground system-font mt-1 leading-normal truncate">
                  {a.desc}
                </div>
              </button>
            );
          })}
        </div>
      </SysPanel>

      {/* Lifetime Stats */}
      <SysPanel>
        <h3 className="system-font tracking-[0.2em] text-cyan-glow text-sm mb-3">LIFETIME COMPILATION</h3>
        <div className="grid grid-cols-2 gap-3 text-xs system-font">
          <div className="sys-panel !p-2">
            <span className="text-muted-foreground block text-[9px]">CHAPTERS CLEARED</span>
            <span className="text-base sys-text-gold font-bold">{state.chaptersRead}</span>
          </div>
          <div className="sys-panel !p-2">
            <span className="text-muted-foreground block text-[9px]">TOTAL PAGES SCROLLED</span>
            <span className="text-base sys-text-gold font-bold">{state.totalPagesRead}</span>
          </div>
          <div className="sys-panel !p-2">
            <span className="text-muted-foreground block text-[9px]">TIME UNDER COMPREHENSION</span>
            <span className="text-base sys-text-gold font-bold">{Math.floor(state.totalReadingMs / 60000)} min</span>
          </div>
          <div className="sys-panel !p-2">
            <span className="text-muted-foreground block text-[9px]">DAILY RUN STREAK</span>
            <span className="text-base sys-text-gold font-bold">{state.streak} days</span>
          </div>
        </div>
      </SysPanel>
    </div>
  );
}

// ---------- History ----------
function HistoryView({
  game,
  chapters,
  onOpen,
}: {
  game: ReturnType<typeof useGameState>;
  chapters: Chapter[];
  onOpen: (id: string) => void;
}) {
  const entries = Object.entries(game.state.progress)
    .sort((a, b) => b[1].lastReadAt - a[1].lastReadAt)
    .slice(0, 40);
  return (
    <div className="space-y-4">
      <SysPanel>
        <h2 className="system-font tracking-[0.3em] text-cyan-glow sys-text-glow">READING HISTORY</h2>
      </SysPanel>
      <SysPanel>
        {entries.length === 0 && (
          <div className="text-center text-cyan-glow/60 system-font py-6 tracking-widest">[ NO HISTORY YET ]</div>
        )}
        <div className="space-y-2">
          {entries.map(([id, p]) => {
            const c = chapters.find((x) => x.id === id);
            if (!c) return null;
            return (
              <button
                key={id}
                onClick={() => onOpen(id)}
                className="w-full text-left border border-cyan-glow/30 hover:border-cyan-glow p-3"
              >
                <div className="system-font text-cyan-glow">{c.title}</div>
                <div className="text-[10px] system-font tracking-widest text-muted-foreground">
                  {new Date(p.lastReadAt).toLocaleString()} · P{p.page + 1}/{p.total} · {p.finished ? "DONE" : `${Math.floor(((p.page + 1) / p.total) * 100)}%`}
                </div>
              </button>
            );
          })}
        </div>
      </SysPanel>
    </div>
  );
}

// ---------- Inventory ----------
function InventoryView({ game }: { game: ReturnType<typeof useGameState> }) {
  const { state } = game;
  const useItem = (game as any).useItem;
  const [tab, setTab] = useState<"shadows" | "items">("shadows");
  const shadowSlots = Array.from({ length: 12 }).map((_, i) => state.shadows[i] ?? null);
  const itemSlots = Array.from({ length: 12 }).map((_, i) => state.inventory[i] ?? null);

  const [activeShadow, setActiveShadow] = useState<string | null>(null);

  const SHADOW_LORE: Record<string, { rank: string; quote: string; desc: string }> = {
    Igris: {
      rank: "Commander Grade",
      desc: "Knight Commander of the Red Knights. First loyal commander of the Monarch.",
      quote: "My sword is yours, my liege. Lead me into battle."
    },
    Iron: {
      rank: "Knight Grade",
      desc: "Formed from the shadow of the hunter Kim Chul. Heavy shield fighter.",
      quote: "*Roars aggressively while banging shields together!*"
    },
    Tank: {
      rank: "Knight Grade",
      desc: "The Alpha Ice Bear shadow beast. Relentless pack warrior.",
      quote: "*Heavy bestial breathing and thunderous steps.*"
    },
    Tusk: {
      rank: "Elite Knight Grade",
      desc: "High Orc Shaman leader. Masters gravity and destructive magic.",
      quote: "Your power flows through my incantations, Monarch."
    },
    Beru: {
      rank: "Marshal Grade",
      desc: "The Ant King of Jeju Island. Extremely fast assassin shadow.",
      quote: "MY KING! Order me, and I shall consume all your enemies!"
    },
    Bellion: {
      rank: "Grand Marshal Grade",
      desc: "Commander of the former Shadow Monarch's original shadow army.",
      quote: "I have waited centuries to serve you, my liege."
    },
    Kaisel: {
      rank: "Knight Grade",
      desc: "The Sky Dragon shadow mount. Flight transport beast.",
      quote: "*High-pitched draconic screeching into the clouds.*"
    },
    Greed: {
      rank: "Elite Knight Grade",
      desc: "Formed from the shadow of the hunter Hwang Dong-Su.",
      quote: "I will crush anyone who dares disrespect the Monarch."
    },
    Kamish: {
      rank: "Dragon Grade",
      desc: "The greatest dragon shadow, briefly summoned with overwhelming authority.",
      quote: "Your magic feels... warm, master of shadows."
    },
    Fangs: {
      rank: "Elite Knight Grade",
      desc: "Giant orc shadow warrior wielding massive dual-axes.",
      quote: "*Deep grunting as weapons slice through steel.*"
    }
  };

  const getItemIcon = (name: string) => {
    if (name === "High-Grade Potion" || name === "Blessed Elixir of Life") return <Flame className="w-8 h-8 text-cyan-glow animate-pulse" />;
    if (name === "Mana Crystal") return <Sparkles className="w-8 h-8 text-cyan-glow" />;
    if (name === "Elixir of Focus") return <Flame className="w-8 h-8 text-cyan-glow animate-sys-pulse" />;
    if (name === "Rune of Reading") return <FileText className="w-8 h-8 text-cyan-glow" />;
    if (name === "Shadow Sigil") return <Gem className="w-8 h-8 text-cyan-glow" />;
    if (name === "Monarch's Cloak") return <Shield className="w-8 h-8 text-cyan-glow" />;
    if (name === "Red Knight's Armor") return <Shield className="w-8 h-8 text-cyan-glow text-red-500" />;
    if (name === "Shadow Monarch's Crown") return <Gem className="w-8 h-8 text-cyan-glow animate-sys-pulse" />;
    return <Sparkles className="w-8 h-8 text-cyan-glow" />;
  };

  const isEquipped = (itemName: string) => {
    const gear = state.equippedGear;
    if (!gear) return false;
    return gear.weapon === itemName || gear.armor === itemName || gear.accessory === itemName;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => {
            beep(720, 0.05);
            setTab("shadows");
            setActiveShadow(null);
          }}
          className={`flex-1 py-2 text-xs system-font tracking-widest border transition-all ${tab === "shadows" ? "border-cyan-glow bg-cyan-glow/10 text-cyan-glow" : "border-cyan-glow/30 text-cyan-glow/60"
            }`}
        >
          SHADOW ARMY ({state.shadows.length})
        </button>
        <button
          onClick={() => {
            beep(720, 0.05);
            setTab("items");
            setActiveShadow(null);
          }}
          className={`flex-1 py-2 text-xs system-font tracking-widest border transition-all ${tab === "items" ? "border-cyan-glow bg-cyan-glow/10 text-cyan-glow" : "border-cyan-glow/30 text-cyan-glow/60"
            }`}
        >
          ITEM INVENTORY ({state.inventory.length})
        </button>
      </div>

      {tab === "shadows" ? (
        <div className="space-y-4">
          <SysPanel>
            <h2 className="system-font tracking-[0.3em] text-cyan-glow sys-text-glow text-sm">SHADOW ARMY</h2>
            <p className="text-[10px] text-muted-foreground system-font tracking-wide mt-1">
              Extract shadow soldiers as you level up. Every 3 levels expands your ranks. Tap any unlocked soldier to Arise them!
            </p>
          </SysPanel>

          {activeShadow && (
            <SysPanel className="border-[color:var(--color-gold-glow)]/70 animate-sys-slide-in relative">
              <button
                onClick={() => setActiveShadow(null)}
                className="absolute top-2 right-2 text-xs text-cyan-glow/60 hover:text-cyan-glow"
              >
                CLOSE
              </button>
              <div className="flex gap-3">
                <Ghost className="w-12 h-12 text-cyan-glow animate-sys-pulse shrink-0" />
                <div>
                  <h4 className="system-font text-sm text-cyan-glow tracking-[0.2em] font-semibold">{activeShadow.toUpperCase()}</h4>
                  <div className="text-[9px] sys-text-gold system-font tracking-wider mt-0.5">
                    {SHADOW_LORE[activeShadow]?.rank || "Shadow Soldier"}
                  </div>
                  <p className="text-[10px] text-muted-foreground system-font mt-2 leading-relaxed">
                    {SHADOW_LORE[activeShadow]?.desc || "A faithful shadow soldier aligned to serve the Monarch."}
                  </p>
                  <div className="mt-3 border-l border-cyan-glow/40 pl-2 text-[10px] italic text-cyan-glow/85">
                    "{SHADOW_LORE[activeShadow]?.quote || "ARISE."}"
                  </div>
                </div>
              </div>
            </SysPanel>
          )}

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {shadowSlots.map((s, i) => (
              <button
                key={i}
                disabled={!s}
                onClick={() => {
                  if (s) {
                    beep(440, 0.1);
                    setActiveShadow(s);
                  }
                }}
                className={`sys-panel aspect-square flex flex-col items-center justify-center transition-all ${s
                  ? "border-cyan-glow/40 hover:border-cyan-glow hover:bg-cyan-glow/5"
                  : "opacity-30 border-cyan-glow/10 cursor-default"
                  }`}
              >
                <Ghost className={`w-8 h-8 ${s ? "text-cyan-glow animate-sys-pulse" : "text-cyan-glow/40"}`} />
                <div className="text-[9px] system-font tracking-widest mt-2 text-cyan-glow truncate w-full text-center px-1 font-semibold">
                  {s ?? "LOCKED"}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <SysPanel>
            <h2 className="system-font tracking-[0.3em] text-cyan-glow sys-text-glow text-sm">ITEM SLOTS</h2>
            <p className="text-[10px] text-muted-foreground system-font tracking-wide mt-1">
              Tap any consumable item to activate its restoration effects. Tap weapons/armor to equip them to your Profile.
            </p>
          </SysPanel>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {itemSlots.map((item, i) => {
              const equipped = item ? isEquipped(item) : false;
              const itemDef = item ? SHOP_ITEMS.find(x => x.name === item) : null;
              const isConsumable = itemDef?.type === "consumable";
              return (
                <button
                  key={i}
                  disabled={!item}
                  onClick={() => {
                    if (item) {
                      beep(600, 0.05);
                      useItem(item);
                    }
                  }}
                  className={`sys-panel aspect-square flex flex-col items-center justify-center transition-all relative ${equipped
                    ? "border-[color:var(--color-gold-glow)] bg-cyan-glow/5 shadow-[0_0_10px_rgba(212,175,55,0.2)]"
                    : item
                      ? "border-cyan-glow/45 hover:border-cyan-glow hover:bg-cyan-glow/5"
                      : "opacity-30 border-cyan-glow/10 cursor-default"
                    }`}
                >
                  {item ? (
                    <>
                      {equipped && (
                        <div className="absolute top-1 right-1 text-[7px] system-font bg-cyan-glow/20 px-1 py-0.5 rounded text-cyan-glow">
                          EQ
                        </div>
                      )}
                      {getItemIcon(item)}
                      <div className="text-[9px] system-font tracking-wider mt-2 text-cyan-glow text-center truncate px-1 w-full font-semibold">
                        {item}
                      </div>
                      <div className="text-[7px] text-muted-foreground system-font mt-0.5 uppercase tracking-widest text-center truncate w-full px-1">
                        {isConsumable ? "Use" : "Equip"}
                      </div>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-8 h-8 text-cyan-glow/25" />
                      <div className="text-[10px] system-font tracking-widest mt-2 text-cyan-glow/40">
                        EMPTY
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Achievements ----------
function AchievementsView({ game }: { game: ReturnType<typeof useGameState> }) {
  const { state } = game;
  const list = [
    { id: "a1", name: "Awakened", desc: "Reach Level 2", unlocked: state.level >= 2 },
    { id: "a2", name: "Necromancer", desc: "Extract your first shadow", unlocked: state.shadows.length >= 1 },
    { id: "a3", name: "Diligent Hunter", desc: "Read 10 chapters", unlocked: state.chaptersRead >= 10 },
    { id: "a4", name: "Iron Will", desc: "Reach 7-day streak", unlocked: state.streak >= 7 },
    { id: "a5", name: "Shadow Monarch", desc: "Reach Level 25", unlocked: state.level >= 25 },
    { id: "a6", name: "Bibliophile", desc: "Read 500 pages", unlocked: state.totalPagesRead >= 500 },
  ];
  return (
    <div className="space-y-3">
      <SysPanel>
        <h2 className="system-font tracking-[0.3em] text-cyan-glow sys-text-glow">ACHIEVEMENTS</h2>
      </SysPanel>
      {list.map((a) => (
        <SysPanel key={a.id} className={a.unlocked ? "" : "opacity-50"}>
          <div className="flex items-center gap-3">
            <Trophy className={`w-6 h-6 ${a.unlocked ? "sys-text-gold" : "text-cyan-glow/40"}`} style={a.unlocked ? { color: "var(--color-gold-glow)", filter: "drop-shadow(0 0 6px var(--color-gold-glow))" } : {}} />
            <div className="flex-1">
              <div className="system-font tracking-widest text-cyan-glow">{a.name}</div>
              <div className="text-xs text-muted-foreground system-font">{a.desc}</div>
            </div>
            <div className="text-[10px] system-font tracking-widest">
              {a.unlocked ? <span className="sys-text-gold">UNLOCKED</span> : <span className="text-cyan-glow/40">LOCKED</span>}
            </div>
          </div>
        </SysPanel>
      ))}
    </div>
  );
}

// ---------- Shop ----------
function ShopView({ game }: { game: ReturnType<typeof useGameState> }) {
  const { state, buyItem } = game;
  return (
    <div className="space-y-4">
      <SysPanel>
        <div className="flex justify-between items-center">
          <h2 className="system-font tracking-[0.3em] text-cyan-glow sys-text-glow">SHOP</h2>
          <span className="sys-text-gold system-font font-semibold">{state.gold} GOLD</span>
        </div>
        <p className="text-xs text-muted-foreground system-font mt-2 tracking-wide">
          Trade gold earned from dungeon sweeps and daily quests. Purchased weapons and armor can be equipped in your profile to boost stats.
        </p>
      </SysPanel>

      {SHOP_ITEMS.map((item) => {
        const isGear = item.type !== "consumable";
        const owned = isGear && state.inventory.includes(item.name);
        const canAfford = state.gold >= item.cost;

        return (
          <SysPanel key={item.name}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="system-font text-cyan-glow tracking-widest font-semibold flex items-center gap-1.5">
                  {item.name}
                  <span className="text-[7px] border border-cyan-glow/30 px-1 py-0.5 uppercase tracking-widest text-cyan-glow/70 rounded">
                    {item.type}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground system-font mt-1 leading-normal">
                  {item.desc}
                </div>
                {item.bonuses && (
                  <div className="text-[9px] sys-text-gold system-font tracking-wide mt-1.5 uppercase">
                    STATS: {Object.entries(item.bonuses).map(([stat, val]) => `+${val} ${stat.toUpperCase()}`).join(", ")}
                  </div>
                )}
              </div>
              <SysBtn
                onClick={() => {
                  beep(880, 0.05);
                  buyItem(item.name, item.cost);
                }}
                disabled={owned || !canAfford}
              >
                {owned ? "OWNED" : `${item.cost} GOLD`}
              </SysBtn>
            </div>
          </SysPanel>
        );
      })}
    </div>
  );
}
