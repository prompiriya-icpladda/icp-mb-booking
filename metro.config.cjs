const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Exclude Android build output directories from file watching.
// Metro's FallbackWatcher errors on Windows when it tries to watch
// these paths before an Android build has created them.
config.resolver.blockList = /node_modules[/\\].*[/\\]android[/\\]build[/\\].*/;

module.exports = config;
