import { useSyncExternalStore } from "react";

import { requestConfirmDialog } from "../../confirmDialog";
import { toastManager } from "../ui/toast";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "settled";

export interface TaskSession {
  readonly thread_id: string;
  readonly title: string;
  readonly link: string;
}

export interface TaskCriterion {
  readonly id: number;
  readonly text: string;
  readonly done: boolean;
}

export interface TaskEvent {
  readonly at: string;
  readonly actor: "agent" | "human";
  readonly text: string;
}

export interface Task {
  readonly id: number;
  readonly title: string;
  readonly notes: string;
  readonly status: TaskStatus;
  readonly status_note: string;
  readonly source: string;
  readonly position: number;
  readonly updated_at: string;
  readonly sessions: ReadonlyArray<TaskSession>;
  readonly criteria: ReadonlyArray<TaskCriterion>;
  readonly events: ReadonlyArray<TaskEvent>;
}

export interface TaskSuggestion {
  readonly id: number;
  readonly title: string;
  readonly reason: string;
}

export interface TaskBoardSnapshot {
  readonly state: "loading" | "ready" | "offline";
  readonly tasks: ReadonlyArray<Task>;
  readonly suggestions: ReadonlyArray<TaskSuggestion>;
}

// The task service (github.com/Shaurya-GitH/t3-tasks) runs beside T3 Code on this machine; agents
// write to it through its MCP tools. ponytail: called directly on loopback, so a remote client
// (phone, app.t3.codes) sees the board as offline. Move it behind a server RPC if that matters.
const TASKS_API = "http://127.0.0.1:4777/api";
const POLL_MS = 2500;

let snapshot: TaskBoardSnapshot = { state: "loading", tasks: [], suggestions: [] };
let lastBody = "";
let pollTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function publish(next: TaskBoardSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

async function request(method: string, path: string, body?: unknown): Promise<string> {
  const response = await fetch(`${TASKS_API}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    const error = (JSON.parse(text) as { error?: string }).error;
    throw new Error(error ?? `The task service answered ${response.status}.`);
  }
  return text;
}

async function refreshTaskBoard(): Promise<void> {
  try {
    const body = await request("GET", "/tasks");
    if (body === lastBody && snapshot.state === "ready") return;
    lastBody = body;
    const data = JSON.parse(body) as Pick<TaskBoardSnapshot, "tasks" | "suggestions">;
    publish({ state: "ready", tasks: data.tasks, suggestions: data.suggestions });
  } catch {
    lastBody = "";
    if (snapshot.state !== "offline") publish({ ...snapshot, state: "offline" });
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (pollTimer === null) {
    void refreshTaskBoard();
    pollTimer = setInterval(() => {
      if (!document.hidden) void refreshTaskBoard();
    }, POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

/** The board, refreshed while anything on screen reads it. */
export function useTaskBoard(): TaskBoardSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}

async function mutate(method: string, path: string, body?: unknown): Promise<boolean> {
  try {
    await request(method, path, body);
    await refreshTaskBoard();
    return true;
  } catch (error) {
    toastManager.add({
      type: "error",
      title: "Could not update the task",
      description: error instanceof Error ? error.message : "The task service did not answer.",
    });
    await refreshTaskBoard();
    return false;
  }
}

export interface TaskPatch {
  readonly title?: string;
  readonly notes?: string;
  readonly status?: TaskStatus;
  readonly position?: number;
}

export const taskCommands = {
  create: (input: { title: string; status?: TaskStatus }) => mutate("POST", "/tasks", input),
  update: (id: number, patch: TaskPatch) => {
    // Show a move at once; the refresh that follows corrects it if the service refused.
    publish({
      ...snapshot,
      tasks: snapshot.tasks
        .map((task) => (task.id === id ? { ...task, ...patch } : task))
        .toSorted((a, b) => a.position - b.position || b.id - a.id),
    });
    return mutate("PATCH", `/tasks/${id}`, patch);
  },
  /** Deleting a ticket drops its criteria and history, so it asks first. */
  remove: async (task: Pick<Task, "id" | "title">) => {
    const confirmed = await requestConfirmDialog(
      `Delete task #${task.id} "${task.title}"? Its criteria and history go with it.`,
      { variant: "destructive" },
    );
    return confirmed ? mutate("DELETE", `/tasks/${task.id}`) : false;
  },
  addCriterion: (taskId: number, text: string) =>
    mutate("POST", `/tasks/${taskId}/criteria`, { text }),
  updateCriterion: (id: number, patch: { text?: string; done?: boolean }) =>
    mutate("PATCH", `/criteria/${id}`, patch),
  removeCriterion: (id: number) => mutate("DELETE", `/criteria/${id}`),
  unlinkSession: (threadId: string) =>
    mutate("DELETE", `/sessions/${encodeURIComponent(threadId)}`),
  acceptSuggestion: (id: number) => mutate("POST", `/suggestions/${id}/accept`),
  dismissSuggestion: (id: number) => mutate("DELETE", `/suggestions/${id}`),
};
