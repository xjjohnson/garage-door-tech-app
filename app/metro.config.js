// Metro config: the spring math lives in ../spring-calc, outside this Expo
// project, so Metro has to be told to watch and bundle that folder too.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const springCalc = path.resolve(__dirname, '../spring-calc');

config.watchFolders = [...(config.watchFolders ?? []), springCalc];
// spring-calc has its own node_modules (Vitest) that the app never needs.
const blockSpringCalcModules = new RegExp(`^${path.join(springCalc, 'node_modules').replace(/[/\\^$.*+?()[\]{}|]/g, '\\$&')}[/\\\\].*`);
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : config.resolver.blockList ? [config.resolver.blockList] : []),
  blockSpringCalcModules,
];

module.exports = config;
