
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { InfiniteSlider } from '@/components/ui/infinite-slider'
import { ProgressiveBlur } from '@/components/ui/progressive-blur'
import { ChevronRight } from 'lucide-react'
import { ScheduleCallModal } from '@/components/modals/schedule-call-modal'
import { TextEffect } from '@/components/ui/text-effect'

const companyLogos = [
    {
        src: '/logos/monochrome/credit-karma.svg',
        alt: 'Credit Karma Logo',
        href: '/work/credit-karma',
    },
    {
        src: '/logos/monochrome/swell-energy.svg',
        alt: 'Swell Energy Logo',
        href: '/work/swell-energy',
    },
    {
        src: '/logos/monochrome/invitae.svg',
        alt: 'Invitae Logo',
    },
    {
        src: '/logos/monochrome/optum.svg',
        alt: 'Optum Logo',
    },
    {
        src: '/logos/monochrome/novant-health.svg',
        alt: 'Novant Health Logo',
    },
    {
        src: '/logos/monochrome/red-ventures.svg',
        alt: 'Red Ventures Logo',
    },
    {
        src: '/logos/monochrome/twilio.svg',
        alt: 'Twilio Logo',
        href: '/work/twilio',
    },
    {
        src: '/logos/monochrome/yahoo.svg',
        alt: 'Yahoo Logo',
    },
    {
        src: '/logos/monochrome/viasat.svg',
        alt: 'Viasat Logo',
        href: '/work/viasat',
    },
];

export default function HeroSection() {
    return (
        <>
            <div className="overflow-x-hidden">
                <section>
                    <div className="py-24 md:pb-32 lg:pb-36">
                        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-5 lg:px-12">
                            <div className="mx-auto text-center lg:col-span-3 lg:mx-0 lg:text-left">
                                <div
                                    className="mt-8 max-w-2xl text-balance text-5xl md:text-6xl lg:mt-16 xl:text-7xl"
                                >

                                    <TextEffect
                                        preset="fade-in-blur"
                                        speedSegment={0.3}
                                        as="h1"
                                        className="mt-8 max-w-2xl text-balance text-5xl md:text-6xl lg:mt-16 xl:text-7xl">
                                        Your vision,
                                    </TextEffect>
                                    <TextEffect
                                        preset="fade-in-blur"
                                        speedSegment={0.3}
                                        delay={0.2}
                                        as="h1">
                                        engineered.
                                    </TextEffect>
                                </div>
                                <TextEffect
                                    per="line"
                                    preset="fade-in-blur"
                                    speedSegment={0.3}
                                    delay={0.5}
                                    as="p"
                                    className="mt-8 max-w-2xl text-balance text-lg">
                                    We build stunning, high-performance websites and applications that drive results. From concept to launch, we're the partner you need to bring your digital vision to life.
                                </TextEffect>

                                <div className="mt-12 flex flex-col items-center justify-center gap-2 sm:flex-row lg:justify-start">
                                    <Button
                                        key={2}
                                        asChild
                                        size="lg"
                                        variant="ghost"
                                        className="h-12 rounded-full px-5 text-base hover:bg-zinc-950/5 dark:hover:bg-white/5">
                                        <Link href="/work">
                                            <span className="text-nowrap">See our work</span>
                                        </Link>
                                    </Button>
                                    <ScheduleCallModal
                                        trigger={
                                            <Button
                                                size="lg"
                                                className="h-12 rounded-full pl-5 pr-3 text-base"
                                            >
                                                <span className="text-nowrap">Schedule a call</span>
                                                <ChevronRight className="ml-1" />
                                            </Button>
                                        }
                                    />
                                </div>
                            </div>
                            <div className="perspective-near relative lg:col-span-2">
                                <div className="before:border-foreground/5 before:bg-foreground/5 relative h-full before:absolute before:-inset-x-4 before:bottom-7 before:top-0 before:skew-x-6 before:rounded-[calc(var(--radius)+1rem)] before:border">
                                    <div className="bg-background rounded-(--radius) shadow-foreground/10 ring-foreground/5 relative h-full -translate-y-12 skew-x-6 overflow-hidden border border-transparent shadow-md ring-1">
                                        <Image
                                            src="/images/hero.webp"
                                            alt="Modern web application interface showcasing Build & Serve's development work"
                                            width="2880"
                                            height="1842"
                                            priority
                                            className="object-top-left size-full object-cover pointer-events-none select-none"
                                            draggable={false}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
                <section className="bg-background pb-2">
                    <div className="group relative m-auto max-w-7xl px-6">
                        <div className="flex flex-col items-center md:flex-row">
                            <div className="md:max-w-44 md:border-r md:pr-6">
                                <p className="text-end text-sm">Trusted by amazing companies</p>
                            </div>
                            <div className="relative py-6 md:w-[calc(100%-11rem)] select-none">
                                <InfiniteSlider
                                    speedOnHover={20}
                                    speed={40}
                                    gap={112}>
                                    {companyLogos.map((logo) => {
                                        const logoImage = (
                                            <Image
                                                className="mx-auto h-6 w-fit dark:invert select-none"
                                                src={logo.src}
                                                alt={logo.alt}
                                                width={120}
                                                height={24}
                                                draggable={false}
                                            />
                                        );

                                        if (logo.href) {
                                            return (
                                                <Link
                                                    key={logo.src}
                                                    href={logo.href}
                                                    className="flex"
                                                >
                                                    {logoImage}
                                                </Link>
                                            );
                                        }

                                        return (
                                            <div key={logo.src} className="flex">
                                                {logoImage}
                                            </div>
                                        );
                                    })}
                                </InfiniteSlider>

                                <div className="bg-linear-to-r from-background absolute inset-y-0 left-0 w-20" />
                                <div className="bg-linear-to-l from-background absolute inset-y-0 right-0 w-20" />
                                <ProgressiveBlur
                                    className="pointer-events-none absolute left-0 top-0 h-full w-20"
                                    direction="left"
                                    blurIntensity={1}
                                />
                                <ProgressiveBlur
                                    className="pointer-events-none absolute right-0 top-0 h-full w-20"
                                    direction="right"
                                    blurIntensity={1}
                                />
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </>
    )
}
