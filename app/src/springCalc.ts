/**
 * The one place the app reaches into the spring math in ../spring-calc.
 * The math lives outside the app so it can be tested on its own (Vitest) and
 * stays unchanged; Metro is told to watch that folder in metro.config.js.
 */
export * from '../../spring-calc/src';
