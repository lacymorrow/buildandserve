export function CompanyStructure() {
  const departments = [
    { name: "Marketing", agents: 3, examples: "Content, social, analytics" },
    { name: "Engineering", agents: 3, examples: "Code review, QA, docs" },
    { name: "Operations", agents: 2, examples: "Support triage, reporting" },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <span className="text-sm font-medium text-neutral-300">
          Your AI Company
        </span>
        <span className="text-xs text-neutral-600">Paperclip</span>
      </div>
      <div className="grid gap-px bg-white/[0.04] sm:grid-cols-3">
        {departments.map((dept) => (
          <div key={dept.name} className="bg-neutral-950 px-5 py-4">
            <p className="text-sm font-medium text-neutral-300">{dept.name}</p>
            <p className="mt-1 text-xs text-neutral-600">
              {dept.agents} agents
            </p>
            <p className="mt-2 text-[11px] text-neutral-600">{dept.examples}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.06] px-5 py-2.5">
        <p className="text-[11px] text-neutral-600">
          Governance active &middot; Budget controls &middot; Human approval on
          sensitive actions
        </p>
      </div>
    </div>
  );
}
