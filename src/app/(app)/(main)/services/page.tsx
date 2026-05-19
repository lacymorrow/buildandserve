import { ArrowRight, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ScheduleCallModal } from "@/components/modals/schedule-call-modal";
import { Badge } from "@/components/ui/badge";
import { BorderBeam } from "@/components/ui/border-beam";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import NumberTicker from "@/components/ui/number-ticker";
import RetroGrid from "@/components/ui/retro-grid";
import { TextEffect } from "@/components/ui/text-effect";
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
    body: "We’ve been building with React since early versions and Next.js since it became the obvious choice for production web apps. We know where projects go wrong, how to structure things for teams that grow, and how to ship something you won’t have to rebuild in a year.",
    goodFor: "SaaS products, startup MVPs, customer portals, marketing sites that need to perform",
  },
  {
    id: "fullstack",
    title: "Full-stack web applications",
    body: "Frontend to backend, database to deployment. We handle the whole stack so you’re not coordinating five different contractors or explaining the same context to each one. That includes API design, database architecture, authentication, payments, background jobs — whatever your product needs to work.",
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
    body: "Slow sites lose money. Load time directly affects conversions. We audit what’s actually slowing you down, then fix it: rendering strategy, image handling, caching, CDN setup, code splitting.",
    goodFor:
      "Sites with high traffic and dropping conversions, platforms that have scaled past their original architecture",
  },
  {
    id: "api",
    title: "API development and integrations",
    body: "Whether you’re building the API or connecting to someone else’s, we do both well. Clean design, proper versioning, reliable performance under load.",
    goodFor: "Third-party integrations, webhook systems, internal API layers, data pipelines",
  },
];

const productizedServices = [
  {
    id: "agent-team",
    title: "AI Agent Team — Managed Service",
    badge: "Managed",
    body: "We deploy, manage, and optimize AI agent teams that do real work for your business. Content creation, customer support triage, data analysis, research, reporting. We run it, you get the results.",
    goodFor:
      "Operations leaders at SMBs drowning in manual processes. Marketing teams that need steady content production without hiring.",
    pricing: "$2K–$10K/month depending on scope",
  },
  {
    id: "shipkit",
    title: "ShipKit Launch Package",
    badge: "Fixed Price",
    body: "ShipKit is our production-grade Next.js framework. The Launch Package means you don’t buy a boilerplate and figure it out yourself. We build your app on ShipKit, customize it for your brand and use case, and hand you a deployed product in 1–2 weeks.",
    goodFor:
      "Solo founders who need to ship now. Early-stage startups validating with a real product instead of a mockup.",
    pricing: "$2K–$5K standard · $7K–$10K Pro",
  },
  {
    id: "ai-audit",
    title: "AI Strategy & Audit",
    badge: "Fixed Price",
    body: "We look at your operations, your team, your tools, and your bottlenecks. Then we tell you where AI saves real time and money. Not theoretical possibilities. Practical implementations you can act on in the next 90 days.",
    goodFor:
      "Business owners who know AI matters but aren’t sure where to start. Ops managers tasked with figuring out AI.",
    pricing: "$1K–$3K · most land around $1,500–$2,000",
  },
  {
    id: "maintenance",
    title: "Website Maintenance & Support Retainer",
    badge: "Monthly",
    body: "You built something. Now someone needs to keep it running. Dependencies, security patches, performance, feature tweaks. We handle all of it on a monthly retainer.",
    goodFor: "Any business running a Next.js or React app without a dedicated dev team.",
    pricing: "$500–$3K/month · three tiers",
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
    gradient: "from-blue-500 to-violet-500",
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
    gradient: "from-emerald-500 to-cyan-500",
  },
  {
    id: "lacy-shell",
    title: "Lacy Shell",
    subtitle: "AI terminal",
    problem:
      "AI-assisted development meant constant context switching: work in the terminal, copy to an AI chat window, paste back, repeat.",
    solution:
      "Built Lacy Shell as a ZSH/Bash plugin that routes commands between the shell and AI agents based on what you’re doing.",
    outcome:
      "AI assistance built into the terminal itself. Developers get context-aware AI help without leaving the command line.",
    gradient: "from-orange-500 to-red-500",
  },
];

