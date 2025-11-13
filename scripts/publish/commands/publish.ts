import { promises as fs } from "fs";
import type { WorkspacePackage, PublishOptions } from "../types";
import { transformManifest, readPackageJson, writePackageJson } from "../utils/package";

export async function publishPackage(
  pkg: WorkspacePackage,
  packageMap: Map<string, WorkspacePackage>,
  options: PublishOptions
): Promise<void> {
  const originalText = await fs.readFile(pkg.manifestPath, "utf8");
  const originalManifest = JSON.parse(originalText);
  const transformed = transformManifest(originalManifest, packageMap);

  if (transformed.changed) {
    await writePackageJson(pkg.manifestPath, transformed.manifest);
  }

  try {
    await runPublish(pkg, options);
  } finally {
    if (transformed.changed) {
      await fs.writeFile(pkg.manifestPath, originalText);
    }
  }
}

async function runPublish(
  pkg: WorkspacePackage,
  options: PublishOptions
): Promise<void> {
  const command = ["bun", "publish", ...options.extraPublishArgs];
  if (options.tag) command.push("--tag", options.tag);
  if (options.access) command.push("--access", options.access);

  if (options.dryRun) {
    console.log(
      `[dry-run] bun publish ${command.slice(2).join(" ")} (cwd=${pkg.dir})`
    );
    return;
  }

  const proc = (globalThis as any).Bun.spawn(command, {
    cwd: pkg.dir,
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`bun publish failed for ${pkg.name} (exit code ${exitCode}).`);
  }
}

