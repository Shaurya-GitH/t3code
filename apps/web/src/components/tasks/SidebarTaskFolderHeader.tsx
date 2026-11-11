import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { TaskStatusDot } from "./TaskBoard";
import type { Task } from "./tasksApi";

/** The folder's sidebar tree row; its thread rows name it as their parent. */
export function sidebarTaskFolderRowId(taskId: number) {
  return `task-folder:${taskId}`;
}

/** The folder row of a task in the thread list: its sessions sit under it, nowhere else. */
export function SidebarTaskFolderHeader({
  task,
  collapsed,
  count,
  onToggle,
}: {
  task: Task;
  collapsed: boolean;
  count: number;
  onToggle: (taskId: number) => void;
}) {
  const navigate = useNavigate();
  return (
    <li className="mt-2 flex list-none items-center first:mt-0">
      <button
        type="button"
        data-sidebar-row={sidebarTaskFolderRowId(task.id)}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Expand" : "Collapse"} task ${task.title}`}
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-(--control-radius) text-sidebar-muted-foreground outline-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={() => onToggle(task.id)}
      >
        <ChevronRightIcon
          aria-hidden
          className={cn("size-3.5 transition-transform", !collapsed && "rotate-90")}
        />
      </button>
      <button
        type="button"
        aria-label={`Open task ${task.id}: ${task.title}`}
        className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-(--control-radius) pe-(--sidebar-row-content-inset) ps-1 text-left outline-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={() => void navigate({ to: "/tasks", search: { task: task.id } })}
      >
        <TaskStatusDot status={task.status} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-sidebar-foreground/90">
          {task.title}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-sidebar-muted-foreground">{count}</span>
      </button>
    </li>
  );
}
