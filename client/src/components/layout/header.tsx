import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useAccessControl } from "@/hooks/use-access-control";
import { useMobileSidebar } from "@/hooks/use-mobile-sidebar";
import { useTaskDialog } from "@/hooks/use-task-dialog";
import { useMyWorkParams } from "@/hooks/use-my-work-params";
import { cn } from "@/lib/utils";
import { Menu, User, LogOut, Plus } from "lucide-react";
import { NotificationsDropdown } from "./notifications";
import { MessagesDropdown } from "./messages-dropdown";
import { MobileSidebar } from "./mobile-sidebar";
import { UserAvatar } from "@/components/user-avatar";

export function Header() {
  const { user, logout } = useAuth();
  const { canCreateTasks, canViewCreatedTasks } = useAccessControl();
  const { setOpen } = useMobileSidebar();
  const { openCreate } = useTaskDialog();
  const [location] = useLocation();
  const { scope, section, setMyWork } = useMyWorkParams();

  const handleLogout = async () => {
    await logout();
  };

  const onTasksPage = location.startsWith("/tasks");
  const navBtnClass = (active: boolean) =>
    cn(
      "text-gray-200 hover:text-white hover:bg-gray-800",
      active && "bg-gray-800 text-white ring-1 ring-gray-600"
    );

  const onCreatedView = onTasksPage && section !== "remarks" && scope === "created";

  return (
    <>
      <header className="app-header bg-gray-900 border-b border-gray-700 shadow-sm">
        <div className="flex items-center gap-3 p-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden shrink-0 text-gray-200 hover:text-white hover:bg-gray-800 focus:outline-none"
            onClick={() => setOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </Button>

          <div className="lg:hidden flex items-center shrink-0">
            <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-5 h-5 text-white"
              >
                <path d="M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z" />
              </svg>
            </div>
            <h1 className="ml-2 text-lg font-semibold text-white">StarLine</h1>
          </div>

          {/* Быстрые действия — между сайдбаром и колокольчиком на desktop */}
          <div className="hidden lg:flex flex-1 items-center gap-2 min-w-0 pl-2">
            {canCreateTasks() && (
            <Button
              size="sm"
              variant="secondary"
              className="bg-gray-800 text-gray-100 hover:bg-gray-700 border border-gray-600"
              onClick={() => openCreate()}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Новая задача
            </Button>
            )}
            {canViewCreatedTasks() && (
            <Button
              size="sm"
              variant="ghost"
              className={navBtnClass(onCreatedView)}
              onClick={() => setMyWork({ scope: "created", section: "tasks" })}
            >
              Созданные мной
            </Button>
            )}
          </div>

          <div className="flex-1 lg:hidden" />

          <div className="flex items-center gap-2 shrink-0">
            {canCreateTasks() && (
            <Button
              size="sm"
              variant="ghost"
              className="lg:hidden text-gray-200 hover:text-white hover:bg-gray-800"
              onClick={() => openCreate()}
            >
              <Plus className="w-4 h-4" />
            </Button>
            )}
            <MessagesDropdown />
            <NotificationsDropdown />

            <Link href="/profile" className="lg:hidden">
              <Button
                variant="ghost"
                className="relative h-10 w-10 p-0 rounded-full hover:bg-gray-800 text-gray-100"
              >
                <UserAvatar
                  name={user?.name}
                  avatarUrl={user?.avatar}
                  className="h-10 w-10"
                />
              </Button>
            </Link>

            <div className="hidden lg:block">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-10 w-10 p-0 rounded-full hover:bg-gray-800 text-gray-100"
                  >
                    <UserAvatar
                      name={user?.name}
                      avatarUrl={user?.avatar}
                      className="h-10 w-10"
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end">
                  <div className="flex items-center gap-3 p-2">
                    <UserAvatar
                      name={user?.name}
                      avatarUrl={user?.avatar}
                      className="h-10 w-10"
                    />
                    <div className="flex flex-col space-y-1 leading-none min-w-0">
                      <p className="font-medium text-multiline">{user?.name || "Пользователь"}</p>
                      <p className="text-multiline text-sm text-muted-foreground">
                        {user?.email || "admin@example.com"}
                      </p>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile">
                      <User className="mr-2 h-4 w-4" />
                      <span>Профиль</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Выйти</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>
      <MobileSidebar />
    </>
  );
}
