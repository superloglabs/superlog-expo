import { discoverSourceMaps, uploadSourceMap } from "../application/sourcemap-upload.js";

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  const [command, subcommand, ...rest] = argv;
  if (command !== "sourcemaps" || subcommand !== "upload") {
    printUsage();
    return 1;
  }

  const flags = parseFlags(rest);
  const directory = required(flags, "dir");
  const release = requiredValue(
    flags.release ?? process.env.SUPERLOG_RELEASE ?? process.env.EXPO_PUBLIC_SUPERLOG_RELEASE,
    "release",
  );
  const dist = flags.dist ?? process.env.SUPERLOG_DIST ?? process.env.EXPO_PUBLIC_SUPERLOG_DIST;
  const projectId = required(flags, "project-id");
  const token = flags.token ?? process.env.SUPERLOG_TOKEN;
  if (!token) throw new Error("missing --token or SUPERLOG_TOKEN");

  const apiUrl = flags["api-url"] ?? "https://api.superlog.sh";
  const artifacts = await discoverSourceMaps({
    directory,
    release,
    dist,
    platform: flags.platform,
  });
  if (artifacts.length === 0) {
    console.warn(`No source maps found in ${directory}`);
    return 0;
  }

  for (const artifact of artifacts) {
    const result = await uploadSourceMap({ apiUrl, projectId, token, artifact });
    console.log(JSON.stringify(result));
  }
  return 0;
}

function parseFlags(args: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg?.startsWith("--")) throw new Error(`unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function required(flags: Record<string, string | undefined>, name: string): string {
  return requiredValue(flags[name], name);
}

function requiredValue(input: string | undefined, name: string): string {
  const value = input?.trim();
  if (!value) throw new Error(`missing --${name}`);
  return value;
}

function printUsage(): void {
  console.error(
    "Usage: superlog-expo sourcemaps upload --dir dist --project-id <id> --release <release> --token <sl_public_...>",
  );
}
