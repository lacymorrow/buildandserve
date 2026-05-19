import { ArrowLeft, Check, ChevronRight, Headphones, Network, Shield, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ScheduleCallModal } from "@/components/modals/schedule-call-modal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import AnimatedGradientText from "@/components/ui/animated-gradient-text";
import { BorderBeam } from "@/components/ui/border-beam";
import { Button } from "@/components/ui/button";
import RetroGrid from "@/components/ui/retro-grid";
import { TextEffect } from "@/components/ui/text-effect";
import { constructMetadata } from "@/config/metadata";
import { routes } from "@/config/routes";
import { OpenClawDashboard } from "../_components/openclaw-dashboard";

export const metadata: Metadata = constructMetadata({
  title: "OpenClaw Setup & Deployment | Build And Serve",
  description:
    "Deploy AI agent orchestration with OpenClaw. We handle architecture, configuration, agent design, deployment, and training. $5K–$15K project-based.",
});

const benefits = [
  {
    icon: Network,
    title: "Architecture That Holds Up",
    body: "Most agent deployments fail because the architecture was wrong from the start. We design your agent topology based on what actually works in production, not what looks good in a demo.",
    gradient: "from-emerald-500 to-cyan-500",
  },
  {
    icon: Zap,
    title: "Deployed in Weeks, Not Months",
    body: "A typical OpenClaw deployment takes 2–4 weeks from kickoff to production. We know the critical path and where teams waste time.",
    gradient: "from-cyan-500 to-blue-500",
  },
  {
    icon: Shield,
    title: "You Own Everything",
    body: "No vendor lock-in, no proprietary wrapper. Your OpenClaw instance runs on your infrastructure, your accounts, your control.",
    gradient: "from-blue-500 to-emerald-500",
  },
  {
    icon: Headphones,
    title: "30 Days of Post-Launch Support",
    body: "The first month after deployment is when the real questions come up. Bug fixes, configuration adjustments, agent tuning. We’re there for it.",
    gradient: "from-emerald-500 to-teal-500",
  },
];

const steps = [
  {
    number: "01",
    title: "Discovery",
    body: "60-minute call to understand your use case, your team, and what you want your agents doing. We’ll tell you honestly whether OpenClaw is the right fit or if something simpler would work.",
  },
  {
    number: "02",
    title: "Architecture & Design",
    body: "We design your agent topology — roles, communication patterns, data flows, security model. You review and sign off before we build anything.",
  },
  {
    number: "03",
    title: "Build & Deploy",
    body: "We configure OpenClaw, build your custom agents, set up monitoring and alerting, and deploy to your infrastructure. Typical timeline: 2–4 weeks.",
  },
  {
    number: "04",
    title: "Training & Handoff",
    body: "Your team gets hands-on training. We cover day-to-day management, adding new agents, troubleshooting, and extending the system. Plus 30 days of support after handoff.",
  },
];

const packages = [
  {
    name: "Starter",
    price: "$5,000–$7,500",
    description: "Single workflow, up to 3 agents, standard deployment",
    features: [
      "Architecture design",
      "Up to 3 custom agents",
      "Standard deployment",
      "Team training",
      "30 days post-launch support",
    ],
  },
  {
    name: "Professional",
    price: "$7,500–$12,000",
    description: "Multi-workflow, up to 8 agents, custom agent development",
    features: [
      "Everything in Starter",
      "Up to 8 custom agents",
      "Multi-workflow orchestration",
      "Custom agent development",
      "Advanced monitoring",
    ],
    featured: true,
  },
  {
    name: "Enterprise",
    price: "$12,000–$15,000+",
    description: "Complex orchestration, unlimited agents, dedicated support",
    features: [
      "Everything in Professional",
      "Unlimited agents",
      "Complex orchestration",
      "Dedicated support contact",
      "Optional ongoing retainer",
    ],
  },
];

