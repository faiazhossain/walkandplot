import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// PRD 24: every screen defines its empty state - no dead end without a next
// action (P4).

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-8" aria-hidden />
      </div>
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      <p className="max-w-xs text-sm text-muted-foreground">{body}</p>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
