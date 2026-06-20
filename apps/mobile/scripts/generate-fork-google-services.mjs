#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const mobileDir = join(scriptDir, "..")
const sourcePath = join(mobileDir, "build", "google-services.json")
const outputPath = join(mobileDir, "build", "google-services.fork.json")

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

const main = () => {
  const fileEnv = loadEnvFile(join(mobileDir, ".env"))
  const androidPackage =
    process.env.ANDROID_PACKAGE ?? fileEnv.ANDROID_PACKAGE ?? "is.follow.dev.fork"

  if (androidPackage === "is.follow") {
    console.info("Upstream Android package detected; skipping fork google-services generation.")
    return
  }

  if (!existsSync(sourcePath)) {
    throw new Error(`Missing Firebase config template at ${sourcePath}`)
  }

  const source = JSON.parse(readFileSync(sourcePath, "utf8"))
  const templateClient = source.client?.[0]

  if (!templateClient) {
    throw new Error("google-services.json does not contain any client entries")
  }

  const forkClient = structuredClone(templateClient)
  forkClient.client_info.android_client_info.package_name = androidPackage

  const output = {
    ...source,
    client: [forkClient],
  }

  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
  console.info(`Wrote ${outputPath} for package ${androidPackage}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
}
