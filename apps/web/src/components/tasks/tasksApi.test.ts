import { afterEach, expect, it, vi } from "vite-plus/test";

import type { Task } from "./tasksApi";

vi.mock("../../confirmDialog", () => ({ requestConfirmDialog: vi.fn() }));
vi.mock("../ui/toast", () => ({ toastManager: { add: vi.fn() } }));

afterEach(() => vi.unstubAllGlobals());

it("restores the authoritative board after a failed optimistic update with an unchanged GET", async () => {
  vi.resetModules();
  const task: Task = {
    id: 1,
    title: "Settled",
    notes: "",
    status: "settled",
    status_note: "",
    source: "manual",
    position: 0,
    color: "pink",
    updated_at: "",
    settled_at: "2026-11-11T12:00:00.000Z",
    sessions: [],
    criteria: [],
    events: [],
  };
  const board = JSON.stringify({ tasks: [task] });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}"))
    .mockResolvedValueOnce(new Response(board))
    .mockResolvedValueOnce(new Response('{"error":"update refused"}', { status: 400 }))
    .mockResolvedValueOnce(new Response(board));
  vi.stubGlobal("fetch", fetch);
  const { taskCommands, readTaskBoard } = await import("./tasksApi");
  await taskCommands.create({ title: task.title });
  expect(readTaskBoard().tasks[0]?.status).toBe("settled");
  const update = taskCommands.update(task.id, { status: "in_progress" });
  expect(readTaskBoard().tasks[0]?.status).toBe("in_progress");
  expect(await update).toBe(false);
  expect(readTaskBoard().tasks[0]?.status).toBe("settled");
});
