import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// PRD 9: returning users land on the project list. Data wiring arrives with
// Phase 2 (Dexie repositories); until then this is the shell with its empty state.
export default function ProjectsPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 py-10">
      <header>
        <h1 className="font-heading text-2xl font-bold tracking-tight">My Projects</h1>
        <p className="text-sm text-muted-foreground">No account - everything on this device.</p>
      </header>

      <Card className="border-dashed dot-grid">
        <CardHeader>
          <CardTitle>No projects yet</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Create a project, then map its first floor by walking it and plotting as you go.
          </p>
          <Button disabled>New Project</Button>
          <p className="text-xs text-muted-foreground/70">
            Project creation ships with local storage in the next build.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
