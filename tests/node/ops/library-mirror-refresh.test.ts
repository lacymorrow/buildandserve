import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

const SCRIPT = path.resolve(__dirname, "../../../scripts/library-mirror-refresh.sh");

const TOKEN = "github_pat_fake_token_for_tests";

/** The two fields the script reads off a GitHub repo. */
const repoList = (names: string[]) =>
  JSON.stringify(names.map((full_name) => ({ full_name, private: true })));

/**
 * A stand-in for api.github.com and for Slack, on one loopback port. The script
 * reaches both through overridable URLs, so every request below is a real curl
 * against a real socket returning a real status line: the thing the old version
 * ignored.
 */
let server: Server;
let apiBase: string;
let slackUrl: string;
/** Flipped per test. Returns [status, body] for a /user/repos request. */
let reposResponse: (affiliation: string, page: string) => [number, string];
/** Every Slack message the script sent during a test. */
let slackPosts: string[] = [];

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/slack") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        slackPosts.push(body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    const [status, body] = reposResponse(
      url.searchParams.get("affiliation") ?? "",
      url.searchParams.get("page") ?? "1"
    );
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  apiBase = `http://127.0.0.1:${address.port}`;
  slackUrl = `${apiBase}/slack`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

beforeEach(() => {
  slackPosts = [];
  // Only `owner` holds anything, so the happy path also proves the script walks
  // all three affiliations and tolerates empty ones.
  reposResponse = (affiliation) =>
    affiliation === "owner" ? [200, repoList(["lacymorrow/alpha"])] : [200, "[]"];
});

interface Result {
  code: number;
  stderr: string;
  log: string;
}

/** One refresh against temp directories. Returns the exit code and both logs. */
async function refresh(
  dirs: { state: string; mirror: string; origins: string },
  options: { token?: string | null; notify?: boolean } = {}
): Promise<Result> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LIBRARY_MIRROR_STATE_DIR: dirs.state,
    LIBRARY_MIRROR_DIR: dirs.mirror,
    LIBRARY_MIRROR_LOG: path.join(dirs.state, "refresh.log"),
    LIBRARY_MIRROR_TOKEN_FILE: path.join(dirs.state, ".token"),
    LIBRARY_MIRROR_API: apiBase,
    LIBRARY_MIRROR_GIT_HOST: `file://${dirs.origins}`,
    LIBRARY_MIRROR_SLACK_API: slackUrl,
    LIBRARY_MIRROR_SLACK_TOKEN_FILE: path.join(dirs.state, "slack-token"),
    TZ: "UTC",
  };
  let code = 0;
  let stderr = "";
  try {
    const out = await run("bash", [SCRIPT, ...(options.notify ? ["--notify"] : [])], { env });
    stderr = out.stderr;
  } catch (error) {
    const failure = error as { code?: number; stderr?: string };
    code = failure.code ?? 1;
    stderr = failure.stderr ?? "";
  }
  const log = await readFile(path.join(dirs.state, "refresh.log"), "utf8").catch(() => "");
  return { code, stderr, log };
}

/** Temp state, mirror and origin directories, with a token and one bare repo. */
async function makeDirs(options: { token?: string | null } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "mirror-test-"));
  const dirs = {
    state: path.join(root, "state"),
    mirror: path.join(root, "mirror"),
    origins: path.join(root, "origins"),
  };
  await run("mkdir", ["-p", dirs.state, dirs.mirror, path.join(dirs.origins, "lacymorrow")]);
  if (options.token !== null) {
    await writeFile(path.join(dirs.state, ".token"), `${options.token ?? TOKEN}\n`);
  }
  await writeFile(path.join(dirs.state, "slack-token"), "xoxb-test\n");

  // A real origin with one real commit, so `clone --mirror` and the later
  // `remote update` are both exercised for real rather than mocked.
  const work = path.join(root, "work");
  // The commit is authored by whoever runs the suite, on purpose: fleet rule 18
  // forbids overriding git identity, and this throwaway repo in /tmp is never
  // pushed anywhere.
  await run("git", ["init", "-q", "-b", "main", work]);
  await writeFile(path.join(work, "README.md"), "alpha\n");
  await run("git", ["-C", work, "add", "README.md"]);
  await run("git", ["-C", work, "commit", "-qm", "mirror test fixture"]);
  await run("git", [
    "clone",
    "--bare",
    "-q",
    work,
    path.join(dirs.origins, "lacymorrow", "alpha.git"),
  ]);
  return dirs;
}

