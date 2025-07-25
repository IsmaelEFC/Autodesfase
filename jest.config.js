module.exports = {
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/js/(.*)$': '<rootDir>/src/js/$1',
    '^@/css/(.*)$': '<rootDir>/src/css/$1',
    '^@/assets/(.*)$': '<rootDir>/src/assets/$1',
  },
  moduleFileExtensions: ['js', 'json'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.js'],
  testMatch: ['**/tests/unit/**/*.test.js', '**/__tests__/*.js'],
  collectCoverage: true,
  collectCoverageFrom: ['src/js/**/*.js', '!src/js/app.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transformIgnorePatterns: ['/node_modules/'],
};
