import { ReactNode } from "react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";

interface ProtectedLayoutProps {
  children: ReactNode;
  scrollable?: boolean;
}

export function ProtectedLayout({ children, scrollable }: ProtectedLayoutProps) {
  return (
    <ProtectedRoute>
      <AppShell scrollable={scrollable}>{children}</AppShell>
    </ProtectedRoute>
  );
}
