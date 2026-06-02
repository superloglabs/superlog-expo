import { useEffect, useState, type ReactNode } from "react";
import type { SuperlogClient } from "../application/client.js";
import { SuperlogExpoRouterInstrumentation } from "./expo-router.js";
import { initSuperlog, type InitSuperlogOptions } from "./init.js";

export type SuperlogProviderProps = InitSuperlogOptions & {
  autoTrackRoutes?: boolean;
  children?: ReactNode;
  onError?: (error: unknown) => void;
};

export function SuperlogProvider({
  autoTrackRoutes = true,
  children,
  onError,
  ...options
}: SuperlogProviderProps) {
  const [client, setClient] = useState<SuperlogClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    let activeClient: SuperlogClient | null = null;
    void initSuperlog(options)
      .then((nextClient) => {
        if (cancelled) {
          void nextClient.shutdown();
          return;
        }
        activeClient = nextClient;
        setClient(nextClient);
      })
      .catch((error: unknown) => {
        if (!cancelled) onError?.(error);
      });

    return () => {
      cancelled = true;
      void activeClient?.shutdown();
      setClient(null);
    };
  }, [
    options.autoInstrument,
    options.autoTrackConsole,
    options.autoTrackErrors,
    options.autoTrackFetch,
    options.dist,
    options.dsn,
    options.endpoint,
    options.environment,
    options.expoUpdateGroupId,
    options.expoUpdateId,
    options.extraResourceAttributes,
    options.gitSha,
    options.ignoredFetchUrls,
    options.platform,
    options.release,
    options.runtimeVersion,
    options.serviceName,
    options.token,
    options.useExpoMetadata,
    onError,
  ]);

  return (
    <>
      {autoTrackRoutes && client ? <SuperlogExpoRouterInstrumentation client={client} /> : null}
      {children}
    </>
  );
}
