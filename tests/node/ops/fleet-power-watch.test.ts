import { describe, expect, it } from "vitest";
import {
  channelsFor,
  decide,
  formatAlert,
  formatMinutes,
  notify,
  ntfyTitle,
  type PowerState,
  parsePmset,
  redactTopic,
  type Sender,
  stamp,
  URGENT_PERCENT,
  WARN_PERCENT,
} from "../../../scripts/fleet-power-watch";

/** The exact shape `pmset -g batt` prints on this Mac, down to the tab. */
const pmset = (body: string, source = "Battery Power") =>
  `Now drawing from '${source}'\n -InternalBattery-0 (id=22872163)\t${body}\n`;

const onBattery = (percent: number, minutesLeft: number | null = null): PowerState => ({
  percent,
  onAC: false,
  minutesLeft,
  hasBattery: true,
});

describe("parsePmset", () => {
  it("reads percent, source and estimate off a discharging Mac", () => {
    const state = parsePmset(pmset("43%; discharging; 2:13 remaining present: true"));
    expect(state).toEqual({ percent: 43, onAC: false, minutesLeft: 133, hasBattery: true });
  });

  it("reads a charging Mac as on AC", () => {
    // The whole dedupe hinges on this line: AC is what resets the discharge.
    const state = parsePmset(pmset("43%; charging; 1:42 remaining present: true", "AC Power"));
    expect(state?.onAC).toBe(true);
    expect(state?.percent).toBe(43);
  });

  it("treats pmset's missing estimate as missing, not as zero", () => {
    // Right after unplugging, pmset has no estimate for a minute or two. "0 min
    // left" there would be a lie, and the lie is the one that cries wolf.
    expect(parsePmset(pmset("55%; discharging; (no estimate) present: true"))?.minutesLeft).toBe(
      null
    );
    expect(parsePmset(pmset("100%; charged; 0:00 remaining present: true"))?.minutesLeft).toBe(
      null
    );
  });

  it("reports a machine with no battery rather than guessing one", () => {
    // LAC-4279 moves some of this fleet to a Hetzner box. Same file, no battery.
    const state = parsePmset("Now drawing from 'AC Power'\n");
    expect(state).toEqual({ percent: 100, onAC: true, minutesLeft: null, hasBattery: false });
  });

  it("returns null when pmset said something it does not understand", () => {
    // Exit 2 territory. "Could not look" must never be recorded as "all fine".
    expect(parsePmset("")).toBeNull();
    expect(parsePmset("pmset: command not found")).toBeNull();
  });
});

