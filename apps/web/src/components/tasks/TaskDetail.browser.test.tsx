import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { TaskDetail } from "./TaskDetail";
import { taskCommands, type Task } from "./tasksApi";

vi.mock("../../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => vi.fn() }));
vi.mock("../../state/entities", () => ({ useProjects: () => [], useThreadShell: () => null }));
vi.mock("./TaskBoard", () => ({ TaskStatusDot: () => null }));
vi.mock("./SidebarTaskMark", () => ({ useShowTaskInSidebar: () => vi.fn() }));
vi.mock("./LinkSessionPicker", () => ({ LinkSessionPicker: () => null }));
vi.mock("./useTaskStatus", () => ({ useTaskStatus: () => vi.fn() }));

it("locks the note draft during saving and restores editing after success or failure", async () => {
  const task: Task = {
    id: 1,
    title: "Settled task",
    notes: "",
    status: "settled",
    status_note: "",
    source: "manual",
    position: 0,
    color: "#ff0000",
    updated_at: "",
    sessions: [],
    criteria: [],
    events: [],
  };
  await using screen = await render(<TaskDetail task={task} onClose={() => {}} />);
  using addNote = vi.spyOn(taskCommands, "addNote");
  const draft = screen.getByRole("textbox", { name: "Add a note" });
  const submit = screen.getByRole("button", { name: "Add note", exact: true });

  for (const saved of [false, true]) {
    let finish!: (saved: boolean) => void;
    addNote.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    await draft.fill("Keep this note");
    await submit.click();
    await expect.element(draft).toBeDisabled();
    await expect.element(draft).toHaveValue("Keep this note");
    await expect.element(submit).toBeDisabled();

    await act(() => finish(saved));
    await expect.element(draft).toBeEnabled();
    await expect.element(draft).toHaveValue(saved ? "" : "Keep this note");
  }
});
