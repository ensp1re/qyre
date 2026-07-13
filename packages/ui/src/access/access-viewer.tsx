import type { AccessOverview, ConnectionStatus } from "@qyre/core";
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Spinner } from "../feedback/spinner.js";

export interface AccessViewerProps {
  connectionStatus: ConnectionStatus;
  supported?: boolean;
  overview?: AccessOverview;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function AccessViewer({
  connectionStatus,
  supported,
  overview,
  isLoading,
  isError,
  onRetry
}: AccessViewerProps): ReactNode {
  if (connectionStatus !== "connected") {
    return <Message>Connect to a database to inspect its access model.</Message>;
  }
  if (supported === undefined) {
    return (
      <Message>
        <Spinner /> Checking access capabilities...
      </Message>
    );
  }
  if (!supported) {
    return <Message>This connection does not expose access inspection.</Message>;
  }
  if (isLoading) {
    return (
      <Message>
        <Spinner /> Inspecting roles and grants...
      </Message>
    );
  }
  if (isError || !overview) {
    return (
      <div className="flex items-center justify-between gap-3 px-3 py-3">
        <p className="m-0 flex items-center gap-1.5 text-[11px] text-[var(--c-red)]">
          <AlertTriangle className="h-3.5 w-3.5" /> Access inspection failed.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1 rounded-[3px] border border-border px-2 py-1 font-mono text-[10px] text-foreground/80 hover:bg-accent"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      <div className="px-3 py-2.5">
        <p className="m-0 text-[10px] uppercase tracking-wide text-muted-foreground">Identity</p>
        <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--c-green)]" /> {overview.identity}
        </p>
      </div>
      <AccessList title="Roles" empty="No database roles are active or visible.">
        {overview.roles.map((role) => (
          <li key={role.name} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-[11px] text-[var(--c-purple)]">{role.name}</span>
            {role.attributes.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {role.attributes.join(" · ")}
              </span>
            )}
          </li>
        ))}
      </AccessList>
      <AccessList title="Effective grants" empty="No grants are visible for this connection.">
        {overview.grants.map((grant, index) => (
          <li
            key={`${grant}-${index}`}
            className="break-all font-mono text-[10px] text-foreground/80"
          >
            {grant}
          </li>
        ))}
      </AccessList>
      <AccessList title="Access facts" empty="No additional access facts are available.">
        {overview.facts.map((fact) => (
          <li key={fact.label} className="grid grid-cols-[minmax(7rem,0.4fr)_1fr] gap-2">
            <span className="text-[10px] text-muted-foreground">{fact.label}</span>
            <span className="break-all font-mono text-[10px] text-foreground/80">{fact.value}</span>
          </li>
        ))}
      </AccessList>
      {overview.notices.length > 0 && (
        <div className="space-y-1 px-3 py-2.5">
          {overview.notices.map((notice) => (
            <p key={notice} className="m-0 flex gap-1.5 text-[10px] text-[var(--c-yellow)]">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {notice}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Message({ children }: { children: ReactNode }): ReactNode {
  return (
    <p className="m-0 flex items-center gap-1.5 px-3 py-3 text-[11px] text-muted-foreground">
      {children}
    </p>
  );
}

function AccessList({
  title,
  empty,
  children
}: {
  title: string;
  empty: string;
  children: ReactNode;
}): ReactNode {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div className="px-3 py-2.5">
      <p className="m-0 text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-[10px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">{children}</ul>
      )}
    </div>
  );
}
