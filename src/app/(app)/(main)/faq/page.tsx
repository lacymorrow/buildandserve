import type { Metadata } from "next";
import FAQs from "@/app/(app)/(main)/faq/_components/faqs";
import { constructMetadata } from "@/config/metadata";
import { routes } from "@/config/routes";
import { siteConfig } from "@/config/site-config";

export const metadata: Metadata = constructMetadata({
  path: routes.faq,
  title: `FAQ | ${siteConfig.title}`,
  description: `Frequently asked questions about ${siteConfig.title} services, pricing, and process.`,
});

export default function FAQPage() {
  return <FAQs />;
}
