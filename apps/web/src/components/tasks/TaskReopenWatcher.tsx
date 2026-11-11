import { useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent } from "react";

import { useThreadShells } from "../../state/entities";
import { toastManager } from "../ui/toast";
import { lastUserMessageAt, sessionRoute, tasksToReopen } from "./tasks.logic";
import { taskCommands, useTaskBoard } from "./tasksApi";

// Tasks being reopened, so a re-render before the service answers does not reopen one twice.
const reopening = new Set<string>();

/**
 * Moves a settled task back to In progress when the user writes to one of its sessions again.
 * Renders nothing; it lives in the persistent app layout.
 */
export function TaskReopenWatcher() {
  const board = useTaskBoard();
  const shells = useThreadShells();
  const navigate = useNavigate();
  const shellByKey = new Map(shells.map((shell) => [`${shell.environmentId}:${shell.id}`, shell]));
  const shellById = new Map(shells.map((shell) => [shell.id as string, shell]));
  const due =
    board.state === "ready"
      ? tasksToReopen(board.tasks, (session) => {
          const route = sessionRoute(session.link);
          const shell = route
            ? shellByKey.get(`${route.environmentId}:${route.threadId}`)
            : shellById.get(session.thread_id);
          return shell
            ? {
                title: shell.title,
                settled: shell.settledOverride === "settled",
                lastUserMessageAt: lastUserMessageAt(shell),
              }
            : null;
        })
      : [];
  const dueKey = due.map(({ task }) => `${task.id}:${task.settled_at}`).join(",");

  const reopen = useEffectEvent(async () => {
    const failures = await Promise.all(
      due.map(async ({ task, sessionTitle }) => {
        if (!task.settled_at) return false;
        const key = `${task.id}:${task.settled_at}`;
        if (reopening.has(key)) return true;
        reopening.add(key);
        const reopened = await taskCommands
          .update(task.id, {
            status: "in_progress",
            status_note: `Reopened: "${sessionTitle}" is active again`,
            expected_settled_at: task.settled_at,
          })
          .finally(() => reopening.delete(key));
        if (!reopened) return true;
        toastManager.add({
          type: "info",
          title: `Task #${task.id} reopened`,
          description: `"${sessionTitle}" is active again, so "${task.title}" is back in progress.`,
          actionProps: {
            children: "View task",
            onClick: () => void navigate({ to: "/tasks", search: { task: task.id } }),
          },
        });
        return false;
      }),
    );
    return failures.some(Boolean);
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- writes to the separate task service when the session shells say a settled task is active again
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 5_000;
    const attempt = async () => {
      const failed = await reopen();
      if (cancelled || !failed) return;
      timer = setTimeout(() => void attempt(), delay);
      delay = Math.min(delay * 2, 60_000);
    };
    if (dueKey) void attempt();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dueKey]);

  return null;
}
