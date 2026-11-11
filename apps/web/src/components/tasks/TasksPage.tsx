import { useNavigate, useSearch } from "@tanstack/react-router";
import { PlusIcon, SearchIcon } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { AppRouteModal, AppRouteModalClose } from "../AppRouteModal";
import { Button } from "../ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Kbd } from "../ui/kbd";
import { Spinner } from "../ui/spinner";
import { TaskBoard } from "./TaskBoard";
import { TaskDetail } from "./TaskDetail";
import { filterTasks } from "./tasks.logic";
import { useTaskBoard, type TaskStatus } from "./tasksApi";

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function TasksPage() {
  const board = useTaskBoard();
  const selectedTaskId = useSearch({ from: "/_chat/tasks", select: (search) => search.task });
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [composerStatus, setComposerStatus] = useState<TaskStatus | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const visibleTasks = filterTasks(board.tasks, query);
  const selectedTask = board.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const openCount = board.tasks.filter((task) => task.status !== "settled").length;

  const openTask = (id: number | null) =>
    void navigate({ to: "/tasks", search: id === null ? {} : { task: id }, replace: true });

  const onPageKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    if (event.key === "/") {
      event.preventDefault();
      searchInputRef.current?.focus();
    } else if (event.key === "c") {
      event.preventDefault();
      setComposerStatus("todo");
    }
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- window keydown listener for the page's own shortcuts (/ to search, c to add)
  useEffect(() => {
    globalThis.window.addEventListener("keydown", onPageKeyDown);
    return () => globalThis.window.removeEventListener("keydown", onPageKeyDown);
  }, []);

  return (
    <AppRouteModal label="Tasks">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex min-h-12 shrink-0 items-center gap-2 border-b ps-5 pe-2">
          <h1 className="text-sm font-medium">Tasks</h1>
          {board.state === "ready" ? (
            <span className="text-xs tabular-nums text-muted-foreground">{openCount} open</span>
          ) : null}
          <div className="ms-auto flex min-w-0 items-center gap-2">
            <InputGroup className="w-56 min-w-0 max-sm:w-36">
              <InputGroupAddon>
                <SearchIcon aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                ref={searchInputRef}
                type="search"
                size="sm"
                value={query}
                aria-label="Search tasks"
                placeholder="Search tasks"
                onChange={(event) => setQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape" || !query) return;
                  // The first Esc clears the search; the next one closes the view.
                  event.preventDefault();
                  event.stopPropagation();
                  setQuery("");
                }}
              />
              {query ? null : (
                <InputGroupAddon align="inline-end">
                  <Kbd>/</Kbd>
                </InputGroupAddon>
              )}
            </InputGroup>
            <Button size="sm" onClick={() => setComposerStatus("todo")}>
              <PlusIcon />
              New task
            </Button>
          </div>
          <AppRouteModalClose />
        </header>

        <div className="relative flex min-h-0 min-w-0 flex-1">
          {board.state === "loading" ? (
            <Empty>
              <Spinner />
            </Empty>
          ) : board.state === "offline" && board.tasks.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>The task service is not running</EmptyTitle>
                <EmptyDescription>
                  It starts with the first Claude session that has the t3-tasks plugin. To start it
                  yourself, run npm start in the t3-tasks folder.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : query && visibleTasks.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No task matches "{query}"</EmptyTitle>
                <EmptyDescription>
                  Search looks in titles, descriptions, criteria and session names. Try fewer words,
                  or a task number like #12.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" variant="outline" onClick={() => setQuery("")}>
                  Clear search
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <TaskBoard
              tasks={visibleTasks}
              suggestions={query ? [] : board.suggestions}
              selectedTaskId={selectedTask?.id ?? null}
              composerStatus={composerStatus}
              onComposerStatusChange={setComposerStatus}
              onOpenTask={openTask}
            />
          )}
          {selectedTask ? (
            <TaskDetail key={selectedTask.id} task={selectedTask} onClose={() => openTask(null)} />
          ) : null}
        </div>
      </div>
    </AppRouteModal>
  );
}
