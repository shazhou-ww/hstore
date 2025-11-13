#!/usr/bin/env bun

import { Command } from "commander";
import { gatherWorkspacePackages, checkPackagesToPublish } from "./utils/package";
import { publishPackage } from "./commands/publish";
import { syncDependentPackages } from "./commands/sync";
import type { PublishOptions } from "./types";

const program = new Command();

program
  .name("publish")
  .description("Publish workspace packages that are newer than npm versions and sync dependencies")
  .option("--dry-run", "Show what would be published without actually publishing", false)
  .option("--tag <tag>", "Publish with the specified tag")
  .option("--access <access>", "Set publish access level")
  .allowUnknownOption(true)
  .action(async (options: {
    dryRun?: boolean;
    tag?: string;
    access?: string;
  }) => {
    const cwd = process.cwd();
    const workspacePackages = await gatherWorkspacePackages(cwd);
    const packageMap = new Map(workspacePackages.map((pkg) => [pkg.name, pkg]));

    console.log("Checking packages against npm versions...");
    const packagesToPublish = await checkPackagesToPublish(workspacePackages);

    if (packagesToPublish.length === 0) {
      console.log("No packages need to be published (all packages are up to date or already published).");
      return;
    }

    console.log(
      `Packages to publish (newer than npm): ${packagesToPublish.map((p) => `${p.name}@${p.version}`).join(", ")}`
    );

    const publishedPackages: typeof workspacePackages = [];

    const publishOptions: PublishOptions = {
      access: options.access,
      dryRun: options.dryRun ?? false,
      extraPublishArgs: process.argv.slice(2).filter((arg) => {
        return (
          arg !== "--dry-run" &&
          !arg.startsWith("--tag") &&
          !arg.startsWith("--access")
        );
      }),
      tag: options.tag,
    };

    for (const pkg of packagesToPublish) {
      await publishPackage(pkg, packageMap, publishOptions);
      publishedPackages.push(pkg);
    }

    if (publishedPackages.length > 0) {
      await syncDependentPackages(
        publishedPackages,
        workspacePackages,
        cwd,
        publishOptions.dryRun
      );
    }
  });

program.parse(process.argv);

