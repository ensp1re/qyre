import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn.js";

export interface SpinnerProps {
  className?: string;
}

export function Spinner({ className }: SpinnerProps): ReactNode {
  return (
    <Loader2
      className={cn("h-3 w-3 animate-spin text-muted-foreground", className)}
      aria-hidden="true"
    />
  );
}
