import { createContext, useContext, useEffect, useState } from "react";
import { getToken, logout } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { isTransientServerError, isUnauthorizedError } from "@/lib/api-errors";
import { queryClient } from "@/lib/queryClient";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  authError: string | null;
  logout: () => Promise<void>;
  isAuthenticated: () => boolean;
  refreshAuth: (knownUser?: User) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  authError: null,
  logout: async () => {},
  isAuthenticated: () => false,
  refreshAuth: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [token, setToken] = useState<string | null>(() => getToken());
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    data: user,
    isLoading: isLoadingUser,
    isFetching,
    refetch,
    error,
  } = useQuery<User>({
    queryKey: ["/api/auth/me"],
    enabled: !!token,
    retry: (failureCount, err) =>
      isTransientServerError(err) && failureCount < 2,
    retryDelay: 2000,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const newToken = getToken();
      if (newToken !== token) {
        setToken(newToken);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [token]);

  useEffect(() => {
    if (!error || !token) {
      if (!error) setAuthError(null);
      return;
    }

    if (isUnauthorizedError(error)) {
      localStorage.removeItem("token");
      setToken(null);
      setAuthError(null);
      window.location.href = "/login";
      return;
    }

    if (isTransientServerError(error)) {
      setAuthError(
        "Сервер временно недоступен. Токен сохранён — попробуйте обновить страницу."
      );
      return;
    }

    setAuthError(error instanceof Error ? error.message : "Ошибка проверки сессии");
  }, [error, token]);

  useEffect(() => {
    if (!token) {
      setIsInitializing(false);
      return;
    }

    let cancelled = false;
    void refetch().finally(() => {
      if (!cancelled) setIsInitializing(false);
    });

    return () => {
      cancelled = true;
    };
  }, [token, refetch]);

  const storedToken = getToken();
  const sessionToken = token ?? storedToken;
  const isLoading =
    isInitializing ||
    Boolean(sessionToken && !user && !authError);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const checkIsAuthenticated = () => {
    return !!token && !!user;
  };

  const refreshAuth = async (knownUser?: User): Promise<void> => {
    const newToken = getToken();
    setToken(newToken);
    setAuthError(null);

    if (!newToken) {
      return;
    }

    if (knownUser) {
      queryClient.setQueryData(["/api/auth/me"], knownUser);
      return;
    }

    setIsInitializing(true);
    try {
      await refetch();
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isLoading,
        authError,
        logout: handleLogout,
        isAuthenticated: checkIsAuthenticated,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