describe("library-mirror-refresh", () => {
  it("mirrors every discovered repo and reports what it did", async () => {
    const dirs = await makeDirs();
    const first = await refresh(dirs);
    expect(first.code).toBe(0);
    expect(first.log).toContain("discovered 1 repos");
    expect(first.log).toContain("1 cloned");
    expect(first.stderr).toBe("");
    await run("test", ["-f", path.join(dirs.mirror, "lacymorrow/alpha.git/HEAD")]);

    // A second pass has to take the update branch, not the clone branch.
    const second = await refresh(dirs);
    expect(second.code).toBe(0);
    expect(second.log).toContain("1 updated");
  });

  /**
   * The regression this file exists for. On 2026-10-19 the token on library had
   * expired and the old script logged "discovered 1 repos" and "refresh done",
   * then exited 0, having mirrored nothing: it read the body and never the
   * status line. A backup that reports success while refusing to run is worse
   * than no backup.
   */
  it("fails loudly when GitHub rejects the token", async () => {
    const dirs = await makeDirs();
    reposResponse = () => [401, JSON.stringify({ message: "Bad credentials" })];
    const result = await refresh(dirs);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("http=401");
    expect(result.stderr).toContain("Bad credentials");
    expect(result.log).toContain("MIRROR-FAILED");
    expect(result.log).not.toContain("refresh done");
  });

  it("treats an empty repo list as a failure, not as one repo", async () => {
    const dirs = await makeDirs();
    reposResponse = () => [200, "[]"];
    const result = await refresh(dirs);
    expect(result.code).toBe(1);
    expect(result.log).toContain("no repositories");
    expect(result.log).not.toContain("discovered 1 repos");
  });

  it("separates 'could not run' from 'nothing to do' with exit 2", async () => {
    const dirs = await makeDirs({ token: null });
    const result = await refresh(dirs);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("MIRROR-BROKEN");
    expect(result.stderr).toContain("no GitHub token");
  });

  it("fails the run when a single repo will not mirror", async () => {
    const dirs = await makeDirs();
    reposResponse = (affiliation) =>
      affiliation === "owner"
        ? [200, repoList(["lacymorrow/alpha", "lacymorrow/gone"])]
        : [200, "[]"];
    const result = await refresh(dirs);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CLONE-FAILED lacymorrow/gone");
    expect(result.log).toContain("1 of 2 repos did not mirror");
  });

  it("Slack-DMs one line on failure, and nothing on success", async () => {
    const dirs = await makeDirs();
    reposResponse = () => [401, JSON.stringify({ message: "Bad credentials" })];
    const failure = await refresh(dirs, { notify: true });
    expect(failure.code).toBe(1);
    expect(slackPosts).toHaveLength(1);
    expect(slackPosts[0]).toContain("GitHub mirror on library failed");

    slackPosts = [];
    reposResponse = (affiliation) =>
      affiliation === "owner" ? [200, repoList(["lacymorrow/alpha"])] : [200, "[]"];
    const success = await refresh(dirs, { notify: true });
    expect(success.code).toBe(0);
    expect(slackPosts).toEqual([]);
  });

  it("never writes the token into the log, the mirror, or Slack", async () => {
    const dirs = await makeDirs();
    reposResponse = () => [401, JSON.stringify({ message: `Bad credentials for ${TOKEN}` })];
    const result = await refresh(dirs, { notify: true });
    expect(result.code).toBe(1);
    expect(result.log).not.toContain(TOKEN);
    expect(result.stderr).not.toContain(TOKEN);
    expect(slackPosts.join("")).not.toContain(TOKEN);
    expect(result.log).toContain("***");
  });
});