const faqs = [
  {
    id: "faq-1",
    question: "What is OpenClaw?",
    answer:
      "OpenClaw is an open-source AI agent orchestration platform. It lets you deploy multiple AI agents that work together on tasks — coordinating, sharing context, and producing output that no single agent could handle alone. Think of it as the infrastructure layer for running AI teams.",
  },
  {
    id: "faq-2",
    question: "Do I need technical staff to manage OpenClaw after setup?",
    answer:
      "Someone on your team should be comfortable with basic system administration. We train your team during handoff, and the 30-day support period covers the initial learning curve. For ongoing management without internal technical staff, ask about our managed service.",
  },
  {
    id: "faq-3",
    question: "How long does a typical deployment take?",
    answer:
      "Two to four weeks from kickoff to production, depending on complexity. A single-workflow deployment with a few agents is on the faster end. Complex multi-agent systems with custom development take longer.",
  },
  {
    id: "faq-4",
    question: "Can I add more agents later?",
    answer:
      "Yes. We design the architecture so adding agents later doesn’t require rebuilding what’s already there. You can add them yourself after training, or bring us back for more complex additions.",
  },
  {
    id: "faq-5",
    question: "How is this different from just using ChatGPT or Claude directly?",
    answer:
      "Direct AI usage is one person talking to one model. OpenClaw orchestration is multiple specialized agents coordinating on complex tasks — with monitoring, failure handling, and quality controls. It’s the difference between asking someone a question and having a team work on a project.",
  },
];

