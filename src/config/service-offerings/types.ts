export interface OfferingPain {
  title: string;
  body: string;
}

export interface OfferingStep {
  title: string;
  body: string;
}

export interface OfferingProof {
  label: string;
  href: string;
  note: string;
}

export interface OfferingFaq {
  question: string;
  answer: string;
}

export interface Offering {
  /** Position in the program list on LAC-8096. */
  number: number;
  slug: string;
  /** The offering line. Rendered as the one H1. */
  title: string;
  /** Short name for breadcrumbs, related-links and the hub. */
  shortName: string;
  /** Pillars link to their children; children link back to their pillar. */
  pillar: boolean;
  /** Slug of the pillar this page belongs to. Absent on pillars. */
  parent?: string;
  metaTitle: string;
  metaDescription: string;
  /** One sentence under the H1 that says who this is for. */
  intro: string;
  /** Label above the pains section. */
  painHeading: string;
  pains: OfferingPain[];
  /** What the buyer has in hand at the end. */
  outcomes: string[];
  processHeading: string;
  process: OfferingStep[];
  /** Real /work case studies or shipped projects only. */
  proof: OfferingProof[];
  faqs: OfferingFaq[];
  /** Slugs of other offerings to link to (siblings or children). */
  related: string[];
  /** Date the page went live, ISO yyyy-mm-dd. Feeds sitemap lastModified. */
  publishedAt: string;
}
