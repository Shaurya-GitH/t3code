import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import { TaskColorPicker } from "./TaskColorPicker";
import { taskCommands, useTaskBoard, type Task } from "./tasksApi";

vi.mock("./tasksApi", () => ({
  useTaskBoard: vi.fn(),
  taskCommands: { update: vi.fn() },
}));

function setup() {
  vi.clearAllMocks();
  const task: Task = {
    id: 1,
    title: "First",
    notes: "",
    status: "todo",
    status_note: "",
    source: "manual",
    position: 0,
    color: "#f425f4",
    updated_at: "2026-11-11T00:00:00.000Z",
    sessions: [],
    criteria: [],
    events: [],
  };
  vi.mocked(useTaskBoard).mockReturnValue({
    state: "ready",
    tasks: [task, { ...task, id: 2, title: "Second", color: "#6ef7f7" }],
  });
  vi.mocked(taskCommands.update).mockResolvedValue(true);
  return task;
}

it("restores the saved color when auto leaves it unchanged after a rejected preview", async () => {
  const task = setup();
  await using screen = await render(<TaskColorPicker task={task} />);
  await screen.getByRole("button", { name: "Change the color of task 1" }).click();
  const hex = page.getByRole("textbox", { name: "Task color hex" });
  await hex.fill("#6ef7f7");
  await expect
    .element(page.getByRole("status"))
    .toHaveTextContent("Too close to #2 Second. Pick a color farther away.");
  expect(taskCommands.update).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Most distinct color" }).click();
  await screen.rerender(<TaskColorPicker task={{ ...task }} />);
  await expect.element(hex).toHaveValue(task.color);
  await expect
    .element(page.getByRole("status"))
    .toHaveTextContent("Distinct from every open task.");
  expect(taskCommands.update).toHaveBeenCalledExactlyOnceWith(1, { color: "auto" });
});

it("saves a keyboard hue change after clicking the marker padding", async () => {
  const task = setup();
  await using screen = await render(<TaskColorPicker task={task} />);
  await screen.getByRole("button", { name: "Change the color of task 1" }).click();
  const hue = page.getByRole("slider", { name: "Task color hue" });
  const markers = hue.element().closest<HTMLElement>(".pt-2");
  if (!markers) throw new Error("Hue marker wrapper is missing");
  await act(() => {
    markers.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1 }),
    );
    markers.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 1 }),
    );
    hue.element().focus();
  });
  await userEvent.keyboard("{ArrowRight}");
  await vi.waitFor(() => expect(taskCommands.update).toHaveBeenCalledOnce());
  expect(taskCommands.update).toHaveBeenCalledWith(1, {
    color: expect.stringMatching(/^#[0-9a-f]{6}$/),
  });
});
