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
      const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
      if (nameMatch) {
        return nameMatch[1];
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
