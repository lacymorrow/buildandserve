import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ArrowUp,
  CalendarCheck,
  Globe,
  Play,
  Plus,
  Signature,
  Sparkles,
  Target,
} from "lucide-react";

const MESCHAC_AVATAR = "https://avatars.githubusercontent.com/u/47919550?v=4";
const BERNARD_AVATAR = "https://avatars.githubusercontent.com/u/31113941?v=4";
const THEO_AVATAR = "https://avatars.githubusercontent.com/u/68236786?v=4";
const GLODIE_AVATAR = "https://avatars.githubusercontent.com/u/99137927?v=4";

export default function FeaturesSection() {
  return (
    <section>
      <div className="py-24">
        <div className="mx-auto w-full max-w-5xl px-6">
          <div>
            <h2 className="max-w-2xl text-4xl font-semibold text-balance text-foreground">
              From idea to launch, we&apos;ve got you covered
            </h2>
          </div>
          <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="group gap-0 overflow-hidden p-6">
              <Target className="size-5 text-primary" />
              <h3 className="mt-5 text-lg font-semibold text-foreground">Strategy & Design</h3>
              <p className="mt-3 text-balance text-muted-foreground">
                We work with you to define your product, identify your target audience, and create a
                beautiful, user-friendly design.
              </p>

              <MeetingIllustration />
            </Card>

            <Card className="group gap-0 overflow-hidden px-6 pt-6 pb-0">
              <CalendarCheck className="size-5 text-primary" />
              <h3 className="mt-5 text-lg font-semibold text-foreground">Development & Testing</h3>
              <p className="mt-3 text-balance text-muted-foreground">
                Our expert developers build your product with the latest technologies, ensuring
                it&apos;s fast, secure, and scalable. We test every aspect to ensure a flawless user
                experience.
              </p>

              <CodeReviewIllustration />
            </Card>
            <Card className="group gap-0 overflow-hidden px-6 pt-6 pb-0">
              <Sparkles className="size-5 text-primary" />
              <h3 className="mt-5 text-lg font-semibold text-foreground">Deployment & Support</h3>
              <p className="mt-3 text-balance text-muted-foreground">
                We handle the entire deployment process, and provide ongoing support to ensure your
                product is always running smoothly.
              </p>

              <div className="-mx-2 -mt-2 mask-b-from-50 px-2 pt-2">
                <AIAssistantIllustration />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}

const MeetingIllustration = () => {
  return (
    <Card
      aria-hidden
      className="mt-9 aspect-video gap-0 p-4 transition-transform duration-200 ease-in-out group-hover:-translate-y-1 group-hover:rotate-1"
    >
      <div className="relative hidden h-fit">
        <div className="absolute bottom-1.5 -left-1.5 rounded-md border-t border-red-700 bg-red-500 px-1 py-px text-[10px] font-medium text-white shadow-md shadow-red-500/35">
          PDF
        </div>
        <div className="h-10 w-8 rounded-md border bg-gradient-to-b from-zinc-100 to-zinc-200"></div>
      </div>
      <div className="mb-0.5 text-sm font-semibold">Strategy Meeting</div>
      <div className="mb-4 flex gap-2 text-sm">
        <span className="text-muted-foreground">2:30 - 3:45 PM</span>
      </div>
      <div className="mb-2 flex -space-x-1.5"></div>
      <div className="text-sm font-medium text-muted-foreground">Product Roadmap Discussion</div>
    </Card>
  );
};

const CodeReviewIllustration = () => {
  return (
    <div aria-hidden className="relative mt-6">
      <Card
        className="aspect-video w-4/5 translate-y-4 gap-0 p-3 transition-transform duration-200 ease-in-out select-none group-hover:-rotate-3"
        draggable={false}
      >
        <div className="mb-3 flex items-center gap-2">
          <div className="size-6 rounded-full border bg-background p-0.5 shadow shadow-zinc-950/5"></div>
          <span className="text-sm font-medium text-muted-foreground">Code Review</span>

          <span className="text-xs text-muted-foreground/75">2m</span>
        </div>

        <div className="ml-8 space-y-2">
          <div className="h-2 rounded-full bg-foreground/10"></div>
          <div className="h-2 w-3/5 rounded-full bg-foreground/10"></div>
          <div className="h-2 w-1/2 rounded-full bg-foreground/10"></div>
        </div>

        <Signature className="mt-3 ml-8 size-5" />
      </Card>
      <Card
        className="absolute -top-4 right-0 flex w-2/5 translate-y-4 gap-0 p-2 transition-transform duration-200 ease-in-out select-none group-hover:rotate-3"
        draggable={false}
      >
        <div className="m-auto flex size-10 rounded-full bg-foreground/5">
          <Play className="m-auto size-4 fill-foreground/50 stroke-foreground/50" />
        </div>
      </Card>
    </div>
  );
};

const AIAssistantIllustration = () => {
  return (
    <Card
      aria-hidden
      className="mt-6 aspect-video translate-y-4 gap-0 p-4 pb-6 transition-transform duration-200 select-none group-hover:translate-y-0"
      draggable={false}
    >
      <div className="w-fit">
        <Sparkles className="size-3.5 fill-purple-300 stroke-purple-300" />
        <p className="mt-2 line-clamp-2 text-sm">
          How do we deploy the new version of the app to production?
        </p>
      </div>
      <div className="-mx-3 mt-3 -mb-3 space-y-3 rounded-lg bg-foreground/5 p-3">
        <div className="text-sm text-muted-foreground">Ask our Assistant</div>

        <div className="flex justify-between">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-7 rounded-2xl bg-transparent shadow-none"
            >
              <Plus />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7 rounded-2xl bg-transparent shadow-none"
            >
              <Globe />
            </Button>
          </div>

          <Button size="icon" className="size-7 rounded-2xl bg-black">
            <ArrowUp strokeWidth={3} />
          </Button>
        </div>
      </div>
    </Card>
  );
};
