import { notFound } from "next/navigation";
import { getPeopleDirectory, getProject, getProjectStickies, getViewer } from "@/lib/projects";
import { DeliveryMap } from "@/components/stickies/DeliveryMap";
import styles from "@/components/workspace/workspace.module.scss";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<{ sticky?: string }> };

export default async function DeliveryMapPage({ params, searchParams }: Props) {
  const { key } = await params;
  const { sticky } = await searchParams;
  const data = await getProject(decodeURIComponent(key));
  if (!data) notFound();
  const { project } = data;

  const [initial, directory, viewer] = await Promise.all([getProjectStickies(project.id), getPeopleDirectory(), getViewer()]);

  return (
    <section className={styles.section} aria-label="Delivery Map">
      <DeliveryMap
        key={sticky ?? ""}
        project={{ id: project.id, key: project.key, people: project.people, teamLeads: project.teamLeads }}
        initial={initial}
        directory={directory}
        canEdit={viewer.canEdit}
        selectId={sticky ?? null}
      />
    </section>
  );
}
