import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ContentLink } from "@/shared/ui/AppLink";

type Props = {
  /** Markdown escrito desde el admin. El HTML embebido se descarta (ADR-033). */
  source: string;
  className?: string;
};

// Cuerpos editables (páginas, anuncios, eventos, presentaciones de comité) con la prosa de marca.
export function Markdown({ source, className = "" }: Props) {
  return (
    <div className={`prosa ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ node: _node, ...props }) => <ContentLink {...props} />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
