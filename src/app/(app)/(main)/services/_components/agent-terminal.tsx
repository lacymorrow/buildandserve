export function AgentTerminal() {
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-neutral-950 font-mono text-[13px] shadow-2xl">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex gap-1.5">
          <div className="size-2.5 rounded-full bg-[#ff5f57]" />
          <div className="size-2.5 rounded-full bg-[#febc2e]" />
          <div className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="ml-2 text-[11px] text-neutral-600">terminal</span>
      </div>
      <div className="space-y-3 p-5 leading-relaxed">
        <div>
          <span className="text-neutral-500">$</span>{" "}
          <span className="text-emerald-400">openclaw deploy</span>{" "}
          <span className="text-neutral-500">--config production.yml</span>
        </div>
        <div className="space-y-1 text-neutral-500">
          <p>
            <span className="text-emerald-400/80">&#x2714;</span> Agent
            topology validated (3 agents, 1 orchestrator)
          </p>
          <p>
            <span className="text-emerald-400/80">&#x2714;</span> Security
            model applied
          </p>
          <p>
            <span className="text-emerald-400/80">&#x2714;</span> Monitoring
            endpoints configured
          </p>
          <p>
            <span className="text-emerald-400/80">&#x2714;</span> Deployed to
            production
          </p>
        </div>
        <div className="border-t border-white/[0.04] pt-3">
          <p className="text-neutral-600">
            3 agents active &middot; orchestrator healthy &middot; ready
          </p>
        </div>
      </div>
    </div>
  );
}
