import { AppBar } from "@/components/common/app-bar";
import { SettingsForm } from "@/components/settings/settings-form";

// PRD 26: settings - step length, theme, storage usage, about.
export default function SettingsPage() {
  return (
    <>
      <AppBar title="Settings" back="/" />
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-4">
        <SettingsForm />
      </main>
    </>
  );
}
