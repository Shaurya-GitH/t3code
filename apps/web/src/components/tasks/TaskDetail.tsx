import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  BotIcon,
  FolderIcon,
  PlusIcon,
  Trash2Icon,
  UnlinkIcon,
  UserIcon,
  XIcon,
  ListFilterIcon,
} from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useProjects, useThreadShell } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import { RelativeTime } from "../RelativeTime";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { TaskStatusDot } from "./TaskBoard";
import {
  criteriaProgress,
  sessionRoute,
  TASK_COLUMNS,
  taskSessionPrompt,
  taskStatusLabel,
} from "./tasks.logic";
import { useShowTaskInSidebar } from "./SidebarTaskMark";
import { LinkSessionPicker } from "./LinkSessionPicker";
import { TaskColorPicker } from "./TaskColorPicker";
import { useTaskStatus } from "./useTaskStatus";
import { taskCommands, type Task, type TaskSession, type TaskStatus } from "./tasksApi";

const NO_PROJECT = "none";
const projectKey = (environmentId: string, projectId: string) =>
  `${environmentId}\u0000${projectId}`;

/** The ticket: what done means, who is working on it, and what happened. */
export function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const setTaskStatus = useTaskStatus();
  const { met, total } = criteriaProgress(task);
  const navigate = useNavigate();
  const showInSidebar = useShowTaskInSidebar();
  const handleNewThread = useNewThreadHandler();
  const projects = useProjects().filter((project) => !project.isScratch && !project.archivedAt);
  const project = projects.find(
    (candidate) =>
      candidate.environmentId === task.environment_id && candidate.id === task.project_id,
  );
  const startSession = () => {
    if (project) {
      void handleNewThread(scopeProjectRef(project.environmentId, project.id), {
        prompt: taskSessionPrompt(task),
      });
    } else {
      void navigate({ href: `/new?prompt=${encodeURIComponent(taskSessionPrompt(task))}` });
    }
  };
  return (
    <aside
      aria-label={`Task ${task.id}`}
      className="flex w-full min-w-0 shrink-0 flex-col border-s bg-background max-md:absolute max-md:inset-0 max-md:z-10 md:w-[26rem]"
    >
      <header className="flex min-h-12 shrink-0 items-center gap-1 border-b ps-4 pe-2">
        <TaskColorPicker task={task} />
        <span className="font-mono text-xs tabular-nums text-muted-foreground">#{task.id}</span>
        <Select
          value={task.status}
          onValueChange={(value) => {
            if (value) void setTaskStatus(task, { status: value as TaskStatus });
          }}
        >
          <SelectTrigger
            aria-label="Status"
            size="compact"
            variant="ghost"
            className="w-auto min-w-0"
          >
            <SelectValue>
              <span className="flex items-center gap-2">
                <TaskStatusDot status={task.status} />
                {taskStatusLabel(task.status)}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectPopup align="start" alignItemWithTrigger={false}>
            {TASK_COLUMNS.map((column) => (
              <SelectItem key={column.status} value={column.status}>
                {column.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <div className="ms-auto flex items-center gap-1">
          {task.status === "done" ? (
            <Button size="sm" onClick={() => void setTaskStatus(task, { status: "settled" })}>
              Settle
            </Button>
          ) : null}
          <IconAction label="Show sessions in sidebar" onClick={() => showInSidebar(task)}>
            <ListFilterIcon />
          </IconAction>
          <IconAction
            label="Delete task"
            onClick={() => {
              void taskCommands.remove(task).then((deleted) => {
                if (deleted) onClose();
              });
            }}
          >
            <Trash2Icon />
          </IconAction>
          <IconAction label="Close task" onClick={onClose}>
            <XIcon />
          </IconAction>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-6 p-4">
          <div className="flex flex-col gap-2">
            {/* Remount when the saved value changes, so an agent's edit shows in a field at rest. */}
            <InlineEdit
              key={`title:${task.title}`}
              label="Title"
              value={task.title}
              className="text-lg font-semibold leading-6"
              onCommit={(title) => {
                if (title) void taskCommands.update(task.id, { title });
              }}
            />
            {task.status_note ? (
              <p className="text-sm text-muted-foreground wrap-anywhere">{task.status_note}</p>
            ) : null}
            <Select
              value={project ? projectKey(project.environmentId, project.id) : NO_PROJECT}
              onValueChange={(value) => {
                const picked = projects.find(
                  (candidate) => projectKey(candidate.environmentId, candidate.id) === value,
                );
                void taskCommands.update(task.id, {
                  environment_id: picked?.environmentId ?? null,
                  project_id: picked?.id ?? null,
                });
              }}
            >
              <SelectTrigger
                aria-label="Project"
                size="compact"
                variant="ghost"
                className="-ms-2 w-auto min-w-0 self-start"
              >
                <SelectValue>
                  <span className="flex items-center gap-1.5">
                    <FolderIcon className="size-3.5" aria-hidden />
                    {project?.title ??
                      (task.project_id ? "Project not on this machine" : "No project")}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="start" alignItemWithTrigger={false}>
                <SelectItem value={NO_PROJECT}>No project</SelectItem>
                {projects
                  .toSorted((a, b) => a.title.localeCompare(b.title))
                  .map((candidate) => (
                    <SelectItem
                      key={projectKey(candidate.environmentId, candidate.id)}
                      value={projectKey(candidate.environmentId, candidate.id)}
                    >
                      {candidate.title}
                    </SelectItem>
                  ))}
              </SelectPopup>
            </Select>
          </div>

          <Section title="Description">
            <Textarea
              key={`notes:${task.notes}`}
              aria-label="Description"
              defaultValue={task.notes}
              placeholder="What is this for? Context an agent needs to start."
              onBlur={(event) => {
                const notes = event.currentTarget.value;
                if (notes !== task.notes) void taskCommands.update(task.id, { notes });
              }}
            />
          </Section>

          <Section
            title="Acceptance criteria"
            aside={total > 0 ? `${met} of ${total} met` : undefined}
          >
            {total === 0 ? (
              <p className="text-xs text-muted-foreground">
                Say what done means. Agents check these off as they verify them, and cannot mark the
                task done while one is open.
              </p>
            ) : null}
            <ul className="flex flex-col">
              {task.criteria.map((criterion) => (
                <li key={criterion.id} className="group/criterion flex items-start gap-2 py-1">
                  <Checkbox
                    className="mt-0.5"
                    checked={criterion.done}
                    aria-label={`${criterion.text}: met`}
                    onCheckedChange={(done) =>
                      void taskCommands.updateCriterion(criterion.id, { done })
                    }
                  />
                  <InlineEdit
                    key={criterion.text}
                    label="Criterion"
                    value={criterion.text}
                    className={
                      criterion.done ? "flex-1 text-sm text-muted-foreground" : "flex-1 text-sm"
                    }
                    onCommit={(text) =>
                      void (text
                        ? taskCommands.updateCriterion(criterion.id, { text })
                        : taskCommands.removeCriterion(criterion.id))
                    }
                  />
                  <span className="shrink-0 opacity-0 group-hover/criterion:opacity-100 group-focus-within/criterion:opacity-100 pointer-coarse:opacity-100">
                    <Button
                      aria-label={`Remove criterion: ${criterion.text}`}
                      size="icon-xs"
                      variant="ghost-muted"
                      onClick={() => void taskCommands.removeCriterion(criterion.id)}
                    >
                      <XIcon />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
            <CriterionComposer taskId={task.id} />
          </Section>

          <Section
            title="Sessions"
            aside={task.sessions.length > 0 ? String(task.sessions.length) : undefined}
          >
            {task.sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No session is working on this yet. A session links itself when it picks the task up,
                or link one here.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {task.sessions.map((session) => (
                  <SessionRow key={session.thread_id} session={session} />
                ))}
              </ul>
            )}
            {task.status !== "settled" ? (
              <div className="flex flex-wrap gap-1.5">
                <Button size="xs" variant="outline" onClick={startSession}>
                  <PlusIcon />
                  {project ? `Start a session in ${project.title}` : "Start a session"}
                </Button>
                <LinkSessionPicker task={task} />
              </div>
            ) : null}
          </Section>

          {task.events.length > 0 ? (
            <Section title="Activity">
              <ol className="flex flex-col gap-2">
                {task.events.map((event, index) => (
                  <li
                    // oxlint-disable-next-line react/no-array-index-key -- events have no id; the list is append-only and re-read whole
                    key={index}
                    className="flex items-start gap-2 text-xs"
                  >
                    {event.actor === "agent" ? (
                      <BotIcon
                        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                        aria-label="Agent"
                      />
                    ) : (
                      <UserIcon
                        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                        aria-label="You"
                      />
                    )}
                    <span className="min-w-0 flex-1 wrap-anywhere">{event.text}</span>
                    <span className="shrink-0 text-muted-foreground">
                      <RelativeTime timestamp={event.at} />
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}
        </div>
      </ScrollArea>
    </aside>
  );
}

/**
 * Text that reads as text until it is edited: no field chrome, grows with its content, saves
 * on blur or Enter. Not a Textarea: a ticket's title and criteria are document text, not form fields.
 */
function InlineEdit({
  label,
  value,
  className,
  onCommit,
}: {
  label: string;
  value: string;
  className?: string;
  onCommit: (value: string) => void;
}) {
  return (
    <textarea
      rows={1}
      aria-label={label}
      defaultValue={value}
      className={cn(
        "field-sizing-content min-w-0 resize-none rounded-sm bg-transparent outline-none wrap-anywhere focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur();
      }}
      onBlur={(event) => {
        const next = event.currentTarget.value.trim();
        if (next !== value) onCommit(next);
        if (!next) event.currentTarget.value = value;
      }}
    />
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {aside ? <span className="text-xs tabular-nums text-muted-foreground">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button aria-label={label} size="icon-sm" variant="ghost" onClick={onClick} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
}

function CriterionComposer({ taskId }: { taskId: number }) {
  const [text, setText] = useState("");
  return (
    <Input
      size="sm"
      value={text}
      aria-label="Add an acceptance criterion"
      placeholder="Add a criterion, then Enter"
      onChange={(event) => setText(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing || !text.trim()) return;
        event.preventDefault();
        setText("");
        void taskCommands.addCriterion(taskId, text.trim());
      }}
    />
  );
}

function SessionRow({ session }: { session: TaskSession }) {
  const navigate = useNavigate();
  const route = sessionRoute(session.link);
  const ref = route
    ? scopeThreadRef(route.environmentId as EnvironmentId, route.threadId as ThreadId)
    : null;
  const shell = useThreadShell(ref);
  const title = shell?.title || session.title || `Session ${session.thread_id.slice(0, 8)}`;
  const working =
    shell?.runtime != null &&
    ["preparing", "queued", "starting", "running", "waiting"].includes(shell.runtime.status);
  return (
    <li className="group/session flex items-center gap-1">
      <button
        type="button"
        disabled={ref === null}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default"
        onClick={() => {
          if (ref) {
            void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
          }
        }}
      >
        <span
          aria-hidden
          className={
            working
              ? "size-2 shrink-0 rounded-full bg-info"
              : "size-2 shrink-0 rounded-full bg-muted-foreground/30"
          }
        />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {working ? <span className="shrink-0 text-xs text-info-foreground">Working</span> : null}
        {ref ? (
          <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
      </button>
      <span className="shrink-0 opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100 pointer-coarse:opacity-100">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={`Unlink session: ${title}`}
                size="icon-xs"
                variant="ghost-muted"
                onClick={() => void taskCommands.unlinkSession(session.thread_id)}
              />
            }
          >
            <UnlinkIcon />
          </TooltipTrigger>
          <TooltipPopup side="top">Unlink from this task</TooltipPopup>
        </Tooltip>
      </span>
    </li>
  );
}
