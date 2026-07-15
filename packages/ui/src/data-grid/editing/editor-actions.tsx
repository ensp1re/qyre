import { Braces, Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../../primitives/controls/button.js";
import { IconButton } from "../../primitives/controls/icon-button.js";

export interface EditorActionsProps {
  onApply: () => void;
  onCancel: () => void;
  onFormat?: () => void;
  applyDisabled?: boolean;
}

/** Icon-only confirm/cancel controls, matching JetBrains DataGrip's inline cell-editor pattern
 * (F146) - the previous "Cancel"/"Apply" text buttons added label-reading overhead to what should
 * be a single glance-and-click action once the keyboard shortcut is learned. */
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
      <IconButton
        label="Cancel"
        title="Cancel (Escape)"
        icon={<X className="h-3 w-3" />}
        variant="ghost"
        onClick={onCancel}
        className="ml-auto"
      />
      <IconButton
        label="Apply"
        title="Apply (Ctrl/Cmd+Enter)"
        icon={<Check className="h-3 w-3" />}
        variant="primary"
        onClick={onApply}
        disabled={applyDisabled}
      />
    </div>
  );
}
