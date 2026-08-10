import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
import { AgentTerminal } from "../_components/agent-terminal";

export const metadata: Metadata = constructMetadata({
  title: "OpenClaw Setup & Deployment | Build And Serve",
  description:
    "Deploy AI agent orchestration with OpenClaw. We handle architecture, configuration, agent design, deployment, and training. $5K–$15K project-based.",
});

const deliverables = [
  "Architecture review and agent design",
  "Full OpenClaw deployment and configuration",
  "Security model and access controls",
  "Monitoring and alerting setup",
  "Custom agent development for your workflows",
  "Team training on managing the system",
  "30 days of post-deployment support",
  "Documentation for your team",
];

const packages = [
  {
    name: "Starter",
    price: "$5,000–$7,500",
    scope: "Single workflow, up to 3 agents",
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
    scope: "Multi-workflow, up to 8 agents",
    featured: true,
    features: [
      "Everything in Starter",
      "Up to 8 custom agents",
      "Multi-workflow orchestration",
      "Custom agent development",
      "Advanced monitoring",
    ],
  },
  {
    name: "Enterprise",
    price: "$12,000–$15,000+",
    scope: "Complex orchestration, unlimited agents",
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
      "Yes. We design the architecture so adding agents later doesn't require rebuilding what's already there. You can add them yourself after training, or bring us back for more complex additions.",
  },
  {
    id: "faq-5",
    question: "How is this different from just using ChatGPT or Claude directly?",
    answer:
      "Direct AI usage is one person talking to one model. OpenClaw orchestration is multiple specialized agents coordinating on complex tasks — with monitoring, failure handling, and quality controls. It's the difference between asking someone a question and having a team work on a project.",
  },
];

export default function OpenClawPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-neutral-950 pb-20 pt-8 md:pb-28">
        <div className="mx-auto max-w-5xl px-6">
          <Link
            href={routes.services}
            className="mb-16 inline-flex items-center gap-2 text-sm text-neutral-500 transition-colors hover:text-neutral-300"
          >
            <ArrowLeft className="h-4 w-4" />
            All services
          </Link>

          <div className="lg:grid lg:grid-cols-[1.2fr_1fr] lg:gap-20">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400/80">
                AI Agent Orchestration
              </p>
              <h1 className="mt-4 text-balance text-4xl font-medium tracking-tight text-white sm:text-5xl">
                Deploy AI Agent Teams That Actually Work
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-neutral-400">
                We set up OpenClaw agent orchestration for your
                business&mdash;architecture, deployment, training. Your agents
                coordinating on real tasks in weeks, not months.
              </p>
              <p className="mt-4 text-sm text-neutral-600">Starting at $5,000</p>
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
              <AgentTerminal />
            </div>
          </div>
        </div>
      </section>

      {/* Credibility + Process — merged into one flowing section */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="md:grid md:grid-cols-[1fr_1.5fr] md:gap-16">
            <div>
              <h2 className="text-2xl font-medium md:text-3xl">
                We build agent systems. This is what we do.
              </h2>
            </div>
            <div className="mt-6 space-y-4 leading-relaxed text-muted-foreground md:mt-0">
              <p>
                We didn&apos;t learn OpenClaw from a tutorial. We&apos;ve built
                agent orchestration tools, shipped them to production, and run
                our own multi-agent teams daily. When we deploy OpenClaw for you,
                we&apos;re drawing on problems we&apos;ve already solved on our
                own systems.
              </p>
              <p>
                Juno, Lacy Shell, our own internal agent teams all run on these
                same patterns. We know where the configuration gets tricky, which
                agent designs hold up under real workloads, and how to keep the
                whole system from falling over on day two.
              </p>
            </div>
          </div>

          {/* Process — timeline, not grid */}
          <div className="mt-24">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              How it works
            </p>
            <div className="mt-10 space-y-0">
              {[
                {
                  step: "01",
                  title: "Discovery",
                  body: "60-minute call to understand your use case, your team, and what you want your agents doing. We'll tell you honestly whether OpenClaw is the right fit or if something simpler would work.",
                },
                {
                  step: "02",
                  title: "Architecture & Design",
                  body: "We design your agent topology — roles, communication patterns, data flows, security model. You review and sign off before we build anything.",
                },
                {
                  step: "03",
                  title: "Build & Deploy",
                  body: "We configure OpenClaw, build your custom agents, set up monitoring and alerting, and deploy to your infrastructure. Typical timeline: 2–4 weeks.",
                },
                {
                  step: "04",
                  title: "Training & Handoff",
                  body: "Your team gets hands-on training. We cover day-to-day management, adding new agents, troubleshooting, and extending the system. Plus 30 days of support after handoff.",
                },
              ].map((s) => (
                <div
                  key={s.step}
                  className="grid border-t py-8 md:grid-cols-[3rem_10rem_1fr] md:gap-8"
                >
                  <span className="text-sm tabular-nums text-emerald-500/60">
                    {s.step}
                  </span>
                  <h3 className="text-lg font-medium">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground md:mt-0">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What's included */}
      <section className="bg-muted/30 py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="md:grid md:grid-cols-[1fr_1.5fr] md:gap-16">
            <div>
              <h2 className="text-2xl font-medium md:text-3xl">
                Every engagement includes
              </h2>
            </div>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 md:mt-0">
              {deliverables.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500/70" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Pricing
          </p>
          <p className="mt-3 max-w-lg text-muted-foreground">
            All packages include architecture design, deployment, team training,
            and 30 days post-launch support.
          </p>

          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-3">
            {packages.map((pkg) => (
              <div
                key={pkg.name}
                className={`flex flex-col bg-card p-8 ${
                  pkg.featured ? "bg-card" : ""
                }`}
              >
                {pkg.featured && (
                  <p className="mb-4 text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-500">
                    Most popular
                  </p>
                )}
                <h3 className="text-lg font-medium">{pkg.name}</h3>
                <p className="mt-2 text-2xl font-medium">{pkg.price}</p>
                <p className="mt-1 text-sm text-muted-foreground">{pkg.scope}</p>
                <ul className="mt-6 flex-1 space-y-2">
                  {pkg.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500/70" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <ScheduleCallModal
                    trigger={
                      <Button
                        className="w-full"
                        variant={pkg.featured ? "default" : "outline"}
                      >
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
      <section className="bg-muted/30 py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="md:grid md:grid-cols-[1fr_2fr] md:gap-16">
            <div>
              <h2 className="text-2xl font-medium md:text-3xl">
                Common questions
              </h2>
            </div>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq) => (
                <AccordionItem
                  key={faq.id}
                  value={faq.id}
                  className="border-b border-dashed"
                >
                  <AccordionTrigger className="cursor-pointer py-5 text-left text-[15px] hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="pb-2 leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="rounded-3xl bg-neutral-950 px-8 py-16 md:px-16 md:py-24">
            <h2 className="max-w-lg text-3xl font-medium text-white md:text-4xl">
              Ready to deploy?
            </h2>
            <p className="mt-4 max-w-xl text-neutral-400">
              Most projects start with a 30-minute call&mdash;no commitment,
              just a conversation about what you&apos;re trying to automate and
              whether OpenClaw is the right approach. If it&apos;s not,
              we&apos;ll tell you.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <ScheduleCallModal
                trigger={
                  <Button
                    size="lg"
                    className="bg-emerald-600 text-white hover:bg-emerald-500"
                  >
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
