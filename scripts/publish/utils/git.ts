import path from "path";
import type { WorkspacePackage } from "../types";

export async function gitCommitDependencyUpdates(
  packagesToUpdate: Array<{
    pkg: WorkspacePackage;
    updatedDeps: Array<{ name: string; oldVersion: string; newVersion: string }>;
  }>,
  cwd: string
): Promise<void> {
  const files = packagesToUpdate.map(({ pkg }) => pkg.manifestPath);
  const relativeFiles = files.map((f) => path.relative(cwd, f));

  const commitMessage =
    `chore: bump dependent package versions and sync dependencies\n\n` +
    packagesToUpdate
      .map(({ pkg, updatedDeps }) => {
        const depSummary = updatedDeps
          .map((d) => `${d.name}: ${d.oldVersion} -> ${d.newVersion}`)
          .join(", ");
        return `- ${pkg.name}: ${depSummary}`;
      })
      .join("\n");

  const addProc = (globalThis as any).Bun.spawn(["git", "add", ...relativeFiles], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const addExitCode = await addProc.exited;
  if (addExitCode !== 0) {
    throw new Error(`git add failed (exit code ${addExitCode})`);
  }

  const commitProc = (globalThis as any).Bun.spawn(["git", "commit", "-m", commitMessage], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const commitExitCode = await commitProc.exited;
  if (commitExitCode !== 0) {
    throw new Error(`git commit failed (exit code ${commitExitCode})`);
  }

  console.log("Committed dependency updates");
}

