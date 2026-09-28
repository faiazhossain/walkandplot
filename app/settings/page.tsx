import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// PRD 26: settings - step length, theme, storage usage, about. Wired in
// Phase 2 (step length feeds the Set Real Length helper, PRD 14).
export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-10">
      <h1 className="font-heading text-2xl font-bold tracking-tight">Settings</h1>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Step length, theme and storage usage arrive with local storage in Phase 2.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
