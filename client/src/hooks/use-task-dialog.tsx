import { useState, useCallback, createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { uploadCommentAttachment } from "@/lib/upload-attachment";
import { apiRequest } from "@/lib/queryClient";
import { formatActualHours, hoursMinutesToActualHours, actualHoursToHoursMinutes } from "@shared/task-hours";
import { useAuth } from "@/hooks/use-auth";
import { useAccessControl } from "@/hooks/use-access-control";
import { useToast } from "@/hooks/use-toast";
import { useTeamUsers } from "@/hooks/use-warehouse";
import { TASK_TYPES, taskPriorityLabel, taskTypeLabel, type TaskTypeCode } from "@shared/task-constants";
import { TASK_STATUS_LABELS, taskStatusLabel } from "@shared/task-status-constants";
import {
  isServiceRequestVoidStatus,
  SERVICE_REQUEST_TYPES,
  STATUS_LABELS,
  type ServiceRequestStatus,
} from "@shared/service-request-constants";
import type { Equipment, TaskCoexecutor, TaskStatusHistory, RequestStatusHistory } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ServiceRequestWorkProgressBar } from "@/components/service-requests/service-request-work-progress";
import { LinkedTaskTree } from "@/components/tasks/linked-task-tree";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TaskComment, PartReservation, Task } from "@shared/schema";
import { useLocation, useSearch } from "wouter";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { X, ExternalLink, History, ArrowLeft, CircleDot, MessageSquare } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommentThreadList } from "@/components/comment-thread-list";
import { CommentComposer, hasUnsentCommentDraft } from "@/components/comment-composer";
import { ExternalLinksPanel } from "@/components/external-links-panel";
import { useTaskLinks, useTaskLinkMutations } from "@/hooks/use-task-links";
import { cn } from "@/lib/utils";
import { taskStatusColors } from "@/lib/badge-colors";
import { SubdivisionPicker } from "@/components/subdivision-picker";
import { useSubdivisions } from "@/hooks/use-subdivisions";
import { canAccessSubdivision } from "@shared/subdivision-scope";
import { equipmentOptionLabel } from "@/lib/equipment-label";
import { buildUrlAttachment } from "@/lib/comment-attachment";
import {
  appendTaskComment,
  invalidateTaskDomain,
  upsertTaskInListCaches,
} from "@/lib/mutation-cache";

const taskTypeCodes = TASK_TYPES.map((t) => t.code) as [
  (typeof TASK_TYPES)[number]["code"],
  ...(typeof TASK_TYPES)[number]["code"][],
];

export const taskFormSchema = z.object({
  title: z.string().min(1, "Название обязательно"),
  description: z.string().optional(),
  taskType: z.enum(taskTypeCodes),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  status: z.enum(["pending", "in_progress", "completed", "overdue"]),
  dueDate: z.date().optional().or(z.literal(undefined)).or(z.literal(null)),
  reminderDate: z.date().optional().or(z.literal(undefined)).or(z.literal(null)),
  equipmentId: z.string().optional(),
  assigneeId: z.string().optional(),
  maintenanceType: z.string().optional(),
  taskTypeCustom: z.string().optional(),
  parentTaskId: z.string().optional(),
  estimatedHours: z.number().optional().or(z.literal(undefined)).or(z.literal(null)),
  actualHours: z.number().optional().or(z.literal(undefined)).or(z.literal(null)),
});

export type TaskFormData = z.infer<typeof taskFormSchema>;

type TaskUpdatePayload = TaskFormData & {
  completingTask?: boolean;
  completionComment?: string;
  subdivisionId?: number | null;
};

export interface TaskRecord {
  id: number;
  title: string;
  description?: string;
  userId: number;
  status: "pending" | "in_progress" | "completed" | "overdue";
  priority: "low" | "medium" | "high" | "urgent";
  taskType?: string | null;
  assigneeId?: number | null;
  assigneeName?: string | null;
  createdBy?: string;
  createdById?: number | null;
  lastModifiedBy?: string;
  completedBy?: string;
  completedAt?: string;
  completionComment?: string | null;
  assigneeAssignedAt?: string | null;
  openedByName?: string;
  openedAt?: string;
  dueDate?: string;
  reminderDate?: string;
  equipmentId?: string;
  maintenanceType?: string;
  estimatedHours?: number;
  actualHours?: number;
  createdAt: string;
  updatedAt: string;
  sourceType?: string | null;
  serviceRequestId?: number | null;
  maintenanceId?: number | null;
  parentTaskId?: number | null;
  rootTaskId?: number | null;
  subdivisionId?: number | null;
}

interface TaskTreeResponse {
  root: Task;
  tasks: Task[];
  summary: {
    total: number;
    completed: number;
    openCount?: number;
    byStatus: Record<string, number>;
    progress: number;
    inProgress?: { id: number; title: string; parentTaskId?: number | null }[];
  };
}

interface OpenCreateOptions {
  parentTaskId?: number;
  taskType?: TaskTypeCode;
  dueDate?: Date;
  subdivisionId?: number;
}

interface TaskDialogContextType {
  openCreate: (options?: OpenCreateOptions) => void;
  openEdit: (task: TaskRecord) => void;
  close: () => void;
}

const TaskDialogContext = createContext<TaskDialogContextType | undefined>(undefined);

function defaultFormValues(): TaskFormData {
  return {
    title: "",
    description: "",
    taskType: "task",
    priority: "medium",
    status: "pending",
    parentTaskId: "none",
    taskTypeCustom: "",
  };
}

function toTaskRecord(task: Task): TaskRecord {
  return task as unknown as TaskRecord;
}

function subtaskSortOrder(status: string): number {
  switch (status) {
    case "in_progress":
      return 0;
    case "pending":
      return 1;
    case "overdue":
      return 2;
    case "completed":
      return 3;
    default:
      return 4;
  }
}

function resolveMaintenanceType(data: TaskFormData): string | undefined {
  if (data.taskType === "other" && data.taskTypeCustom?.trim()) {
    return data.taskTypeCustom.trim();
  }
  if (data.maintenanceType && data.maintenanceType !== "general") {
    return data.maintenanceType;
  }
  return undefined;
}

