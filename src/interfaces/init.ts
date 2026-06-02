import {
  SuperlogClient,
  type SuperlogConfig,
  superlogTelemetryAttributes,
} from "../application/client.js";
import { compactAttributes } from "../domain/attributes.js";
import { readExpoMetadata } from "../infrastructure/expo-metadata.js";
import { OTelTransport } from "../infrastructure/otel/transport.js";

export type InitSuperlogOptions = SuperlogConfig & {
  endpoint?: string;
  useExpoMetadata?: boolean;
};

let defaultClient: SuperlogClient | null = null;

export async function initSuperlog(options: InitSuperlogOptions): Promise<SuperlogClient> {
  const metadata = options.useExpoMetadata === false ? null : await readExpoMetadata();
  const config: SuperlogConfig = {
    ...options,
    release: options.release ?? metadata?.release,
    dist: options.dist,
    runtimeVersion: options.runtimeVersion ?? metadata?.runtimeVersion,
    expoUpdateId: options.expoUpdateId ?? metadata?.updateId,
    expoUpdateGroupId: options.expoUpdateGroupId ?? metadata?.updateGroupId,
    extraResourceAttributes: {
      ...metadata?.attributes,
      ...options.extraResourceAttributes,
    },
  };
  const transport = new OTelTransport({
    endpoint: options.endpoint ?? "https://intake.superlog.sh",
    dsn: options.dsn,
    serviceName: options.serviceName,
    resourceAttributes: compactAttributes(superlogTelemetryAttributes(config)),
  });
  defaultClient = new SuperlogClient({ config, transport });
  return defaultClient;
}

export function getSuperlog(): SuperlogClient {
  if (!defaultClient) {
    throw new Error("Superlog has not been initialized. Call initSuperlog() first.");
  }
  return defaultClient;
}
