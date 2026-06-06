import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageIcon, Plus, Trash2 } from "lucide-react";

interface EquipmentImageUrlsFieldProps {
  urls: string[];
  onChange: (urls: string[]) => void;
}

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function EquipmentImageUrlsField({ urls, onChange }: EquipmentImageUrlsFieldProps) {
  const [draft, setDraft] = useState("");
  const [previewErrors, setPreviewErrors] = useState<Record<number, boolean>>({});

  const addUrl = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (!isValidImageUrl(trimmed)) return;
    if (urls.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...urls, trimmed]);
    setDraft("");
  };

  const removeUrl = (index: number) => {
    onChange(urls.filter((_, i) => i !== index));
    setPreviewErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const draftValid = draft.trim() === "" || isValidImageUrl(draft);

  return (
    <div className="space-y-3">
      <Label>Изображения (ссылки)</Label>
      <p className="text-xs text-gray-500">
        Укажите прямую ссылку на изображение (https://…). Файлы в базе не хранятся.
      </p>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://example.com/photo.jpg"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addUrl();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={addUrl} disabled={!draft.trim() || !draftValid}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {!draftValid && draft.trim() && (
        <p className="text-xs text-red-500">Введите корректный URL (http или https)</p>
      )}

      {urls.length > 0 && (
        <ul className="space-y-2">
          {urls.map((url, index) => (
            <li
              key={`${url}-${index}`}
              className="flex items-start gap-3 p-2 border rounded-md dark:border-gray-700"
            >
              <div className="w-16 h-16 flex-shrink-0 rounded overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                {previewErrors[index] ? (
                  <ImageIcon className="h-6 w-6 text-gray-400" />
                ) : (
                  <img
                    src={url}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={() => setPreviewErrors((prev) => ({ ...prev, [index]: true }))}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 break-all hover:underline"
                >
                  {url}
                </a>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => removeUrl(index)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EquipmentImageGallery({ urls }: { urls?: string[] | null }) {
  const list = (urls ?? []).filter(Boolean);
  if (list.length === 0) return null;

  return (
    <div>
      <Label className="font-medium">Изображения</Label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
        {list.map((url, index) => (
          <EquipmentImagePreview key={`${url}-${index}`} url={url} index={index} />
        ))}
      </div>
    </div>
  );
}

function EquipmentImagePreview({ url, index }: { url: string; index: number }) {
  const [failed, setFailed] = useState(false);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block aspect-video rounded-lg overflow-hidden border dark:border-gray-700 bg-gray-100 dark:bg-gray-800 hover:opacity-90"
    >
      {failed ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2 text-center">
          <ImageIcon className="h-8 w-8 text-gray-400" />
          <span className="text-xs text-blue-600 break-all line-clamp-3">{url}</span>
        </div>
      ) : (
        <img
          src={url}
          alt={`Фото оборудования ${index + 1}`}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </a>
  );
}
