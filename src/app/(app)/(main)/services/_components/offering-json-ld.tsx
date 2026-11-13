import type { Offering } from "@/config/service-offerings";
import { siteConfig } from "@/config/site-config";

interface OfferingJsonLdProps {
  offering: Offering;
}

// Escape "<" so FAQ text can never close the script tag.
const serialize = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

export const OfferingJsonLd = ({ offering }: OfferingJsonLdProps) => {
  const url = `${siteConfig.url}/services/${offering.slug}`;

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${url}#service`,
        name: offering.title,
        description: offering.metaDescription,
        url,
        serviceType: offering.shortName,
        provider: {
          "@type": "Organization",
          name: siteConfig.title,
          url: siteConfig.url,
        },
        areaServed: "US",
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: offering.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumbs`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url },
          {
            "@type": "ListItem",
            position: 2,
            name: "Services",
            item: `${siteConfig.url}/services`,
          },
          { "@type": "ListItem", position: 3, name: offering.shortName, item: url },
        ],
      },
    ],
  };

  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD built from static config, "<" escaped in serialize()
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialize(graph) }} />
  );
};
