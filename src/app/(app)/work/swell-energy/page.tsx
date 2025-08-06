import { Metadata } from "next";
import Image from "next/image";
import { Link } from "@/components/primitives/link-with-transition";
import { ArrowLeft, ExternalLink, Calendar, Users, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackNavigation } from "@/components/ui/back-navigation";

export const metadata: Metadata = {
  title: "Swell Energy - Case Study",
  description:
    "Building the future of distributed energy with React, Node.js, and modern web technologies",
};

export default function SwellEnergyPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <BackNavigation />

      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Zap className="h-8 w-8 text-green-600" />
            <h1 className="text-4xl font-bold">Swell Energy</h1>
          </div>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Building the future of distributed energy with advanced battery
            storage and solar solutions. Led development of customer-facing
            platforms and internal management tools.
          </p>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">React</Badge>
            <Badge variant="secondary">Node.js</Badge>
            <Badge variant="secondary">TypeScript</Badge>
            <Badge variant="secondary">PostgreSQL</Badge>
            <Badge variant="secondary">AWS</Badge>
            <Badge variant="secondary">D3.js</Badge>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-6 border-y">
          <div className="text-center">
            <Calendar className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">2022-2023</div>
            <div className="text-sm text-muted-foreground">Duration</div>
          </div>
          <div className="text-center">
            <Users className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">10k+</div>
            <div className="text-sm text-muted-foreground">Active Users</div>
          </div>
          <div className="text-center">
            <Zap className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">Senior</div>
            <div className="text-sm text-muted-foreground">Frontend Lead</div>
          </div>
        </div>

        {/* Main Image */}
        <div className="space-y-4">
          <Image
            src="/static/swell-energy/swell-program.jpeg"
            alt="Swell Energy Program Interface"
            width={800}
            height={500}
            className="w-full rounded-lg shadow-lg"
          />
          <p className="text-sm text-muted-foreground text-center">
            Customer program enrollment and management interface
          </p>
        </div>

        {/* Project Overview */}
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">Project Overview</h2>
          <div className="prose prose-gray dark:prose-invert max-w-none">
            <p>
              Swell Energy is revolutionizing the energy sector by building
              distributed battery networks that provide grid services while
              delivering savings to homeowners. As Senior Frontend Engineer, I
              led the development of multiple customer-facing and internal
              platforms.
            </p>

            <h3>Key Contributions</h3>
            <ul>
              <li>
                Built responsive customer enrollment and management portals
              </li>
              <li>
                Developed real-time energy monitoring dashboards with D3.js
                visualizations
              </li>
              <li>
                Implemented complex data tables for internal operations teams
              </li>
              <li>
                Created automated testing suites improving code reliability by
                40%
              </li>
              <li>
                Led migration from legacy systems to modern React architecture
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
                src="/static/swell-energy/swell-datatable.jpeg"
                alt="Swell Energy Data Platform"
                width={400}
                height={300}
                className="w-full rounded-lg shadow-md"
              />
              <p className="text-sm text-muted-foreground">
                Advanced data management platform for operations teams
              </p>
            </div>
            <div className="space-y-2">
              <Image
                src="/static/swell-energy/swell-user.jpeg"
                alt="Swell Energy User Portal"
                width={400}
                height={300}
                className="w-full rounded-lg shadow-md"
              />
              <p className="text-sm text-muted-foreground">
                Customer portal with real-time energy monitoring
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
                Built with React 18, TypeScript, and modern state management.
                Implemented micro-frontend architecture for scalability across
                multiple product lines.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Data Visualization</h4>
              <p className="text-sm text-muted-foreground">
                Custom D3.js charts and dashboards for real-time energy data,
                battery performance metrics, and grid interaction visualization.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Performance Optimization</h4>
              <p className="text-sm text-muted-foreground">
                Implemented lazy loading, code splitting, and caching
                strategies. Achieved 95+ Lighthouse scores across all
                user-facing applications.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex gap-4 pt-6">
          <Button asChild>
            <Link
              href="https://swellenergy.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Visit Swell Energy
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
