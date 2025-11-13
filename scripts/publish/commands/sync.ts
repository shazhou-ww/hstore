import type { WorkspacePackage } from "../types";
import { DEPENDENCY_FIELDS } from "../types";
import { readPackageJson, writePackageJson } from "../utils/package";
import {
  bumpPatchVersion,
  shouldUpdateDependency,
  updateDependencyRange,
} from "../utils/version";
import { gitCommitDependencyUpdates } from "../utils/git";

export async function syncDependentPackages(
  publishedPackages: WorkspacePackage[],
  allPackages: WorkspacePackage[],
  cwd: string,
  dryRun: boolean
): Promise<void> {
  const publishedNames = new Set(publishedPackages.map((p) => p.name));
  const publishedVersions = new Map<string, string>(
    publishedPackages.map((p) => [p.name, p.version])
  );

  const packagesToUpdate: Array<{
    pkg: WorkspacePackage;
    updatedDeps: Array<{ name: string; oldVersion: string; newVersion: string }>;
  }> = [];

  for (const pkg of allPackages) {
    if (pkg.manifest.private) continue;
    const updatedDeps: Array<{
      name: string;
      oldVersion: string;
      newVersion: string;
    }> = [];

    for (const field of DEPENDENCY_FIELDS) {
      const section = pkg.manifest[field] as Record<string, string> | undefined;
      if (!section) continue;

      for (const [depName, depRange] of Object.entries(section)) {
        if (!publishedNames.has(depName)) continue;

        const newVersion = publishedVersions.get(depName)!;
        
        // Handle workspace:* dependencies - convert to actual version range
        if (depRange.startsWith("workspace:")) {
          const spec = depRange.slice("workspace:".length);
          let newRange: string;
          
          if (spec === "" || spec === "*") {
            // workspace:* -> ^version (use caret for semantic versioning)
            newRange = `^${newVersion}`;
          } else if (spec === "^" || spec === "~") {
            newRange = `${spec}${newVersion}`;
          } else if (spec.startsWith("^") || spec.startsWith("~")) {
            newRange = `${spec[0]}${newVersion}`;
          } else if (spec === newVersion) {
            // If spec matches version, use caret
            newRange = `^${newVersion}`;
          } else {
            newRange = spec;
          }
          
          // Always update workspace:* dependencies when the dependency is published
          updatedDeps.push({
            name: depName,
            oldVersion: depRange,
            newVersion: newRange,
          });
          continue;
        }

        // Handle regular version ranges
        const needsUpdate = shouldUpdateDependency(depRange, newVersion);
        if (needsUpdate) {
          const newRange = updateDependencyRange(depRange, newVersion);
          updatedDeps.push({
            name: depName,
            oldVersion: depRange,
            newVersion: newRange,
          });
        }
      }
    }

    if (updatedDeps.length > 0) {
      packagesToUpdate.push({ pkg, updatedDeps });
    }
  }

  if (packagesToUpdate.length === 0) {
    console.log("No packages need dependency updates.");
    return;
  }

  if (dryRun) {
    console.log(
      `[dry-run] Found ${packagesToUpdate.length} package(s) with outdated dependencies:`
    );
    for (const { pkg, updatedDeps } of packagesToUpdate) {
      const newVersion = bumpPatchVersion(pkg.version);
      console.log(`  ${pkg.name} (would update to ${newVersion}):`);
      for (const dep of updatedDeps) {
        console.log(`    ${dep.name}: ${dep.oldVersion} -> ${dep.newVersion}`);
      }
    }
    console.log("[dry-run] Would commit these dependency updates");
    return;
  }

  console.log(
    `Found ${packagesToUpdate.length} package(s) with outdated dependencies:`
  );
  for (const { pkg, updatedDeps } of packagesToUpdate) {
    console.log(`  ${pkg.name}:`);
    for (const dep of updatedDeps) {
      console.log(`    ${dep.name}: ${dep.oldVersion} -> ${dep.newVersion}`);
    }
  }

  for (const { pkg, updatedDeps } of packagesToUpdate) {
    const newVersion = bumpPatchVersion(pkg.version);
    await updatePackageDependencies(pkg, updatedDeps, newVersion);
    console.log(`Updated ${pkg.name} to ${newVersion} and synced dependencies`);
  }

  await gitCommitDependencyUpdates(packagesToUpdate, cwd);
}

async function updatePackageDependencies(
  pkg: WorkspacePackage,
  updatedDeps: Array<{ name: string; oldVersion: string; newVersion: string }>,
  newVersion: string
): Promise<void> {
  const manifest = await readPackageJson(pkg.manifestPath);
  manifest.version = newVersion;

  const depMap = new Map(updatedDeps.map((d) => [d.name, d.newVersion]));

  for (const field of DEPENDENCY_FIELDS) {
    const section = manifest[field] as Record<string, string> | undefined;
    if (!section) continue;

    for (const [depName, depRange] of Object.entries(section)) {
      if (depMap.has(depName)) {
        section[depName] = depMap.get(depName)!;
      }
    }
  }

  await writePackageJson(pkg.manifestPath, manifest);
}

