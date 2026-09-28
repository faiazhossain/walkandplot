import { AppBar } from "@/components/common/app-bar";
import { NewProjectForm } from "@/components/project/new-project-form";

// PRD 10: create project screen.
export default function NewProjectPage() {
  return (
    <>
      <AppBar title="New Project" back="/" />
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-4">
        <NewProjectForm />
      </main>
    </>
  );
}
