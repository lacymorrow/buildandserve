import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScheduleCallModal } from '@/components/modals/schedule-call-modal'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { ChevronRight, Check, ArrowLeft } from 'lucide-react'
import { routes } from '@/config/routes'
import { constructMetadata } from '@/config/metadata'

export const metadata: Metadata = constructMetadata({
    title: 'Paperclip AI Company Setup | Build And Serve',
    description:
        'Stand up an AI-powered company with agent teams via Paperclip. Company design, agent hiring, workflow setup, and governance. $3K–$10K setup + optional management.',
})

const steps = [
    {
        number: '01',
        title: 'Company Design',
        body: 'We map your operations to an agent team structure. Which roles do you need? What workflows should agents handle? Where does human oversight matter most? We design the org chart for your AI company.',
    },
    {
        number: '02',
        title: 'Agent Setup',
        body: 'We hire and configure your agents — each one specialized for its role, trained on your context, and tested against real tasks before going live.',
    },
    {
        number: '03',
        title: 'Workflow Configuration',
        body: 'Task routing, approval chains, escalation paths, budget controls, reporting dashboards. We wire up the operational backbone so your AI company runs smoothly from day one.',
    },
    {
        number: '04',
        title: 'Launch & Support',
        body: 'Your AI company goes live. We stick around for 60 days to help you manage and adjust. By the end, you\'re running it on your own — or you can add our managed service if you\'d rather not.',
    },
]

const benefits = [
    {
        title: 'A Real Operating System, Not Another Tool',
        body: "Paperclip isn't a chatbot builder or a workflow automation platform. It's a management layer for AI agent teams — with roles, task assignment, approval chains, budgets, escalation, and oversight.",
    },
    {
        title: 'Agents That Do Actual Work',
        body: 'Your agents write content, handle support tickets, analyze data, manage projects, and coordinate with each other on complex tasks. We configure each agent for your specific workflows.',
    },
    {
        title: 'You Stay in Control',
        body: 'Every action an agent takes is visible, auditable, and governed by rules you set. Budget limits, approval gates, escalation paths — you decide how much autonomy your agents get.',
    },
    {
        title: '60 Days of Hands-On Support',
        body: "The first two months are when you figure out how to actually run this thing. We're there for all of it. Adjusting agents, tuning workflows, answering the questions you didn't know you'd have.",
    },
]

const packages = [
    {
        name: 'Foundation',
        price: '$5,000–$8,000',
        priceNote: 'setup',
        description: 'Up to 3 agents, core workflows, basic governance',
        features: ['Company design session', 'Up to 3 configured agents', 'Core workflow setup', 'Basic governance controls', 'Team training', '60 days post-launch support'],
    },
    {
        name: 'Growth',
        price: '$8,000–$12,000',
        priceNote: 'setup',
        description: 'Up to 8 agents, advanced workflows, full governance suite',
        features: ['Everything in Foundation', 'Up to 8 configured agents', 'Advanced workflows', 'Full governance suite', 'Approval chains & budget controls', 'Reporting dashboards'],
        featured: true,
    },
    {
        name: 'Scale',
        price: '$12,000–$15,000+',
        priceNote: 'setup',
        description: 'Unlimited agents, complex operations, custom integrations',
        features: ['Everything in Growth', 'Unlimited agents', 'Complex multi-workflow ops', 'Custom integrations', 'Priority support', 'Optional ongoing management'],
    },
]

const faqs = [
    {
        id: 'faq-1',
        question: 'What exactly is an "AI company"?',
        answer: "It's a structured team of AI agents that operates like a real company — with defined roles, task assignments, approval workflows, budgets, and oversight. Instead of using AI as a tool, you're deploying AI as a workforce with governance.",
    },
    {
        id: 'faq-2',
        question: 'What kinds of tasks can AI agents handle?',
        answer: 'Content creation, customer support triage, data analysis, research, project coordination, code review, reporting, email drafting, social media management. Most knowledge work that follows repeatable patterns. We help you identify the highest-impact workflows during design.',
    },
    {
        id: 'faq-3',
        question: 'How much does it cost to run the agents after setup?',
        answer: "Agent operating costs depend on usage volume and which AI models your agents use. Typical monthly costs range from a few hundred dollars for light usage to a few thousand for heavy operations. We'll give you cost projections during the design phase so there are no surprises.",
    },
    {
        id: 'faq-4',
        question: 'Do I need to know how to code?',
        answer: "No. Paperclip is designed for non-technical operators. The management dashboard is visual, and we train you on everything during setup. If you can manage a team of people, you can manage a team of agents.",
    },
    {
        id: 'faq-5',
        question: 'What happens if an agent makes a mistake?',
        answer: 'Governance controls catch most issues before they reach anyone. Approval gates require human sign-off on sensitive actions. Budget limits prevent runaway spending. Every action is logged, so you can see exactly what happened and adjust.',
    },
]

