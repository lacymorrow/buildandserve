import { Check, ChevronRight, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ScheduleCallModal } from "@/components/modals/schedule-call-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { constructMetadata } from "@/config/metadata";
import { routes } from "@/config/routes";

export const metadata: Metadata = constructMetadata({
  title: "Pricing | Build And Serve",
  description:
    "Transparent pricing for web development, maintenance care plans, managed hosting, SEO, AI implementation, and AI orchestration. Project floors, monthly plans, and hourly rates — no surprises.",
});

const projectPricing = [
  {
    id: "starter",
    title: "Starter site",
    detail: "ShipKit-based, up to ~8 pages, standard design",
    price: "$7,500–$12,000",
  },
  {
    id: "business",
    title: "Business site",
    detail: "Custom design, CMS, integrations, SEO foundations",
    price: "$15,000–$30,000",
  },
  {
    id: "webapp",
    title: "Custom web app / MVP",
    detail: "Full-stack product build: auth, payments, dashboards, APIs",
    price: "$35,000–$75,000",
  },
  {
    id: "ecom-standard",
    title: "E-commerce (standard)",
    detail: "Shopify or standard storefront build",
    price: "$12,000–$25,000",
  },
  {
    id: "ecom-custom",
    title: "E-commerce (custom / headless)",
    detail: "Headless Next.js storefront, custom checkout and integrations",
    price: "$30,000–$60,000+",
  },
];

interface CarePlan {
  id: string;
  title: string;
  price: string;
  tagline: string;
  isBestValue?: boolean;
  features: { label: string; included: boolean }[];
}

const carePlans: CarePlan[] = [
  {
    id: "essential",
    title: "Essential",
    price: "$99",
    tagline: "Keep your site healthy, secure, and backed up.",
    features: [
      { label: "Dependency & CMS updates (tested)", included: true },
      { label: "Daily backups (restore-tested)", included: true },
      { label: "Uptime + security monitoring, SSL", included: true },
      { label: "Monthly health report", included: true },
      { label: "2-business-day support response", included: true },
      { label: "Included dev/content hours", included: false },
      { label: "Quarterly performance & SEO review", included: false },
      { label: "Quarterly strategy call", included: false },
    ],
  },
  {
    id: "professional",
    title: "Professional",
    price: "$299",
    tagline: "Everything in Essential, plus hands-on development time.",
    isBestValue: true,
    features: [
      { label: "Everything in Essential", included: true },
      { label: "2 dev/content hours per month", included: true },
      { label: "1-business-day support response", included: true },
      { label: "Small fixes & content edits (within hours)", included: true },
      { label: "Quarterly performance & SEO review", included: true },
      { label: "Quarterly strategy call", included: false },
    ],
  },
  {
    id: "premium",
    title: "Premium",
    price: "$599",
    tagline: "For sites your business depends on every day.",
    features: [
      { label: "Everything in Professional", included: true },
      { label: "5 dev/content hours per month", included: true },
      { label: "Same-business-day support response", included: true },
      { label: "Quarterly strategy call", included: true },
      { label: "Reduced overage rate ($115/hr)", included: true },
    ],
  },
];

const hostingTiers = [
  {
    id: "standard",
    title: "Standard",
    price: "$99/mo",
    detail:
      "Managed hosting for marketing sites and small apps. Deploys, SSL, CDN, monitoring.",
  },
  {
    id: "business",
    title: "Business",
    price: "$179/mo",
    detail:
      "Higher-traffic sites. Adds a staging environment and priority infrastructure support.",
  },
  {
    id: "enterprise",
    title: "Enterprise / Custom",
    price: "$299+/mo",
    detail:
      "High traffic, compliance requirements, custom SLAs. Scoped to your needs.",
  },
];

const hourlyRates = [
  { label: "Standard development", rate: "$150/hr" },
  { label: "Senior / strategy / AI consulting", rate: "$200/hr" },
  { label: "Care-plan member rate", rate: "$125/hr" },
  {
    label: "One-off consultations (30-min minimum)",
    rate: "$150/hr",
  },
  { label: "Emergency / after-hours", rate: "2× rate" },
];

