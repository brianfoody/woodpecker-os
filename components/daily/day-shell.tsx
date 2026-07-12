"use client";

/**
 * The Daily Drive shell — the opinionated wrapper that turns the freeform
 * canvas engine into a daily practice:
 *
 *   Plan (canvas) → Distill → Drive (todo hub) → one canvas per task
 *   → Reflect (canvas) → Harvest → Masterboards (canvases)
 *
 * Every canvas is a plain TldrawCanvas with its own storageKey, so the
 * magic pen, persistence and connector sync all work unchanged. The shell
 * only adds structure: navigation chrome, the todo list, and the two AI
 * steps (distill / harvest) that move content between surfaces.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createShapeId } from "tldraw";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { createNeonGridTheme, type WoodpeckerCanvasTheme } from "@/lib/woodpecker-theme";
import { toast } from "@/hooks/use-toast";
import {
  addLearningsToBoard,
  addTodo,
  boardCanvasKey,
  carryOverUnfinished,
  createBoard,
  drainBoardInbox,
  findUnfinishedDayBefore,
  getDay,
  loadBoards,
  mergeDistilledTodos,
  planCanvasKey,
  reflectCanvasKey,
  taskCanvasKey,
  todayKey,
  updateDay,
  updateTodo,
  type DayRecord,
  type Masterboard,
  type TodoItem,
} from "@/lib/daily/store";
import { distillPlanToTodos, harvestLearnings } from "@/lib/daily/distill";

const TldrawCanvas = dynamic(() => import("@/components/tldraw-canvas"), {
  ssr: false,
  loading: () => (
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "#0a0a14", color: "#88ccaa", fontFamily: MONO }}>
      Loading canvas...
    </div>
  ),
});

const MONO = "'Share Tech Mono', ui-monospace, monospace";
const BG = "#0a0a14";
const INK = "#cfe8dd";
const DIM = "#5f7a70";
const ACCENT = "#5eead4";
const CARD_BG = "#101622";
const CARD_BORDER = "rgba(94, 234, 212, 0.25)";

type View =
  | { kind: "plan" }
  | { kind: "drive" }
  | { kind: "task"; todoId: string }
  | { kind: "reflect" }
  | { kind: "boards" }
  | { kind: "board"; boardId: string };

const VIEW_KEY = "woodpecker-daily-last-view";

// ── Canvas stamping ─────────────────────────────────────────────────

/** Mirrors the estimate in use-claude-code — autoSize height lands async. */
function estimateCardHeight(text: string, width = 665): number {
  const charsPerLine = Math.max(1, Math.floor((width - 48) / 10));
  let lines = 0;
  for (const para of text.split("\n")) {
    lines += Math.max(1, Math.ceil(para.length / charsPerLine));
  }
  return Math.max(80, lines * 33 + 67);
}

/** Create one themed card on a canvas (task titles, day recap, learnings). */
function stampCard(
  editor: any,
  theme: WoodpeckerCanvasTheme,
  opts: { x: number; y: number; text: string; label: string }
): number {
  const id = createShapeId();
  editor.createShapes([
    {
      id,
      type: "handwritten-text",
      x: opts.x,
      y: opts.y,
      props: {
        text: opts.text,
        font: "sans",
        size: "m",
        color: theme.aiTextColor,
        autoSize: true,
        w: 665,
        h: estimateCardHeight(opts.text),
        cardBg: theme.aiCardBg,
        cardBorder: theme.aiCardBorder,
        cardBorderWidth: theme.aiCardBorderWidth,
        cardRadius: theme.aiCardRadius,
        cardShadow: theme.aiCardShadow,
        cardLabel: opts.label,
        cardLabelColor: theme.aiLabelColor,
        cardFont: theme.aiFont,
        labelFont: theme.labelFont ?? null,
        labelFontSize: theme.labelFontSize ?? null,
        labelFontWeight: theme.labelFontWeight ?? null,
        labelLetterSpacing: theme.labelLetterSpacing ?? null,
        labelUppercase: theme.labelUppercase ?? null,
      },
    },
  ]);
  return estimateCardHeight(opts.text);
}

/** Bottom edge of existing content, so new cards stack below it. */
function contentBottom(editor: any, fallback = 120): number {
  let y = fallback;
  for (const shape of editor.getCurrentPageShapes()) {
    try {
      const b = editor.getShapePageBounds(shape);
      if (b) y = Math.max(y, b.maxY + 40);
    } catch {}
  }
  return y;
}

