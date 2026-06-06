import { useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "./use-auth";
import { DEFAULT_PRESENCE_STATUS } from "@shared/user-presence-constants";

export interface UserWithStatus {
  id: number;
  name: string;
  email: string;
  role: string;
  department: string | null;
  position: string | null;
  avatar?: string | null;
  status: string;
  activityStatus: string;
  onVacation: boolean;
  lastSeen: string | null;
  expiresAt: string | null;
}

interface UserStatusContextType {
  users: UserWithStatus[];
  updateUserStatus: (userId: number, status: string) => Promise<void>;
  getCurrentUserStatus: () => string;
  getCurrentUserActivityStatus: () => string;
  isCurrentUserOnVacation: () => boolean;
  getCurrentUserExpiresAt: () => string | null;
  setCurrentUserStatus: (status: string) => void;
  isUpdatingStatus: boolean;
}

const UserStatusContext = createContext<UserStatusContextType | undefined>(undefined);
const PRESENCE_QUERY_KEY = ["/api/users/presence"] as const;

function normalizePresenceUser(raw: Partial<UserWithStatus> & { id: number; name: string }): UserWithStatus {
  const activityStatus = raw.activityStatus ?? raw.status ?? DEFAULT_PRESENCE_STATUS;
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email ?? "",
    role: raw.role ?? "viewer",
    department: raw.department ?? null,
    position: raw.position ?? null,
    avatar: raw.avatar,
    status: raw.status ?? activityStatus,
    activityStatus,
    onVacation: raw.onVacation ?? false,
    lastSeen: raw.lastSeen ?? null,
    expiresAt: raw.expiresAt ?? null,
  };
}

function applyOptimisticPresence(
  users: UserWithStatus[] | undefined,
  userId: number,
  status: string
): UserWithStatus[] | undefined {
  if (!users) return users;

  return users.map((row) => {
    if (row.id !== userId) return row;
    const activityStatus = status === "vacation" ? "absent" : status;
    const onVacation = row.onVacation || status === "vacation";
    const nextStatus = onVacation && activityStatus === "absent" ? "vacation" : activityStatus;
    return {
      ...row,
      status: nextStatus,
      activityStatus,
      onVacation,
      lastSeen: new Date().toISOString(),
    };
  });
}

export function UserStatusProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery<UserWithStatus[]>({
    queryKey: PRESENCE_QUERY_KEY,
    enabled: !!user,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
    select: (rows) => rows.map((row) => normalizePresenceUser(row)),
  });

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    const source = new EventSource(
      `/api/users/presence/stream?token=${encodeURIComponent(token)}`
    );

    const refreshPresence = () => {
      queryClient.invalidateQueries({ queryKey: PRESENCE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    };

    source.addEventListener("presence", refreshPresence);
    source.onmessage = refreshPresence;

    return () => {
      source.removeEventListener("presence", refreshPresence);
      source.close();
    };
  }, [user?.id, queryClient]);

  const presenceMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("PATCH", "/api/auth/presence", { status });
      return res.json();
    },
    onMutate: async (status) => {
      if (!user) return;
      await queryClient.cancelQueries({ queryKey: PRESENCE_QUERY_KEY });
      const previous = queryClient.getQueryData<UserWithStatus[]>(PRESENCE_QUERY_KEY);
      queryClient.setQueryData<UserWithStatus[]>(PRESENCE_QUERY_KEY, (current) =>
        applyOptimisticPresence(current, user.id, status) ?? current
      );
      return { previous };
    },
    onError: (_error, _status, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PRESENCE_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PRESENCE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const adminPresenceMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}/presence`, { status });
      return res.json();
    },
    onMutate: async ({ userId, status }) => {
      await queryClient.cancelQueries({ queryKey: PRESENCE_QUERY_KEY });
      const previous = queryClient.getQueryData<UserWithStatus[]>(PRESENCE_QUERY_KEY);
      queryClient.setQueryData<UserWithStatus[]>(PRESENCE_QUERY_KEY, (current) =>
        applyOptimisticPresence(current, userId, status) ?? current
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PRESENCE_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PRESENCE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
  });

  const currentUserRow = users.find((u) => u.id === user?.id);

  const getCurrentUserActivityStatus = useCallback(() => {
    if (currentUserRow) return currentUserRow.activityStatus;
    const fromAuth = (user as { presenceStatus?: string } | null)?.presenceStatus;
    if (fromAuth === "vacation") return DEFAULT_PRESENCE_STATUS;
    return fromAuth ?? DEFAULT_PRESENCE_STATUS;
  }, [currentUserRow, user]);

  const getCurrentUserStatus = useCallback(() => {
    if (currentUserRow) return currentUserRow.status;
    return getCurrentUserActivityStatus();
  }, [currentUserRow, getCurrentUserActivityStatus]);

  const isCurrentUserOnVacation = useCallback(() => {
    return currentUserRow?.onVacation ?? false;
  }, [currentUserRow]);

  const getCurrentUserExpiresAt = useCallback(() => {
    return currentUserRow?.expiresAt ?? null;
  }, [currentUserRow]);

  const handleSetCurrentUserStatus = (status: string) => {
    presenceMutation.mutate(status);
  };

  const updateUserStatus = async (userId: number, status: string) => {
    await adminPresenceMutation.mutateAsync({ userId, status });
  };

  return (
    <UserStatusContext.Provider
      value={{
        users,
        updateUserStatus,
        getCurrentUserStatus,
        getCurrentUserActivityStatus,
        isCurrentUserOnVacation,
        getCurrentUserExpiresAt,
        setCurrentUserStatus: handleSetCurrentUserStatus,
        isUpdatingStatus: presenceMutation.isPending || adminPresenceMutation.isPending,
      }}
    >
      {children}
    </UserStatusContext.Provider>
  );
}

export function useUserStatus() {
  const context = useContext(UserStatusContext);
  if (context === undefined) {
    throw new Error("useUserStatus must be used within a UserStatusProvider");
  }
  return context;
}
