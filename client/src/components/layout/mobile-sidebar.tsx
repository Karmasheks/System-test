import { Link, useLocation } from "wouter";
import { useMobileSidebar } from "@/hooks/use-mobile-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useAccessControl } from "@/hooks/use-access-control";
import { useUserStatus } from "@/hooks/use-user-status";
import { UserStatusSelector } from "@/components/layout/user-status";
import { EmployeePresencePanel } from "@/components/layout/employee-presence-panel";
import {
  BarChart2,
  Users,
  ChartBar,
  Wrench,
  Clipboard,
  Calendar,
  X,
  ClipboardCheck,
  CheckSquare,
  ClipboardList,
  UserCircle,
  Building2,
  Wallet,
  FolderOpen,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function MobileSidebar() {
  const { open, setOpen } = useMobileSidebar();
  const [location] = useLocation();
  const { user } = useAuth();
  const { canViewEmployeePresence } = useAccessControl();
  const { users, getCurrentUserStatus, getCurrentUserActivityStatus, isCurrentUserOnVacation, getCurrentUserExpiresAt, setCurrentUserStatus } = useUserStatus();
  const showEmployeePresence = canViewEmployeePresence();

  const navigation = [
    {
      section: "Основное",
      items: [
        {
          name: "Панель управления",
          href: "/dashboard",
          icon: <BarChart2 className="h-5 w-5" />,
          active: location === "/dashboard" || location === "/",
        },
        {
          name: "План ТО и задач",
          href: "/schedule",
          icon: <Calendar className="h-5 w-5" />,
          active: location === "/schedule",
        },
        {
          name: "Оборудование",
          href: "/equipment",
          icon: <Wrench className="h-5 w-5" />,
          active: location === "/equipment",
        },
        {
          name: "Ежедневные осмотры",
          href: "/daily-inspection",
          icon: <ClipboardCheck className="h-5 w-5" />,
          active: location === "/daily-inspection" || location === "/daily-inspection-new",
        },
        {
          name: "Задачи и заявки",
          href: "/tasks",
          icon: <CheckSquare className="h-5 w-5" />,
          active: location === "/tasks" || location.startsWith("/tasks?"),
        },
        {
          name: "Контакты",
          href: "/contacts",
          icon: <UserCircle className="h-5 w-5" />,
          active: location === "/contacts",
        },
        {
          name: "Поставщики",
          href: "/suppliers",
          icon: <Building2 className="h-5 w-5" />,
          active: location === "/suppliers",
        },
        {
          name: "Склад",
          href: "/warehouse",
          icon: <Package className="h-5 w-5" />,
          active: location === "/warehouse",
        },
        {
          name: "Затраты (Бюджет)",
          href: "/budget",
          icon: <Wallet className="h-5 w-5" />,
          active: location === "/budget",
        },
        {
          name: "Документы",
          href: "/documents",
          icon: <FolderOpen className="h-5 w-5" />,
          active: location === "/documents",
        },
      ],
    },
    {
      section: "Администрирование",
      items: [
        {
          name: "Пользователи",
          href: "/users",
          icon: <Users className="h-5 w-5" />,
          active: location === "/users",
        },
        {
          name: "Отчеты",
          href: "/reports",
          icon: <ChartBar className="h-5 w-5" />,
          active: location === "/reports",
        },
      ],
    },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 flex z-40 lg:hidden" role="dialog" aria-modal="true">
      <div
        className="fixed inset-0 bg-gray-600 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-80"
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />

      <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white dark:bg-gray-900">
        <div className="absolute top-0 right-0 -mr-12 pt-2">
          <Button
            variant="ghost"
            size="icon"
            className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
            onClick={() => setOpen(false)}
          >
            <span className="sr-only">Закрыть меню</span>
            <X className="h-6 w-6 text-white" />
          </Button>
        </div>

        <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
          <div className="flex-shrink-0 flex items-center px-4">
            <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center">
              <BarChart2 className="text-white h-4 w-4" />
            </div>
            <div className="ml-3">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">StarLine</h1>
            </div>
          </div>

          <nav className="mt-5 px-2">
            {navigation.map((section, idx) => (
              <div key={`mobile-section-${idx}`} className="mb-4">
                <p className="uppercase text-xs font-semibold text-gray-500 px-2 mb-2 dark:text-gray-400">
                  {section.section}
                </p>
                <div className="space-y-1">
                  {section.items.map((item, itemIdx) => (
                    <Link key={`mobile-item-${idx}-${itemIdx}`} href={item.href}>
                      <div
                        className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-md cursor-pointer ${
                          item.active
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                        }`}
                        onClick={() => setOpen(false)}
                      >
                        {item.icon}
                        <span className="ml-3">{item.name}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {showEmployeePresence && (
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider dark:text-gray-400">
                Присутствие
              </h3>
              <EmployeePresencePanel users={users} variant="mobile" className="mt-2" />
            </div>
          )}
        </div>

        <div className="flex-shrink-0 border-t border-gray-200 p-4 dark:border-gray-700">
          <UserStatusSelector
            currentStatus={getCurrentUserStatus()}
            activityStatus={getCurrentUserActivityStatus()}
            onVacation={isCurrentUserOnVacation()}
            expiresAt={getCurrentUserExpiresAt()}
            onStatusChange={setCurrentUserStatus}
            userName={user?.name || "Пользователь"}
            avatarUrl={user?.avatar}
          />
        </div>
      </div>

      <div className="flex-shrink-0 w-14" aria-hidden="true" />
    </div>
  );
}
