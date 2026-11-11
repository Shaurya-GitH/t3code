import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { useHandleNewThread } from "../../hooks/useHandleNewThread";
import { useProjects, useQuietThreadShells } from "../../state/entities";
import { useOlderSettledShelf, useOlderSettledShelfGrowth } from "../../state/olderSettledShelf";
import Sidebar from "../Sidebar";
import { SidebarProvider } from "../ui/sidebar";
import { useSidebarTaskFilter } from "./SidebarTaskMark";
import { useTaskBoard, type Task } from "./tasksApi";

vi.mock("../../state/entities", { spy: true });
vi.mock("../../state/olderSettledShelf", { spy: true });
vi.mock("./tasksApi", { spy: true });
vi.mock("../../hooks/useHandleNewThread", { spy: true });
vi.mock("../../commandPaletteBus", () => ({
  openCommandPalette: vi.fn(),
  isCommandPaletteOpen: () => false,
}));
vi.mock("../sidebar/SidebarChrome", () => ({
  SidebarChromeHeader: () => null,
  SidebarChromeFooter: () => null,
}));
it("keeps Show more available under a task filter while unread settled pages remain", async () => {
  using stack = new DisposableStack();
  const previous = localStorage.getItem("t3code:sidebar:settled-expanded");
  localStorage.setItem("t3code:sidebar:settled-expanded", "true");
  stack.defer(() => {
    if (previous === null) localStorage.removeItem("t3code:sidebar:settled-expanded");
    else localStorage.setItem("t3code:sidebar:settled-expanded", previous);
    useSidebarTaskFilter.setState({ taskId: null });
    vi.restoreAllMocks();
  });
  const task: Task = {
    id: 1,
    title: "Filtered",
    notes: "",
    status: "done",
    status_note: "",
    source: "manual",
    position: 0,
    color: "pink",
    updated_at: "",
    sessions: [],
    criteria: [],
    events: [],
  };
  useSidebarTaskFilter.setState({ taskId: task.id });
  vi.mocked(useTaskBoard).mockReturnValue({ state: "ready", tasks: [task] });
  vi.mocked(useProjects).mockReturnValue([]);
  vi.mocked(useQuietThreadShells).mockReturnValue([]);
  vi.mocked(useHandleNewThread).mockReturnValue({
    activeDraftThread: null,
    activeThread: null,
    defaultProjectRef: null,
    handleNewThread: vi.fn().mockResolvedValue(null),
    routeDraftId: null,
    routeThreadRef: null,
  });
  const shelf = {
    environments: new Map([
      [
        EnvironmentId.make("local"),
        {
          older: {
            before: "2026-01-02T00:00:00.000Z",
            beforeMs: 0,
            counts: new Map([[ProjectId.make("p"), 25]]),
          },
          pages: {
            reads: [],
            frontier: { settledAt: "2026-01-01T00:00:00.000Z" },
            status: "ready" as const,
          },
        },
      ],
    ]),
    visibleCount: 10,
    pages: new Map(),
    grow: vi.fn(),
    isListed: () => true,
    unloadedCount: () => 25,
    loading: false,
    failed: false,
    retry: vi.fn(),
  };
  vi.mocked(useOlderSettledShelf).mockReturnValue(shelf);
  vi.mocked(useOlderSettledShelfGrowth).mockImplementation(() => {});
  await using screen = await render(
    <SidebarProvider>
      <Sidebar routeReveal={{ observedKey: null, pendingKey: null }} />
    </SidebarProvider>,
  );
  await expect
    .element(screen.getByRole("button", { name: "Show more", exact: true }))
    .toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Show more", exact: true }));
  await vi.waitFor(() =>
    expect(vi.mocked(useOlderSettledShelf).mock.lastCall?.[0].visibleCount).toBeGreaterThan(10),
  );
});