describe("decide", () => {
  it("says nothing while the battery is comfortable", () => {
    expect(decide(onBattery(64), [])).toEqual({ tier: null, nextAlerted: [] });
  });

  it("fires once crossing 20% and then holds its fire", () => {
    const first = decide(onBattery(18), []);
    expect(first).toEqual({ tier: WARN_PERCENT, nextAlerted: [WARN_PERCENT] });
    // Five minutes later, still on battery, still under 20. One DM per tier.
    expect(decide(onBattery(16), first.nextAlerted)).toEqual({
      tier: null,
      nextAlerted: [WARN_PERCENT],
    });
  });

  it("fires a second time crossing 10%", () => {
    const second = decide(onBattery(8), [WARN_PERCENT]);
    expect(second).toEqual({ tier: URGENT_PERCENT, nextAlerted: [WARN_PERCENT, URGENT_PERCENT] });
    expect(decide(onBattery(3), second.nextAlerted).tier).toBeNull();
    expect(decide(onBattery(1), second.nextAlerted).tier).toBeNull();
  });

  it("sends one message, not two, when it first looks at an already-low Mac", () => {
    // The Mac was asleep, or this was installed mid-discharge. Both thresholds
    // are behind us. Two DMs a second apart is how an alert gets muted.
    // And it reports the urgent tier, not the one it happens to list first, so
    // a Mac first seen at 6% pages the phone rather than only DMing Slack.
    expect(decide(onBattery(6), [])).toEqual({
      tier: URGENT_PERCENT,
      nextAlerted: [WARN_PERCENT, URGENT_PERCENT],
    });
  });

  it("rearms only on AC, which is the whole dedupe rule", () => {
    expect(decide({ ...onBattery(95), onAC: true }, [WARN_PERCENT, URGENT_PERCENT])).toEqual({
      tier: null,
      nextAlerted: [],
    });
    // Unplugged again later, the next discharge gets its own two warnings.
    expect(decide(onBattery(18), []).tier).toBe(WARN_PERCENT);
  });

  it("never alerts on a machine with no battery", () => {
    const desktop: PowerState = { percent: 100, onAC: true, minutesLeft: null, hasBattery: false };
    expect(decide(desktop, [])).toEqual({ tier: null, nextAlerted: [] });
  });

  it("fires exactly at the threshold boundary it claims", () => {
    expect(decide(onBattery(WARN_PERCENT), []).tier).toBeNull();
    expect(decide(onBattery(WARN_PERCENT - 1), []).tier).toBe(WARN_PERCENT);
    expect(decide(onBattery(URGENT_PERCENT), [WARN_PERCENT]).tier).toBeNull();
    expect(decide(onBattery(URGENT_PERCENT - 1), [WARN_PERCENT]).tier).toBe(URGENT_PERCENT);
  });
});

describe("formatMinutes", () => {
  it("writes under an hour in minutes and over it in hours", () => {
    expect(formatMinutes(24)).toBe("24 min");
    expect(formatMinutes(95)).toBe("1h 35m");
    expect(formatMinutes(60)).toBe("1h 0m");
  });
});

describe("formatAlert", () => {
  it("leads with the number, names what dies, ends with the action", () => {
    expect(formatAlert(onBattery(8, 24))).toBe(
      "Mac at 8% on battery, about 24 min left. Below ~5% it sleeps and the whole fleet " +
        "stops: no routines, no agent runs, no store watch. Plug in."
    );
  });

  it("drops the estimate rather than inventing one", () => {
    expect(formatAlert(onBattery(18))).toBe(
      "Mac at 18% on battery. Below ~5% it sleeps and the whole fleet stops: no routines, " +
        "no agent runs, no store watch. Plug in."
    );
  });
});

