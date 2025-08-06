import { Metadata } from "next";
import Image from "next/image";
import { Link } from "@/components/primitives/link-with-transition";
import {
  ArrowLeft,
  ExternalLink,
  Calendar,
  Users,
  Gamepad2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackNavigation } from "@/components/ui/back-navigation";

export const metadata: Metadata = {
  title: "Long Game - Case Study",
  description:
    "Gamifying personal finance with React Native, making saving money fun and engaging",
};

export default function LongGamePage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <BackNavigation />

      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Gamepad2 className="h-8 w-8 text-purple-600" />
            <h1 className="text-4xl font-bold">Long Game</h1>
          </div>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Making personal finance fun through gamification. Built mobile-first
            experiences that turn saving money into an engaging game with real
            financial rewards.
          </p>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">React Native</Badge>
            <Badge variant="secondary">TypeScript</Badge>
            <Badge variant="secondary">Redux</Badge>
            <Badge variant="secondary">Firebase</Badge>
            <Badge variant="secondary">Stripe</Badge>
            <Badge variant="secondary">Game Design</Badge>
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
            <div className="text-2xl font-bold">100k+</div>
            <div className="text-sm text-muted-foreground">App Downloads</div>
          </div>
          <div className="text-center">
            <Gamepad2 className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">Senior</div>
            <div className="text-sm text-muted-foreground">Mobile Engineer</div>
          </div>
        </div>

        {/* Main Image */}
        <div className="space-y-4">
          <Image
            src="/static/long-game/longgame.png"
            alt="Long Game Mobile App Interface"
            width={800}
            height={500}
            className="w-full rounded-lg shadow-lg"
          />
          <p className="text-sm text-muted-foreground text-center">
            Gamified savings platform with mini-games and financial rewards
          </p>
        </div>

        {/* Project Overview */}
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">Project Overview</h2>
          <div className="prose prose-gray dark:prose-invert max-w-none">
            <p>
              Long Game revolutionizes personal finance by turning saving money
              into an engaging game. Users play mini-games with their actual
              savings, earning rewards while building healthy financial habits.
              As Senior Mobile Engineer, I built core gaming experiences and
              financial integrations.
            </p>

            <h3>Key Contributions</h3>
            <ul>
              <li>
                Built cross-platform mobile app with React Native serving 100k+
                users
              </li>
              <li>
                Developed interactive mini-games with smooth 60fps animations
              </li>
              <li>
                Implemented secure financial integrations with banking APIs and
                Stripe
              </li>
              <li>
                Created gamification systems with achievements, streaks, and
                rewards
              </li>
              <li>Built real-time multiplayer gaming features with Firebase</li>
              <li>Designed user onboarding flow increasing retention by 35%</li>
            </ul>
          </div>
        </div>

        {/* Technical Details */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Technical Implementation</h3>
          <div className="bg-muted/50 rounded-lg p-6 space-y-4">
            <div>
              <h4 className="font-medium mb-2">Mobile Architecture</h4>
              <p className="text-sm text-muted-foreground">
                React Native with TypeScript for type safety and Redux for state
                management. Custom native modules for device-specific features
                and performance optimization.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Game Engine</h4>
              <p className="text-sm text-muted-foreground">
                Custom game engine built with React Native Reanimated 2 for
                smooth 60fps animations. Implements physics simulations and
                collision detection for engaging gameplay.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Financial Security</h4>
              <p className="text-sm text-muted-foreground">
                Bank-level security with encrypted data transmission, secure
                token management, and compliance with financial regulations
                including PCI DSS standards.
              </p>
            </div>
          </div>
        </div>

        {/* Game Features */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Game Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="font-medium mb-2">Mini-Games</h4>
              <p className="text-sm text-muted-foreground">
                Multiple engaging games including coin flips, wheel spins, and
                scratch cards
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="font-medium mb-2">Real Rewards</h4>
              <p className="text-sm text-muted-foreground">
                Win actual money that goes directly into your savings account
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="font-medium mb-2">Social Gaming</h4>
              <p className="text-sm text-muted-foreground">
                Compete with friends and family in multiplayer savings
                challenges
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="font-medium mb-2">Progress Tracking</h4>
              <p className="text-sm text-muted-foreground">
                Visualize savings goals with gamified progress bars and
                achievement badges
              </p>
            </div>
          </div>
        </div>

        {/* Impact */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Impact & Results</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">$2M+</div>
              <div className="text-sm text-muted-foreground">
                Total User Savings
              </div>
            </div>
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">85%</div>
              <div className="text-sm text-muted-foreground">
                User Retention Rate
              </div>
            </div>
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">4.8★</div>
              <div className="text-sm text-muted-foreground">
                App Store Rating
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex gap-4 pt-6">
          <Button variant="outline" asChild>
            <Link href="/work">View More Work</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
