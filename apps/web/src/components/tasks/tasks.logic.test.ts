import { describe, expect, it } from "vite-plus/test";

import {
  filterTasks,
  planTaskSettle,
  positionForDrop,
  sessionRoute,
  tasksByThreadKey,
} from "./tasks.logic";
import type { Task } from "./tasksApi";

const task = (id: number, patch: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  notes: "",
  status: "todo",
  status_note: "",
  source: "manual",
  position: id,
  color: "pink",
  updated_at: "2026-11-11T00:00:00.000Z",
  sessions: [],
  criteria: [],
  events: [],
  ...patch,
});

describe("tasks.logic", () => {
  it("places a dropped card between its new neighbours", () => {
    const column = [task(1, { position: 2 }), task(2, { position: 4 })];
    expect(positionForDrop(column, 0)).toBe(1);
    expect(positionForDrop(column, 1)).toBe(3);
    expect(positionForDrop(column, 2)).toBe(5);
    expect(positionForDrop([], 0)).toBe(0);
  });

  it("matches every search word across the ticket, and task numbers", () => {
    const tasks = [
      task(1, {
        title: "Ship refund fix",
        criteria: [{ id: 1, text: "Klarna path", done: false }],
      }),
      task(12, {
        title: "Release notes",
        sessions: [{ thread_id: "t", title: "Klarna", link: "" }],
      }),
    ];
    expect(filterTasks(tasks, "klarna refund").map((found) => found.id)).toEqual([1]);
    expect(filterTasks(tasks, "KLARNA").map((found) => found.id)).toEqual([1, 12]);
    expect(filterTasks(tasks, "#12").map((found) => found.id)).toEqual([12]);
  });

  it("reads the app route from a recorded thread link", () => {
    expect(sessionRoute("https://app.t3.codes/threads/env-1/thread-9")).toEqual({
      environmentId: "env-1",
      threadId: "thread-9",
    });
    expect(sessionRoute("https://app.t3.codes/threads/env-1/mcp%3Aabc")?.threadId).toBe("mcp:abc");
    expect(sessionRoute("")).toBeNull();
  });

  it("finds the task of a session, settled tasks included", () => {
    const link = (thread: string) => `https://app.t3.codes/threads/env/${thread}`;
    const session = (thread: string) => ({ thread_id: thread, title: thread, link: link(thread) });
    const open = task(1, { sessions: [session("a"), session("b")] });
    const settled = task(2, { status: "settled", sessions: [session("s")] });
    const byKey = tasksByThreadKey([
      open,
      settled,
      task(3, { sessions: [{ ...session("x"), link: "" }] }),
    ]);
    expect(byKey.get("env:a")).toBe(open);
    expect(byKey.get("env:s")).toBe(settled);
    expect(byKey.size).toBe(3);
  });

  it("settles every open session of a task, and counts the running ones", () => {
    const states = { a: "open", r: "running", s: "settled", gone: "unknown" } as const;
    const plan = planTaskSettle(
      ["a", "r", "s", "gone"],
      (ref) => states[ref as keyof typeof states],
    );
    expect(plan.settle).toEqual(["a", "r"]);
    expect(plan.running).toBe(1);
    expect(plan.unknown).toBe(1);
    // Nothing open: the task settles alone, without asking.
    expect(planTaskSettle(["s"], () => "settled")).toEqual({ settle: [], running: 0, unknown: 0 });
  });
});
