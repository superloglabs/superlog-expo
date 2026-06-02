export { SuperlogClient } from "./application/client.js";
export { discoverSourceMaps, uploadSourceMap } from "./application/sourcemap-upload.js";
export type { InitSuperlogOptions } from "./interfaces/init.js";
export type { AutomaticInstrumentationOptions } from "./interfaces/automatic-instrumentation.js";
export {
  captureException,
  getSuperlog,
  initSuperlog,
  log,
  setSuperlogContext,
  setSuperlogUser,
  trace,
} from "./interfaces/init.js";
export { SuperlogExpoRouterInstrumentation } from "./interfaces/expo-router.js";
export type { SuperlogProviderProps } from "./interfaces/provider.js";
export { SuperlogProvider } from "./interfaces/provider.js";
export type { SourceMapArtifact } from "./domain/sourcemaps.js";
export type { Severity } from "./application/transport.js";
export type { Attributes, AttributeValue } from "./domain/attributes.js";
