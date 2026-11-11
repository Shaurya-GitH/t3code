import { describe, expect, it } from "vite-plus/test";

import { filterTasks, positionForDrop, sessionRoute } from "./tasks.logic";
import type { Task } from "./tasksApi";

const task = (id: number, patch: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  notes: "",
  status: "todo",
  status_note: "",
  source: "manual",
  position: id,
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
    expect(sessionRoute("")).toBeNull();
  });
});
