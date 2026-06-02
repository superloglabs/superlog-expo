import { useEffect } from "react";
import { getSuperlog } from "./init.js";

type ExpoRouterModule = {
  usePathname: () => string | null;
};

let expoRouterModule: ExpoRouterModule | null | false = null;

export function SuperlogExpoRouterInstrumentation(): null {
  const pathname = useOptionalPathname();
  useEffect(() => {
    if (!pathname) return;
    const client = getSuperlog();
    client.setRoute(pathname);
    void client.trace("navigation.route", () => {
      client.log("navigation.route", "info", { "route.name": pathname });
    });
  }, [pathname]);
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
