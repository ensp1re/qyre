import type { ReactNode } from "react";

export interface PanelProps {
  title: string;
  children?: ReactNode;
}

/** A simple titled container used to group content. */
export function Panel({ title, children }: PanelProps): ReactNode {
  return (
    <section
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "0.75rem",
        padding: "1rem 1.25rem",
        background: "#fff"
      }}
    >
      <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 600 }}>{title}</h2>
      {children}
    </section>
  );
}
