export type TaskGroupItem = {
  id: number;
  title: string;
  status: string;
  taskType?: string | null;
  parentTaskId?: number | null;
  rootTaskId?: number | null;
  serviceRequestId?: number | null;
};

export type TaskListGroup<T extends TaskGroupItem> = {
  key: string;
  kind: "solo" | "linked";
  serviceRequestId?: number | null;
  rootTaskId?: number | null;
  root: T;
  children: T[];
  tasks: T[];
};

function groupKey(task: TaskGroupItem): string {
  if (task.serviceRequestId != null) return `sr:${task.serviceRequestId}`;
  const rootId = task.rootTaskId ?? (task.parentTaskId == null ? task.id : task.parentTaskId);
  return `root:${rootId}`;
}

export function buildTaskListGroups<T extends TaskGroupItem>(tasks: T[]): TaskListGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const task of tasks) {
    const key = groupKey(task);
    const list = buckets.get(key) ?? [];
    list.push(task);
    buckets.set(key, list);
  }

  const groups: TaskListGroup<T>[] = [];
  const seen = new Set<string>();

  for (const task of tasks) {
    const key = groupKey(task);
    if (seen.has(key)) continue;
    seen.add(key);

    const groupTasks = buckets.get(key) ?? [task];
    const hasLink =
      groupTasks.length > 1 ||
      groupTasks.some((t) => t.parentTaskId != null) ||
      groupTasks.some((t) => t.serviceRequestId != null);

    if (!hasLink) {
      groups.push({
        key,
        kind: "solo",
        root: task,
        children: [],
        tasks: groupTasks,
      });
      continue;
    }

    const rootId =
      groupTasks[0].serviceRequestId != null
        ? groupTasks.find((t) => t.parentTaskId == null)?.id
        : groupTasks[0].rootTaskId ?? groupTasks.find((t) => t.parentTaskId == null)?.id;

    const root =
      groupTasks.find((t) => t.id === rootId) ??
      groupTasks.find((t) => t.parentTaskId == null) ??
      groupTasks[0];

    const children = groupTasks
      .filter((t) => t.id !== root.id)
      .sort((a, b) => {
        const order = (s: string) =>
          s === "in_progress" ? 0 : s === "pending" ? 1 : s === "completed" ? 2 : 3;
        const d = order(a.status) - order(b.status);
        return d !== 0 ? d : a.id - b.id;
      });

    groups.push({
      key,
      kind: "linked",
      serviceRequestId: root.serviceRequestId,
      rootTaskId: root.rootTaskId ?? root.id,
      root,
      children,
      tasks: groupTasks,
    });
  }

  return groups;
}
