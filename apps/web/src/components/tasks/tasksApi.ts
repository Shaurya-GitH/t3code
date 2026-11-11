import { useSyncExternalStore } from "react";

import { requestConfirmDialog } from "../../confirmDialog";
import { toastManager } from "../ui/toast";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "settled";
export type TaskColor = "pink" | "teal" | "purple" | "lime" | "orange" | "fuchsia";

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
  readonly color: TaskColor;
  readonly updated_at: string;
  /** When the task was settled; absent from services older than the field. */
  readonly settled_at?: string | null;
  readonly sessions: ReadonlyArray<TaskSession>;
  readonly criteria: ReadonlyArray<TaskCriterion>;
  readonly events: ReadonlyArray<TaskEvent>;
}

export interface TaskBoardSnapshot {
  readonly state: "loading" | "ready" | "offline";
  readonly tasks: ReadonlyArray<Task>;
}

// The task service (github.com/Shaurya-GitH/t3-tasks) runs beside T3 Code on this machine; agents
// write to it through its MCP tools. ponytail: called directly on loopback, so a remote client
// (phone, app.t3.codes) sees the board as offline. Move it behind a server RPC if that matters.
const TASKS_API = "http://127.0.0.1:4777/api";
const POLL_MS = 2500;

let snapshot: TaskBoardSnapshot = { state: "loading", tasks: [] };
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
    const data = JSON.parse(body) as Pick<TaskBoardSnapshot, "tasks">;
    // The service is a separate process; a shape change must show "offline", not crash the app.
    if (!Array.isArray(data?.tasks)) throw new Error("unexpected /tasks response");
    publish({ state: "ready", tasks: data.tasks });
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

/** The board as last read, for code outside React such as a context menu. */
export function readTaskBoard(): TaskBoardSnapshot {
  return snapshot;
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
  readonly status_note?: string;
  readonly position?: number;
  readonly color?: TaskColor;
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
  /** Adds a session to a task; a session has one task, so this moves it from any other. */
  linkSession: (input: { threadId: string; taskId: number; title: string; link: string }) =>
    mutate("POST", "/sessions", {
      thread_id: input.threadId,
      task_id: input.taskId,
      title: input.title,
      link: input.link,
    }),
  unlinkSession: (threadId: string) =>
    mutate("DELETE", `/sessions/${encodeURIComponent(threadId)}`),
};
