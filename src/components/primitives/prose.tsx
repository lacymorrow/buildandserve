import { cn } from "@/lib/utils";

interface ProseProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/** Prose wrapper for MDX content. */
export function Prose({ children, className, ...props }: ProseProps) {
  return (
    <div
      className={cn(
        "prose prose-neutral dark:prose-invert max-w-none",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
