import {
  SuperlogClient,
  type SuperlogConfig,
  superlogTelemetryAttributes,
} from "../application/client.js";
import { compactAttributes } from "../domain/attributes.js";
import { readExpoMetadata } from "../infrastructure/expo-metadata.js";
import { OTelTransport } from "../infrastructure/otel/transport.js";
import {
  installAutomaticInstrumentation,
  type AutomaticInstrumentationOptions,
  type InstalledInstrumentation,
} from "./automatic-instrumentation.js";

export type InitSuperlogOptions = Omit<SuperlogConfig, "token"> & {
  /** @deprecated Use token. */
  dsn?: string;
  endpoint?: string;
  token?: string;
  autoInstrument?: boolean;
  autoTrackConsole?: boolean;
  autoTrackErrors?: boolean;
  autoTrackFetch?: boolean;
  ignoredFetchUrls?: AutomaticInstrumentationOptions["ignoredFetchUrls"];
  useExpoMetadata?: boolean;
};

let defaultClient: SuperlogClient | null = null;
let installedInstrumentation: InstalledInstrumentation | null = null;

export async function initSuperlog(options: InitSuperlogOptions): Promise<SuperlogClient> {
  const {
    autoInstrument = true,
    autoTrackConsole = true,
    autoTrackErrors = true,
    autoTrackFetch = true,
    dsn,
    endpoint,
    ignoredFetchUrls,
    token: providedToken,
    useExpoMetadata,
    ...configOptions
  } = options;
  const token = providedToken ?? dsn;
  if (!token) throw new Error("missing Superlog public token");

  const metadata = useExpoMetadata === false ? null : await readExpoMetadata();
  const config: SuperlogConfig = {
    ...configOptions,
    token,
    release: configOptions.release ?? metadata?.release,
    dist: configOptions.dist ?? metadata?.dist ?? metadata?.updateId,
    gitSha: configOptions.gitSha ?? metadata?.gitSha,
    runtimeVersion: configOptions.runtimeVersion ?? metadata?.runtimeVersion,
    expoUpdateId: configOptions.expoUpdateId ?? metadata?.updateId,
    expoUpdateGroupId: configOptions.expoUpdateGroupId ?? metadata?.updateGroupId,
    platform: configOptions.platform ?? metadata?.platform,
    extraResourceAttributes: {
      ...metadata?.attributes,
      ...configOptions.extraResourceAttributes,
    },
  };
  const transport = new OTelTransport({
    endpoint: endpoint ?? "https://intake.superlog.sh",
    token,
    serviceName: configOptions.serviceName,
    resourceAttributes: compactAttributes(superlogTelemetryAttributes(config)),
  });
  defaultClient = new SuperlogClient({ config, transport });
  installedInstrumentation?.uninstall();
  installedInstrumentation = null;
  if (autoInstrument) {
    const instrumentation = installAutomaticInstrumentation(defaultClient, {
      console: autoTrackConsole,
      errors: autoTrackErrors,
      fetch: autoTrackFetch,
      ignoredFetchUrls: [endpoint ?? "https://intake.superlog.sh", ...(ignoredFetchUrls ?? [])],
    });
    installedInstrumentation = instrumentation;
    defaultClient.addTeardown(() => {
      instrumentation.uninstall();
      if (installedInstrumentation === instrumentation) installedInstrumentation = null;
    });
  }
  return defaultClient;
}

export function getSuperlog(): SuperlogClient {
  if (!defaultClient) {
    throw new Error("Superlog has not been initialized. Call initSuperlog() first.");
  }
  return defaultClient;
}

export function setSuperlogUser(userId: string | null): void {
  getSuperlog().setUser(userId);
}

export function setSuperlogContext(attributes: Parameters<SuperlogClient["setContext"]>[0]): void {
  getSuperlog().setContext(attributes);
}

export function log(
  message: Parameters<SuperlogClient["log"]>[0],
  severity?: Parameters<SuperlogClient["log"]>[1],
  attributes?: Parameters<SuperlogClient["log"]>[2],
): void {
  getSuperlog().log(message, severity, attributes);
}

export function captureException(
  error: Parameters<SuperlogClient["captureException"]>[0],
  attributes?: Parameters<SuperlogClient["captureException"]>[1],
): void {
  getSuperlog().captureException(error, attributes);
}

export function trace<T>(
  name: Parameters<SuperlogClient["trace"]>[0],
  fn: () => T | Promise<T>,
  options?: Parameters<SuperlogClient["trace"]>[2],
): Promise<T> {
  return getSuperlog().trace(name, fn, options);
}
