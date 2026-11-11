import { useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent } from "react";

import { useQuietThreadShells } from "../../state/entities";
import { toastManager } from "../ui/toast";
import { sessionRoute, tasksToReopen } from "./tasks.logic";
import { taskCommands, useTaskBoard } from "./tasksApi";

// Tasks being reopened, so a re-render before the service answers does not reopen one twice.
const reopening = new Set<number>();

/**
 * Moves a settled task back to In progress when the user writes to one of its sessions again.
 * Renders nothing; it lives in the sidebar, which is mounted whenever the app is.
 */
export function TaskReopenWatcher() {
  const board = useTaskBoard();
  const shells = useQuietThreadShells();
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
                lastUserMessageAt: shell.latestUserAuthoredMessageAt ?? shell.latestUserMessageAt,
              }
            : null;
        })
      : [];
  const dueKey = due.map(({ task }) => task.id).join(",");

  const reopen = useEffectEvent(() => {
    for (const { task, sessionTitle } of due) {
      if (reopening.has(task.id)) continue;
      reopening.add(task.id);
      void taskCommands
        .update(task.id, {
          status: "in_progress",
          status_note: `Reopened: "${sessionTitle}" is active again`,
        })
        .then((reopened) => {
          if (!reopened) return;
          toastManager.add({
            type: "info",
            title: `Task #${task.id} reopened`,
            description: `"${sessionTitle}" is active again, so "${task.title}" is back in progress.`,
            actionProps: {
              children: "View task",
              onClick: () => void navigate({ to: "/tasks", search: { task: task.id } }),
            },
          });
        })
        .finally(() => reopening.delete(task.id));
    }
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- writes to the separate task service when the session shells say a settled task is active again
  useEffect(() => {
    if (dueKey) reopen();
  }, [dueKey]);

  return null;
}