const otherServices = [
  {
    id: "seo",
    title: "SEO",
    items: [
      { label: "SEO audit + roadmap (one-time)", price: "$2,000" },
      { label: "Local SEO retainer", price: "$900/mo" },
      { label: "Growth SEO retainer", price: "$1,750/mo" },
      { label: "Competitive / e-commerce SEO", price: "$3,000+/mo" },
      { label: "AI-search visibility (GEO/AEO) add-on", price: "$750/mo" },
    ],
  },
  {
    id: "ai",
    title: "AI implementation",
    items: [
      { label: "AI opportunity audit (2 weeks)", price: "$3,500" },
      { label: "Standard implementation (4–6 weeks)", price: "$10,000–$20,000" },
      { label: "Custom AI integration project", price: "$20,000–$45,000" },
      { label: "AI ops retainer", price: "$1,500–$3,000/mo" },
    ],
  },
  {
    id: "orchestration",
    title: "AI orchestration (Paperclip)",
    items: [
      { label: "AI company setup (up to 3 agents)", price: "$5,000–$8,000" },
      { label: "AI company setup (up to 8 agents)", price: "$8,000–$12,000" },
      { label: "AI company setup (unlimited agents)", price: "$12,000–$15,000+" },
      { label: "Autonomous business transformation", price: "$25,000–$75,000" },
      { label: "Managed AI company operations", price: "$3,000–$8,000/mo" },
    ],
  },
  {
    id: "design",
    title: "Design & brand",
    items: [
      { label: "Logo + core identity", price: "$3,500" },
      { label: "Full brand package", price: "$7,500–$12,000" },
      { label: "Brand + website bundle", price: "10% off combined" },
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="pb-16 pt-24 md:pb-20 md:pt-36">
        <div className="mx-auto max-w-5xl px-6">
          <h1 className="max-w-3xl text-balance text-4xl font-medium tracking-tight md:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
            Clear pricing.{" "}
            <span className="text-muted-foreground">No surprises.</span>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Project floors, monthly plans, and hourly rates — published so you
            can budget before we ever get on a call. Every engagement starts at
            $5,000 minimum.
          </p>
          <div className="mt-10 flex items-center gap-6">
            <ScheduleCallModal
              trigger={
                <Button size="lg" className="h-12 rounded-full pl-5 pr-3 text-base">
                  <span className="text-nowrap">Get a quote</span>
                  <ChevronRight className="ml-1" />
                </Button>
              }
            />
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Free 30-minute discovery call
            </span>
          </div>
        </div>
      </section>

      {/* Project pricing */}
      <section className="border-t py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="md:grid md:grid-cols-[1fr_2fr] md:gap-16">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Web development
              </p>
              <h2 className="mt-3 text-2xl font-medium md:text-3xl">
                Project pricing
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Ranges reflect typical scope. Fixed quotes come after a
                discovery call. Minimum engagement is $5,000.
              </p>
            </div>
            <div className="mt-10 space-y-0 divide-y md:mt-0">
              {projectPricing.map((project) => (
                <div
                  key={project.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-5 first:pt-0"
                >
                  <div className="min-w-0">
                    <h3 className="text-lg font-medium">{project.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {project.detail}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular-nums">
                    {project.price}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Care plans */}
      <section id="care-plans" className="bg-muted/30 py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Maintenance care plans
          </p>
          <h2 className="mt-3 max-w-2xl text-2xl font-medium md:text-3xl">
            Someone keeps your site running. That someone is us.
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
            Every plan includes tested updates, restore-tested daily backups,
            uptime and security monitoring, and a monthly health report. Unused
            hours don&apos;t roll over. Pay annually and get one month free.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {carePlans.map((plan) => (
              <div
                key={plan.id}
                className={`flex flex-col rounded-2xl border bg-card p-8 ${
                  plan.isBestValue ? "border-foreground/20 shadow-lg" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">{plan.title}</h3>
                  {plan.isBestValue && (
                    <Badge variant="secondary" className="text-[10px]">
                      Most popular
                    </Badge>
                  )}
                </div>
                <p className="mt-4">
                  <span className="text-4xl font-medium">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {plan.tagline}
                </p>
                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature.label}
                      className="flex items-start gap-2 text-sm"
                    >
                      {feature.included ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : (
                        <Minus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                      )}
                      <span
                        className={
                          feature.included ? "" : "text-muted-foreground/60"
                        }
                      >
                        {feature.label}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <ScheduleCallModal
                    trigger={
                      <Button
                        variant={plan.isBestValue ? "default" : "outline"}
                        className="w-full rounded-full"
                      >
                        Get started
                      </Button>
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-muted-foreground">
            Overage hours bill at $125/hr for Essential and Professional,
            $115/hr for Premium. Need same-day response and extended hours? Add
            an enhanced SLA rider for $250/mo on any plan.
          </p>
        </div>
      </section>

      {/* Hosting */}
      <section id="hosting" className="py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="md:grid md:grid-cols-[1fr_2fr] md:gap-16">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Managed hosting
              </p>
              <h2 className="mt-3 text-2xl font-medium md:text-3xl">
                We run the infrastructure
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Bundle hosting with any care plan and save $20/mo on hosting.
              </p>
            </div>
            <div className="mt-10 space-y-0 divide-y md:mt-0">
              {hostingTiers.map((tier) => (
                <div
                  key={tier.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-5 first:pt-0"
                >
                  <div className="min-w-0">
                    <h3 className="text-lg font-medium">{tier.title}</h3>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">
                      {tier.detail}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular-nums">
                    {tier.price}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Hourly + other services */}
      <section className="border-t py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid gap-16 md:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Hourly rates
              </p>
              <div className="mt-8 space-y-0 divide-y">
                {hourlyRates.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-baseline justify-between gap-6 py-4 first:pt-0"
                  >
                    <span className="text-sm">{item.label}</span>
                    <span className="text-sm font-medium tabular-nums">
                      {item.rate}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                Government and public-sector work carries a +25% premium
                covering Section 508 / WCAG 2.2 AA conformance, VPAT
                documentation, and procurement requirements. Rush timelines add
                +50%; same-day or weekend work adds +100%.
              </p>
            </div>
            <div className="space-y-12">
              {otherServices.map((service) => (
                <div key={service.id}>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    {service.title}
                  </p>
                  <div className="mt-4 space-y-0 divide-y">
                    {service.items.map((item) => (
                      <div
                        key={item.label}
                        className="flex items-baseline justify-between gap-6 py-3 first:pt-0"
                      >
                        <span className="text-sm">{item.label}</span>
                        <span className="shrink-0 text-sm font-medium tabular-nums">
                          {item.price}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="rounded-3xl bg-neutral-950 px-8 py-16 md:px-16 md:py-24">
            <h2 className="max-w-lg text-3xl font-medium text-white md:text-4xl">
              Not sure what you need?
            </h2>
            <p className="mt-4 max-w-xl text-neutral-400">
              Book a free 30-minute call. We&apos;ll tell you whether
              we&apos;re the right fit and roughly what it would cost before
              anyone commits to anything.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <ScheduleCallModal
                trigger={
                  <Button size="lg" className="bg-white text-black hover:bg-neutral-200">
                    <span className="text-nowrap">Book a discovery call</span>
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
}
