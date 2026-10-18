import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');

function read(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), 'utf-8');
}

function packageJson(): { version: string; scripts: Record<string, string> } {
  return JSON.parse(read('package.json'));
}

// The level-two headings of CHANGELOG.md, in order.
function changelogSections(): string[] {
  return [...read('CHANGELOG.md').matchAll(/^## (.+)$/gm)].map(([, heading]) => heading);
}

// A release section's heading: the version and the date it was released.
const RELEASE_HEADING = /^(\d+)\.(\d+)\.(\d+) - \d{4}-\d{2}-\d{2}$/;

describe('CHANGELOG.md', () => {
  it('starts with the Unreleased section, then a section per release, newest version first', () => {
    const [first, ...releases] = changelogSections();
    expect(first).toBe('Unreleased');
    expect(releases.length).toBeGreaterThan(0);
    const versions = releases.map((heading) => {
      const match = RELEASE_HEADING.exec(heading);
      expect([heading, match !== null]).toEqual([heading, true]);
      return (match as RegExpExecArray).slice(1, 4).map(Number);
    });
    for (let i = 1; i < versions.length; i++) {
      const newer = versions[i - 1];
      const older = versions[i];
      const order = newer[0] - older[0] || newer[1] - older[1] || newer[2] - older[2];
      expect([releases[i - 1], releases[i], order > 0]).toEqual([releases[i - 1], releases[i], true]);
    }
  });

  it('has a section for the version in package.json', () => {
    const released = changelogSections().map((heading) => heading.split(' - ')[0]);
    expect(released).toContain(packageJson().version);
  });

  it('links the page that says how a release is cut', () => {
    expect(read('CHANGELOG.md')).toContain('](docs/releasing.md)');
  });
});

describe('docs/releasing.md', () => {
  it('names only npm scripts that package.json declares', () => {
    const named = [...read('docs/releasing.md').matchAll(/\bnpm run ([\w:-]+)/g)].map(([, name]) => name);
    expect(named.length).toBeGreaterThan(0);
    const declared = Object.keys(packageJson().scripts);
    for (const name of named) {
      expect([name, declared.includes(name)]).toEqual([name, true]);
    }
  });

  it('names only repository files and directories that exist', () => {
    // A code span that holds a file name with one of these extensions, or a directory ending in "/"
    const repositoryPath = /^(?:[\w.-]+\/)*[\w.-]+\.(?:md|json|sh|ts|js|yml)$|^(?:[\w.-]+\/)+$/;
    const named = [...read('docs/releasing.md').matchAll(/`([^`\n]+)`/g)]
      .map(([, span]) => span)
      .filter((span) => repositoryPath.test(span));
    expect(named).toEqual(expect.arrayContaining(['package.json', 'dist/', 'CHANGELOG.md']));
    for (const name of named) {
      expect([name, fs.existsSync(path.join(ROOT, name))]).toEqual([name, true]);
    }
  });

  it('sets the version before it rebuilds the bundle, and tags the release before it moves v1', () => {
    const page = read('docs/releasing.md');
    const steps = [
      'npm version <version> --no-git-tag-version',
      'npm run build',
      '## Unreleased',
      'git tag -a v<version>',
      'gh release create v<version>',
      'git tag -fa v1',
    ].map((step) => [step, page.indexOf(step)] as const);
    for (const [step, index] of steps) {
      expect([step, index >= 0]).toEqual([step, true]);
    }
    const positions = steps.map(([, index]) => index);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
