import { createFileRoute } from "@tanstack/react-router";

import { TasksPage } from "../components/tasks/TasksPage";

export const Route = createFileRoute("/_chat/tasks")({
  validateSearch: (raw: Record<string, unknown>): { task?: number } =>
    typeof raw.task === "number" && Number.isInteger(raw.task) && raw.task > 0
      ? { task: raw.task }
      : {},
  component: TasksPage,
});
