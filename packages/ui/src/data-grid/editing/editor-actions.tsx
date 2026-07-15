import { Braces, Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../../primitives/controls/button.js";

export interface EditorActionsProps {
  onApply: () => void;
  onCancel: () => void;
  onFormat?: () => void;
  applyDisabled?: boolean;
}

export function EditorActions({
  onApply,
  onCancel,
  onFormat,
  applyDisabled
}: EditorActionsProps): ReactNode {
  return (
    <div className="flex items-center gap-1.5 border-t border-border pt-2">
      {onFormat && (
        <Button variant="ghost" size="sm" onClick={onFormat}>
          <Braces className="h-2.5 w-2.5" />
          Format
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onCancel} className="ml-auto">
        <X className="h-2.5 w-2.5" />
        Cancel
      </Button>
      <Button variant="primary" size="sm" onClick={onApply} disabled={applyDisabled}>
        <Check className="h-2.5 w-2.5" />
        Apply
      </Button>
    </div>
  );
}
