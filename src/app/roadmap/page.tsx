import { Suspense } from "react";
import { getPeopleDirectory, getRoadmap, getViewer } from "@/lib/projects";
import { getToday } from "@/lib/today";
import { getThemePref } from "@/lib/theme-server";
import { PRODUCT } from "@/lib/config";
import { ToastProvider } from "@/components/Toast";
import { RoadmapView } from "@/components/roadmap/RoadmapView";

export const metadata = { title: PRODUCT.name };

export default async function RoadmapPage() {
  const [{ quarters, teams, projects }, viewer, themePref, today, directory] = await Promise.all([
    getRoadmap(),
    getViewer(),
    getThemePref(),
    getToday(),
    getPeopleDirectory(),
  ]);

  return (
    <ToastProvider>
      {/* useSearchParams needs a Suspense boundary; the data is already here. */}
      <Suspense>
        <RoadmapView
          quarters={quarters}
          teams={teams}
          projects={projects}
          directory={directory}
          canEdit={viewer.canEdit}
          today={today}
          themePref={themePref}
        />
      </Suspense>
    </ToastProvider>
  );
}
