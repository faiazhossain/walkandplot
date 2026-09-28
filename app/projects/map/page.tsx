import { Suspense } from "react";
import { Workspace } from "@/components/capture/workspace";

// PRD 12: the mapping workspace. Query-param route (static-export rationale
// in project-overview.tsx); Suspense wraps the useSearchParams read.
export default function MapWorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading floor...</p>
        </div>
      }
    >
      <Workspace />
    </Suspense>
  );
}
