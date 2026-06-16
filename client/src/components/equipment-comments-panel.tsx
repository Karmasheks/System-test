import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  useEquipmentComments,
  useEquipmentCommentMutations,
} from "@/hooks/use-equipment-comments";
import { useToast } from "@/hooks/use-toast";
import { parseApiErrorMessage } from "@/lib/api-errors";
import { CommentThreadList } from "@/components/comment-thread-list";
import { CommentComposer } from "@/components/comment-composer";

type EquipmentCommentsPanelProps = {
  equipmentId: string;
};

export function EquipmentCommentsPanel({ equipmentId }: EquipmentCommentsPanelProps) {
  const { toast } = useToast();
  const { data: comments = [], isLoading } = useEquipmentComments(equipmentId);
  const { addComment, updateComment, deleteComment } = useEquipmentCommentMutations(equipmentId);
  const [newText, setNewText] = useState("");

  const submitNew = async () => {
    const body = newText.trim();
    if (!body) return;
    try {
      await addComment.mutateAsync(body);
      setNewText("");
    } catch (error: unknown) {
      toast({
        title: "Ошибка",
        description: parseApiErrorMessage(error, "Не удалось добавить заметку"),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="border-t pt-4 space-y-3">
      <Label className="font-medium flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        Заметки
      </Label>
      <p className="text-xs text-muted-foreground">
        Комментарии и напоминания по этому оборудованию. Видны всем, кто открывает карточку.
      </p>

      <CommentThreadList
        comments={comments}
        isLoading={isLoading}
        emptyText="Заметок пока нет"
        maxHeightClass="max-h-56"
        multilineEdit={false}
        onUpdate={async (commentId, body) => {
          await updateComment.mutateAsync({ commentId, body });
        }}
        onDelete={async (commentId) => {
          await deleteComment.mutateAsync(commentId);
        }}
      />

      <CommentComposer
        variant="simple"
        text={newText}
        onTextChange={setNewText}
        isPending={addComment.isPending}
        placeholder="Добавить заметку…"
        submitLabel="Отправить заметку"
        onSubmit={submitNew}
      />
    </div>
  );
}
