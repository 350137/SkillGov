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
      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm mb-2"
    >
      {targetProfiles.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label || p.id}
        </option>
      ))}
    </select>
  );
}