export default function PaperclipPage() {
    return (
        <div className="min-h-screen">
            {/* Back nav */}
            <div className="mx-auto max-w-5xl px-6 pt-8">
                <Link
                    href={routes.services}
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    All services
                </Link>
            </div>

            {/* Hero */}
            <section className="py-16 md:py-24">
                <div className="mx-auto max-w-5xl px-6">
                    <div className="max-w-2xl">
                        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Paperclip AI Company Setup</p>
                        <h1 className="mt-4 text-balance text-5xl font-semibold md:text-6xl">
                            Build Your AI-Powered Company
                        </h1>
                        <p className="mt-8 max-w-xl text-balance text-lg text-muted-foreground">
                            We set up Paperclip for your business — agent teams, workflows, governance. A structured AI workforce handling real tasks, managed by you.
                        </p>
                        <p className="mt-4 text-sm text-muted-foreground">Setup starts at $5,000 · Optional monthly management $1K–$3K/mo</p>
                        <div className="mt-10">
                            <ScheduleCallModal
                                trigger={
                                    <Button size="lg" className="h-12 rounded-full pl-5 pr-3 text-base">
                                        <span className="text-nowrap">Book a discovery call</span>
                                        <ChevronRight className="ml-1" />
                                    </Button>
                                }
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Context */}
            <section className="py-16 md:py-24 bg-muted/30">
                <div className="mx-auto max-w-5xl px-6">
                    <div className="max-w-3xl">
                        <h2 className="text-balance text-3xl font-semibold md:text-4xl">Built by the People Who Built Paperclip</h2>
                        <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
                            <p>
                                Paperclip is our platform. When we set up your AI company, you're getting the team that designed the system and runs their own operations on it every day. That's the practical difference between a setup that works and one that needs constant fixing.
                            </p>
                            <p>
                                We're not writing reports about what you could do with AI someday. We're standing up a working system with real agents doing real tasks by the time we hand it over.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Benefits */}
            <section className="py-16 md:py-24">
                <div className="mx-auto max-w-5xl px-6">
                    <h2 className="text-balance text-3xl font-semibold md:text-4xl">What you get</h2>
                    <div className="mt-12 grid gap-8 md:grid-cols-2">
                        {benefits.map((benefit, i) => (
                            <div key={i} className="space-y-3">
                                <h3 className="text-lg font-semibold">{benefit.title}</h3>
                                <p className="text-muted-foreground leading-relaxed">{benefit.body}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-12 rounded-2xl border bg-card p-8">
                        <h3 className="font-semibold">Every engagement includes:</h3>
                        <ul className="mt-4 space-y-2">
                            {[
                                'Company design: we map your operations to an agent team structure that actually makes sense',
                                'Agent hiring and configuration for your specific workflows',
                                'Workflow setup: task routing, approval chains, escalation paths, budget controls',
                                'Governance configuration: permissions, spending limits, oversight dashboards',
                                'Team training on managing your AI company',
                                '60 days of management support to get you past the learning curve',
                            ].map((item) => (
                                <li key={item} className="flex items-start gap-3 text-sm">
                                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span className="text-muted-foreground">{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            {/* How it works */}
            <section className="py-16 md:py-24 bg-muted/30">
                <div className="mx-auto max-w-5xl px-6">
                    <h2 className="text-balance text-3xl font-semibold md:text-4xl">How it works</h2>
                    <div className="mt-12 space-y-0 divide-y rounded-2xl border bg-card overflow-hidden">
                        {steps.map((step) => (
                            <div key={step.number} className="flex gap-8 p-8">
                                <p className="text-3xl font-bold text-muted-foreground/30 tabular-nums shrink-0">{step.number}</p>
                                <div>
                                    <h3 className="font-semibold text-lg">{step.title}</h3>
                                    <p className="mt-2 text-muted-foreground leading-relaxed">{step.body}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section className="py-16 md:py-24">
                <div className="mx-auto max-w-5xl px-6">
                    <h2 className="text-balance text-3xl font-semibold md:text-4xl">Pricing</h2>
                    <p className="mt-4 text-muted-foreground">All packages include company design, agent setup, workflow configuration, team training, and 60 days post-launch support.</p>
                    <div className="mt-12 grid gap-6 md:grid-cols-3">
                        {packages.map((pkg) => (
                            <Card
                                key={pkg.name}
                                className={`flex flex-col rounded-2xl p-8 ${pkg.featured ? 'border-2 border-primary' : 'border'}`}
                            >
                                {pkg.featured && (
                                    <p className="mb-4 text-xs font-medium uppercase tracking-widest text-primary">Most popular</p>
                                )}
                                <h3 className="text-xl font-semibold">{pkg.name}</h3>
                                <div className="mt-2">
                                    <span className="text-2xl font-bold">{pkg.price}</span>
                                    {pkg.priceNote && <span className="ml-1 text-sm text-muted-foreground">{pkg.priceNote}</span>}
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">{pkg.description}</p>
                                <ul className="mt-6 flex-1 space-y-2">
                                    {pkg.features.map((f) => (
                                        <li key={f} className="flex items-start gap-2 text-sm">
                                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                            <span className="text-muted-foreground">{f}</span>
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-8">
                                    <ScheduleCallModal
                                        trigger={
                                            <Button
                                                className="w-full"
                                                variant={pkg.featured ? 'default' : 'outline'}
                                            >
                                                Get started
                                            </Button>
                                        }
                                    />
                                </div>
                            </Card>
                        ))}
                    </div>
                    <p className="mt-6 text-sm text-muted-foreground text-center">
                        Optional monthly management: $1,000–$3,000/mo — we handle ongoing optimization, agent additions, and system maintenance.
                    </p>
                </div>
            </section>

            {/* FAQ */}
            <section className="py-16 md:py-24 bg-muted/30">
                <div className="mx-auto max-w-5xl px-6">
                    <h2 className="text-balance text-3xl font-semibold md:text-4xl text-center">Common questions</h2>
                    <div className="mx-auto mt-12 max-w-2xl">
                        <Accordion type="single" collapsible className="bg-card ring-muted w-full rounded-2xl border px-8 py-3 shadow-sm ring-4 dark:ring-0">
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
                    <div className="rounded-3xl border px-6 py-12 text-center md:py-20 lg:py-32">
                        <h2 className="text-balance text-4xl font-semibold lg:text-5xl">Let's talk about your AI company.</h2>
                        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                            30-minute call, no commitment. We'll discuss what your operations look like, which agent roles make sense, and what the setup would involve. If Paperclip isn't the right fit, we'll say so.
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
        </div>
    )
}
