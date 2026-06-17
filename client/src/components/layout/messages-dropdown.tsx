import { Link } from "wouter";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useChatConversations } from "@/hooks/use-chat";
import { UserAvatar } from "@/components/user-avatar";

import { formatChatDateTime } from "@/lib/chat-datetime";

export function MessagesDropdown() {
  const { user } = useAuth();
  const { data: conversations = [] } = useChatConversations(!!user);

  const unreadTotal = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const recent = [...conversations]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-gray-200 hover:text-white hover:bg-gray-800"
          title="Сообщения"
        >
          <MessageSquare className="h-5 w-5" />
          {unreadTotal > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center text-xs"
            >
              {unreadTotal > 99 ? "99+" : unreadTotal}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 max-h-96 overflow-y-auto bg-popover text-popover-foreground"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Сообщения</span>
          {unreadTotal > 0 && (
            <Badge variant="outline">{unreadTotal} новых</Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {recent.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Нет диалогов</p>
          </div>
        ) : (
          <div className="py-1">
            {recent.map((conversation) => {
              const otherMember = conversation.members.find((m) => m.id !== user?.id);
              const preview = conversation.lastMessage?.body ?? "Нет сообщений";
              return (
                <DropdownMenuItem key={conversation.id} asChild className="p-0 cursor-pointer">
                  <Link
                    href={`/messages?conversation=${conversation.id}`}
                    className={`flex w-full items-start gap-3 p-3 hover:bg-accent ${
                      conversation.unreadCount > 0 ? "bg-blue-50 dark:bg-blue-950/40" : ""
                    }`}
                  >
                    <UserAvatar
                      name={conversation.displayTitle}
                      avatarUrl={otherMember?.avatar}
                      className="h-8 w-8 shrink-0 mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-multiline">{conversation.displayTitle}</p>
                        {conversation.unreadCount > 0 && (
                          <Badge variant="destructive" className="shrink-0 h-5 min-w-5 px-1 text-xs">
                            {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground text-multiline mt-0.5">{preview}</p>
                      {conversation.lastMessage && (
                        <p className="text-[10px] text-muted-foreground/80 mt-1">
                          {formatChatDateTime(conversation.lastMessage.createdAt)}
                        </p>
                      )}
                    </div>
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/messages" className="w-full justify-center text-center font-medium cursor-pointer">
            Все сообщения
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
