module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: {
        browsers: ['>0.2%', 'not dead', 'not op_mini all'],
        node: 'current'
      },
      useBuiltIns: 'usage',
      corejs: 3,
      modules: false
    }]
  ],
  plugins: [
    '@babel/plugin-transform-runtime',
    '@babel/plugin-transform-modules-commonjs',
  ],
  env: {
    test: {
      presets: [
        ['@babel/preset-env', {
          targets: {
            node: 'current'
          }
        }]
      ]
    }
  }
};
