import { useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useAccessControl } from "@/hooks/use-access-control";
import { parseApiErrorMessage } from "@/lib/api-errors";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export type ThreadComment = {
  id: number;
  authorId: number;
  authorName: string;
  body: string;
  createdAt: string | Date;
  updatedAt?: string | Date | null;
  attachments?: { name: string; url: string }[];
};

type CommentThreadListProps = {
  comments: ThreadComment[];
  emptyText?: string;
  isLoading?: boolean;
  maxHeightClass?: string;
  highlightId?: number | null;
  itemIdPrefix?: string;
  multilineEdit?: boolean;
  onUpdate?: (commentId: number, body: string) => Promise<void>;
  onDelete?: (commentId: number) => Promise<void>;
};

function isEdited(createdAt: string | Date, updatedAt?: string | Date | null): boolean {
  if (!updatedAt) return false;
  return new Date(updatedAt).getTime() !== new Date(createdAt).getTime();
}

export function CommentThreadList({
  comments,
  emptyText = "Комментариев пока нет",
  isLoading = false,
  maxHeightClass = "max-h-64",
  highlightId,
  itemIdPrefix,
  multilineEdit = true,
  onUpdate,
  onDelete,
}: CommentThreadListProps) {
  const { user } = useAuth();
  const { isSystemAdmin } = useAccessControl();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);

  const canModify = (authorId: number) => user?.id === authorId || isSystemAdmin();

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const saveEdit = async () => {
    if (!editingId || !onUpdate) return;
    const body = editingText.trim();
    if (!body) return;
    setPendingId(editingId);
    try {
      await onUpdate(editingId, body);
      cancelEdit();
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description: parseApiErrorMessage(error, "Не удалось сохранить комментарий"),
        variant: "destructive",
      });
    } finally {
      setPendingId(null);
    }
  };

  const removeComment = async (commentId: number) => {
    if (!onDelete) return;
    setPendingId(commentId);
    try {
      await onDelete(commentId);
      if (editingId === commentId) cancelEdit();
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description: parseApiErrorMessage(error, "Не удалось удалить комментарий"),
        variant: "destructive",
      });
    } finally {
      setPendingId(null);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  if (comments.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className={cn("overflow-y-auto pr-1 space-y-4", maxHeightClass)}>
      {comments.map((comment) => {
        const edited = isEdited(comment.createdAt, comment.updatedAt);
        const domId = itemIdPrefix ? `${itemIdPrefix}-${comment.id}` : undefined;
        const showActions = onUpdate || onDelete;

        return (
          <article
            key={comment.id}
            id={domId}
            className={cn(
              "rounded-lg border-2 border-border/90 bg-card p-4 shadow-md",
              "border-l-4 border-l-primary/70",
              highlightId === comment.id && "ring-2 ring-primary border-primary/50"
            )}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">{comment.authorName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(comment.createdAt), "dd.MM.yyyy HH:mm", { locale: ru })}
                  {edited && comment.updatedAt && (
                    <span className="ml-1.5 text-muted-foreground/80">
                      · изм.{" "}
                      {format(new Date(comment.updatedAt), "dd.MM.yyyy HH:mm", { locale: ru })}
                    </span>
                  )}
                </p>
              </div>
              {showActions && canModify(comment.authorId) && editingId !== comment.id && (
                <div className="flex shrink-0 gap-0.5">
                  {onUpdate && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Редактировать"
                      onClick={() => {
                        setEditingId(comment.id);
                        setEditingText(comment.body);
                      }}
                      disabled={pendingId === comment.id}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      title="Удалить"
                      onClick={() => removeComment(comment.id)}
                      disabled={pendingId === comment.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>

            {editingId === comment.id ? (
              <div className="space-y-2">
                {multilineEdit ? (
                  <Textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    rows={3}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                ) : (
                  <Input
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveEdit} disabled={pendingId === comment.id}>
                    Сохранить
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    Отмена
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {comment.body ? (
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {comment.body}
                  </p>
                ) : null}
                {(comment.attachments ?? []).length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
                    {(comment.attachments ?? []).map((attachment, i) => (
                      <li key={i}>
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline text-xs inline-flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          {attachment.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}
