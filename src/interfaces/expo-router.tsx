import { useEffect } from "react";
import type { SuperlogClient } from "../application/client.js";
import { getSuperlog } from "./init.js";

type ExpoRouterModule = {
  usePathname: () => string | null;
};

let expoRouterModule: ExpoRouterModule | null | false = null;

export type SuperlogExpoRouterInstrumentationProps = {
  client?: SuperlogClient;
};

export function SuperlogExpoRouterInstrumentation({
  client,
}: SuperlogExpoRouterInstrumentationProps = {}): null {
  const pathname = useOptionalPathname();
  useEffect(() => {
    if (!pathname) return;
    void (client ?? getSuperlog()).recordNavigation(pathname);
  }, [client, pathname]);
  return null;
}

function useOptionalPathname(): string | null {
  if (expoRouterModule === null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      expoRouterModule = require("expo-router") as ExpoRouterModule;
    } catch {
      expoRouterModule = false;
    }
  }
  if (!expoRouterModule) return null;
  return expoRouterModule.usePathname();
}
