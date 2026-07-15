import type { ButtonHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { cn } from "../../cn.js";
import { Spinner } from "../../feedback/spinner.js";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-primary bg-primary text-primary-foreground hover:brightness-110",
  secondary: "border-border bg-secondary text-foreground hover:bg-accent",
  outline: "border-border bg-transparent text-foreground hover:bg-accent",
  ghost:
    "border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
  destructive: "border-destructive bg-destructive text-primary-foreground hover:brightness-110"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-6 px-2 py-1 text-[10px]",
  md: "min-h-7 px-2.5 py-1 text-[11px]",
  icon: "h-7 w-7 p-0"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    disabled,
    className,
    children,
    type = "button",
    ...props
  },
  ref
): ReactNode {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[3px] border font-medium outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {loading && <Spinner className="h-2.5 w-2.5 text-current" />}
      {children}
    </button>
  );
});
