import Link from "next/link";
import { routes } from "@/config/routes";
import { siteConfig } from "@/config/site-config";

export default function FAQs() {
    return (
        <section className="scroll-py-16 py-16 md:scroll-py-32 md:py-32">
            <div className="mx-auto max-w-5xl px-6">
                <div className="grid gap-y-12 px-2 lg:[grid-template-columns:1fr_auto]">
                    <div className="text-center lg:text-left">
                        <h2 className="mb-4 text-3xl font-semibold md:text-4xl">
                            Frequently <br className="hidden lg:block" /> Asked <br className="hidden lg:block" />
                            Questions
                        </h2>
                        <p>
                            Answers about our process, pricing, and support. Still curious?{" "}
                            <Link href={routes.contact} className="text-primary font-medium hover:underline">
                                Get in touch
                            </Link>
                            .
                        </p>
                    </div>

                    <div className="divide-y divide-dashed sm:mx-auto sm:max-w-lg lg:mx-0">
                        <div className="pb-6">
                            <h3 className="font-medium">What is your process?</h3>
                            <p className="text-muted-foreground mt-4">We start with a free 30-minute discovery call to understand your needs, then send a written proposal with scope, cost, and timeline. Once approved, we move through design, development, and deployment in two-week sprints with demos, so you always know where things stand.</p>
                        </div>
                        <div className="py-6">
                            <h3 className="font-medium">How much does a project cost?</h3>
                            <p className="text-muted-foreground my-4">Pricing is published so you can budget before we ever get on a call. Typical ranges:</p>
                            <ul className="list-outside list-disc space-y-2 pl-4">
                                <li className="text-muted-foreground">Starter sites from $7,500</li>
                                <li className="text-muted-foreground">Business sites from $15,000</li>
                                <li className="text-muted-foreground">Custom web apps from $35,000</li>
                                <li className="text-muted-foreground">Hourly work at $150/hr, minimum engagement $5,000</li>
                            </ul>
                            <p className="text-muted-foreground mt-4">
                                See the full breakdown on our{" "}
                                <Link href={routes.pricing} className="text-primary font-medium hover:underline">
                                    pricing page
                                </Link>
                                . Every project gets a fixed quote after the discovery call.
                            </p>
                        </div>
                        <div className="py-6">
                            <h3 className="font-medium">How long does a project take?</h3>
                            <p className="text-muted-foreground mt-4">A focused MVP is usually three to six weeks. A larger platform build can run three to six months. We scope it honestly during the discovery call and give you a timeline with milestones before any work begins.</p>
                        </div>
                        <div className="py-6">
                            <h3 className="font-medium">What happens after launch?</h3>
                            <p className="text-muted-foreground mt-4">Our maintenance care plans ($99–$599/month) cover tested updates, daily backups, monitoring, and included dev hours. Active care-plan clients also get a discounted $125/hr member rate for new work. Prefer ad hoc? We handle one-off changes at our standard hourly rate.</p>
                        </div>
                        <div className="py-6">
                            <h3 className="font-medium">Do you offer a warranty?</h3>
                            <p className="text-muted-foreground mt-4">Yes. Every project includes a 30-day warranty. If you find a bug within 30 days of launch, we fix it free of charge.</p>
                        </div>
                        <div className="py-6">
                            <h3 className="font-medium">How do I reach you?</h3>
                            <p className="text-muted-foreground mt-4">
                                Email us at{" "}
                                <a href={`mailto:${siteConfig.email.support}`} className="text-primary font-medium hover:underline">
                                    {siteConfig.email.support}
                                </a>
                                , send a message through the{" "}
                                <Link href={routes.contact} className="text-primary font-medium hover:underline">
                                    contact page
                                </Link>
                                , or schedule a call. We respond within one business day.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
