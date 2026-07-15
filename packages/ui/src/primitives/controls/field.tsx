import type { ReactElement, ReactNode } from "react";
import { cloneElement, useId } from "react";
import { cn } from "../../cn.js";

type FieldControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export interface FieldProps {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  children: ReactElement<FieldControlProps>;
  className?: string;
}

export function Field({ label, description, error, children, className }: FieldProps): ReactNode {
  const generatedId = useId();
  const controlId = children.props.id ?? `${generatedId}-control`;
  const descriptionId = description ? `${generatedId}-description` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid gap-1", className)}>
      <label htmlFor={controlId} className="text-[10px] font-medium text-foreground">
        {label}
      </label>
      {cloneElement(children, {
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": Boolean(error)
      })}
      {description && (
        <p id={descriptionId} className="font-mono text-[9px] text-quiet-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} className="font-mono text-[9px]" style={{ color: "var(--c-red)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
