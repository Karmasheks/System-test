import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildUrlAttachment } from "@/lib/comment-attachment";
import { cn } from "@/lib/utils";

type CommentComposerProps = {
  text: string;
  onTextChange: (value: string) => void;
  onSubmit: () => void;
  isPending?: boolean;
  disabled?: boolean;
  variant?: "full" | "simple";
  attachmentName?: string;
  onAttachmentNameChange?: (value: string) => void;
  attachmentUrl?: string;
  onAttachmentUrlChange?: (value: string) => void;
  attachmentFile?: File | null;
  onAttachmentFileChange?: (file: File | null) => void;
  showSaveHint?: boolean;
  placeholder?: string;
  submitLabel?: string;
  className?: string;
};

export function CommentComposer({
  text,
  onTextChange,
  onSubmit,
  isPending = false,
  disabled = false,
  variant = "full",
  attachmentName = "",
  onAttachmentNameChange,
  attachmentUrl = "",
  onAttachmentUrlChange,
  attachmentFile = null,
  onAttachmentFileChange,
  showSaveHint = false,
  placeholder = "Напишите комментарий…",
  submitLabel = "Отправить комментарий",
  className,
}: CommentComposerProps) {
  const canSubmitFull =
    text.trim() ||
    attachmentFile ||
    (variant === "full" && buildUrlAttachment(attachmentName, attachmentUrl));

  const canSubmitSimple = text.trim();

  const handleSubmit = () => {
    if (disabled || isPending) return;
    if (variant === "simple" && !canSubmitSimple) return;
    if (variant === "full" && !canSubmitFull) return;
    onSubmit();
  };

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-primary/25 bg-primary/[0.04] dark:bg-primary/[0.08] p-3 space-y-3 shadow-sm",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-semibold text-foreground">Новый комментарий</Label>
        {showSaveHint && (
          <span className="text-[10px] text-muted-foreground text-right max-w-[220px] leading-tight">
            Отправка только здесь — кнопка «Сохранить» внизу не публикует комментарий
          </span>
        )}
      </div>

      {variant === "simple" ? (
        <div className="flex gap-2">
          <Input
            placeholder={placeholder}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button
            type="button"
            disabled={disabled || isPending || !canSubmitSimple}
            onClick={handleSubmit}
            className="shrink-0"
          >
            <Send className="h-4 w-4 mr-1.5" />
            {submitLabel}
          </Button>
        </div>
      ) : (
        <>
          <Textarea
            placeholder={placeholder}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            rows={3}
            disabled={disabled}
            className="bg-background"
          />
          {onAttachmentNameChange && onAttachmentUrlChange && (
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Название ссылки (необяз.)"
                value={attachmentName}
                onChange={(e) => onAttachmentNameChange(e.target.value)}
                disabled={disabled || !!attachmentFile}
                className="bg-background"
              />
              <Input
                placeholder="URL — можно без названия"
                value={attachmentUrl}
                onChange={(e) => onAttachmentUrlChange(e.target.value)}
                disabled={disabled || !!attachmentFile}
                className="bg-background"
              />
            </div>
          )}
          {onAttachmentFileChange && (
            <Input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.doc,.docx,.xls,.xlsx"
              disabled={disabled}
              onChange={(e) => onAttachmentFileChange(e.target.files?.[0] ?? null)}
              className="bg-background"
            />
          )}
          {attachmentFile && (
            <p className="text-xs text-muted-foreground">
              Файл: {attachmentFile.name} ({Math.round(attachmentFile.size / 1024)} КБ)
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={disabled || isPending || !canSubmitFull}
              onClick={handleSubmit}
              className="min-w-[160px]"
            >
              <Send className="h-4 w-4 mr-1.5" />
              {isPending ? "Отправка…" : submitLabel}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function hasUnsentCommentDraft(
  text: string,
  attachmentFile?: File | null,
  attachmentName?: string,
  attachmentUrl?: string
): boolean {
  return Boolean(
    text.trim() || attachmentFile || buildUrlAttachment(attachmentName ?? "", attachmentUrl ?? "")
  );
}
