import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression cover for LAC-7079.
 *
 * Every `transformValue()` call builds a MotionValue that subscribes to the
 * item's `currentOffsetDistance` and is never torn down. The css-variable
 * object was rebuilt inside the render body, so one subscriber leaked per
 * variable per render, for the lifetime of the marquee -- and the marquee
 * animates on every frame, so a parent re-render loop grows that set without
 * bound. Counting `transformValue` calls across re-renders is the observable
 * signal: memoized, the count is one per variable, forever.
 *
 * The spy has to be installed through `vi.mock` because the component imports
 * `transformValue` as a binding; spying on the namespace object after the fact
 * would not be seen by the module under test.
 */
const transformValueSpy = vi.fn();

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    transformValue: (...args: Parameters<typeof actual.transformValue>) => {
      transformValueSpy(...args);
      return actual.transformValue(...args);
    },
  };
});

const MarqueeAlongSvgPath = (await import("@/components/fancy/blocks/marquee-along-svg-path"))
  .default;

// Hoisted so the prop identity is stable across re-renders. An inline array
// literal would be a new reference every render and would defeat the memo --
// see the note on NO_CSS_VARIABLES in the component.
const CSS_VARS = [{ property: "--marquee-fade", from: 0, to: 1 }];
const CHILD = <div data-testid="marquee-child">item</div>;
const PATH = "M 0 50 L 100 50";

describe("MarqueeAlongSvgPath css-variable interpolation", () => {
  beforeEach(() => {
    transformValueSpy.mockClear();
  });

  it("builds one MotionValue per css variable and keeps it across re-renders", () => {
    const { rerender } = render(
      <MarqueeAlongSvgPath path={PATH} repeat={1} cssVariableInterpolation={CSS_VARS}>
        {CHILD}
      </MarqueeAlongSvgPath>
    );

    // One item (one child x repeat 1), one declared variable.
    expect(transformValueSpy).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 4; i++) {
      rerender(
        <MarqueeAlongSvgPath path={PATH} repeat={1} cssVariableInterpolation={CSS_VARS}>
          {CHILD}
        </MarqueeAlongSvgPath>
      );
    }

    // Unmemoized this would be 5: one per render. The leak is the growth, not
    // the absolute number, so assert the count did not move at all.
    expect(transformValueSpy).toHaveBeenCalledTimes(1);
  });

  it("still applies the interpolated variable to the item element", () => {
    const { getByTestId } = render(
      <MarqueeAlongSvgPath path={PATH} repeat={1} cssVariableInterpolation={CSS_VARS}>
        {CHILD}
      </MarqueeAlongSvgPath>
    );

    // The item wrapper is the parent of the child we rendered.
    const item = getByTestId("marquee-child").parentElement;
    expect(item).not.toBeNull();
    // offsetDistance starts at 0, so the variable resolves to `from`.
    expect(item?.style.getPropertyValue("--marquee-fade")).toBe("0");
  });

  it("creates no MotionValues when no interpolation is requested", () => {
    render(
      <MarqueeAlongSvgPath path={PATH} repeat={1}>
        {CHILD}
      </MarqueeAlongSvgPath>
    );

    expect(transformValueSpy).not.toHaveBeenCalled();
  });
});
