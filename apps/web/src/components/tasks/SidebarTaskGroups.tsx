import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { useThreadShell } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import { SidebarGroup } from "../ui/sidebar";
import { TaskStatusDot } from "./TaskBoard";
import { sessionRoute } from "./tasks.logic";
import { useTaskBoard, type Task, type TaskSession } from "./tasksApi";

/**
 * Sessions grouped by the task they work on, above the thread list. The list below keeps its own
 * grouping and every thread stays in it; this is a second way in, one level up.
 */
export function SidebarTaskGroups({ activeThreadKey }: { activeThreadKey: string | null }) {
  const board = useTaskBoard();
  // ponytail: collapsed groups reset on reload; persist in client settings if that annoys.
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<number>>(new Set());
  const groups = board.tasks.filter(
    (task) => task.status !== "settled" && task.sessions.length > 0,
  );
  if (groups.length === 0) return null;
  return (
    <SidebarGroup aria-label="Tasks">
      <div className="flex flex-col gap-1">
        <h2 className="px-(--sidebar-row-content-inset) text-xs font-medium text-sidebar-muted-foreground">
          Tasks
        </h2>
        <ul className="flex flex-col gap-px">
          {groups.map((task) => (
            <TaskGroup
              key={task.id}
              task={task}
              collapsed={collapsedIds.has(task.id)}
              activeThreadKey={activeThreadKey}
              onToggle={() =>
                setCollapsedIds((current) => {
                  const next = new Set(current);
                  if (!next.delete(task.id)) next.add(task.id);
                  return next;
                })
              }
            />
          ))}
        </ul>
      </div>
    </SidebarGroup>
  );
}

function TaskGroup({
  task,
  collapsed,
  activeThreadKey,
  onToggle,
}: {
  task: Task;
  collapsed: boolean;
  activeThreadKey: string | null;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  return (
    <li className="group/task-group list-none">
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} task ${task.title}`}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-(--control-radius) text-sidebar-muted-foreground outline-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={onToggle}
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
          <span className="shrink-0 text-xs tabular-nums text-sidebar-muted-foreground">
            {task.sessions.length}
          </span>
        </button>
      </div>
      {collapsed ? null : (
        <ul className="flex flex-col gap-px ps-6">
          {task.sessions.map((session) => (
            <TaskGroupSession
              key={session.thread_id}
              session={session}
              activeThreadKey={activeThreadKey}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function TaskGroupSession({
  session,
  activeThreadKey,
}: {
  session: TaskSession;
  activeThreadKey: string | null;
}) {
  const navigate = useNavigate();
  const route = sessionRoute(session.link);
  const ref = route
    ? scopeThreadRef(route.environmentId as EnvironmentId, route.threadId as ThreadId)
    : null;
  const shell = useThreadShell(ref);
  // A session whose thread is gone (deleted, or on another machine) has nowhere to go.
  if (ref === null || shell === null) return null;
  const active = scopedThreadKey(ref) === activeThreadKey;
  const working =
    shell.runtime != null &&
    ["preparing", "queued", "starting", "running", "waiting"].includes(shell.runtime.status);
  return (
    <li className="list-none">
      <button
        type="button"
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-7 w-full cursor-pointer items-center gap-2 rounded-(--control-radius) px-(--sidebar-row-content-inset) text-left text-sm text-sidebar-foreground/80 outline-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          active && "bg-sidebar-row-active text-sidebar-foreground",
        )}
        onClick={() =>
          void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) })
        }
      >
        <span className="min-w-0 flex-1 truncate">{shell.title || session.title}</span>
        {working ? (
          <span className="size-1.5 shrink-0 rounded-full bg-info">
            <span className="sr-only">Working</span>
          </span>
        ) : null}
      </button>
    </li>
  );
}
