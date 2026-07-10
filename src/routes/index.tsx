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
} from "lucide-react";
import {
  listChapters,
  saveChapter,
  getPages,
  deleteChapter,
  updateChapterMeta,
  parseFilename,
  type Chapter,
} from "@/lib/db";
import { useGameState, expForNextLevel } from "@/lib/store";
import { generateSamplePages } from "@/lib/sample-pages";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "System — Solo Leveling Reader" },
      {
        name: "description",
        content:
          "Offline Solo Leveling manhwa reader with a System-style gamified progress tracker. Level up as you read.",
      },
      { property: "og:title", content: "System — Solo Leveling Reader" },
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
  } catch {}
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

  const reloadChapters = useCallback(async () => {
    const c = await listChapters();
    setChapters(c);
  }, []);

  useEffect(() => {
    reloadChapters();
  }, [reloadChapters, refreshTick]);

  // Seed sample chapter on first run
  useEffect(() => {
    if (!game.hydrated) return;
    if (game.state.onboarded) return;
    (async () => {
      const existing = await listChapters();
      if (existing.length === 0) {
        // Seed 5 sample chapters across 2 volumes so the library/reader work immediately.
        const seeds: { volume: number; order: number; title: string }[] = [
          { volume: 1, order: 1, title: "Sample Chapter 1 — The Weakest Hunter" },
          { volume: 1, order: 2, title: "Sample Chapter 2 — Double Dungeon" },
          { volume: 1, order: 3, title: "Sample Chapter 3 — The System" },
          { volume: 2, order: 4, title: "Sample Chapter 4 — Daily Quest" },
          { volume: 2, order: 5, title: "Sample Chapter 5 — Re-Awakening" },
        ];
        for (const s of seeds) {
          const pages = await generateSamplePages(`Volume ${s.volume} · Chapter ${s.order}`, 6);
          await saveChapter(
            {
              id: crypto.randomUUID(),
              title: s.title,
              volume: s.volume,
              order: s.order,
              pageCount: pages.length,
              createdAt: Date.now(),
            },
            pages,
          );
        }
        setRefreshTick((n) => n + 1);
      }
      game.finishOnboarding();
    })();
  }, [game.hydrated, game.state.onboarded, game]);

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
            onOpen={openReader}
            onImport={async () => setRefreshTick((n) => n + 1)}
            onDelete={async (id) => {
              await deleteChapter(id);
              setRefreshTick((n) => n + 1);
            }}
            notify={notify}
          />
        )}
        {view === "reader" && readingChapter && (
          <ReaderView
            chapterId={readingChapter}
            progress={game.state.progress[readingChapter]}
            onPage={(p, total, ms) => game.recordPageRead(readingChapter, p, total, ms)}
            onBookmark={game.bookmark}
            onBack={() => setView("library")}
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
      <SystemNavButton onClick={() => setNavOpen(true)} />

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
        className="pointer-events-auto relative w-20 h-20 rounded-full flex items-center justify-center animate-sys-pulse"
        style={{
          background: "radial-gradient(circle, oklch(0.20 0.10 240 / 0.9), oklch(0.08 0.03 260 / 0.95))",
          border: "2px solid var(--color-cyan-glow)",
          boxShadow:
            "0 0 24px var(--color-cyan-glow), inset 0 0 24px oklch(0.65 0.22 230 / 0.4)",
        }}
        aria-label="Open System menu"
      >
        <Menu className="w-8 h-8 text-cyan-glow" style={{ filter: "drop-shadow(0 0 6px var(--color-cyan-glow))" }} />
        <span className="absolute -bottom-6 text-[10px] tracking-[0.3em] text-cyan-glow system-font">SYSTEM</span>
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
                className={`flex items-center gap-3 px-4 py-3 text-left transition-all border ${
                  active
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
  useEffect(() => setName(state.playerName), [state.playerName]);
  const expNext = expForNextLevel(state.level);

  return (
    <div className="space-y-4">
      <SysPanel>
        <div className="flex items-center justify-between">
          <div>
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
                className="bg-transparent border-b border-cyan-glow/60 outline-none text-2xl system-font sys-text-glow"
              />
            ) : (
              <h1
                className="text-2xl system-font sys-text-glow cursor-pointer"
                onClick={() => setEditing(true)}
              >
                {state.playerName}
              </h1>
            )}
            <div className="text-xs text-muted-foreground mt-1 system-font tracking-widest">
              CLASS · <span className="sys-text-gold">SHADOW MONARCH</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] tracking-[0.4em] text-cyan-glow/80 system-font">LEVEL</div>
            <div className="text-5xl system-font sys-text-glow font-bold">{state.level}</div>
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

      <SysPanel>
        <div className="flex items-center justify-between mb-3">
          <h3 className="system-font tracking-[0.3em] text-cyan-glow text-sm">DAILY QUESTS</h3>
          <button className="text-xs text-cyan-glow/70 system-font tracking-widest" onClick={() => onGoto("quests")}>
            VIEW ALL ›
          </button>
        </div>
        <div className="space-y-2">
          {state.quests.filter((q) => q.type === "daily").map((q) => (
            <button
              key={q.id}
              onClick={() => !q.done && completeQuest(q.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 border text-left transition-all ${
                q.done ? "border-cyan-glow/20 opacity-50" : "border-cyan-glow/40 hover:border-cyan-glow hover:bg-cyan-glow/5"
              }`}
            >
              <div
                className={`w-4 h-4 border flex items-center justify-center ${q.done ? "bg-cyan-glow/40 border-cyan-glow" : "border-cyan-glow"}`}
              >
                {q.done && <span className="text-[10px] sys-text-glow">✓</span>}
              </div>
              <span className={`flex-1 text-sm system-font tracking-wide ${q.done ? "line-through" : ""}`}>{q.text}</span>
              <span className="text-xs sys-text-gold system-font">+{q.reward} EXP</span>
            </button>
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
  onOpen,
  onImport,
  onDelete,
  notify,
}: {
  chapters: Chapter[];
  progress: Record<string, { page: number; total: number; finished: boolean; lastReadAt: number }>;
  onOpen: (id: string) => void;
  onImport: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  notify: (m: string, k?: any) => void;
}) {
  const imgInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{
    label: string;
    current: number;
    total: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImages = async (files: FileList) => {
    if (!files.length) return;
    setImportError(null);
    try {
      const arr = Array.from(files).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
      const invalid = arr.filter((f) => !f.type.startsWith("image/"));
      if (invalid.length) {
        throw new Error(`Unsupported file: ${invalid[0].name}. Only images allowed here.`);
      }
      setUploading({ label: "IMPORTING IMAGES", current: 0, total: arr.length });
      const pages: Blob[] = [];
      for (let i = 0; i < arr.length; i++) {
        pages.push(arr[i]);
        setUploading({ label: "IMPORTING IMAGES", current: i + 1, total: arr.length });
      }
      const meta = parseFilename(arr[0].name);
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
      notify(`Chapter imported (${pages.length} pages)`, "info");
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
        <h2 className="system-font tracking-[0.3em] text-cyan-glow sys-text-glow">LIBRARY</h2>
        <p className="text-xs text-muted-foreground mt-1 system-font tracking-wide">
          Add your Solo Leveling chapters as images or PDFs. Filenames like "Vol-01-Ch-003" are auto-organized.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <SysBtn onClick={() => imgInputRef.current?.click()}>
            <ImageIcon className="w-4 h-4 inline mr-2" /> IMPORT IMAGES
          </SysBtn>
          <SysBtn onClick={() => pdfInputRef.current?.click()}>
            <FileText className="w-4 h-4 inline mr-2" /> IMPORT PDF
          </SysBtn>
          <input
            ref={imgInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleImages(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={pdfInputRef}
            type="file"
            multiple
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handlePdfs(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {uploading && (
          <div className="mt-3 sys-panel !p-3">
            <div className="text-xs system-font text-cyan-glow tracking-widest mb-1">
              [SYSTEM] {uploading.label} · {uploading.current}/{uploading.total}
            </div>
            <SysBar value={uploading.current} max={Math.max(uploading.total, 1)} />
          </div>
        )}
        {importError && !uploading && (
          <div className="mt-3 sys-panel !p-3 !border-[color:var(--color-danger-glow)]/60">
            <div className="text-xs system-font tracking-widest sys-text-danger">
              [SYSTEM · ERROR] {importError}
            </div>
            <button
              onClick={() => setImportError(null)}
              className="mt-1 text-[10px] system-font tracking-widest text-cyan-glow/60 hover:text-cyan-glow"
            >
              DISMISS
            </button>
          </div>
        )}
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
  progress,
  onPage,
  onBookmark,
  onBack,
}: {
  chapterId: string;
  progress?: { page: number; total: number };
  onPage: (page: number, total: number, ms: number) => void;
  onBookmark: () => void;
  onBack: () => void;
}) {
  const [pages, setPages] = useState<{ id: string; url: string; order: number }[]>([]);
  const [zoom, setZoom] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [nightMode, setNightMode] = useState(true);
  const [autoScroll, setAutoScroll] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState(2);
  const [currentPage, setCurrentPage] = useState(progress?.page ?? 0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef<number>(Date.now());
  const lastPageRef = useRef<number>(progress?.page ?? 0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await getPages(chapterId);
      if (!alive) return;
      const urls = list.map((p) => ({ id: p.id, url: URL.createObjectURL(p.blob), order: p.order }));
      setPages(urls);
    })();
    return () => {
      alive = false;
      setPages((old) => {
        old.forEach((p) => URL.revokeObjectURL(p.url));
        return [];
      });
    };
  }, [chapterId]);

  // Restore scroll after images render
  useEffect(() => {
    if (pages.length && progress?.page) {
      const el = document.getElementById(`page-${progress.page}`);
      el?.scrollIntoView({ block: "start" });
    }
  }, [pages.length, progress?.page]);

  // Track current page via IntersectionObserver
  useEffect(() => {
    if (!pages.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            if (!isNaN(idx) && idx !== lastPageRef.current) {
              lastPageRef.current = idx;
              setCurrentPage(idx);
              const ms = Date.now() - startedAt.current;
              startedAt.current = Date.now();
              onPage(idx, pages.length, ms);
            }
          }
        });
      },
      { threshold: 0.5 },
    );
    document.querySelectorAll("[data-page-el]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pages, onPage]);

  // Auto scroll
  useEffect(() => {
    if (!autoScroll) return;
    const id = setInterval(() => {
      window.scrollBy({ top: autoSpeed * 3, behavior: "auto" });
    }, 30);
    return () => clearInterval(id);
  }, [autoScroll, autoSpeed]);

  const pct = pages.length ? Math.floor(((currentPage + 1) / pages.length) * 100) : 0;

  return (
    <div>
      {/* Top bar */}
      <div className="sticky top-0 z-30 -mx-4 px-4 py-2 backdrop-blur-md bg-background/70 border-b border-cyan-glow/30">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="sys-btn !py-2 !px-3">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <div className="text-[10px] system-font tracking-widest text-cyan-glow/70">
              PAGE {currentPage + 1} / {pages.length || "…"}
            </div>
            <SysBar value={currentPage + 1} max={Math.max(pages.length, 1)} color="gold" />
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

      {/* Pager: previous / next page */}
      {pages.length > 0 && (
        <div className="sticky bottom-28 z-30 mt-4 flex justify-between gap-2 px-1">
          <button
            className="sys-btn !py-2 !px-3 flex items-center gap-1"
            disabled={currentPage <= 0}
            onClick={() => {
              const target = Math.max(0, currentPage - 1);
              document.getElementById(`page-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <ChevronLeft className="w-4 h-4" /> PREV
          </button>
          <div className="sys-panel !p-2 !px-3 text-[10px] system-font tracking-widest text-cyan-glow/80 self-center">
            {currentPage + 1} / {pages.length}
          </div>
          <button
            className="sys-btn !py-2 !px-3 flex items-center gap-1"
            disabled={currentPage >= pages.length - 1}
            onClick={() => {
              const target = Math.min(pages.length - 1, currentPage + 1);
              document.getElementById(`page-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            NEXT <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Quests ----------
function QuestsView({ game }: { game: ReturnType<typeof useGameState> }) {
  const { state, completeQuest } = game;
  const sections: { title: string; type: "daily" | "weekly" | "main" }[] = [
    { title: "DAILY QUESTS", type: "daily" },
    { title: "WEEKLY QUESTS", type: "weekly" },
    { title: "MAIN STORY", type: "main" },
  ];
  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <SysPanel key={s.type}>
          <h3 className="system-font tracking-[0.3em] text-cyan-glow text-sm mb-3 sys-text-glow">{s.title}</h3>
          <div className="space-y-2">
            {state.quests.filter((q) => q.type === s.type).map((q) => (
              <button
                key={q.id}
                onClick={() => !q.done && s.type !== "main" && completeQuest(q.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 border text-left ${
                  q.done ? "border-cyan-glow/20 opacity-60" : "border-cyan-glow/40"
                }`}
              >
                <div className={`w-4 h-4 border ${q.done ? "bg-cyan-glow/40 border-cyan-glow" : "border-cyan-glow"}`} />
                <span className={`flex-1 text-sm system-font ${q.done ? "line-through" : ""}`}>{q.text}</span>
                <span className="text-xs sys-text-gold system-font">+{q.reward}</span>
              </button>
            ))}
          </div>
        </SysPanel>
      ))}
    </div>
  );
}

// ---------- Stats ----------
function StatsView({ game }: { game: ReturnType<typeof useGameState> }) {
  const { state } = game;
  const stats = [
    ["STR", state.stats.str, "Strength"],
    ["AGI", state.stats.agi, "Agility"],
    ["VIT", state.stats.vit, "Vitality"],
    ["INT", state.stats.int, "Intelligence"],
    ["PER", state.stats.per, "Perception"],
  ] as const;
  return (
    <div className="space-y-4">
      <SysPanel>
        <h2 className="system-font tracking-[0.3em] text-cyan-glow sys-text-glow">STATS</h2>
        <div className="grid grid-cols-2 gap-2 mt-4">
          {stats.map(([k, v, name]) => (
            <div key={k} className="sys-panel !p-3">
              <div className="text-[10px] system-font tracking-widest text-cyan-glow/70">{name}</div>
              <div className="flex items-baseline justify-between">
                <span className="system-font text-cyan-glow">{k}</span>
                <span className="text-3xl system-font sys-text-glow font-bold">{v}</span>
              </div>
            </div>
          ))}
        </div>
      </SysPanel>
      <SysPanel>
        <h3 className="system-font tracking-widest text-cyan-glow text-sm mb-3">LIFETIME</h3>
        <ul className="text-sm system-font tracking-wide space-y-1 text-cyan-glow/80">
          <li>Chapters read · <span className="sys-text-gold">{state.chaptersRead}</span></li>
          <li>Pages read · <span className="sys-text-gold">{state.totalPagesRead}</span></li>
          <li>Reading time · <span className="sys-text-gold">{Math.floor(state.totalReadingMs / 60000)} min</span></li>
          <li>Current streak · <span className="sys-text-gold">{state.streak} days</span></li>
        </ul>
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
  const slots = Array.from({ length: 12 }).map((_, i) => state.shadows[i] ?? null);
  return (
    <div className="space-y-4">
      <SysPanel>
        <h2 className="system-font tracking-[0.3em] text-cyan-glow sys-text-glow">SHADOW ARMY</h2>
        <p className="text-xs text-muted-foreground system-font tracking-wide mt-1">
          Extract shadows by leveling up. Every 3 levels grants a new soldier.
        </p>
      </SysPanel>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {slots.map((s, i) => (
          <div
            key={i}
            className={`sys-panel aspect-square flex flex-col items-center justify-center ${s ? "" : "opacity-30"}`}
          >
            <Ghost className={`w-10 h-10 ${s ? "text-cyan-glow" : "text-cyan-glow/40"}`} />
            <div className="text-[10px] system-font tracking-widest mt-2 text-cyan-glow">
              {s ?? "LOCKED"}
            </div>
          </div>
        ))}
      </div>
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
  const { state } = game;
  return (
    <div className="space-y-4">
      <SysPanel>
        <div className="flex justify-between items-center">
          <h2 className="system-font tracking-[0.3em] text-cyan-glow sys-text-glow">SHOP</h2>
          <span className="sys-text-gold system-font">{state.gold} GOLD</span>
        </div>
        <p className="text-xs text-muted-foreground system-font mt-2 tracking-wide">
          Trade Gold earned from quests. More items coming as the System evolves.
        </p>
      </SysPanel>
      {["Elixir of Focus", "Rune of Reading", "Shadow Sigil", "Monarch's Cloak"].map((item, i) => (
        <SysPanel key={item}>
          <div className="flex items-center justify-between">
            <div>
              <div className="system-font text-cyan-glow tracking-widest">{item}</div>
              <div className="text-xs text-muted-foreground system-font">Cosmetic · flavor only</div>
            </div>
            <SysBtn disabled>{(i + 1) * 100} GOLD</SysBtn>
          </div>
        </SysPanel>
      ))}
    </div>
  );
}
