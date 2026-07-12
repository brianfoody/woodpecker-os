/**
 * The Daily Drive data model.
 *
 * A Day is the unit of work: morning plan canvas → distilled todo list →
 * one canvas per todo (scope + execute) → evening reflect canvas whose
 * learnings are harvested into Masterboards.
 *
 * Everything persists to localStorage (same story as canvas snapshots —
 * decision #5), keyed independently from the tldraw snapshots so wiping a
 * canvas never loses the day's structure. Canvas content itself lives under
 * the storage keys produced by the *CanvasKey helpers, which flow through
 * the existing canvas-persistence + connector sync machinery untouched.
 */

export type TodoStatus = "todo" | "active" | "done" | "dropped";

export interface TodoItem {
  id: string;
  title: string;
  detail?: string;
  status: TodoStatus;
  createdAt: number;
  source: "distilled" | "manual" | "carryover";
  /** Task canvas has been seeded with its title card */
  seeded?: boolean;
}

export interface DayRecord {
  /** Local date key, YYYY-MM-DD */
  date: string;
  todos: TodoItem[];
  /** Reflect canvas has been seeded with the day-recap card */
  reflectSeeded?: boolean;
  /** Last time the plan canvas was distilled into todos */
  distilledAt?: number;
}

export interface LearningEntry {
  id: string;
  text: string;
  /** Day the learning came from */
  date: string;
  createdAt: number;
}

export interface Masterboard {
  id: string;
  name: string;
  createdAt: number;
  /** Learnings harvested from reflections, stamped onto the board canvas next open */
  inbox: LearningEntry[];
}

const DAYS_KEY = "woodpecker-daily-days";
const BOARDS_KEY = "woodpecker-daily-boards";

// ── Canvas storage keys ─────────────────────────────────────────────
// These are full storage keys for TldrawCanvas / canvas-persistence and
// double as the connector-side canvasKey for cross-device sync.

export function planCanvasKey(date: string): string {
  return `woodpecker-canvas-day-${date}-plan`;
}

export function reflectCanvasKey(date: string): string {
  return `woodpecker-canvas-day-${date}-reflect`;
}

export function taskCanvasKey(todoId: string): string {
  return `woodpecker-canvas-task-${todoId}`;
}

export function boardCanvasKey(boardId: string): string {
  return `woodpecker-canvas-board-${boardId}`;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Local date key, YYYY-MM-DD (not UTC — a day is what the user's clock says) */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function newId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to persist ${key}:`, error);
  }
}

// ── Days ────────────────────────────────────────────────────────────

type DayMap = Record<string, DayRecord>;

function loadDays(): DayMap {
  return readJson<DayMap>(DAYS_KEY, {});
}

function saveDays(days: DayMap): void {
  writeJson(DAYS_KEY, days);
}

export function getDay(date: string): DayRecord {
  const days = loadDays();
  return days[date] ?? { date, todos: [] };
}

export function saveDay(day: DayRecord): void {
  const days = loadDays();
  days[day.date] = day;
  saveDays(days);
}

export function updateDay(
  date: string,
  mutate: (day: DayRecord) => DayRecord
): DayRecord {
  const next = mutate(getDay(date));
  saveDay(next);
  return next;
}

export function addTodo(
  date: string,
  title: string,
  opts: { detail?: string; source?: TodoItem["source"] } = {}
): TodoItem {
  const todo: TodoItem = {
    id: newId(),
    title: title.trim(),
    detail: opts.detail?.trim() || undefined,
    status: "todo",
    createdAt: Date.now(),
    source: opts.source ?? "manual",
  };
  updateDay(date, (day) => ({ ...day, todos: [...day.todos, todo] }));
  return todo;
}

export function updateTodo(
  date: string,
  todoId: string,
  patch: Partial<Omit<TodoItem, "id">>
): void {
  updateDay(date, (day) => ({
    ...day,
    todos: day.todos.map((t) => (t.id === todoId ? { ...t, ...patch } : t)),
  }));
}

