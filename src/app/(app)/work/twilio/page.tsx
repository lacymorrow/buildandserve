import { Metadata } from "next";
import Image from "next/image";
import { Link } from "@/components/primitives/link-with-transition";
import {
  ArrowLeft,
  ExternalLink,
  Calendar,
  Users,
  MessageSquare,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackNavigation } from "@/components/ui/back-navigation";

export const metadata: Metadata = {
  title: "Twilio - Case Study",
  description:
    "Building developer tools and hackathon projects with Twilio's communication APIs",
};

export default function TwilioPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <BackNavigation />

      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-8 w-8 text-red-600" />
            <h1 className="text-4xl font-bold">Twilio</h1>
          </div>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Building innovative communication tools and developer experiences
            with Twilio's APIs. Created hackathon projects and developer
            resources that showcase the power of programmable communications.
          </p>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">JavaScript</Badge>
            <Badge variant="secondary">Node.js</Badge>
            <Badge variant="secondary">Twilio API</Badge>
            <Badge variant="secondary">WebRTC</Badge>
            <Badge variant="secondary">Hardware</Badge>
            <Badge variant="secondary">IoT</Badge>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-6 border-y">
          <div className="text-center">
            <Calendar className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">2020-2021</div>
            <div className="text-sm text-muted-foreground">Duration</div>
          </div>
          <div className="text-center">
            <Users className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">Developer</div>
            <div className="text-sm text-muted-foreground">Advocate</div>
          </div>
          <div className="text-center">
            <MessageSquare className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">Hackpack</div>
            <div className="text-sm text-muted-foreground">Creator</div>
          </div>
        </div>

        {/* Main Image */}
        <div className="space-y-4">
          <Image
            src="/static/twilio/hackpack/hackpack.png"
            alt="Twilio Hackpack Hardware Project"
            width={800}
            height={500}
            className="w-full rounded-lg shadow-lg"
          />
          <p className="text-sm text-muted-foreground text-center">
            Custom hardware hackpack combining IoT sensors with Twilio
            communication APIs
          </p>
        </div>

        {/* Project Overview */}
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">Project Overview</h2>
          <div className="prose prose-gray dark:prose-invert max-w-none">
            <p>
              Twilio empowers developers to build the future of communications
              with powerful APIs for voice, video, messaging, and more. I
              created innovative hackpack projects that demonstrate creative
              applications of Twilio's communication platform.
            </p>

            <h3>Key Contributions</h3>
            <ul>
              <li>
                Designed and built physical hackpack combining hardware with
                Twilio APIs
              </li>
              <li>
                Created educational resources for developer community workshops
              </li>
              <li>Developed proof-of-concept IoT communication projects</li>
              <li>
                Built interactive demos showcasing SMS, voice, and video
                capabilities
              </li>
              <li>
                Contributed to open-source Twilio SDK examples and documentation
              </li>
              <li>
                Led hackathon workshops teaching developers communication API
                integration
              </li>
            </ul>
          </div>
        </div>

        {/* Technical Details */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Technical Implementation</h3>
          <div className="bg-muted/50 rounded-lg p-6 space-y-4">
            <div>
              <h4 className="font-medium mb-2">Hardware Integration</h4>
              <p className="text-sm text-muted-foreground">
                Custom PCB design with integrated sensors, LED displays, and
                wireless connectivity. Seamlessly interfaces with Twilio APIs
                for real-world communication triggers.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">API Integration</h4>
              <p className="text-sm text-muted-foreground">
                Utilized Twilio's REST APIs for SMS, Voice, and Video
                communication. Implemented webhook endpoints for real-time event
                processing and response.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Developer Experience</h4>
              <p className="text-sm text-muted-foreground">
                Created comprehensive setup guides, code examples, and
                interactive tutorials to help developers quickly prototype
                communication-enabled applications.
              </p>
            </div>
          </div>
        </div>

        {/* Project Features */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Hackpack Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="font-medium mb-2">Smart Notifications</h4>
              <p className="text-sm text-muted-foreground">
                Environmental sensors trigger SMS/voice alerts when thresholds
                are exceeded
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="font-medium mb-2">Interactive Controls</h4>
              <p className="text-sm text-muted-foreground">
                Respond to text messages to control hardware components remotely
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="font-medium mb-2">Visual Feedback</h4>
              <p className="text-sm text-muted-foreground">
                LED displays and indicators provide real-time status and
                communication feedback
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="font-medium mb-2">Extensible Design</h4>
              <p className="text-sm text-muted-foreground">
                Modular architecture allows developers to add custom sensors and
                communication flows
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex gap-4 pt-6">
          <Button asChild>
            <Link
              href="https://twilio.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Visit Twilio
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