// ── Shell ───────────────────────────────────────────────────────────

export default function DayShell() {
  const theme = React.useMemo(() => createNeonGridTheme("dark"), []);
  const [date] = useState(() => todayKey());
  const [day, setDay] = useState<DayRecord>(() => getDay(todayKey()));
  const [boards, setBoards] = useState<Masterboard[]>([]);
  const [view, setViewRaw] = useState<View>({ kind: "drive" });
  const [busy, setBusy] = useState<string | null>(null);
  const [harvested, setHarvested] = useState<string[] | null>(null);
  const editorRef = useRef<any>(null);

  const refresh = useCallback(() => {
    setDay(getDay(date));
    setBoards(loadBoards());
  }, [date]);

  // Restore last view (same day only) + load boards
  useEffect(() => {
    refresh();
    try {
      const raw = localStorage.getItem(VIEW_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.date === date && saved.view) setViewRaw(saved.view);
      }
    } catch {}
  }, [date, refresh]);

  // The shell's own font (canvas views load it via the theme, list views don't)
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = theme.googleFontsUrl;
    document.head.appendChild(link);
    return () => link.remove();
  }, [theme]);

  const setView = useCallback(
    (v: View) => {
      editorRef.current = null;
      setViewRaw(v);
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify({ date, view: v }));
      } catch {}
    },
    [date]
  );

  const visibleTodos = day.todos.filter((t) => t.status !== "dropped");

  const openTodo = useCallback(
    (todo: TodoItem) => {
      if (todo.status === "todo") {
        updateTodo(date, todo.id, { status: "active" });
        refresh();
      }
      setView({ kind: "task", todoId: todo.id });
    },
    [date, refresh, setView]
  );

  // ── Canvas seeding / stamping on mount ──
  const handleEditorMount = useCallback(
    (editor: any) => {
      editorRef.current = editor;
      const v = view;

      if (v.kind === "task") {
        const todo = getDay(date).todos.find((t) => t.id === v.todoId);
        if (todo && !todo.seeded && editor.getCurrentPageShapes().length === 0) {
          stampCard(editor, theme, {
            x: 120,
            y: 120,
            text: todo.detail ? `${todo.title}\n\n${todo.detail}` : todo.title,
            label: "TASK",
          });
          updateTodo(date, todo.id, { seeded: true });
          refresh();
        }
      }

      if (v.kind === "reflect") {
        const d = getDay(date);
        if (!d.reflectSeeded && editor.getCurrentPageShapes().length === 0) {
          const done = d.todos.filter((t) => t.status === "done");
          const open = d.todos.filter(
            (t) => t.status === "todo" || t.status === "active"
          );
          const lines = [
            ...done.map((t) => `✓ ${t.title}`),
            ...open.map((t) => `○ ${t.title}`),
          ].join("\n");
          const text =
            `${date} — ${done.length}/${d.todos.length} done` +
            (lines ? `\n\n${lines}` : "") +
            `\n\nWrite up the day. What did you learn? What surprised you?`;
          stampCard(editor, theme, { x: 120, y: 120, text, label: "REFLECT" });
          updateDay(date, (rec) => ({ ...rec, reflectSeeded: true }));
          refresh();
        }
      }

      if (v.kind === "board") {
        const entries = drainBoardInbox(v.boardId);
        if (entries.length > 0) {
          let y = contentBottom(editor);
          for (const entry of entries) {
            const h = stampCard(editor, theme, {
              x: 120,
              y,
              text: entry.text,
              label: `LEARNING · ${entry.date}`,
            });
            y += h + 24;
          }
          refresh();
          toast({
            title: `${entries.length} learning${entries.length === 1 ? "" : "s"} added to this board`,
          });
        }
      }
    },
    [view, date, theme, refresh]
  );

  // ── AI steps ──
  const runDistill = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    setBusy("distilling your day...");
    try {
      const items = await distillPlanToTodos(editor);
      const added = mergeDistilledTodos(date, items);
      refresh();
      toast({
        title:
          added.length > 0
            ? `${added.length} task${added.length === 1 ? "" : "s"} added to your drive`
            : "No new tasks found in the plan",
      });
      if (added.length > 0) setView({ kind: "drive" });
    } catch (error) {
      toast({
        title: "Distill failed",
        description: error instanceof Error ? error.message : "Is your connector running?",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }, [date, refresh, setView]);

  const runHarvest = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    setBusy("harvesting learnings...");
    try {
      const learnings = await harvestLearnings(editor);
      if (learnings.length === 0) {
        toast({ title: "No durable learnings found in the reflection" });
      } else {
        setHarvested(learnings);
      }
    } catch (error) {
      toast({
        title: "Harvest failed",
        description: error instanceof Error ? error.message : "Is your connector running?",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }, []);

  const sendToBoard = useCallback(
    (boardId: string | null, newName: string) => {
      if (!harvested) return;
      let target = boardId ? boards.find((b) => b.id === boardId) : undefined;
      if (!target && newName.trim()) {
        target = createBoard(newName);
      }
      if (!target) return;
      addLearningsToBoard(target.id, date, harvested);
      setHarvested(null);
      refresh();
      toast({
        title: `${harvested.length} learning${harvested.length === 1 ? "" : "s"} → ${target.name}`,
        description: "They'll appear on the board next time you open it.",
      });
    },
    [harvested, boards, date, refresh]
  );

  // ── Render ──
  const isCanvasView =
    view.kind === "plan" ||
    view.kind === "task" ||
    view.kind === "reflect" ||
    view.kind === "board";

  const currentTask =
    view.kind === "task"
      ? day.todos.find((t) => t.id === view.todoId)
      : undefined;
  const currentBoard =
    view.kind === "board" ? boards.find((b) => b.id === view.boardId) : undefined;

  return (
    <div style={{ position: "fixed", inset: 0, background: BG }}>
      {isCanvasView && (
        <TldrawCanvas
          key={canvasKeyFor(view, date)}
          storageKey={canvasKeyFor(view, date)}
          theme={theme}
          darkMode
          onEditorMount={handleEditorMount}
        />
      )}

      {view.kind === "drive" && (
        <DriveView
          date={date}
          todos={visibleTodos}
          onOpen={openTodo}
          onToggle={(t) => {
            updateTodo(date, t.id, {
              status: t.status === "done" ? "todo" : "done",
            });
            refresh();
          }}
          onDrop={(t) => {
            updateTodo(date, t.id, { status: "dropped" });
            refresh();
          }}
          onAdd={(title) => {
            addTodo(date, title);
            refresh();
          }}
          onCarryOver={(fromDate) => {
            const carried = carryOverUnfinished(fromDate, date);
            refresh();
            toast({
              title: `${carried.length} task${carried.length === 1 ? "" : "s"} carried over from ${fromDate}`,
            });
          }}
        />
      )}

      {view.kind === "boards" && (
        <BoardsView
          boards={boards}
          onOpen={(b) => setView({ kind: "board", boardId: b.id })}
          onCreate={(name) => {
            const board = createBoard(name);
            refresh();
            setView({ kind: "board", boardId: board.id });
          }}
        />
      )}

      {/* ── Navigation rail ── */}
      {view.kind === "task" ? (
        <TaskRail
          todo={currentTask}
          todos={visibleTodos}
          onBack={() => setView({ kind: "drive" })}
          onNavigate={(t) => openTodo(t)}
          onDone={() => {
            if (currentTask) {
              updateTodo(date, currentTask.id, { status: "done" });
              refresh();
              setView({ kind: "drive" });
            }
          }}
        />
      ) : view.kind === "board" ? (
        <Rail>
          <RailButton onClick={() => setView({ kind: "boards" })}>
            <ArrowLeft size={14} /> BOARDS
          </RailButton>
          <span style={{ color: INK, padding: "0 10px", letterSpacing: 1 }}>
            {currentBoard?.name ?? "BOARD"}
          </span>
        </Rail>
      ) : (
        <Rail>
          <span style={{ color: DIM, padding: "0 10px", letterSpacing: 1 }}>{date}</span>
          <RailButton active={view.kind === "plan"} onClick={() => setView({ kind: "plan" })}>
            PLAN
          </RailButton>
          <RailButton active={view.kind === "drive"} onClick={() => setView({ kind: "drive" })}>
            DRIVE{" "}
            {day.todos.length > 0 &&
              `${day.todos.filter((t) => t.status === "done").length}/${visibleTodos.length}`}
          </RailButton>
          <RailButton active={view.kind === "reflect"} onClick={() => setView({ kind: "reflect" })}>
            REFLECT
          </RailButton>
          <RailButton active={view.kind === "boards"} onClick={() => setView({ kind: "boards" })}>
            BOARDS
          </RailButton>
        </Rail>
      )}

      {/* ── Stage actions ── */}
      {view.kind === "plan" && (
        <StageAction onClick={runDistill} busy={busy}>
          <Sparkles size={18} /> Distill into tasks
        </StageAction>
      )}
      {view.kind === "reflect" && (
        <StageAction onClick={runHarvest} busy={busy}>
          <Sparkles size={18} /> Harvest learnings
        </StageAction>
      )}

      {harvested && (
        <HarvestDialog
          learnings={harvested}
          boards={boards}
          onCancel={() => setHarvested(null)}
          onSend={sendToBoard}
        />
      )}
    </div>
  );
}

function canvasKeyFor(view: View, date: string): string {
  switch (view.kind) {
    case "plan":
      return planCanvasKey(date);
    case "reflect":
      return reflectCanvasKey(date);
    case "task":
      return taskCanvasKey(view.todoId);
    case "board":
      return boardCanvasKey(view.boardId);
    default:
      return planCanvasKey(date);
  }
}

// ── Chrome primitives ───────────────────────────────────────────────

function Rail({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 950,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 8px",
        borderRadius: 999,
        background: "rgba(10, 14, 20, 0.9)",
        border: `1px solid ${CARD_BORDER}`,
        backdropFilter: "blur(8px)",
        fontFamily: MONO,
        fontSize: 13,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

function RailButton({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 14px",
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        fontFamily: MONO,
        fontSize: 13,
        letterSpacing: 1,
        background: active ? "rgba(94, 234, 212, 0.18)" : "transparent",
        color: active ? ACCENT : DIM,
      }}
    >
      {children}
    </button>
  );
}

function TaskRail({
  todo,
  todos,
  onBack,
  onNavigate,
  onDone,
}: {
  todo?: TodoItem;
  todos: TodoItem[];
  onBack: () => void;
  onNavigate: (t: TodoItem) => void;
  onDone: () => void;
}) {
  const idx = todo ? todos.findIndex((t) => t.id === todo.id) : -1;
  const prev = idx > 0 ? todos[idx - 1] : undefined;
  const next = idx >= 0 && idx < todos.length - 1 ? todos[idx + 1] : undefined;
  return (
    <Rail>
      <RailButton onClick={onBack}>
        <ArrowLeft size={14} /> DRIVE
      </RailButton>
      <RailButton onClick={() => prev && onNavigate(prev)}>
        <ChevronLeft size={14} style={{ opacity: prev ? 1 : 0.25 }} />
      </RailButton>
      <span
        style={{
          color: todo?.status === "done" ? DIM : INK,
          textDecoration: todo?.status === "done" ? "line-through" : "none",
          padding: "0 6px",
          maxWidth: 320,
          overflow: "hidden",
          textOverflow: "ellipsis",
          letterSpacing: 0.5,
        }}
      >
        {todo?.title ?? "task"}
      </span>
      <RailButton onClick={() => next && onNavigate(next)}>
        <ChevronRight size={14} style={{ opacity: next ? 1 : 0.25 }} />
      </RailButton>
      {todo?.status !== "done" && (
        <button
          type="button"
          onClick={onDone}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            fontFamily: MONO,
            fontSize: 13,
            letterSpacing: 1,
            background: "linear-gradient(135deg, #9ff0c6, #5eead4)",
            color: "#06231c",
            fontWeight: 700,
          }}
        >
          <Check size={14} /> DONE
        </button>
      )}
    </Rail>
  );
}

