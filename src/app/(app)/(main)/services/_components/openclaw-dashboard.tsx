import { BorderBeam } from "@/components/ui/border-beam";
import { cn } from "@/lib/utils";

export function OpenClawDashboard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-white/[0.08] bg-neutral-950 shadow-2xl",
        className
      )}
    >
      <BorderBeam size={250} colorFrom="#10b981" colorTo="#06b6d4" duration={12} />

      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex gap-1.5">
          <div className="size-2.5 rounded-full bg-[#ff5f57]" />
          <div className="size-2.5 rounded-full bg-[#febc2e]" />
          <div className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex flex-1 justify-center">
          <div className="rounded-md bg-white/[0.06] px-8 py-1">
            <span className="text-[11px] text-neutral-500">app.openclaw.io/dashboard</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-px bg-white/[0.04]">
        {[
          { label: "Active Agents", value: "6", accent: "text-emerald-400" },
          { label: "Tasks Today", value: "147", accent: "text-cyan-400" },
          { label: "Success Rate", value: "99.2%", accent: "text-emerald-400" },
          { label: "Avg Response", value: "1.3s", accent: "text-cyan-400" },
        ].map((m) => (
          <div key={m.label} className="bg-neutral-950 px-3 py-2">
            <p className="text-[9px] uppercase tracking-wider text-neutral-600">{m.label}</p>
            <p className={cn("mt-0.5 text-sm font-semibold", m.accent)}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="p-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            { name: "Content Writer", task: "Blog post draft", color: "bg-emerald-400" },
            { name: "Data Analyst", task: "Q2 revenue report", color: "bg-emerald-400" },
            { name: "Support Triage", task: "Ticket #1847", color: "bg-amber-400" },
            { name: "Code Reviewer", task: "PR #423 review", color: "bg-emerald-400" },
            { name: "Research Bot", task: "Awaiting assignment", color: "bg-neutral-500" },
            { name: "QA Tester", task: "E2E test suite", color: "bg-emerald-400" },
          ].map((a) => (
            <div
              key={a.name}
              className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2.5"
            >
              <div className="mb-1 flex items-center gap-1.5">
                <div className={cn("size-1.5 rounded-full", a.color)} />
                <span className="text-[11px] font-medium text-neutral-300">{a.name}</span>
              </div>
              <p className="truncate text-[10px] text-neutral-600">{a.task}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.06] bg-neutral-900/50 px-4 py-1.5">
        <div className="flex items-center gap-1.5">
          <div className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
          <span className="text-[10px] text-neutral-500">All systems operational</span>
        </div>
        <span className="text-[10px] text-neutral-600">v2.4.1</span>
      </div>
    </div>
  );
}
