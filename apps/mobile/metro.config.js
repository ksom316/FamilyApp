// Metro config for the pnpm monorepo this app lives in. Without this file, Metro falls
// back to its default config, whose project root is just `apps/mobile` — it never learns
// that `@familyapp/config` and `@familyapp/shared` (this app's own workspace dependencies)
// live outside that folder, in sibling `packages/*` directories, or that a hoisted/shared
// dependency may only exist in the monorepo root's `node_modules`. That gap can let local
// bundling succeed, through whatever has already been resolved/cached on a given machine,
// while a clean install on a fresh CI/build machine fails to resolve the same imports during
// the "Bundle JavaScript" step. This is Expo's own documented monorepo setup:
// https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo, not just this app, so Metro can see workspace package source —
// extending Expo's own default watchFolders rather than replacing them.
config.watchFolders = [...new Set([...(config.watchFolders ?? []), workspaceRoot])];

// Resolve modules from this app's own node_modules first, then fall back to the
// workspace root's node_modules (where pnpm hoists/links shared dependencies).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules')
];

module.exports = config;
