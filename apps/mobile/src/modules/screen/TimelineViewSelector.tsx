import { useViewWithSubscription } from "@follow/store/subscription/hooks"
import { useUnreadByView } from "@follow/store/unread/hooks"
import { cn } from "@follow/utils"
import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native"
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native"
import Animated, { interpolate, interpolateColor, useAnimatedStyle } from "react-native-reanimated"

import { ReAnimatedPressable } from "@/src/components/common/AnimatedComponents"
import { TIMELINE_VIEW_SELECTOR_HEIGHT } from "@/src/constants/ui"
import type { ViewDefinition } from "@/src/constants/views"
import { views } from "@/src/constants/views"
import { isAndroid } from "@/src/lib/platform"
import { useIsTabletLayout, useReadableContainerStyle } from "@/src/lib/responsive"
import {
  selectTimeline,
  useSelectedFeed,
  useTimelineSelectorDragProgress,
} from "@/src/modules/screen/atoms"
import { useColor } from "@/src/theme/colors"

import { UnreadCount } from "../subscription/items/UnreadCount"
import {
  getResolvedActiveWidth,
  getScrollOffsetToRevealTab,
  getTimelineViewRowWidth,
  shouldTimelineViewSelectorScroll,
  TIMELINE_VIEW_SELECTOR_ACTIVE_TEXT_WIDTH,
  TIMELINE_VIEW_SELECTOR_GAP,
  TIMELINE_VIEW_SELECTOR_INACTIVE_WIDTH,
} from "./timeline-view-selector-layout"
import { TimelineViewSelectorContextMenu } from "./TimelineViewSelectorContextMenu"

const styles = StyleSheet.create({
  scrollView: {
    width: "100%",
  },
})

type ItemLayout = {
  x: number
  width: number
}

export function TimelineViewSelector() {
  const activeViews = useViewWithSubscription()
  const scrollViewRef = useRef<ScrollView | null>(null)
  const scrollXRef = useRef(0)
  const selectedFeed = useSelectedFeed()
  const readableContainerStyle = useReadableContainerStyle(760, 12)
  const { width: windowWidth } = useWindowDimensions()
  const isTablet = useIsTabletLayout()
  const [viewportWidth, setViewportWidth] = useState(windowWidth)
  const [itemLayouts, setItemLayouts] = useState<Record<number, ItemLayout>>({})

  const activeViewCount = activeViews.length
  const resolvedViewportWidth = viewportWidth || windowWidth
  const resolvedActiveWidth = getResolvedActiveWidth({
    windowWidth: resolvedViewportWidth,
    viewCount: activeViewCount,
    isTablet,
  })
  const rowWidth = getTimelineViewRowWidth({
    activeWidth: resolvedActiveWidth,
    viewCount: activeViewCount,
  })
  const shouldScroll = shouldTimelineViewSelectorScroll({
    rowWidth,
    viewportWidth: resolvedViewportWidth,
    viewCount: activeViewCount,
  })

  const activeIndex = useMemo(() => {
    if (selectedFeed?.type !== "view") {
      return -1
    }

    return activeViews.indexOf(selectedFeed.viewId)
  }, [activeViews, selectedFeed])

  const handleItemLayout = useCallback((index: number, layout: ItemLayout) => {
    setItemLayouts((previousLayouts) => {
      const previousLayout = previousLayouts[index]
      if (
        previousLayout &&
        previousLayout.x === layout.x &&
        previousLayout.width === layout.width
      ) {
        return previousLayouts
      }

      return {
        ...previousLayouts,
        [index]: layout,
      }
    })
  }, [])

  useEffect(() => {
    if (activeIndex < 0 || !shouldScroll) {
      return
    }

    const activeLayout = itemLayouts[activeIndex]
    if (!activeLayout || !scrollViewRef.current) {
      return
    }

    const timeout = setTimeout(() => {
      const nextScrollX = getScrollOffsetToRevealTab({
        tabX: activeLayout.x,
        tabWidth: activeLayout.width,
        scrollX: scrollXRef.current,
        viewportWidth: resolvedViewportWidth,
      })

      if (nextScrollX === null) {
        return
      }

      scrollViewRef.current?.scrollTo({
        x: nextScrollX,
        animated: true,
      })
    }, 50)

    return () => {
      clearTimeout(timeout)
    }
  }, [activeIndex, itemLayouts, resolvedViewportWidth, shouldScroll])

  const contentContainerStyle = useMemo(() => {
    if (activeViewCount <= 0) {
      return
    }

    if (shouldScroll) {
      return {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: TIMELINE_VIEW_SELECTOR_GAP,
        paddingHorizontal: 12,
      }
    }

    return {
      minWidth: "100%" as const,
      justifyContent: "center" as const,
      gap: TIMELINE_VIEW_SELECTOR_GAP,
    }
  }, [activeViewCount, shouldScroll])

  return (
    <View
      className="flex items-center justify-between py-2"
      style={{
        height: TIMELINE_VIEW_SELECTOR_HEIGHT,
      }}
    >
      <View style={readableContainerStyle}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          horizontal
          scrollsToTop={false}
          nestedScrollEnabled={isAndroid}
          scrollEventThrottle={16}
          onLayout={(event) => {
            setViewportWidth(event.nativeEvent.layout.width)
          }}
          onScroll={(event) => {
            scrollXRef.current = event.nativeEvent.contentOffset.x
          }}
          contentContainerClassName={shouldScroll ? undefined : "flex-row items-center px-3"}
          contentContainerStyle={contentContainerStyle}
          showsHorizontalScrollIndicator={false}
        >
          {activeViews.map((v, index) => {
            const view = views.find((view) => view.view === v)
            if (!view) return null
            return (
              <ViewItem
                key={view.name}
                index={index}
                view={view}
                resolvedActiveWidth={resolvedActiveWidth}
                isActive={selectedFeed?.type === "view" && selectedFeed.viewId === view.view}
                onLayout={handleItemLayout}
              />
            )
          })}
        </ScrollView>
      </View>
    </View>
  )
}

