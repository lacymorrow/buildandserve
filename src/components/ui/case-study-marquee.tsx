"use client";

/*
 * Case Study Marquee Component
 *
 * A dynamic marquee that showcases portfolio projects along a curved path.
 * Features smooth animations, hover effects, and fade transitions.
 *
 * Usage:
 * ```tsx
 * // Basic usage with default projects
 * <CaseStudyMarquee />
 *
 * // Custom projects
 * <CaseStudyMarquee
 *   studies={[
 *     { id: 1, title: "My Project", image: "/image.jpg", href: "/project" }
 *   ]}
 *   baseVelocity={3}
 *   draggable={true}
 * />
 * ```
 */

import * as React from "react";
import { Link } from "@/components/primitives/link-with-transition";
import Image from "next/image";
import { cn } from "@/lib/utils";
import MarqueeAlongSvgPath from "@/components/fancy/blocks/marquee-along-svg-path";

interface CaseStudy {
  id: number;
  title: string;
  image: string;
  href: string;
}

// Default case studies featuring Lacy's best work
const DEFAULT_CASE_STUDIES: CaseStudy[] = [
  {
    id: 1,
    title: "Swell Energy",
    image: "/static/swell-energy/swell-program.jpeg",
    href: "/work/swell-energy",
  },
  {
    id: 2,
    title: "Twilio",
    image: "/static/twilio/hackpack/hackpack.png",
    href: "/work/twilio",
  },
  {
    id: 3,
    title: "Credit Karma",
    image: "/static/credit-karma/credit-karma-1.png",
    href: "/work/credit-karma",
  },

  {
    id: 4,
    title: "Long Game",
    image: "/static/long-game/longgame.png",
    href: "/work/longgame",
  },
  {
    id: 5,
    title: "Viasat",
    image: "/static/viasat/ife.jpg",
    href: "/work/viasat",
  },
  {
    id: 6,
    title: "Novant Health",
    image: "/static/novant-health/novant-health-pf-portal.png",
    href: "/work/novant-health",
  },
  {
    id: 7,
    title: "Twilio Magic",
    image: "/static/twilio/twilio-magic/screenshot.png",
    href: "/work/twilio",
  },
];

interface CaseStudyMarqueeProps {
  studies?: CaseStudy[];
  className?: string;
  baseVelocity?: number;
  showPath?: boolean;
  repeat?: number;
  slowdownOnHover?: boolean;
  draggable?: boolean;
}

/*
 * Curved SVG path for marquee animation
 * Starts from outside left viewport, creates dramatic upward sweep
 * Path coordinates: M-200,50 (start) -> C0,400 (control) -> 400,450 (peak) -> 1600,250 (end)
 */
const MARQUEE_PATH = "M-200,50 C0,400 400,450 1600,250";

/*
 * Individual case study item component
 * Features hover effects and responsive image scaling
 */
const CaseStudyItem = ({ study }: { study: CaseStudy }) => {
  return (
    <div className="w-[300px] h-[200px] flex items-center justify-center">
      <Link href={study.href} className="block relative group cursor-pointer">
        <Image
          src={study.image}
          alt={study.title}
          width={300}
          height={200}
          className="object-contain max-w-[300px] max-h-[200px] transition-all duration-300 group-hover:scale-105 group-hover:brightness-110"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg flex items-end justify-center">
          <span className="text-white text-sm font-semibold pb-4 px-2 text-center drop-shadow-lg">
            {study.title}
          </span>
        </div>
      </Link>
    </div>
  );
};

export const CaseStudyMarquee = ({
  studies = DEFAULT_CASE_STUDIES,
  className,
  baseVelocity = 2,
  showPath = false,
  repeat = 1,
  slowdownOnHover = true,
  draggable = false,
}: CaseStudyMarqueeProps) => {
  if (!studies || studies.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="">
        <div className="mx-auto w-full max-w-5xl px-6">
          <div>
            <h2 className="text-foreground max-w-2xl text-balance text-4xl font-semibold">Websites, Apps, Dashboards<br />Projects we are proud of</h2>
          </div>
          <div
            className={cn(
              "relative h-[500px] w-full overflow-hidden -mx-8 z-0",
              className,
            )}
          >
            <MarqueeAlongSvgPath
              path={MARQUEE_PATH}
              viewBox="-250 0 1900 450"
              width="100%"
              height="100%"
              baseVelocity={baseVelocity}
              showPath={showPath}
              repeat={repeat}
              slowdownOnHover={slowdownOnHover}
              draggable={draggable}
              dragSensitivity={0.1}
              grabCursor
              enableRollingZIndex
              preserveAspectRatio="xMidYMid meet"
              className="w-full h-full -my-16"
            >
              {studies.map((study) => (
                <CaseStudyItem key={study.id} study={study} />
              ))}
            </MarqueeAlongSvgPath>

            {/* Fade out gradients */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-0 top-0 w-48 h-full bg-gradient-to-r from-background to-transparent z-10" />
              <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-background to-transparent z-10" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/*
 * Sample case studies for Lacy Morrow's portfolio
 * Highlighting best projects: swell-energy, credit karma, and twilio
 */
export const sampleCaseStudies: CaseStudy[] = [
  {
    id: 1,
    title: "Swell Energy",
    image: "/images/case-studies/swell-energy.jpg",
    href: "/case-studies/swell-energy",
  },
  {
    id: 2,
    title: "Credit Karma",
    image: "/images/case-studies/credit-karma.jpg",
    href: "/case-studies/credit-karma",
  },
  {
    id: 3,
    title: "Twilio",
    image: "/images/case-studies/twilio.jpg",
    href: "/case-studies/twilio",
  },
  {
    id: 4,
    title: "Portfolio Website",
    image: "/images/case-studies/portfolio.jpg",
    href: "/case-studies/portfolio",
  },
  {
    id: 5,
    title: "Open Source Projects",
    image: "/images/case-studies/open-source.jpg",
    href: "/case-studies/open-source",
  },
];
