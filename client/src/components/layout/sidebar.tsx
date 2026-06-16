import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAccessControl } from "@/hooks/use-access-control";
import { useUserStatus } from "@/hooks/use-user-status";
import { useSidebarState } from "@/hooks/use-sidebar-state";
import { useSidebarNavigation } from "@/hooks/use-sidebar-navigation";
import { UserStatusSelector, getStatusDotColor } from "@/components/layout/user-status";
import { EmployeePresencePanel } from "@/components/layout/employee-presence-panel";
import { SidebarCustomizeButton } from "@/components/layout/sidebar-customize-dialog";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BarChart2, PanelLeftClose, PanelLeftOpen } from "lucide-react";

export function Sidebar() {
  const { user } = useAuth();
  const { canViewEmployeePresence } = useAccessControl();
  const { users, getCurrentUserStatus, getCurrentUserActivityStatus, isCurrentUserOnVacation, getCurrentUserExpiresAt, setCurrentUserStatus } = useUserStatus();
  const { isCollapsed, toggleCollapsed } = useSidebarState();
  const { sections } = useSidebarNavigation();

  const showEmployeePresence = canViewEmployeePresence();
  const navRef = useRef<HTMLElement>(null);
  const SIDEBAR_SCROLL_KEY = "sidebar-nav-scroll";

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const saved = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    if (saved) {
      nav.scrollTop = Number.parseInt(saved, 10);
    }

    const saveScroll = () => {
      sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(nav.scrollTop));
    };

    nav.addEventListener("scroll", saveScroll, { passive: true });
    return () => nav.removeEventListener("scroll", saveScroll);
  }, []);

  return (
    <aside
      className={cn(
        "sidebar fixed left-0 top-0 z-40 hidden lg:flex flex-col h-full bg-gray-900 border-r border-gray-700 shadow-sm transition-all duration-300",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className={cn("border-b border-gray-700 shrink-0", isCollapsed ? "p-2" : "p-4")}>
        <div
          className={cn(
            "flex items-center gap-2",
            isCollapsed ? "flex-col" : "justify-between"
          )}
        >
          <div className={cn("flex items-center min-w-0", !isCollapsed && "flex-1")}>
            <div className="w-8 h-8 shrink-0 rounded-md bg-blue-600 flex items-center justify-center">
              <BarChart2 className="text-white w-4 h-4" />
            </div>
            {!isCollapsed && (
              <div className="ml-3 min-w-0">
                <h1 className="text-lg font-semibold text-white truncate">StarLine</h1>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            title={isCollapsed ? "Развернуть меню" : "Свернуть меню"}
            aria-label={isCollapsed ? "Развернуть меню" : "Свернуть меню"}
            className="shrink-0 text-gray-300 hover:text-white hover:bg-gray-800"
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      <nav
        ref={navRef}
        className={cn("flex-grow overflow-y-auto overflow-x-hidden", isCollapsed ? "px-1 py-2" : "p-4")}
      >
        {sections.map((section, idx) => (
          <div key={section.section} className={cn(isCollapsed ? "mb-2" : "mb-6")}>
            {!isCollapsed && (
              <p className="uppercase text-xs font-semibold text-gray-400 mb-2 px-2">
                {section.label}
              </p>
            )}
            {isCollapsed && idx > 0 && (
              <div className="my-2 mx-auto w-8 border-t border-gray-700" />
            )}
            <ul className={cn(isCollapsed ? "space-y-1" : "space-y-2")}>
              {section.items.map((item) => (
                <li key={item.id}>
                  <Link href={item.href}>
                    <div
                      title={isCollapsed ? item.name : undefined}
                      className={cn(
                        "flex items-center rounded-md font-medium cursor-pointer transition-colors",
                        isCollapsed ? "justify-center p-2.5" : "px-3 py-2.5",
                        item.active
                          ? "text-white bg-blue-600/30 ring-1 ring-blue-500/40"
                          : "text-gray-300 hover:bg-gray-800 hover:text-white"
                      )}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      {!isCollapsed && (
                        <span className="ml-3 truncate text-sm">{item.name}</span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className={cn(isCollapsed ? "mt-2 px-1" : "mt-4")}>
          <SidebarCustomizeButton collapsed={isCollapsed} />
        </div>

        {!isCollapsed && showEmployeePresence && (
          <div className="mt-8 pt-6 border-t border-gray-700">
            <h3 className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Присутствие
            </h3>
            <EmployeePresencePanel users={users} variant="sidebar" className="mt-2" />
          </div>
        )}

        {isCollapsed && showEmployeePresence && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <EmployeePresencePanel users={users} variant="sidebar-collapsed" />
          </div>
        )}
      </nav>

      <div className={cn("border-t border-gray-700 shrink-0", isCollapsed ? "p-2" : "p-4")}>
        {!isCollapsed ? (
          <UserStatusSelector
            currentStatus={getCurrentUserStatus()}
            activityStatus={getCurrentUserActivityStatus()}
            onVacation={isCurrentUserOnVacation()}
            expiresAt={getCurrentUserExpiresAt()}
            onStatusChange={setCurrentUserStatus}
            userName={user?.name || "Пользователь"}
            avatarUrl={user?.avatar}
          />
        ) : (
          <div className="flex justify-center">
            <div className="relative">
              <UserAvatar
                name={user?.name}
                avatarUrl={user?.avatar}
                className="h-8 w-8"
                fallbackClassName="text-xs bg-gray-700 text-white"
              />
              <div
                className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-gray-900 ${getStatusDotColor(
                  isCurrentUserOnVacation() &&
                    (getCurrentUserActivityStatus() === "absent" || getCurrentUserActivityStatus() === "vacation")
                    ? "vacation"
                    : getCurrentUserActivityStatus()
                )}`}
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
