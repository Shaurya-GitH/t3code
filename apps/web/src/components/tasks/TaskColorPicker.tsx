import { PaletteIcon } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";

import { hexToHsv, hsvToHex, type HsvColor } from "~/lib/color";
import { Button } from "../ui/button";
import { ColorHueSlider, ColorSaturationValuePlane } from "../ui/color-picker";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { colorClash, taskColor } from "./tasks.logic";
import { taskCommands, useTaskBoard, type Task } from "./tasksApi";

/**
 * The task's color swatch; clicking it opens a picker. A color too close to another open
 * task's is shown but not saved, so no two tasks on the board look alike.
 */
export function TaskColorPicker({ task }: { task: Task }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Change the color of task ${task.id}`}
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span
              aria-hidden
              className="size-3 rounded-full"
              style={{ backgroundColor: taskColor(task.color) }}
            />
          </button>
        }
      />
      <PopoverPopup side="bottom" align="start" sideOffset={6} padding="none">
        <TaskColorPanel task={task} />
      </PopoverPopup>
    </Popover>
  );
}

function TaskColorPanel({ task }: { task: Task }) {
  const { tasks } = useTaskBoard();
  const saved = taskColor(task.color);
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(saved));
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const [syncedValue, setSyncedValue] = useState(saved);
  const color = hsvToHex(hsv.h, hsv.s, hsv.v);
  if (syncedValue !== saved) {
    setSyncedValue(saved);
    if (color !== saved) {
      setHsv(hexToHsv(saved));
      setHexDraft(null);
    }
  }
  const clash = colorClash(color, task, tasks);
  const others = tasks.filter((other) => other.id !== task.id && other.status !== "settled");

  const commit = (next: string) => {
    if (next !== saved && !colorClash(next, task, tasks))
      void taskCommands.update(task.id, { color: next });
  };
  // A drag previews here and saves its last color once on release; a key step saves at once.
  const drag = useRef<string | null>(null);
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button === 0) drag.current = color;
  };
  const change = (next: HsvColor) => {
    setHsv(next);
    const hex = hsvToHex(next.h, next.s, next.v);
    if (drag.current === null) commit(hex);
    else drag.current = hex;
  };
  const endDrag = () => {
    const last = drag.current;
    drag.current = null;
    if (last !== null) commit(last);
  };

  return (
    <div className="w-64 bg-popover">
      <div onPointerDownCapture={startDrag}>
        <ColorSaturationValuePlane
          label="Task color"
          value={hsv}
          onChange={change}
          onInteractionEnd={endDrag}
          variant="edge"
        />
      </div>
      <div className="grid gap-3 p-3">
        <div className="relative pt-2">
          {/* Where the other open tasks sit on the hue strip. */}
          {others.map((other) => (
            <span
              key={other.id}
              aria-hidden
              className="pointer-events-none absolute top-0 size-1.5 -translate-x-1/2 rounded-full ring-1 ring-background"
              style={{
                left: `calc(${hexToHsv(taskColor(other.color)).h / 360} * (100% - 1rem) + 0.5rem)`,
                backgroundColor: taskColor(other.color),
              }}
            />
          ))}
          <div onPointerDownCapture={startDrag}>
            <ColorHueSlider
              label="Task color hue"
              value={hsv.h}
              onChange={(h) => change({ ...hsv, h })}
              onInteractionEnd={endDrag}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-7 shrink-0 rounded-md border"
            style={{ backgroundColor: color }}
          />
          <Input
            nativeInput
            size="compact"
            font="mono"
            spellCheck={false}
            aria-label="Task color hex"
            value={hexDraft ?? color}
            onChange={(event) => {
              const next = event.currentTarget.value.trim();
              setHexDraft(next);
              if (!/^#[\da-f]{6}$/i.test(next)) return;
              setHsv(hexToHsv(next.toLowerCase()));
              commit(next.toLowerCase());
            }}
            onBlur={() => setHexDraft(null)}
          />
        </div>
        <p
          role="status"
          className={clash ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
        >
          {clash
            ? `Too close to #${clash.id} ${clash.title}. Pick a color farther away.`
            : "Distinct from every open task."}
        </p>
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            setHsv(hexToHsv(saved));
            setHexDraft(null);
            void taskCommands.update(task.id, { color: "auto" });
          }}
        >
          <PaletteIcon />
          Most distinct color
        </Button>
      </div>
    </div>
  );
}
