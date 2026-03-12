import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { detectPackageName } from '../src/detect';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'detect-test-'));
}

function cleanUp(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('detectPackageName', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanUp(tmpDir);
  });

  it('detects name from package.json', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: '@my-org/my-agent', version: '1.0.0' })
    );
    expect(detectPackageName(tmpDir)).toBe('@my-org/my-agent');
  });

  it('returns null when package.json has no name field', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ version: '1.0.0', description: 'no name here' })
    );
    expect(detectPackageName(tmpDir)).toBeNull();
  });

  it('detects name from pyproject.toml when no package.json exists', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      '[project]\nname = "my-python-agent"\nversion = "0.1.0"\n'
    );
    expect(detectPackageName(tmpDir)).toBe('my-python-agent');
  });

  it('returns null when no detection files exist', () => {
    expect(detectPackageName(tmpDir)).toBeNull();
  });

  it('returns null for malformed package.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{ this is not valid json }}}');
    expect(detectPackageName(tmpDir)).toBeNull();
  });

  it('prefers package.json over pyproject.toml', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'npm-name' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      '[project]\nname = "python-name"\n'
    );
    expect(detectPackageName(tmpDir)).toBe('npm-name');
  });

  it('falls through to pyproject.toml when package.json has no name', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      '[project]\nname = "fallback-name"\n'
    );
    expect(detectPackageName(tmpDir)).toBe('fallback-name');
  });

  it('detects name from setup.py', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'setup.py'),
      'from setuptools import setup\nsetup(name="legacy-package", version="1.0")\n'
    );
    expect(detectPackageName(tmpDir)).toBe('legacy-package');
  });

  it('detects name from setup.cfg', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'setup.cfg'),
      '[metadata]\nname = cfg-package\nversion = 1.0\n'
    );
    expect(detectPackageName(tmpDir)).toBe('cfg-package');
  });
});
