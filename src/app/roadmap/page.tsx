import { Suspense } from "react";
import { getRoadmap, getViewer } from "@/lib/projects";
import { getToday } from "@/lib/today";
import { getThemePref } from "@/lib/theme-server";
import { PRODUCT } from "@/lib/config";
import { ToastProvider } from "@/components/Toast";
import { RoadmapView } from "@/components/roadmap/RoadmapView";

export const metadata = { title: PRODUCT.name };

export default async function RoadmapPage() {
  const [{ quarters, teams, projects }, viewer, themePref, today] = await Promise.all([
    getRoadmap(),
    getViewer(),
    getThemePref(),
    getToday(),
  ]);

  return (
    <ToastProvider>
      {/* useSearchParams needs a Suspense boundary; the data is already here. */}
      <Suspense>
        <RoadmapView
          quarters={quarters}
          teams={teams}
          projects={projects}
          canEdit={viewer.canEdit}
          today={today}
          themePref={themePref}
        />
      </Suspense>
    </ToastProvider>
  );
}
