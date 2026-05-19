import { ArrowRight, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ScheduleCallModal } from "@/components/modals/schedule-call-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    goodFor: "SaaS products, startup MVPs, customer portals, marketing sites that need to perform",
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
    body: "We built our own AI desktop app (Juno) and AI terminal (Lacy Shell) in-house, so we understand AI integration from the inside. We know the difference between an integration that solves a real problem and one that just adds a line to the feature list. For client work, that means LLM-powered features that earn their place, agent workflows, internal automation that replaces manual processes, and RAG pipelines when search needs to get smarter.",
    goodFor:
      "Product AI features, back-office automation, LLM-powered tools, custom agent workflows",
  },
  {
    id: "performance",
    title: "Site speed and performance optimization",
    body: "Slow sites lose money. Load time directly affects conversions. We audit what's actually slowing you down, then fix it: rendering strategy, image handling, caching, CDN setup, code splitting. We tell you what will actually move the metric before touching anything.",
    goodFor:
      "Sites with high traffic and dropping conversions, platforms that have scaled past their original architecture",
  },
  {
    id: "api",
    title: "API development and integrations",
    body: "Whether you're building the API or connecting to someone else's, we do both well. Clean design, proper versioning, reliable performance under load. We've integrated enough third-party APIs to know which documentation misleads you and where the edge cases live.",
    goodFor: "Third-party integrations, webhook systems, internal API layers, data pipelines",
  },
];

const productizedServices = [
  {
    id: "agent-team",
    title: "AI Agent Team — Managed Service",
    badge: "Managed",
    body: "We deploy, manage, and optimize AI agent teams that do real work for your business. Content creation, customer support triage, data analysis, research, reporting. We run it, you get the results. Includes ongoing management, weekly reporting on output volume and quality, and monthly strategy reviews.",
    goodFor:
      "Operations leaders at SMBs drowning in manual processes. Marketing teams that need steady content production without hiring.",
    pricing: "$2K–$10K/month depending on scope",
    href: routes.services,
  },
  {
    id: "shipkit",
    title: "ShipKit Launch Package",
    badge: "Fixed Price",
    body: "ShipKit is our production-grade Next.js framework. The Launch Package means you don't buy a boilerplate and figure it out yourself. We build your app on ShipKit, customize it for your brand and use case, and hand you a deployed product in 1–2 weeks. Full source code handoff. No lock-in.",
    goodFor:
      "Solo founders who need to ship now. Early-stage startups validating with a real product instead of a mockup.",
    pricing: "$2K–$5K standard · $7K–$10K Pro",
    href: routes.services,
  },
  {
    id: "ai-audit",
    title: "AI Strategy & Audit",
    badge: "Fixed Price",
    body: "We look at your operations, your team, your tools, and your bottlenecks. Then we tell you where AI saves real time and money. Not theoretical possibilities. Practical implementations you can act on in the next 90 days. You get a written report and 60-day action plan — not a 50-page deck that sits in a drawer.",
    goodFor:
      'Business owners who know AI matters but aren\'t sure where to start. Ops managers tasked with "figure out AI for us."',
    pricing: "$1K–$3K · most land around $1,500–$2,000",
    href: routes.services,
  },
  {
    id: "maintenance",
    title: "Website Maintenance & Support Retainer",
    badge: "Monthly",
    body: "You built something. Now someone needs to keep it running. Dependencies need updates. Security patches need applying. Performance needs monitoring. Features need tweaking. We handle all of it on a monthly retainer. Essentials starts at $500/mo. Growth adds performance optimization and feature hours. Scale includes dedicated support and AI-powered monitoring.",
    goodFor: "Any business running a Next.js or React app without a dedicated dev team.",
    pricing: "$500–$3K/month · three tiers",
    href: routes.services,
  },
];

const caseStudies = [
  {
    id: "shipkit",
    title: "ShipKit",
    subtitle: "Next.js application framework",
    problem:
      "Every new web app started with the same two weeks of setup: authentication, database connections, billing, email, multi-tenant architecture. All before writing a single line of actual product code.",
    solution:
      "Built ShipKit, a production-ready Next.js boilerplate with all of it included from the start. Auth, Stripe payments, a CMS layer, multi-tenant support, and a component library. Open source.",
    outcome:
      "Developers skip the setup phase entirely. Projects that used to take two weeks to get off the ground now start shipping product features from day one. Thousands of developers use the kit globally.",
  },
  {
    id: "juno",
    title: "Juno",
    subtitle: "AI desktop application",
    problem:
      "AI computer use needed a native interface that ran at desktop speed. Browser-based wrappers were sluggish and added overhead for a tool people would use constantly.",
    solution:
      "Built Juno from scratch in Rust with Tauri, a native Mac application that integrates directly with Claude Computer Use. The engineering focus was keeping the interface responsive while the AI was working in the background.",
    outcome:
      "A native AI desktop agent that handles computer use tasks without the performance hit of a browser wrapper. Shipped as a full product, not a prototype.",
  },
  {
    id: "lacy-shell",
    title: "Lacy Shell",
    subtitle: "AI terminal",
    problem:
      "AI-assisted development meant constant context switching: work in the terminal, copy to an AI chat window, paste back, repeat. The two tools never talked to each other.",
    solution:
      "Built Lacy Shell as a ZSH/Bash plugin that routes commands between the shell and AI agents based on what you're doing. No new terminal to learn, it works inside your existing setup.",
    outcome:
      "AI assistance built into the terminal itself. Developers get context-aware AI help without leaving the command line. Available at lacy.sh.",
  },
];

