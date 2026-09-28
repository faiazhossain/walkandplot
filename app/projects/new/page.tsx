import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// PRD 10: New Project form. Submission wiring arrives with Phase 2.
export default function NewProjectPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-10">
      <h1 className="font-heading text-2xl font-bold tracking-tight">New Project</h1>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Building details</CardTitle>
          <CardDescription>Name it, then create your first floor.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="building-name">Building name</Label>
            <Input
              id="building-name"
              name="building-name"
              placeholder="ABC Shopping Mall"
              disabled
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="building-address">Address or description (optional)</Label>
            <Input
              id="building-address"
              name="building-address"
              placeholder="Street, area, city"
              disabled
            />
          </div>
          <Button type="button" disabled>
            Create Project
          </Button>
          <p className="text-xs text-muted-foreground/70">
            Form logic ships with local storage in the next build.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
