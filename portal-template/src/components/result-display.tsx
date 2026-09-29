import { useEffect, useMemo, useState } from 'react';
import { DefaultResultDisplay, type ResultDisplayProps } from 'fumadocs-openapi/playground/client';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { Download } from 'lucide-react';
import { downloadName, isBinaryBody, mediaTypeOf } from '@/lib/binary-download';

// Fumadocs' own result panel, with a way to save a binary body it can only count the bytes of.
export function ResultDisplay(props: Readonly<ResultDisplayProps>) {
  const { data } = props;
  const binary = data.type !== 'client_error' ? data : undefined;
  const mediaType = binary ? mediaTypeOf(binary.headers.get('Content-Type')) : '';

  if (!binary || !isBinaryBody(mediaType, binary.body.byteLength)) return <DefaultResultDisplay {...props} />;
  return (
    <div>
      <DefaultResultDisplay {...props} />
      <BinaryDownload body={binary.body} headers={binary.headers} mediaType={mediaType} />
    </div>
  );
}

function BinaryDownload({
  body,
  headers,
  mediaType
}: Readonly<{ body: ArrayBuffer; headers: Headers; mediaType: string }>) {
  const [href, setHref] = useState<string | null>(null);
  const filename = useMemo(() => downloadName(headers, mediaType), [headers, mediaType]);

  useEffect(() => {
    const url = URL.createObjectURL(new Blob([body], { type: mediaType }));
    setHref(url);
    return () => URL.revokeObjectURL(url);
  }, [body, mediaType]);

  if (!href) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-fd-secondary text-fd-secondary-foreground">
      <span className="min-w-0 me-auto truncate text-xs font-mono text-fd-muted-foreground">{filename}</span>
      <a
        href={href}
        download={filename}
        className={buttonVariants({ size: 'sm', variant: 'outline', className: 'gap-1.5 shrink-0' })}
      >
        <Download className="size-3.5" />
        Download
      </a>
    </div>
  );
}
