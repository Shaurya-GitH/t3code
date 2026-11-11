import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";

import { requestConfirmDialog } from "../../confirmDialog";
import { useThreadActions } from "../../hooks/useThreadActions";
import { useThreadUndoNotice } from "../../hooks/showThreadUndoNotice";
import { readThreadShell } from "../../state/entities";
import { resolveThreadStatusPill } from "../Sidebar.logic";
import { toastManager } from "../ui/toast";
import { planTaskSettle, sessionRoute, type SessionSettleState } from "./tasks.logic";
import { taskCommands, type Task, type TaskPatch } from "./tasksApi";

// Labels of a session an agent is still busy in, or that waits on the user.
const RUNNING_LABELS = new Set([
  "Working",
  "Connecting",
  "Waiting",
  "Pending Approval",
  "Awaiting Input",
  "Guest Request",
]);

function sessionState(ref: ScopedThreadRef): SessionSettleState {
  const thread = readThreadShell(ref);
  if (!thread) return "unknown";
  if (thread.settledOverride === "settled") return "settled";
  const pill = resolveThreadStatusPill({ thread });
  return pill && RUNNING_LABELS.has(pill.label) ? "running" : "open";
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * Every task status change goes through here. Settling a task settles its open sessions too,
 * asking first when one is still running; settling its sessions never settles the task.
 */
export function useTaskStatus() {
  const { settleThread } = useThreadActions();
  return async (task: Task, patch: TaskPatch) => {
    if (patch.status !== "settled" || task.status === "settled") {
      return taskCommands.update(task.id, patch);
    }
    const refs = task.sessions.flatMap((session) => {
      const route = sessionRoute(session.link);
      return route
        ? [scopeThreadRef(route.environmentId as EnvironmentId, route.threadId as ThreadId)]
        : [];
    });
    const plan = planTaskSettle(refs, sessionState);
    if (plan.running > 0) {
      const confirmed = await requestConfirmDialog(
        `${plural(plan.running, "session")} of "${task.title}" ${plan.running === 1 ? "is" : "are"} still running. Settle the task and all ${plural(plan.settle.length, "open session")}?`,
      );
      if (!confirmed) return false;
    }
    if (!(await taskCommands.update(task.id, patch))) return false;
    const results = await Promise.all(plan.settle.map((ref) => settleThread(ref)));
    const failed = results.filter((result) => result._tag === "Failure").length;
    const settled = plan.settle.length - failed;
    // Sessions this app has not loaded (deleted, or on a machine never connected) are left alone.
    const notSettled = failed;
    const toastId = toastManager.add({
      type: notSettled > 0 ? "warning" : "success",
      title: `Settled task #${task.id}`,
      description: [
        settled > 0 ? `${plural(settled, "session")} settled with it.` : null,
        notSettled > 0
          ? `${plural(notSettled, "session")} could not be settled; settle ${notSettled === 1 ? "it" : "them"} from the sidebar.`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
      actionProps: {
        children: "Undo",
        onClick: () => {
          toastManager.close(toastId);
          void taskCommands.update(task.id, { status: task.status });
          // T3's own notice restores the sessions, pins and snoozes included.
          const notice = useThreadUndoNotice.getState().notice;
          if (settled > 0 && notice?.action === "Settled") void notice.undo();
        },
      },
    });
    return true;
  };
}
