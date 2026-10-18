// The version in package.json, bundled into dist/index.js by the build.
export const VERSION: string = (require('../package.json') as { version: string }).version;

// The User-Agent of the action's requests to the registry, naming that version.
export const USER_AGENT = `opena2a-trust-badge-action/${VERSION}`;
