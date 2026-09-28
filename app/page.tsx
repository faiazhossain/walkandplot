import { HomeView } from "@/components/project/home-view";

// PRD 9: first-run shows the intro hero; returning users get the project
// list. The branch happens client-side after the local DB read.
export default function HomePage() {
  return <HomeView />;
}
