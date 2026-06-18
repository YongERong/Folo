export const TIMELINE_VIEW_SELECTOR_ACTIVE_WIDTH = 180
export const TIMELINE_VIEW_SELECTOR_INACTIVE_WIDTH = 48
export const TIMELINE_VIEW_SELECTOR_ACTIVE_TEXT_WIDTH = 100
export const TIMELINE_VIEW_SELECTOR_GAP = 12
export const TIMELINE_VIEW_SELECTOR_HORIZONTAL_PADDING = 24
export const TIMELINE_VIEW_SELECTOR_FIT_HORIZONTAL_PADDING = 16
export const TIMELINE_VIEW_SELECTOR_MAX_TABLET_ACTIVE_WIDTH = 280
export const TIMELINE_VIEW_SELECTOR_SCROLL_PADDING = 16

export function getFitActiveWidth(windowWidth: number, viewCount: number) {
  if (viewCount <= 0) {
    return TIMELINE_VIEW_SELECTOR_ACTIVE_WIDTH
  }

  return (
    windowWidth -
    (TIMELINE_VIEW_SELECTOR_INACTIVE_WIDTH + TIMELINE_VIEW_SELECTOR_GAP) * (viewCount - 1) -
    TIMELINE_VIEW_SELECTOR_FIT_HORIZONTAL_PADDING
  )
}

export function getTimelineViewRowWidth({
  activeWidth,
  viewCount,
}: {
  activeWidth: number
  viewCount: number
}) {
  if (viewCount <= 0) {
    return 0
  }

  return (
    TIMELINE_VIEW_SELECTOR_HORIZONTAL_PADDING +
    activeWidth +
    (viewCount - 1) * TIMELINE_VIEW_SELECTOR_INACTIVE_WIDTH +
    (viewCount - 1) * TIMELINE_VIEW_SELECTOR_GAP
  )
}

export function shouldTimelineViewSelectorScroll({
  rowWidth,
  viewportWidth,
  viewCount,
}: {
  rowWidth: number
  viewportWidth: number
  viewCount: number
}) {
  if (viewCount <= 4) {
    return false
  }

  return rowWidth > viewportWidth
}

export function getResolvedActiveWidth({
  windowWidth,
  viewCount,
  isTablet,
}: {
  windowWidth: number
  viewCount: number
  isTablet: boolean
}) {
  if (viewCount <= 0) {
    return TIMELINE_VIEW_SELECTOR_ACTIVE_WIDTH
  }

  const fitActiveWidth = getFitActiveWidth(windowWidth, viewCount)
  const fitRowWidth = getTimelineViewRowWidth({ activeWidth: fitActiveWidth, viewCount })
  const needsScroll = shouldTimelineViewSelectorScroll({
    rowWidth: fitRowWidth,
    viewportWidth: windowWidth,
    viewCount,
  })

  let activeWidth = fitActiveWidth
  if (!needsScroll) {
    activeWidth = Math.max(fitActiveWidth, TIMELINE_VIEW_SELECTOR_ACTIVE_WIDTH)
  }

  if (isTablet) {
    activeWidth = Math.min(activeWidth, TIMELINE_VIEW_SELECTOR_MAX_TABLET_ACTIVE_WIDTH)
  }

  return Math.max(activeWidth, TIMELINE_VIEW_SELECTOR_INACTIVE_WIDTH)
}

export function getScrollOffsetToRevealTab({
  tabX,
  tabWidth,
  scrollX,
  viewportWidth,
  padding = TIMELINE_VIEW_SELECTOR_SCROLL_PADDING,
}: {
  tabX: number
  tabWidth: number
  scrollX: number
  viewportWidth: number
  padding?: number
}) {
  const tabLeft = tabX
  const tabRight = tabX + tabWidth
  const visibleLeft = scrollX
  const visibleRight = scrollX + viewportWidth

  if (tabLeft >= visibleLeft + padding && tabRight <= visibleRight - padding) {
    return null
  }

  if (tabLeft < visibleLeft + padding) {
    return Math.max(0, tabLeft - padding)
  }

  return Math.max(0, tabRight - viewportWidth + padding)
}
