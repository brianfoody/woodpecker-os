import {
  addTodo,
  addLearningsToBoard,
  carryOverUnfinished,
  createBoard,
  drainBoardInbox,
  findUnfinishedDayBefore,
  getBoard,
  getDay,
  mergeDistilledTodos,
  planCanvasKey,
  taskCanvasKey,
  todayKey,
  updateTodo,
} from "../store";

beforeEach(() => {
  localStorage.clear();
});

describe("todayKey", () => {
  it("uses the local calendar date", () => {
    expect(todayKey(new Date(2026, 6, 12, 23, 59))).toBe("2026-07-12");
    expect(todayKey(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });
});

describe("todos", () => {
  it("adds and updates todos on a day", () => {
    const t = addTodo("2026-07-12", "Ship the relay fix");
    updateTodo("2026-07-12", t.id, { status: "done" });
    const day = getDay("2026-07-12");
    expect(day.todos).toHaveLength(1);
    expect(day.todos[0].status).toBe("done");
    expect(day.todos[0].source).toBe("manual");
  });

  it("merges distilled todos without duplicating existing titles", () => {
    addTodo("2026-07-12", "Email Sarah");
    const added = mergeDistilledTodos("2026-07-12", [
      { title: "email sarah" }, // dup, case-insensitive
      { title: "Review PR", detail: "the connector one" },
      { title: "  " }, // blank — skipped
      { title: "Review PR" }, // dup within the same batch
    ]);
    expect(added.map((t) => t.title)).toEqual(["Review PR"]);
    const day = getDay("2026-07-12");
    expect(day.todos).toHaveLength(2);
    expect(day.distilledAt).toBeGreaterThan(0);
  });
});

describe("carry-over", () => {
  it("finds the most recent previous day with unfinished todos", () => {
    addTodo("2026-07-09", "Old thing");
    const t = addTodo("2026-07-10", "Newer thing");
    addTodo("2026-07-11", "Done thing");
    updateTodo("2026-07-11", getDay("2026-07-11").todos[0].id, { status: "done" });

    const found = findUnfinishedDayBefore("2026-07-12");
    expect(found?.date).toBe("2026-07-10");
    expect(found?.todos[0].id).toBe(t.id);
  });

  it("moves unfinished todos keeping their ids (canvas follows)", () => {
    const keep = addTodo("2026-07-11", "Unfinished");
    const done = addTodo("2026-07-11", "Finished");
    updateTodo("2026-07-11", done.id, { status: "done" });

    const carried = carryOverUnfinished("2026-07-11", "2026-07-12");
    expect(carried).toHaveLength(1);
    expect(carried[0].id).toBe(keep.id);
    expect(carried[0].source).toBe("carryover");

    expect(getDay("2026-07-11").todos.map((t) => t.id)).toEqual([done.id]);
    expect(getDay("2026-07-12").todos.map((t) => t.id)).toEqual([keep.id]);
    // task canvas key is derived from the id, so it moved with the todo
    expect(taskCanvasKey(carried[0].id)).toBe(taskCanvasKey(keep.id));
  });

  it("is a no-op when carrying to the same day or from an empty day", () => {
    addTodo("2026-07-12", "Thing");
    expect(carryOverUnfinished("2026-07-12", "2026-07-12")).toEqual([]);
    expect(carryOverUnfinished("2026-07-01", "2026-07-12")).toEqual([]);
    expect(getDay("2026-07-12").todos).toHaveLength(1);
  });
});

describe("masterboards", () => {
  it("collects harvested learnings in the inbox and drains once", () => {
    const board = createBoard("Woodpecker");
    addLearningsToBoard(board.id, "2026-07-12", [
      "E-ink needs bigger tap targets",
      "  ",
      "Distill beats manual entry",
    ]);
    expect(getBoard(board.id)?.inbox).toHaveLength(2);

    const drained = drainBoardInbox(board.id);
    expect(drained.map((e) => e.text)).toEqual([
      "E-ink needs bigger tap targets",
      "Distill beats manual entry",
    ]);
    expect(getBoard(board.id)?.inbox).toEqual([]);
    expect(drainBoardInbox(board.id)).toEqual([]);
  });
});

describe("canvas keys", () => {
  it("are stable and distinct per surface", () => {
    expect(planCanvasKey("2026-07-12")).toBe("woodpecker-canvas-day-2026-07-12-plan");
    expect(planCanvasKey("2026-07-12")).not.toBe(taskCanvasKey("2026-07-12"));
  });
});
