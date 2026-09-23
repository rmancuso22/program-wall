import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects";
import { getToday } from "@/lib/today";
import { ReviewDoc } from "@/components/design/ReviewDoc";
import styles from "@/components/workspace/workspace.module.scss";
import designStyles from "@/components/design/design.module.scss";

type Props = { params: Promise<{ key: string }> };

export default async function DesignPage({ params }: Props) {
  const { key } = await params;
  const data = await getProject(decodeURIComponent(key));
  if (!data) notFound();
  const today = await getToday();

  return (
    <section className={styles.section} aria-labelledby="design-heading">
      <div className={styles.secHead}>
        <h2 id="design-heading">Design</h2>
        <span className={styles.secSub}>The SRB and the API spec, reviewed as pull requests in GitHub Enterprise</span>
      </div>
      {data.reviews.length === 0 ? (
        <p className={styles.placeholder}>No design documents for this project yet.</p>
      ) : (
        <div className={designStyles.docs}>
          {data.reviews.map((doc) => (
            <ReviewDoc key={doc.id} doc={doc} projectName={data.project.name} today={today} />
          ))}
        </div>
      )}
    </section>
  );
}
