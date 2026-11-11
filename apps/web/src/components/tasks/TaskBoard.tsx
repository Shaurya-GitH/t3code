import {
  ChevronsLeftIcon,
  EllipsisIcon,
  ListChecksIcon,
  MessagesSquareIcon,
  PlusIcon,
} from "lucide-react";
import { useState, type DragEvent } from "react";

import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { ScrollArea } from "../ui/scroll-area";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  criteriaProgress,
  positionForDrop,
  TASK_COLOR_HEX,
  TASK_COLORS,
  TASK_COLUMNS,
} from "./tasks.logic";
import { useTaskStatus } from "./useTaskStatus";
import { taskCommands, type Task, type TaskStatus } from "./tasksApi";

const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-muted-foreground/50",
  in_progress: "bg-info",
  blocked: "bg-warning",
  done: "bg-success",
  settled: "bg-muted-foreground/30",
};

export function TaskStatusDot({ status }: { status: TaskStatus }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status])} />;
}

interface DropTarget {
  readonly status: TaskStatus;
  readonly index: number;
}

export function TaskBoard({
  tasks,
  selectedTaskId,
  composerStatus,
  onComposerStatusChange,
  onOpenTask,
}: {
  tasks: ReadonlyArray<Task>;
  selectedTaskId: number | null;
  composerStatus: TaskStatus | null;
  onComposerStatusChange: (status: TaskStatus | null) => void;
  onOpenTask: (id: number) => void;
}) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [settledOpen, setSettledOpen] = useState(false);
  const setTaskStatus = useTaskStatus();

  const dragOver = (status: TaskStatus) => (event: DragEvent<HTMLElement>) => {
    if (draggingId === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    // The drop lands before the first card whose middle is below the pointer.
    const cards = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-task-card]")].filter(
      (card) => card.dataset.taskCard !== String(draggingId),
    );
    const next = cards.findIndex((card) => {
      const rect = card.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    const index = next === -1 ? cards.length : next;
    if (dropTarget?.status !== status || dropTarget.index !== index) {
      setDropTarget({ status, index });
    }
  };

  const drop = (status: TaskStatus) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (draggingId !== null) {
      const column = tasks.filter((task) => task.status === status && task.id !== draggingId);
      const index = dropTarget?.status === status ? dropTarget.index : 0;
      const dragged = tasks.find((task) => task.id === draggingId);
      if (dragged) {
        void setTaskStatus(dragged, { status, position: positionForDrop(column, index) });
      }
    }
    setDraggingId(null);
    setDropTarget(null);
  };

  return (
    <ScrollArea className="min-h-0 min-w-0 flex-1">
      <div className="flex h-full min-h-0 gap-3 p-4">
        {TASK_COLUMNS.map(({ status, label }) => {
          const column = tasks.filter((task) => task.status === status);
          const isDropTarget = dropTarget?.status === status;
          if (status === "settled" && !settledOpen) {
            return (
              <SettledRail
                key={status}
                count={column.length}
                isDropTarget={isDropTarget}
                onOpen={() => setSettledOpen(true)}
                onDragOver={dragOver(status)}
                onDrop={drop(status)}
              />
            );
          }
          const canAdd = status === "todo" || status === "in_progress" || status === "blocked";
          return (
            <section
              key={status}
              aria-label={label}
              className={cn(
                "flex min-w-56 max-w-96 flex-1 basis-0 flex-col gap-2 rounded-xl",
                isDropTarget && "bg-accent/40",
              )}
              onDragOver={dragOver(status)}
              onDrop={drop(status)}
            >
              <ColumnHeader
                label={label}
                count={column.length}
                icon={<TaskStatusDot status={status} />}
              >
                {canAdd ? (
                  <ColumnIconButton
                    label={`Add a task to ${label}`}
                    onClick={() => onComposerStatusChange(status)}
                  >
                    <PlusIcon />
                  </ColumnIconButton>
                ) : null}
                {status === "settled" ? (
                  <ColumnIconButton label="Collapse Settled" onClick={() => setSettledOpen(false)}>
                    <ChevronsLeftIcon className="rotate-180" />
                  </ColumnIconButton>
                ) : null}
              </ColumnHeader>
              {composerStatus === status ? (
                <TaskComposer status={status} onClose={() => onComposerStatusChange(null)} />
              ) : null}
              <ul className="flex min-h-16 flex-1 flex-col gap-2">
                {column.map((task, index) => (
                  <li key={task.id} className="relative">
                    {isDropTarget && dropTarget.index === index ? <DropLine /> : null}
                    <TaskCard
                      task={task}
                      selected={task.id === selectedTaskId}
                      dragging={task.id === draggingId}
                      onOpen={() => onOpenTask(task.id)}
                      onDragStart={() => setDraggingId(task.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDropTarget(null);
                      }}
                    />
                  </li>
                ))}
                {isDropTarget && dropTarget.index >= column.length ? (
                  <li className="relative h-0">
                    <DropLine />
                  </li>
                ) : null}
                {column.length === 0 && composerStatus !== status && !isDropTarget ? (
                  <li className="rounded-lg border border-dashed px-2.5 py-4 text-center text-xs text-muted-foreground">
                    {status === "done"
                      ? "Agents move tasks here when the work is shipped."
                      : status === "settled"
                        ? "Tasks you have signed off."
                        : "Nothing here."}
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function ColumnHeader({
  label,
  count,
  icon,
  children,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex h-7 items-center gap-2 px-1">
      {icon}
      <h2 className="text-sm font-medium">{label}</h2>
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      <div className="ms-auto flex items-center">{children}</div>
    </header>
  );
}

function ColumnIconButton({
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
        render={
          <Button aria-label={label} size="icon-xs" variant="ghost-muted" onClick={onClick} />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

function DropLine() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 -top-1.5 h-0.5 rounded-full bg-ring"
    />
  );
}

/** Settled tasks stay out of the way: a slim rail that still takes a drop. */
function SettledRail({
  count,
  isDropTarget,
  onOpen,
  onDragOver,
  onDrop,
}: {
  count: number;
  isDropTarget: boolean;
  onOpen: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Show ${count} settled tasks`}
      className={cn(
        "flex w-9 shrink-0 cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed py-2 text-xs text-muted-foreground outline-none hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        isDropTarget && "border-ring bg-accent/60 text-foreground",
      )}
      onClick={onOpen}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <TaskStatusDot status="settled" />
      <span className="tabular-nums">{count}</span>
      <span className="[writing-mode:vertical-rl]">Settled</span>
    </button>
  );
}

/** Add cards one after another: Enter adds and keeps the composer open, Esc closes it. */
function TaskComposer({ status, onClose }: { status: TaskStatus; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setTitle("");
    void taskCommands.create({ title: trimmed, status });
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        autoFocus
        rows={2}
        size="sm"
        value={title}
        aria-label="Task title"
        placeholder="What needs to ship?"
        onChange={(event) => setTitle(event.currentTarget.value)}
        onBlur={() => {
          if (!title.trim()) onClose();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            // Esc closes the composer, not the whole Tasks view.
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      />
      <div className="flex items-center gap-1.5">
        <Button size="xs" disabled={!title.trim()} onClick={submit}>
          Add task
        </Button>
        <Button size="xs" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <span className="ms-auto text-xs text-muted-foreground">Enter to add</span>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  selected,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  selected: boolean;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { met, total } = criteriaProgress(task);
  const setTaskStatus = useTaskStatus();
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      data-task-card={task.id}
      aria-label={`Open task ${task.id}: ${task.title}`}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group/task relative flex cursor-pointer flex-col gap-1.5 overflow-hidden rounded-lg border bg-card p-2.5 ps-3.5 text-card-foreground outline-none hover:border-ring/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        selected && "border-ring/70 bg-accent/50",
        dragging && "opacity-40",
      )}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", `#${task.id} ${task.title}`);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: TASK_COLOR_HEX[task.color] }}
      />
      <div className="flex items-start gap-1">
        <p className="line-clamp-3 min-w-0 flex-1 text-sm font-medium leading-5 wrap-anywhere">
          {task.title}
        </p>
        <span className="-me-1 -mt-0.5 shrink-0 opacity-0 group-hover/task:opacity-100 group-focus-within/task:opacity-100 has-data-popup-open:opacity-100 pointer-coarse:opacity-100">
          <TaskCardMenu task={task} />
        </span>
      </div>
      {task.status_note ? (
        <p className="line-clamp-2 text-xs text-muted-foreground wrap-anywhere">
          {task.status_note}
        </p>
      ) : null}
      <div className="flex min-h-5 items-center gap-2.5 text-xs text-muted-foreground">
        {total > 0 ? (
          <span
            className={cn(
              "flex items-center gap-1 tabular-nums",
              met === total && "text-success-foreground",
            )}
            aria-label={`${met} of ${total} acceptance criteria met`}
          >
            <ListChecksIcon className="size-3.5" aria-hidden />
            {met}/{total}
          </span>
        ) : null}
        {task.sessions.length > 0 ? (
          <span
            className="flex items-center gap-1 tabular-nums"
            aria-label={`${task.sessions.length} sessions`}
          >
            <MessagesSquareIcon className="size-3.5" aria-hidden />
            {task.sessions.length}
          </span>
        ) : null}
        {task.source !== "manual" && task.source !== "agent" ? (
          <Badge variant="outline" size="sm">
            {task.source}
          </Badge>
        ) : null}
        <span className="ms-auto font-mono tabular-nums">#{task.id}</span>
        {task.status === "done" ? (
          <Button
            size="xs"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              void setTaskStatus(task, { status: "settled" });
            }}
          >
            Settle
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Everything a drag does, without a drag. */
function TaskCardMenu({ task }: { task: Task }) {
  const setTaskStatus = useTaskStatus();
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            aria-label={`Actions for task ${task.id}`}
            size="icon-xs"
            variant="ghost-muted"
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <EllipsisIcon />
      </MenuTrigger>
      <MenuPopup align="end" onClick={(event) => event.stopPropagation()}>
        <MenuGroup>
          <MenuGroupLabel>Move to</MenuGroupLabel>
          {TASK_COLUMNS.filter((column) => column.status !== task.status).map((column) => (
            <MenuItem
              key={column.status}
              onClick={() => void setTaskStatus(task, { status: column.status })}
            >
              <TaskStatusDot status={column.status} />
              {column.label}
            </MenuItem>
          ))}
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>Color</MenuGroupLabel>
          {TASK_COLORS.filter((color) => color !== task.color).map((color) => (
            <MenuItem key={color} onClick={() => void taskCommands.update(task.id, { color })}>
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: TASK_COLOR_HEX[color] }}
              />
              <span className="capitalize">{color}</span>
            </MenuItem>
          ))}
        </MenuGroup>
        <MenuSeparator />
        <MenuItem variant="destructive" onClick={() => void taskCommands.remove(task)}>
          Delete task
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
