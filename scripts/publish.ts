#!/usr/bin/env bun

import { promises as fs } from "fs";
import path from "path";

type DependencyField =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies"
  | "optionalDependencies";

type PackageJson = {
  name?: string;
  version?: string;
  workspaces?: string[] | { packages?: string[] };
  [key: string]: unknown;
};

type WorkspacePackage = {
  dir: string;
  manifest: PackageJson;
  manifestPath: string;
  name: string;
  version: string;
};

type CliArgs = {
  access?: string;
  dryRun: boolean;
  extraPublishArgs: string[];
  tag?: string;
  targets: string[];
};

const DEPENDENCY_FIELDS: DependencyField[] = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies"
];

type BunGlob = {
  scan(options: { cwd: string }): AsyncIterable<string>;
};

type BunSubprocess = {
  exited: Promise<number>;
};

declare const Bun: {
  Glob: new (pattern: string) => BunGlob;
  spawn: (
    command: string[],
    options: { cwd: string; stdout?: "inherit"; stderr?: "inherit" }
  ) => BunSubprocess;
};

async function main(): Promise<void> {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const workspacePackages = await gatherWorkspacePackages(cwd);
  const packageMap = new Map(workspacePackages.map((pkg) => [pkg.name, pkg]));
  const targets = resolveTargets(args.targets, workspacePackages);

  if (targets.length === 0) {
    throw new Error("No matching packages to publish.");
  }

  for (const pkg of targets) {
    await publishPackage(pkg, packageMap, args);
  }
}

function parseArgs(argv: string[]): CliArgs {
  const targets: string[] = [];
  const extraPublishArgs: string[] = [];
  let dryRun = false;
  let access: string | undefined;
  let tag: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--package" || arg === "-p") {
      const value = argv[++i];
      if (!value) throw new Error("--package requires a value");
      targets.push(value);
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--tag") {
      tag = argv[++i];
      if (!tag) throw new Error("--tag requires a value");
    } else if (arg === "--access") {
      access = argv[++i];
      if (!access) throw new Error("--access requires a value");
    } else {
      extraPublishArgs.push(arg);
    }
  }

  return { dryRun, access, tag, targets, extraPublishArgs };
}

async function gatherWorkspacePackages(root: string): Promise<WorkspacePackage[]> {
  const rootManifest = await readPackageJson(path.join(root, "package.json"));
  const workspaceGlobs = resolveWorkspaceGlobs(rootManifest);
  const discovered = new Map<string, WorkspacePackage>();

  for (const pattern of workspaceGlobs) {
    const normalized = pattern.replace(/\\/g, "/").replace(/\/?$/, "");
    const glob = new Bun.Glob(`${normalized}/package.json`);
    for await (const relativeManifest of glob.scan({ cwd: root })) {
      const manifestPath = path.join(root, relativeManifest);
      const dir = path.dirname(manifestPath);
      const manifest = await safeReadPackageJson(manifestPath);
      if (!manifest?.name || !manifest.version) continue;
      discovered.set(manifest.name, {
        dir,
        manifest,
        manifestPath,
        name: manifest.name,
        version: manifest.version
      });
    }
  }

  return [...discovered.values()];
}

function resolveWorkspaceGlobs(manifest: PackageJson): string[] {
  const workspaces = manifest.workspaces;
  if (!workspaces) return ["packages/*"];
  if (Array.isArray(workspaces)) return workspaces;
  return workspaces.packages ?? ["packages/*"];
}

async function safeReadPackageJson(
  manifestPath: string
): Promise<PackageJson | null> {
  try {
    return await readPackageJson(manifestPath);
  } catch {
    return null;
  }
}

async function publishPackage(
  pkg: WorkspacePackage,
  packageMap: Map<string, WorkspacePackage>,
  args: CliArgs
): Promise<void> {
  const originalText = await fs.readFile(pkg.manifestPath, "utf8");
  const originalManifest = JSON.parse(originalText) as PackageJson;
  const transformed = transformManifest(originalManifest, packageMap);

  if (transformed.changed) {
    await writePackageJson(pkg.manifestPath, transformed.manifest);
  }

  try {
    await runPublish(pkg, args);
  } finally {
    if (transformed.changed) {
      await fs.writeFile(pkg.manifestPath, originalText);
    }
  }
}

function transformManifest(
  manifest: PackageJson,
  packageMap: Map<string, WorkspacePackage>
): { changed: boolean; manifest: PackageJson } {
  const clone = JSON.parse(JSON.stringify(manifest)) as PackageJson;
  let changed = false;

  for (const field of DEPENDENCY_FIELDS) {
    const section = clone[field] as Record<string, string> | undefined;
    if (!section) continue;
    for (const [dep, range] of Object.entries(section)) {
      const resolved = resolveWorkspaceRange(range, dep, packageMap);
      if (resolved && resolved !== range) {
        section[dep] = resolved;
        changed = true;
      }
    }
  }

  return { changed, manifest: clone };
}

function resolveWorkspaceRange(
  range: string,
  dep: string,
  packageMap: Map<string, WorkspacePackage>
): string | null {
  if (!range.startsWith("workspace:")) return null;
  const target = packageMap.get(dep);
  if (!target) {
    throw new Error(`Dependency ${dep} uses workspace range but is not in workspace.`);
  }

  const spec = range.slice("workspace:".length);
  if (spec === "" || spec === "*" || spec === target.version) return target.version;
  if (spec === "^" || spec === "~") return `${spec}${target.version}`;
  if (spec.startsWith("^") || spec.startsWith("~")) {
    return `${spec[0]}${target.version}`;
  }

  return spec;
}

async function runPublish(pkg: WorkspacePackage, args: CliArgs): Promise<void> {
  const command = ["bun", "publish", ...args.extraPublishArgs];
  if (args.tag) command.push("--tag", args.tag);
  if (args.access) command.push("--access", args.access);

  if (args.dryRun) {
    console.log(`[dry-run] bun publish ${command.slice(2).join(" ")} (cwd=${pkg.dir})`);
    return;
  }

  const proc = Bun.spawn(command, {
    cwd: pkg.dir,
    stdout: "inherit",
    stderr: "inherit"
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`bun publish failed for ${pkg.name} (exit code ${exitCode}).`);
  }
}

function resolveTargets(
  selectors: string[],
  packages: WorkspacePackage[]
): WorkspacePackage[] {
  if (selectors.length === 0) return packages.filter((pkg) => !pkg.manifest.private);

  const selection = new Map<string, WorkspacePackage>();
  for (const selector of selectors) {
    const match = packages.find(
      (pkg) => pkg.name === selector || path.resolve(pkg.dir) === path.resolve(selector)
    );
    if (!match) {
      throw new Error(`No workspace package matches "${selector}".`);
    }
    selection.set(match.name, match);
  }

  return [...selection.values()];
}

async function readPackageJson(filePath: string): Promise<PackageJson> {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as PackageJson;
}

async function writePackageJson(filePath: string, manifest: PackageJson): Promise<void> {
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  await fs.writeFile(filePath, content, "utf8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

