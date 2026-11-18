import { isLive, seenText, sharePosition, techPositions } from '../lib/odooLocation';

const NOW = Date.UTC(2026, 10, 18, 18, 0);

function fake(rows: Record<string, unknown>[] = []) {
  const calls: { model: string; method: string; args: unknown[] }[] = [];
  return {
    calls,
    session: { url: 'https://x.test', db: 'd', uid: 6 } as never,
    call: async (model: string, method: string, args: unknown[]) => {
      calls.push({ model, method, args });
      if (model === 'res.users' && method === 'read') return [{ partner_id: [90, 'Sam'] }];
      if (model === 'fsm.person') return rows;
      return true;
    },
  };
}

describe('sharing a position', () => {
  it("writes only the latitude, longitude and day onto the user's own contact", async () => {
    const c = fake();
    await sharePosition(c, 30.1, -97.8, NOW);
    const w = c.calls.find((x) => x.method === 'write')!;
    expect(w.model).toBe('res.partner');
    expect(w.args).toEqual([[90], { partner_latitude: 30.1, partner_longitude: -97.8, date_localization: '2026-11-18' }]);
  });
});

describe('reading positions', () => {
  it('lists workers with a position, newest first, and leaves out empty or zero ones', async () => {
    const c = fake([
      { id: 1, name: 'Old', partner_latitude: 30, partner_longitude: -97, write_date: '2026-11-18 10:00:00' },
      { id: 2, name: 'New', partner_latitude: 31, partner_longitude: -98, write_date: '2026-11-18 17:58:00' },
      { id: 3, name: 'None', partner_latitude: 0, partner_longitude: 0, write_date: '2026-11-18 17:00:00' },
      { id: 4, name: 'Blank', partner_latitude: false, partner_longitude: false, write_date: '2026-11-18 17:00:00' },
    ]);
    const p = await techPositions(c);
    expect(p.map((x) => x.id)).toEqual([2, 1]);
    expect(isLive(p[0]!, NOW)).toBe(true);
    expect(isLive(p[1]!, NOW)).toBe(false);
  });

  it('says how long ago in plain words', () => {
    expect(seenText(NOW - 30_000, NOW)).toBe('just now');
    expect(seenText(NOW - 5 * 60_000, NOW)).toBe('5 min ago');
    expect(seenText(NOW - 3 * 3600_000, NOW)).toBe('3 h ago');
  });
});
