import { cn } from "@/lib/utils";
import { BrowserFrame } from "./browser-frame";

export function PaperclipDashboard({ className }: { className?: string }) {
  return (
    <BrowserFrame
      url="app.paperclip.company/dashboard"
      beamColorFrom="#f59e0b"
      beamColorTo="#ef4444"
      className={className}
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
        <div>
          <p className="text-xs font-medium text-neutral-200">Acme AI Corp</p>
          <p className="text-[10px] text-neutral-600">3 departments &middot; 8 agents</p>
        </div>
        <div className="rounded-full bg-amber-500/10 px-2 py-0.5">
          <span className="text-[10px] font-medium text-amber-400">Growth Plan</span>
        </div>
      </div>

      <div className="p-3">
        <div className="mb-3 grid grid-cols-3 gap-2">
          {[
            {
              dept: "Marketing",
              agents: 3,
              tasks: 42,
              spend: "$1.2K",
              border: "border-l-amber-400",
            },
            {
              dept: "Engineering",
              agents: 3,
              tasks: 28,
              spend: "$800",
              border: "border-l-blue-400",
            },
            {
              dept: "Operations",
              agents: 2,
              tasks: 35,
              spend: "$600",
              border: "border-l-emerald-400",
            },
          ].map((d) => (
            <div
              key={d.dept}
              className={cn(
                "rounded-lg border border-white/[0.04] border-l-2 bg-white/[0.02] p-2.5",
                d.border
              )}
            >
              <p className="text-[11px] font-medium text-neutral-300">{d.dept}</p>
              <div className="mt-1.5 space-y-0.5 text-[10px]">
                <p className="text-neutral-600">
                  {d.agents} agents &middot; {d.tasks} tasks
                </p>
                <p className="text-amber-400/80">{d.spend}/mo</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-white/[0.03] p-2.5">
          <p className="mb-2 text-[10px] text-neutral-600">Budget Utilization</p>
          <div className="space-y-1.5">
            {[
              { label: "Marketing", pct: 78, color: "bg-amber-400" },
              { label: "Engineering", pct: 52, color: "bg-blue-400" },
              { label: "Operations", pct: 65, color: "bg-emerald-400" },
            ].map((bar) => (
              <div key={bar.label} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[9px] text-neutral-600">{bar.label}</span>
                <div className="h-1 flex-1 rounded-full bg-white/[0.06]">
                  <div
                    className={cn("h-full rounded-full", bar.color)}
                    style={{ width: `${bar.pct}%` }}
                  />
                </div>
                <span className="w-6 text-right text-[9px] text-neutral-600">{bar.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.06] bg-neutral-900/50 px-4 py-1.5">
        <span className="text-[10px] text-neutral-500">Total: $2,600/mo</span>
        <div className="flex items-center gap-1.5">
          <div className="size-1.5 rounded-full bg-emerald-400" />
          <span className="text-[10px] text-neutral-600">Governance: Active</span>
        </div>
      </div>
    </BrowserFrame>
  );
}
