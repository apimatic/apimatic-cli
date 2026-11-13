const METHOD_COLORS: Record<string, string> = {
  PUT: 'text-yellow-600 dark:text-yellow-400',
  PATCH: 'text-orange-600 dark:text-orange-400',
  POST: 'text-blue-600 dark:text-blue-400',
  DELETE: 'text-red-600 dark:text-red-400'
};

/** Fumadocs' endpoint bar, which it shows while the playground loads but does not export: the method and the route. */
export function EndpointBar({ method, route }: Readonly<{ method: string; route: string }>) {
  const verb = method.toUpperCase();
  return (
    <div className="not-prose flex min-h-11 items-center gap-3 rounded-xl border bg-fd-card p-1.5 ps-3.5 text-sm text-fd-card-foreground">
      <span className={`font-mono font-medium text-xs ${METHOD_COLORS[verb] ?? 'text-green-600 dark:text-green-400'}`}>
        {verb}
      </span>
      <div className="flex min-w-0 flex-1 items-center overflow-x-auto font-mono text-[0.8125rem] text-nowrap [scrollbar-width:none]">
        {route.split(/(\{[^}]*\}|\/)/).map((part, index) => {
          if (index % 2 === 0) return part;
          if (part === '/') {
            return (
              <span key={index} className="text-fd-muted-foreground">
                /
              </span>
            );
          }
          return (
            <span key={index} className="rounded-md bg-fd-primary/10 px-1 text-fd-primary">
              {part}
            </span>
          );
        })}
      </div>
    </div>
  );
}
