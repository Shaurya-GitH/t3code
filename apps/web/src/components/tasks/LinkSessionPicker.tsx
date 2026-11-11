import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { isListedThreadLineage } from "@t3tools/contracts";
import { hostedThreadLink } from "@t3tools/shared/threadLinks";
import { LinkIcon } from "lucide-react";

import { useQuietThreadShells } from "../../state/entities";
import { RelativeTime } from "../RelativeTime";
import { Button } from "../ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxSearchInput,
  ComboboxTrigger,
} from "../ui/combobox";
import { taskCommands, useTaskBoard, type Task } from "./tasksApi";

type SessionItem = {
  value: string;
  label: string;
  shell: EnvironmentThreadShell;
  otherTask: Task | null;
};

const lastActive = (shell: EnvironmentThreadShell) => shell.latestUserMessageAt ?? shell.updatedAt;

/** Sessions to offer: listed threads, newest first, leaving out those already on this task. */
function linkableSessions(
  shells: ReadonlyArray<EnvironmentThreadShell>,
  task: Pick<Task, "id">,
  tasks: ReadonlyArray<Task>,
): SessionItem[] {
  // The service keys a session by its thread id; some links (outside T3) carry no route.
  const taskByThreadId = new Map(
    tasks.flatMap((owner) => owner.sessions.map((session) => [session.thread_id, owner] as const)),
  );
  return shells
    .filter(
      (shell) => isListedThreadLineage(shell.lineage) && !shell.deletedAt && !shell.archivedAt,
    )
    .map((shell) => {
      const key = scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id));
      const owner = taskByThreadId.get(shell.id) ?? null;
      return { value: key, label: shell.title || "Untitled thread", shell, otherTask: owner };
    })
    .filter((item) => item.otherTask?.id !== task.id)
    .toSorted((a, b) => lastActive(b.shell).localeCompare(lastActive(a.shell)));
}

/** Adds an existing session to this task. */
export function LinkSessionPicker({ task }: { task: Task }) {
  const shells = useQuietThreadShells();
  const board = useTaskBoard();
  const items = linkableSessions(shells, task, board.tasks);
  return (
    <Combobox
      items={items}
      autoHighlight
      value={null as SessionItem | null}
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      onValueChange={(item) => {
        if (!item) return;
        const ref = scopeThreadRef(item.shell.environmentId, item.shell.id);
        void taskCommands.linkSession({
          threadId: item.shell.id,
          taskId: task.id,
          title: item.label,
          link: hostedThreadLink(ref),
        });
      }}
    >
      <ComboboxTrigger render={<Button size="xs" variant="outline" />}>
        <LinkIcon />
        Link a session
      </ComboboxTrigger>
      <ComboboxPopup
        align="start"
        className="w-[min(22rem,var(--available-width))] overflow-hidden"
      >
        <ComboboxSearchInput aria-label="Search sessions" placeholder="Search sessions..." />
        <ComboboxEmpty>No matching sessions.</ComboboxEmpty>
        <ComboboxList>
          {(item: SessionItem) => (
            <ComboboxItem key={item.value} hideIndicator value={item}>
              <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
              {item.otherTask ? (
                <span
                  className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground"
                  aria-label={`On task ${item.otherTask.id}; linking moves it`}
                >
                  #{item.otherTask.id}
                </span>
              ) : null}
              <span className="shrink-0 text-xs text-muted-foreground">
                <RelativeTime timestamp={lastActive(item.shell)} />
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