function StageAction({
  children,
  onClick,
  busy,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!!busy}
      style={{
        position: "fixed",
        bottom: 72,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 950,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "14px 22px",
        borderRadius: 999,
        border: "none",
        cursor: busy ? "wait" : "pointer",
        fontFamily: MONO,
        fontSize: 15,
        letterSpacing: 0.5,
        background: busy
          ? "rgba(94, 234, 212, 0.25)"
          : "linear-gradient(135deg, #9ff0c6, #5eead4)",
        color: busy ? ACCENT : "#06231c",
        fontWeight: 700,
        boxShadow: "0 12px 32px -12px rgba(94, 234, 212, 0.55)",
      }}
    >
      {busy ?? children}
    </button>
  );
}

// ── Drive (the todo hub) ────────────────────────────────────────────

function DriveView({
  date,
  todos,
  onOpen,
  onToggle,
  onDrop,
  onAdd,
  onCarryOver,
}: {
  date: string;
  todos: TodoItem[];
  onOpen: (t: TodoItem) => void;
  onToggle: (t: TodoItem) => void;
  onDrop: (t: TodoItem) => void;
  onAdd: (title: string) => void;
  onCarryOver: (fromDate: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [carrySource, setCarrySource] = useState<string | null>(null);
  const done = todos.filter((t) => t.status === "done").length;

  useEffect(() => {
    setCarrySource(findUnfinishedDayBefore(date)?.date ?? null);
  }, [date, todos.length]);

  const submit = () => {
    if (draft.trim()) {
      onAdd(draft);
      setDraft("");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        background: BG,
        fontFamily: MONO,
        color: INK,
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "96px 24px 140px" }}>
        <div style={{ color: DIM, fontSize: 13, letterSpacing: 2 }}>THE DRIVE</div>
        <h1 style={{ fontSize: 28, margin: "8px 0 4px", color: ACCENT, letterSpacing: 1 }}>
          {date}
        </h1>
        <div style={{ color: DIM, fontSize: 14, marginBottom: 28 }}>
          {todos.length === 0
            ? "Nothing distilled yet — write your day on the Plan canvas, then distill."
            : `${done} of ${todos.length} done`}
        </div>

        {carrySource && (
          <button
            type="button"
            onClick={() => onCarryOver(carrySource)}
            style={{
              width: "100%",
              textAlign: "left",
              marginBottom: 20,
              padding: "12px 16px",
              borderRadius: 10,
              border: `1px dashed ${CARD_BORDER}`,
              background: "transparent",
              color: DIM,
              fontFamily: MONO,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ↩ Carry over unfinished tasks from {carrySource}
          </button>
        )}

        {todos.map((t) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 10,
              padding: "4px 6px 4px 4px",
              borderRadius: 12,
              border: `1px solid ${t.status === "active" ? "rgba(94,234,212,0.45)" : CARD_BORDER}`,
              background: CARD_BG,
            }}
          >
            <button
              type="button"
              aria-label={t.status === "done" ? "Mark not done" : "Mark done"}
              onClick={() => onToggle(t)}
              style={{
                width: 44,
                height: 44,
                flex: "0 0 auto",
                borderRadius: 999,
                border: `2px solid ${t.status === "done" ? ACCENT : DIM}`,
                background: t.status === "done" ? "rgba(94,234,212,0.2)" : "transparent",
                color: ACCENT,
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                margin: 8,
              }}
            >
              {t.status === "done" && <Check size={20} />}
            </button>
            <button
              type="button"
              onClick={() => onOpen(t)}
              style={{
                flex: 1,
                textAlign: "left",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: "14px 0",
                fontFamily: MONO,
              }}
            >
              <div
                style={{
                  fontSize: 17,
                  color: t.status === "done" ? DIM : INK,
                  textDecoration: t.status === "done" ? "line-through" : "none",
                }}
              >
                {t.title}
              </div>
              {t.detail && (
                <div style={{ fontSize: 13, color: DIM, marginTop: 4 }}>{t.detail}</div>
              )}
              <div style={{ fontSize: 11, color: DIM, marginTop: 6, letterSpacing: 1 }}>
                {t.status === "active" ? "● IN MOTION — " : ""}
                OPEN CANVAS →
              </div>
            </button>
            <button
              type="button"
              aria-label="Drop task"
              onClick={() => onDrop(t)}
              style={{
                width: 36,
                height: 36,
                flex: "0 0 auto",
                borderRadius: 999,
                border: "none",
                background: "transparent",
                color: DIM,
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <X size={16} />
            </button>
          </div>
        ))}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Add a task by hand..."
            style={{
              flex: 1,
              padding: "14px 16px",
              borderRadius: 10,
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              color: INK,
              fontFamily: MONO,
              fontSize: 15,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={submit}
            aria-label="Add task"
            style={{
              width: 52,
              borderRadius: 10,
              border: `1px solid ${CARD_BORDER}`,
              background: "rgba(94,234,212,0.12)",
              color: ACCENT,
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Masterboards ────────────────────────────────────────────────────

function BoardsView({
  boards,
  onOpen,
  onCreate,
}: {
  boards: Masterboard[];
  onOpen: (b: Masterboard) => void;
  onCreate: (name: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    if (draft.trim()) {
      onCreate(draft);
      setDraft("");
    }
  };
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        background: BG,
        fontFamily: MONO,
        color: INK,
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "96px 24px 140px" }}>
        <div style={{ color: DIM, fontSize: 13, letterSpacing: 2 }}>MASTERBOARDS</div>
        <h1 style={{ fontSize: 28, margin: "8px 0 4px", color: ACCENT, letterSpacing: 1 }}>
          Streams of thought
        </h1>
        <div style={{ color: DIM, fontSize: 14, marginBottom: 28 }}>
          Long-lived canvases. Harvested learnings land here.
        </div>

        {boards.length === 0 && (
          <div style={{ color: DIM, fontSize: 14, marginBottom: 20 }}>
            No boards yet — create one for a project or a thread you keep pulling on.
          </div>
        )}

        {boards.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onOpen(b)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              textAlign: "left",
              marginBottom: 10,
              padding: "18px 16px",
              borderRadius: 12,
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              color: INK,
              fontFamily: MONO,
              fontSize: 17,
              cursor: "pointer",
            }}
          >
            <span>{b.name}</span>
            <span style={{ color: DIM, fontSize: 12, letterSpacing: 1 }}>
              {b.inbox.length > 0 ? `${b.inbox.length} NEW · ` : ""}OPEN →
            </span>
          </button>
        ))}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="New board name..."
            style={{
              flex: 1,
              padding: "14px 16px",
              borderRadius: 10,
              border: `1px solid ${CARD_BORDER}`,
              background: CARD_BG,
              color: INK,
              fontFamily: MONO,
              fontSize: 15,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={submit}
            aria-label="Create board"
            style={{
              width: 52,
              borderRadius: 10,
              border: `1px solid ${CARD_BORDER}`,
              background: "rgba(94,234,212,0.12)",
              color: ACCENT,
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Harvest dialog ──────────────────────────────────────────────────

function HarvestDialog({
  learnings,
  boards,
  onCancel,
  onSend,
}: {
  learnings: string[];
  boards: Masterboard[];
  onCancel: () => void;
  onSend: (boardId: string | null, newName: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(boards[0]?.id ?? null);
  const [newName, setNewName] = useState("");
  const canSend = !!selected || !!newName.trim();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(4, 6, 10, 0.8)",
        display: "grid",
        placeItems: "center",
        fontFamily: MONO,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "80vh",
          overflowY: "auto",
          borderRadius: 14,
          border: `1px solid ${CARD_BORDER}`,
          background: "#0c1018",
          padding: 24,
          color: INK,
        }}
      >
        <div style={{ color: ACCENT, letterSpacing: 2, fontSize: 13, marginBottom: 12 }}>
          HARVESTED LEARNINGS
        </div>
        <ul style={{ margin: "0 0 20px", padding: 0, listStyle: "none" }}>
          {learnings.map((l, i) => (
            <li
              key={i}
              style={{
                padding: "10px 12px",
                marginBottom: 8,
                borderRadius: 8,
                background: CARD_BG,
                border: `1px solid ${CARD_BORDER}`,
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              {l}
            </li>
          ))}
        </ul>

        <div style={{ color: DIM, letterSpacing: 2, fontSize: 12, marginBottom: 10 }}>
          SEND TO MASTERBOARD
        </div>
        {boards.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => {
              setSelected(b.id);
              setNewName("");
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              marginBottom: 6,
              padding: "12px 14px",
              borderRadius: 8,
              border: `1px solid ${selected === b.id ? ACCENT : CARD_BORDER}`,
              background: selected === b.id ? "rgba(94,234,212,0.12)" : "transparent",
              color: selected === b.id ? ACCENT : INK,
              fontFamily: MONO,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {b.name}
          </button>
        ))}
        <input
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
            if (e.target.value.trim()) setSelected(null);
          }}
          placeholder={boards.length > 0 ? "...or a new board" : "Name a new board"}
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginTop: 6,
            padding: "12px 14px",
            borderRadius: 8,
            border: `1px solid ${CARD_BORDER}`,
            background: CARD_BG,
            color: INK,
            fontFamily: MONO,
            fontSize: 14,
            outline: "none",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "12px 18px",
              borderRadius: 999,
              border: `1px solid ${CARD_BORDER}`,
              background: "transparent",
              color: DIM,
              fontFamily: MONO,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSend}
            onClick={() => onSend(selected, newName)}
            style={{
              padding: "12px 22px",
              borderRadius: 999,
              border: "none",
              background: canSend
                ? "linear-gradient(135deg, #9ff0c6, #5eead4)"
                : "rgba(94,234,212,0.15)",
              color: canSend ? "#06231c" : DIM,
              fontFamily: MONO,
              fontSize: 14,
              fontWeight: 700,
              cursor: canSend ? "pointer" : "default",
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
