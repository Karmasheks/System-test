import { useState } from "react";
import { ExternalLink, Link2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildUrlAttachment, deriveLinkTitleFromUrl } from "@/lib/comment-attachment";
import { useToast } from "@/hooks/use-toast";

export type ExternalLinkItem = {
  id: number;
  title: string;
  description?: string | null;
  url: string;
};

type ExternalLinksPanelProps = {
  links: ExternalLinkItem[];
  canEdit?: boolean;
  isPending?: boolean;
  onAdd: (body: { title: string; description?: string; url: string }) => Promise<void>;
  onRemove: (linkId: number) => Promise<void>;
  className?: string;
};

export function ExternalLinksPanel({
  links,
  canEdit = false,
  isPending = false,
  onAdd,
  onRemove,
  className,
}: ExternalLinksPanelProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");

  const submitLink = async () => {
    const rawUrl = url.trim();
    if (!rawUrl) {
      toast({ title: "Укажите URL", variant: "destructive" });
      return;
    }
    const normalized =
      buildUrlAttachment(title, rawUrl)?.url ?? rawUrl.startsWith("http")
        ? rawUrl
        : `https://${rawUrl}`;
    const linkTitle = title.trim() || deriveLinkTitleFromUrl(rawUrl);
    try {
      await onAdd({
        title: linkTitle,
        description: description.trim() || undefined,
        url: normalized,
      });
      setTitle("");
      setDescription("");
      setUrl("");
      toast({ title: "Ссылка добавлена" });
    } catch (e: unknown) {
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось добавить ссылку",
        variant: "destructive",
      });
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-2">
        <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <Label className="text-sm font-medium">Внешние ссылки</Label>
      </div>
      {links.length === 0 && !canEdit && (
        <p className="text-sm text-muted-foreground">Связанных ссылок нет</p>
      )}
      {links.length > 0 && (
        <ul className="space-y-2 mb-3">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex items-start justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm shadow-sm"
            >
              <div className="min-w-0">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  {link.title}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                {link.description && (
                  <p className="text-muted-foreground text-xs mt-0.5">{link.description}</p>
                )}
              </div>
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0"
                  disabled={isPending}
                  onClick={() => onRemove(link.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="rounded-lg border border-dashed bg-muted/20 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Добавить ссылку</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <Input
            placeholder="Описание (необязательно)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!url.trim() || isPending}
            onClick={submitLink}
          >
            <Link2 className="h-3.5 w-3.5 mr-1" />
            Добавить ссылку
          </Button>
        </div>
      )}
    </div>
  );
}
