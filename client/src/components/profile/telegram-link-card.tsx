import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ExternalLink, MessageCircle, Unlink } from "lucide-react";

interface TelegramStatus {
  configured: boolean;
  linked: boolean;
  telegramUsername: string | null;
  botUsername: string | null;
  botUrl: string | null;
  pendingCode: string | null;
  pendingCodeExpiresAt: string | null;
}

interface LinkCodeResponse {
  code: string;
  expiresAt: string;
  botUsername: string | null;
  botUrl: string | null;
}

export function TelegramLinkCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<TelegramStatus>({
    queryKey: ["/api/auth/telegram"],
  });

  const linkCodeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/telegram/link-code");
      return res.json() as Promise<LinkCodeResponse>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/telegram"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Код создан",
        description: `Отправьте ${result.code} боту в Telegram (15 минут).`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/telegram/unlink");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/telegram"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Telegram отключён" });
    },
    onError: (err: Error) => {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return null;
  }

  if (!data?.configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-5 w-5" />
            Telegram
          </CardTitle>
          <CardDescription>Уведомления в Telegram (скоро на сервере)</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const botUrl = data.botUrl ?? (data.botUsername ? `https://t.me/${data.botUsername}` : null);
  const activeCode = data.pendingCode;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-5 w-5" />
          Telegram
        </CardTitle>
        <CardDescription>
          Уведомления о задачах, заявках и складе в Telegram
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {data.linked ? (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
              Подключён{data.telegramUsername ? ` (@${data.telegramUsername})` : ""}
            </Badge>
          ) : (
            <Badge variant="secondary">Не подключён</Badge>
          )}
          {botUrl && (
            <a
              href={botUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
            >
              Открыть бота
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {!data.linked && (
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Нажмите «Получить код»</li>
            <li>Откройте бота в Telegram</li>
            <li>Отправьте код (например SL-48291) или /start</li>
          </ol>
        )}

        {activeCode && !data.linked && (
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-sm font-medium">Код подключения:</p>
            <p className="text-2xl font-mono font-bold tracking-wide mt-1">{activeCode}</p>
            {data.pendingCodeExpiresAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Действует до{" "}
                {new Date(data.pendingCodeExpiresAt).toLocaleString("ru-RU")}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!data.linked && (
            <Button
              type="button"
              onClick={() => linkCodeMutation.mutate()}
              disabled={linkCodeMutation.isPending}
            >
              {linkCodeMutation.isPending ? "Создание…" : "Получить код"}
            </Button>
          )}
          {data.linked && (
            <Button
              type="button"
              variant="outline"
              onClick={() => unlinkMutation.mutate()}
              disabled={unlinkMutation.isPending}
            >
              <Unlink className="h-4 w-4 mr-2" />
              Отключить
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
