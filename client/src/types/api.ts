import type { Equipment, Task, User } from "@shared/schema";

export type { Equipment, Task, User };

export interface TaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
}

export const emptyTaskStats: TaskStats = {
  total: 0,
  pending: 0,
  inProgress: 0,
  completed: 0,
  overdue: 0,
};
