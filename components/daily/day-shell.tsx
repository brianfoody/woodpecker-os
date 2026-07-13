"use client";

/**
 * The Daily Drive shell — the opinionated wrapper that turns the freeform
 * canvas engine into a daily practice:
 *
 *   Plan (canvas) → Distill → The Work (todo hub) → one canvas per task
 *   (brief → review → execute → verify → reflect) → Reflect (canvas)
 *   → Harvest → Masterboards (canvases)
 *
 * Every canvas is a plain TldrawCanvas with its own storageKey, so the
 * magic pen, persistence and connector sync all work unchanged. The shell
 * only adds structure: navigation chrome, the todo list, and the two AI
 * steps (distill / harvest) that move content between surfaces.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createShapeId } from "tldraw";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Play,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import type { CanvasAgentExecute } from "@/components/tldraw-canvas";
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
  furthestStage,
  laterStage,
  reflectCanvasKey,
  taskCanvasKey,
  taskStage,
  TASK_STAGES,
  todayKey,
  updateDay,
  updateTodo,
  type DayRecord,
  type Masterboard,
  type TaskStage,
  type TodoItem,
} from "@/lib/daily/store";
import {
  captureCanvasImage,
  distillPlanToTodos,
  extractTaskReflection,
  harvestLearnings,
  planTask,
} from "@/lib/daily/distill";

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
  const agentApiRef = useRef<{ execute: CanvasAgentExecute } | null>(null);
  // Bumped on any document change while a task canvas is open, so
  // annotation presence (ink after the last PLAN stamp) re-evaluates.
  const [shapeVersion, setShapeVersion] = useState(0);
  const shapeListenerRef = useRef<(() => void) | null>(null);

  const handleAgentApi = useCallback(
    (api: { execute: CanvasAgentExecute }) => {
      agentApiRef.current = api;
    },
    []
  );

  useEffect(() => () => shapeListenerRef.current?.(), []);

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
      agentApiRef.current = null;
      shapeListenerRef.current?.();
      shapeListenerRef.current = null;
      setViewRaw(v);
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify({ date, view: v }));
      } catch {}
    },
    [date]
  );

  const visibleTodos = day.todos.filter((t) => t.status !== "dropped");

  /**
   * Move a task to a stage, remembering the furthest point reached —
   * jumping back never re-locks stages you've already earned.
   */
  const setTaskStage = useCallback(
    (todo: TodoItem, s: TaskStage) => {
      updateTodo(date, todo.id, {
        stage: s,
        stageReached: laterStage(furthestStage(todo), s),
      });
      refresh();
    },
    [date, refresh]
  );

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
        // Watch for ink after the last PLAN stamp (drives "Revise plan")
        shapeListenerRef.current?.();
        shapeListenerRef.current = editor.store.listen(
          () => setShapeVersion((n) => n + 1),
          { scope: "document" }
        );
        setShapeVersion((n) => n + 1);
      }

      if (v.kind === "reflect") {
        const d = getDay(date);
        if (!d.reflectSeeded && editor.getCurrentPageShapes().length === 0) {
          const done = d.todos.filter((t) => t.status === "done");
          const open = d.todos.filter(
            (t) => t.status === "todo" || t.status === "active"
          );
          const lines = [
            ...done.map(
              (t) => `✓ ${t.title}${t.reflection ? ` — ${t.reflection}` : ""}`
            ),
            ...open.map(
              (t) =>
                `○ ${t.title}${taskStage(t) !== "brief" ? ` (${taskStage(t)})` : ""}`
            ),
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
            ? `${added.length} task${added.length === 1 ? "" : "s"} added to your work`
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

  /** One-shot "create/revise the plan" — stamps a PLAN card, moves to review. */
  const runCreatePlan = useCallback(
    async (revision: boolean) => {
      const editor = editorRef.current;
      if (!editor || view.kind !== "task") return;
      const todo = getDay(date).todos.find((t) => t.id === view.todoId);
      if (!todo) return;
      setBusy(revision ? "revising the plan..." : "drafting a plan...");
      try {
        const plan = await planTask(editor, todo.title, revision);
        const n = (todo.planCount ?? 0) + 1;
        stampCard(editor, theme, {
          x: 120,
          y: contentBottom(editor),
          text: plan,
          label: n === 1 ? "PLAN" : `PLAN v${n}`,
        });
        updateTodo(date, todo.id, {
          stage: "review",
          stageReached: laterStage(furthestStage(todo), "review"),
          planCount: n,
          planShapeCount: editor.getCurrentPageShapes().length,
        });
        refresh();
      } catch (error) {
        toast({
          title: revision ? "Revise failed" : "Plan failed",
          description: error instanceof Error ? error.message : "Is your connector running?",
          variant: "destructive",
        });
      } finally {
        setBusy(null);
      }
    },
    [view, date, theme, refresh]
  );

  /**
   * Hand the approved plan (canvas image, ink annotations included) to the
   * agent via the conversational path — reply cards stream in and carry
   * session ids, so circling them with the magic pen continues the session.
   */
  const runExecutePlan = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || view.kind !== "task") return;
    const todo = getDay(date).todos.find((t) => t.id === view.todoId);
    if (!todo) return;
    const agent = agentApiRef.current;
    if (!agent) {
      toast({
        title: "Canvas isn't ready yet",
        description: "Give it a second and try again.",
        variant: "destructive",
      });
      return;
    }
    setBusy("handing the plan to the agent...");
    try {
      const image = await captureCanvasImage(editor);
      if (!image) throw new Error("The task canvas is empty — create a plan first");
      const planCard = editor
        .getCurrentPageShapes()
        .filter(
          (s: any) =>
            s.type === "handwritten-text" &&
            typeof s.props?.cardLabel === "string" &&
            s.props.cardLabel.startsWith("PLAN")
        )
        .sort((a: any, b: any) => b.y - a.y)[0];
      const prompt =
        `Execute this plan for the task "${todo.title}". ` +
        `The image is my task canvas: the card labeled PLAN (highest version if several) is the approved plan; ` +
        `my handwritten notes are additional instructions. Do the work and report concisely what you did.`;
      // Fire and forget — the canvas renders its own thinking indicator and
      // streaming reply cards; errors surface through the canvas retry UI.
      void agent.execute(
        prompt,
        { image },
        { x: 120, y: contentBottom(editor) },
        undefined,
        planCard?.id,
        planCard ? "under" : undefined
      );
      updateTodo(date, todo.id, {
        stage: "execute",
        stageReached: laterStage(furthestStage(todo), "execute"),
      });
      refresh();
    } catch (error) {
      toast({
        title: "Execute failed",
        description: error instanceof Error ? error.message : "Is your connector running?",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }, [view, date, refresh]);

  /**
   * Close out a task from the reflect stage: best-effort extract the
   * handwritten reflection off the canvas (it enriches the evening recap),
   * then mark done. Closing never blocks on the connector being up.
   */
  const runCloseTask = useCallback(async () => {
    if (view.kind !== "task") return;
    const todo = getDay(date).todos.find((t) => t.id === view.todoId);
    if (!todo) return;
    setBusy("closing the task...");
    let reflection: string | undefined;
    try {
      const editor = editorRef.current;
      if (editor) reflection = await extractTaskReflection(editor);
    } catch {
      // no connector / extraction failed — close without a reflection
    } finally {
      updateTodo(date, todo.id, {
        status: "done",
        ...(reflection ? { reflection } : {}),
      });
      refresh();
      setBusy(null);
      setView({ kind: "drive" });
    }
  }, [view, date, refresh, setView]);

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

  // Has the user drawn anything since the last PLAN card was stamped?
  const annotated = useMemo(() => {
    void shapeVersion; // re-evaluate on document changes
    if (view.kind !== "task" || !currentTask?.planShapeCount) return false;
    const editor = editorRef.current;
    if (!editor) return false;
    try {
      return editor.getCurrentPageShapes().length > currentTask.planShapeCount;
    } catch {
      return false;
    }
  }, [view, currentTask, shapeVersion]);

  return (
    <div style={{ position: "fixed", inset: 0, background: BG }}>
      {isCanvasView && (
        <TldrawCanvas
          key={canvasKeyFor(view, date)}
          storageKey={canvasKeyFor(view, date)}
          theme={theme}
          darkMode
          onEditorMount={handleEditorMount}
          onAgentApi={handleAgentApi}
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
          onJump={(s) => currentTask && setTaskStage(currentTask, s)}
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
            WORK{" "}
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
      {view.kind === "task" && currentTask && currentTask.status !== "done" && (
        <TaskStageActions
          stage={taskStage(currentTask)}
          busy={busy}
          annotated={annotated}
          onCreatePlan={() => runCreatePlan(false)}
          onRevisePlan={() => runCreatePlan(true)}
          onExecutePlan={runExecutePlan}
          onJump={(s) => setTaskStage(currentTask, s)}
          onClose={runCloseTask}
        />
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
        maxWidth: "calc(100vw - 16px)",
        overflowX: "auto",
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

/** The task loop drawn as a filling ring — the rail reports, it never moves. */
function StageRing({ stage, size = 26 }: { stage: TaskStage; size?: number }) {
  const idx = Math.max(0, TASK_STAGES.indexOf(stage));
  const stroke = size <= 16 ? 2 : 3;
  const r = (size - stroke * 2) / 2;
  const c = 2 * Math.PI * r;
  const frac = (idx + 1) / TASK_STAGES.length;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: "rotate(-90deg)", flex: "0 0 auto" }}
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(94, 234, 212, 0.18)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={ACCENT}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
      />
    </svg>
  );
}

function TaskRail({
  todo,
  todos,
  onBack,
  onNavigate,
  onJump,
  onDone,
}: {
  todo?: TodoItem;
  todos: TodoItem[];
  onBack: () => void;
  onNavigate: (t: TodoItem) => void;
  onJump: (s: TaskStage) => void;
  onDone: () => void;
}) {
  const idx = todo ? todos.findIndex((t) => t.id === todo.id) : -1;
  const prev = idx > 0 ? todos[idx - 1] : undefined;
  const next = idx >= 0 && idx < todos.length - 1 ? todos[idx + 1] : undefined;
  return (
    <Rail>
      <RailButton onClick={onBack}>
        <ArrowLeft size={14} /> WORK
      </RailButton>
      <RailButton onClick={() => prev && onNavigate(prev)}>
        <ChevronLeft size={14} style={{ opacity: prev ? 1 : 0.25 }} />
      </RailButton>
      <span
        style={{
          color: todo?.status === "done" ? DIM : INK,
          textDecoration: todo?.status === "done" ? "line-through" : "none",
          padding: "0 6px",
          maxWidth: 180,
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
      {todo && todo.status !== "done" && (
        <>
          <span
            style={{
              width: 1,
              height: 22,
              background: CARD_BORDER,
              margin: "0 6px",
              flex: "0 0 auto",
            }}
          />
          <StageSteps
            stage={taskStage(todo)}
            reached={furthestStage(todo)}
            onJump={onJump}
          />
          <span style={{ width: 6, flex: "0 0 auto" }} />
        </>
      )}
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

/** Non-fixed pill button used inside TaskStageActions. */
function ActionPill({
  children,
  onClick,
  busy,
  ghost,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: string | null;
  ghost?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!!busy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "14px 22px",
        borderRadius: 999,
        border: ghost ? `1px solid ${CARD_BORDER}` : "none",
        cursor: busy ? "wait" : "pointer",
        fontFamily: MONO,
        fontSize: 15,
        letterSpacing: 0.5,
        background: ghost
          ? "rgba(10, 14, 20, 0.85)"
          : busy
            ? "rgba(94, 234, 212, 0.25)"
            : "linear-gradient(135deg, #9ff0c6, #5eead4)",
        color: ghost ? DIM : busy ? ACCENT : "#06231c",
        fontWeight: 700,
        boxShadow: ghost ? "none" : "0 12px 32px -12px rgba(94, 234, 212, 0.55)",
      }}
    >
      {!ghost && busy ? busy : children}
    </button>
  );
}

/**
 * The step track, inline in the task rail — past stages tick off and the
 * current one fills. Tapping a step jumps to it, but only within stages
 * already reached: forward stages are earned through the actions (create
 * a plan to unlock review, execute it to unlock execute, …), never by
 * skipping ahead.
 */
function StageSteps({
  stage,
  reached,
  onJump,
}: {
  stage: TaskStage;
  reached: TaskStage;
  onJump: (s: TaskStage) => void;
}) {
  const current = TASK_STAGES.indexOf(stage);
  const maxIdx = TASK_STAGES.indexOf(reached);
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      {TASK_STAGES.map((s, i) => {
        const locked = i > maxIdx;
        return (
          <React.Fragment key={s}>
            {i > 0 && (
              <span
                style={{
                  width: 12,
                  height: 1.5,
                  background:
                    i <= current ? "rgba(94, 234, 212, 0.5)" : "rgba(94, 234, 212, 0.18)",
                  margin: "0 3px",
                  flex: "0 0 auto",
                }}
              />
            )}
            <button
              type="button"
              aria-label={`Set stage: ${s}`}
              disabled={locked}
              onClick={() => onJump(s)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: "none",
                background: "transparent",
                cursor: locked ? "default" : "pointer",
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1.5,
                padding: "6px 2px",
                opacity: locked ? 0.35 : 1,
                color: i === current ? ACCENT : i < current ? "rgba(94, 234, 212, 0.55)" : DIM,
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 10,
                  flex: "0 0 auto",
                  border: `1.5px solid ${i <= current ? ACCENT : DIM}`,
                  background: i === current ? ACCENT : "transparent",
                  color: i === current ? "#06231c" : i < current ? ACCENT : DIM,
                  fontWeight: i === current ? 700 : 400,
                }}
              >
                {i < current ? "✓" : i + 1}
              </span>
              {s.toUpperCase()}
            </button>
          </React.Fragment>
        );
      })}
    </span>
  );
}

/**
 * Bottom actions for a task canvas — one loop per task:
 * brief (write) → Create plan → review (annotate/Revise or Execute)
 * → execute (agent works, iterate via magic pen) → verify → reflect
 * (jot one learning) → close. Stages guide, never gate: DONE in the
 * rail works from any stage, and the step track (top bar) jumps anywhere.
 */
function TaskStageActions({
  stage,
  busy,
  annotated,
  onCreatePlan,
  onRevisePlan,
  onExecutePlan,
  onJump,
  onClose,
}: {
  stage: TaskStage;
  busy: string | null;
  annotated: boolean;
  onCreatePlan: () => void;
  onRevisePlan: () => void;
  onExecutePlan: () => void;
  onJump: (s: TaskStage) => void;
  onClose: () => void;
}) {
  const hint =
    stage === "review"
      ? "Annotate the plan in ink to revise, or execute"
      : stage === "execute"
        ? "Circle the agent's replies with the magic pen to iterate"
        : stage === "verify"
          ? "Check the result; circle anything off to send it back"
          : stage === "reflect"
            ? "Jot one line in ink — what did this task teach you?"
            : undefined;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 72,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 950,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        maxWidth: "100vw",
      }}
    >
      {hint && !busy && (
        <div
          style={{
            fontFamily: MONO,
            fontSize: 12,
            color: DIM,
            letterSpacing: 0.5,
            padding: "4px 12px",
            borderRadius: 999,
            background: "rgba(10, 14, 20, 0.85)",
            border: `1px solid ${CARD_BORDER}`,
          }}
        >
          {hint}
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        {stage === "brief" && (
          <ActionPill onClick={onCreatePlan} busy={busy}>
            <Sparkles size={18} /> Create plan
          </ActionPill>
        )}
        {stage === "review" && annotated && (
          <ActionPill ghost onClick={onRevisePlan} busy={busy}>
            <Sparkles size={16} /> Revise plan
          </ActionPill>
        )}
        {stage === "review" && (
          <ActionPill onClick={onExecutePlan} busy={busy}>
            <Play size={18} /> Execute plan
          </ActionPill>
        )}
        {stage === "execute" && (
          <ActionPill onClick={() => onJump("verify")} busy={busy}>
            Ready to verify
          </ActionPill>
        )}
        {stage === "verify" && (
          <ActionPill onClick={() => onJump("reflect")} busy={busy}>
            <Check size={18} /> Verified
          </ActionPill>
        )}
        {stage === "reflect" && (
          <ActionPill onClick={onClose} busy={busy}>
            <Check size={18} /> Close task
          </ActionPill>
        )}
      </div>
    </div>
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
        <div style={{ color: DIM, fontSize: 13, letterSpacing: 2 }}>THE WORK</div>
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
              <div
                style={{
                  fontSize: 11,
                  color: DIM,
                  marginTop: 6,
                  letterSpacing: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {t.status === "active" && (
                  <>
                    <StageRing stage={taskStage(t)} size={14} />
                    <span style={{ color: ACCENT }}>{taskStage(t).toUpperCase()}</span>
                    <span>—</span>
                  </>
                )}
                <span>OPEN CANVAS →</span>
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
