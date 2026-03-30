"use client";

import { cn } from "@/lib/utils";

interface SocialLinksProps {
  labelled?: boolean;
  className?: string;
}

/** Social links stub — populate with actual social media links. */
export function SocialLinks({ labelled, className }: SocialLinksProps) {
  return <div className={cn("flex gap-2", className)} />;
}
