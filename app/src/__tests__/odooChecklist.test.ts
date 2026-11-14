import { BUILT_IN_CHECKLIST, checklist, sections, EMPTY_INSPECTION, setChecklist } from '../lib/inspection';
import { fetchChecklist, itemsFrom, parseChecklist, scaleOf } from '../lib/odooChecklist';

afterEach(() => setChecklist(null));

describe('inspection checklist from Odoo surveys', () => {
  it('recognises rating scales by their choices, in any order', () => {
    expect(scaleOf(['Good', 'Fair', 'Poor', 'Safety risk', 'N/A'])).toBe('condition');
    expect(scaleOf(['N/A', 'Compliant', 'Non-compliant'])).toBe('compliance');
    expect(scaleOf(['Pass', 'Fail', 'N/A'])).toBe('passfail');
    expect(scaleOf(['Clopay', 'Other'])).toBeNull();
    expect(scaleOf(['Yes', 'No'])).toBeNull();
  });

  it('keeps built-in ids by title, gives new questions their own id, and skips info questions', () => {
    const cond = ['Good', 'Fair', 'Poor', 'Safety risk', 'N/A'];
    const items = itemsFrom(
      [
        { id: 1, title: 'Information', isPage: true, labels: [] },
        { id: 2, title: 'Door manufacturer', isPage: false, labels: ['Clopay', 'Other'] },
        { id: 3, title: 'Door condition', isPage: true, labels: [] },
        { id: 4, title: 'Rollers', isPage: false, labels: cond },
        { id: 5, title: 'Weather stripping', isPage: false, labels: cond },
      ],
      () => 'door',
    );
    expect(items.door!.map((d) => d.id)).toEqual(['rollers', 'q5']);
    expect(items.door![0].pro).toBe(BUILT_IN_CHECKLIST.door.find((d) => d.id === 'rollers')!.pro);
  });

  it('uses the new checklist in sections, and goes back to the built-in one', () => {
    setChecklist({ ...BUILT_IN_CHECKLIST, door: [{ id: 'q5', label: 'Weather stripping', scale: 'condition' }] });
    expect(sections(EMPTY_INSPECTION(1))[0].items.map((i) => i.def.label)).toEqual(['Weather stripping']);
    setChecklist(null);
    expect(checklist()).toBe(BUILT_IN_CHECKLIST);
  });

  it('is null when Survey or a survey is missing', async () => {
    const c = { call: async (_m: string, method: string) => { if (method === 'fields_get') throw new Error("Object survey.survey doesn't exist"); return []; } };
    expect(await fetchChecklist(c)).toBeNull();
  });

  it('round-trips through storage and rejects junk', () => {
    expect(parseChecklist(JSON.stringify(BUILT_IN_CHECKLIST))?.door).toHaveLength(BUILT_IN_CHECKLIST.door.length);
    expect(parseChecklist('{"door":1}')).toBeNull();
    expect(parseChecklist(null)).toBeNull();
  });
});

describe('info questions from Odoo', () => {
  const q = (id: number, title: string, labels: string[] = [], type?: string) => ({ id, title, isPage: false, labels, type });
  it('keeps built-in names, takes renames by order, and picks up the notes and makers', () => {
    const { DEFAULT_INFO } = require('../lib/inspection');
    const { infoFrom } = require('../lib/odooChecklist');
    const r = infoFrom(
      [
        q(1, 'Job'),
        q(2, 'Door number'),
        q(3, 'Rollers, track and opener lubricated', ['Yes', 'No']),
        q(4, 'Door manufacturer', ['Clopay', 'Other']),
        q(5, 'Size (for example 16x7)'),
        q(6, 'Door age (year installed)'),
        q(7, 'Spring date codes ya'),
        q(8, 'Spring cycles'),
        q(9, 'Anything else', [], 'text_box'),
      ],
      DEFAULT_INFO.door,
      'notes',
    );
    expect(r.labels.code).toBe('Spring date codes ya');
    expect(r.labels.notes).toBe('Anything else');
    expect(r.labels.job).toBe('Job');
    expect(r.choices.get('maker')).toEqual(['Clopay', 'Other']);
  });
});

describe('extra info questions', () => {
  it('leftover info questions become extras, with their type and choices', () => {
    const { DEFAULT_INFO } = require('../lib/inspection');
    const { infoFrom } = require('../lib/odooChecklist');
    const q = (id: number, title: string, labels: string[] = [], type?: string) => ({ id, title, isPage: false, labels, type });
    const base = Object.values(DEFAULT_INFO.gate as Record<string, string>).filter((t) => t !== 'Notes and actions').map((t, i) => q(i + 1, t));
    const r = infoFrom([...base, q(30, 'Notes and actions', [], 'text_box'), q(20, 'Gate color'), q(21, 'Insulated', ['Yes', 'No']), q(22, 'Opener count', [], 'numerical_box')], DEFAULT_INFO.gate, 'notes');
    expect(r.extras).toEqual([
      { id: 'q20', label: 'Gate color', type: 'char' },
      { id: 'q21', label: 'Insulated', type: 'choice', choices: ['Yes', 'No'] },
      { id: 'q22', label: 'Opener count', type: 'number' },
    ]);
  });
});
