import { Icon } from "@/components/assets/icon";
import { siteConfig } from "@/config/site-config";

/**
 * The wordmark drops "and" to Geist Mono, which is what ties it to the mark:
 * the same conjunction, called out twice. Spec: docs/design/brand/README.md
 *
 * Live text rather than an outline, so it stays selectable and translatable.
 * Titles without a conjunction fall through to plain text unchanged.
 */
const Wordmark = () => {
  const parts = siteConfig.title.split(/\s+and\s+/i);

  if (parts.length !== 2) {
    return <span>{siteConfig.title}</span>;
  }

  return (
    <span>
      {parts[0]}{" "}
      <span className="font-mono text-[0.8em] font-normal text-muted-foreground">and</span>{" "}
      {parts[1]}
    </span>
  );
};

export const Logo = (props: React.ComponentProps<typeof Icon>) => {
  return (
    <div className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.04em]">
      <Icon {...props} /> <Wordmark />
    </div>
  );
};
