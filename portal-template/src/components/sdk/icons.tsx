import type { ReactNode, SVGProps } from 'react';
import { ArrowRight, BookOpen, Code, Download, ExternalLink, Package, Terminal } from 'lucide-react';
import type { SdkActionIconName, SdkIconName } from './types';

// Brand marks, deliberately simple: a coloured chip or outline that reads at the
// 16px the card renders them at. Neutral strokes use `currentColor` so they pick
// up the card's muted foreground in both themes. Swap any of these for a real
// logo by passing a `ReactNode` as the `icon` prop instead of a name.

type IconProps = SVGProps<SVGSVGElement>;

const LABEL_FONT = 'ui-sans-serif, system-ui, sans-serif';

function ChipIcon({ label, fill, color = '#fff', size = 10, ...props }: IconProps & {
  label: string;
  fill: string;
  color?: string;
  size?: number;
}) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <rect width="24" height="24" rx="4" fill={fill} />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={LABEL_FONT}
        fontSize={size}
        fontWeight="700"
        fill={color}
      >
        {label}
      </text>
    </svg>
  );
}

function TypeScriptIcon(props: IconProps) {
  return <ChipIcon label="TS" fill="#3178C6" {...props} />;
}

function JavaScriptIcon(props: IconProps) {
  return <ChipIcon label="JS" fill="#F7DF1E" color="#1a1a1a" {...props} />;
}

function DotNetIcon(props: IconProps) {
  return <ChipIcon label=".N" fill="#512BD4" {...props} />;
}

function CSharpIcon(props: IconProps) {
  return <ChipIcon label="C#" fill="#68217A" {...props} />;
}

function GoIcon(props: IconProps) {
  return <ChipIcon label="Go" fill="#00ADD8" {...props} />;
}

function PythonIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        d="M12 2.8c-3 0-4.2 1.2-4.2 3v2.4h4.4v.9H6.3c-2 0-3.4 1.3-3.4 4s1.3 3.9 3.1 3.9h1.6v-2.7c0-2 1.5-3.4 3.5-3.4h4c1.7 0 2.9-1.2 2.9-2.8V5.8c0-1.6-1.4-3-3.6-3H12Z"
        fill="#3776AB"
      />
      <path
        d="M12 21.2c3 0 4.2-1.2 4.2-3v-2.4h-4.4v-.9h5.9c2 0 3.4-1.3 3.4-4s-1.3-3.9-3.1-3.9h-1.6v2.7c0 2-1.5 3.4-3.5 3.4h-4c-1.7 0-2.9 1.2-2.9 2.8v2.3c0 1.6 1.4 3 3.6 3H12Z"
        fill="#FFD43B"
      />
      <circle cx="9.4" cy="5.5" r="1" fill="#fff" />
      <circle cx="14.6" cy="18.5" r="1" fill="#30303080" />
    </svg>
  );
}

function JavaIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M11.5 1.5c2.4 2 3 3.7 1.2 5.5-1.9 1.9-2.4 3.2-1.2 4.7"
        stroke="#E76F51"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M3.5 13h12v4.5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V13Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M15.8 14.4h1.7a2.3 2.3 0 0 1 0 4.6h-1.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PhpIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <ellipse cx="12" cy="12" rx="10.5" ry="6" stroke="#777BB4" strokeWidth="1.4" />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily={LABEL_FONT}
        fontSize="7"
        fontWeight="700"
        fontStyle="italic"
        fill="#777BB4"
      >
        php
      </text>
    </svg>
  );
}

function RubyIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M3 9.5 12 3l9 6.5-9 12-9-12Z" stroke="#CC342D" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M3 9.5h18M12 3v18.5M7.4 9.5 12 21.5l4.6-12" stroke="#CC342D" strokeWidth="1" opacity="0.7" />
    </svg>
  );
}

const sdkIcons: Record<SdkIconName, (props: IconProps) => ReactNode> = {
  typescript: TypeScriptIcon,
  javascript: JavaScriptIcon,
  python: PythonIcon,
  java: JavaIcon,
  dotnet: DotNetIcon,
  csharp: CSharpIcon,
  php: PhpIcon,
  ruby: RubyIcon,
  go: GoIcon,
};

const actionIcons: Record<SdkActionIconName, (props: IconProps) => ReactNode> = {
  download: Download,
  'arrow-right': ArrowRight,
  external: ExternalLink,
  book: BookOpen,
  code: Code,
  terminal: Terminal,
};

function isKeyOf<T extends Record<string, unknown>>(record: T, value: unknown): value is Extract<keyof T, string> {
  return typeof value === 'string' && value in record;
}

/**
 * Resolves the `icon` prop of an {@link import('./types').Sdk}: a known brand
 * name becomes its mark, anything else is returned untouched.
 */
export function resolveSdkIcon(icon: ReactNode): ReactNode {
  if (icon === undefined || icon === null) return null;
  if (isKeyOf(sdkIcons, icon)) {
    const Icon = sdkIcons[icon];
    return <Icon aria-hidden />;
  }
  return icon;
}

/** Same, for the glyph an action renders after its label. */
export function resolveActionIcon(icon: ReactNode): ReactNode {
  if (icon === undefined || icon === null) return null;
  if (isKeyOf(actionIcons, icon)) {
    const Icon = actionIcons[icon];
    return <Icon className="size-3.5 shrink-0" aria-hidden />;
  }
  return icon;
}

export { Package as FallbackSdkIcon };
