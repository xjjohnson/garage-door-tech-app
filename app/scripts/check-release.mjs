// Checks that a pull request which changes what ships to phones also raises
// the release number (app.json "extra.release"), so every over-the-air update
// has its own number on the Settings button. See app/README.md, "Release numbers".
//
//   node app/scripts/check-release.mjs <base git ref>
import { execFileSync } from 'node:child_process';

const base = process.argv[2];
if (!base) {
  console.error('Usage: node app/scripts/check-release.mjs <base git ref>');
  process.exit(2);
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

// What ends up in the app bundle. Tests, docs and scripts don't ship.
const ships = (f) =>
  (/^app\/(src|assets)\//.test(f) || /^spring-calc\/src\//.test(f) || /^app\/(app\.json|app\.config\.js|package\.json|package-lock\.json)$/.test(f)) &&
  !/\/__tests__\/|\/testing\//.test(f);

const changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean).filter(ships);
if (changed.length === 0) {
  console.log('Nothing that ships to phones changed; no release bump needed.');
  process.exit(0);
}

const release = (ref) => {
  try {
    return JSON.parse(git('show', `${ref}:app/app.json`)).expo.extra?.release ?? null;
  } catch {
    return null;
  }
};
const parse = (v) => (v ?? '0.0.0').split('.').map(Number);
const newer = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

const before = release(base);
const after = release('HEAD');
if (newer(after, before)) {
  console.log(`Release ${before ?? '(none)'} -> ${after}.`);
} else {
  console.error(
    `::error title=Release number::This change ships to phones (${changed.slice(0, 5).join(', ')}${changed.length > 5 ? ', ...' : ''}) ` +
      `but app.json extra.release is still ${after ?? '(none)'}. Raise it by one (for example ${before} to the next number); see app/README.md, "Release numbers".`,
  );
  process.exit(1);
}
