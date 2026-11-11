import { useNavigate } from "@tanstack/react-router";
import { XIcon } from "lucide-react";
import { create } from "zustand";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { TASK_COLOR_HEX } from "./tasks.logic";
import type { Task } from "./tasksApi";

/** The task the sidebar shows sessions of; null shows every session. */
export const useSidebarTaskFilter = create<{ taskId: number | null }>(() => ({ taskId: null }));

/** The task's color on the left edge of a session row. Clicking it shows only that task's sessions. */
export function SidebarTaskMark({ task }: { task: Task }) {
  const settled = task.status === "settled";
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  const label = `#${task.id} ${task.title}${settled ? " (settled)" : ""}`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`Task ${label}. Show only its sessions`}
            className="group/task-mark absolute inset-y-0 left-0 z-20 flex w-2.5 cursor-pointer items-center outline-none"
            onPointerDown={stop}
            onKeyDown={stop}
            onClick={(event) => {
              event.stopPropagation();
              useSidebarTaskFilter.setState({ taskId: task.id });
            }}
          />
        }
      >
        <span
          aria-hidden
          className={cn(
            "ms-0.5 h-[calc(100%-12px)] w-[3px] rounded-full transition-[width] group-hover/task-mark:w-[5px] group-focus-visible/task-mark:w-[5px]",
            settled && "opacity-40",
          )}
          style={{ backgroundColor: TASK_COLOR_HEX[task.color] }}
        />
      </TooltipTrigger>
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  );
}

/** Shown above the thread list while it is narrowed to one task. */
export function SidebarTaskFilterChip({ task }: { task: Task }) {
  const navigate = useNavigate();
  return (
    <li className="mb-1 flex list-none items-center gap-1 rounded-(--control-radius) bg-sidebar-row-hover ps-2.5 text-sm">
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: TASK_COLOR_HEX[task.color] }}
      />
      <button
        type="button"
        aria-label={`Open task #${task.id}: ${task.title}`}
        className="min-w-0 flex-1 cursor-pointer truncate py-1.5 text-left font-medium text-sidebar-foreground outline-none hover:underline focus-visible:underline"
        onClick={() => void navigate({ to: "/tasks", search: { task: task.id } })}
      >
        {task.title}
      </button>
      <button
        type="button"
        aria-label="Show every session"
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-(--control-radius) text-sidebar-muted-foreground outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={() => useSidebarTaskFilter.setState({ taskId: null })}
      >
        <XIcon aria-hidden className="size-3.5" />
      </button>
    </li>
  );
}
