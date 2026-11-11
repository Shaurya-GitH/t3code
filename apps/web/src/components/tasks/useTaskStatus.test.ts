import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { useTaskStatus } from "./useTaskStatus";
import type { Task } from "./tasksApi";

const mocks = vi.hoisted(() => ({
  settle: vi.fn(),
  stop: vi.fn(),
  wait: vi.fn(),
  update: vi.fn(),
  confirm: vi.fn(),
  add: vi.fn(),
  close: vi.fn(),
  read: vi.fn(),
  mount: vi.fn(() => vi.fn()),
}));
vi.mock("../../hooks/useThreadActions", () => ({
  useThreadActions: () => ({ settleThread: mocks.settle }),
}));
vi.mock("../../confirmDialog", () => ({ requestConfirmDialog: mocks.confirm }));
vi.mock("../../state/entities", () => ({
  readThreadShell: mocks.read,
  waitForThreadShell: mocks.wait,
}));
vi.mock("../../state/use-orchestration-command", () => ({
  useOrchestrationCommand: () => mocks.stop,
}));
vi.mock("../../state/threads", () => ({
  threadEnvironment: { interruptTurn: {} },
  threadFamilies: { mount: mocks.mount },
  environmentThreadShells: { threadShellAtom: () => ({}) },
}));
vi.mock("../../state/waitForAtomValue", () => ({ waitForAtomValue: mocks.wait }));
vi.mock("../../rpc/atomRegistry", () => ({ appAtomRegistry: {} }));
vi.mock("../Sidebar.logic", () => ({
  resolveThreadStatusPill: ({ thread }: { thread: { label: string } }) => ({ label: thread.label }),
}));
vi.mock("../ui/toast", () => ({ toastManager: { add: mocks.add, close: mocks.close } }));
vi.mock("./tasksApi", () => ({ taskCommands: { update: mocks.update } }));

function setup() {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.mount.mockReturnValue(vi.fn());
  mocks.read.mockReturnValue({ label: "Working" });
  mocks.stop.mockResolvedValue({ _tag: "Success" });
  mocks.wait.mockResolvedValue(true);
  mocks.update.mockResolvedValue(true);
  mocks.confirm.mockResolvedValue(true);
  const undo = vi.fn(async () => {});
  mocks.settle.mockResolvedValue({ _tag: "Success", value: { undo, canUndo: () => true } });
  const task: Task = {
    id: 1,
    title: "Ship",
    notes: "",
    status: "done",
    status_note: "",
    source: "manual",
    position: 0,
    color: "pink",
    updated_at: "",
    criteria: [],
    events: [],
    sessions: [
      { thread_id: "thread", title: "Thread", link: "https://app.t3.codes/threads/env/thread" },
    ],
  };
  return { task, undo, change: useTaskStatus() };
}

afterEach(() => {
  for (const [options] of mocks.add.mock.calls) options.onClose?.();
  vi.restoreAllMocks();
});

it("stops confirmed busy sessions and waits before settling, then settles the task", async () => {
  const { task, change } = setup();
  await expect(change(task, { status: "settled" })).resolves.toBe(true);
  expect(mocks.stop).toHaveBeenCalledExactlyOnceWith({
    environmentId: EnvironmentId.make("env"),
    input: { threadId: ThreadId.make("thread") },
  });
  expect(mocks.wait).toHaveBeenCalledOnce();
  expect(mocks.wait.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.settle.mock.invocationCallOrder[0]!,
  );
  expect(mocks.settle.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.update.mock.invocationCallOrder[0]!,
  );
});

it.each(["stop", "wait", "settle"] as const)("keeps the task open when %s fails", async (stage) => {
  const { task, change } = setup();
  if (stage === "wait") mocks.wait.mockResolvedValue(false);
  else mocks[stage].mockResolvedValue({ _tag: "Failure" });
  await expect(change(task, { status: "settled" })).resolves.toBe(false);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("does nothing when the busy-session confirmation is declined", async () => {
  const { task, change } = setup();
  mocks.confirm.mockResolvedValue(false);
  expect(await change(task, { status: "settled" })).toBe(false);
  expect(mocks.stop).not.toHaveBeenCalled();
  expect(mocks.settle).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("settles the task when a linked session cannot be found, and says so", async () => {
  const { task, change } = setup();
  mocks.read.mockReturnValue(null);
  mocks.wait.mockResolvedValue(false);
  expect(await change(task, { status: "settled" })).toBe(true);
  expect(mocks.add).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "success",
      description: expect.stringMatching(/1 linked session could not be found/),
    }),
  );
  expect(mocks.update).toHaveBeenCalled();
  expect(mocks.settle).not.toHaveBeenCalled();
});

it.each(["session", "task"])(
  "restores successful sessions when the %s update fails",
  async (stage) => {
    const { change, undo, task: initialTask } = setup();
    let task = initialTask;
    mocks.read.mockReturnValue({ label: "Done" });
    if (stage === "task") mocks.update.mockResolvedValue(false);
    else {
      task = {
        ...task,
        sessions: [
          ...task.sessions,
          { thread_id: "other", title: "Other", link: "https://app.t3.codes/threads/env/other" },
        ],
      };
      mocks.settle
        .mockResolvedValueOnce({ _tag: "Success", value: { undo, canUndo: () => true } })
        .mockResolvedValueOnce({ _tag: "Failure" });
    }
    expect(await change(task, { status: "settled" })).toBe(false);
    expect(undo).toHaveBeenCalledOnce();
  },
);

it("recovers an unloaded session before planning the cascade and releases its mount", async () => {
  const { task, change } = setup();
  const release = vi.fn();
  mocks.mount.mockReturnValue(release);
  mocks.read.mockReturnValueOnce(null).mockReturnValue({ label: "Done" });
  expect(await change(task, { status: "settled" })).toBe(true);
  expect(mocks.mount).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
  expect(mocks.settle).toHaveBeenCalledOnce();
});

it("task Undo restores only its successful settles, once, and refuses expired handles", async () => {
  const { task, change, undo } = setup();
  mocks.read.mockReturnValue({ label: "Done" });
  let current = true;
  mocks.settle.mockResolvedValue({ _tag: "Success", value: { undo, canUndo: () => current } });
  await change(task, { status: "settled" });
  const action = mocks.add.mock.lastCall?.[0].actionProps.onClick;
  if (!action) throw new Error("Undo missing");
  await Promise.all([action(), action()]);
  expect(undo).toHaveBeenCalledOnce();
  expect(mocks.update).toHaveBeenLastCalledWith(task.id, { status: "done" });
  await change(task, { status: "settled" });
  const expiredAction = mocks.add.mock.lastCall?.[0].actionProps.onClick;
  current = false;
  mocks.update.mockClear();
  await expiredAction();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(undo).toHaveBeenCalledOnce();
});

it.each([
  { label: "Guest Request", runtime: null, hasPendingApprovals: false, ready: true },
  { label: "Working", runtime: { status: "running" }, hasPendingApprovals: false, ready: false },
  { label: "Pending Approval", runtime: null, hasPendingApprovals: true, ready: false },
])("requires stopped execution and cleared approvals before settling $label", async (scenario) => {
  const { task, change } = setup();
  mocks.read.mockReturnValue(scenario);
  mocks.wait.mockImplementation(async ({ predicate }) => predicate(mocks.read()));
  expect(await change(task, { status: "settled" })).toBe(scenario.ready);
  expect(mocks.settle).toHaveBeenCalledTimes(scenario.ready ? 1 : 0);
  expect(mocks.update).toHaveBeenCalledTimes(scenario.ready ? 1 : 0);
});
