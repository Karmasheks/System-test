import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function getUserInitials(name?: string | null): string {
  if (!name?.trim()) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

interface UserAvatarProps {
  name?: string | null;
  avatarUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
}

export function UserAvatar({ name, avatarUrl, className, fallbackClassName }: UserAvatarProps) {
  return (
    <Avatar className={className}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={name ?? "Пользователь"} /> : null}
      <AvatarFallback className={cn("bg-primary-600 text-white", fallbackClassName)}>
        {getUserInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
