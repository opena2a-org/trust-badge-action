/**
 * Detect the package name from common manifest files in the given directory.
 * Checks package.json, pyproject.toml, setup.py, and setup.cfg.
 *
 * @param dir - The directory to search in (defaults to process.cwd())
 * @returns The detected package name, or null if none found.
 */
export declare function detectPackageName(dir?: string): string | null;
