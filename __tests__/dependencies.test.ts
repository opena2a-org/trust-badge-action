// The runtime dependencies in package-lock.json, the tree `npm ci` installs and the build bundles
// into dist/index.js.
import * as fs from 'fs';
import * as path from 'path';

interface LockEntry {
  version?: string;
  dev?: boolean;
}

const lock: { packages: Record<string, LockEntry> } = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf-8')
);

// The path and version of each copy of a package outside the dev-only tree.
function runtimeCopies(name: string): Array<[string, string]> {
  return Object.entries(lock.packages)
    .filter(([key, entry]) => key.endsWith(`node_modules/${name}`) && !entry.dev)
    .map(([key, entry]) => [key, entry.version ?? '']);
}

function atLeast(version: string, floor: string): boolean {
  const given = version.split('-')[0].split('.').map(Number);
  const wanted = floor.split('.').map(Number);
  for (let i = 0; i < wanted.length; i++) {
    if ((given[i] ?? 0) !== wanted[i]) {
      return (given[i] ?? 0) > wanted[i];
    }
  }
  return true;
}

describe('package-lock.json', () => {
  it('holds undici 6.28.1 or later for each copy of undici the action runs on', () => {
    // undici 5.29.0, which @actions/core 1.11.1 and @actions/github 6.0.1 bring in, is in the
    // ranges of advisories npm audit reports against undici up to 6.28.0
    const copies = runtimeCopies('undici');
    expect(copies.length).toBeGreaterThan(0);
    expect(copies.filter(([, version]) => !atLeast(version, '6.28.1'))).toEqual([]);
  });

  it('holds no @fastify/busboy, which undici 5.29.0 brings in', () => {
    expect(runtimeCopies('@fastify/busboy')).toEqual([]);
  });
});
