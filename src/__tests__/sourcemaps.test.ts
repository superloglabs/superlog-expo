import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { discoverSourceMaps } from "../application/sourcemap-upload.js";
import { buildSourceMapArtifact } from "../domain/sourcemaps.js";

const exampleMap = JSON.stringify({
  version: 3,
  debugId: "debug-123",
  sources: ["app/index.tsx"],
  mappings: "AAAA",
});

test("buildSourceMapArtifact extracts debug id and hashes contents", () => {
  const artifact = buildSourceMapArtifact({
    mapFile: "dist/android-update.map",
    sourceMap: exampleMap,
    release: "app@1.0.0+1",
  });

  assert.equal(artifact.platform, "android");
  assert.equal(artifact.debugId, "debug-123");
  assert.equal(artifact.release, "app@1.0.0+1");
  assert.equal(artifact.sourceMapHash.length, 64);
  assert.equal(artifact.sourceMapBytes, Buffer.byteLength(exampleMap));
});

test("discoverSourceMaps finds maps recursively and pairs adjacent bundles", async () => {
  const root = await mkdtemp(join(tmpdir(), "superlog-sourcemaps-"));
  const dist = join(root, "dist");
  await mkdir(dist);
  await writeFile(join(dist, "ios-main.hbc"), "bundle");
  await writeFile(join(dist, "ios-main.hbc.map"), exampleMap);

  const artifacts = await discoverSourceMaps({
    directory: dist,
    release: "app@1.0.0+1",
    dist: "1.0.0",
  });

  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0]?.platform, "ios");
  assert.equal(artifacts[0]?.debugId, "debug-123");
  assert.match(artifacts[0]?.bundleFile ?? "", /ios-main\.hbc$/);
});
