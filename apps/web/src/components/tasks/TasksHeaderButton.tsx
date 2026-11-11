import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { ListTodoIcon } from "lucide-react";

import { shortcutLabelForCommand } from "../../keybindings";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useTaskBoard } from "./tasksApi";

/** Opens Tasks from the top-right controls. The dot says a done task waits to be settled. */
export function TasksHeaderButton() {
  const navigate = useNavigate();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const shortcutLabel = shortcutLabelForCommand(keybindings, "tasks.open");
  const board = useTaskBoard();
  const toSettle = board.tasks.filter((task) => task.status === "done").length;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="relative flex shrink-0" />}>
        <Button
          aria-label={toSettle > 0 ? `Tasks, ${toSettle} to settle` : "Tasks"}
          size="icon-sm"
          variant="ghost"
          onClick={() => void navigate({ to: "/tasks" })}
        >
          <ListTodoIcon className="size-4" />
        </Button>
        {toSettle > 0 ? (
          <span
            aria-hidden
            className="pointer-events-none absolute end-1 top-1 size-1.5 rounded-full bg-info"
          />
        ) : null}
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        Tasks{shortcutLabel ? ` (${shortcutLabel})` : ""}
        {toSettle > 0 ? `, ${toSettle} to settle` : ""}
      </TooltipPopup>
    </Tooltip>
  );
}
