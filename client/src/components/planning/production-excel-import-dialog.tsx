import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useProductionMutations } from "@/hooks/use-production-planning";
import {
  PRODUCTION_IMPORT_FIELDS,
  PRODUCTION_IMPORT_FIELD_LABELS,
  type ProductionImportColumnMapping,
  type ImportPreviewItem,
} from "@shared/production-excel-fields";
import {
  applyColumnMapping,
  buildColumnMapping,
  parseExcelFile,
  type ParsedExcelSheet,
} from "@/lib/production-excel-import";
import { Upload, AlertCircle, CheckCircle2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subdivisionId: number;
};

export function ProductionExcelImportDialog({ open, onOpenChange, subdivisionId }: Props) {
  const { toast } = useToast();
  const { previewImport, confirmImport } = useProductionMutations();

  const [step, setStep] = useState<"file" | "mapping" | "preview" | "done">("file");
  const [parsed, setParsed] = useState<ParsedExcelSheet | null>(null);
  const [mapping, setMapping] = useState<ProductionImportColumnMapping>({});
  const [preview, setPreview] = useState<ImportPreviewItem[]>([]);
  const [importResult, setImportResult] = useState<{
    rowsSuccess: number;
    rowsFailed: number;
    batchId: number;
  } | null>(null);

  const mappedRows = useMemo(() => {
    if (!parsed) return [];
    return applyColumnMapping(parsed.rawRows, mapping);
  }, [parsed, mapping]);

  const reset = () => {
    setStep("file");
    setParsed(null);
    setMapping({});
    setPreview([]);
    setImportResult(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleFile = async (file: File) => {
    try {
      const sheet = await parseExcelFile(file);
      setParsed(sheet);
      setMapping(buildColumnMapping(sheet.headers));
      setStep("mapping");
    } catch {
      toast({ title: "Не удалось прочитать файл", variant: "destructive" });
    }
  };

  const handlePreview = async () => {
    if (!parsed || mappedRows.length === 0) return;
    try {
      const result = await previewImport.mutateAsync({
        defaultSubdivisionId: subdivisionId,
        fileName: parsed.fileName,
        rows: mappedRows,
      });
      setPreview(result.preview as ImportPreviewItem[]);
      setStep("preview");
    } catch (e: unknown) {
      toast({
        title: "Ошибка предпросмотра",
        description: e instanceof Error ? e.message : "Ошибка",
        variant: "destructive",
      });
    }
  };

  const handleConfirm = async () => {
    if (!parsed) return;
    try {
      const result = await confirmImport.mutateAsync({
        defaultSubdivisionId: subdivisionId,
        fileName: parsed.fileName,
        rows: mappedRows,
      });
      setImportResult({
        rowsSuccess: result.batch.rowsSuccess,
        rowsFailed: result.batch.rowsFailed,
        batchId: result.batch.id,
      });
      setStep("done");
      toast({
        title: "Импорт завершён",
        description: `Успешно: ${result.batch.rowsSuccess}, ошибок: ${result.batch.rowsFailed}`,
      });
    } catch (e: unknown) {
      toast({
        title: "Ошибка импорта",
        description: e instanceof Error ? e.message : "Ошибка",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Импорт потребностей из Excel</DialogTitle>
        </DialogHeader>

        {step === "file" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Загрузите файл .xlsx или .xls. Колонки можно сопоставить вручную — фиксированный
              шаблон не требуется.
            </p>
            <Label
              className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 cursor-pointer hover:bg-muted/50"
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span>Выберите файл Excel</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </Label>
          </div>
        )}

        {step === "mapping" && parsed && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Файл: {parsed.fileName} · строк: {parsed.rawRows.length}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {PRODUCTION_IMPORT_FIELDS.map((field) => (
                <div key={field}>
                  <Label>{PRODUCTION_IMPORT_FIELD_LABELS[field]}</Label>
                  <Select
                    value={mapping[field] ?? "__none__"}
                    onValueChange={(v) =>
                      setMapping((m) => ({
                        ...m,
                        [field]: v === "__none__" ? undefined : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Не используется" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— не сопоставлять —</SelectItem>
                      {parsed.headers.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("file")}>Назад</Button>
              <Button onClick={handlePreview} disabled={previewImport.isPending}>
                Предпросмотр
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
                OK: {preview.filter((p) => p.valid).length}
              </span>
              <span className="flex items-center gap-1 text-destructive">
                <AlertCircle className="w-4 h-4" />
                Ошибки: {preview.filter((p) => !p.valid).length}
              </span>
            </div>
            <div className="rounded-md border max-h-64 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Строка</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Изделие</TableHead>
                    <TableHead>Кол-во</TableHead>
                    <TableHead>Подразделение</TableHead>
                    <TableHead>Ошибки</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>
                        {row.valid ? (
                          <Badge variant="outline" className="text-emerald-700">OK</Badge>
                        ) : (
                          <Badge variant="destructive">Ошибка</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.resolved?.productName ?? row.raw.productName ?? row.raw.productSapCode ?? "—"}
                      </TableCell>
                      <TableCell>{row.resolved?.quantity ?? row.raw.quantity ?? "—"}</TableCell>
                      <TableCell>{row.resolved?.subdivisionName ?? "—"}</TableCell>
                      <TableCell className="text-xs text-destructive max-w-[200px] text-multiline">
                        {row.errors.map((e) => e.message).join("; ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("mapping")}>Назад</Button>
              <Button
                onClick={handleConfirm}
                disabled={confirmImport.isPending || preview.every((p) => !p.valid)}
              >
                Импортировать ({preview.filter((p) => p.valid).length})
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "done" && importResult && (
          <div className="space-y-3 text-sm">
            <p>Импорт завершён.</p>
            <p>Успешно: {importResult.rowsSuccess}</p>
            <p>Ошибок: {importResult.rowsFailed}</p>
            <p className="text-muted-foreground">
              Партия импорта #{importResult.batchId}. Ошибки сохранены в журнале импорта.
            </p>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Закрыть</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
