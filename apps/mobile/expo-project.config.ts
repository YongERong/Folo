const UPSTREAM_EAS_PROJECT_ID = "a6335b14-fb84-45aa-ba80-6f6ab8926920"

export type ExpoProjectConfig = {
  owner: string
  projectId: string
  slug: string
  iosBundleIdentifier: string
  androidPackage: string
  useUpstreamOtaUpdates: boolean
}

export const resolveExpoProjectConfig = (): ExpoProjectConfig => {
  const owner = process.env.EXPO_OWNER ?? "follow"
  const projectId = process.env.EAS_PROJECT_ID ?? UPSTREAM_EAS_PROJECT_ID
  const slug = process.env.EXPO_SLUG ?? "follow"
  const iosBundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER ?? "is.follow"
  const androidPackage = process.env.ANDROID_PACKAGE ?? "is.follow"

  const useUpstreamOtaUpdates =
    process.env.EXPO_UPDATES_ENABLED === "true" ||
    (process.env.EXPO_UPDATES_ENABLED !== "false" &&
      owner === "follow" &&
      projectId === UPSTREAM_EAS_PROJECT_ID)

  return {
    owner,
    projectId,
    slug,
    iosBundleIdentifier,
    androidPackage,
    useUpstreamOtaUpdates,
  }
}

export const UPSTREAM_EAS_PROJECT = UPSTREAM_EAS_PROJECT_ID
