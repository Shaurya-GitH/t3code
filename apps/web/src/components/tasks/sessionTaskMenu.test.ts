import { describe, expect, it } from "vite-plus/test";

import { buildSessionTaskMenuItem, isTaskMenuId, withSessionTaskMenu } from "./sessionTaskMenu";
import type { Task } from "./tasksApi";

const task = (id: number, overrides: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  notes: "",
  status: "todo",
  status_note: "",
  source: "manual",
  position: 0,
  color: "pink",
  updated_at: "",
  sessions: [],
  criteria: [],
  events: [],
  ...overrides,
});
const on = (threadId: string) => [{ thread_id: threadId, title: "", link: "" }];

describe("session task menu", () => {
  it("offers open tasks to a session without one, and leaves settled tasks out", () => {
    const item = buildSessionTaskMenuItem([task(1), task(2, { status: "settled" })], "t1");
    expect(item?.label).toBe("Add to task");
    expect(item?.children?.map((child) => child.id)).toEqual(["task:link:1"]);
  });

  it("ticks the session's task and offers a way out", () => {
    const item = buildSessionTaskMenuItem([task(1), task(2, { sessions: on("t1") })], "t1");
    expect(item?.label).toBe("Change task");
    expect(item?.children?.map((child) => [child.id, child.checked ?? false])).toEqual([
      ["task:link:1", false],
      ["task:link:2", true],
      ["task:unlink", false],
    ]);
  });

  it("shows a settled current task ticked but not choosable", () => {
    const item = buildSessionTaskMenuItem(
      [task(1), task(2, { status: "settled", sessions: on("t1") })],
      "t1",
    );
    expect(item?.children?.[0]).toMatchObject({ id: "task:link:2", checked: true, disabled: true });
  });

  it("is disabled when there is no open task", () => {
    expect(buildSessionTaskMenuItem([task(1, { status: "settled" })], "t1")).toMatchObject({
      disabled: true,
    });
  });

  it("shortens long titles", () => {
    const item = buildSessionTaskMenuItem([task(1, { title: "x".repeat(80) })], "t1");
    expect(item?.children?.[0]?.label.length).toBe(48);
  });

  it("sits above Rename, and stays out when the service is down", () => {
    const items = [
      { id: "pin", label: "Pin" },
      { id: "rename", label: "Rename" },
    ] as const;
    const menu = { id: "task" as const, label: "Add to task" };
    expect(withSessionTaskMenu(items, menu).map((item) => item.id)).toEqual([
      "pin",
      "task",
      "rename",
    ]);
    expect(withSessionTaskMenu(items, null)).toBe(items);
  });

  it("tells task picks from thread actions", () => {
    expect(isTaskMenuId("task:link:3")).toBe(true);
    expect(isTaskMenuId("rename")).toBe(false);
  });
});
