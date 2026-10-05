import * as fs from 'fs';
import * as path from 'path';

describe('dist/index.js', () => {
  it('names no source map, since none is committed', () => {
    const bundle = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.js'), 'utf-8');
    expect(bundle).not.toMatch(/^\/\/[#@] sourceMappingURL=/m);
  });
});
