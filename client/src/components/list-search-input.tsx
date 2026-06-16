import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ListSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  inputClassName?: string;
  /** Без подписи — в одну линию с Select без label (задачи, заявки) */
  inline?: boolean;
};

export function ListSearchInput({
  value,
  onChange,
  placeholder = "Поиск…",
  label = "Поиск",
  className,
  inputClassName,
  inline = false,
}: ListSearchInputProps) {
  const control = (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("h-10 pl-9", inputClassName)}
      />
    </div>
  );

  if (inline) {
    return <div className={cn("min-w-[200px] w-full sm:w-auto", className)}>{control}</div>;
  }

  return (
    <div className={cn("min-w-[200px]", className)}>
      <Label>{label}</Label>
      {control}
    </div>
  );
}
