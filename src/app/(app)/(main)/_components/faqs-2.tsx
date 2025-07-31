'use client'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import Link from 'next/link'

export default function FAQsTwo() {
    const faqItems = [
        {
            id: 'item-1',
            question: 'What is your process?',
            answer: 'We start with a discovery call to understand your needs, then move on to a proposal. Once approved, we move to design, development, and deployment. We work with you every step of the way to ensure you are happy with the final product.',
        },
        {
            id: 'item-2',
            question: 'How much does a project cost?',
            answer: 'The cost of a project depends on the scope of work. We provide a detailed proposal with a breakdown of costs before we begin any work.',
        },
        {
            id: 'item-3',
            question: 'How long does a project take?',
            answer: 'The timeline for a project depends on the scope of work. We provide a detailed timeline with milestones before we begin any work.',
        },
        {
            id: 'item-4',
            question: 'What if I need changes after the project is complete?',
            answer: "We offer ongoing support and maintenance packages to ensure your project is always up to date and running smoothly. We can also make changes to your project on an hourly basis.",
        },
        {
            id: 'item-5',
            question: 'Do you offer a warranty?',
            answer: 'We offer a 30-day warranty on all of our work. If you find any bugs or issues with your project within 30 days of launch, we will fix them free of charge.',
        },
    ]

    return (
        <section className="py-16 md:py-24">
            <div className="mx-auto max-w-5xl px-4 md:px-6">
                <div className="mx-auto max-w-xl text-center">
                    <h2 className="text-balance text-3xl font-bold md:text-4xl lg:text-5xl">Frequently Asked Questions</h2>
                    <p className="text-muted-foreground mt-4 text-balance">Find answers to common questions about our process, pricing, and services.</p>
                </div>

                <div className="mx-auto mt-12 max-w-xl">
                    <Accordion
                        type="single"
                        collapsible
                        className="bg-card ring-muted w-full rounded-2xl border px-8 py-3 shadow-sm ring-4 dark:ring-0">
                        {faqItems.map((item) => (
                            <AccordionItem
                                key={item.id}
                                value={item.id}
                                className="border-dashed">
                                <AccordionTrigger className="cursor-pointer text-base hover:no-underline">{item.question}</AccordionTrigger>
                                <AccordionContent>
                                    <p className="text-base">{item.answer}</p>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>

                    <p className="text-center text-muted-foreground mt-6 px-8">
                        Can't find what you're looking for?{' '}
                        <Link
                            href="/contact"
                            className="text-primary font-medium hover:underline">
                            Contact us
                        </Link>
                    </p>
                </div>
            </div>
        </section>
    )
}
