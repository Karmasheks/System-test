import type { ReactNode } from "react";
import {
  BarChart2,
  Users,
  Calendar,
  Wrench,
  CheckSquare,
  ChartBar,
  ClipboardCheck,
  UserCircle,
  Building2,
  Wallet,
  FolderOpen,
  Package,
  Factory,
} from "lucide-react";
import type { SidebarNavKey } from "@shared/user-ui-preferences";

export type SidebarNavItemDef = {
  id: SidebarNavKey;
  module: SidebarNavKey;
  alsoModule?: string;
  name: string;
  href: string;
  icon: ReactNode;
  section: "main" | "admin";
};

export const SIDEBAR_NAV_ITEMS: SidebarNavItemDef[] = [
  {
    id: "dashboard",
    module: "dashboard",
    name: "Панель управления",
    href: "/dashboard",
    icon: <BarChart2 className="w-5 h-5" />,
    section: "main",
  },
  {
    id: "schedule",
    module: "schedule",
    name: "План ТО и задач",
    href: "/schedule",
    icon: <Calendar className="w-5 h-5" />,
    section: "main",
  },
  {
    id: "equipment",
    module: "equipment",
    name: "Оборудование",
    href: "/equipment",
    icon: <Wrench className="w-5 h-5" />,
    section: "main",
  },
  {
    id: "daily_inspection",
    module: "daily_inspection",
    name: "Ежедневные осмотры",
    href: "/daily-inspection",
    icon: <ClipboardCheck className="w-5 h-5" />,
    section: "main",
  },
  {
    id: "tasks",
    module: "tasks",
    alsoModule: "service_requests",
    name: "Задачи и заявки",
    href: "/tasks",
    icon: <CheckSquare className="w-5 h-5" />,
    section: "main",
  },
  {
    id: "contacts",
    module: "contacts",
    name: "Контакты",
    href: "/contacts",
    icon: <UserCircle className="w-5 h-5" />,
    section: "main",
  },
  {
    id: "suppliers",
    module: "suppliers",
    name: "Поставщики",
    href: "/suppliers",
    icon: <Building2 className="w-5 h-5" />,
    section: "main",
  },
  {
    id: "warehouse",
    module: "warehouse",
    name: "Склад",
    href: "/warehouse",
    icon: <Package className="w-5 h-5" />,
    section: "main",
  },
  {
    id: "production_planning",
    module: "production_planning",
    name: "Планирование",
    href: "/planning",
    icon: <Factory className="w-5 h-5" />,
    section: "main",
  },
  {
    id: "budget",
    module: "budget",
    name: "Затраты (Бюджет)",
    href: "/budget",
    icon: <Wallet className="w-5 h-5" />,
    section: "main",
  },
  {
    id: "documents",
    module: "documents",
    name: "Документы",
    href: "/documents",
    icon: <FolderOpen className="w-5 h-5" />,
    section: "main",
  },
  {
    id: "users",
    module: "users",
    name: "Пользователи",
    href: "/users",
    icon: <Users className="w-5 h-5" />,
    section: "admin",
  },
  {
    id: "reports",
    module: "reports",
    name: "Отчеты",
    href: "/reports",
    icon: <ChartBar className="w-5 h-5" />,
    section: "admin",
  },
];

export const SIDEBAR_SECTION_LABELS: Record<"main" | "admin", string> = {
  main: "Основное",
  admin: "Администрирование",
};

export function isNavItemActive(href: string, location: string): boolean {
  if (href === "/dashboard") return location === "/dashboard" || location === "/";
  if (href === "/tasks") return location === "/tasks" || location.startsWith("/tasks?");
  if (href === "/daily-inspection") {
    return location === "/daily-inspection" || location === "/daily-inspection-new";
  }
  return location === href;
}
