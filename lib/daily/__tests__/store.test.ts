import {
  addTodo,
  addLearningsToBoard,
  carryOverUnfinished,
  createBoard,
  drainBoardInbox,
  findUnfinishedDayBefore,
  furthestStage,
  getBoard,
  getDay,
  laterStage,
  mergeDistilledTodos,
  nextStage,
  planCanvasKey,
  taskCanvasKey,
  taskStage,
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

describe("task stages", () => {
  it("treats legacy records without a stage field as brief", () => {
    // Simulate a day saved before stages existed
    localStorage.setItem(
      "woodpecker-daily-days",
      JSON.stringify({
        "2026-07-12": {
          date: "2026-07-12",
          todos: [
            {
              id: "old1",
              title: "Pre-stage todo",
              status: "active",
              createdAt: 1,
              source: "manual",
            },
          ],
        },
      })
    );
    const day = getDay("2026-07-12");
    expect(day.todos).toHaveLength(1);
    expect(taskStage(day.todos[0])).toBe("brief");
  });

  it("walks the stage sequence and stops at the end", () => {
    expect(nextStage("brief")).toBe("review");
    expect(nextStage("review")).toBe("execute");
    expect(nextStage("execute")).toBe("verify");
    expect(nextStage("verify")).toBe("reflect");
    expect(nextStage("reflect")).toBeNull();
  });

  it("orders stages with laterStage", () => {
    expect(laterStage("brief", "review")).toBe("review");
    expect(laterStage("reflect", "execute")).toBe("reflect");
    expect(laterStage("verify", "verify")).toBe("verify");
  });

  it("tracks the furthest stage reached across backward jumps", () => {
    const t = addTodo("2026-07-12", "Gated task");
    // Legacy record: no stageReached — furthest is the current stage
    expect(furthestStage(getDay("2026-07-12").todos[0])).toBe("brief");

    // Progressed to execute, then jumped back to review
    updateTodo("2026-07-12", t.id, { stage: "execute", stageReached: "execute" });
    updateTodo("2026-07-12", t.id, {
      stage: "review",
      stageReached: laterStage(furthestStage(getDay("2026-07-12").todos[0]), "review"),
    });
    const saved = getDay("2026-07-12").todos[0];
    expect(taskStage(saved)).toBe("review");
    expect(furthestStage(saved)).toBe("execute"); // execute stays unlocked
  });

  it("round-trips a closing reflection through updateTodo", () => {
    const t = addTodo("2026-07-12", "Ship it");
    updateTodo("2026-07-12", t.id, {
      status: "done",
      reflection: "Scope the plan before touching code",
    });
    expect(getDay("2026-07-12").todos[0].reflection).toBe(
      "Scope the plan before touching code"
    );
  });

  it("round-trips stage and plan fields through updateTodo", () => {
    const t = addTodo("2026-07-12", "Build the thing");
    updateTodo("2026-07-12", t.id, {
      stage: "review",
      planCount: 2,
      planShapeCount: 5,
    });
    const saved = getDay("2026-07-12").todos[0];
    expect(taskStage(saved)).toBe("review");
    expect(saved.planCount).toBe(2);
    expect(saved.planShapeCount).toBe(5);
  });

  it("carries stage and plan fields over with the todo", () => {
    const t = addTodo("2026-07-11", "Mid-flight task");
    updateTodo("2026-07-11", t.id, {
      status: "active",
      stage: "execute",
      planCount: 1,
      planShapeCount: 3,
    });

    const carried = carryOverUnfinished("2026-07-11", "2026-07-12");
    expect(carried[0].status).toBe("todo"); // status resets
    expect(taskStage(carried[0])).toBe("execute"); // stage follows the canvas
    expect(carried[0].planCount).toBe(1);
    expect(carried[0].planShapeCount).toBe(3);
  });

  it("keeps stage independent of status toggles", () => {
    const t = addTodo("2026-07-12", "Toggle me");
    updateTodo("2026-07-12", t.id, { stage: "execute", planCount: 1 });

    // Done from the drive list mid-stage, then un-done
    updateTodo("2026-07-12", t.id, { status: "done" });
    expect(taskStage(getDay("2026-07-12").todos[0])).toBe("execute");

    updateTodo("2026-07-12", t.id, { status: "todo" });
    const restored = getDay("2026-07-12").todos[0];
    expect(taskStage(restored)).toBe("execute");
    expect(restored.planCount).toBe(1);
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
