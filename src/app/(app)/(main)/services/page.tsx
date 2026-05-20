import { ArrowRight, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ScheduleCallModal } from "@/components/modals/schedule-call-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { constructMetadata } from "@/config/metadata";
import { routes } from "@/config/routes";
import { ServicesFaq } from "./_components/services-faq";

export const metadata: Metadata = constructMetadata({
  title: "Web Development Services | Build And Serve",
  description:
    "Next.js, React, AI integration, and full-stack development from a team with 20+ years of experience. Based in Charlotte. Working with startups and growing companies.",
});

const services = [
  {
    id: "nextjs",
    title: "Next.js and React development",
    body: "We've been building with React since early versions and Next.js since it became the obvious choice for production web apps. We know where projects go wrong, how to structure things for teams that grow, and how to ship something you won't have to rebuild in a year.",
    goodFor:
      "SaaS products, startup MVPs, customer portals, marketing sites that need to perform",
  },
  {
    id: "fullstack",
    title: "Full-stack web applications",
    body: "Frontend to backend, database to deployment. We handle the whole stack so you're not coordinating five different contractors or explaining the same context to each one. That includes API design, database architecture, authentication, payments, background jobs — whatever your product needs to work.",
    goodFor:
      "Greenfield builds, platform redesigns, teams that need one person to own the whole thing",
  },
  {
    id: "ai",
    title: "AI integration and automation",
    body: "We built our own AI desktop app (Juno) and AI terminal (Lacy Shell) in-house, so we understand AI integration from the inside. We know the difference between an integration that solves a real problem and one that just adds a line to the feature list.",
    goodFor:
      "Product AI features, back-office automation, LLM-powered tools, custom agent workflows",
  },
  {
    id: "performance",
    title: "Site speed and performance optimization",
    body: "Slow sites lose money. Load time directly affects conversions. We audit what's actually slowing you down, then fix it: rendering strategy, image handling, caching, CDN setup, code splitting.",
    goodFor:
      "Sites with high traffic and dropping conversions, platforms that have scaled past their original architecture",
  },
  {
    id: "api",
    title: "API development and integrations",
    body: "Whether you're building the API or connecting to someone else's, we do both well. Clean design, proper versioning, reliable performance under load.",
    goodFor:
      "Third-party integrations, webhook systems, internal API layers, data pipelines",
  },
];

const productizedServices = [
  {
    id: "agent-team",
    title: "AI Agent Team",
    detail: "Managed Service",
    body: "We deploy, manage, and optimize AI agent teams that do real work for your business. Content creation, customer support triage, data analysis, research, reporting. We run it, you get the results.",
    pricing: "$2K–$10K/month",
  },
  {
    id: "shipkit",
    title: "ShipKit Launch Package",
    detail: "Fixed Price",
    body: "ShipKit is our production-grade Next.js framework. The Launch Package means you don't buy a boilerplate and figure it out yourself. We build your app on ShipKit, customize it for your brand and use case, and hand you a deployed product in 1–2 weeks.",
    pricing: "$2K–$5K standard · $7K–$10K Pro",
  },
  {
    id: "ai-audit",
    title: "AI Strategy & Audit",
    detail: "Fixed Price",
    body: "We look at your operations, your team, your tools, and your bottlenecks. Then we tell you where AI saves real time and money. Not theoretical possibilities. Practical implementations you can act on in the next 90 days.",
    pricing: "$1K–$3K",
  },
  {
    id: "maintenance",
    title: "Maintenance & Support",
    detail: "Monthly Retainer",
    body: "You built something. Now someone needs to keep it running. Dependencies, security patches, performance, feature tweaks. We handle all of it on a monthly retainer.",
    pricing: "$500–$3K/month",
  },
];

const caseStudies = [
  {
    id: "shipkit",
    title: "ShipKit",
    subtitle: "Next.js application framework",
    problem:
      "Every new web app started with the same two weeks of setup: authentication, database connections, billing, email, multi-tenant architecture.",
    solution:
      "Built ShipKit, a production-ready Next.js boilerplate with all of it included from the start. Auth, Stripe payments, a CMS layer, multi-tenant support, and a component library.",
    outcome:
      "Developers skip the setup phase entirely. Projects that used to take two weeks now ship product features from day one.",
  },
  {
    id: "juno",
    title: "Juno",
    subtitle: "AI desktop application",
    problem:
      "AI computer use needed a native interface that ran at desktop speed. Browser-based wrappers were sluggish.",
    solution:
      "Built Juno from scratch in Rust with Tauri, a native Mac application that integrates directly with Claude Computer Use.",
    outcome:
      "A native AI desktop agent that handles computer use tasks without the performance hit of a browser wrapper.",
  },
  {
    id: "lacy-shell",
    title: "Lacy Shell",
    subtitle: "AI terminal",
    problem:
      "AI-assisted development meant constant context switching: work in the terminal, copy to an AI chat window, paste back, repeat.",
    solution:
      "Built Lacy Shell as a ZSH/Bash plugin that routes commands between the shell and AI agents based on what you're doing.",
    outcome:
      "AI assistance built into the terminal itself. Developers get context-aware AI help without leaving the command line.",
  },
];

