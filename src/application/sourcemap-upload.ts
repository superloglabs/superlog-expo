import { promises as fs } from "node:fs";
import { join, relative } from "node:path";
import { buildSourceMapArtifact, type SourceMapArtifact } from "../domain/sourcemaps.js";

export type DiscoverSourceMapsOptions = {
  directory: string;
  release: string;
  dist?: string;
  platform?: string;
};

export async function discoverSourceMaps(options: DiscoverSourceMapsOptions): Promise<SourceMapArtifact[]> {
  const files = await walk(options.directory);
  const maps = files.filter((file) => file.endsWith(".map"));
  const artifacts: SourceMapArtifact[] = [];
  for (const mapFile of maps.sort()) {
    const sourceMap = await fs.readFile(mapFile, "utf8");
    artifacts.push(
      buildSourceMapArtifact({
        mapFile: relative(process.cwd(), mapFile),
        sourceMap,
        release: options.release,
        dist: options.dist,
        platform: options.platform,
        bundleFile: inferBundleFile(mapFile, files),
      }),
    );
  }
  return artifacts;
}

export type UploadSourceMapOptions = {
  apiUrl: string;
  projectId: string;
  token: string;
  artifact: SourceMapArtifact;
};

export async function uploadSourceMap(options: UploadSourceMapOptions): Promise<unknown> {
  const response = await fetch(`${options.apiUrl.replace(/\/+$/, "")}/api/v1/projects/${options.projectId}/sourcemaps`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      platform: options.artifact.platform,
      release: options.artifact.release,
      dist: options.artifact.dist,
      debugId: options.artifact.debugId,
      bundleFile: options.artifact.bundleFile,
      mapFile: options.artifact.mapFile,
      sourceMap: options.artifact.sourceMap,
      sourceMapHash: options.artifact.sourceMapHash,
      sourceMapBytes: options.artifact.sourceMapBytes,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`source map upload failed (${response.status}): ${body}`);
  }
  return response.json();
}

async function walk(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(path));
    } else {
      out.push(path);
    }
  }
  return out;
}

function inferBundleFile(mapFile: string, files: string[]): string | undefined {
  const withoutMap = mapFile.slice(0, -4);
  const exact = files.find((file) => file === withoutMap);
  if (exact) return relative(process.cwd(), exact);
  const hbc = `${withoutMap.replace(/\.bundle$/, "")}.hbc`;
  const hbcMatch = files.find((file) => file === hbc);
  return hbcMatch ? relative(process.cwd(), hbcMatch) : undefined;
}
