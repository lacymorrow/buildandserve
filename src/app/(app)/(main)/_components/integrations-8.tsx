import { Gemini, Replit, GooglePaLM, MagicUI, VSCodium, MediaWiki } from "@/components/logos";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function IntegrationsSection() {
  return (
    <section>
      <div className="bg-muted py-24 md:py-32 dark:bg-background">
        <div className="mx-auto flex flex-col px-6 md:grid md:max-w-5xl md:grid-cols-2 md:gap-12">
          <div className="order-last mt-6 flex flex-col gap-12 md:order-first">
            <div className="space-y-6">
              <h2 className="text-3xl font-semibold text-balance md:text-4xl lg:text-5xl">
                Integrate with your favorite LLMs
              </h2>
              <p className="text-muted-foreground">
                Connect seamlessly with popular platforms and services to enhance your workflow.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href="#">Get Started</Link>
              </Button>
            </div>

            <div className="mt-auto grid grid-cols-[auto_1fr] gap-3">
              <div className="flex aspect-square items-center justify-center border bg-background">
                <MediaWiki className="size-9" />
              </div>
              <blockquote>
                <p>Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quos.</p>
                <div className="mt-2 flex gap-2 text-sm">
                  <cite>John Doe</cite>
                  <p className="text-muted-foreground">Founder, MediaWiki</p>
                </div>
              </blockquote>
            </div>
          </div>

          <div className="-mx-6 [mask-image:radial-gradient(ellipse_100%_100%_at_50%_0%,#000_70%,transparent_100%)] px-6 sm:mx-auto sm:max-w-md md:-mx-6 md:mr-0 md:ml-auto">
            <div className="rounded-2xl border bg-background p-3 shadow-lg md:pb-12 dark:bg-muted/50">
              <div className="grid grid-cols-2 gap-2">
                <Integration
                  icon={<Gemini />}
                  name="Gemini"
                  description="The AI model that powers Google's search engine."
                />
                <Integration
                  icon={<Replit />}
                  name="Replit"
                  description="The AI model that powers Google's search engine."
                />
                <Integration
                  icon={<GooglePaLM />}
                  name="GooglePaLM"
                  description="The AI model that powers Google's search engine."
                />
                <Integration
                  icon={<MagicUI />}
                  name="MagicUI"
                  description="The AI model that powers Google's search engine."
                />
                <Integration
                  icon={<VSCodium />}
                  name="VSCodium"
                  description="The AI model that powers Google's search engine."
                />
                <Integration
                  icon={<MediaWiki />}
                  name="MediaWiki"
                  description="The AI model that powers Google's search engine."
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const Integration = ({
  icon,
  name,
  description,
}: {
  icon: React.ReactNode;
  name: string;
  description: string;
}) => {
  return (
    <div className="space-y-4 rounded-lg border p-4 transition-colors hover:bg-muted dark:hover:bg-muted/50">
      <div className="flex size-fit items-center justify-center">{icon}</div>
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{name}</h3>
        <p className="line-clamp-1 text-sm text-muted-foreground md:line-clamp-2">{description}</p>
      </div>
    </div>
  );
};