export default function ServicesPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="pb-16 pt-24 md:pb-20 md:pt-36">
        <div className="mx-auto max-w-5xl px-6">
          <h1 className="max-w-3xl text-balance text-4xl font-medium tracking-tight md:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
            We handle the technical side.{" "}
            <span className="text-muted-foreground">
              You focus on everything else.
            </span>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground">
            20 years of full-stack development. Built tools used by thousands of
            developers, integrated AI into production apps, and shipped fast for
            clients who needed to move.
          </p>
          <div className="mt-10 flex items-center gap-6">
            <ScheduleCallModal
              trigger={
                <Button size="lg" className="h-12 rounded-full pl-5 pr-3 text-base">
                  <span className="text-nowrap">Start a project</span>
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

      {/* Flagship Offerings */}
      <section className="border-t py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Dedicated offerings
          </p>

          <div className="mt-12 space-y-0 divide-y">
            <Link
              href={routes.servicesOpenclaw}
              className="group flex items-start justify-between gap-8 py-10 first:pt-0"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
                    AI Agent Orchestration
                  </span>
                </div>
                <h2 className="mt-3 text-2xl font-medium md:text-3xl">
                  OpenClaw Setup &amp; Deployment
                </h2>
                <p className="mt-3 max-w-lg text-muted-foreground">
                  Multi-agent systems deployed and running. Architecture,
                  configuration, training. We know where setups go wrong because
                  we run agent teams ourselves.
                </p>
                <p className="mt-4 text-sm font-medium">
                  $5K–$15K project-based
                </p>
              </div>
              <ArrowRight className="mt-10 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>

            <Link
              href={routes.servicesPaperclip}
              className="group flex items-start justify-between gap-8 py-10"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
                    AI Company Platform
                  </span>
                </div>
                <h2 className="mt-3 text-2xl font-medium md:text-3xl">
                  Paperclip AI Company Setup
                </h2>
                <p className="mt-3 max-w-lg text-muted-foreground">
                  Build your AI-powered company. Agent teams, workflows,
                  governance. Set up by the people who built the platform.
                </p>
                <p className="mt-4 text-sm font-medium">
                  $5K–$15K setup + optional management
                </p>
              </div>
              <ArrowRight className="mt-10 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* Packaged Services */}
      <section className="bg-muted/30 py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="md:grid md:grid-cols-[1fr_2fr] md:gap-16">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Packaged services
              </p>
              <h2 className="mt-3 text-2xl font-medium md:text-3xl">
                Clear scope, clear pricing
              </h2>
            </div>
            <div className="mt-10 space-y-8 md:mt-0">
              {productizedServices.map((service) => (
                <div key={service.id}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-lg font-medium">{service.title}</h3>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {service.detail}
                    </Badge>
                    <span className="ml-auto text-sm text-muted-foreground">
                      {service.pricing}
                    </span>
                  </div>
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    {service.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Core Services */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            What we build
          </p>
          <div className="mt-10">
            {services.map((service, i) => (
              <div
                key={service.id}
                className="grid gap-4 border-t py-10 md:grid-cols-[3rem_1fr_1.5fr] md:gap-8"
              >
                <span className="hidden text-sm tabular-nums text-muted-foreground/50 md:block">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-lg font-medium">{service.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {service.goodFor}
                  </p>
                </div>
                <p className="leading-relaxed text-muted-foreground">
                  {service.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Selected Work */}
      <section className="border-t py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Selected work
          </p>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-3">
            {caseStudies.map((study) => (
              <div key={study.id} className="flex flex-col bg-card p-8 md:p-10">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {study.subtitle}
                </p>
                <h3 className="mt-2 text-xl font-medium">{study.title}</h3>
                <div className="mt-6 flex-1 space-y-4 text-sm leading-relaxed text-muted-foreground">
                  <p>{study.problem}</p>
                  <p>{study.solution}</p>
                  <p className="font-medium text-foreground">{study.outcome}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-muted/30 py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="md:grid md:grid-cols-[1fr_1.5fr] md:gap-16">
            <div>
              <h2 className="text-2xl font-medium md:text-3xl">Pricing</h2>
            </div>
            <div className="mt-6 space-y-4 leading-relaxed text-muted-foreground md:mt-0">
              <p>
                Hourly rates run $100 to $200 depending on what the work
                requires. Complex AI work, architecture, and technical consulting
                sit at the higher end. Standard development and integrations are
                in the middle.
              </p>
              <p>
                Project-based pricing is available for well-defined scopes. We
                can talk through that on the discovery call.
              </p>
              <p>
                All projects start with a free 30-minute call. We&apos;ll tell
                you whether we&apos;re the right fit and roughly what it would
                cost before anyone commits to anything.
              </p>
              <div className="pt-4">
                <ScheduleCallModal
                  trigger={
                    <Button
                      variant="outline"
                      size="lg"
                      className="rounded-full pl-5 pr-3"
                    >
                      <span className="text-nowrap">Book a free call</span>
                      <ChevronRight className="ml-1" />
                    </Button>
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="rounded-3xl bg-neutral-950 px-8 py-16 md:px-16 md:py-24">
            <h2 className="max-w-lg text-3xl font-medium text-white md:text-4xl">
              Have something to build?
            </h2>
            <p className="mt-4 max-w-xl text-neutral-400">
              We keep the client list manageable. Most projects start with a
              30-minute call, no commitment, just a conversation about what
              you&apos;re trying to build and whether we&apos;re the right
              people to help.
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

      {/* FAQ */}
      <ServicesFaq />
    </div>
  );
}