export default function ServicesPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="py-24 md:py-32">
        <div className="mx-auto max-w-5xl px-6">
          <div className="max-w-2xl">
            <h1 className="text-balance text-5xl font-semibold md:text-6xl lg:text-7xl">
              We handle the technical side. You focus on everything else.
            </h1>
            <p className="mt-8 max-w-xl text-balance text-lg text-muted-foreground">
              20 years of full-stack development. Built tools used by thousands of developers,
              integrated AI into production apps, and shipped fast for clients who needed to move.
            </p>
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
        </div>
      </section>

      {/* Services */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-balance text-3xl font-semibold md:text-4xl">What we build</h2>
          <div className="mt-12 divide-y">
            {services.map((service) => (
              <div key={service.id} className="py-10 first:pt-0 last:pb-0">
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

      {/* Dedicated Offerings */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="mx-auto max-w-5xl px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              New offerings
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold md:text-4xl">
              Productized services
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Fixed scopes, clear pricing, defined timelines. Pick the one that matches where you
              are.
            </p>
          </div>

          {/* Dedicated landing pages */}
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <Link
              href="/services/openclaw"
              className="group rounded-2xl border bg-card p-8 hover:border-foreground/20 transition-colors"
            >
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Dedicated offering
              </p>
              <h3 className="mt-2 text-xl font-semibold">OpenClaw Setup & Deployment</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                AI agent orchestration, deployed and running. We set up OpenClaw for businesses that
                want multi-agent systems without spending six months on the architecture.
              </p>
              <p className="mt-4 text-sm font-medium">$5K–$15K project-based</p>
              <div className="mt-6 flex items-center gap-1 text-sm font-medium text-primary">
                View full details{" "}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
            <Link
              href="/services/paperclip"
              className="group rounded-2xl border bg-card p-8 hover:border-foreground/20 transition-colors"
            >
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Dedicated offering
              </p>
              <h3 className="mt-2 text-xl font-semibold">Paperclip AI Company Setup</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Build your AI-powered company. Agent teams, workflows, governance. We built
                Paperclip — when we set you up, it's the people who made the platform doing the
                configuration.
              </p>
              <p className="mt-4 text-sm font-medium">$3K–$10K setup + optional management</p>
              <div className="mt-6 flex items-center gap-1 text-sm font-medium text-primary">
                View full details{" "}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          </div>

          {/* Other productized services */}
          <div className="mt-8 divide-y rounded-2xl border bg-card">
            {productizedServices.map((service) => (
              <div key={service.id} className="p-8 first:pt-8 last:pb-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{service.title}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {service.badge}
                      </Badge>
                    </div>
                    <p className="mt-3 leading-relaxed text-muted-foreground text-sm">
                      {service.body}
                    </p>
                    <p className="mt-3 text-sm">
                      <span className="font-medium">Good fit for:</span>{" "}
                      <span className="text-muted-foreground">{service.goodFor}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium text-muted-foreground">{service.pricing}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <Card className="rounded-3xl border p-10 md:p-16">
            <h2 className="text-balance text-3xl font-semibold md:text-4xl">Pricing</h2>
            <div className="mt-8 max-w-2xl space-y-4 leading-relaxed text-muted-foreground">
              <p>
                Hourly rates run $100 to $200 depending on what the work requires. Complex AI work,
                architecture, and technical consulting sit at the higher end. Standard development
                and integrations are in the middle. Performance work and straightforward builds are
                at the lower end.
              </p>
              <p>
                Project-based pricing is available for well-defined scopes. We can talk through that
                on the discovery call.
              </p>
              <p>
                All projects start with a free 30-minute call. We'll tell you whether we're the
                right fit and roughly what it would cost before anyone commits to anything.
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
          </Card>
        </div>
      </section>

      {/* Case Studies */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-balance text-3xl font-semibold md:text-4xl">What we've built</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {caseStudies.map((study) => (
              <Card key={study.id} className="flex flex-col rounded-2xl border p-8">
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
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="rounded-3xl border px-6 py-12 text-center md:py-20 lg:py-32">
            <h2 className="text-balance text-4xl font-semibold lg:text-5xl">
              Have something to build?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              We keep the client list manageable. Most projects start with a 30-minute call, no
              commitment, just a conversation about what you're trying to build and whether we're
              the right people to help.
            </p>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
              <ScheduleCallModal
                trigger={
                  <Button size="lg">
                    <span className="text-nowrap">Book a discovery call</span>
                    <ChevronRight className="ml-1" />
                  </Button>
                }
              />
              <Button asChild variant="outline" size="lg">
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
