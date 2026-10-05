// Remove the //# sourceMappingURL comments that bundled dependencies end their modules with. The
// bundle ships without a source map, so each one names a map that does not exist; two of them name
// index.js.map, which a debugger resolves next to dist/index.js.
//
//   node scripts/strip-source-map-comments.js dist/index.js
const fs = require('fs');

const file = process.argv[2];
const bundle = fs.readFileSync(file, 'utf-8');
fs.writeFileSync(file, bundle.replace(/^\/\/[#@] sourceMappingURL=.*(?:\r?\n|$)/gm, ''));
