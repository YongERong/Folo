#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { dirname, join } from "pathe"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const mobileDir = join(scriptDir, "..")
const envPath = join(mobileDir, ".env")

const loadEnvFile = (path) => {
  if (!existsSync(path)) {
    return {}
  }

  const entries = {}

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) {
      continue
    }

    const separatorIndex = trimmed.indexOf("=")
    if (separatorIndex === -1) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    entries[key] = value
  }

  return entries
}

const upsertEnvValue = (contents, key, value) => {
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, "m")

  if (pattern.test(contents)) {
    return contents.replace(pattern, line)
  }

  const trimmed = contents.trimEnd()
  return trimmed.length > 0 ? `${trimmed}\n${line}\n` : `${line}\n`
}

const runEas = (args, env, { allowFailure = false } = {}) => {
  const result = spawnSync("pnpm", ["dlx", "eas-cli@16.26.0", ...args], {
    cwd: mobileDir,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`

  if (result.status !== 0 && !allowFailure) {
    throw new Error(output.trim() || `eas ${args.join(" ")} failed`)
  }

  return {
    ok: result.status === 0,
    output,
    exitCode: result.status ?? 1,
  }
}

const extractProjectIdFromOutput = (output) => {
  const patterns = [
    /"projectId":\s*"([0-9a-f-]{36})"/i,
    /\bID\s+([0-9a-f-]{36})\b/i,
    /projects\/[0-9a-f-]{36}/i,
  ]

  for (const pattern of patterns) {
    const match = output.match(pattern)
    if (match?.[1]) {
      return match[1]
    }
  }

  return
}

const resolveExpoUsername = (whoamiOutput) => {
  const lines = whoamiOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("★") && !line.startsWith("To upgrade"))

  for (const line of lines) {
    const loggedInMatch = line.match(/^Logged in as (.+)$/i)
    if (loggedInMatch?.[1]) {
      return loggedInMatch[1].trim()
    }

    const authenticatedMatch = line.match(/^([^\s(]+)\s+\(authenticated using /i)
    if (authenticatedMatch?.[1]) {
      return authenticatedMatch[1].trim()
    }
  }

  throw new Error(`Could not parse Expo username from:\n${whoamiOutput}`)
}

const main = () => {
  const fileEnv = loadEnvFile(envPath)
  const expoToken = process.env.EXPO_TOKEN ?? fileEnv.EXPO_TOKEN ?? fileEnv.EAS_TOKEN

  if (!expoToken) {
    throw new Error(
      [
        "Missing Expo access token.",
        "Add EXPO_TOKEN=... to apps/mobile/.env (EAS_TOKEN is also accepted).",
        "Create one at https://expo.dev/settings/access-tokens",
      ].join("\n"),
    )
  }

  const childEnv = {
    ...process.env,
    ...fileEnv,
    EXPO_TOKEN: expoToken,
  }

  console.info("Checking Expo login...")
  const whoamiResult = runEas(["whoami"], childEnv)
  process.stdout.write(whoamiResult.output)

  const expoOwner = fileEnv.EXPO_OWNER || resolveExpoUsername(whoamiResult.output)
  const expoSlug = fileEnv.EXPO_SLUG || "folo-dev"
  const iosBundleIdentifier =
    fileEnv.IOS_BUNDLE_IDENTIFIER ||
    `is.follow.dev.${expoOwner.replaceAll(/[^a-z0-9]/gi, "").toLowerCase()}`
  const androidPackage = fileEnv.ANDROID_PACKAGE || iosBundleIdentifier

  console.info("\nUsing fork Expo settings:")
  console.info(`  EXPO_OWNER=${expoOwner}`)
  console.info(`  EXPO_SLUG=${expoSlug}`)
  console.info(`  IOS_BUNDLE_IDENTIFIER=${iosBundleIdentifier}`)
  console.info(`  ANDROID_PACKAGE=${androidPackage}`)

  const initEnv = {
    ...childEnv,
    EXPO_OWNER: expoOwner,
    EXPO_SLUG: expoSlug,
    IOS_BUNDLE_IDENTIFIER: iosBundleIdentifier,
    ANDROID_PACKAGE: androidPackage,
    EXPO_UPDATES_ENABLED: "false",
    EAS_PROJECT_ID: "",
  }

  console.info("\nCreating/linking EAS project...")
  const initResult = runEas(["init", "--non-interactive", "--force"], initEnv, {
    allowFailure: true,
  })
  process.stdout.write(initResult.output)

  let projectId = fileEnv.EAS_PROJECT_ID || extractProjectIdFromOutput(initResult.output)

  if (!projectId) {
    if (!initResult.ok && !initResult.output.includes("Created @")) {
      throw new Error(initResult.output.trim() || "eas init failed before creating a project")
    }

    throw new Error(
      `EAS project appears to have been created, but no project ID was found in init output:\n${initResult.output}`,
    )
  }

  const linkedEnv = {
    ...initEnv,
    EAS_PROJECT_ID: projectId,
  }

  console.info("\nReading linked project info...")
  const projectInfoResult = runEas(["project:info"], linkedEnv, { allowFailure: true })
  process.stdout.write(projectInfoResult.output)

  if (!fileEnv.EAS_PROJECT_ID && projectInfoResult.ok) {
    projectId = extractProjectIdFromOutput(projectInfoResult.output) ?? projectId
  }

  let envContents = existsSync(envPath) ? readFileSync(envPath, "utf8") : ""
  envContents = upsertEnvValue(envContents, "EXPO_TOKEN", expoToken)
  envContents = upsertEnvValue(envContents, "EXPO_OWNER", expoOwner)
  envContents = upsertEnvValue(envContents, "EXPO_SLUG", expoSlug)
  envContents = upsertEnvValue(envContents, "EAS_PROJECT_ID", projectId)
  envContents = upsertEnvValue(envContents, "IOS_BUNDLE_IDENTIFIER", iosBundleIdentifier)
  envContents = upsertEnvValue(envContents, "ANDROID_PACKAGE", androidPackage)
  envContents = upsertEnvValue(envContents, "EXPO_UPDATES_ENABLED", "false")

  if (!envContents.includes("EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN=")) {
    envContents = upsertEnvValue(envContents, "EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN", "replace-me")
  }

  writeFileSync(envPath, envContents)

  console.info("\nUpdated apps/mobile/.env")
  console.info(`  EAS_PROJECT_ID=${projectId}`)
  console.info("\nNext steps:")
  console.info("  1. Set EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN in apps/mobile/.env")
  console.info("  2. Add the same EXPO_TOKEN as a GitHub secret on your fork")
  console.info("  3. Add CI_ENABLED=true as a GitHub secret")
  console.info("  4. Configure Android credentials:")
  console.info("       cd apps/mobile && pnpm dlx eas-cli credentials -p android")
  console.info("  5. For iOS device builds, configure iOS credentials:")
  console.info("       cd apps/mobile && pnpm dlx eas-cli credentials -p ios")
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
}
