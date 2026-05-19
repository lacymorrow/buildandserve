import { BorderBeam } from "@/components/ui/border-beam";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface BrowserFrameProps {
  url: string;
  beamColorFrom: string;
  beamColorTo: string;
  className?: string;
  children: ReactNode;
}

export function BrowserFrame({
  url,
  beamColorFrom,
  beamColorTo,
  className,
  children,
}: BrowserFrameProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-white/[0.08] bg-neutral-950 shadow-2xl",
        className
      )}
    >
      <BorderBeam size={250} colorFrom={beamColorFrom} colorTo={beamColorTo} duration={12} />

      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex gap-1.5">
          <div className="size-2.5 rounded-full bg-[#ff5f57]" />
          <div className="size-2.5 rounded-full bg-[#febc2e]" />
          <div className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex flex-1 justify-center">
          <div className="rounded-md bg-white/[0.06] px-8 py-1">
            <span className="text-[11px] text-neutral-500">{url}</span>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