export function TaskDialogProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { canConvertTaskToServiceRequest, canCreateTasks, canProcessTasks, isAdmin, subdivisionScope } =
    useAccessControl();
  const scope = subdivisionScope();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const highlightCommentId = useMemo(() => {
    const raw = search.startsWith("?") ? search.slice(1) : search;
    const id = new URLSearchParams(raw).get("comment");
    return id && !Number.isNaN(Number(id)) ? Number(id) : null;
  }, [search]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState<"details" | "subtasks" | "comments" | "history">("details");
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const [taskNavStack, setTaskNavStack] = useState<TaskRecord[]>([]);
  const [commentText, setCommentText] = useState("");
  const [coexecId, setCoexecId] = useState("");
  const [convertRequestType, setConvertRequestType] = useState("repair");
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [completionWorkComment, setCompletionWorkComment] = useState("");
  const [completionDurationHours, setCompletionDurationHours] = useState("");
  const [completionDurationMinutes, setCompletionDurationMinutes] = useState("");
  const [subdivisionId, setSubdivisionId] = useState("");
  const { data: subdivisions = [] } = useSubdivisions();

  const canModify = editingTask ? canProcessTasks() : canCreateTasks();
  const canAssignExecutor =
    isAdmin || user?.role === "marketing_manager";
  const canSelfAssignAsExecutor = canProcessTasks() && !canAssignExecutor && Boolean(user);
  const isSelfAssignee = Boolean(editingTask && user && editingTask.assigneeId === user.id);
  const canTakeTaskAsExecutor = Boolean(
    canSelfAssignAsExecutor && editingTask && !editingTask.assigneeId
  );
  const canManageParticipants = Boolean(editingTask && canModify);

  const { data: equipment = [] } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
    enabled: open,
  });

  const allowedSubdivisionIds = useMemo(() => {
    if (!scope || scope.viewAll) return undefined;
    return scope.ids;
  }, [scope]);

  const filteredEquipment = useMemo(() => {
    if (subdivisionId) {
      const subId = Number(subdivisionId);
      return equipment.filter((eq) => eq.subdivisionId === subId);
    }
    if (scope && !scope.viewAll) {
      return equipment.filter((eq) => canAccessSubdivision(scope, eq.subdivisionId));
    }
    return editingTask ? equipment : [];
  }, [equipment, subdivisionId, scope, editingTask]);

  const { data: teamUsers = [] } = useTeamUsers();

  const { data: taskComments = [], refetch: refetchComments } = useQuery<TaskComment[]>({
    queryKey: ["/api/tasks", editingTask?.id, "comments"],
    enabled: open && !!editingTask?.id,
    refetchInterval: false,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tasks/${editingTask!.id}/comments`);
      return res.json();
    },
  });

  const { data: taskLinks = [] } = useTaskLinks(editingTask?.id);
  const { addLink: addTaskLinkMutation, removeLink: removeTaskLinkMutation } =
    useTaskLinkMutations(editingTask?.id);

  const { data: taskReservations = [] } = useQuery<PartReservation[]>({
    queryKey: ["/api/tasks", editingTask?.id, "reservations"],
    enabled: open && !!editingTask?.id,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tasks/${editingTask!.id}/reservations`);
      return res.json();
    },
  });

  const treeRootId = editingTask?.rootTaskId ?? editingTask?.id;
  const isRootTask = Boolean(editingTask && treeRootId === editingTask.id);

  const { data: taskTree, refetch: refetchTaskTree } = useQuery<TaskTreeResponse>({
    queryKey: ["/api/tasks", treeRootId, "tree"],
    enabled: open && !!treeRootId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tasks/${treeRootId}/tree`);
      return res.json();
    },
  });

  const sortedTreeSubtasks = useMemo(() => {
    if (!taskTree) return [];
    return taskTree.tasks
      .filter((t) => t.id !== taskTree.root.id)
      .sort((a, b) => {
        const byStatus = subtaskSortOrder(a.status) - subtaskSortOrder(b.status);
        if (byStatus !== 0) return byStatus;
        return a.id - b.id;
      });
  }, [taskTree]);

  const activeSubtasks = useMemo(
    () => sortedTreeSubtasks.filter((t) => t.status === "in_progress"),
    [sortedTreeSubtasks]
  );

  const { data: taskCoexecutors = [], refetch: refetchCoexecutors } = useQuery<TaskCoexecutor[]>({
    queryKey: ["/api/tasks", editingTask?.id, "coexecutors"],
    enabled: open && !!editingTask?.id,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tasks/${editingTask!.id}/coexecutors`);
      return res.json();
    },
  });

  const linkedServiceRequestId = editingTask?.serviceRequestId ?? null;

  const { data: taskHistory = [], refetch: refetchTaskHistory } = useQuery<TaskStatusHistory[]>({
    queryKey: ["/api/tasks", editingTask?.id, "history"],
    enabled: open && !!editingTask?.id,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tasks/${editingTask!.id}/history`);
      return res.json();
    },
  });

  const { data: serviceRequestHistoryPayload, refetch: refetchSrHistory } = useQuery<{
    serviceRequestId: number | null;
    history: RequestStatusHistory[];
    workProgress?: {
      subtasksTotal: number;
      subtasksCompleted: number;
      subtasksProgress: number;
      requestStatus: string;
      requestComplete: boolean;
      overallProgress: number;
      inProgressSubtasks?: { id: number; title: string }[];
    } | null;
  }>({
    queryKey: ["/api/tasks", editingTask?.id, "service-request-history"],
    enabled: open && !!editingTask?.id,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tasks/${editingTask!.id}/service-request-history`);
      return res.json();
    },
  });

  const srWorkProgress = serviceRequestHistoryPayload?.workProgress ?? null;
  const srIsVoid = Boolean(
    srWorkProgress && isServiceRequestVoidStatus(srWorkProgress.requestStatus)
  );
  const workViaServiceRequest = Boolean(linkedServiceRequestId);
  const taskManagedViaServiceRequest = Boolean(
    linkedServiceRequestId && isRootTask && !srIsVoid
  );

  const canViewTaskDetails = Boolean(
    editingTask &&
      user &&
      (canAssignExecutor ||
        canProcessTasks() ||
        editingTask.createdById === user.id ||
        editingTask.assigneeId === user.id ||
        taskCoexecutors.some((c) => c.userId === user.id))
  );

  useEffect(() => {
    if (!open || !editingTask?.id) return;
    apiRequest("GET", `/api/tasks/${editingTask.id}`)
      .then((res) => res.json())
      .then((task: Task) => setEditingTask(toTaskRecord(task)))
      .catch(() => undefined);
  }, [open, editingTask?.id]);

  const canCommentOnTask = Boolean(
    editingTask &&
      user &&
      (canAssignExecutor ||
        canProcessTasks() ||
        editingTask.createdById === user.id ||
        editingTask.assigneeId === user.id ||
        taskCoexecutors.some((c) => c.userId === user.id))
  );

  useEffect(() => {
    if (!open || !highlightCommentId || taskComments.length === 0) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById(`task-comment-${highlightCommentId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [open, highlightCommentId, taskComments]);

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: defaultFormValues(),
  });

  const watchedStatus = form.watch("status");
  const watchedEquipmentId = form.watch("equipmentId");

  const handleSubdivisionChange = useCallback(
    (value: string) => {
      setSubdivisionId(value);
      const currentEq = form.getValues("equipmentId");
      if (!currentEq || currentEq === "none") return;
      const eq = equipment.find((e) => e.id === currentEq);
      if (value && eq?.subdivisionId !== Number(value)) {
        form.setValue("equipmentId", "");
      }
    },
    [equipment, form]
  );

  useEffect(() => {
    if (subdivisionId) return;
    if (!watchedEquipmentId || watchedEquipmentId === "none") return;
    const eq = equipment.find((e) => e.id === watchedEquipmentId);
    if (eq?.subdivisionId) {
      setSubdivisionId(String(eq.subdivisionId));
    }
  }, [watchedEquipmentId, equipment, subdivisionId]);
  const isCompletingTask = Boolean(
    editingTask && watchedStatus === "completed" && editingTask.status !== "completed"
  );

  const applyTaskToForm = useCallback(
    (task: TaskRecord) => {
      form.reset({
        title: task.title,
        description: task.description || "",
        taskType: (task.taskType as TaskFormData["taskType"]) || "task",
        taskTypeCustom: task.taskType === "other" ? task.maintenanceType || "" : "",
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
        reminderDate: task.reminderDate ? new Date(task.reminderDate) : undefined,
        equipmentId: task.equipmentId || "",
        assigneeId: task.assigneeId ? String(task.assigneeId) : "none",
        maintenanceType: task.maintenanceType || "",
        parentTaskId: task.parentTaskId ? String(task.parentTaskId) : "none",
        estimatedHours: task.estimatedHours,
        actualHours: task.actualHours,
      });
      setCompletionWorkComment(task.completionComment ?? "");
      if (task.actualHours != null) {
        const { hours, minutes } = actualHoursToHoursMinutes(task.actualHours);
        setCompletionDurationHours(hours > 0 ? String(hours) : "");
        setCompletionDurationMinutes(String(minutes));
      } else {
        setCompletionDurationHours("");
        setCompletionDurationMinutes("");
      }
      setSubdivisionId(task.subdivisionId ? String(task.subdivisionId) : "");
    },
    [form]
  );

  const loadTaskIntoDialog = useCallback(
    async (task: TaskRecord) => {
      setCommentText("");
      setCompletionWorkComment("");
      setCompletionDurationHours("");
      setCompletionDurationMinutes("");
      try {
        const res = await apiRequest("GET", `/api/tasks/${task.id}`);
        const fresh = toTaskRecord(await res.json());
        setEditingTask(fresh);
        applyTaskToForm(fresh);
        const rootId = fresh.rootTaskId ?? fresh.id;
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", rootId, "tree"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", fresh.id, "subtasks"] });
      } catch {
        setEditingTask(task);
        applyTaskToForm(task);
      }
    },
    [applyTaskToForm, queryClient]
  );

  const openCreate = useCallback(
    (options?: OpenCreateOptions) => {
      setEditingTask(null);
      setTaskNavStack([]);
      setDialogTab("details");
      setCommentText("");
      setCompletionWorkComment("");
      setCompletionDurationHours("");
      setCompletionDurationMinutes("");
      setSubdivisionId(
        options?.subdivisionId != null
          ? String(options.subdivisionId)
          : user?.subdivisionId
            ? String(user.subdivisionId)
            : ""
      );
      form.reset({
        ...defaultFormValues(),
        assigneeId: "",
        taskType: options?.taskType ?? "task",
        dueDate: options?.dueDate,
      });
      setOpen(true);
    },
    [form, user]
  );

  const openEdit = useCallback(
    (task: TaskRecord) => {
      setTaskNavStack([]);
      setDialogTab("details");
      setEditingTask(task);
      setCommentText("");
      setCompletionWorkComment("");
      setCompletionDurationHours("");
      setCompletionDurationMinutes("");
      applyTaskToForm(task);
      setOpen(true);
    },
    [applyTaskToForm]
  );

  const navigateAway = useCallback(
    (path: string) => {
      setOpen(false);
      setEditingTask(null);
      setTaskNavStack([]);
      setCommentText("");
      setCompletionWorkComment("");
      setCompletionDurationHours("");
      setCompletionDurationMinutes("");
      setSubdivisionId("");
      form.reset(defaultFormValues());
      setLocation(path);
    },
    [form, setLocation]
  );

  const navigateToSubtask = useCallback(
    (subtask: TaskRecord) => {
      if (editingTask && editingTask.id !== subtask.id) {
        setTaskNavStack((stack) => [...stack, editingTask]);
      }
      void loadTaskIntoDialog(subtask);
    },
    [editingTask, loadTaskIntoDialog]
  );

  const goBackToParentTask = useCallback(() => {
    if (taskNavStack.length > 0) {
      const parent = taskNavStack[taskNavStack.length - 1];
      setTaskNavStack((stack) => stack.slice(0, -1));
      void loadTaskIntoDialog(parent);
      return;
    }
    if (editingTask?.parentTaskId && taskTree?.tasks) {
      const parent = taskTree.tasks.find((t) => t.id === editingTask.parentTaskId);
      if (parent) void loadTaskIntoDialog(toTaskRecord(parent));
    }
  }, [taskNavStack, loadTaskIntoDialog, editingTask, taskTree]);

  const navigateToParentTask = useCallback(() => {
    if (!editingTask?.parentTaskId || !taskTree?.tasks) return;
    const parent = taskTree.tasks.find((t) => t.id === editingTask.parentTaskId);
    if (!parent) return;
    setTaskNavStack((stack) => [...stack, editingTask]);
    void loadTaskIntoDialog(toTaskRecord(parent));
  }, [editingTask, taskTree, loadTaskIntoDialog]);

  const close = useCallback(() => {
    setOpen(false);
    setDialogTab("details");
    setEditingTask(null);
    setTaskNavStack([]);
    setCommentText("");
    setCompletionWorkComment("");
    setCompletionDurationHours("");
    setCompletionDurationMinutes("");
    setSubdivisionId("");
    form.reset(defaultFormValues());
  }, [form]);

  const createTask = useMutation({
    mutationFn: async (data: TaskFormData) => {
      const res = await apiRequest("POST", "/api/tasks", {
        ...data,
        createdBy: user?.name || "Неизвестный пользователь",
        maintenanceType: resolveMaintenanceType(data),
        subdivisionId: subdivisionId ? Number(subdivisionId) : undefined,
      });
      return res.json();
    },
    onSuccess: async (newTask: Task) => {
      upsertTaskInListCaches(queryClient, newTask);
      await invalidateTaskDomain(queryClient);
      window.dispatchEvent(new CustomEvent("taskCreated"));
      window.dispatchEvent(new CustomEvent("equipmentUpdated"));
      close();
      toast({ title: "Задача создана", description: "Задача успешно создана" });
    },
    onError: (err: Error) => {
      toast({ title: "Ошибка", description: err.message || "Не удалось создать задачу", variant: "destructive" });
    },
  });

  const updateTask = useMutation({
    mutationFn: async (data: TaskUpdatePayload) => {
      if (!editingTask) return;
      const payload: Record<string, unknown> = {
        ...data,
        maintenanceType: resolveMaintenanceType(data),
        lastModifiedBy: user?.name || "Неизвестный пользователь",
        ...(data.status === "completed" && { completedBy: user?.name || "Неизвестный пользователь" }),
      };
      delete payload.completingTask;
      delete payload.completionComment;

      if (data.completingTask && data.completionComment?.trim()) {
        payload.completionComment = data.completionComment.trim();
      }

      if (canAssignExecutor && data.assigneeId !== undefined) {
        if (data.assigneeId && data.assigneeId !== "none") {
          payload.assigneeId = Number(data.assigneeId);
          payload.assigneeName =
            teamUsers.find((u) => String(u.id) === data.assigneeId)?.name ?? null;
        } else {
          payload.assigneeId = null;
          payload.assigneeName = null;
        }
      } else if (
        canSelfAssignAsExecutor &&
        user &&
        data.assigneeId &&
        data.assigneeId !== "none" &&
        Number(data.assigneeId) === user.id
      ) {
        payload.assigneeId = user.id;
        payload.assigneeName = user.name;
      }

      const res = await apiRequest("PUT", `/api/tasks/${editingTask.id}`, payload);
      const updated = await res.json();

      return updated;
    },
    onSuccess: async (updated: Task) => {
      if (updated) upsertTaskInListCaches(queryClient, updated);
      await invalidateTaskDomain(queryClient);
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse/parts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse/activity"] });
      window.dispatchEvent(new CustomEvent("equipmentUpdated"));
      if (treeRootId) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", treeRootId, "tree"] });
      }
      window.dispatchEvent(new CustomEvent("taskUpdated"));

      if (taskNavStack.length > 0) {
        const parent = taskNavStack[taskNavStack.length - 1];
        setTaskNavStack((stack) => stack.slice(0, -1));
        await loadTaskIntoDialog(parent);
        toast({
          title: "Подзадача сохранена",
          description: "Возврат к родительской задаче",
        });
        return;
      }

      close();
      toast({ title: "Задача обновлена", description: "Задача успешно обновлена" });
    },
    onError: (err: Error) => {
      toast({ title: "Ошибка", description: err.message || "Не удалось обновить задачу", variant: "destructive" });
    },
  });

  const convertToServiceRequest = useMutation({
    mutationFn: async () => {
      if (!editingTask) return;
      const res = await apiRequest("POST", `/api/tasks/${editingTask.id}/convert-to-service-request`, {
        requestType: convertRequestType,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      const srId = data?.serviceRequest?.id ?? data?.task?.serviceRequestId;
      if (data?.task) {
        setEditingTask(toTaskRecord(data.task as Task));
      } else if (srId && editingTask) {
        setEditingTask({ ...editingTask, serviceRequestId: srId });
      }
      refetchTaskHistory();
      refetchSrHistory();
      toast({
        title: "Создана сервисная заявка",
        description: srId ? `Заявка #${srId} связана с задачей` : undefined,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    },
  });

  const addComment = useMutation({
    mutationFn: async () => {
      if (!editingTask) return;
      let attachments: { name: string; url: string }[] = [];
      if (attachmentFile) {
        attachments = [
          await uploadCommentAttachment(
            attachmentFile,
            attachmentName.trim() || attachmentFile.name
          ),
        ];
      } else {
        const urlAttachment = buildUrlAttachment(attachmentName, attachmentUrl);
        if (urlAttachment) attachments = [urlAttachment];
      }
      if (!commentText.trim() && attachments.length === 0) return;
      const res = await apiRequest("POST", `/api/tasks/${editingTask.id}/comments`, {
        body: commentText.trim(),
        attachments,
      });
      return res.json();
    },
    onSuccess: (comment: TaskComment) => {
      if (comment && editingTask) {
        appendTaskComment(queryClient, editingTask.id, comment);
      } else {
        refetchComments();
      }
      setCommentText("");
      setAttachmentName("");
      setAttachmentUrl("");
      setAttachmentFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      window.dispatchEvent(new CustomEvent("taskCommentAdded"));
      toast({ title: "Комментарий добавлен" });
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось добавить комментарий", variant: "destructive" });
    },
  });

  const updateTaskCommentMutation = useMutation({
    mutationFn: async ({ commentId, body }: { commentId: number; body: string }) => {
      if (!editingTask) return;
      const res = await apiRequest(
        "PUT",
        `/api/tasks/${editingTask.id}/comments/${commentId}`,
        { body }
      );
      return res.json();
    },
    onSuccess: (comment: TaskComment) => {
      if (comment && editingTask) {
        queryClient.setQueryData<TaskComment[]>(
          ["/api/tasks", editingTask.id, "comments"],
          (old) => old?.map((c) => (c.id === comment.id ? comment : c)) ?? [comment]
        );
      } else {
        refetchComments();
      }
      toast({ title: "Комментарий обновлён" });
    },
    onError: (err: Error) => {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    },
  });

  const deleteTaskCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      if (!editingTask) return;
      await apiRequest("DELETE", `/api/tasks/${editingTask.id}/comments/${commentId}`);
    },
    onSuccess: (_, commentId) => {
      if (editingTask) {
        queryClient.setQueryData<TaskComment[]>(
          ["/api/tasks", editingTask.id, "comments"],
          (old) => old?.filter((c) => c.id !== commentId) ?? []
        );
      }
      toast({ title: "Комментарий удалён" });
    },
    onError: (err: Error) => {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    },
  });

  const addTaskCoexecutor = useMutation({
    mutationFn: async () => {
      if (!editingTask || !coexecId) return;
      const person = teamUsers.find((u) => String(u.id) === coexecId);
      if (!person) return;
      const res = await apiRequest("POST", `/api/tasks/${editingTask.id}/coexecutors`, {
        userId: person.id,
        userName: person.name,
      });
      return res.json();
    },
    onSuccess: () => {
      setCoexecId("");
      refetchCoexecutors();
      toast({ title: "Соисполнитель добавлен" });
    },
    onError: (err: Error) => {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    },
  });

  const assignSelfAsExecutor = useMutation({
    mutationFn: async () => {
      if (!editingTask || !user) return;
      const values = form.getValues();
      const res = await apiRequest("PUT", `/api/tasks/${editingTask.id}`, {
        title: values.title,
        description: values.description || undefined,
        taskType: values.taskType,
        priority: values.priority,
        status: values.status,
        equipmentId: values.equipmentId && values.equipmentId !== "none" ? values.equipmentId : undefined,
        maintenanceType: resolveMaintenanceType(values),
        assigneeId: user.id,
        assigneeName: user.name,
        lastModifiedBy: user.name,
      });
      return res.json();
    },
    onSuccess: async (updated: Task) => {
      const fresh = toTaskRecord(updated);
      setEditingTask(fresh);
      applyTaskToForm(fresh);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Вы назначены исполнителем" });
    },
    onError: (err: Error) => {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    },
  });

  const removeTaskCoexecutor = useMutation({
    mutationFn: async (coId: number) => {
      if (!editingTask) return;
      const res = await apiRequest("DELETE", `/api/tasks/${editingTask.id}/coexecutors/${coId}`);
      return res.json();
    },
    onSuccess: () => {
      refetchCoexecutors();
    },
  });

  const onSubmit = (data: TaskFormData) => {
    if (!canModify) return;

    if (
      hasUnsentCommentDraft(commentText, attachmentFile, attachmentName, attachmentUrl)
    ) {
      toast({
        title: "Неотправленный комментарий",
        description:
          "Нажмите «Отправить комментарий» на вкладке «Комментарии». Кнопка «Сохранить» не отправляет сообщения.",
        variant: "destructive",
      });
      setDialogTab("comments");
      return;
    }

    const reservedPending = taskReservations.filter((r) => r.status === "reserved");
    if (
      editingTask &&
      data.status === "completed" &&
      reservedPending.length > 0 &&
      !window.confirm(
        `Подтвердите списание со склада:\n${reservedPending
          .map((r) => `• ${r.partName} — ${r.quantity} шт.`)
          .join("\n")}`
      )
    ) {
      return;
    }

    const srBlocksTaskCompletion =
      linkedServiceRequestId &&
      srWorkProgress &&
      !isServiceRequestVoidStatus(srWorkProgress.requestStatus) &&
      (!srWorkProgress.requestComplete ||
        srWorkProgress.subtasksCompleted < srWorkProgress.subtasksTotal);

    if (editingTask && data.status === "completed" && srBlocksTaskCompletion) {
      toast({
        title: "Завершение через заявку",
        description:
          srWorkProgress!.subtasksTotal > srWorkProgress!.subtasksCompleted
            ? `Завершите подзадачи в заявке #${linkedServiceRequestId} (${srWorkProgress!.subtasksCompleted}/${srWorkProgress!.subtasksTotal})`
            : `Закройте сервисную заявку #${linkedServiceRequestId} — задача завершится автоматически`,
        variant: "destructive",
      });
      return;
    }

    if (
      editingTask &&
      isRootTask &&
      data.status === "completed" &&
      !linkedServiceRequestId &&
      taskTree?.summary &&
      (taskTree.summary.openCount ?? taskTree.summary.total - taskTree.summary.completed) > 0
    ) {
      const openCount =
        taskTree.summary.openCount ?? taskTree.summary.total - taskTree.summary.completed;
      if (
        !window.confirm(
          `При завершении главной задачи будут автоматически завершены ${openCount} незавершённых подзадач. Продолжить?`
        )
      ) {
        return;
      }
    }

    const maintenanceType = resolveMaintenanceType(data);

    const completingTask = Boolean(
      editingTask && data.status === "completed" && editingTask.status !== "completed"
    );

    if (completingTask) {
      if (!completionWorkComment.trim()) {
        toast({ title: "Укажите описание выполненных работ", variant: "destructive" });
        return;
      }
      const hoursPart = completionDurationHours.trim()
        ? Number(completionDurationHours.replace(",", "."))
        : 0;
      const minutesPart = completionDurationMinutes.trim()
        ? Number(completionDurationMinutes.replace(",", "."))
        : 0;
      if (
        (!completionDurationHours.trim() && !completionDurationMinutes.trim()) ||
        Number.isNaN(hoursPart) ||
        Number.isNaN(minutesPart) ||
        hoursPart < 0 ||
        minutesPart < 0 ||
        minutesPart > 59
      ) {
        toast({
          title: "Укажите затраченное время",
          description: "Часы — целое число, минуты — от 0 до 59",
          variant: "destructive",
        });
        return;
      }
      try {
        data.actualHours = hoursMinutesToActualHours(hoursPart, minutesPart);
      } catch {
        toast({ title: "Время должно быть больше нуля", variant: "destructive" });
        return;
      }
    }

    const cleanData: TaskUpdatePayload = {
      title: data.title,
      taskType: data.taskType,
      priority: data.priority,
      status: editingTask ? data.status : "pending",
      dueDate:
        isAdmin && data.dueDate
          ? data.dueDate
          : editingTask
            ? null
            : null,
      reminderDate: editingTask ? data.reminderDate || null : null,
      estimatedHours: editingTask && isAdmin ? data.estimatedHours || null : null,
      actualHours: editingTask
        ? completingTask
          ? data.actualHours ?? null
          : data.actualHours || null
        : null,
      equipmentId: data.equipmentId && data.equipmentId !== "none" ? data.equipmentId : undefined,
      subdivisionId: subdivisionId ? Number(subdivisionId) : null,
      maintenanceType,
      description: data.description || undefined,
      ...(editingTask && canAssignExecutor
        ? { assigneeId: data.assigneeId || "none" }
        : {}),
      ...(completingTask
        ? { completingTask: true, completionComment: completionWorkComment.trim() }
        : {}),
    };

    if (!editingTask && !subdivisionId) {
      toast({
        title: "Выберите подразделение",
        description: "Сначала укажите подразделение для новой задачи",
        variant: "destructive",
      });
      return;
    }

    if (editingTask) {
      updateTask.mutate(cleanData);
    } else {
      createTask.mutate(cleanData as TaskFormData);
    }
  };

  return (
    <TaskDialogContext.Provider value={{ openCreate, openEdit, close }}>
      {children}
      <Dialog open={open} onOpenChange={(v) => !v && close()}>
        {open ? (
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden sm:max-w-4xl">
          <div className="shrink-0 border-b bg-muted/30 pl-3 pr-12 py-2 space-y-1">
            <div className="flex items-start gap-2 min-w-0">
              {(taskNavStack.length > 0 || editingTask?.parentTaskId) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 shrink-0 -ml-1"
                  onClick={goBackToParentTask}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </Button>
              )}
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-base font-bold leading-snug text-multiline">
                  {editingTask
                    ? `#${editingTask.id} · ${form.watch("title") || editingTask.title}`
                    : "Новая задача"}
                </DialogTitle>
                {editingTask && (
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {canModify ? (
                      <Select
                        value={watchedStatus}
                        onValueChange={(value) =>
                          form.setValue("status", value as TaskFormData["status"], {
                            shouldDirty: true,
                          })
                        }
                      >
                        <SelectTrigger
                          className={cn(
                            "h-6 w-[132px] text-[10px] border-0 shadow-none",
                            taskStatusColors[watchedStatus] ?? taskStatusColors.pending
                          )}
                        >
                          <SelectValue placeholder="Статус" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">{TASK_STATUS_LABELS.pending}</SelectItem>
                          <SelectItem value="in_progress">{TASK_STATUS_LABELS.in_progress}</SelectItem>
                          {!taskManagedViaServiceRequest && (
                            <SelectItem value="completed">{TASK_STATUS_LABELS.completed}</SelectItem>
                          )}
                          <SelectItem value="overdue">{TASK_STATUS_LABELS.overdue}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge
                        className={cn(
                          "text-[10px] h-5",
                          taskStatusColors[watchedStatus] ?? taskStatusColors.pending
                        )}
                      >
                        {taskStatusLabel(watchedStatus)}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] h-5">
                      {taskPriorityLabel(form.watch("priority"))}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] h-5 max-w-[140px] text-multiline">
                      {taskTypeLabel(form.watch("taskType"), form.watch("taskTypeCustom"))}
                    </Badge>
                    {linkedServiceRequestId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2 border-indigo-300/60 bg-indigo-50/80 dark:bg-indigo-950/30"
                        onClick={() =>
                          navigateAway(`/service-requests/${linkedServiceRequestId}?from=tasks`)
                        }
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Заявка #{linkedServiceRequestId}
                      </Button>
                    )}
                  </div>
                )}
                {!editingTask && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Поля с * обязательны. Исполнитель назначается при обработке.
                  </p>
                )}
              </div>
            </div>
          </div>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              <Tabs
                value={editingTask ? dialogTab : "details"}
                onValueChange={(v) => {
                  if (editingTask) {
                    setDialogTab(v as "details" | "subtasks" | "comments" | "history");
                  }
                }}
                className="flex flex-col flex-1 min-h-0"
              >
                {editingTask && (
                  <TabsList className="shrink-0 mx-4 mt-2 h-9 grid w-full max-w-xl grid-cols-4 bg-muted/60">
                    <TabsTrigger value="details" className="text-xs">Детали</TabsTrigger>
                    <TabsTrigger
                      value="subtasks"
                      className="text-xs"
                      disabled={
                        !(
                          (taskTree?.summary?.total ?? 0) > 0 ||
                          (linkedServiceRequestId &&
                            (taskManagedViaServiceRequest ||
                              (srWorkProgress?.subtasksTotal ?? 0) > 0))
                        )
                      }
                    >
                      Подзадачи (
                      {linkedServiceRequestId
                        ? srWorkProgress?.subtasksTotal ?? 0
                        : taskTree?.summary?.total ?? 0}
                      )
                    </TabsTrigger>
                    <TabsTrigger value="comments" className="text-xs">
                      Коммент. ({taskComments.length})
                    </TabsTrigger>
                    <TabsTrigger value="history" className="text-xs">История</TabsTrigger>
                  </TabsList>
                )}
                <div className="overflow-y-auto px-4 py-3 min-h-0 max-h-[min(56vh,520px)]">
                  <TabsContent value="details" className="mt-0 space-y-3">
                    {editingTask && isCompletingTask && canModify && (
                      <div className="rounded-md border border-green-200 bg-green-50/50 dark:bg-green-950/20 p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Итог при закрытии</p>
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                          <div>
                            <Label className="text-xs">
                              Описание работ <span className="text-red-500">*</span>
                            </Label>
                            <Textarea
                              className="mt-1"
                              placeholder="Что было сделано"
                              value={completionWorkComment}
                              onChange={(e) => setCompletionWorkComment(e.target.value)}
                              rows={3}
                            />
                          </div>
                          <div className="space-y-2 shrink-0">
                            <Label className="text-xs">
                              Затрачено <span className="text-red-500">*</span>
                            </Label>
                            <div className="flex gap-2">
                              <div className="w-16">
                                <Label className="text-[10px] text-muted-foreground">Часы</Label>
                                <Input
                                  className="mt-0.5"
                                  type="number"
                                  min={0}
                                  step={1}
                                  placeholder="0"
                                  value={completionDurationHours}
                                  onChange={(e) => setCompletionDurationHours(e.target.value)}
                                />
                              </div>
                              <div className="w-16">
                                <Label className="text-[10px] text-muted-foreground">Мин</Label>
                                <Input
                                  className="mt-0.5"
                                  type="number"
                                  min={0}
                                  max={59}
                                  step={1}
                                  placeholder="45"
                                  value={completionDurationMinutes}
                                  onChange={(e) => setCompletionDurationMinutes(e.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {editingTask &&
                      editingTask.status === "completed" &&
                      !isCompletingTask &&
                      (editingTask.completionComment || editingTask.actualHours != null) && (
                        <div className="rounded-md border bg-muted/30 p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Итог работ</p>
                          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                            {editingTask.completionComment && (
                              <p className="text-sm whitespace-pre-wrap">{editingTask.completionComment}</p>
                            )}
                            {editingTask.actualHours != null && (
                              <div className="sm:text-right shrink-0">
                                <p className="text-xs text-muted-foreground">Затрачено</p>
                                <p className="text-sm font-semibold">{formatActualHours(editingTask.actualHours)}</p>
                              </div>
                            )}
                          </div>
                          {(editingTask.completedBy || editingTask.completedAt) && (
                            <p className="text-xs text-muted-foreground mt-2">
                              {editingTask.completedBy ? `Закрыл: ${editingTask.completedBy}` : ""}
                              {editingTask.completedAt
                                ? `${editingTask.completedBy ? " · " : ""}${format(new Date(editingTask.completedAt), "dd.MM.yyyy HH:mm", { locale: ru })}`
                                : ""}
                            </p>
                          )}
                        </div>
                      )}
                    {!editingTask && !canModify && (
                      <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-md">
                        Только просмотр — нет прав на изменение.
                      </p>
                    )}
                    {editingTask && !canModify && (
                        <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-md">
                          Только просмотр — нет прав на изменение.
                        </p>
                      )}
                      {editingTask?.parentTaskId && taskTree?.tasks && !taskNavStack.length && (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={navigateToParentTask}
                        >
                          ↑ Родитель: #{editingTask.parentTaskId}{" "}
                          {taskTree.tasks.find((t) => t.id === editingTask.parentTaskId)?.title ?? ""}
                        </button>
                      )}
                      {editingTask?.openedByName && (
                        <p className="text-xs text-muted-foreground">
                          В работе: {editingTask.openedByName}
                          {editingTask.openedAt
                            ? ` · ${format(new Date(editingTask.openedAt), "dd.MM.yyyy HH:mm", { locale: ru })}`
                            : ""}
                        </p>
                      )}
                      <fieldset disabled={!canModify} className="space-y-3 border-0 p-0 m-0 min-w-0">
              <SubdivisionPicker
                value={subdivisionId}
                onChange={handleSubdivisionChange}
                label="Подразделение"
                required={!editingTask}
                disabled={!canModify}
                allowedIds={allowedSubdivisionIds}
              />

              <FormField
                control={form.control}
                name="equipmentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Оборудование</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || ""}
                      disabled={!editingTask && !subdivisionId}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !editingTask && !subdivisionId
                                ? "Сначала выберите подразделение"
                                : "Выберите оборудование"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Не связано с оборудованием</SelectItem>
                        {filteredEquipment.map((eq) => (
                          <SelectItem key={eq.id} value={eq.id}>
                            {equipmentOptionLabel(eq)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Название <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Краткое название задачи" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="taskType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Тип <span className="text-red-500">*</span>
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите тип" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TASK_TYPES.map((t) => (
                            <SelectItem key={t.code} value={t.code}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {form.watch("taskType") === "other" && (
                <FormField
                  control={form.control}
                  name="taskTypeCustom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Название типа «Прочее»</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Например: Настройка, Консультация..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Описание</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Что произошло, что нужно сделать..." rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {editingTask && canViewTaskDetails && (
                <ExternalLinksPanel
                  links={taskLinks}
                  canEdit={canCommentOnTask}
                  isPending={
                    addTaskLinkMutation.isPending || removeTaskLinkMutation.isPending
                  }
                  onAdd={async (body) => {
                    await addTaskLinkMutation.mutateAsync(body);
                  }}
                  onRemove={async (linkId) => {
                    await removeTaskLinkMutation.mutateAsync(linkId);
                  }}
                  className="rounded-lg border bg-muted/20 p-4"
                />
              )}

              {canManageParticipants && (
                <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                  <p className="text-sm font-medium">Участники</p>
                  {canAssignExecutor && (
                    <FormField
                      control={form.control}
                      name="assigneeId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Исполнитель</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || "none"}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Не назначен" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">Не назначен</SelectItem>
                              {teamUsers.map((u) => (
                                <SelectItem key={u.id} value={String(u.id)}>
                                  {u.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {!canAssignExecutor && isSelfAssignee && (
                    <p className="text-sm text-green-700 dark:text-green-400">
                      Вы исполнитель этой задачи
                    </p>
                  )}
                  {!canAssignExecutor && canTakeTaskAsExecutor && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={assignSelfAsExecutor.isPending}
                      onClick={() => assignSelfAsExecutor.mutate()}
                    >
                      Назначить на себя
                    </Button>
                  )}
                  {!canAssignExecutor &&
                    editingTask?.assigneeName &&
                    !isSelfAssignee && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Исполнитель:</span>{" "}
                      {editingTask.assigneeName}
                    </p>
                  )}
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-xs font-medium text-muted-foreground">Соисполнители</p>
                    {taskCoexecutors.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Не назначены</p>
                    ) : (
                      <ul className="space-y-1">
                        {taskCoexecutors.map((c) => (
                          <li key={c.id} className="flex items-center justify-between text-sm">
                            <span>{c.userName}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => removeTaskCoexecutor.mutate(c.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex gap-2">
                      <Select value={coexecId} onValueChange={setCoexecId}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Добавить соисполнителя" />
                        </SelectTrigger>
                        <SelectContent>
                          {teamUsers
                            .filter(
                              (u) =>
                                String(u.id) !== String(editingTask?.assigneeId ?? "") &&
                                !taskCoexecutors.some((c) => c.userId === u.id)
                            )
                            .map((u) => (
                              <SelectItem key={u.id} value={String(u.id)}>
                                {u.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!coexecId || addTaskCoexecutor.isPending}
                        onClick={() => addTaskCoexecutor.mutate()}
                      >
                        Добавить
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {editingTask ? (
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Приоритет <span className="text-red-500">*</span>
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Низкий</SelectItem>
                          <SelectItem value="medium">Средний</SelectItem>
                          <SelectItem value="high">Высокий</SelectItem>
                          <SelectItem value="urgent">Срочный</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Приоритет <span className="text-red-500">*</span>
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Низкий</SelectItem>
                          <SelectItem value="medium">Средний</SelectItem>
                          <SelectItem value="high">Высокий</SelectItem>
                          <SelectItem value="urgent">Срочный</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {editingTask && canAssignExecutor && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Срок выполнения</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          value={
                            field.value
                              ? formatLocalDateTime(new Date(field.value))
                              : ""
                          }
                          onChange={(e) =>
                            field.onChange(e.target.value ? new Date(e.target.value) : null)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="estimatedHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Оценка (часы)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          placeholder="0"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              )}

              </fieldset>
                    </TabsContent>

                    <TabsContent value="subtasks" className="mt-0 space-y-2">
                      {taskTree?.summary && taskTree.summary.total > 0 ? (
                        <>
                          {linkedServiceRequestId && srWorkProgress && (
                            <ServiceRequestWorkProgressBar progress={srWorkProgress} compact />
                          )}
                          <LinkedTaskTree
                            groupLabel={
                              linkedServiceRequestId
                                ? `Заявка #${linkedServiceRequestId}`
                                : `Задача #${taskTree.root.id}`
                            }
                            groupHint={
                              linkedServiceRequestId
                                ? "Заголовок — открыть заявку, строка — задачу"
                                : "Подзадачи одной родительской задачи"
                            }
                            onOpenGroup={
                              linkedServiceRequestId
                                ? () =>
                                    navigateAway(
                                      `/service-requests/${linkedServiceRequestId}?from=tasks`
                                    )
                                : undefined
                            }
                            rootTask={{
                              id: taskTree.root.id,
                              title: taskTree.root.title,
                              status: taskTree.root.status,
                              taskType: taskTree.root.taskType,
                            }}
                            childTasks={sortedTreeSubtasks
                              .filter((t) => t.id !== editingTask?.id)
                              .map((t) => ({
                                id: t.id,
                                title: t.title,
                                status: t.status,
                                taskType: t.taskType,
                              }))}
                            highlightTaskId={editingTask?.id}
                            onOpenTask={(taskId) => {
                              const t =
                                taskTree.tasks.find((x) => x.id === taskId) ??
                                (taskTree.root.id === taskId ? taskTree.root : undefined);
                              if (t) navigateToSubtask(toTaskRecord(t));
                            }}
                          />
                          {linkedServiceRequestId && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() =>
                          navigateAway(`/service-requests/${linkedServiceRequestId}?from=tasks`)
                        }
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              Управление на странице заявки
                            </Button>
                          )}
                        </>
                      ) : linkedServiceRequestId &&
                        (taskManagedViaServiceRequest || workViaServiceRequest) ? (
                        <div className="rounded-lg border border-primary/25 bg-card p-3 space-y-2">
                          {srWorkProgress && (
                            <ServiceRequestWorkProgressBar progress={srWorkProgress} compact />
                          )}
                          <p className="text-xs text-muted-foreground">
                            Этапы работ на странице заявки #{linkedServiceRequestId}.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                          navigateAway(`/service-requests/${linkedServiceRequestId}?from=tasks`)
                        }
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Открыть заявку
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          Подзадач нет
                        </p>
                      )}
                    </TabsContent>

                    <TabsContent value="comments" className="mt-0 space-y-3">
              {canViewTaskDetails && (
                <div className="space-y-3">
                  {taskReservations.filter((r) => r.status === "reserved").length > 0 && (
                    <div className="text-sm bg-amber-50 dark:bg-amber-950/30 rounded p-2">
                      <p className="font-medium text-amber-900 dark:text-amber-100">Зарезервировано:</p>
                      <ul className="list-disc pl-5 text-amber-800 dark:text-amber-200">
                        {taskReservations
                          .filter((r) => r.status === "reserved")
                          .map((r) => (
                            <li key={r.id}>
                              {r.partName} — {r.quantity} шт.
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                  <CommentThreadList
                    comments={taskComments}
                    itemIdPrefix="task-comment"
                    highlightId={highlightCommentId}
                    maxHeightClass="max-h-52"
                    onUpdate={async (commentId, body) => {
                      await updateTaskCommentMutation.mutateAsync({ commentId, body });
                    }}
                    onDelete={async (commentId) => {
                      await deleteTaskCommentMutation.mutateAsync(commentId);
                    }}
                  />
                  {canCommentOnTask ? (
                    <CommentComposer
                      text={commentText}
                      onTextChange={setCommentText}
                      attachmentName={attachmentName}
                      onAttachmentNameChange={setAttachmentName}
                      attachmentUrl={attachmentUrl}
                      onAttachmentUrlChange={setAttachmentUrl}
                      attachmentFile={attachmentFile}
                      onAttachmentFileChange={setAttachmentFile}
                      isPending={addComment.isPending}
                      showSaveHint
                      onSubmit={() => addComment.mutate()}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      У вас нет прав на добавление комментариев к этой задаче
                    </p>
                  )}
                </div>
              )}
                    </TabsContent>

                    <TabsContent value="history" className="mt-0 space-y-3">
                      {canViewTaskDetails ? (
                        <>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            История задачи
                          </p>
                          {taskHistory.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Записей нет</p>
                          ) : (
                            <div className="space-y-2 max-h-72 overflow-y-auto">
                              {taskHistory.map((entry) => (
                                <div key={entry.id} className="text-sm rounded-md border bg-muted/30 px-3 py-2">
                                  <div className="flex justify-between gap-2 text-xs text-muted-foreground mb-1">
                                    <span>{entry.changedByName}</span>
                                    <span>
                                      {format(new Date(entry.createdAt), "dd.MM.yyyy HH:mm", { locale: ru })}
                                    </span>
                                  </div>
                                  <p>
                                    {entry.fromStatus
                                      ? `${taskStatusLabel(entry.fromStatus)} → ${taskStatusLabel(entry.toStatus)}`
                                      : taskStatusLabel(entry.toStatus)}
                                    {entry.comment ? ` — ${entry.comment}` : ""}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                          {linkedServiceRequestId && (
                            <div className="border-t pt-3 space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Заявка #{linkedServiceRequestId}
                              </p>
                              {(serviceRequestHistoryPayload?.history ?? []).length === 0 ? (
                                <p className="text-sm text-muted-foreground">История заявки пуста</p>
                              ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                  {(serviceRequestHistoryPayload?.history ?? []).map((entry) => (
                                    <div
                                      key={entry.id}
                                      className="text-sm rounded-md border bg-muted/30 px-3 py-2"
                                    >
                                      <div className="flex justify-between gap-2 text-xs text-muted-foreground mb-1">
                                        <span>{entry.changedByName}</span>
                                        <span>
                                          {format(new Date(entry.createdAt), "dd.MM.yyyy HH:mm", {
                                            locale: ru,
                                          })}
                                        </span>
                                      </div>
                                      <p>
                                        {entry.fromStatus
                                          ? `${STATUS_LABELS[entry.fromStatus as ServiceRequestStatus] ?? entry.fromStatus} → ${STATUS_LABELS[entry.toStatus as ServiceRequestStatus] ?? entry.toStatus}`
                                          : STATUS_LABELS[entry.toStatus as ServiceRequestStatus] ??
                                            entry.toStatus}
                                        {entry.comment ? ` — ${entry.comment}` : ""}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">История недоступна</p>
                      )}
                    </TabsContent>
                </div>
              </Tabs>

              <div className="shrink-0 border-t bg-muted/20 px-4 py-3 flex justify-end gap-2 flex-wrap">
                {editingTask && canConvertTaskToServiceRequest() && !linkedServiceRequestId && (
                  <>
                    <Select value={convertRequestType} onValueChange={setConvertRequestType}>
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SERVICE_REQUEST_TYPES.map((t) => (
                          <SelectItem key={t.code} value={t.code}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={convertToServiceRequest.isPending}
                      onClick={() => convertToServiceRequest.mutate()}
                    >
                      В сервисную заявку
                    </Button>
                  </>
                )}
                <Button type="button" variant="outline" onClick={close}>
                  Отмена
                </Button>
                {canModify && (
                  <Button
                    type="submit"
                    disabled={createTask.isPending || updateTask.isPending}
                    variant={
                      hasUnsentCommentDraft(
                        commentText,
                        attachmentFile,
                        attachmentName,
                        attachmentUrl
                      )
                        ? "outline"
                        : "default"
                    }
                  >
                    {editingTask ? "Сохранить задачу" : "Создать"}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </DialogContent>
        ) : null}
      </Dialog>
    </TaskDialogContext.Provider>
  );
}

function formatLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function useTaskDialog() {
  const ctx = useContext(TaskDialogContext);
  if (!ctx) {
    throw new Error("useTaskDialog must be used within TaskDialogProvider");
  }
  return ctx;
}
