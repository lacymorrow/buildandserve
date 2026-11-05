import type { Metadata } from "next";
import { constructMetadata } from "@/config/metadata";
import Image from "next/image";
import { Link } from "@/components/primitives/link-with-transition";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Users,
  Zap,
  CreditCard,
  MessageSquare,
  Gamepad2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = constructMetadata({
  path: "/work",
  title: "Work & Projects - Portfolio",
  description:
    "Featured work and case studies showcasing expertise in React, TypeScript, and modern web development",
});

const projects = [
  {
    id: "swell-energy",
    title: "Swell Energy",
    description:
      "Building the future of distributed energy with advanced battery storage and solar solutions. Led development of customer-facing platforms and internal management tools.",
    image: "/static/swell-energy/swell-program.jpeg",
    href: "/work/swell-energy",
    technologies: ["React", "Node.js", "TypeScript", "PostgreSQL", "AWS", "D3.js"],
    duration: "2022-2023",
    scale: "10k+ Users",
    role: "Senior Frontend Lead",
    icon: <Zap className="h-6 w-6 text-green-600" />,
  },
  {
    id: "credit-karma",
    title: "Credit Karma",
    description:
      "Empowering millions of Americans to make financial progress. Built modern web applications for credit monitoring, financial products, and personalized recommendations.",
    image: "/static/credit-karma/credit-karma-1.png",
    href: "/work/credit-karma",
    technologies: ["React", "Redux", "TypeScript", "Node.js", "GraphQL", "A/B Testing"],
    duration: "2021-2022",
    scale: "120M+ Users",
    role: "Senior Frontend Engineer",
    icon: <CreditCard className="h-6 w-6 text-blue-600" />,
  },
  {
    id: "twilio",
    title: "Twilio",
    description:
      "Building innovative communication tools and developer experiences with Twilio's APIs. Created hackathon projects and developer resources.",
    image: "/static/twilio/hackpack/hackpack.png",
    href: "/work/twilio",
    technologies: ["JavaScript", "Node.js", "Twilio API", "WebRTC", "Hardware", "IoT"],
    duration: "2020-2021",
    scale: "Developer",
    role: "Hackpack Creator",
    icon: <MessageSquare className="h-6 w-6 text-red-600" />,
  },
  {
    id: "longgame",
    title: "Long Game",
    description:
      "Making personal finance fun through gamification. Built mobile-first experiences that turn saving money into an engaging game with real financial rewards.",
    image: "/static/long-game/longgame.png",
    href: "/work/longgame",
    technologies: ["React Native", "TypeScript", "Redux", "Firebase", "Stripe", "Game Design"],
    duration: "2020-2021",
    scale: "100k+ Downloads",
    role: "Senior Mobile Engineer",
    icon: <Gamepad2 className="h-6 w-6 text-purple-600" />,
  },
];

export default function WorkPage() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <div className="space-y-4">
          <h1 className="text-4xl font-bold">Work & Projects</h1>
          <p className="max-w-3xl text-xl leading-relaxed text-muted-foreground">
            Featured case studies showcasing expertise in React, TypeScript, and modern web
            development. From fintech platforms serving millions to innovative hardware projects.
          </p>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {projects.map((project) => (
          <Card
            key={project.id}
            className="group flex h-full flex-col gap-0 overflow-hidden py-0 transition-all duration-300 hover:shadow-lg"
          >
            <div className="relative">
              <Image
                src={project.image}
                alt={project.title}
                width={600}
                height={300}
                className="h-48 w-full bg-muted/20 object-contain transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute top-4 left-4">{project.icon}</div>
            </div>

            <CardHeader className="gap-4 p-6">
              <div className="space-y-2">
                <CardTitle className="text-2xl">{project.title}</CardTitle>
                <CardDescription className="line-clamp-3 leading-relaxed">
                  {project.description}
                </CardDescription>
              </div>

              <div className="flex flex-wrap gap-2">
                {project.technologies.slice(0, 4).map((tech) => (
                  <Badge key={tech} variant="secondary" className="text-xs">
                    {tech}
                  </Badge>
                ))}
                {project.technologies.length > 4 && (
                  <Badge variant="outline" className="text-xs">
                    +{project.technologies.length - 4} more
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4 p-6 pt-0">
              {/* Metrics */}
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <Calendar className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                  <div className="text-sm font-medium">{project.duration}</div>
                  <div className="text-xs text-muted-foreground">Duration</div>
                </div>
                <div>
                  <Users className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                  <div className="text-sm font-medium">{project.scale}</div>
                  <div className="text-xs text-muted-foreground">Scale</div>
                </div>
                <div>
                  <div className="mx-auto mb-1 h-4 w-4 rounded-full bg-primary/20" />
                  <div className="text-sm font-medium">{project.role}</div>
                  <div className="text-xs text-muted-foreground">Role</div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="mt-auto p-6 pt-0">
              <Button asChild className="group w-full">
                <Link href={project.href}>
                  View Case Study
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Call to Action */}
      <div className="mt-16 space-y-4 text-center">
        <h2 className="text-2xl font-semibold">Interested in working together?</h2>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          We&apos;re always excited to take on new challenges and build amazing products. Let&apos;s
          discuss how we can bring your ideas to life.
        </p>
        <div className="flex flex-col justify-center gap-4 pt-4 sm:flex-row">
          <Button asChild>
            <Link href="/contact">Get In Touch</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Back to Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
