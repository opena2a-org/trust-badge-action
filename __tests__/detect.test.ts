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

  it('detects a single-quoted (TOML literal string) name from pyproject.toml', () => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), "[project]\nname = 'my-pkg'\n");
    expect(detectPackageName(tmpDir)).toBe('my-pkg');
  });

  it('reads the [project] name, not the name of a table before it', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      "[[tool.uv.index]]\nname = 'pytorch'\nurl = 'https://download.pytorch.org/whl/cpu'\n\n" +
        '[tool.commitizen]\nname = "cz_conventional_commits"\n\n[project]\nname = "my-pkg"\n'
    );
    expect(detectPackageName(tmpDir)).toBe('my-pkg');
  });

  it('ignores a name key in a table after [project] and in a [project] subtable', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      '[project.urls]\nname = "not-this"\n\n[project]\nversion = "0.1.0"\n\n[tool.commitizen]\nname = "cz"\n'
    );
    expect(detectPackageName(tmpDir)).toBeNull();
  });

  it('ignores a name key before the first table header', () => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), 'name = "root-name"\n\n[project]\nversion = "1"\n');
    expect(detectPackageName(tmpDir)).toBeNull();
  });

  it('reads a [project] header with spaces, a trailing comment and CRLF line endings', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      '[tool.uv]\r\nname = "other"\r\n[ project ]  # metadata\r\nname = "my-pkg"\r\n'
    );
    expect(detectPackageName(tmpDir)).toBe('my-pkg');
  });

  it('reads the [tool.poetry] name of a Poetry project with no [project] table', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      '[[tool.poetry.source]]\nname = "private"\n\n[tool.poetry]\nname = "poetry-pkg"\n'
    );
    expect(detectPackageName(tmpDir)).toBe('poetry-pkg');
  });

  it('prefers the [project] name over the [tool.poetry] name', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      '[tool.poetry]\nname = "poetry-pkg"\n\n[project]\nname = "pep621-pkg"\n'
    );
    expect(detectPackageName(tmpDir)).toBe('pep621-pkg');
  });

  it.each([
    [
      'a [[tool.poetry.source]] name after a [tool.poetry] table with none',
      '[tool.poetry]\npackage-mode = false\n\n[[tool.poetry.source]]\nname = "private"\nurl = "https://example.invalid/simple"\n',
      null,
    ],
    [
      'a [[tool.uv.index]] name after a [project] table with none',
      '[tool.poetry]\nname = "real"\n\n[project]\nversion = "0.1.0"\n\n[[tool.uv.index]]\nname = "pytorch"\n',
      'real',
    ],
    [
      'a name in a table after [project] whose quoted header holds ]',
      '[project]\nversion = "0.1.0"\n\n["weird]key"]\nname = "not-this"\n',
      null,
    ],
  ])('ignores %s', (_label, content, expected) => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), content);
    expect(detectPackageName(tmpDir)).toBe(expected);
  });

  it.each([
    ['a multi-line array holding a line like a table header', '[project]\nmatrix = [\n  [1, 2],\n  [3, 4]\n]\nname = "pkg"\n'],
    ['a multi-line basic string holding a line like a table header', '[project]\ndescription = """\n[notes]\n"""\nname = "pkg"\n'],
    ['a multi-line literal string holding a line like a table header', "[project]\ndescription = '''\n[notes]\n'''\nname = \"pkg\"\n"],
    ['a multi-line array whose first line has a string holding ]', '[project]\nmatrix = ["]",\n  [3, 4]\n]\nname = "pkg"\n'],
    ['a multi-line array whose first line has a comment holding ]', '[project]\nmatrix = [ # ]\n  [3, 4]\n]\nname = "pkg"\n'],
    ['a multi-line array whose first line has an escaped quote before ]', '[project]\nmatrix = ["\\"]",\n  [3, 4]\n]\nname = "pkg"\n'],
    ['an array holding a multi-line string that ends in a quote', '[project]\nkeywords = ["""a""""]\nname = "pkg"\n'],
    ['a multi-line string holding a name line', '[project]\ndescription = """\nname = "inner"\n"""\nname = "pkg"\n'],
    ['an inline table written over several lines', '[project]\nauthor = {\n  name = "A. Author",\n}\nname = "pkg"\n'],
  ])('reads the [project] name after %s', (_label, content) => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), content);
    expect(detectPackageName(tmpDir)).toBe('pkg');
  });

  it('reads a pyproject.toml whose lines end in a lone CR', () => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[tool.uv]\rname = "other"\r[project]\rname = "pkg"\r');
    expect(detectPackageName(tmpDir)).toBe('pkg');
  });

  it.each([
    ['a dotted project.name key with no [project] header', 'project.name = "pkg"\nproject.version = "0.1.0"\n'],
    ['a dotted key with spaces and quoted parts', '"project" . \'name\' = "pkg"\n'],
    ['a dotted poetry.name key in a [tool] table', '[tool]\npoetry.name = "pkg"\n'],
    ['a dotted tool.poetry.name key with no header', 'tool.poetry.name = "pkg"\n'],
    ['a multi-line basic string on one line', '[project]\nname = """pkg"""\n'],
    ['a multi-line literal string on one line', "[project]\nname = '''pkg'''\n"],
    ['a dotted key holding a multi-line string on one line', 'project.name = """pkg"""\n'],
  ])('reads the name written as %s', (_label, content) => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), content);
    expect(detectPackageName(tmpDir)).toBe('pkg');
  });

  it.each([
    ['a quoted key holding a dot', '"project.name" = "not-this"\n'],
    ['a dotted key one level too deep', '[project]\nname.first = "not-this"\n'],
    ['a dotted project.name key in another table', '[tool.uv]\nproject.name = "not-this"\n'],
    ['a name key in a [[project]] array of tables','[[project]]\nname = "not-this"\n'],
  ])('ignores %s', (_label, content) => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), content);
    expect(detectPackageName(tmpDir)).toBeNull();
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