export default function ServicesPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="py-24 md:py-32">
        <div className="mx-auto max-w-5xl px-6">
          <div className="max-w-2xl">
            <TextEffect
              preset="fade-in-blur"
              speedSegment={0.3}
              as="h1"
              className="text-balance text-5xl font-semibold md:text-6xl lg:text-7xl"
            >
              We handle the technical side. You focus on everything else.
            </TextEffect>
            <p className="mt-8 max-w-xl text-balance text-lg text-muted-foreground">
              20 years of full-stack development. Built tools used by thousands of developers,
              integrated AI into production apps, and shipped fast for clients who needed to move.
            </p>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 gap-8 border-t pt-12 md:grid-cols-4">
            {[
              { value: 20, suffix: "+", label: "Years Experience" },
              { value: 50, suffix: "+", label: "Projects Delivered" },
              { value: 9, suffix: "", label: "Enterprise Clients" },
              { value: 30, suffix: "min", label: "Free Discovery Call" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-4xl font-bold">
                  <NumberTicker value={stat.value} className="text-4xl font-bold" />
                  <span className="text-muted-foreground">{stat.suffix}</span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-12">
            <ScheduleCallModal
              trigger={
                <Button size="lg" className="h-12 rounded-full pl-5 pr-3 text-base">
                  <span className="text-nowrap">Start a project</span>
                  <ChevronRight className="ml-1" />
                </Button>
              }
            />
          </div>
        </div>
      </section>

      {/* Featured Offerings */}
      <section className="bg-muted/30 py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              Dedicated offerings
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold md:text-4xl">
              Productized services with clear scope and pricing
            </h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <Link
              href={routes.servicesOpenclaw}
              className="group relative overflow-hidden rounded-2xl border bg-card p-8 transition-shadow hover:shadow-xl"
            >
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-500 to-cyan-500" />
              <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-gradient-to-bl from-emerald-500/10 to-transparent" />
              <div className="relative">
                <p className="text-xs font-medium uppercase tracking-widest text-emerald-500">
                  AI Agent Orchestration
                </p>
                <h3 className="mt-2 text-xl font-semibold">OpenClaw Setup &amp; Deployment</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Multi-agent systems deployed and running. Architecture, configuration, training.
                  We know where setups go wrong because we run agent teams ourselves.
                </p>
                <p className="mt-4 text-sm font-medium">$5K–$15K project-based</p>
                <div className="mt-6 flex items-center gap-1 text-sm font-medium text-emerald-500">
                  View full details
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </Link>

            <Link
              href={routes.servicesPaperclip}
              className="group relative overflow-hidden rounded-2xl border bg-card p-8 transition-shadow hover:shadow-xl"
            >
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-500 to-orange-500" />
              <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-gradient-to-bl from-amber-500/10 to-transparent" />
              <div className="relative">
                <p className="text-xs font-medium uppercase tracking-widest text-amber-500">
                  AI Company Platform
                </p>
                <h3 className="mt-2 text-xl font-semibold">Paperclip AI Company Setup</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Build your AI-powered company. Agent teams, workflows, governance. Set up by the
                  people who built the platform.
                </p>
                <p className="mt-4 text-sm font-medium">$5K–$15K setup + optional management</p>
                <div className="mt-6 flex items-center gap-1 text-sm font-medium text-amber-500">
                  View full details
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </Link>
          </div>

          {/* Other productized services */}
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {productizedServices.map((service) => (
              <div
                key={service.id}
                className="rounded-2xl border bg-card p-8 transition-shadow hover:shadow-md"
              >
                <div className="mb-3 flex items-center gap-3">
                  <h3 className="text-lg font-semibold">{service.title}</h3>
                  <Badge variant="secondary" className="text-xs">
                    {service.badge}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{service.body}</p>
                <p className="mt-3 text-sm">
                  <span className="font-medium">Good fit for:</span>{" "}
                  <span className="text-muted-foreground">{service.goodFor}</span>
                </p>
                <p className="mt-3 text-sm font-medium text-muted-foreground">{service.pricing}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-balance text-3xl font-semibold md:text-4xl">What we build</h2>
          <div className="mt-12 divide-y overflow-hidden rounded-2xl border bg-card">
            {services.map((service) => (
              <div key={service.id} className="p-8">
                <h3 className="text-xl font-semibold">{service.title}</h3>
                <p className="mt-4 leading-relaxed text-muted-foreground">{service.body}</p>
                <p className="mt-4 text-sm">
                  <span className="font-medium">Good fit for:</span>{" "}
                  <span className="text-muted-foreground">{service.goodFor}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="relative overflow-hidden rounded-3xl border p-10 md:p-16">
            <BorderBeam duration={20} />
            <h2 className="text-balance text-3xl font-semibold md:text-4xl">Pricing</h2>
            <div className="mt-8 max-w-2xl space-y-4 leading-relaxed text-muted-foreground">
              <p>
                Hourly rates run $100 to $200 depending on what the work requires. Complex AI work,
                architecture, and technical consulting sit at the higher end. Standard development
                and integrations are in the middle.
              </p>
              <p>
                Project-based pricing is available for well-defined scopes. We can talk through that
                on the discovery call.
              </p>
              <p>
                All projects start with a free 30-minute call. We&apos;ll tell you whether
                we&apos;re the right fit and roughly what it would cost before anyone commits to
                anything.
              </p>
            </div>
            <div className="mt-10">
              <ScheduleCallModal
                trigger={
                  <Button size="lg" className="h-12 rounded-full pl-5 pr-3 text-base">
                    <span className="text-nowrap">Book a free call</span>
                    <ChevronRight className="ml-1" />
                  </Button>
                }
              />
            </div>
          </div>
        </div>
      </section>

      {/* Case Studies */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-balance text-3xl font-semibold md:text-4xl">What we&apos;ve built</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {caseStudies.map((study) => (
              <Card key={study.id} className="flex flex-col overflow-hidden rounded-2xl border">
                <div className={`h-2 bg-gradient-to-r ${study.gradient}`} />
                <div className="flex flex-1 flex-col p-8">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      {study.subtitle}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold">{study.title}</h3>
                  </div>
                  <div className="mt-6 space-y-4 text-sm leading-relaxed">
                    <div>
                      <p className="font-medium">Problem</p>
                      <p className="mt-1 text-muted-foreground">{study.problem}</p>
                    </div>
                    <div>
                      <p className="font-medium">Solution</p>
                      <p className="mt-1 text-muted-foreground">{study.solution}</p>
                    </div>
                    <div>
                      <p className="font-medium">Outcome</p>
                      <p className="mt-1 text-muted-foreground">{study.outcome}</p>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="relative overflow-hidden rounded-3xl border bg-neutral-950 px-6 py-12 text-center md:py-20 lg:py-32">
            <RetroGrid className="opacity-15" />
            <div className="relative">
              <h2 className="text-balance text-4xl font-semibold text-white lg:text-5xl">
                Have something to build?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-neutral-400">
                We keep the client list manageable. Most projects start with a 30-minute call, no
                commitment, just a conversation about what you&apos;re trying to build and whether
                we&apos;re the right people to help.
              </p>
              <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
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
                  variant="outline"
                  size="lg"
                  className="border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                >
                  <Link href={routes.contact}>Send us a message</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <ServicesFaq />
    </div>
  );
}
