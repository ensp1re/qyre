export interface ConnectionWarning {
  readonly kind: "insecure-transport" | "risky-parameter";
  readonly message: string;
}
