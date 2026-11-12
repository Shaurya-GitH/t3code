import { CheckIcon, ListTodoIcon } from "lucide-react";

import { SidebarHeaderIconButton } from "../sidebar/SidebarThreadHeader";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxSearchInput,
  ComboboxTrigger,
} from "../ui/combobox";
import { useSidebarTaskFilter } from "./SidebarTaskMark";
import { taskColor } from "./tasks.logic";
import { useTaskBoard, type Task } from "./tasksApi";

type TaskFilterItem = { value: number | null; label: string; task: Task | null };

const ALL: TaskFilterItem = { value: null, label: "All sessions", task: null };

/** The sidebar header's task filter, beside the project filter. Settled tasks are left out. */
export function SidebarTaskFilterMenu() {
  const board = useTaskBoard();
  const taskId = useSidebarTaskFilter((state) => state.taskId);
  if (board.state !== "ready") return null;
  const current = board.tasks.find((task) => task.id === taskId) ?? null;
  const items: TaskFilterItem[] = [
    ALL,
    ...board.tasks
      .filter((task) => task.status !== "settled")
      .map((task) => ({ value: task.id, label: task.title, task })),
  ];
  const selected = items.find((item) => item.value === (current?.id ?? null)) ?? null;
  return (
    <Combobox
      items={items}
      autoHighlight
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      value={selected}
      onValueChange={(item) => {
        if (item) useSidebarTaskFilter.setState({ taskId: item.value });
      }}
    >
      <ComboboxTrigger
        render={
          <SidebarHeaderIconButton
            label={current ? `Filter threads by task: ${current.title}` : "Filter threads by task"}
          />
        }
      >
        {current ? (
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ backgroundColor: taskColor(current.color) }}
          />
        ) : (
          <ListTodoIcon className="size-4" />
        )}
      </ComboboxTrigger>
      <ComboboxPopup
        align="start"
        collisionAvoidance={{ side: "flip", align: "shift" }}
        className="w-[min(18rem,var(--available-width))] overflow-hidden"
        finalFocus={(closeType) => closeType === "keyboard"}
      >
        <ComboboxSearchInput aria-label="Search tasks" placeholder="Search tasks..." />
        <ComboboxEmpty>No matching open tasks.</ComboboxEmpty>
        <ComboboxList>
          {(item: TaskFilterItem) => (
            <ComboboxItem key={item.value ?? "all"} hideIndicator value={item}>
              {item.task ? (
                <span
                  aria-hidden
                  className="mx-0.75 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: taskColor(item.task.color) }}
                />
              ) : (
                <ListTodoIcon className="size-4 shrink-0" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
              {item.task ? (
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  #{item.task.id}
                </span>
              ) : null}
              {item.value === (current?.id ?? null) ? (
                <CheckIcon className="size-3.5 shrink-0" aria-hidden />
              ) : null}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
