import type { Task, TaskStatus } from "./tasksApi";

export const TASK_COLUMNS: ReadonlyArray<{ status: TaskStatus; label: string }> = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "blocked", label: "Blocked" },
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

/**
 * Splits the sidebar's Active and Working threads by task. A thread linked to an open task goes
 * to that task's folder and leaves `rest`, so every thread shows once. Folders follow board order.
 */
export function groupThreadsByTask<TThread>(
  tasks: ReadonlyArray<Task>,
  threads: { readonly active: ReadonlyArray<TThread>; readonly working: ReadonlyArray<TThread> },
  keyOf: (thread: TThread) => string,
): {
  readonly folders: ReadonlyArray<{
    readonly task: Task;
    readonly active: ReadonlyArray<TThread>;
    readonly working: ReadonlyArray<TThread>;
  }>;
  readonly rest: {
    readonly active: ReadonlyArray<TThread>;
    readonly working: ReadonlyArray<TThread>;
  };
} {
  const taskIdByThreadKey = new Map<string, number>();
  for (const task of tasks) {
    if (task.status === "settled") continue;
    for (const session of task.sessions) {
      const route = sessionRoute(session.link);
      if (route) taskIdByThreadKey.set(`${route.environmentId}:${route.threadId}`, task.id);
    }
  }
  if (taskIdByThreadKey.size === 0) return { folders: [], rest: threads };
  const inTask = (taskId: number) => (thread: TThread) =>
    taskIdByThreadKey.get(keyOf(thread)) === taskId;
  const unassigned = (thread: TThread) => !taskIdByThreadKey.has(keyOf(thread));
  return {
    folders: tasks
      .map((task) => ({
        task,
        active: threads.active.filter(inTask(task.id)),
        working: threads.working.filter(inTask(task.id)),
      }))
      .filter((folder) => folder.active.length + folder.working.length > 0),
    rest: {
      active: threads.active.filter(unassigned),
      working: threads.working.filter(unassigned),
    },
  };
}
