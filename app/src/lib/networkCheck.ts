/**
 * Network check: can the phone reach the internet, and can it reach Odoo,
 * and how long each takes. Reads only.
 */
export type NetState = 'ok' | 'slow' | 'failed';

export interface NetResult {
  name: string;
  state: NetState;
  ms: number | null;
  detail: string;
}

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

export const SLOW_MS = 2000;
const TIMEOUT_MS = 8000;
const INTERNET_URL = 'https://clients3.google.com/generate_204';

async function timed(name: string, run: (signal: AbortSignal) => Promise<{ ok: boolean; status: number }>, now: () => number): Promise<NetResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const started = now();
  try {
    const r = await run(ctl.signal);
    const ms = now() - started;
    if (!r.ok) return { name, state: 'failed', ms, detail: `Answered with an error (${r.status}).` };
    return { name, state: ms > SLOW_MS ? 'slow' : 'ok', ms, detail: ms > SLOW_MS ? `Answered, but slowly (${ms} ms).` : `Answered in ${ms} ms.` };
  } catch (e) {
    const timedOut = ctl.signal.aborted;
    return { name, state: 'failed', ms: null, detail: timedOut ? `No answer after ${TIMEOUT_MS / 1000} seconds.` : `Couldn't connect${e instanceof Error && e.message ? `: ${e.message}` : '.'}` };
  } finally {
    clearTimeout(timer);
  }
}

/** Internet first, then Odoo (when signed in). `offline` is the Pretend offline switch. */
export async function checkNetwork(opts: { odooUrl: string | null; offline?: boolean; fetchFn?: FetchLike; now?: () => number }): Promise<NetResult[]> {
  const fetchFn = opts.fetchFn ?? ((url, init) => fetch(url, init as RequestInit));
  const now = opts.now ?? Date.now;
  if (opts.offline) {
    const detail = 'Pretend offline is on.';
    return [{ name: 'Internet', state: 'failed', ms: null, detail }, ...(opts.odooUrl ? [{ name: 'Odoo', state: 'failed' as const, ms: null, detail }] : [])];
  }
  const out = [await timed('Internet', (signal) => fetchFn(INTERNET_URL, { method: 'GET', signal }), now)];
  if (opts.odooUrl) {
    const url = `${opts.odooUrl.replace(/\/+$/, '')}/web/webclient/version_info`;
    out.push(await timed('Odoo', (signal) => fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} }), signal }), now));
  }
  return out;
}
