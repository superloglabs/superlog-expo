import { createHash } from "node:crypto";
import { basename } from "node:path";

export type SourceMapArtifact = {
  platform: "android" | "ios" | "web" | string;
  release: string;
  dist?: string;
  debugId?: string;
  bundleFile?: string;
  mapFile: string;
  sourceMap: string;
  sourceMapHash: string;
  sourceMapBytes: number;
};

export type SourceMapJson = {
  debugId?: unknown;
  debug_id?: unknown;
  sources?: unknown;
  version?: unknown;
};

export function parseSourceMap(raw: string): SourceMapJson {
  const parsed = JSON.parse(raw) as SourceMapJson;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("source map must be a JSON object");
  }
  if (!Array.isArray(parsed.sources)) {
    throw new Error("source map is missing a sources array");
  }
  return parsed;
}

export function sourceMapDebugId(sourceMap: SourceMapJson): string | undefined {
  const value = sourceMap.debugId ?? sourceMap.debug_id;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function inferPlatformFromPath(path: string): string {
  const name = basename(path).toLowerCase();
  if (name.includes("android")) return "android";
  if (name.includes("ios")) return "ios";
  if (name.includes("web")) return "web";
  return "unknown";
}

export function buildSourceMapArtifact(input: {
  mapFile: string;
  sourceMap: string;
  release: string;
  platform?: string;
  dist?: string;
  bundleFile?: string;
  debugId?: string;
}): SourceMapArtifact {
  const parsed = parseSourceMap(input.sourceMap);
  const bytes = Buffer.byteLength(input.sourceMap);
  return {
    platform: input.platform ?? inferPlatformFromPath(input.mapFile),
    release: input.release,
    dist: input.dist,
    debugId: input.debugId ?? sourceMapDebugId(parsed),
    bundleFile: input.bundleFile,
    mapFile: input.mapFile,
    sourceMap: input.sourceMap,
    sourceMapHash: createHash("sha256").update(input.sourceMap).digest("hex"),
    sourceMapBytes: bytes,
  };
}
