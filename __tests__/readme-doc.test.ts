import * as fs from 'fs';
import * as path from 'path';

describe('README.md', () => {
  it('shows the uses: step for this action within its first 30 lines', () => {
    const lines = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf-8').split('\n');
    const stepLine = lines.findIndex((line) => /uses: +opena2a-org\/trust-badge-action@/.test(line)) + 1;
    expect(stepLine).toBeGreaterThanOrEqual(1);
    expect(stepLine).toBeLessThanOrEqual(30);
  });
});
