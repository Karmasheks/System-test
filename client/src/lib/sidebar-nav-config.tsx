import type { LucideIcon } from "lucide-react";
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
import type { AppModule } from "@shared/permissions-constants";

export type SidebarNavItemDef = {
  id: SidebarNavKey;
  module: AppModule;
  alsoModule?: string;
  name: string;
  href: string;
  icon: LucideIcon;
  section: "main" | "admin";
};

export const SIDEBAR_NAV_ITEMS: SidebarNavItemDef[] = [
  {
    id: "dashboard",
    module: "dashboard",
    name: "Панель управления",
    href: "/dashboard",
    icon: BarChart2,
    section: "main",
  },
  {
    id: "schedule",
    module: "schedule",
    name: "План ТО и задач",
    href: "/schedule",
    icon: Calendar,
    section: "main",
  },
  {
    id: "equipment",
    module: "equipment",
    name: "Оборудование",
    href: "/equipment",
    icon: Wrench,
    section: "main",
  },
  {
    id: "daily_inspection",
    module: "daily_inspection",
    name: "Ежедневные осмотры",
    href: "/daily-inspection",
    icon: ClipboardCheck,
    section: "main",
  },
  {
    id: "tasks",
    module: "tasks",
    alsoModule: "service_requests",
    name: "Задачи и заявки",
    href: "/tasks",
    icon: CheckSquare,
    section: "main",
  },
  {
    id: "contacts",
    module: "contacts",
    name: "Контакты",
    href: "/contacts",
    icon: UserCircle,
    section: "main",
  },
  {
    id: "suppliers",
    module: "suppliers",
    name: "Поставщики",
    href: "/suppliers",
    icon: Building2,
    section: "main",
  },
  {
    id: "warehouse",
    module: "warehouse",
    name: "Склад",
    href: "/warehouse",
    icon: Package,
    section: "main",
  },
  {
    id: "production_planning",
    module: "production_planning",
    name: "Планирование",
    href: "/planning",
    icon: Factory,
    section: "main",
  },
  {
    id: "budget",
    module: "budget",
    name: "Затраты и бюджет",
    href: "/budget",
    icon: Wallet,
    section: "main",
  },
  {
    id: "documents",
    module: "documents",
    name: "Документы",
    href: "/documents",
    icon: FolderOpen,
    section: "main",
  },
  {
    id: "users",
    module: "users",
    name: "Пользователи",
    href: "/users",
    icon: Users,
    section: "admin",
  },
  {
    id: "reports",
    module: "reports",
    name: "Отчеты",
    href: "/reports",
    icon: ChartBar,
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

export const SIDEBAR_NAV_ICON_CLASS = "w-5 h-5 shrink-0";
