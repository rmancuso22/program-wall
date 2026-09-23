import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getPeopleDirectory, getProject, getProjectMeetings, getViewer } from "@/lib/projects";
import { TZ_COOKIE, getToday } from "@/lib/today";
import { MeetingsView } from "@/components/meetings/MeetingsView";
import styles from "@/components/workspace/workspace.module.scss";

type Props = { params: Promise<{ key: string }> };

export default async function MeetingsPage({ params }: Props) {
  const { key } = await params;
  const data = await getProject(decodeURIComponent(key));
  if (!data) notFound();
  const { project } = data;

  const [meetings, directory, viewer, today, jar] = await Promise.all([
    getProjectMeetings(project.id),
    getPeopleDirectory(),
    getViewer(),
    getToday(),
    cookies(),
  ]);
  const tz = jar.get(TZ_COOKIE)?.value;
  let viewerTz = "America/Chicago";
  if (tz) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: decodeURIComponent(tz) });
      viewerTz = decodeURIComponent(tz);
    } catch {}
  }

  return (
    <section className={styles.section} aria-label="Meetings">
      <MeetingsView
        project={{ id: project.id, key: project.key, people: project.people, teamLeads: project.teamLeads }}
        series={meetings.series}
        occurrences={meetings.occurrences}
        agenda={meetings.agenda}
        attendance={meetings.attendance}
        actions={meetings.actions}
        directory={directory}
        serverToday={today}
        viewerTz={viewerTz}
        profileId={viewer.userId}
        canEdit={viewer.canEdit}
      />
    </section>
  );
}
