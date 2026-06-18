import { describe, expect, test } from "vitest"

import {
  getFitActiveWidth,
  getResolvedActiveWidth,
  getScrollOffsetToRevealTab,
  getTimelineViewRowWidth,
  shouldTimelineViewSelectorScroll,
  TIMELINE_VIEW_SELECTOR_ACTIVE_WIDTH,
  TIMELINE_VIEW_SELECTOR_MAX_TABLET_ACTIVE_WIDTH,
} from "./timeline-view-selector-layout"

describe("getResolvedActiveWidth", () => {
  test("keeps active width at or above 180 for 4 views on a phone", () => {
    const activeWidth = getResolvedActiveWidth({
      windowWidth: 375,
      viewCount: 4,
      isTablet: false,
    })

    expect(activeWidth).toBeGreaterThanOrEqual(TIMELINE_VIEW_SELECTOR_ACTIVE_WIDTH)
  })

  test("allows active width below 180 for 5 views on a phone", () => {
    const activeWidth = getResolvedActiveWidth({
      windowWidth: 375,
      viewCount: 5,
      isTablet: false,
    })

    expect(activeWidth).toBeLessThan(TIMELINE_VIEW_SELECTOR_ACTIVE_WIDTH)
    expect(activeWidth).toBe(getFitActiveWidth(375, 5))
  })

  test("caps active width on tablet", () => {
    const activeWidth = getResolvedActiveWidth({
      windowWidth: 1024,
      viewCount: 4,
      isTablet: true,
    })

    expect(activeWidth).toBeLessThanOrEqual(TIMELINE_VIEW_SELECTOR_MAX_TABLET_ACTIVE_WIDTH)
  })
})

describe("shouldTimelineViewSelectorScroll", () => {
  test("does not require scrolling for 4 views on a phone", () => {
    const activeWidth = getResolvedActiveWidth({
      windowWidth: 375,
      viewCount: 4,
      isTablet: false,
    })
    const rowWidth = getTimelineViewRowWidth({ activeWidth, viewCount: 4 })

    expect(
      shouldTimelineViewSelectorScroll({
        rowWidth,
        viewportWidth: 375,
        viewCount: 4,
      }),
    ).toBe(false)
  })

  test("requires scrolling for 5 views on a phone", () => {
    const activeWidth = getResolvedActiveWidth({
      windowWidth: 375,
      viewCount: 5,
      isTablet: false,
    })
    const rowWidth = getTimelineViewRowWidth({ activeWidth, viewCount: 5 })

    expect(
      shouldTimelineViewSelectorScroll({
        rowWidth,
        viewportWidth: 375,
        viewCount: 5,
      }),
    ).toBe(true)
  })

  test("requires scrolling for 6 views on a phone", () => {
    const activeWidth = getResolvedActiveWidth({
      windowWidth: 375,
      viewCount: 6,
      isTablet: false,
    })
    const rowWidth = getTimelineViewRowWidth({ activeWidth, viewCount: 6 })

    expect(
      shouldTimelineViewSelectorScroll({
        rowWidth,
        viewportWidth: 375,
        viewCount: 6,
      }),
    ).toBe(true)
  })
})

describe("getScrollOffsetToRevealTab", () => {
  test("returns null when the tab is fully visible", () => {
    expect(
      getScrollOffsetToRevealTab({
        tabX: 40,
        tabWidth: 120,
        scrollX: 0,
        viewportWidth: 375,
      }),
    ).toBeNull()
  })

  test("returns an offset when the tab is clipped on the right", () => {
    expect(
      getScrollOffsetToRevealTab({
        tabX: 320,
        tabWidth: 120,
        scrollX: 0,
        viewportWidth: 375,
      }),
    ).toBe(81)
  })

  test("returns an offset when the tab is clipped on the left", () => {
    expect(
      getScrollOffsetToRevealTab({
        tabX: 10,
        tabWidth: 120,
        scrollX: 80,
        viewportWidth: 375,
      }),
    ).toBe(0)
  })

  test("returns a positive offset for tabs clipped on the left but not at zero", () => {
    expect(
      getScrollOffsetToRevealTab({
        tabX: 120,
        tabWidth: 120,
        scrollX: 200,
        viewportWidth: 375,
      }),
    ).toBe(104)
  })
})
