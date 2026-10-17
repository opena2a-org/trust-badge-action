import * as fs from 'fs';
import * as path from 'path';

/**
 * Detect the package name from common manifest files in the given directory.
 * Checks package.json, pyproject.toml, setup.py, and setup.cfg.
 *
 * @param dir - The directory to search in (defaults to process.cwd())
 * @returns The detected package name, or null if none found.
 */
export function detectPackageName(dir?: string): string | null {
  const baseDir = dir || process.cwd();

  // Try package.json (npm)
  const packageJsonPath = path.join(baseDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.name) {
        return pkg.name;
      }
    } catch {
      // Malformed package.json -- skip
    }
  }

  // Try pyproject.toml (Python - PEP 621)
  const pyprojectPath = path.join(baseDir, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf-8');
      const name = pyprojectTableName(content, 'project') ?? pyprojectTableName(content, 'tool.poetry');
      if (name) {
        return name;
      }
    } catch {
      // Malformed pyproject.toml -- skip
    }
  }

  // Try setup.py (Python - legacy)
  const setupPyPath = path.join(baseDir, 'setup.py');
  if (fs.existsSync(setupPyPath)) {
    try {
      const content = fs.readFileSync(setupPyPath, 'utf-8');
      const nameMatch = content.match(/name\s*=\s*['"]([^'"]+)['"]/);
      if (nameMatch) {
        return nameMatch[1];
      }
    } catch {
      // Malformed setup.py -- skip
    }
  }

  // Try setup.cfg (Python - setuptools declarative)
  const setupCfgPath = path.join(baseDir, 'setup.cfg');
  if (fs.existsSync(setupCfgPath)) {
    try {
      const content = fs.readFileSync(setupCfgPath, 'utf-8');
      const nameMatch = content.match(/^\s*name\s*=\s*(.+)$/m);
      if (nameMatch) {
        return nameMatch[1].trim();
      }
    } catch {
      // Malformed setup.cfg -- skip
    }
  }

  return null;
}

/**
 * Read the `name` key of one table of a pyproject.toml, such as `project` or `tool.poetry`.
 * A `name` key in any other table, or before the first table header, is ignored.
 *
 * @param content - The pyproject.toml text
 * @param table - The dotted table name to read
 * @returns The name, or null when that table has no quoted `name` key.
 */
function pyprojectTableName(content: string, table: string): string | null {
  let inTable = false;
  for (const line of content.split(/\r?\n/)) {
    // A table header, [table] or [[array.of.tables]], with an optional trailing comment
    const header = line.match(/^\s*\[(\[?)([^\[\]]+)\]\1\s*(?:#.*)?$/);
    if (header) {
      const headerName = header[2]
        .split('.')
        .map((part) => part.trim().replace(/^"(.*)"$|^'(.*)'$/, '$1$2'))
        .join('.');
      inTable = header[1] === '' && headerName === table;
      continue;
    }
    if (!inTable) {
      continue;
    }
    // TOML basic ("...") and literal ('...') strings
    const nameMatch = line.match(/^\s*name\s*=\s*(?:"([^"]+)"|'([^']+)')/);
    if (nameMatch) {
      return nameMatch[1] ?? nameMatch[2];
    }
  }
  return null;
}
