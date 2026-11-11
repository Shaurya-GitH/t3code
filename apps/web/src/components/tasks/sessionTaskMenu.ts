import type { ContextMenuItem, LocalApi, ScopedThreadRef } from "@t3tools/contracts";
import { hostedThreadLink } from "@t3tools/shared/threadLinks";

import { toastManager } from "../ui/toast";
import { taskCommands, readTaskBoard, type Task } from "./tasksApi";

export type TaskMenuId = "task" | "task:unlink" | `task:link:${number}`;

const MAX_LABEL = 48;
const taskLabel = (task: Pick<Task, "id" | "title">) => {
  const label = `#${task.id} ${task.title}`;
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;
};

export function isTaskMenuId(id: string): id is TaskMenuId {
  return id === "task" || id.startsWith("task:");
}

/**
 * The "Add to task" submenu of a session: open tasks, the current one ticked, and a way out.
 * Null while the task service is not answering.
 */
export function buildSessionTaskMenuItem(
  tasks: ReadonlyArray<Task>,
  threadId: string,
): ContextMenuItem<TaskMenuId> | null {
  const current = tasks.find((task) => task.sessions.some((s) => s.thread_id === threadId));
  const open = tasks.filter((task) => task.status !== "settled");
  const choices: ContextMenuItem<TaskMenuId>[] = [
    // A settled task takes no new sessions, but the one this session is on still shows as ticked.
    ...(current && current.status === "settled"
      ? [
          {
            id: `task:link:${current.id}` as const,
            label: `${taskLabel(current)} (settled)`,
            checked: true,
            disabled: true,
          },
        ]
      : []),
    ...open.map((task) => ({
      id: `task:link:${task.id}` as const,
      label: taskLabel(task),
      checked: task.id === current?.id,
    })),
  ];
  if (choices.length === 0) {
    return { id: "task", label: "Add to task", icon: "folder-plus", disabled: true };
  }
  return {
    id: "task",
    label: current ? "Change task" : "Add to task",
    icon: "folder-plus",
    children: [
      ...choices,
      ...(current
        ? [
            {
              id: "task:unlink" as const,
              label: `Remove from #${current.id}`,
              separatorBefore: true,
            },
          ]
        : []),
    ],
  };
}

/** Puts the task submenu just above "Rename thread", where the thread's own settings end. */
export function withSessionTaskMenu<T extends string>(
  items: ReadonlyArray<ContextMenuItem<T>>,
  task: ContextMenuItem<TaskMenuId> | null,
): ReadonlyArray<ContextMenuItem<T | TaskMenuId>> {
  if (!task) return items;
  const at = items.findIndex((item) => item.id === "rename");
  return at < 0 ? [...items, task] : [...items.slice(0, at), task, ...items.slice(at)];
}

/** The context menu of a session row, with its task submenu added. */
export function sessionMenu(api: LocalApi, ref: ScopedThreadRef) {
  return {
    show: <T extends string>(
      items: ReadonlyArray<ContextMenuItem<T>>,
      position?: { x: number; y: number },
    ) => {
      const board = readTaskBoard();
      const task =
        board.state === "ready" ? buildSessionTaskMenuItem(board.tasks, ref.threadId) : null;
      return api.contextMenu.show<T | TaskMenuId>(withSessionTaskMenu(items, task), position);
    },
  };
}

/** Runs a pick from the task submenu. */
export async function runSessionTaskChoice(
  ref: ScopedThreadRef,
  title: string,
  id: TaskMenuId,
): Promise<void> {
  if (id === "task") return;
  const tasks = readTaskBoard().tasks;
  if (id === "task:unlink") {
    const current = tasks.find((task) => task.sessions.some((s) => s.thread_id === ref.threadId));
    if (await taskCommands.unlinkSession(ref.threadId)) {
      toastManager.add({
        type: "success",
        title: current ? `Removed from task #${current.id}` : "Removed from its task",
      });
    }
    return;
  }
  const taskId = Number(id.slice("task:link:".length));
  if (!Number.isInteger(taskId) || taskId <= 0) return;
  const target = tasks.find((task) => task.id === taskId);
  const linked = await taskCommands.linkSession({
    threadId: ref.threadId,
    taskId,
    title,
    link: hostedThreadLink(ref),
  });
  if (linked) {
    toastManager.add({
      type: "success",
      title: target ? `Added to task #${target.id}` : "Added to the task",
      description: target?.title,
    });
  }
}
