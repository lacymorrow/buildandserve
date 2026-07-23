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
import { CompanyStructure } from "../_components/company-structure";

export const metadata: Metadata = constructMetadata({
  title: "Paperclip AI Company Setup | Build And Serve",
  description:
    "Stand up an AI-powered company with agent teams via Paperclip. Company design, agent hiring, workflow setup, and governance. $5K–$15K setup + optional management.",
});

const deliverables = [
  "Company design: operations mapped to agent team structure",
  "Agent hiring and configuration for your workflows",
  "Task routing, approval chains, escalation paths",
  "Governance: permissions, spending limits, oversight dashboards",
  "Budget controls and reporting setup",
  "Team training on managing your AI company",
  "60 days of management support",
  "Documentation and runbooks for your team",
];

const packages = [
  {
    name: "Foundation",
    price: "$5,000–$8,000",
    scope: "Up to 3 agents, core workflows, basic governance",
    features: [
      "Company design session",
      "Up to 3 configured agents",
      "Core workflow setup",
      "Basic governance controls",
      "Team training",
      "60 days post-launch support",
    ],
  },
  {
    name: "Growth",
    price: "$8,000–$12,000",
    scope: "Up to 8 agents, advanced workflows, full governance suite",
    featured: true,
    features: [
      "Everything in Foundation",
      "Up to 8 configured agents",
      "Advanced workflows",
      "Full governance suite",
      "Approval chains & budget controls",
      "Reporting dashboards",
    ],
  },
  {
    name: "Scale",
    price: "$12,000–$15,000+",
    scope: "Unlimited agents, complex operations, custom integrations",
    features: [
      "Everything in Growth",
      "Unlimited agents",
      "Complex multi-workflow ops",
      "Custom integrations",
      "Priority support",
      "Optional ongoing management",
    ],
  },
];

const faqs = [
  {
    id: "faq-1",
    question: 'What exactly is an "AI company"?',
    answer:
      "It's a structured team of AI agents that operates like a real company — with defined roles, task assignments, approval workflows, budgets, and oversight. Instead of using AI as a tool, you're deploying AI as a workforce with governance.",
  },
  {
    id: "faq-2",
    question: "What kinds of tasks can AI agents handle?",
    answer:
      "Content creation, customer support triage, data analysis, research, project coordination, code review, reporting, email drafting, social media management. Most knowledge work that follows repeatable patterns. We help you identify the highest-impact workflows during design.",
  },
  {
    id: "faq-3",
    question: "How much does it cost to run the agents after setup?",
    answer:
      "Agent operating costs depend on usage volume and which AI models your agents use. Typical monthly costs range from a few hundred dollars for light usage to a few thousand for heavy operations. We'll give you cost projections during the design phase so there are no surprises.",
  },
  {
    id: "faq-4",
    question: "Do I need to know how to code?",
    answer:
      "No. Paperclip is designed for non-technical operators. The management dashboard is visual, and we train you on everything during setup. If you can manage a team of people, you can manage a team of agents.",
  },
  {
    id: "faq-5",
    question: "What happens if an agent makes a mistake?",
    answer:
      "Governance controls catch most issues before they reach anyone. Approval gates require human sign-off on sensitive actions. Budget limits prevent runaway spending. Every action is logged, so you can see exactly what happened and adjust.",
  },
];

