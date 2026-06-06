import { useState } from "react";

import { useSubdivisions, useSubdivisionMutations } from "@/hooks/use-subdivisions";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { useToast } from "@/hooks/use-toast";

import { Building2, Check, Pencil, Plus, Trash2, X } from "lucide-react";

function parseApiError(e: unknown, fallback: string): string {
  if (!(e instanceof Error)) return fallback;
  const raw = e.message.replace(/^\d+:\s*/, "");
  try {
    const parsed = JSON.parse(raw) as { message?: string };
    return parsed.message ?? raw;
  } catch {
    return raw || fallback;
  }
}

export function SubdivisionsPanel() {

  const { toast } = useToast();

  const { data: subdivisions = [] } = useSubdivisions();

  const { create, update, remove } = useSubdivisionMutations();

  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);

  const [editName, setEditName] = useState("");



  const add = async () => {

    if (!name.trim()) return;

    try {

      await create.mutateAsync(name.trim());

      setName("");

      toast({ title: "Подразделение добавлено" });

    } catch (e: unknown) {

      toast({

        title: "Ошибка",

        description: e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Не удалось создать",

        variant: "destructive",

      });

    }

  };



  const startEdit = (id: number, currentName: string) => {

    setEditingId(id);

    setEditName(currentName);

  };



  const cancelEdit = () => {

    setEditingId(null);

    setEditName("");

  };



  const saveEdit = async (id: number) => {

    if (!editName.trim()) return;

    try {

      await update.mutateAsync({ id, name: editName.trim() });

      cancelEdit();

      toast({ title: "Название обновлено" });

    } catch (e: unknown) {

      toast({

        title: "Ошибка",

        description: parseApiError(e, "Не удалось сохранить"),

        variant: "destructive",

      });

    }

  };



  return (

    <>

      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>

        <Building2 className="w-4 h-4 mr-2" />

        Подразделения

      </Button>

      <Dialog open={open} onOpenChange={setOpen}>

      {open ? (
      <DialogContent className="max-w-md">

        <DialogHeader>

          <DialogTitle>Справочник подразделений</DialogTitle>

        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Создавайте и переименовывайте подразделения. Если подразделение уже привязано к данным, оно будет
          скрыто из списка, а не удалено физически.
        </p>

        <div className="flex gap-2">

          <Input

            placeholder="Новое подразделение"

            value={name}

            onChange={(e) => setName(e.target.value)}

            onKeyDown={(e) => e.key === "Enter" && add()}

          />

          <Button onClick={add} disabled={create.isPending} title="Добавить">

            <Plus className="w-4 h-4" />

          </Button>

        </div>

        <ul className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2">

          {subdivisions.length === 0 ? (

            <li className="text-sm text-muted-foreground p-2">Список пуст</li>

          ) : (

            subdivisions.map((s) => (

              <li key={s.id} className="flex items-center justify-between gap-2 text-sm py-1 px-1">

                {editingId === s.id ? (

                  <>

                    <Input

                      className="h-8 flex-1"

                      value={editName}

                      onChange={(e) => setEditName(e.target.value)}

                      onKeyDown={(e) => {

                        if (e.key === "Enter") saveEdit(s.id);

                        if (e.key === "Escape") cancelEdit();

                      }}

                      autoFocus

                    />

                    <Button

                      variant="ghost"

                      size="icon"

                      className="h-8 w-8"

                      onClick={() => saveEdit(s.id)}

                      disabled={update.isPending}

                    >

                      <Check className="w-4 h-4 text-green-600" />

                    </Button>

                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={cancelEdit}>

                      <X className="w-4 h-4" />

                    </Button>

                  </>

                ) : (

                  <>

                    <span className="flex-1 truncate">{s.name}</span>

                    <Button

                      variant="ghost"

                      size="icon"

                      className="h-8 w-8"

                      onClick={() => startEdit(s.id, s.name)}

                      title="Редактировать"

                    >

                      <Pencil className="w-4 h-4" />

                    </Button>

                    <Button

                      variant="ghost"

                      size="icon"

                      className="h-8 w-8 text-destructive"

                      onClick={async () => {
                        if (!confirm(`Удалить подразделение «${s.name}»?`)) return;
                        try {
                          const result = await remove.mutateAsync(s.id);
                          toast({
                            title: result.mode === "deactivated" ? "Скрыто из справочника" : "Удалено",
                            description: result.message,
                          });
                        } catch (e: unknown) {
                          toast({
                            title: "Не удалось удалить",
                            description: parseApiError(e, "Не удалось удалить"),
                            variant: "destructive",
                          });
                        }
                      }}

                      title="Удалить"

                    >

                      <Trash2 className="w-4 h-4" />

                    </Button>

                  </>

                )}

              </li>

            ))

          )}

        </ul>

      </DialogContent>
      ) : null}

    </Dialog>

    </>

  );

}


