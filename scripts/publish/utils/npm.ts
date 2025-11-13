import { compareVersions } from "./version";

export async function getNpmVersion(packageName: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (globalThis as any).fetch(
      `https://registry.npmjs.org/${packageName}/latest`
    );
    if (!response.ok) {
      if (response.status === 404) {
        return null; // Package doesn't exist on npm
      }
      throw new Error(`Failed to fetch npm version: ${response.statusText}`);
    }
    const data = (await response.json()) as { version: string };
    return data.version;
  } catch (error) {
    console.warn(`Failed to fetch npm version for ${packageName}:`, error);
    return null;
  }
}

export async function isLocalVersionNewer(
  packageName: string,
  localVersion: string
): Promise<boolean> {
  const npmVersion = await getNpmVersion(packageName);
  if (!npmVersion) {
    // Package doesn't exist on npm, so local version is considered newer
    return true;
  }
  return compareVersions(localVersion, npmVersion) > 0;
}

