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
  return match?.[1] && match[2] ? { environmentId: match[1], threadId: match[2] } : null;
}

/** The prompt of a thread started from a ticket, so the session links itself first. */
export function taskSessionPrompt(task: Task): string {
  return `Work on task #${task.id}: ${task.title}\n\nFirst link this session to the task (task_link with task_id ${task.id}) and read it (task_get).`;
}
