import {
  buildDoorInput,
  buildMatchInput,
  DEFAULT_DOOR_FORM,
  DEFAULT_MATCH_FORM,
  DoorForm,
  MatchForm,
  restoreForm,
  runDoor,
  runMatch,
} from '../lib/forms';

const pair225: MatchForm = { ...DEFAULT_MATCH_FORM, twentyCoil: '4 1/2', length: '24', wind: 'left' };

describe('match form', () => {
  it('lists what is still missing', () => {
    const r = runMatch(DEFAULT_MATCH_FORM);
    expect(r.status).toBe('incomplete');
    if (r.status === 'incomplete') expect(r.missing).toEqual(['Length of 20 coils', 'Spring length']);
  });

  it('passes the entries to the math in its units', () => {
    const { input } = buildMatchInput({ ...pair225, shaft: '30 1/2' });
    expect(input).toMatchObject({ twentyCoilIn: 4.5, insideDiameterIn: 2, lengthIn: 24, doorHeightIn: 84, drum: '400-8', springCount: 2, maxLengthIn: 30.5 });
    expect(input?.wireIn).toBeUndefined();
  });

  it('identifies a .225 x 2" x 24" pair on a 7\' door, same as the math tests', () => {
    const r = runMatch(pair225);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.result.old.wire).toBe('.225');
    expect(r.result.turns).toBe(7.5);
    expect(r.result.old.ippt).toBeCloseTo(33.3, 0);
    expect(r.result.warnings.some((w) => w.level === 'stop')).toBe(false);
  });

  it('picking the wire from the list gives the same answer as 20 coils', () => {
    const picked = runMatch({ ...pair225, wireMethod: 'size', wireSize: '.225' });
    const measured = runMatch(pair225);
    if (picked.status !== 'ok' || measured.status !== 'ok') throw new Error('expected results');
    expect(picked.result.old.ippt).toBeCloseTo(measured.result.old.ippt, 6);
  });

  it('caliper reading works', () => {
    const r = runMatch({ ...pair225, wireMethod: 'caliper', caliper: '0.226' });
    expect(r.status === 'ok' && r.result.old.wire).toBe('.225');
  });

  it('an ambiguous 20-coil measurement is a stop', () => {
    const r = runMatch({ ...pair225, twentyCoil: '4 7/16' });
    expect(r.status === 'ok' && r.result.warnings.some((w) => w.level === 'stop')).toBe(true);
  });

  it('a measurement that matches no wire is shown as an error, not a crash', () => {
    const r = runMatch({ ...pair225, twentyCoil: '7' });
    expect(r.status).toBe('error');
  });

  it('a 10\' door on 400-8 drums is an error', () => {
    const r = runMatch({ ...pair225, heightChoice: 'other', heightOther: '120' });
    expect(r).toEqual({ status: 'error', message: expect.stringContaining('400-8') });
  });

  it('other inside diameter and other height are read from their fields', () => {
    const { input, missing } = buildMatchInput({ ...pair225, idChoice: 'other', idOther: '1 3/4', heightChoice: 'other', heightOther: '' });
    expect(input).toBeUndefined();
    expect(missing).toEqual(['Door height']);
  });
});

describe('door form', () => {
  const door164: DoorForm = { ...DEFAULT_DOOR_FORM, weight: '164' };

  it('asks for the door weight first', () => {
    const r = runDoor(DEFAULT_DOOR_FORM);
    expect(r.status === 'incomplete' && r.missing).toEqual(['Door weight']);
  });

  it('needs at least one inside diameter', () => {
    const r = runDoor({ ...door164, ids: [] });
    expect(r.status === 'incomplete' && r.missing).toEqual(['Inside diameter']);
  });

  it('sizes a pair for a 164 lb 7\' door', () => {
    const r = runDoor(door164);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.result.turns).toBe(7.5);
    expect(r.result.options.length).toBeGreaterThan(0);
    for (const o of r.result.options) {
      expect(o.balancesDoorLb.low).toBeLessThanOrEqual(175);
      expect(o.balancesDoorLb.high).toBeGreaterThanOrEqual(155);
      expect(o.life.cycles).toBeGreaterThanOrEqual(10_000);
    }
  });

  it('a 25k target only returns springs rated 25k or more', () => {
    const r = runDoor({ ...door164, targetCycles: 25_000, ids: [2, 2.625] });
    if (r.status !== 'ok') throw new Error('expected results');
    expect(r.result.options.every((o) => o.life.cycles >= 25_000)).toBe(true);
  });

  it('a weight out of range is an error', () => {
    expect(runDoor({ ...door164, weight: '2000' }).status).toBe('error');
  });
});

