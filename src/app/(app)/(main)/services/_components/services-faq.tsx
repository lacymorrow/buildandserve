'use client'

import Link from 'next/link'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { routes } from '@/config/routes'

const faqs = [
    {
        id: 'faq-1',
        question: 'How long does a typical project take?',
        answer: 'A focused MVP is usually three to six weeks. A larger platform build can run three to six months. We scope it honestly during the discovery call.',
    },
    {
        id: 'faq-2',
        question: 'Do you work with non-technical founders?',
        answer: 'Yes. Part of the job is translating between what you want to build and what it actually takes to build it.',
    },
    {
        id: 'faq-3',
        question: 'What does the process look like?',
        answer: 'Discovery call, written proposal with scope and cost, then two-week sprints with demos. You always know where things stand.',
    },
    {
        id: 'faq-4',
        question: 'Do you handle design?',
        answer: "We can work from your designs, and we handle basic UI work ourselves. For complex product design, we'll tell you if you need a dedicated designer and can point you toward people we trust.",
    },
    {
        id: 'faq-5',
        question: 'Can I hire you just for consulting?',
        answer: 'Yes. Consulting and architecture reviews are available without a full build engagement.',
    },
]

export function ServicesFaq() {
    return (
        <section className="py-16 md:py-24">
            <div className="mx-auto max-w-5xl px-6">
                <div className="mx-auto max-w-xl text-center">
                    <h2 className="text-balance text-3xl font-bold md:text-4xl">Frequently asked questions</h2>
                </div>
                <div className="mx-auto mt-12 max-w-xl">
                    <Accordion
                        type="single"
                        collapsible
                        className="bg-card ring-muted w-full rounded-2xl border px-8 py-3 shadow-sm ring-4 dark:ring-0"
                    >
                        {faqs.map((item) => (
                            <AccordionItem key={item.id} value={item.id} className="border-dashed">
                                <AccordionTrigger className="cursor-pointer text-base hover:no-underline">
                                    {item.question}
                                </AccordionTrigger>
                                <AccordionContent>
                                    <p className="text-base">{item.answer}</p>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                    <p className="mt-6 px-8 text-center text-muted-foreground">
                        Still have questions?{' '}
                        <Link href={routes.contact} className="font-medium text-primary hover:underline">
                            Get in touch
                        </Link>
                    </p>
                </div>
            </div>
        </section>
    )
}
