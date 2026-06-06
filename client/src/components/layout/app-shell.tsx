import { ReactNode, useEffect } from "react";
import { cleanupStaleModalLayers } from "@/hooks/use-modal-body-cleanup";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

interface AppShellProps {
  children: ReactNode;
  /** Внутренний скролл области контента (как на дашборде и расписании) */
  scrollable?: boolean;
}

export function AppShell({ children, scrollable = true }: AppShellProps) {
  useEffect(() => {
    cleanupStaleModalLayers();
    const root = document.getElementById("root");
    const shell = root?.querySelector(".app-shell");
    if (root instanceof HTMLElement) {
      root.style.pointerEvents = "auto";
      root.removeAttribute("inert");
      root.removeAttribute("aria-hidden");
    }
    if (shell instanceof HTMLElement) {
      shell.style.pointerEvents = "auto";
      shell.removeAttribute("inert");
      shell.removeAttribute("aria-hidden");
    }
  }, []);

  return (
    <div className="app-shell flex h-screen bg-gray-50 dark:bg-gray-900 pointer-events-auto">
      <Sidebar />
      <div className="relative z-0 flex flex-1 flex-col min-w-0 min-h-0 with-sidebar pointer-events-auto">
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
