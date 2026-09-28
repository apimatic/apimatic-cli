import { DocsDescription, DocsTitle, MarkdownCopyButton, ViewOptionsPopover } from 'fumadocs-ui/layouts/notebook/page';
import { usePathname } from 'fumadocs-core/framework';
import { portal } from '@/lib/portal';

interface PageHeaderProps {
  title?: string;
  description?: string | null;
  markdownUrl: string;
}

export function PageHeader({ title, description, markdownUrl }: Readonly<PageHeaderProps>) {
  const pathname = usePathname();
  // Named, or the popover reads `window.location.href` and sends the reader's query and hash on.
  const pageUrl = typeof window === 'undefined' ? pathname : new URL(pathname, window.location.origin).toString();

  return (
    <>
      <DocsTitle>{title}</DocsTitle>
      {description ? <DocsDescription className="mb-0">{description}</DocsDescription> : null}
      <div className="flex flex-row gap-2 items-center border-b pt-4 pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        {/* Links to an external AI vendor, so a white-labelled portal can turn it off. */}
        {portal.pageActions ? <ViewOptionsPopover markdownUrl={markdownUrl} pageUrl={pageUrl} /> : null}
      </div>
    </>
  );
}
