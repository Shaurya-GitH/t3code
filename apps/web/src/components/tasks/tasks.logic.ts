import type { Task, TaskStatus } from "./tasksApi";

export const TASK_COLUMNS: ReadonlyArray<{ status: TaskStatus; label: string }> = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "blocked", label: "Blocked" },
  { status: "staging", label: "Staging" },
  { status: "done", label: "Done" },
  { status: "settled", label: "Settled" },
];

export function taskStatusLabel(status: TaskStatus): string {
  return TASK_COLUMNS.find((column) => column.status === status)?.label ?? status;
}

/** Every word of the query must appear somewhere in the ticket. `#12` matches the id. */
export function filterTasks(tasks: ReadonlyArray<Task>, query: string): ReadonlyArray<Task> {
  const words = query.toLowerCase().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return tasks;
  return tasks.filter((task) => {
    const haystack = [
      `#${task.id}`,
      task.title,
      task.notes,
      task.status_note,
      task.source,
      ...task.criteria.map((criterion) => criterion.text),
      ...task.sessions.map((session) => session.title),
    ]
      .join("\n")
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * The position that puts a card at `index` of a column (the column without the
 * moved card). Positions sort ascending and are sparse, so a move writes one row.
 */
export function positionForDrop(column: ReadonlyArray<Task>, index: number): number {
  const before = column[index - 1]?.position;
  const after = column[index]?.position;
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (after !== undefined) return after - 1;
  if (before !== undefined) return before + 1;
  return 0;
}

export function criteriaProgress(task: Task): { met: number; total: number } {
  return {
    met: task.criteria.filter((criterion) => criterion.done).length,
    total: task.criteria.length,
  };
}

/** The app route of a session, read from the thread link the agent recorded. */
export function sessionRoute(link: string): { environmentId: string; threadId: string } | null {
  const match = /\/threads\/([^/?#]+)\/([^/?#]+)/u.exec(link);
  // Thread ids can carry characters the link escapes, such as the colon in `mcp:...`.
  return match?.[1] && match[2]
    ? { environmentId: decodeURIComponent(match[1]), threadId: decodeURIComponent(match[2]) }
    : null;
}

/** The prompt of a thread started from a ticket, so the session links itself first. */
export function taskSessionPrompt(task: Task): string {
  return `Work on task #${task.id}: ${task.title}\n\nFirst link this session to the task (task_link with task_id ${task.id}) and read it (task_get).`;
}

// Named colors from task services before 0.4.0, which sent a name instead of a hex color.
const LEGACY_HEX: Readonly<Record<string, string>> = {
  pink: "#ec4899",
  teal: "#14b8a6",
  purple: "#a855f7",
  lime: "#84cc16",
  orange: "#f97316",
  fuchsia: "#d946ef",
};

/** A task's color as CSS. */
export function taskColor(color: string): string {
  return LEGACY_HEX[color] ?? color;
}

/** The task service refuses an open task's color closer than this to another's (OKLab distance). */
const MIN_COLOR_DISTANCE = 0.08;

function oklab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** How different two hex colors look; the same formula as the task service. */
function colorDistance(a: string, b: string): number {
  const p = oklab(taskColor(a));
  const q = oklab(taskColor(b));
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** The open task whose color is too close to `color`, ignoring `task` itself. */
export function colorClash(
  color: string,
  task: Pick<Task, "id">,
  tasks: ReadonlyArray<Task>,
): Task | undefined {
  return tasks.find(
    (other) =>
      other.id !== task.id &&
      other.status !== "settled" &&
      colorDistance(color, other.color) < MIN_COLOR_DISTANCE,
  );
}

/** The task of each linked session, keyed `environmentId:threadId`. Settled tasks included. */
export function tasksByThreadKey(tasks: ReadonlyArray<Task>): ReadonlyMap<string, Task> {
  const byKey = new Map<string, Task>();
  for (const task of tasks) {
    for (const session of task.sessions) {
      const route = sessionRoute(session.link);
      if (route) byKey.set(`${route.environmentId}:${route.threadId}`, task);
    }
  }
  return byKey;
}

export type SessionSettleState = "open" | "running" | "settled" | "unknown";

/**
 * Which sessions settling a task settles: every open one, running or not. `running` counts the
 * ones an agent is still working in or that wait on the user, which the user confirms first.
 */
export function planTaskSettle<TRef>(
  sessions: ReadonlyArray<TRef>,
  stateOf: (session: TRef) => SessionSettleState,
): { readonly settle: ReadonlyArray<TRef>; readonly running: number; readonly unknown: number } {
  const states = sessions.map((session) => ({ session, state: stateOf(session) }));
  return {
    settle: states
      .filter(({ state }) => state === "open" || state === "running")
      .map(({ session }) => session),
    running: states.filter(({ state }) => state === "running").length,
    unknown: states.filter(({ state }) => state === "unknown").length,
  };
}

/** When the user last wrote to a session, as its server reports it. */
export const lastUserMessageAt = (shell: {
  readonly latestUserMessageAt: string | null;
  readonly latestUserAuthoredMessageAt?: string | null;
}) =>
  shell.latestUserAuthoredMessageAt === undefined
    ? shell.latestUserMessageAt
    : shell.latestUserAuthoredMessageAt;

/** What the reopen rule reads of a session: whether it is settled, and when the user last wrote. */
export interface ReopenSessionState {
  readonly title: string;
  readonly settled: boolean;
  readonly lastUserMessageAt: string | null;
}

/**
 * Settled tasks to reopen: one of their sessions is not settled and the user wrote to it after the
 * task was settled. A session only un-settled (an Undo, a manual un-settle) does not count. A
 * session's settle mark comes from its own server's clock; without one, the task's settle time.
 */
export function tasksToReopen(
  tasks: ReadonlyArray<Task>,
  sessionState: (session: Task["sessions"][number]) => ReopenSessionState | null,
): Array<{ task: Task; sessionTitle: string }> {
  return tasks.flatMap((task) => {
    const settledAt =
      task.status === "settled" && task.settled_at ? Date.parse(task.settled_at) : NaN;
    if (Number.isNaN(settledAt)) return [];
    for (const session of task.sessions) {
      const state = sessionState(session);
      if (!state || state.settled || !state.lastUserMessageAt) continue;
      const last = Date.parse(state.lastUserMessageAt);
      const mark = session.settle_mark;
      const markedAt = typeof mark === "string" ? Date.parse(mark) : NaN;
      if (mark === "" || last > (Number.isNaN(markedAt) ? settledAt : markedAt)) {
        return [{ task, sessionTitle: state.title || session.title || "a session" }];
      }
    }
    return [];
  });
}
