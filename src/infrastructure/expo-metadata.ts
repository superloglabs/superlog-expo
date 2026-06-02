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

type ReactNativeModule = {
  Platform?: {
    OS?: string;
  };
};

export type ExpoMetadata = {
  dist?: string;
  gitSha?: string;
  platform?: string;
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
  const reactNative = await optionalReactNative();
  const config = constants?.default?.expoConfig;
  const runtimeVersion = runtimeVersionString(config?.runtimeVersion);
  const updateGroupId = updates?.manifest?.metadata?.updateGroup;
  const updateId = updates?.updateId ?? "embedded";
  const dist = updateId ?? updates?.channel ?? undefined;
  const gitSha = readEnv("EXPO_PUBLIC_GIT_SHA")
    ?? readEnv("EXPO_PUBLIC_SUPERLOG_GIT_SHA")
    ?? readEnv("EAS_BUILD_GIT_COMMIT_HASH");
  const platform = reactNative?.Platform?.OS ?? readEnv("EXPO_OS");
  const release = buildRelease(config);

  return {
    dist,
    gitSha,
    platform,
    release,
    runtimeVersion,
    updateId,
    updateGroupId: typeof updateGroupId === "string" ? updateGroupId : undefined,
    channel: updates?.channel ?? undefined,
    attributes: {
      "expo.app_version": config?.version,
      "expo.runtime_version": runtimeVersion,
      "expo.update_id": updateId,
      "expo.update_group_id": typeof updateGroupId === "string" ? updateGroupId : undefined,
      "expo.channel": updates?.channel ?? undefined,
      "expo.is_embedded_launch": updates?.isEmbeddedLaunch,
      "device.platform": platform,
      "vcs.ref.head.revision": gitSha,
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

async function optionalReactNative(): Promise<ReactNativeModule | null> {
  try {
    return await import("react-native") as ReactNativeModule;
  } catch {
    return null;
  }
}

function readEnv(key: string): string | undefined {
  const value = typeof process === "undefined" ? undefined : process.env?.[key];
  return value && value.length > 0 ? value : undefined;
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
