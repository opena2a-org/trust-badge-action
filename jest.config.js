module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  // @actions/github loads @octokit packages, and packages they load, that are published as ES
  // modules only. Jest runs the tests as CommonJS, so those are compiled to CommonJS too.
  transform: {
    '/node_modules/.+\\.js$': ['ts-jest', { tsconfig: { allowJs: true } }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(@octokit|before-after-hook|content-type|universal-user-agent)/)',
  ],
};
