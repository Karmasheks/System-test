import { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

interface AppShellProps {
  children: ReactNode;
  /** Внутренний скролл области контента (как на дашборде и расписании) */
  scrollable?: boolean;
}

export function AppShell({ children, scrollable = true }: AppShellProps) {
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0 min-h-0 with-sidebar">
        <Header />
        {scrollable ? (
          <div className="flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto">{children}</div>
        ) : (
          <div className="flex flex-1 flex-col min-h-0 min-w-0">{children}</div>
        )}
      </div>
    </div>
  );
}
