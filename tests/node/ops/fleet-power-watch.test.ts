import { describe, expect, it } from "vitest";
import {
  decide,
  formatAlert,
  formatMinutes,
  type PowerState,
  parsePmset,
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
    expect(decide(onBattery(64), [])).toEqual({ alert: false, nextAlerted: [] });
  });

  it("fires once crossing 20% and then holds its fire", () => {
    const first = decide(onBattery(18), []);
    expect(first).toEqual({ alert: true, nextAlerted: [WARN_PERCENT] });
    // Five minutes later, still on battery, still under 20. One DM per tier.
    expect(decide(onBattery(16), first.nextAlerted)).toEqual({
      alert: false,
      nextAlerted: [WARN_PERCENT],
    });
  });

  it("fires a second time crossing 10%", () => {
    const second = decide(onBattery(8), [WARN_PERCENT]);
    expect(second).toEqual({ alert: true, nextAlerted: [WARN_PERCENT, URGENT_PERCENT] });
    expect(decide(onBattery(3), second.nextAlerted).alert).toBe(false);
    expect(decide(onBattery(1), second.nextAlerted).alert).toBe(false);
  });

  it("sends one message, not two, when it first looks at an already-low Mac", () => {
    // The Mac was asleep, or this was installed mid-discharge. Both thresholds
    // are behind us. Two DMs a second apart is how an alert gets muted.
    expect(decide(onBattery(6), [])).toEqual({
      alert: true,
      nextAlerted: [WARN_PERCENT, URGENT_PERCENT],
    });
  });

  it("rearms only on AC, which is the whole dedupe rule", () => {
    expect(decide({ ...onBattery(95), onAC: true }, [WARN_PERCENT, URGENT_PERCENT])).toEqual({
      alert: false,
      nextAlerted: [],
    });
    // Unplugged again later, the next discharge gets its own two warnings.
    expect(decide(onBattery(18), []).alert).toBe(true);
  });

  it("never alerts on a machine with no battery", () => {
    const desktop: PowerState = { percent: 100, onAC: true, minutesLeft: null, hasBattery: false };
    expect(decide(desktop, [])).toEqual({ alert: false, nextAlerted: [] });
  });

  it("fires exactly at the threshold boundary it claims", () => {
    expect(decide(onBattery(WARN_PERCENT), []).alert).toBe(false);
    expect(decide(onBattery(WARN_PERCENT - 1), []).alert).toBe(true);
    expect(decide(onBattery(URGENT_PERCENT), [WARN_PERCENT]).alert).toBe(false);
    expect(decide(onBattery(URGENT_PERCENT - 1), [WARN_PERCENT]).alert).toBe(true);
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
