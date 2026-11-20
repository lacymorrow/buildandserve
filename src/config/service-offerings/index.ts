import { aiFeatures, aiTools } from "./ai-tools";
import { codebaseTakeover, figmaToProduct, founderApps, mvp30, rescueProjects } from "./founders";
import type { Offering } from "./types";
import { marketingSites, websites } from "./websites";

export type { Offering } from "./types";

// Add new offerings here. Order is the order shown on the /services hub.
export const offerings: Offering[] = [
  aiTools,
  aiFeatures,
  founderApps,
  mvp30,
  figmaToProduct,
  rescueProjects,
  codebaseTakeover,
  websites,
  marketingSites,
];

export const getOffering = (slug: string): Offering | undefined =>
  offerings.find((o) => o.slug === slug);

export const getChildren = (pillarSlug: string): Offering[] =>
  offerings.filter((o) => o.parent === pillarSlug);

export const getPillar = (offering: Offering): Offering | undefined =>
  offering.parent ? getOffering(offering.parent) : undefined;

/** Pages this one should link to: its pillar, its siblings, or its children. */
export const getLinked = (offering: Offering): Offering[] => {
  const seen = new Set<string>([offering.slug]);
  const out: Offering[] = [];
  const add = (o: Offering | undefined) => {
    if (o && !seen.has(o.slug)) {
      seen.add(o.slug);
      out.push(o);
    }
  };
  add(getPillar(offering));
  for (const child of getChildren(offering.slug)) add(child);
  for (const slug of offering.related) add(getOffering(slug));
  return out;
};
