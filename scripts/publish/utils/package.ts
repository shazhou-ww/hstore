import { promises as fs } from "fs";
import path from "path";
import type {
  PackageJson,
  WorkspacePackage,
  DependencyField,
} from "../types";
import { DEPENDENCY_FIELDS } from "../types";

export async function gatherWorkspacePackages(
  root: string
): Promise<WorkspacePackage[]> {
  const rootManifest = await readPackageJson(path.join(root, "package.json"));
  const workspaceGlobs = resolveWorkspaceGlobs(rootManifest);
  const discovered = new Map<string, WorkspacePackage>();

  for (const pattern of workspaceGlobs) {
    const normalized = pattern.replace(/\\/g, "/").replace(/\/?$/, "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const glob = new (globalThis as any).Bun.Glob(`${normalized}/package.json`);
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
        version: manifest.version,
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

export async function readPackageJson(filePath: string): Promise<PackageJson> {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as PackageJson;
}

export async function writePackageJson(
  filePath: string,
  manifest: PackageJson
): Promise<void> {
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  await fs.writeFile(filePath, content, "utf8");
}

export async function checkPackagesToPublish(
  packages: WorkspacePackage[]
): Promise<WorkspacePackage[]> {
  const { isLocalVersionNewer } = await import("./npm");
  const packagesToPublish: WorkspacePackage[] = [];

  for (const pkg of packages) {
    if (pkg.manifest.private) continue;

    const isNewer = await isLocalVersionNewer(pkg.name, pkg.version);
    if (isNewer) {
      packagesToPublish.push(pkg);
    }
  }

  return packagesToPublish;
}

export function transformManifest(
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
    throw new Error(
      `Dependency ${dep} uses workspace range but is not in workspace.`
    );
  }

  const spec = range.slice("workspace:".length);
  if (spec === "" || spec === "*" || spec === target.version)
    return target.version;
  if (spec === "^" || spec === "~") return `${spec}${target.version}`;
  if (spec.startsWith("^") || spec.startsWith("~")) {
    return `${spec[0]}${target.version}`;
  }

  return spec;
}


