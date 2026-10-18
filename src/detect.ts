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
 * The key is read under that table's header (`[project]` then `name = "..."`), or as a dotted key
 * under a header of a parent table or before the first header (`project.name = "..."`). A `name`
 * key in any other table, or a bare `name` before the first table header, is ignored, and a line
 * inside a multi-line string, array or inline table is read as neither a key nor a table header.
 *
 * @param content - The pyproject.toml text
 * @param table - The dotted table name to read
 * @returns The name, or null when that table has no quoted `name` key.
 */
function pyprojectTableName(content: string, table: string): string | null {
  const target = [...table.split('.'), 'name'].join('\0');
  // The key path of the table the next keys belong to: [] before the first header, null under a
  // header this reader does not follow ([[array.of.tables]] or one it cannot read)
  let tablePath: string[] | null = [];
  for (const line of tomlLinesOutsideValues(content)) {
    if (/^\s*\[/.test(line)) {
      // A table header, [table] or [[array.of.tables]], with an optional trailing comment. A header
      // this pattern does not read ends the table being read too.
      const header = line.match(/^\s*(?:\[\[([^\[\]]+)\]\]|\[([^\[\]]+)\])\s*(?:#.*)?$/);
      tablePath = header?.[2] === undefined ? null : tomlKeyParts(header[2]);
      continue;
    }
    if (tablePath === null) {
      continue;
    }
    // A key, plain or dotted, set to a TOML basic ("..."), literal ('...') or one-line multi-line
    // ("""...""" or '''...''') string. The key and the value are read apart, split at the line's
    // first =, so that each run of whitespace is read by one pattern: one pattern over the whole
    // line, with a leading \s*, a lazy key group and a \s* before the =, tries every way to share
    // a run of whitespace between the three and takes hours on a long whitespace-only line.
    const equals = line.indexOf('=');
    const valueMatch =
      equals === -1 ? null : line.slice(equals + 1).match(/^\s*(?:"""(.+?)"""|'''(.+?)'''|"([^"]+)"|'([^']+)')/);
    const keyParts = valueMatch ? tomlKeyParts(line.slice(0, equals)) : null;
    if (valueMatch && keyParts && [...tablePath, ...keyParts].join('\0') === target) {
      return valueMatch[1] ?? valueMatch[2] ?? valueMatch[3] ?? valueMatch[4];
    }
  }
  return null;
}

/**
 * Split a TOML key, such as `project.name`, `"project" . 'name'` or `tool."poetry"`, into its parts.
 *
 * @param key - The key text, without the `=` that follows it or the brackets of a table header
 * @returns The parts with their quotes removed, or null when the text is not a key.
 */
function tomlKeyParts(key: string): string[] | null {
  const part = /\s*(?:([A-Za-z0-9_-]+)|"([^"\\]*)"|'([^']*)')\s*(\.|$)/y;
  const parts: string[] = [];
  let match: RegExpExecArray | null;
  while (part.lastIndex < key.length && (match = part.exec(key)) !== null) {
    parts.push(match[1] ?? match[2] ?? match[3]);
    if (match[4] === '') {
      return parts;
    }
  }
  return null;
}

/**
 * Split TOML text into lines, leaving out each line that starts inside a value begun on an earlier
 * line: the later lines of a multi-line string, array or inline table. A line ends at LF, CRLF or CR.
 *
 * @param content - The TOML text
 * @returns The lines that start outside any value: keys, table headers, comments and blank lines.
 */
function tomlLinesOutsideValues(content: string): string[] {
  const lines: string[] = [];
  let quote = ''; // the delimiter of the string being read: ", ', """ or '''
  let depth = 0; // the [ and { of arrays and inline tables not yet closed
  for (const line of content.split(/\r\n|\r|\n/)) {
    if (quote === '' && depth === 0) {
      lines.push(line);
    }
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (quote) {
        if (char === '\\' && quote[0] === '"') {
          i++; // a backslash escapes the next character of a basic string
        } else if (line.startsWith(quote, i)) {
          i += quote.length - 1;
          // The run of quotes that closes a multi-line string can start with up to two quotes of
          // the string's own, so the string ends after the whole run
          while (quote.length === 3 && line[i + 1] === quote[0]) {
            i++;
          }
          quote = '';
        }
      } else if (char === '#') {
        break; // a comment runs to the end of the line
      } else if (char === '"' || char === "'") {
        quote = line.startsWith(char.repeat(3), i) ? char.repeat(3) : char;
        i += quote.length - 1;
      } else if (char === '[' || char === '{') {
        depth++;
      } else if ((char === ']' || char === '}') && depth > 0) {
        depth--;
      }
    }
    if (quote.length === 1) {
      quote = ''; // a one-line string ends with its line
    }
  }
  return lines;
}
