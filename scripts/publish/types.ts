export type DependencyField =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies"
  | "optionalDependencies";

export type PackageJson = {
  name?: string;
  version?: string;
  workspaces?: string[] | { packages?: string[] };
  private?: boolean;
  [key: string]: unknown;
};

export type WorkspacePackage = {
  dir: string;
  manifest: PackageJson;
  manifestPath: string;
  name: string;
  version: string;
};

export type PublishOptions = {
  access?: string;
  dryRun: boolean;
  extraPublishArgs: string[];
  tag?: string;
};

export const DEPENDENCY_FIELDS: DependencyField[] = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

