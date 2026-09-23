import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./design.module.scss";

// Renders a review document's markdown with a table of contents built from
// its level-two headings. Raw HTML in the markdown is not rendered.

function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: React.ReactNode } }).props.children);
  }
  return "";
}

export function MarkdownDoc({ markdown, idPrefix }: { markdown: string; idPrefix: string }) {
  const headings = [...markdown.matchAll(/^## +(.+)$/gm)].map((m) => {
    const text = m[1].trim();
    return { text, id: `${idPrefix}-${slug(text)}` };
  });

  return (
    <div className={styles.reader}>
      {headings.length > 0 && (
        <nav aria-label="Document sections">
          <ul className={styles.toc}>
            {headings.map((h) => (
              <li key={h.id}>
                <a href={`#${h.id}`}>{h.text}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div className={styles.prose}>
        {markdown.trim() ? (
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ children }) => <h2 id={`${idPrefix}-${slug(textOf(children))}`}>{children}</h2>,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noreferrer noopener">
                  {children}
                </a>
              ),
            }}
          >
            {markdown}
          </Markdown>
        ) : (
          <p className={styles.note}>No document text yet.</p>
        )}
      </div>
    </div>
  );
}
