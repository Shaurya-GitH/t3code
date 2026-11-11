import { expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../../test/render";
import { TaskReopenWatcher } from "./TaskReopenWatcher";

const mocks = vi.hoisted(() => ({
  shells: vi.fn(),
  board: vi.fn(),
  update: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("../../state/entities", () => ({
  useThreadShells: mocks.shells,
  useQuietThreadShells: () => [],
}));
vi.mock("./tasksApi", () => ({
  useTaskBoard: mocks.board,
  taskCommands: { update: mocks.update },
}));
vi.mock("../ui/toast", () => ({ toastManager: { add: mocks.toast } }));

function setup(latestUserAuthoredMessageAt: string | null | undefined) {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.update.mockResolvedValue(true);
  mocks.shells.mockReturnValue([
    {
      environmentId: "env",
      id: "thread",
      title: "Hidden chat",
      settledOverride: null,
      latestUserAuthoredMessageAt,
      latestUserMessageAt: "2026-11-11T12:01:00.000Z",
    },
  ]);
  mocks.board.mockReturnValue({
    state: "ready",
    tasks: [
      {
        id: 1,
        title: "Settled",
        status: "settled",
        settled_at: "2026-11-11T12:00:00.000Z",
        sessions: [{ thread_id: "thread", title: "Chat", link: "/threads/env/thread" }],
      },
    ],
  });
}

it.each([
  { authored: "2026-11-11T12:01:00.000Z", reopens: true },
  { authored: null, reopens: false },
  { authored: undefined, reopens: true },
])(
  "uses hidden sessions and preserves the authored timestamp $authored",
  async ({ authored, reopens }) => {
    setup(authored);
    await using _screen = await render(<TaskReopenWatcher />);
    expect(mocks.update).toHaveBeenCalledTimes(reopens ? 1 : 0);
    if (reopens) {
      expect(mocks.update).toHaveBeenCalledWith(1, {
        status: "in_progress",
        status_note: 'Reopened: "Hidden chat" is active again',
        expected_settled_at: "2026-11-11T12:00:00.000Z",
      });
    }
  },
);

it("retries a failed reopen with backoff and stops on unmount", async () => {
  setup("2026-11-11T12:01:00.000Z");
  let failAttempt!: (success: boolean) => void;
  const failure = new Promise<boolean>((resolve) => {
    failAttempt = resolve;
  });
  mocks.update.mockResolvedValue(false);
  mocks.update.mockReturnValueOnce(failure);
  await using screen = await render(<TaskReopenWatcher />);
  using _timers = fakeTimers();
  await act(() => failAttempt(false));
  await act(() => vi.advanceTimersByTimeAsync(5_000));
  expect(mocks.update).toHaveBeenCalledTimes(2);
  await act(() => vi.advanceTimersByTimeAsync(5_000));
  expect(mocks.update).toHaveBeenCalledTimes(2);
  await act(() => vi.advanceTimersByTimeAsync(5_000));
  expect(mocks.update).toHaveBeenCalledTimes(3);
  await screen.unmount();
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(mocks.update).toHaveBeenCalledTimes(3);
});
