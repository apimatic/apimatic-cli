import { useEffect, useMemo, useState } from 'react';
import { DefaultResultDisplay, type ResultDisplayProps } from 'fumadocs-openapi/playground/client';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { Download } from 'lucide-react';
import { responseFileOf } from '@/lib/response-file';

export function ResultDisplayWithDownload(props: Readonly<ResultDisplayProps>) {
  const { data } = props;
  const file = useMemo(() => (data.type === 'response' ? responseFileOf(data) : undefined), [data]);

  if (!file) return <DefaultResultDisplay {...props} />;
  return (
    <div>
      <DefaultResultDisplay {...props} />
      <DownloadRow file={file} />
    </div>
  );
}

function DownloadRow({ file }: Readonly<{ file: File }>) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setHref(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!href) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-fd-secondary text-fd-secondary-foreground">
      <span className="min-w-0 me-auto truncate text-xs font-mono text-fd-muted-foreground">{file.name}</span>
      <a
        href={href}
        download={file.name}
        className={buttonVariants({ size: 'sm', variant: 'outline', className: 'gap-1.5 shrink-0' })}
      >
        <Download className="size-3.5" />
        Download
      </a>
    </div>
  );
}
