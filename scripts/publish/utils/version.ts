export function shouldUpdateDependency(
  currentRange: string,
  newVersion: string
): boolean {
  const versionMatch = currentRange.match(/[\d.]+/);
  if (!versionMatch) return false;

  const currentVersion = versionMatch[0];
  return compareVersions(newVersion, currentVersion) > 0;
}

export function updateDependencyRange(
  currentRange: string,
  newVersion: string
): string {
  if (currentRange.startsWith("^")) {
    return `^${newVersion}`;
  }
  if (currentRange.startsWith("~")) {
    return `~${newVersion}`;
  }
  if (currentRange.match(/^\d+\.\d+\.\d+$/)) {
    return newVersion;
  }
  const prefix = currentRange.replace(/[\d.]+.*$/, "");
  return prefix ? `${prefix}${newVersion}` : newVersion;
}

export function bumpPatchVersion(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) {
    throw new Error(`Invalid version format: ${version}`);
  }
  const patch = parseInt(parts[2], 10);
  return `${parts[0]}.${parts[1]}.${patch + 1}`;
}

export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const a = parts1[i] ?? 0;
    const b = parts2[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

