import { Metadata } from "next";
import Image from "next/image";
import { Link } from "@/components/primitives/link-with-transition";
import {
  ArrowLeft,
  ExternalLink,
  Calendar,
  Users,
  CreditCard,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackNavigation } from "@/components/ui/back-navigation";

export const metadata: Metadata = {
  title: "Credit Karma - Case Study",
  description:
    "Building financial wellness tools with React, helping millions manage their credit and finances",
};

export default function CreditKarmaPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <BackNavigation />

      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <CreditCard className="h-8 w-8 text-blue-600" />
            <h1 className="text-4xl font-bold">Credit Karma</h1>
          </div>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Empowering millions of Americans to make financial progress. Built
            modern web applications for credit monitoring, financial products,
            and personalized recommendations.
          </p>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">React</Badge>
            <Badge variant="secondary">Redux</Badge>
            <Badge variant="secondary">TypeScript</Badge>
            <Badge variant="secondary">Node.js</Badge>
            <Badge variant="secondary">GraphQL</Badge>
            <Badge variant="secondary">A/B Testing</Badge>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-6 border-y">
          <div className="text-center">
            <Calendar className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">2021-2022</div>
            <div className="text-sm text-muted-foreground">Duration</div>
          </div>
          <div className="text-center">
            <Users className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">120M+</div>
            <div className="text-sm text-muted-foreground">
              Registered Users
            </div>
          </div>
          <div className="text-center">
            <CreditCard className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">Senior</div>
            <div className="text-sm text-muted-foreground">
              Frontend Engineer
            </div>
          </div>
        </div>

        {/* Main Image */}
        <div className="space-y-4">
          <Image
            src="/static/credit-karma/credit-karma-1.png"
            alt="Credit Karma Dashboard Interface"
            width={800}
            height={500}
            className="w-full rounded-lg shadow-lg"
          />
          <p className="text-sm text-muted-foreground text-center">
            Main dashboard showing credit score monitoring and financial
            insights
          </p>
        </div>

        {/* Project Overview */}
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">Project Overview</h2>
          <div className="prose prose-gray dark:prose-invert max-w-none">
            <p>
              Credit Karma provides free credit scores, reports, and
              personalized financial insights to over 120 million members. As a
              Senior Frontend Engineer, I contributed to core user experiences
              and helped scale the platform for millions of daily active users.
            </p>

            <h3>Key Contributions</h3>
            <ul>
              <li>
                Built responsive credit monitoring dashboards with real-time
                score updates
              </li>
              <li>
                Developed personalized financial product recommendation engines
              </li>
              <li>
                Implemented A/B testing framework improving conversion rates by
                25%
              </li>
              <li>
                Created accessible mobile-first interfaces serving 70M+ mobile
                users
              </li>
              <li>
                Led performance optimization reducing page load times by 40%
              </li>
              <li>
                Mentored junior developers and established frontend code
                standards
              </li>
            </ul>
          </div>
        </div>

        {/* Screenshots Grid */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Platform Screenshots</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Image
                src="/static/credit-karma/credit-karma-5.png"
                alt="Credit Karma Mobile Experience"
                width={400}
                height={300}
                className="w-full rounded-lg shadow-md"
              />
              <p className="text-sm text-muted-foreground">
                Mobile-optimized credit monitoring and recommendations
              </p>
            </div>
            <div className="space-y-2">
              <Image
                src="/static/credit-karma/credit-karma-8.png"
                alt="Credit Karma Financial Products"
                width={400}
                height={300}
                className="w-full rounded-lg shadow-md"
              />
              <p className="text-sm text-muted-foreground">
                Personalized financial product matching and recommendations
              </p>
            </div>
          </div>
        </div>

        {/* Technical Details */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Technical Implementation</h3>
          <div className="bg-muted/50 rounded-lg p-6 space-y-4">
            <div>
              <h4 className="font-medium mb-2">Frontend Architecture</h4>
              <p className="text-sm text-muted-foreground">
                Built with React, Redux for state management, and TypeScript for
                type safety. Implemented component library used across 20+
                product teams.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Performance & Scale</h4>
              <p className="text-sm text-muted-foreground">
                Optimized for high traffic with code splitting, lazy loading,
                and CDN integration. Maintained 95+ Lighthouse scores while
                serving millions of daily users.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">A/B Testing & Analytics</h4>
              <p className="text-sm text-muted-foreground">
                Implemented robust experimentation framework with feature flags,
                user segmentation, and detailed conversion tracking across the
                entire user journey.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex gap-4 pt-6">
          <Button asChild>
            <Link
              href="https://creditkarma.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Visit Credit Karma
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/work">View More Work</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