export default function OpenClawPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-neutral-950 pb-20 pt-8 md:pb-28">
        <RetroGrid className="opacity-20" />
        <div className="relative mx-auto max-w-7xl px-6">
          <Link
            href={routes.services}
            className="mb-12 inline-flex items-center gap-2 text-sm text-neutral-500 transition-colors hover:text-neutral-300"
          >
            <ArrowLeft className="h-4 w-4" />
            All services
          </Link>

          <div className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
            <div>
              <AnimatedGradientText className="mb-6">
                <span className="text-neutral-200">OpenClaw Setup &amp; Deployment</span>
              </AnimatedGradientText>

              <TextEffect
                preset="fade-in-blur"
                speedSegment={0.3}
                as="h1"
                className="text-balance text-4xl font-semibold text-white sm:text-5xl md:text-6xl"
              >
                Deploy AI Agent Teams That Actually Work
              </TextEffect>

              <p className="mt-6 max-w-lg text-balance text-lg text-neutral-400">
                We set up OpenClaw agent orchestration for your business &mdash; architecture,
                deployment, training. Your agents coordinating on real tasks in weeks, not months.
              </p>

              <p className="mt-4 text-sm text-neutral-500">Starting at $5,000</p>

              <div className="mt-8">
                <ScheduleCallModal
                  trigger={
                    <Button
                      size="lg"
                      className="h-12 rounded-full bg-emerald-600 pl-5 pr-3 text-base text-white hover:bg-emerald-500"
                    >
                      <span className="text-nowrap">Book a discovery call</span>
                      <ChevronRight className="ml-1" />
                    </Button>
                  }
                />
              </div>
            </div>

            <div className="mt-12 lg:mt-0">
              <div className="relative">
                <div className="absolute -inset-4 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-transparent to-cyan-500/20 blur-2xl" />
                <OpenClawDashboard className="relative" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Context */}
      <section className="bg-muted/30 py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="max-w-3xl border-l-2 border-emerald-500/50 pl-8">
            <h2 className="text-balance text-3xl font-semibold md:text-4xl">
              We Build Agent Systems. This Is What We Do.
            </h2>
            <div className="mt-6 space-y-4 leading-relaxed text-muted-foreground">
              <p>
                We didn&apos;t learn OpenClaw from a tutorial. We&apos;ve built agent orchestration
                tools, shipped them to production, and run our own multi-agent teams daily. When we
                deploy OpenClaw for you, we&apos;re drawing on problems we&apos;ve already solved on
                our own systems.
              </p>
              <p>
                Juno, Lacy Shell, our own internal agent teams all run on these same patterns. We
                know where the configuration gets tricky, which agent designs hold up under real
                workloads, and how to keep the whole system from falling over on day two.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-balance text-3xl font-semibold md:text-4xl">What you get</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {benefits.map((b) => (
              <div
                key={b.title}
                className="group relative overflow-hidden rounded-2xl border bg-card p-8 transition-shadow hover:shadow-lg"
              >
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${b.gradient}`} />
                <b.icon className="mb-4 h-10 w-10 text-emerald-500/80" />
                <h3 className="text-lg font-semibold">{b.title}</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">{b.body}</p>
              </div>
            ))}
          </div>

          <div className="relative mt-12 overflow-hidden rounded-2xl border bg-card p-8">
            <BorderBeam colorFrom="#10b981" colorTo="#06b6d4" duration={20} />
            <h3 className="text-lg font-semibold">Every engagement includes:</h3>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                "Architecture review and agent design",
                "Full OpenClaw deployment and configuration",
                "Security model and access controls",
                "Monitoring and alerting setup",
                "Custom agent development for your workflows",
                "Team training on managing the system",
                "30 days of post-deployment support",
                "Documentation for your team",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="bg-muted/30 py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-balance text-3xl font-semibold md:text-4xl">How it works</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {steps.map((step) => (
              <div key={step.number} className="rounded-2xl border bg-card p-8">
                <span className="bg-gradient-to-br from-emerald-400 to-cyan-400 bg-clip-text text-4xl font-bold text-transparent">
                  {step.number}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-balance text-3xl font-semibold md:text-4xl">Pricing</h2>
          <p className="mt-4 text-muted-foreground">
            All packages include architecture design, deployment, team training, and 30 days
            post-launch support.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {packages.map((pkg) => (
              <div
                key={pkg.name}
                className={`relative flex flex-col overflow-hidden rounded-2xl border p-8 ${
                  pkg.featured
                    ? "border-emerald-500/50 shadow-[0_0_30px_-5px_rgba(16,185,129,0.15)]"
                    : ""
                }`}
              >
                {pkg.featured && (
                  <>
                    <BorderBeam colorFrom="#10b981" colorTo="#06b6d4" size={150} duration={10} />
                    <p className="mb-4 text-xs font-medium uppercase tracking-widest text-emerald-500">
                      Most popular
                    </p>
                  </>
                )}
                <h3 className="text-xl font-semibold">{pkg.name}</h3>
                <p className="mt-2 text-2xl font-bold">{pkg.price}</p>
                <p className="mt-2 text-sm text-muted-foreground">{pkg.description}</p>
                <ul className="mt-6 flex-1 space-y-2">
                  {pkg.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <ScheduleCallModal
                    trigger={
                      <Button className="w-full" variant={pkg.featured ? "default" : "outline"}>
                        Get started
                      </Button>
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Optional ongoing support retainer available after any package.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-muted/30 py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-balance text-center text-3xl font-semibold md:text-4xl">
            Common questions
          </h2>
          <div className="mx-auto mt-12 max-w-2xl">
            <Accordion
              type="single"
              collapsible
              className="ring-muted w-full rounded-2xl border bg-card px-8 py-3 shadow-sm ring-4 dark:ring-0"
            >
              {faqs.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id} className="border-dashed">
                  <AccordionTrigger className="cursor-pointer text-base hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-base">{faq.answer}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="relative overflow-hidden rounded-3xl border bg-neutral-950 px-6 py-16 text-center md:py-24">
            <RetroGrid className="opacity-15" />
            <div className="relative">
              <h2 className="text-balance text-4xl font-semibold text-white lg:text-5xl">
                Ready to deploy?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-neutral-400">
                Most projects start with a 30-minute call &mdash; no commitment, just a conversation
                about what you&apos;re trying to automate and whether OpenClaw is the right
                approach. If it&apos;s not, we&apos;ll tell you.
              </p>
              <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
                <ScheduleCallModal
                  trigger={
                    <Button size="lg" className="bg-emerald-600 text-white hover:bg-emerald-500">
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
    </div>
  );
}
