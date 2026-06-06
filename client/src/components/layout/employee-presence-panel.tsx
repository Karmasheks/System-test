import { UserAvatar } from "@/components/user-avatar";
import { getPresenceBadges, getStatusDotColor, userStatuses } from "@/components/layout/user-status";
import {
  countUsersByPresenceStatus,
  getPresenceSortStatus,
  PRESENCE_STATUS_ORDER,
  sortUsersByPresenceStatus,
  type PresenceUser,
} from "@/lib/user-presence-display";
import { cn } from "@/lib/utils";
const DARK_CHIP_COLORS: Record<string, string> = {
  online: "bg-green-900/60 text-green-300",
  working: "bg-blue-900/60 text-blue-300",
  break: "bg-yellow-900/60 text-yellow-300",
  vacation: "bg-purple-900/60 text-purple-300",
  absent: "bg-red-900/60 text-red-300",
  busy: "bg-orange-900/60 text-orange-300",
};

const LIGHT_CHIP_COLORS: Record<string, string> = {
  online: "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-300",
  working: "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300",
  break: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-300",
  vacation: "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300",
  absent: "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300",
  busy: "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-300",
};

function formatEmployeeDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} ${parts[1]}`;
  return `${parts[1]} ${parts[2][0]}.`;
}

interface EmployeePresencePanelProps {
  users: PresenceUser[];
  variant?: "sidebar" | "sidebar-collapsed" | "mobile";
  className?: string;
}

export function EmployeePresencePanel({
  users,
  variant = "sidebar",
  className,
}: EmployeePresencePanelProps) {
  const sortedUsers = sortUsersByPresenceStatus(users);
  const statusCounts = countUsersByPresenceStatus(users);
  const statusLabels = Object.fromEntries(userStatuses.map((s) => [s.id, s.name]));

  const summaryTitle = PRESENCE_STATUS_ORDER.filter((s) => statusCounts[s] > 0)
    .map((s) => `${statusLabels[s]}: ${statusCounts[s]}`)
    .join(", ");

  if (variant === "sidebar-collapsed") {
    return (
      <div className={cn("flex flex-col items-center gap-1", className)} title={summaryTitle || "Нет сотрудников"}>
        {PRESENCE_STATUS_ORDER.filter((s) => statusCounts[s] > 0).slice(0, 4).map((statusId) => (
          <span
            key={statusId}
            className={cn(
              "text-[10px] font-semibold px-1.5 py-0.5 rounded",
              DARK_CHIP_COLORS[statusId]
            )}
            title={`${statusLabels[statusId]}: ${statusCounts[statusId]}`}
          >
            {statusCounts[statusId]}
          </span>
        ))}
        {sortedUsers.length > 0 && (
          <div className="flex flex-col items-center gap-2 mt-1">
            {sortedUsers.slice(0, 3).map((member) => (
              <div
                key={member.id}
                className="relative"
                title={`${member.name} — ${statusLabels[getPresenceSortStatus(member)] ?? member.status}`}
              >
                <UserAvatar
                  name={member.name}
                  avatarUrl={member.avatar}
                  className="h-8 w-8"
                  fallbackClassName="text-xs bg-gray-700 text-white"
                />
                <div
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900",
                    getStatusDotColor(getPresenceSortStatus(member))
                  )}
                />
              </div>
            ))}
            {sortedUsers.length > 3 && (
              <div
                className="w-7 h-7 rounded-full bg-gray-800 text-gray-300 flex items-center justify-center text-[10px] font-bold"
                title={`Ещё ${sortedUsers.length - 3}`}
              >
                +{sortedUsers.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const isMobile = variant === "mobile";

  return (
    <div className={className}>
      <div className={cn("flex flex-wrap gap-2", isMobile ? "px-3" : "px-4")}>
        {PRESENCE_STATUS_ORDER.filter((s) => statusCounts[s] > 0).map((statusId) => (
          <span
            key={statusId}
            className={cn(
              "inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full",
              isMobile ? LIGHT_CHIP_COLORS[statusId] : DARK_CHIP_COLORS[statusId]
            )}
          >
            {statusLabels[statusId]}
            <span className="font-semibold">{statusCounts[statusId]}</span>
          </span>
        ))}
      </div>
      <ul className={cn("mt-3 space-y-2 max-h-52 overflow-y-auto", isMobile ? "px-1" : "")}>
        {sortedUsers.length > 0 ? (
          sortedUsers.map((member) => (
            <li key={member.id}>
              <div
                className={cn(
                  "flex items-center py-2 text-sm rounded-md",
                  isMobile
                    ? "px-3 text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                    : "px-4 text-gray-300 hover:bg-gray-700/50"
                )}
              >
                <UserAvatar
                  name={member.name}
                  avatarUrl={member.avatar}
                  className="h-7 w-7"
                  fallbackClassName={cn(
                    "text-xs",
                    isMobile ? "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-white" : "bg-gray-700 text-white"
                  )}
                />
                <div className="ml-3 flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm font-medium truncate",
                      isMobile ? "text-gray-900 dark:text-white" : "text-white"
                    )}
                  >
                    {formatEmployeeDisplayName(member.name)}
                  </p>
                  <div className="mt-1">
                    {getPresenceBadges({
                      status: member.status,
                      activityStatus: member.activityStatus,
                      onVacation: member.onVacation,
                      darkMode: !isMobile,
                    })}
                  </div>
                </div>
              </div>
            </li>
          ))
        ) : (
          <li
            className={cn(
              "py-3 text-sm text-center",
              isMobile ? "px-3 text-gray-500 dark:text-gray-400" : "px-4 text-gray-500"
            )}
          >
            Нет активных сотрудников
          </li>
        )}
      </ul>
    </div>
  );
}
