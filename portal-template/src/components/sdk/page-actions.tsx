import { cn } from "@/lib/cn";
import { ActionLink } from "./action-link";
import { SdkIconChip } from "./icon-chip";
import { FallbackSdkIcon, resolveSdkIcon } from "./icons";
import type { SdkAction, SdkActionInput, SdkActionsProps } from "./types";
import { isExternal, isPresent } from "./utils";

// The bar under a language page's title: the package's identity on the left,
// its three links on the right. The slots are fixed — every SDK page offers the
// same registry / repository / download triple — so a page supplies hrefs and
// everything visual comes from here. Order matches the design: the primary
// download button sits last, at the end of the row.
const slots = ["package", "source", "download"] as const;
type Slot = (typeof slots)[number];

const slotDefaults: Record<Slot, Omit<SdkAction, "href">> = {
  package: { label: "Package", variant: "secondary", icon: "external" },
  source: { label: "Source", variant: "secondary", icon: "external" },
  download: {
    label: "Download SDK",
    variant: "primary",
    icon: "download",
    iconPosition: "start",
  },
};

// Smaller than the card buttons' default so three of them sit on one line next
// to the identity block without crowding it.
const sizeClass = "gap-1.5 px-3 py-1.5 text-sm";

function resolveSlot(
  slot: Slot,
  input: SdkActionInput | undefined,
): SdkAction | null {
  if (!input) return null;
  return {
    ...slotDefaults[slot],
    ...(typeof input === "string" ? { href: input } : input),
  };
}

export function SdkActions({
  icon,
  registry,
  version,
  actions,
  className,
  ...inputs
}: SdkActionsProps) {
  // `actions` replaces the slots outright; otherwise each slot renders only if
  // the page gave it an href, so a language with no public repo simply drops it.
  const resolved =
    actions ??
    slots
      .map((slot) => resolveSlot(slot, inputs[slot]))
      .filter((action): action is SdkAction => action !== null);

  const hasIdentity =
    isPresent(icon) || isPresent(registry) || isPresent(version);
  if (!hasIdentity && resolved.length === 0) return null;

  return (
    // A layout row, not a card: `Card` stacks icon / title / description as
    // blocks and wraps its title in an `h3`, so it would need overriding rather
    // than using. The surface tokens are kept identical to `Card`'s on purpose.
    <div
      className={cn(
        "not-prose my-2 flex flex-wrap items-center gap-x-6 gap-y-4",
        "rounded-xl border bg-fd-card p-3.5 text-fd-card-foreground",
        className,
      )}
    >
      {hasIdentity ? (
        <div className="flex min-w-0 items-center gap-3">
          <SdkIconChip className="size-10">
            {resolveSdkIcon(icon) ?? <FallbackSdkIcon aria-hidden />}
          </SdkIconChip>
          <div className="min-w-0">
            {isPresent(registry) ? (
              <p className="truncate text-sm leading-tight font-semibold">
                {registry}
              </p>
            ) : null}
            {isPresent(version) ? (
              <p className="mt-1 truncate font-mono text-xs text-fd-muted-foreground">
                {version}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {resolved.length > 0 ? (
        // Only pushed right when there is an identity block to push away
        // from; on its own the row reads better flush with the left edge.
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            hasIdentity && "sm:ml-auto",
          )}
        >
          {resolved.map((action, index) => (
            <ActionLink
              key={action.href}
              action={action}
              variant={
                action.variant ??
                (index === resolved.length - 1 ? "primary" : "secondary")
              }
              defaultIcon={isExternal(action) ? "external" : undefined}
              className={sizeClass}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