describe("stamp", () => {
  // Without this the log reads `Mac at 2% on battery` four discharge cycles
  // deep and cannot say when any of them happened, which is why reconstructing
  // the 2026-10-19 outage needed kern.boottime and usage-governor.log instead
  // (LAC-4874). launchd adds no time of its own, so the line has to carry it.
  it("prefixes the line with local ISO-8601 and an explicit offset", () => {
    const at = new Date("2026-10-19T03:36:52Z");
    const offset = -at.getTimezoneOffset();
    const sign = offset < 0 ? "-" : "+";
    const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
    const expected = `${sign}${pad(offset / 60)}${pad(Math.abs(offset) % 60)}`;

    // Asserted against the runner's own zone rather than a frozen string, so
    // this passes on the Mac it ships on and in CI's UTC alike.
    expect(stamp("Mac at 2% on battery", at)).toMatch(
      new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:52\\${expected} Mac at 2% on battery$`)
    );
  });

  it("stamps every line, so a pmset dump cannot slip in unstamped", () => {
    // The exit-2 path prints the raw pmset output it could not parse. That is
    // the most useful thing in the file and the easiest to lose track of.
    const lines = stamp("could not read the power state from pmset:\nNow drawing from 'X'").split(
      "\n"
    );
    expect(lines).toHaveLength(2);
    for (const line of lines)
      expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4} /);
    // One call, one moment: both lines carry the same stamp.
    expect(lines[0]?.slice(0, 24)).toBe(lines[1]?.slice(0, 24));
  });
});

describe("channelsFor", () => {
  // The whole point of LAC-6137. On 2026-10-28 both warnings went to Slack
  // alone, both were delivered, neither was acted on, and the fleet lost 3h32m.
  it("spends a Critical Alert on the urgent tier and not on the heads-up", () => {
    expect(channelsFor(WARN_PERCENT)).toEqual(["slack"]);
    expect(channelsFor(URGENT_PERCENT)).toEqual(["slack", "ntfy"]);
  });

  it("pages for anything more urgent than the urgent tier", () => {
    // Nothing generates a tier below 10 today. If a later tier is ever added,
    // it must page rather than quietly fall back to Slack.
    expect(channelsFor(5)).toContain("ntfy");
  });
});

describe("ntfyTitle", () => {
  it("leads with the action and is not confusable with the dark watch's titles", () => {
    // `Fleet is dark` and `Fleet is back` both mean the hours are already gone.
    // This one means they are not yet, and that distinction is the lock-screen
    // glance it exists for.
    expect(ntfyTitle(onBattery(8, 19))).toBe("Plug the Mac in (8%)");
    expect(ntfyTitle(onBattery(8, 19))).not.toContain("Fleet is");
  });
});

describe("redactTopic", () => {
  // The topic is the credential and it travels in the URL, so fetch's own error
  // text can put a 0600 file's contents into the launchd log in plain text.
  it("scrubs the topic wherever it appears", () => {
    expect(redactTopic("POST https://ntfy.sh/s3cret failed", "s3cret")).toBe(
      "POST https://ntfy.sh/<topic> failed"
    );
  });

  it("leaves the text alone when there is no topic to scrub", () => {
    // An empty needle would otherwise splice the placeholder between every
    // character of the message.
    expect(redactTopic("no ntfy topic", "")).toBe("no ntfy topic");
  });
});

describe("notify", () => {
  const ok = async () => null;
  const dead = async () => "down";

  it("spends the tier when either channel got through, so the phone buzzes once", () => {
    // The rule that matters. Requiring every channel re-pages the phone every
    // five minutes for the whole discharge whenever Slack is the broken half,
    // which is how a Critical Alert gets switched off.
    return Promise.all([
      expect(notify("t", "T", ["slack", "ntfy"], { slack: dead, ntfy: ok })).resolves.toMatchObject(
        {
          delivered: true,
          summary: "slack=failed ntfy=ok",
          errors: ["down"],
        }
      ),
      expect(notify("t", "T", ["slack", "ntfy"], { slack: ok, ntfy: dead })).resolves.toMatchObject(
        {
          delivered: true,
          summary: "slack=ok ntfy=failed",
        }
      ),
    ]);
  });

  it("reports an undelivered warning as undelivered, so the next cycle retries", async () => {
    const result = await notify("t", "T", ["slack", "ntfy"], { slack: dead, ntfy: dead });
    expect(result).toMatchObject({ delivered: false, summary: "slack=failed ntfy=failed" });
    expect(result.errors).toHaveLength(2);
  });

  it("sends only to the channels the tier is worth", async () => {
    const sent: string[] = [];
    const record =
      (name: string): Sender =>
      async () => {
        sent.push(name);
        return null;
      };
    await notify("t", "T", channelsFor(WARN_PERCENT), {
      slack: record("slack"),
      ntfy: record("ntfy"),
    });
    expect(sent).toEqual(["slack"]);
  });

  it("gives the phone the lock-screen title, not the Slack body", async () => {
    const seen: Array<[string, string]> = [];
    const spy: Sender = async (text, title) => {
      seen.push([text, title]);
      return null;
    };
    const state = onBattery(8, 19);
    await notify(formatAlert(state), ntfyTitle(state), ["ntfy"], { slack: spy, ntfy: spy });
    expect(seen[0]?.[1]).toBe("Plug the Mac in (8%)");
    expect(seen[0]?.[0]).toContain("the whole fleet stops");
  });
});
