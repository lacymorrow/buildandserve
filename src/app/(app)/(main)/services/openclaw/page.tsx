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
    title: 'OpenClaw Setup & Deployment | Build And Serve',
    description:
        'Deploy AI agent orchestration with OpenClaw. We handle architecture, configuration, agent design, deployment, and training. $5K–$15K project-based.',
})

const steps = [
    {
        number: '01',
        title: 'Discovery',
        body: '60-minute call to understand your use case, your team, and what you want your agents doing. We\'ll tell you honestly whether OpenClaw is the right fit or if something simpler would work.',
    },
    {
        number: '02',
        title: 'Architecture & Design',
        body: 'We design your agent topology — roles, communication patterns, data flows, security model. You review and sign off before we build anything.',
    },
    {
        number: '03',
        title: 'Build & Deploy',
        body: 'We configure OpenClaw, build your custom agents, set up monitoring and alerting, and deploy to your infrastructure. Typical timeline: 2–4 weeks.',
    },
    {
        number: '04',
        title: 'Training & Handoff',
        body: 'Your team gets hands-on training. We cover day-to-day management, adding new agents, troubleshooting, and extending the system. Plus 30 days of support after handoff.',
    },
]

const benefits = [
    {
        title: 'Architecture That Holds Up',
        body: 'Most agent deployments fail because the architecture was wrong from the start. We design your agent topology based on what actually works in production, not what looks good in a demo.',
    },
    {
        title: 'Deployed in Weeks, Not Months',
        body: 'A typical OpenClaw deployment takes 2–4 weeks from kickoff to production. We know the critical path and where teams waste time.',
    },
    {
        title: 'You Own Everything',
        body: 'No vendor lock-in, no proprietary wrapper. Your OpenClaw instance runs on your infrastructure, your accounts, your control.',
    },
    {
        title: '30 Days of Post-Launch Support',
        body: 'The first month after deployment is when the real questions come up. Bug fixes, configuration adjustments, agent tuning. We\'re there for it.',
    },
]

const packages = [
    {
        name: 'Starter',
        price: '$5,000–$7,500',
        description: 'Single workflow, up to 3 agents, standard deployment',
        features: ['Architecture design', 'Up to 3 custom agents', 'Standard deployment', 'Team training', '30 days post-launch support'],
    },
    {
        name: 'Professional',
        price: '$7,500–$12,000',
        description: 'Multi-workflow, up to 8 agents, custom agent development',
        features: ['Everything in Starter', 'Up to 8 custom agents', 'Multi-workflow orchestration', 'Custom agent development', 'Advanced monitoring'],
        featured: true,
    },
    {
        name: 'Enterprise',
        price: '$12,000–$15,000+',
        description: 'Complex orchestration, unlimited agents, dedicated support',
        features: ['Everything in Professional', 'Unlimited agents', 'Complex orchestration', 'Dedicated support contact', 'Optional ongoing retainer'],
    },
]

const faqs = [
    {
        id: 'faq-1',
        question: 'What is OpenClaw?',
        answer: 'OpenClaw is an open-source AI agent orchestration platform. It lets you deploy multiple AI agents that work together on tasks — coordinating, sharing context, and producing output that no single agent could handle alone. Think of it as the infrastructure layer for running AI teams.',
    },
    {
        id: 'faq-2',
        question: 'Do I need technical staff to manage OpenClaw after setup?',
        answer: 'Someone on your team should be comfortable with basic system administration. We train your team during handoff, and the 30-day support period covers the initial learning curve. For ongoing management without internal technical staff, ask about our managed service.',
    },
    {
        id: 'faq-3',
        question: 'How long does a typical deployment take?',
        answer: 'Two to four weeks from kickoff to production, depending on complexity. A single-workflow deployment with a few agents is on the faster end. Complex multi-agent systems with custom development take longer.',
    },
    {
        id: 'faq-4',
        question: 'Can I add more agents later?',
        answer: "Yes. We design the architecture so adding agents later doesn't require rebuilding what's already there. You can add them yourself after training, or bring us back for more complex additions.",
    },
    {
        id: 'faq-5',
        question: 'How is this different from just using ChatGPT or Claude directly?',
        answer: 'Direct AI usage is one person talking to one model. OpenClaw orchestration is multiple specialized agents coordinating on complex tasks — with monitoring, failure handling, and quality controls. It\'s the difference between asking someone a question and having a team work on a project.',
    },
]

export default function OpenClawPage() {
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
                        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">OpenClaw Setup & Deployment</p>
                        <h1 className="mt-4 text-balance text-5xl font-semibold md:text-6xl">
                            Deploy AI Agent Teams That Actually Work
                        </h1>
                        <p className="mt-8 max-w-xl text-balance text-lg text-muted-foreground">
                            We set up OpenClaw agent orchestration for your business — architecture, deployment, training. Your agents coordinating on real tasks in weeks, not months.
                        </p>
                        <p className="mt-4 text-sm text-muted-foreground">Starting at $5,000</p>
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
                        <h2 className="text-balance text-3xl font-semibold md:text-4xl">We Build Agent Systems. This Is What We Do.</h2>
                        <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
                            <p>
                                We didn't learn OpenClaw from a tutorial. We've built agent orchestration tools, shipped them to production, and run our own multi-agent teams daily. When we deploy OpenClaw for you, we're drawing on problems we've already solved on our own systems.
                            </p>
                            <p>
                                Juno, Lacy Shell, our own internal agent teams all run on these same patterns. We know where the configuration gets tricky, which agent designs hold up under real workloads, and how to keep the whole system from falling over on day two.
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
                                'Architecture review and agent design',
                                'Full OpenClaw deployment (infrastructure, configuration, security, monitoring)',
                                'Custom agent development for your specific workflows',
                                'Training for your team on managing and extending the system',
                                '30 days of post-deployment support',
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
                    <p className="mt-4 text-muted-foreground">All packages include architecture design, deployment, team training, and 30 days post-launch support.</p>
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
                                <p className="mt-2 text-2xl font-bold">{pkg.price}</p>
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
                        Optional ongoing support retainer available after any package.
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
                        <h2 className="text-balance text-4xl font-semibold lg:text-5xl">Ready to deploy?</h2>
                        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                            Most projects start with a 30-minute call — no commitment, just a conversation about what you're trying to automate and whether OpenClaw is the right approach. If it's not, we'll tell you.
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
