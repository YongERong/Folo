import { afterEach, describe, expect, it } from "vitest"

import { resolveExpoProjectConfig } from "../expo-project.config"

describe("resolveExpoProjectConfig", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("uses upstream defaults when fork env vars are unset", () => {
    delete process.env.EXPO_OWNER
    delete process.env.EAS_PROJECT_ID
    delete process.env.EXPO_SLUG
    delete process.env.IOS_BUNDLE_IDENTIFIER
    delete process.env.ANDROID_PACKAGE
    delete process.env.EXPO_UPDATES_ENABLED

    expect(resolveExpoProjectConfig()).toEqual({
      owner: "follow",
      projectId: "a6335b14-fb84-45aa-ba80-6f6ab8926920",
      slug: "follow",
      iosBundleIdentifier: "is.follow",
      androidPackage: "is.follow",
      useUpstreamOtaUpdates: true,
    })
  })

  it("disables upstream OTA updates for fork projects", () => {
    process.env.EXPO_OWNER = "yongerong"
    process.env.EAS_PROJECT_ID = "11111111-1111-1111-1111-111111111111"
    process.env.EXPO_SLUG = "folo-dev"
    process.env.IOS_BUNDLE_IDENTIFIER = "is.follow.dev.yongerong"
    process.env.ANDROID_PACKAGE = "is.follow.dev.yongerong"
    process.env.EXPO_UPDATES_ENABLED = "false"

    expect(resolveExpoProjectConfig()).toEqual({
      owner: "yongerong",
      projectId: "11111111-1111-1111-1111-111111111111",
      slug: "folo-dev",
      iosBundleIdentifier: "is.follow.dev.yongerong",
      androidPackage: "is.follow.dev.yongerong",
      useUpstreamOtaUpdates: false,
    })
  })
})
