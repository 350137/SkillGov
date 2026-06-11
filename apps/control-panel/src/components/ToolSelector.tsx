// Tool selector component — target agent dropdown used in single and batch operations.
import type { TargetProfile } from '../types';

interface ToolSelectorProps {
  targetProfiles: TargetProfile[];
  value: string;
  onChange: (value: string) => void;
}

export function ToolSelector({ targetProfiles, value, onChange }: ToolSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mb-2 h-11 w-full rounded border border-[#ded4d0] bg-white px-3 text-base text-[#282326] shadow-sm"
    >
      {targetProfiles.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label || p.id}
        </option>
      ))}
    </select>
  );
}
