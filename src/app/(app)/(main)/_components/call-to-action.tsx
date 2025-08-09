import { Button } from '@/components/ui/button'
import { ScheduleCallModal } from '@/components/modals/schedule-call-modal'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export default function CallToAction() {
    return (
        <section className="py-16">
            <div className="mx-auto max-w-5xl rounded-3xl border px-6 py-12 md:py-20 lg:py-32 select-none" draggable={false}>
                <div className="text-center">
                    <h2 className="text-balance text-4xl font-semibold lg:text-5xl">Ready to build your vision?</h2>
                    <p className="mt-4">Let's build something great together.</p>

                    <div className="mt-12 flex flex-wrap justify-center gap-4">
                        <Button
                            asChild
                            variant="outline"
                            size="lg">
                            <Link href="/contact">
                                <span>Get in touch</span>
                            </Link>
                        </Button>

                        <ScheduleCallModal
                            trigger={
                                <Button
                                    size="lg">
                                    <span className="text-nowrap">Schedule a call</span>
                                    <ChevronRight className="ml-1" />
                                </Button>
                            }
                        />
                    </div>
                </div>
            </div>
        </section>
    )
}
