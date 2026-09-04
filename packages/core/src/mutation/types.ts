import type { MUTATION_EDITOR_KINDS, MUTATION_EDITOR_WIDGETS } from "./constants.js";

export type MutationEditorKind = (typeof MUTATION_EDITOR_KINDS)[keyof typeof MUTATION_EDITOR_KINDS];
export type MutationEditorWidget =
  (typeof MUTATION_EDITOR_WIDGETS)[keyof typeof MUTATION_EDITOR_WIDGETS];

export interface MutationEditorMetadata {
  readonly allowedValues?: readonly string[];
  readonly elementDataType?: string;
}

export interface MutationEditorCapability {
  readonly kind: MutationEditorKind;
  readonly editable: boolean;
  readonly widget: MutationEditorWidget | null;
  readonly unavailableReason?: string;
}
