import { readStartChoice, writeStartChoice } from '../lib/themeStart';

describe('themeStart', () => {
  it('never throws and reads nothing when there is no database', () => {
    expect(() => writeStartChoice('light')).not.toThrow();
    expect(['light', null]).toContain(readStartChoice());
  });
  it('round-trips a choice through a database', () => {
    jest.resetModules();
    const rows: Record<string, string> = {};
    jest.doMock('expo-sqlite', () => ({
      openDatabaseSync: () => ({
        execSync: () => undefined,
        getFirstSync: () => (rows.theme ? { v: rows.theme } : null),
        runSync: (sql: string, p: unknown[]) => {
          if (sql.startsWith('DELETE')) delete rows.theme;
          else rows.theme = p[0] as string;
        },
      }),
    }));
    const m = require('../lib/themeStart');
    expect(m.readStartChoice()).toBeNull();
    m.writeStartChoice('light');
    expect(m.readStartChoice()).toBe('light');
    m.writeStartChoice(null);
    expect(m.readStartChoice()).toBeNull();
  });
});
