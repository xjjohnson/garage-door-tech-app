// Opens every link in the Manuals library and lists the ones that stopped
// working, so a maker moving a PDF gets noticed before a tech taps it.
//
// Run from app/:  npm run check-links
// (Node 22 or newer; it reads src/data/manuals.ts directly.)
//
// A link fails when the maker's site says it's gone (404 or 410), the site's
// address no longer exists, or a .pdf address now opens a web page instead of
// a PDF (a maker sending missing files to its home page). Some sites turn
// away automated checks (403, 429, or by refusing the connection) or are
// briefly down (5xx); those are listed to check by hand, not as broken.

import { appendFileSync } from 'node:fs';
import { MANUAL_LINKS } from '../src/data/manuals.ts';

const TIMEOUT_MS = 20000;
const PARALLEL = 6;
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; manuals-link-check)', Accept: '*/*' };

/** Every address once, with the entries and labels that use it. */
function collect() {
  const byUrl = new Map();
  const add = (url, where) => {
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(where);
  };
  for (const link of MANUAL_LINKS) {
    add(link.url, `${link.id} (maker page)`);
    for (const doc of link.docs ?? []) add(doc.url, `${link.id}: ${doc.label}`);
  }
  return byUrl;
}

async function request(url, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: method === 'GET' ? { ...HEADERS, Range: 'bytes=0-1023' } : HEADERS,
    });
    // Don't download the whole file.
    res.body?.cancel().catch(() => {});
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function looksLikePdf(url) {
  return new URL(url).pathname.toLowerCase().endsWith('.pdf');
}

/**
 * A site that no longer exists (its name doesn't resolve) is broken. Any other
 * connection trouble (timed out, connection reset, refused) is usually the
 * site turning away GitHub's machines, so it's listed to check by hand.
 */
function unreachable(err) {
  const code = err?.cause?.code ?? (err?.name === 'AbortError' ? 'timed out' : err?.message ?? 'unknown error');
  if (code === 'ENOTFOUND') return { result: 'fail', reason: "the site's address no longer exists (ENOTFOUND)" };
  return { result: 'warn', reason: `couldn't connect from the check (${code}); open it by hand` };
}

/** 'ok', 'warn' or 'fail', with a short reason. */
async function check(url) {
  let res;
  try {
    res = await request(url, 'HEAD');
    // Some sites don't answer HEAD properly; ask for the first bytes instead.
    if (res.status >= 400 || res.status === 0) res = await request(url, 'GET');
  } catch {
    try {
      res = await request(url, 'GET');
    } catch (err) {
      return unreachable(err);
    }
  }
  const status = res.status;
  if (status === 404 || status === 410) return { result: 'fail', reason: `the site says it's gone (${status})` };
  if (status === 403 || status === 401 || status === 429) return { result: 'warn', reason: `the site turned the check away (${status}); open it by hand` };
  if (status >= 500) return { result: 'warn', reason: `the site had an error (${status}); try again later` };
  if (status >= 400) return { result: 'fail', reason: `the site answered ${status}` };
  const type = res.headers.get('content-type') ?? '';
  if (looksLikePdf(url) && type.includes('text/html')) {
    return { result: 'fail', reason: `opens a web page, not a PDF (ended at ${res.url})` };
  }
  return { result: 'ok', reason: `${status}` };
}

async function main() {
  const byUrl = collect();
  const urls = [...byUrl.keys()];
  const results = new Map();
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const url = urls[next++];
      let r = await check(url);
      // One retry for anything that isn't plainly fine, in case of a blip.
      if (r.result !== 'ok') r = await check(url);
      results.set(url, r);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  const failed = urls.filter((u) => results.get(u).result === 'fail');
  const warned = urls.filter((u) => results.get(u).result === 'warn');
  const lines = [];
  lines.push(`Checked ${urls.length} links: ${urls.length - failed.length - warned.length} fine, ${failed.length} broken, ${warned.length} to check by hand.`);
  const list = (title, group) => {
    if (group.length === 0) return;
    lines.push('', title);
    for (const u of group) {
      lines.push(`- ${u}`, `  ${results.get(u).reason}`, `  used by: ${byUrl.get(u).join('; ')}`);
    }
  };
  list('Broken (fix these in src/data/manuals.ts):', failed);
  list('Check by hand:', warned);
  const report = lines.join('\n');
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Manuals link check\n\n\`\`\`\n${report}\n\`\`\`\n`);
  }
  process.exitCode = failed.length > 0 ? 1 : 0;
}

main();