describe('cable length', () => {
  it('stays off until floor to shaft center is entered', () => {
    const r = runMatch(pair225);
    expect(r.status === 'ok' && r.result.cableLengthIn).toBeUndefined();
  });
  it('is floor to shaft center plus 8" on 400-8 drums, in both modes', () => {
    const m = runMatch({ ...pair225, shaftHeight: '94 1/2' });
    expect(m.status === 'ok' && m.result.cableLengthIn).toBe(102.5);
    const d = runDoor({ ...DEFAULT_DOOR_FORM, weight: '164', shaftHeight: '94' });
    expect(d.status === 'ok' && d.result.cableLengthIn).toBe(102);
  });
  it('a shaft below the top of the door is an error', () => {
    expect(runDoor({ ...DEFAULT_DOOR_FORM, weight: '164', shaftHeight: '80' }).status).toBe('error');
  });
  it('a form saved before the field existed loads with it blank', () => {
    const { shaftHeight: _drop, ...older } = DEFAULT_DOOR_FORM;
    expect(restoreForm(DEFAULT_DOOR_FORM, { ...older, weight: '150' }).shaftHeight).toBe('');
  });
});

describe('restoreForm', () => {
  it('keeps saved values of the right type and fills the rest', () => {
    const saved = { length: '26', springCount: 1, idChoice: 7, junk: 'x' };
    const r = restoreForm(DEFAULT_MATCH_FORM, saved);
    expect(r.length).toBe('26');
    expect(r.springCount).toBe(1);
    expect(r.idChoice).toBe(DEFAULT_MATCH_FORM.idChoice); // wrong type ignored
    expect('junk' in r).toBe(false);
  });
  it('ignores garbage', () => {
    expect(restoreForm(DEFAULT_DOOR_FORM, null)).toEqual(DEFAULT_DOOR_FORM);
    expect(restoreForm(DEFAULT_DOOR_FORM, [1, 2])).toEqual(DEFAULT_DOOR_FORM);
  });
});

describe('track radius', () => {
  const door164: DoorForm = { ...DEFAULT_DOOR_FORM, weight: '164' };

  it('defaults to 15" on both screens and is passed to the math', () => {
    expect(DEFAULT_MATCH_FORM.trackRadius).toBe(15);
    expect(DEFAULT_DOOR_FORM.trackRadius).toBe(15);
    expect(buildMatchInput({ ...pair225, trackRadius: 12 }).input?.trackRadiusIn).toBe(12);
    expect(buildDoorInput({ ...door164, trackRadius: 12 }).input?.trackRadiusIn).toBe(12);
  });

  it('12" track: the old pair balances about 4% less door, replacements unchanged', () => {
    const on15 = runMatch(pair225);
    const on12 = runMatch({ ...pair225, trackRadius: 12 });
    if (on15.status !== 'ok' || on12.status !== 'ok') throw new Error('expected results');
    expect(on12.result.balancesDoorLb.high / on15.result.balancesDoorLb.high).toBeCloseTo(0.962, 3);
    expect(on12.result.equivalents).toEqual(on15.result.equivalents);
  });

  it('12" track: a 164 lb door gets a slightly stronger pair', () => {
    const on15 = runDoor(door164);
    const on12 = runDoor({ ...door164, trackRadius: 12 });
    if (on15.status !== 'ok' || on12.status !== 'ok') throw new Error('expected results');
    expect(on12.result.options[0]!.ippt).toBeGreaterThan(on15.result.options[0]!.ippt);
  });

  it('a form saved before the choice existed loads with 15"', () => {
    const { trackRadius: _a, ...olderMatch } = DEFAULT_MATCH_FORM;
    const { trackRadius: _b, ...olderDoor } = DEFAULT_DOOR_FORM;
    expect(restoreForm(DEFAULT_MATCH_FORM, { ...olderMatch, length: '24' }).trackRadius).toBe(15);
    expect(restoreForm(DEFAULT_DOOR_FORM, { ...olderDoor, weight: '150' }).trackRadius).toBe(15);
  });
});
