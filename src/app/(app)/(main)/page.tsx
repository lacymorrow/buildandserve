import CallToAction from "@/app/(app)/(main)/_components/call-to-action";
import FAQsTwo from "@/app/(app)/(main)/_components/faqs-2";
import IntegrationsSection from "@/app/(app)/(main)/_components/integrations-7";
import FeaturesSection1 from "@/app/(app)/(main)/_components/features-8";
import FeaturesSection from "@/app/(app)/(main)/_components/features-eleven";
import FeaturesSection2 from "@/app/(app)/(main)/_components/features-six";
import HeroSection from "@/app/(app)/(main)/_components/hero-section";
import { CaseStudyMarquee } from "@/app/(app)/(main)/_components/case-study-marquee";
import { JsonLd } from "@/components/primitives/json-ld";
import Script from "next/script";
import { siteConfig } from "@/config/site-config";

export default function BuildAndServePage() {
  return (
    <div className="min-h-screen container mx-auto">
      <JsonLd organization website />
      <Script id="ld-home-webpage" type="application/ld+json" strategy="worker">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          "@id": `${siteConfig.url}/#webpage`,
          url: siteConfig.url,
          name: siteConfig.title,
          description: siteConfig.description,
          isPartOf: { "@id": `${siteConfig.url}/#website` },
          inLanguage: siteConfig.metadata.locale,
          primaryImageOfPage: {
            "@type": "ImageObject",
            url: siteConfig.ogImage,
            width: siteConfig.metadata.openGraph.imageWidth,
            height: siteConfig.metadata.openGraph.imageHeight,
          },
        })}
      </Script>
      <HeroSection />
      <FeaturesSection />
      <CaseStudyMarquee />
      <FeaturesSection1 />
      <FeaturesSection2 />
      <IntegrationsSection />
      {/* <PricingSection /> */}
      <div id="faq" aria-hidden="true" />
      <FAQsTwo />
      <div id="cta" aria-hidden="true" />
      <CallToAction />
    </div>
  );
}
