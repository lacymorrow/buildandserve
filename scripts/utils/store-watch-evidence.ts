/**
 * Where Doug store watch evidence lives, and how long it lives there.
 *
 * Split out of `scripts/doug-store-watch.ts` so the freshness check
 * (`scripts/doug-store-watch-freshness.ts`) can find the same directory without
 * importing Playwright. The freshness check exists because the watch sometimes
 * does not run at all (LAC-4335); it must not share a dependency that can stop
 * the watch from running.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/** Directory, under the main checkout, that holds one subdirectory per run. */
export const EVIDENCE_DIR_NAME = "store-watch-runs";

/** The runbook's evidence standard: keep runs long enough to trace a regression. */
export const RETENTION_DAYS = 30;

/**
 * Where a run's evidence belongs, given the checkout the script was invoked
 * from and the contents of that checkout's `.git` when it is a pointer file.
 *
 * Evidence has to outlive the process that produced it. The default used to be
 * the cwd-relative `./store-watch-runs`, which is correct from the main
 * checkout and wrong everywhere else: Paperclip wakes an agent inside
 * `.paperclip/worktrees/<issue>/`, so screenshots and report.json landed in a
 * directory that is deleted with the worktree and the 30-day retention the
 * runbook promises silently did not happen (LAC-4300). A linked worktree's
 * `.git` is a file pointing at `<main>/.git/worktrees/<name>`, which names the
 * main checkout, so anchor there instead of at the cwd.
 */
export function resolveEvidenceBase(repoRoot: string, gitPointer: string | null): string {
  const gitDir = gitPointer ? /^gitdir:\s*(.+?)\s*$/m.exec(gitPointer)?.[1] : undefined;
  const mainCheckout = gitDir
    ? /^(.*)[/\\]\.git[/\\]worktrees[/\\][^/\\]+$/.exec(gitDir)?.[1]
    : undefined;
  return path.join(mainCheckout ?? repoRoot, EVIDENCE_DIR_NAME);
}

/** Run directories whose evidence has aged past the retention window. */
export function expiredRuns(
  runs: { name: string; mtimeMs: number }[],
  nowMs: number,
  retentionDays: number = RETENTION_DAYS
): string[] {
  const cutoff = nowMs - retentionDays * 86_400_000;
  return runs.filter((run) => run.mtimeMs < cutoff).map((run) => run.name);
}

/** The `.git` of a linked worktree is a file; of a normal checkout, a directory. */
export async function readGitPointer(repoRoot: string): Promise<string | null> {
  const dotGit = path.join(repoRoot, ".git");
  try {
    if (!(await stat(dotGit)).isFile()) return null;
    return await readFile(dotGit, "utf8");
  } catch {
    return null;
  }
}

/** The evidence directory for a checkout, resolved the same way by every caller. */
export async function evidenceBaseFor(repoRoot: string): Promise<string> {
  return resolveEvidenceBase(repoRoot, await readGitPointer(repoRoot));
}
