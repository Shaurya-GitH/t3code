import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, type ScopedThreadRef, ThreadId } from "@t3tools/contracts";

import { requestConfirmDialog } from "../../confirmDialog";
import { useThreadActions } from "../../hooks/useThreadActions";
import * as ThreadUndo from "@t3tools/client-runtime/state/thread-undo";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { environmentThreadShells, threadEnvironment, threadFamilies } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { waitForAtomValue } from "../../state/waitForAtomValue";
import { readThreadShell, waitForThreadShell } from "../../state/entities";
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
  const stopThread = useOrchestrationCommand(threadEnvironment.interruptTurn, {
    reportFailure: false,
  });
  return async (task: Task, patch: TaskPatch) => {
    if (patch.status !== "settled" || task.status === "settled") {
      return taskCommands.update(task.id, patch);
    }
    const refs = task.sessions.flatMap((session) => {
      const route = sessionRoute(session.link);
      return route
        ? [scopeThreadRef(EnvironmentId.make(route.environmentId), ThreadId.make(route.threadId))]
        : [];
    });
    const mounts = refs.filter((ref) => sessionState(ref) === "unknown");
    const releases = mounts.map((ref) =>
      threadFamilies.mount(appAtomRegistry, ref.environmentId, ref.threadId),
    );
    return Promise.all(mounts.map((ref) => waitForThreadShell(ref)))
      .then(async () => {
        const plan = planTaskSettle(refs, sessionState);
        const unresolved = plan.unknown + task.sessions.length - refs.length;
        const running = new Set(plan.settle.filter((ref) => sessionState(ref) === "running"));
        if (plan.running > 0) {
          const confirmed = await requestConfirmDialog(
            `${plural(plan.running, "session")} of "${task.title}" ${plan.running === 1 ? "is" : "are"} still running or waiting on input. Stop ${plan.running === 1 ? "it" : "them"} and settle the task and all ${plural(plan.settle.length, "open session")}? Stopped work cannot be resumed by Undo.`,
          );
          if (!confirmed) return false;
        }
        const ready = await Promise.all(
          plan.settle.map(async (ref) => {
            if (sessionState(ref) === "running") {
              if (!running.has(ref)) return false;
              const stopped = await stopThread({
                environmentId: ref.environmentId,
                input: { threadId: ref.threadId },
              });
              if (stopped._tag !== "Success") return false;
              return waitForAtomValue({
                registry: appAtomRegistry,
                atom: environmentThreadShells.threadShellAtom(ref),
                predicate: (thread) =>
                  thread !== null &&
                  !thread.hasPendingApprovals &&
                  (thread.runtime === null ||
                    !["preparing", "starting", "running", "waiting"].includes(
                      thread.runtime.status,
                    )),
                timeoutMs: 5_000,
              });
            }
            return sessionState(ref) !== "unknown";
          }),
        );
        if (ready.some((value) => !value)) {
          toastManager.add({
            type: "warning",
            title: `Task #${task.id} was not settled`,
            description:
              "Some sessions are still busy or unavailable. Stop running work and answer or cancel pending requests before trying again.",
          });
          return false;
        }
        const results = await Promise.all(plan.settle.map((ref) => settleThread(ref)));
        const successful = results.flatMap((result) =>
          result?._tag === "Success" ? [result.value] : [],
        );
        const failed = results.length - successful.length;
        if (failed > 0 || !(await taskCommands.update(task.id, patch))) {
          await Promise.all(successful.map((result) => result.undo()));
          if (failed > 0)
            toastManager.add({
              type: "warning",
              title: `Task #${task.id} was not settled`,
              description: `${plural(failed, "session")} could not be settled. Stop any running work and answer or cancel pending requests before trying again.`,
            });
          return false;
        }
        let unsubscribe = () => {};
        let undoing = false;
        const canUndo = () => successful.every((result) => result.canUndo());
        const toastId = toastManager.add({
          type: "success",
          title: `Settled task #${task.id}`,
          // Sessions that cannot be found (deleted, or on a machine not connected) are left alone.
          description:
            [
              successful.length > 0
                ? `${plural(successful.length, "session")} settled with it.`
                : null,
              unresolved > 0
                ? `${plural(unresolved, "linked session")} could not be found and ${unresolved === 1 ? "was" : "were"} left alone.`
                : null,
            ]
              .filter(Boolean)
              .join(" ") || undefined,
          timeout: 5_000,
          onClose: () => unsubscribe(),
          actionProps: {
            children: "Undo",
            onClick: async () => {
              if (undoing || !canUndo()) return;
              undoing = true;
              toastManager.close(toastId);
              unsubscribe();
              await Promise.all([
                ...successful.map((result) => result.undo()),
                taskCommands.update(task.id, { status: task.status }),
              ]);
            },
          },
        });
        if (successful.length > 0)
          unsubscribe = ThreadUndo.subscribe(() => {
            if (!canUndo()) {
              toastManager.close(toastId);
              unsubscribe();
            }
          });
        if (!canUndo()) {
          toastManager.close(toastId);
          unsubscribe();
        }
        return true;
      })
      .finally(() => {
        for (const release of releases) release();
      });
  };
}
