/*
 * Portfolio Showcase
 *
 * An image-first, bento-style grid that showcases previous work. Replaces the
 * animated case-study marquee with a browsable, premium gallery. Server
 * Component by design: all motion is CSS (group hover), so it ships zero JS.
 *
 * Featured tiles (larger, top row) spotlight current Build & Serve clients
 * (Town of Harmony, RCB Construction). The remaining tiles carry marquee
 * credibility work (Twilio, Credit Karma, Swell Energy, and more).
 */

import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import { Link } from "@/components/primitives/link-with-transition";
import { cn } from "@/lib/utils";

interface PortfolioProject {
  id: string;
  title: string;
  category: string;
  description: string;
  image: string;
  href: string;
  /* External links open the live client site; internal links go to a case study. */
  external?: boolean;
  /* Tailwind col/height classes controlling this tile's footprint in the grid. */
  span: string;
  featured?: boolean;
}

const PROJECTS: PortfolioProject[] = [
  {
    id: "town-of-harmony",
    title: "Town of Harmony",
    category: "Government · Iredell County, NC",
    description:
      "A modern civic home for a historic North Carolina town — events, agendas, and resident services in one accessible place.",
    image: "/static/town-of-harmony/home.png",
    href: "https://townofharmony.org",
    external: true,
    span: "sm:col-span-2 lg:col-span-3 h-[320px] lg:h-[380px]",
    featured: true,
  },
  {
    id: "rcb-construction",
    title: "RCB Construction",
    category: "Construction · Charlotte, NC",
    description:
      "A polished marketing site for a Charlotte construction and home-remodeling firm, built to turn visitors into estimates.",
    image: "/static/rcb-construction/home.png",
    href: "https://rcbconstructionmgmt.com",
    external: true,
    span: "sm:col-span-2 lg:col-span-3 h-[320px] lg:h-[380px]",
    featured: true,
  },
  {
    id: "credit-karma",
    title: "Credit Karma",
    category: "Fintech · 120M+ users",
    description: "Credit monitoring and personalized financial products at scale.",
    image: "/static/credit-karma/credit-karma-1.png",
    href: "/work/credit-karma",
    span: "lg:col-span-2 h-[260px]",
  },
  {
    id: "twilio",
    title: "Twilio",
    category: "Developer tools",
    description: "Hardware + API experiences and developer resources.",
    image: "/static/twilio/hackpack/hackpack.png",
    href: "/work/twilio",
    span: "lg:col-span-2 h-[260px]",
  },
  {
    id: "swell-energy",
    title: "Swell Energy",
    category: "Clean energy · 10k+ users",
    description: "Customer platforms and internal tools for distributed energy.",
    image: "/static/swell-energy/swell-program.jpeg",
    href: "/work/swell-energy",
    span: "lg:col-span-2 h-[260px]",
  },
  {
    id: "long-game",
    title: "Long Game",
    category: "Fintech · 100k+ installs",
    description: "Gamified saving that makes personal finance genuinely fun.",
    image: "/static/long-game/longgame.png",
    href: "/work/longgame",
    span: "lg:col-span-2 h-[260px]",
  },
  {
    id: "viasat",
    title: "Viasat",
    category: "In-flight connectivity",
    description: "In-flight entertainment and connectivity experiences.",
    image: "/static/viasat/ife.jpg",
    href: "/work",
    span: "lg:col-span-2 h-[260px]",
  },
  {
    id: "novant-health",
    title: "Novant Health",
    category: "Healthcare",
    description: "Patient-facing portal for a major health system.",
    image: "/static/novant-health/novant-health-pf-portal.png",
    href: "/work",
    span: "lg:col-span-2 h-[260px]",
  },
];

const ProjectTile = ({ project }: { project: PortfolioProject }) => {
  const inner = (
    <>
      <Image
        src={project.image}
        alt={`${project.title} — ${project.category}`}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        className="object-cover object-top transition-transform duration-500 ease-out group-hover:scale-105"
      />

      {/* Readability scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

      {/* Category eyebrow — dark chip so it stays legible over light screenshots */}
      <span className="absolute left-4 top-4 z-10 rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white backdrop-blur-md ring-1 ring-white/15">
        {project.category}
      </span>

      {/* Hover affordance */}
      <span className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-md ring-1 ring-white/15 transition-all duration-300 group-hover:opacity-100 group-hover:-translate-y-0.5">
        <ArrowUpRight className="h-4 w-4" />
      </span>

      {/* Title + description */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-5">
        <h3
          className={cn(
            "font-semibold text-white drop-shadow",
            project.featured ? "text-2xl" : "text-lg"
          )}
        >
          {project.title}
        </h3>
        <p
          className={cn(
            "mt-1 max-w-md text-sm text-white/80",
            project.featured
              ? "opacity-100"
              : "translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
          )}
        >
          {project.description}
        </p>
      </div>
    </>
  );

  const className = cn(
    "group relative block overflow-hidden rounded-2xl ring-1 ring-black/5 dark:ring-white/10",
    "shadow-sm transition-shadow duration-300 hover:shadow-xl",
    project.span
  );

  if (project.external) {
    return (
      <a href={project.href} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    );
  }

  return (
    <Link href={project.href} className={className}>
      {inner}
    </Link>
  );
};

export const PortfolioShowcase = () => {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Selected work</p>
          <h2 className="mt-2 text-balance text-4xl font-semibold text-foreground">
            Websites, apps, and dashboards
            <br />
            we&apos;re proud of
          </h2>
        </div>
        <Link
          href="/work"
          className="group inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View all work
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {PROJECTS.map((project) => (
          <ProjectTile key={project.id} project={project} />
        ))}
      </div>
    </section>
  );
};
