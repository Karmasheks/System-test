import { useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAccessControl } from "@/hooks/use-access-control";
import {
  applyNavOrder,
  DEFAULT_ADMIN_NAV_ORDER,
  DEFAULT_MAIN_NAV_ORDER,
  type SidebarNavKey,
} from "@shared/user-ui-preferences";
import {
  SIDEBAR_NAV_ITEMS,
  SIDEBAR_SECTION_LABELS,
  isNavItemActive,
  type SidebarNavItemDef,
} from "@/lib/sidebar-nav-config";

export type ResolvedSidebarNavItem = SidebarNavItemDef & { active: boolean };

export type ResolvedSidebarSection = {
  section: "main" | "admin";
  label: string;
  items: ResolvedSidebarNavItem[];
};

export function useSidebarNavigation() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { canViewModule, canAccessTasksSection } = useAccessControl();

  const canViewItem = (item: SidebarNavItemDef) => {
    if (item.module === "tasks") return canAccessTasksSection();
    return canViewModule(item.module);
  };

  const sections = useMemo((): ResolvedSidebarSection[] => {
    const prefs = user?.uiPreferences?.sidebar;
    const mainDefs = SIDEBAR_NAV_ITEMS.filter((i) => i.section === "main");
    const adminDefs = SIDEBAR_NAV_ITEMS.filter((i) => i.section === "admin");

    const mainVisible = applyNavOrder(
      mainDefs.filter(canViewItem),
      prefs?.mainOrder,
      DEFAULT_MAIN_NAV_ORDER
    ).map((item) => ({
      ...item,
      active: isNavItemActive(item.href, location),
    }));

    const adminVisible = applyNavOrder(
      adminDefs.filter(canViewItem),
      prefs?.adminOrder,
      DEFAULT_ADMIN_NAV_ORDER
    ).map((item) => ({
      ...item,
      active: isNavItemActive(item.href, location),
    }));

    const result: ResolvedSidebarSection[] = [];
    if (mainVisible.length > 0) {
      result.push({ section: "main", label: SIDEBAR_SECTION_LABELS.main, items: mainVisible });
    }
    if (adminVisible.length > 0) {
      result.push({ section: "admin", label: SIDEBAR_SECTION_LABELS.admin, items: adminVisible });
    }
    return result;
  }, [user?.uiPreferences, location, canViewModule, canAccessTasksSection]);

  const customizableMain = useMemo(
    () =>
      applyNavOrder(
        SIDEBAR_NAV_ITEMS.filter((i) => i.section === "main" && canViewItem(i)),
        user?.uiPreferences?.sidebar?.mainOrder,
        DEFAULT_MAIN_NAV_ORDER
      ),
    [user?.uiPreferences, canViewModule, canAccessTasksSection]
  );

  const customizableAdmin = useMemo(
    () =>
      applyNavOrder(
        SIDEBAR_NAV_ITEMS.filter((i) => i.section === "admin" && canViewItem(i)),
        user?.uiPreferences?.sidebar?.adminOrder,
        DEFAULT_ADMIN_NAV_ORDER
      ),
    [user?.uiPreferences, canViewModule, canAccessTasksSection]
  );

  return {
    sections,
    customizableMain,
    customizableAdmin,
  };
}

export function reorderNavKeys(
  keys: SidebarNavKey[],
  index: number,
  direction: "up" | "down"
): SidebarNavKey[] {
  const next = [...keys];
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= next.length) return keys;
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}
