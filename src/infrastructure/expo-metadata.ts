import type { Attributes } from "../domain/attributes.js";

type ExpoConstantsModule = {
  default?: {
    expoConfig?: ExpoConfig;
  };
};

type ExpoConfig = {
  version?: string;
  runtimeVersion?: string | { policy?: string };
  ios?: { buildNumber?: string };
  android?: { versionCode?: number };
  slug?: string;
};

type ExpoUpdatesModule = {
  updateId?: string | null;
  isEmbeddedLaunch?: boolean;
  channel?: string | null;
  manifest?: {
    metadata?: Record<string, unknown>;
  } | null;
};

export type ExpoMetadata = {
  release?: string;
  runtimeVersion?: string;
  updateId?: string;
  updateGroupId?: string;
  channel?: string;
  attributes: Attributes;
};

export async function readExpoMetadata(): Promise<ExpoMetadata> {
  const constants = await optionalExpoConstants();
  const updates = await optionalExpoUpdates();
  const config = constants?.default?.expoConfig;
  const runtimeVersion = runtimeVersionString(config?.runtimeVersion);
  const updateGroupId = updates?.manifest?.metadata?.updateGroup;
  const release = buildRelease(config);

  return {
    release,
    runtimeVersion,
    updateId: updates?.updateId ?? "embedded",
    updateGroupId: typeof updateGroupId === "string" ? updateGroupId : undefined,
    channel: updates?.channel ?? undefined,
    attributes: {
      "expo.app_version": config?.version,
      "expo.runtime_version": runtimeVersion,
      "expo.update_id": updates?.updateId ?? "embedded",
      "expo.update_group_id": typeof updateGroupId === "string" ? updateGroupId : undefined,
      "expo.channel": updates?.channel ?? undefined,
      "expo.is_embedded_launch": updates?.isEmbeddedLaunch,
    },
  };
}

async function optionalExpoConstants(): Promise<ExpoConstantsModule | null> {
  try {
    return await import("expo-constants") as ExpoConstantsModule;
  } catch {
    return null;
  }
}

async function optionalExpoUpdates(): Promise<ExpoUpdatesModule | null> {
  try {
    return await import("expo-updates") as ExpoUpdatesModule;
  } catch {
    return null;
  }
}

function runtimeVersionString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "policy" in value) {
    return String((value as { policy?: string }).policy);
  }
  return undefined;
}

function buildRelease(config: ExpoConfig | undefined): string | undefined {
  if (!config?.version) return undefined;
  const build = config.ios?.buildNumber ?? config.android?.versionCode;
  return `${config.slug ?? "expo"}@${config.version}${build ? `+${build}` : ""}`;
}
