import { ArrowRight, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScheduleCallModal } from "@/components/modals/schedule-call-modal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { constructMetadata } from "@/config/metadata";
import { routes } from "@/config/routes";
import { getLinked, getOffering, offerings } from "@/config/service-offerings";
import { siteConfig } from "@/config/site-config";
import { OfferingJsonLd } from "../_components/offering-json-ld";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Only slugs in the offering config exist. Anything else is a real 404.
export const dynamicParams = false;

export const generateStaticParams = () => offerings.map((o) => ({ slug: o.slug }));

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { slug } = await params;
  const offering = getOffering(slug);
  if (!offering) return {};

  const ogUrl = `/og?${new URLSearchParams({
    title: offering.title,
    description: offering.metaDescription,
  }).toString()}`;

  return constructMetadata({
    path: `${routes.services}/${offering.slug}`,
    title: { absolute: offering.metaTitle },
    description: offering.metaDescription,
    images: [
      {
        url: ogUrl,
        width: siteConfig.metadata.openGraph.imageWidth,
        height: siteConfig.metadata.openGraph.imageHeight,
        alt: offering.title,
      },
    ],
  });
};

const ServiceOfferingPage = async ({ params }: PageProps) => {
  const { slug } = await params;
  const offering = getOffering(slug);
  if (!offering) notFound();

  const linked = getLinked(offering);

  return (
    <div className="min-h-screen">
      <OfferingJsonLd offering={offering} />

      {/* Hero */}
      <section className="pt-24 pb-16 md:pt-36 md:pb-20">
        <div className="mx-auto max-w-5xl px-6">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link href="/" className="hover:text-foreground">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href={routes.services} className="hover:text-foreground">
                  Services
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-foreground">
                {offering.shortName}
              </li>
            </ol>
          </nav>
          <h1 className="mt-8 max-w-3xl text-4xl font-medium tracking-tight text-balance md:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
            {offering.title}
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {offering.intro}
          </p>
          <div className="mt-10 flex items-center gap-6">
            <ScheduleCallModal
              trigger={
                <Button size="lg" className="h-12 rounded-full pr-3 pl-5 text-base">
                  <span className="text-nowrap">Book a free call</span>
                  <ChevronRight className="ml-1" />
                </Button>
              }
            />
            <span className="hidden text-sm text-muted-foreground sm:inline">
              30 minutes, no commitment
            </span>
          </div>
        </div>
      </section>

      {/* Pain */}
      <section className="border-t py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-medium md:text-3xl">{offering.painHeading}</h2>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-2">
            {offering.pains.map((pain) => (
              <div key={pain.title} className="bg-card p-8 md:p-10">
                <h3 className="text-lg font-medium">{pain.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{pain.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="border-t py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6 md:grid md:grid-cols-[1fr_2fr] md:gap-16">
          <h2 className="text-2xl font-medium md:text-3xl">What you get</h2>
          <ul className="mt-8 space-y-4 md:mt-0">
            {offering.outcomes.map((outcome) => (
              <li
                key={outcome}
                className="border-b border-dashed pb-4 leading-relaxed text-muted-foreground"
              >
                {outcome}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Process */}
      <section className="border-t bg-muted/30 py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-medium md:text-3xl">{offering.processHeading}</h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-2">
            {offering.process.map((step, index) => (
              <li key={step.title}>
                <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
                  Step {index + 1}
                </p>
                <h3 className="mt-2 text-lg font-medium">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Proof */}
      <section className="border-t py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-medium md:text-3xl">Work behind this</h2>
          <div
            className={`mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border ${offering.proof.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}
          >
            {offering.proof.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex flex-col bg-card p-8 transition-colors hover:bg-muted/40"
              >
                <h3 className="text-lg font-medium">{item.label}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {item.note}
                </p>
                <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium">
                  See the work
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6 md:grid md:grid-cols-[1fr_2fr] md:gap-16">
          <h2 className="text-2xl font-medium md:text-3xl">Common questions</h2>
          <Accordion type="single" collapsible className="mt-8 w-full md:mt-0">
            {offering.faqs.map((faq, index) => (
              <AccordionItem
                key={faq.question}
                value={`faq-${index}`}
                className="border-b border-dashed"
              >
                <AccordionTrigger className="cursor-pointer py-5 text-left text-[15px] hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="pb-2 leading-relaxed text-muted-foreground">{faq.answer}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Related */}
      {linked.length > 0 && (
        <section className="border-t py-20 md:py-28">
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="text-2xl font-medium md:text-3xl">Related services</h2>
            <ul className="mt-10 divide-y border-y">
              {linked.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`${routes.services}/${item.slug}`}
                    className="group flex items-center justify-between gap-6 py-5"
                  >
                    <span className="text-lg font-medium">{item.title}</span>
                    <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="pb-20 md:pb-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="rounded-3xl bg-neutral-950 px-8 py-16 md:px-16 md:py-24">
            <h2 className="max-w-lg text-3xl font-medium text-white md:text-4xl">
              Tell us what you&apos;re working on.
            </h2>
            <p className="mt-4 max-w-xl text-neutral-400">
              A 30-minute call with the people who would do the work. If we&apos;re not the right
              fit, we&apos;ll say so.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <ScheduleCallModal
                trigger={
                  <Button size="lg" className="bg-white text-black hover:bg-neutral-200">
                    <span className="text-nowrap">Book a free call</span>
                    <ChevronRight className="ml-1" />
                  </Button>
                }
              />
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <Link href={routes.contact}>Send us a message</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ServiceOfferingPage;