/**
 * Merge distilled todos into the day, skipping titles that already exist
 * (case-insensitive) so re-distilling an updated plan never duplicates.
 * Returns the todos actually added.
 */
export function mergeDistilledTodos(
  date: string,
  items: { title: string; detail?: string }[]
): TodoItem[] {
  const day = getDay(date);
  const existing = new Set(
    day.todos.map((t) => t.title.trim().toLowerCase())
  );
  const added: TodoItem[] = [];
  for (const item of items) {
    const title = item.title.trim();
    if (!title || existing.has(title.toLowerCase())) continue;
    existing.add(title.toLowerCase());
    added.push({
      id: newId(),
      title,
      detail: item.detail?.trim() || undefined,
      status: "todo",
      createdAt: Date.now(),
      source: "distilled",
    });
  }
  saveDay({
    ...day,
    todos: [...day.todos, ...added],
    distilledAt: Date.now(),
  });
  return added;
}

/**
 * The most recent day before `date` that still has unfinished todos
 * (status todo/active). Used to offer a carry-over on the Drive view.
 */
export function findUnfinishedDayBefore(date: string): DayRecord | null {
  const days = loadDays();
  const candidates = Object.values(days)
    .filter(
      (d) =>
        d.date < date &&
        d.todos.some((t) => t.status === "todo" || t.status === "active")
    )
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return candidates[0] ?? null;
}

/**
 * Move unfinished todos from a previous day into `date`. The todo keeps its
 * id, so its task canvas (and any agent sessions on it) follows it across.
 */
export function carryOverUnfinished(fromDate: string, toDate: string): TodoItem[] {
  if (fromDate === toDate) return [];
  const days = loadDays();
  const from = days[fromDate];
  if (!from) return [];
  const moving = from.todos.filter(
    (t) => t.status === "todo" || t.status === "active"
  );
  if (moving.length === 0) return [];
  const to = days[toDate] ?? { date: toDate, todos: [] };
  const existingIds = new Set(to.todos.map((t) => t.id));
  const carried = moving
    .filter((t) => !existingIds.has(t.id))
    .map((t) => ({ ...t, status: "todo" as const, source: "carryover" as const }));
  days[fromDate] = {
    ...from,
    todos: from.todos.filter((t) => !(t.status === "todo" || t.status === "active")),
  };
  days[toDate] = { ...to, todos: [...to.todos, ...carried] };
  saveDays(days);
  return carried;
}

// ── Masterboards ────────────────────────────────────────────────────

export function loadBoards(): Masterboard[] {
  return readJson<Masterboard[]>(BOARDS_KEY, []);
}

function saveBoards(boards: Masterboard[]): void {
  writeJson(BOARDS_KEY, boards);
}

export function createBoard(name: string): Masterboard {
  const board: Masterboard = {
    id: newId(),
    name: name.trim(),
    createdAt: Date.now(),
    inbox: [],
  };
  saveBoards([...loadBoards(), board]);
  return board;
}

export function getBoard(boardId: string): Masterboard | null {
  return loadBoards().find((b) => b.id === boardId) ?? null;
}

export function addLearningsToBoard(
  boardId: string,
  date: string,
  learnings: string[]
): void {
  const entries: LearningEntry[] = learnings
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ id: newId(), text, date, createdAt: Date.now() }));
  if (entries.length === 0) return;
  saveBoards(
    loadBoards().map((b) =>
      b.id === boardId ? { ...b, inbox: [...b.inbox, ...entries] } : b
    )
  );
}

/** Drain a board's inbox (called after stamping entries onto its canvas). */
export function drainBoardInbox(boardId: string): LearningEntry[] {
  const boards = loadBoards();
  const board = boards.find((b) => b.id === boardId);
  if (!board || board.inbox.length === 0) return [];
  const drained = board.inbox;
  saveBoards(
    boards.map((b) => (b.id === boardId ? { ...b, inbox: [] } : b))
  );
  return drained;
}
