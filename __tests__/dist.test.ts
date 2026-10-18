import * as fs from 'fs';
import * as path from 'path';

describe('dist/index.js', () => {
  it('names no source map, since none is committed', () => {
    const bundle = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.js'), 'utf-8');
    expect(bundle).not.toMatch(/^\/\/[#@] sourceMappingURL=/m);
  });

  it('carries the version in package.json, so a version change is committed with the rebuilt bundle', () => {
    // The build reads the version from package.json into the bundle, for the User-Agent of the
    // registry requests and the log outside a runner
    const bundle = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.js'), 'utf-8');
    const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    expect([...bundle.matchAll(/"version":"([^"]*)"/g)].map(([, bundled]) => bundled)).toEqual([version]);
  });
});
