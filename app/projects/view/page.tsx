import { Suspense } from "react";
import { ProjectOverview } from "@/components/project/project-overview";

// PRD 26 project overview. Query-param route (see component comment for the
// static-export rationale). Suspense wraps the useSearchParams read so the
// prerendered shell stays static.
export default function ProjectViewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading project...</p>
        </div>
      }
    >
      <ProjectOverview />
    </Suspense>
  );
}
