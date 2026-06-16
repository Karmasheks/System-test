import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { reorderNavKeys, useSidebarNavigation } from "@/hooks/use-sidebar-navigation";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";
import {
  DEFAULT_ADMIN_NAV_ORDER,
  DEFAULT_MAIN_NAV_ORDER,
  type SidebarNavKey,
  type UserUiPreferences,
} from "@shared/user-ui-preferences";
import { SIDEBAR_NAV_ITEMS } from "@/lib/sidebar-nav-config";
import { ChevronDown, ChevronUp, Settings2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SidebarCustomizeDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { customizableMain, customizableAdmin } = useSidebarNavigation();

  const [mainOrder, setMainOrder] = useState<SidebarNavKey[]>([]);
  const [adminOrder, setAdminOrder] = useState<SidebarNavKey[]>([]);

  const resetLocal = () => {
    setMainOrder(customizableMain.map((i) => i.id));
    setAdminOrder(customizableAdmin.map((i) => i.id));
  };

  const handleOpenChange = (next: boolean) => {
    if (next) resetLocal();
    onOpenChange(next);
  };

  const saveMutation = useMutation({
    mutationFn: async (prefs: UserUiPreferences) => {
      const res = await apiRequest("PATCH", "/api/auth/ui-preferences", prefs);
      return res.json() as Promise<User>;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      toast({ title: "Порядок меню сохранён" });
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      sidebar: {
        mainOrder: mainOrder.length ? mainOrder : undefined,
        adminOrder: adminOrder.length ? adminOrder : undefined,
      },
    });
  };

  const handleReset = () => {
    const mainDefault = SIDEBAR_NAV_ITEMS
      .filter((i) => i.section === "main" && customizableMain.some((c) => c.id === i.id))
      .sort(
        (a, b) =>
          DEFAULT_MAIN_NAV_ORDER.indexOf(a.id) - DEFAULT_MAIN_NAV_ORDER.indexOf(b.id)
      )
      .map((i) => i.id);
    const adminDefault = SIDEBAR_NAV_ITEMS
      .filter((i) => i.section === "admin" && customizableAdmin.some((c) => c.id === i.id))
      .sort(
        (a, b) =>
          DEFAULT_ADMIN_NAV_ORDER.indexOf(a.id) - DEFAULT_ADMIN_NAV_ORDER.indexOf(b.id)
      )
      .map((i) => i.id);
    setMainOrder(mainDefault);
    setAdminOrder(adminDefault);
    saveMutation.mutate({ sidebar: { mainOrder: [], adminOrder: [] } });
  };

  const renderSection = (
    title: string,
    items: typeof customizableMain,
    order: SidebarNavKey[],
    setOrder: (keys: SidebarNavKey[]) => void
  ) => {
    if (items.length === 0) return null;
    const orderedItems = order
      .map((id) => items.find((i) => i.id === id))
      .filter(Boolean) as typeof items;

    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <ul className="space-y-1 rounded-md border divide-y">
          {orderedItems.map((item, index) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm bg-card"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 text-muted-foreground">{item.icon}</span>
                <span className="truncate">{item.name}</span>
              </span>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={index === 0}
                  onClick={() => setOrder(reorderNavKeys(order, index, "up"))}
                  aria-label="Выше"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={index === orderedItems.length - 1}
                  onClick={() => setOrder(reorderNavKeys(order, index, "down"))}
                  aria-label="Ниже"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Настройка бокового меню
          </DialogTitle>
          <DialogDescription>
            Порядок пунктов сохраняется для вашего аккаунта. Скрытые по правам разделы не
            отображаются.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
          {renderSection("Основное", customizableMain, mainOrder, setMainOrder)}
          {renderSection("Администрирование", customizableAdmin, adminOrder, setAdminOrder)}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={saveMutation.isPending}
          >
            Сбросить порядок
          </Button>
          <Button type="button" onClick={handleSave} disabled={saveMutation.isPending}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SidebarCustomizeButton({
  collapsed,
  variant = "dark",
}: {
  collapsed?: boolean;
  variant?: "dark" | "light";
}) {
  const [open, setOpen] = useState(false);

  const buttonClass =
    variant === "light"
      ? collapsed
        ? ""
        : "w-full justify-start text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 text-xs"
      : collapsed
        ? "text-gray-300 hover:text-white hover:bg-gray-800"
        : "w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800 text-xs";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={collapsed ? "icon" : "sm"}
        className={buttonClass}
        onClick={() => setOpen(true)}
        title="Настроить меню"
      >
        <Settings2 className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="ml-2">Настроить меню</span>}
      </Button>
      <SidebarCustomizeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
