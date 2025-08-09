import { ArrowLeft } from "lucide-react";
import { Link } from "@/components/primitives/link-with-transition";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site-config";

interface BackNavigationProps {
  href?: string;
  text?: string;
  className?: string;
}

export const BackNavigation = ({
  href = "/",
  text = `Back to ${siteConfig.name}`,
  className,
}: BackNavigationProps) => {
  return (
    <div className={cn("mb-8", className)}>
      <Link
        href={href}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {text}
      </Link>
    </div>
  );
};
