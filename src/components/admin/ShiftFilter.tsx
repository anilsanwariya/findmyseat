import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SHIFT_OPTIONS } from "@/lib/shift-selection";

export function ShiftFilter({ value, onChange, unspecified = false }: {
  value: string; onChange: (value: string) => void; unspecified?: boolean;
}) {
  return <Select value={value} onValueChange={onChange}>
    <SelectTrigger aria-label="Filter by shift" className="w-full sm:w-44 bg-panel border-panel-border"><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="all">All shifts</SelectItem>
      {SHIFT_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
      {unspecified && <SelectItem value="unspecified">Not specified</SelectItem>}
    </SelectContent>
  </Select>;
}