function ItemWrapper({
  index,
  activeColor,
  children,
  onPress,
  style,
  className,
  testID,
  resolvedActiveWidth,
}: {
  children: React.ReactNode
  index: number
  isActive: boolean
  activeColor: string
  onPress: () => void
  className?: string
  style?: Exclude<StyleProp<ViewStyle>, number>
  testID?: string
  resolvedActiveWidth: number
}) {
  const dragProgress = useTimelineSelectorDragProgress()
  const bgColor = useColor("gray5")

  return (
    <ReAnimatedPressable
      testID={testID}
      className={cn(
        "relative flex h-12 flex-row items-center justify-center gap-2 overflow-hidden rounded-[1.2rem] pl-2",
        className,
      )}
      onPress={onPress}
      style={useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(
          dragProgress.get(),
          [index - 1, index, index + 1],
          [bgColor, activeColor, bgColor],
        ),
        width: interpolate(
          dragProgress.get(),
          [index - 1, index, index + 1],
          [
            TIMELINE_VIEW_SELECTOR_INACTIVE_WIDTH,
            Math.max(resolvedActiveWidth, TIMELINE_VIEW_SELECTOR_INACTIVE_WIDTH),
            TIMELINE_VIEW_SELECTOR_INACTIVE_WIDTH,
          ],
          "clamp",
        ),
        ...style,
      }))}
    >
      {children}
    </ReAnimatedPressable>
  )
}

function ViewItem({
  view,
  index,
  isActive,
  resolvedActiveWidth,
  onLayout,
}: {
  view: ViewDefinition
  index: number
  isActive: boolean
  resolvedActiveWidth: number
  onLayout: (index: number, layout: ItemLayout) => void
}) {
  const textColor = useColor("gray")
  const unreadCount = useUnreadByView(view.view)
  const borderColor = useColor("gray5")
  const { t } = useTranslation("common")
  const dragProgress = useTimelineSelectorDragProgress()

  return (
    <TimelineViewSelectorContextMenu type="view" viewId={view.view}>
      <View
        onLayout={(event: LayoutChangeEvent) => {
          const { x, width } = event.nativeEvent.layout
          onLayout(index, { x, width })
        }}
      >
        <ItemWrapper
          isActive={isActive}
          index={index}
          activeColor={view.activeColor}
          resolvedActiveWidth={resolvedActiveWidth}
          testID={`timeline-view-${view.name.replace("feed_view_type.", "").replaceAll("_", "-")}`}
          onPress={() =>
            selectTimeline({
              type: "view",
              viewId: view.view,
            })
          }
        >
          <View className="relative">
            <Animated.View
              style={useAnimatedStyle(() => ({
                opacity: interpolate(dragProgress.get(), [index - 1, index, index + 1], [0, 1, 0]),
              }))}
            >
              <view.icon color="#fff" height={21} width={21} />
            </Animated.View>
            <Animated.View
              className="absolute"
              style={useAnimatedStyle(() => ({
                opacity: interpolate(dragProgress.get(), [index - 1, index, index + 1], [1, 0, 1]),
              }))}
            >
              <view.icon color={textColor} height={21} width={21} />
            </Animated.View>
          </View>

          <Animated.View
            className="flex flex-row items-center justify-center gap-2 overflow-hidden"
            style={useAnimatedStyle(() => ({
              width: interpolate(
                dragProgress.get(),
                [index - 1, index, index + 1],
                [0, TIMELINE_VIEW_SELECTOR_ACTIVE_TEXT_WIDTH, 0],
                "clamp",
              ),
            }))}
          >
            <Text
              allowFontScaling={false}
              key={view.name}
              className="text-[14px] font-semibold text-white"
              numberOfLines={1}
              ellipsizeMode="clip"
            >
              {t(view.name)}
            </Text>

            <UnreadCount
              max={99}
              unread={unreadCount}
              dotClassName="size-1.5 rounded-full bg-white"
              textClassName="text-white font-bold flex-1"
            />
          </Animated.View>

          {/* Unread indicator for inactive items */}
          <Animated.View
            className="absolute size-2 rounded-full border"
            style={useAnimatedStyle(() => ({
              left: 30,
              top: 10,
              backgroundColor: textColor,
              borderColor,
              display: unreadCount ? "flex" : "none",
              opacity: interpolate(
                dragProgress.get(),
                [index - 1, index, index + 1],
                [1, 0, 1],
                "clamp",
              ),
            }))}
          />
        </ItemWrapper>
      </View>
    </TimelineViewSelectorContextMenu>
  )
}
