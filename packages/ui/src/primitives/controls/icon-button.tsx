import type { ReactNode } from "react";
import { forwardRef } from "react";
import { Button, type ButtonProps } from "./button.js";

export interface IconButtonProps extends Omit<ButtonProps, "size" | "children" | "aria-label"> {
  label: string;
  icon: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, title = label, ...props },
  ref
): ReactNode {
  return (
    <Button ref={ref} size="icon" aria-label={label} title={title} {...props}>
      {icon}
    </Button>
  );
});
