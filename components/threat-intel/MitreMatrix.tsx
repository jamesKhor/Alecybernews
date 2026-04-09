import type { TTPEntry } from "@/lib/types";

const TACTIC_ORDER = [
  "Reconnaissance",
  "Resource Development",
  "Initial Access",
  "Execution",
  "Persistence",
  "Privilege Escalation",
  "Defense Evasion",
  "Credential Access",
  "Discovery",
  "Lateral Movement",
  "Collection",
  "Command and Control",
  "Exfiltration",
  "Impact",
];

interface Props {
  ttps: TTPEntry[];
}

export function MitreMatrix({ ttps }: Props) {
  // Group by tactic
  const byTactic = new Map<string, TTPEntry[]>();
  for (const ttp of ttps) {
    const list = byTactic.get(ttp.tactic) ?? [];
    list.push(ttp);
    byTactic.set(ttp.tactic, list);
  }

  // Sort tactics by canonical order
  const tactics = Array.from(byTactic.keys()).sort((a, b) => {
    const ai = TACTIC_ORDER.indexOf(a);
    const bi = TACTIC_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-secondary/30">
        <h3 className="font-semibold text-sm text-primary uppercase tracking-wide">
          MITRE ATT&CK® TTPs ({ttps.length})
        </h3>
      </div>
      <div className="overflow-x-auto p-4">
        <div className="flex gap-3 min-w-max">
          {tactics.map((tactic) => {
            const entries = byTactic.get(tactic) ?? [];
            return (
              <div key={tactic} className="flex flex-col gap-2 min-w-[160px]">
                {/* Tactic header */}
                <div className="rounded-t bg-primary/10 border border-primary/20 px-2 py-1 text-center">
                  <span className="text-xs font-bold text-primary uppercase tracking-wide leading-tight">
                    {tactic}
                  </span>
                </div>
                {/* Technique cards */}
                {entries.map((ttp) => (
                  <a
                    key={ttp.technique_id}
                    href={`https://attack.mitre.org/techniques/${ttp.technique_id.replace(".", "/")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded border border-border bg-secondary/40 px-2 py-1.5 hover:border-primary/40 hover:bg-secondary transition-colors group"
                    title={ttp.description}
                  >
                    <div className="font-mono text-xs text-primary group-hover:text-primary/80">
                      {ttp.technique_id}
                    </div>
                    <div className="text-xs text-foreground leading-tight mt-0.5 line-clamp-2">
                      {ttp.technique_name}
                    </div>
                  </a>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="px-4 py-2 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Click any technique to view details on{" "}
          <a
            href="https://attack.mitre.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            attack.mitre.org
          </a>
        </p>
      </div>
    </div>
  );
}
