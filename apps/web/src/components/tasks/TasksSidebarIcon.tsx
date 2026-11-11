import { ListTodoIcon } from "lucide-react";

import { useTaskBoard } from "./tasksApi";

/** The Tasks icon in the sidebar. The dot says something waits for the user: a suggestion, or a task to settle. */
export function TasksSidebarIcon() {
  const board = useTaskBoard();
  const waiting =
    board.suggestions.length > 0 || board.tasks.some((task) => task.status === "done");
  return (
    <span className="relative flex">
      <ListTodoIcon className="size-4" />
      {waiting ? (
        <span
          aria-label="Something waits for you"
          role="img"
          className="absolute -end-1 -top-1 size-1.5 rounded-full bg-info"
        />
      ) : null}
    </span>
  );
}
