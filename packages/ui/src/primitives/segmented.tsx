import type { ReactNode } from "react";
import { cn } from "../cn.js";

export interface SegmentedOption<Value extends string> {
  value: Value;
  label: string;
  icon?: ReactNode;
}

export function Segmented<Value extends string>({
  value,
  onChange,
  options,
  "aria-label": ariaLabel
}: {
  value: Value;
  onChange: (value: Value) => void;
  options: SegmentedOption<Value>[];
  "aria-label"?: string;
}): ReactNode {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex items-center gap-0.5 rounded-[3px] border border-border bg-background p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-1 rounded-[2px] px-2 py-1 font-mono text-[11px] transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