export default function PaperclipPage() {
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

          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400/80">
              AI Company Platform
            </p>
            <h1 className="mt-4 text-balance text-4xl font-medium tracking-tight text-white sm:text-5xl md:text-[3.5rem] md:leading-[1.1]">
              Build Your AI-Powered Company
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-neutral-400">
              We set up Paperclip for your business&mdash;agent teams, workflows,
              governance. A structured AI workforce handling real tasks, managed
              by you.
            </p>
            <p className="mt-4 text-sm text-neutral-600">
              Setup starts at $5,000 &middot; Optional monthly management
              $1.5K–$3K/mo
            </p>
            <div className="mt-8">
              <ScheduleCallModal
                trigger={
                  <Button
                    size="lg"
                    className="h-12 rounded-full bg-amber-600 pl-5 pr-3 text-base text-white hover:bg-amber-500"
                  >
                    <span className="text-nowrap">Book a discovery call</span>
                    <ChevronRight className="ml-1" />
                  </Button>
                }
              />
            </div>
          </div>

          <div className="mt-16">
            <CompanyStructure />
          </div>
        </div>
      </section>

      {/* Credibility */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-medium md:text-3xl">
              Built by the people who built Paperclip
            </h2>
            <div className="mt-6 space-y-4 leading-relaxed text-muted-foreground">
              <p>
                Paperclip is our platform. When we set up your AI company,
                you&apos;re getting the team that designed the system and runs
                their own operations on it every day. That&apos;s the practical
                difference between a setup that works and one that needs constant
                fixing.
              </p>
              <p>
                We&apos;re not writing reports about what you could do with AI
                someday. We&apos;re standing up a working system with real agents
                doing real tasks by the time we hand it over.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What sets Paperclip apart — distinct layout: large callouts */}
      <section className="border-t py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Why Paperclip
          </p>
          <div className="mt-12 space-y-16">
            {[
              {
                title: "A Real Operating System, Not Another Tool",
                body: "Paperclip isn't a chatbot builder or a workflow automation platform. It's a management layer for AI agent teams — with roles, task assignment, approval chains, budgets, escalation, and oversight.",
              },
              {
                title: "Agents That Do Actual Work",
                body: "Your agents write content, handle support tickets, analyze data, manage projects, and coordinate with each other on complex tasks. We configure each agent for your specific workflows.",
              },
              {
                title: "You Stay in Control",
                body: "Every action an agent takes is visible, auditable, and governed by rules you set. Budget limits, approval gates, escalation paths — you decide how much autonomy your agents get.",
              },
              {
                title: "60 Days of Hands-On Support",
                body: "The first two months are when you figure out how to actually run this thing. We're there for all of it. Adjusting agents, tuning workflows, answering the questions you didn't know you'd have.",
              },
            ].map((b, i) => (
              <div
                key={b.title}
                className="grid gap-4 md:grid-cols-[3rem_1fr_1.5fr] md:gap-8"
              >
                <span className="hidden text-4xl font-light text-amber-500/30 md:block">
                  {String(i + 1)}
                </span>
                <h3 className="text-lg font-medium">{b.title}</h3>
                <p className="leading-relaxed text-muted-foreground">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process — horizontal steps */}
      <section className="bg-muted/30 py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            How it works
          </p>
          <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Company Design",
                body: "We map your operations to an agent team structure. Which roles do you need? What workflows should agents handle? Where does human oversight matter most?",
              },
              {
                title: "Agent Setup",
                body: "We hire and configure your agents — each one specialized for its role, trained on your context, and tested against real tasks before going live.",
              },
              {
                title: "Workflow Config",
                body: "Task routing, approval chains, escalation paths, budget controls, reporting dashboards. The operational backbone so your AI company runs smoothly from day one.",
              },
              {
                title: "Launch & Support",
                body: "Your AI company goes live. We stick around for 60 days to help you manage and adjust. By the end, you're running it on your own.",
              },
            ].map((step, i) => (
              <div key={step.title}>
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  {i < 3 && (
                    <div className="hidden h-px flex-1 bg-border lg:block" />
                  )}
                </div>
                <h3 className="font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What's included */}
      <section className="py-20 md:py-28">
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
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-500/70" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-muted/30 py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Pricing
          </p>
          <p className="mt-3 max-w-lg text-muted-foreground">
            All packages include company design, agent setup, workflow
            configuration, team training, and 60 days post-launch support.
          </p>

          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-3">
            {packages.map((pkg) => (
              <div key={pkg.name} className="flex flex-col bg-card p-8">
                {pkg.featured && (
                  <p className="mb-4 text-[10px] font-medium uppercase tracking-[0.2em] text-amber-500">
                    Most popular
                  </p>
                )}
                <h3 className="text-lg font-medium">{pkg.name}</h3>
                <p className="mt-2 text-2xl font-medium">{pkg.price}</p>
                <p className="mt-1 text-sm text-muted-foreground">{pkg.scope}</p>
                <ul className="mt-6 flex-1 space-y-2">
                  {pkg.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500/70" />
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
            Optional monthly management: $1,000–$3,000/mo&mdash;we handle
            ongoing optimization, agent additions, and system maintenance.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 md:py-28">
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
      <section className="pb-20 md:pb-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="rounded-3xl bg-neutral-950 px-8 py-16 md:px-16 md:py-24">
            <h2 className="max-w-lg text-3xl font-medium text-white md:text-4xl">
              Let&apos;s talk about your AI company.
            </h2>
            <p className="mt-4 max-w-xl text-neutral-400">
              30-minute call, no commitment. We&apos;ll discuss what your
              operations look like, which agent roles make sense, and what the
              setup would involve. If Paperclip isn&apos;t the right fit,
              we&apos;ll say so.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <ScheduleCallModal
                trigger={
                  <Button
                    size="lg"
                    className="bg-amber-600 text-white hover:bg-amber-500"
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
