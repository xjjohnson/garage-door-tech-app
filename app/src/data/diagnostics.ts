/**
 * Opener diagnostics: blink and beep codes by maker and model family, plus a
 * short symptom guide that works for any brand. Everything here is bundled in
 * the app, so it works with no signal. Only the "Source" links need one.
 *
 * Where it comes from: every code and meaning is taken from the maker's own
 * public support page or manual, linked in `sources`. The checks are written
 * in our own words, in the order a tech would do them. Nothing is copied
 * whole from the makers.
 *
 * To add a code or a family:
 *   1. Open the maker's page or PDF and read the code there yourself.
 *   2. Add the page to the family's `sources` with today's date in `checked`.
 *      The tests refuse any source whose host isn't one of the maker's own
 *      hosts (in DIAG_BRANDS), so a forum or a parts site can't slip in.
 *   3. Write the checks in order, cheapest and safest first. Set `pro: true`
 *      when the fix means touching springs, cables or drums.
 */

export interface DiagSource {
  title: string;
  url: string;
  /** The day someone last opened the page and read the codes there, YYYY-MM-DD. */
  checked: string;
}

export interface DiagBrand {
  id: string;
  name: string;
  /** The maker's own website hosts. Every source for this maker must use one. */
  hosts: string[];
}

export interface DiagCode {
  /** What the tech sees, e.g. "4-1", "5 flashes", "12 beeps". Unique in its family. */
  code: string;
  /** What the maker says it means, short. */
  meaning: string;
  /** What the door or opener does when this code shows. */
  symptom?: string;
  /** What to check, in order. */
  checks: string[];
  /** The fix involves springs, cables or drums: a trained tech only. */
  pro?: boolean;
  /** Only some models in the family show it. */
  note?: string;
}

export interface DiagFamily {
  id: string;
  brand: string;
  name: string;
  /** Model numbers and series names, for telling families apart. */
  models: string[];
  /** Where the code shows and how to count it. */
  howToRead: string;
  /** A note for the whole family, e.g. a code that newer boards dropped. */
  note?: string;
  codes: DiagCode[];
  sources: DiagSource[];
}

export interface Symptom {
  id: string;
  title: string;
  /** One line on what to think about first. */
  summary: string;
  checks: string[];
  /** Codes that point at this symptom, by family id and code, to look up next. */
  related: { family: string; code: string }[];
  sources: DiagSource[];
}

/** Shown before anything else on the Diagnose screen. Never hidden. */
export const DIAG_SAFETY: string[] = [
  'Springs, cables, drums and bottom brackets hold the weight of the door under high tension. Only a trained tech should adjust or replace them.',
  'Unplug the opener, and its battery backup if it has one, before touching wiring, the logic board or the motor.',
  'Pull the emergency release with the door closed when you can. With a broken spring, an open door can drop hard.',
  'Never turn up the force to make a binding or heavy door run. Fix the door, then test the safety reversal with a 2x4 laid flat.',
];

const CHECKED = '2026-11-11';

export const DIAG_BRANDS: DiagBrand[] = [
  { id: 'liftmaster', name: 'LiftMaster / Chamberlain', hosts: ['support.chamberlaingroup.com', 'www.liftmaster.com', 'www.chamberlain.com'] },
  { id: 'genie', name: 'Genie', hosts: ['store.geniecompany.com', 'www.geniecompany.com'] },
  { id: 'linear', name: 'Linear', hosts: ['linear-solutions.com'] },
  { id: 'guardian', name: 'Guardian', hosts: ['adhguardianusa.com'] },
];

// Maker pages used in more than one place.
const LM_CODES: DiagSource = {
  title: 'LiftMaster / Chamberlain: Diagnostic Codes and UP/DOWN Flashing Lights',
  url: 'https://support.chamberlaingroup.com/s/article/Knowledge/Garage-Door-Opener-Diagnostic-Codes',
  checked: CHECKED,
};
const LM_JACKSHAFT: DiagSource = {
  title: 'LiftMaster: Diagnostic Codes, Wi-Fi Residential and Light-Duty Commercial Jackshaft Operators',
  url: 'https://support.chamberlaingroup.com/s/article/Diagnostic-Codes-Wi-Fi-Residential-and-Light-Duty-Commercial-Jackshaft-Operators',
  checked: CHECKED,
};
const LM_LEARN_LED: DiagSource = {
  title: 'Chamberlain: What does the flashing LED next to the learn button mean',
  url: 'https://support.chamberlaingroup.com/s/article/Knowledge/What-does-the-flashing-LED-next-to-the-learn-button-mean-1484145519298',
  checked: CHECKED,
};
const LM_RJO: DiagSource = {
  title: 'LiftMaster: Diagnostic codes for Residential Jackshaft Opener (3800, 8500, RJO20)',
  url: 'https://support.chamberlaingroup.com/s/article/Diagnostic-codes-for-the-LiftMaster-Residential-Jackshaft-Opener-RJO-Model-3800-and-8500-1484145623762',
  checked: CHECKED,
};
const LM_WONT_CLOSE: DiagSource = {
  title: 'Chamberlain: My Garage Door Will Not Fully Close',
  url: 'https://support.chamberlaingroup.com/s/article/Why-won-t-my-garage-door-fully-close-1484145516377',
  checked: CHECKED,
};
const LM_BALANCE: DiagSource = {
  title: 'Chamberlain: How to test the balance of a garage door',
  url: 'https://support.chamberlaingroup.com/s/article/Knowledge/How-to-test-the-balance-of-a-garage-door-1484145605074',
  checked: CHECKED,
};
const LM_ALIGN: DiagSource = {
  title: 'Chamberlain: Garage Door Safety Sensors, How to Align',
  url: 'https://support.chamberlaingroup.com/s/article/Knowledge/How-to-align-safety-reversing-sensors-1484145609323',
  checked: CHECKED,
};
const LM_REVERSAL: DiagSource = {
  title: 'Chamberlain: How to Test the Safety Reversal System',
  url: 'https://support.chamberlaingroup.com/s/article/How-do-I-test-the-Safety-Reversal-System-1484145519301',
  checked: CHECKED,
};
const GENIE_TROUBLE: DiagSource = {
  title: 'Genie: Garage Door Opener Troubleshooting',
  url: 'https://store.geniecompany.com/pages/genie-garage-door-opener-troubleshooting',
  checked: CHECKED,
};
const GENIE_600: DiagSource = {
  title: 'Genie: Troubleshooting Guide for models 1022, 1024, 1042, 2022, 2024, 2042, 2027',
  url: 'https://store.geniecompany.com/pages/genie-garage-door-opener-troubleshooting-guide-for-models-1022-1024-1042-2022-2024-2042-2027',
  checked: CHECKED,
};
const GENIE_EXCELERATOR: DiagSource = {
  title: 'Genie: Excelerator Series Self-Diagnostic Troubleshooting',
  url: 'https://store.geniecompany.com/pages/genie-excelerator-series-garage-door-opener-self-diagnostic-troubleshooting',
  checked: CHECKED,
};
const GENIE_BEAM: DiagSource = {
  title: 'Genie: Safe-T-Beam System Self Diagnostic Troubleshooting',
  url: 'https://store.geniecompany.com/pages/genie-safe-t-beam-system-self-diagnostic-troubleshooting',
  checked: CHECKED,
};
const LINEAR_LDO: DiagSource = {
  title: 'Linear: LDO33 & LDO50 installation instructions (PDF, section 17)',
  url: 'https://linear-solutions.com/wp-content/uploads/LDO.pdf',
  checked: CHECKED,
};
const LINEAR_LDCO: DiagSource = {
  title: 'Linear: LDCO 841/863 install manual (PDF, section 21)',
  url: 'https://linear-solutions.com/wp-content/uploads/10028150-Rev-C-LDCO-841-863-Install-Manual_WEB.pdf',
  checked: CHECKED,
};
const GUARDIAN_FAQ: DiagSource = {
  title: 'Guardian: FAQs and Troubleshooting',
  url: 'https://adhguardianusa.com/service/faqs-troubleshooting/',
  checked: CHECKED,
};

const SENSOR_WIRE_CHECKS = [
  'Look at both sensor LEDs. Both should be on and steady.',
  'Follow the sensor wire from each eye to the powerhead. Look for staples through the wire, cuts, and loose wires at the terminals.',
  'Short-wire test: run a short new pair from the powerhead straight to the sensors. If the code clears, replace the old run.',
];

export const DIAG_FAMILIES: DiagFamily[] = [
  {
    id: 'lm-sec2',
    brand: 'liftmaster',
    name: 'Security+ 2.0 / 3.0 (UP and DOWN arrows)',
    models: ['Yellow Learn button', 'White Learn button', '8500W', 'RJO70', '98022', 'RJO101', '98032', 'LJ8900W', 'LJ8950W'],
    howToRead:
      'Watch the UP and DOWN arrows by the Learn button on the powerhead. "4-1" means the UP arrow flashes 4 times, then the DOWN arrow flashes once. The myQ app and LCD wall controls show the same code.',
    codes: [
      {
        code: '1-1',
        meaning: 'Safety sensors blocked, misaligned, unplugged, or a broken wire',
        symptom: 'Door starts closing and goes back up, or will not close at all.',
        checks: ['Clear anything in the beam path, including cobwebs.', ...SENSOR_WIRE_CHECKS, 'Replace the sensors if a new wire run does not fix it.'],
      },
      {
        code: '1-2',
        meaning: 'Sensor wires shorted or crossed',
        symptom: 'Door will not close. It may move an inch or two and come back.',
        checks: [
          'Make sure the wire colors match at both ends: white to white, striped to striped.',
          'Look for a staple or a pinch that shorts the two wires together.',
          'Do the short-wire test from the powerhead to the sensors.',
        ],
      },
      {
        code: '1-3',
        meaning: 'Wall control wires shorted, or the wall control has failed',
        symptom: 'Wall control does nothing.',
        checks: ['Check the wall control wire at staples and at both terminals.', 'Fix or replace the wire. If the wire is good, replace the wall control.'],
        note: 'Listed for the Wi-Fi jackshaft models (8500W, LJ8900W, LJ8950W).',
      },
      {
        code: '1-4',
        meaning: 'Sensors misaligned or blocked for a moment',
        symptom: 'Door will not close.',
        checks: ['Clear the beam path.', 'Realign both eyes until both LEDs stay steady.'],
        note: 'Listed for the Wi-Fi jackshaft models (8500W, LJ8900W, LJ8950W).',
      },
      {
        code: '1-5',
        meaning: 'No motor RPM detected',
        symptom: 'Opener hums or clicks, and the door moves less than 6 to 8 inches, or not at all.',
        checks: [
          'Look for a broken spring before anything else. If one is broken, stop here and fix the door first.',
          'Pull the release and move the door by hand. Look for binding, a lock left on, or a jammed roller.',
          'On a jackshaft, make sure the emergency release is reconnected.',
          'Moves 6 to 8 inches then stops: check the travel module and its wiring to the board.',
          'Single click and no movement: suspect the logic board. Hums with no movement: suspect the motor.',
        ],
      },
      {
        code: '1-6',
        meaning: 'Door moved with the motor off',
        symptom: 'Door opens fully, then drifts down or moves on its own.',
        checks: [
          'Do a balance test: pull the release, lift the door 3 to 4 feet and let go. It should stay put or drift slowly.',
          'If it is out of balance, the springs need adjusting by a trained tech.',
          'On a jackshaft, reconnect the release if it was pulled. You can also set the travel to where the door coasts to.',
        ],
        pro: true,
      },
      {
        code: '2-1 to 2-5',
        meaning: 'Logic board part failure',
        symptom: 'Opener does not respond to anything.',
        checks: [
          'Unplug the opener and the battery backup for 5 seconds, then plug both back in.',
          'If the code comes back, replace the logic board.',
        ],
      },
      {
        code: '3-1',
        meaning: 'Board fault during travel',
        symptom: 'Opener moves a little, then stops.',
        checks: ['Run the opener again.', 'If it keeps happening, replace the logic board.'],
        note: 'Listed for the Wi-Fi jackshaft models (8500W, LJ8900W, LJ8950W).',
      },
      {
        code: '3-3',
        meaning: 'Battery backup charging circuit error',
        symptom: 'Battery status LED flashes green all the time.',
        checks: ['Replace the logic board.'],
        note: 'Listed for the Wi-Fi jackshaft models (8500W, LJ8900W, LJ8950W).',
      },
      {
        code: '3-5',
        meaning: 'Cable tension monitor',
        symptom: 'Door goes back up partway down, or will not move.',
        checks: [
          'Look at the cables. If one is loose or off the drum, stop and fix the door first.',
          'Reconnect the cable tension monitor, check its roller sits on the cable, and check its wire.',
          'If a monitor was taken off on purpose, unplug and replug the opener 3 times so it relearns.',
        ],
        pro: true,
        note: 'Wall-mount jackshafts only: 8500W, RJO70, 98022, RJO101, 98032.',
      },
      {
        code: '4-1',
        meaning: 'Too much force while closing',
        symptom: 'Door stops, struggles or reverses on the way down.',
        checks: [
          'Clear anything in the door path.',
          'Pull the release and run the door by hand. Look for binding rollers, hinges or track.',
          'Lubricate rollers and hinges. Do a balance test.',
          'If the door travels past the floor, set the travel limits again.',
          'Test the safety reversal with a 2x4 laid flat.',
        ],
      },
      {
        code: '4-2',
        meaning: 'Too much force while opening',
        symptom: 'Door stops before it is fully open.',
        checks: [
          'Close the door, clear anything in the path, and try again.',
          'Do a balance test. A heavy door on the way up usually means weak or broken springs.',
        ],
        pro: true,
      },
      {
        code: '4-3',
        meaning: 'RPM lost while closing',
        symptom: 'Door stops and reverses just before the floor.',
        checks: ['Clear the path and check rollers and hinges, then try again.', 'If it keeps happening, check the travel module and RPM sensing.'],
      },
      {
        code: '4-4',
        meaning: 'RPM lost while opening',
        symptom: 'Door stops before it is fully open.',
        checks: [
          'Clear the path and check rollers and hinges, then try again.',
          'Do a balance test with the release pulled. If a spring is broken, stop and fix the door first.',
        ],
        pro: true,
      },
      {
        code: '4-5',
        meaning: 'Travel module not recognized, or not talking to the board',
        symptom: 'Door closes and comes back, or does not move. Some models run 6 to 8 inches and reverse.',
        checks: [
          'Check the travel module plug and wiring at the board.',
          'If the module was just replaced, make sure it is the right part number for this model.',
          'Replace the travel module if the wiring is good.',
        ],
      },
      {
        code: '4-6',
        meaning: 'Sensors blocked or misaligned when it tried to close',
        symptom: 'Door will not close.',
        checks: ['Clear the beam path.', 'Realign both eyes until both LEDs stay steady.'],
        note: 'Listed for the Wi-Fi jackshaft models (8500W, LJ8900W, LJ8950W).',
      },
      {
        code: '5-5',
        meaning: 'Remote light needed for unattended closing',
        symptom: 'Timer-to-close, app and schedule commands do nothing. Wall button and remotes still work.',
        checks: [
          'Install, power and pair a myQ remote LED light, or turn off schedules and timer-to-close in the app.',
          'On light-duty commercial models, which do not need the light, replace the logic board.',
        ],
        note: 'Wall-mount jackshafts only: 8500W, RJO70, 98022, RJO101, 98032.',
      },
    ],
    sources: [LM_CODES, LM_JACKSHAFT],
  },
  {
    id: 'lm-learn-led',
    brand: 'liftmaster',
    name: 'Older openers: LED by the Learn button',
    models: ['Purple Learn button', 'Red/orange Learn button', 'Green Learn button', 'Security+', 'Billion Code'],
    howToRead:
      'Count the flashes of the small LED next to the Learn button on the powerhead. It flashes the code, pauses, and repeats.',
    note: 'The 1, 2 and 4 flash sensor codes are gone on openers and replacement logic boards made after 2022.',
    codes: [
      {
        code: '1 flash',
        meaning: 'Sensor wire broken or disconnected',
        symptom: 'Door will not close. The opener lights blink 10 times.',
        checks: ['Check the sensor wires at each eye and at the powerhead for breaks and loose ends.', 'Fix or reconnect the wire.'],
      },
      {
        code: '2 flashes',
        meaning: 'Sensor wire shorted, or the two wires swapped',
        symptom: 'Door will not close. The opener lights blink 10 times.',
        checks: [
          'Look for staples or pinches that short the wire.',
          'White wire goes to the white terminal, white/black wire to the grey terminal.',
        ],
      },
      {
        code: '3 flashes',
        meaning: 'Wall control wire or wall control fault',
        symptom: 'The wall control LED is not lit.',
        checks: [
          'Check the wall control wire for a staple pinching it.',
          'Pull the wires off the wall control and touch them together. If the opener runs, replace the wall control.',
          'If not, short the red and white terminals at the powerhead. If it runs now, replace the wire.',
          'If the wall control is lit but does nothing, replace the wall control.',
        ],
        note: 'The touch-the-wires test does not work on Security+ 2.0 openers.',
      },
      {
        code: '4 flashes',
        meaning: 'Sensors misaligned: the receiving eye is dim or flickering',
        symptom: 'Door will not close. The opener lights blink 10 times.',
        checks: [
          'Clean both lenses.',
          'Loosen the receiving eye, aim it at the sending eye until its LED is steady, and tighten it.',
          'Make sure the track the eye is mounted on is solid.',
        ],
      },
      {
        code: '5 flashes',
        meaning: 'No motor RPM in the first second: something is stopping it',
        symptom: 'Opener hums, clicks, or moves only 6 to 8 inches.',
        checks: [
          'Check for a broken spring and for door balance before anything else.',
          'Take off any manual lock. Make sure the trolley is engaged and not jammed against the stop bolt.',
          'Hums, then shuts off: on an AC motor check the capacitor, then the gears. White plastic shavings mean stripped gears.',
          'Moves only 6 to 8 inches: check the RPM sensor, its plug, and the interrupter cup on the motor shaft.',
          'Single click: on DC, reseat the motor and transformer plugs. On AC, let the motor cool 45 minutes. Then suspect the board.',
          'If the motor overheated, let it cool 45 minutes before adjusting anything.',
        ],
      },
      {
        code: '6 flashes',
        meaning: 'Motor circuit failure',
        checks: ['Replace the receiver logic board. The maker says the motor itself is rarely the cause.'],
      },
    ],
    sources: [LM_LEARN_LED, LM_WONT_CLOSE],
  },
  {
    id: 'lm-rjo',
    brand: 'liftmaster',
    name: 'Jackshaft 3800, 8500, RJO20 (not Wi-Fi)',
    models: ['3800', '8500', 'RJO20', 'RJO20C'],
    howToRead: 'Count the flashes of the diagnostic LED next to the Learn button. It flashes the code number, pauses, and repeats.',
    note: 'For 8500W, LJ8900W and LJ8950W, use Security+ 2.0 instead. Codes 1, 2 and 4 are gone on units and boards made after 2022.',
    codes: [
      { code: '1', meaning: 'Sensor fault', symptom: 'Door will not close. Lights flash.', checks: SENSOR_WIRE_CHECKS },
      {
        code: '2',
        meaning: 'Sensor fault: shorted or reversed wire',
        symptom: 'Door will not close. Lights flash.',
        checks: ['Check for a staple shorting the wire, and that black and white are not swapped.', ...SENSOR_WIRE_CHECKS.slice(1)],
      },
      {
        code: '3',
        meaning: 'Wall control fault',
        symptom: 'Nothing happens from the wall control.',
        checks: ['Check for broken or pinched wall control wire.', 'Short the wires at the wall control and at the board to find which part is bad.'],
      },
      { code: '4', meaning: 'Sensors misaligned', symptom: 'Door reverses. Lights flash.', checks: ['Realign both eyes until both LEDs stay steady.'] },
      {
        code: '5',
        meaning: 'No RPM in the first second',
        symptom: 'No movement, grinding, or only 0 to 6 inches of travel.',
        checks: [
          'Make sure the door is engaged with the opener.',
          'Check the motor gears and the encoder harness plug.',
          'Then suspect the motor itself (brushes, armature) or a bent motor bracket.',
        ],
      },
      {
        code: '6',
        meaning: 'RPM pulses after the motor stopped',
        symptom: 'Door coasts up or down after reaching the limit.',
        checks: [
          'Disconnect the door and see if it moves by itself. If so, the door is out of balance.',
          'If the door is balanced and within the opener rating, replace the motor.',
        ],
        pro: true,
      },
      { code: '7', meaning: 'Motor short', symptom: 'No movement and no sound.', checks: ['Replace the motor.'] },
      {
        code: '9',
        meaning: 'Cable tension monitor reversal',
        symptom: 'No movement, limits will not set or hold, or the door starts down and reverses.',
        checks: ['Check that the cable sits right on the drum and is not slack.', 'Check the track radius, and whether the door is hot in the sun.'],
        pro: true,
      },
      { code: '10', meaning: 'Force reversal going up', symptom: 'Door stops while opening.', checks: ['Run the opener again. It steps to the next force setting by itself.'] },
      {
        code: '11',
        meaning: 'Maximum force going down',
        symptom: 'Door stops and reverses while closing.',
        checks: ['Set the limits and force again.', 'If that does not fix it, the problem is in the door: check balance and binding.'],
      },
      {
        code: '12',
        meaning: 'Force reversal going down',
        symptom: 'Door stops and reverses while closing.',
        checks: ['Run the opener again. It steps to the next force setting by itself.'],
      },
      {
        code: '13',
        meaning: 'Maximum force going up',
        symptom: 'Door stops while opening.',
        checks: ['Set the limits and force again.', 'If that does not fix it, the problem is in the door: check balance and springs.'],
        pro: true,
      },
      { code: '15', meaning: 'Board memory check failed', symptom: 'No movement and no sound.', checks: ['The logic board is most likely bad. Replace it.'] },
    ],
    sources: [LM_RJO],
  },
  {
    id: 'genie-600-800',
    brand: 'genie',
    name: 'ChainLift, ReliaG, BeltLift, QuietLift 600 to 800',
    models: ['1022', '1024', '1042', '2022', '2024', '2042', '2027', 'ChainLift 600', 'ReliaG 600', 'BeltLift 600', 'ChainLift 800', 'ReliaG 800', 'ChainLift 700', 'QuietLift 800'],
    howToRead: 'Look at the red and green LEDs on the powerhead. Both off is normal. Count the blinks before each pause.',
    codes: [
      { code: 'Red steady', meaning: 'Programming not finished', checks: ['Finish setting the limits and add the remotes and wall console.'] },
      { code: 'Red 1 blink', meaning: 'Remote not learned', checks: ['Program the remote to the powerhead.'] },
      {
        code: 'Green 1 blink',
        meaning: 'Limits not finished, the beams were blocked while closing, or the door hit something',
        checks: ['Finish setting the limits.', 'Clear the doorway between the Safe-T-Beams.', 'Check the door springs and balance.'],
      },
      {
        code: 'Green 2 blinks',
        meaning: 'Up limit not set, bad beam wiring, or beams misaligned or blocked',
        checks: ['Set the UP limit.', 'Check the Safe-T-Beam wire and connections at the powerhead.', 'Realign the beams and clear anything near them.'],
      },
      { code: 'Green 3 blinks', meaning: 'Limits set backwards', checks: ['Clear the limits and set them again.'] },
      {
        code: 'Green 4 blinks',
        meaning: 'Wall console wire shorted or reversed',
        checks: ['Look for staples cutting the wire.', 'Swap the two wires at the powerhead terminals.', 'Replace the wall console or the wire if it is still there.'],
      },
      {
        code: 'Green 5 blinks',
        meaning: 'Chain or belt too tight, or control failure',
        checks: ['Adjust the chain or belt tension.', 'If it still shows, the control has failed: contact Genie.'],
      },
    ],
    sources: [GENIE_600, GENIE_TROUBLE],
  },
  {
    id: 'genie-excelerator',
    brand: 'genie',
    name: 'Excelerator, ISD, Pro99',
    models: ['H8000', 'H8000-07', 'H8000D', 'ISD990', 'ISD995', 'ISD1000', 'PRO99', 'PRO99-21C', 'PRO99FN', 'CMD9900'],
    howToRead: 'Take the lens cover off the powerhead and count the status LED blinks before each pause. A steady green light means call Genie.',
    codes: [
      {
        code: '1 blink',
        meaning: 'Motor drive board interrupt',
        checks: [
          'Unplug for 5 seconds, plug back in, and run it from the wall console. The first run is slow.',
          'If it comes back, check door balance, springs, rollers and binding hardware.',
          'Still there: check the fuse on the motor drive board and that the ribbon cable is seated.',
        ],
      },
      {
        code: '2 blinks',
        meaning: 'Controller board interrupt',
        checks: ['Unplug for 5 seconds and plug back in.', 'Check the ribbon cable between the motor drive board and the controller board.'],
      },
      {
        code: '3 blinks',
        meaning: 'Overheated or run too many times in a row',
        checks: ['Do not unplug it. Wait 10 minutes. It gets back about 5 runs per 10 minutes of rest.'],
      },
      { code: '4 blinks', meaning: 'Force settings wrong', checks: ['Set the force. It is not set at the factory.', 'Check the door condition and balance.'] },
      { code: '5 blinks', meaning: 'Safe-T-Beam problem', checks: ['Read the Safe-T-Beam LEDs (see Genie Safe-T-Beam). The door will not close without working beams.'] },
      {
        code: '6 blinks',
        meaning: 'Wall console not working',
        checks: ['Check the console wire for shorts, tight staples and pinches.', 'Check the connections at the powerhead and at the console.'],
      },
      {
        code: '7 blinks',
        meaning: 'Limit switches not working',
        checks: ['Check the limit switch wires at the powerhead terminals.', 'Look for shorted or pinched wire under the limit switch brackets.'],
      },
      { code: '8 blinks', meaning: 'Wall console locked', checks: ['Slide the vacation lock on the wall console to unlocked.'] },
    ],
    sources: [GENIE_EXCELERATOR],
  },
  {
    id: 'genie-beam',
    brand: 'genie',
    name: 'Safe-T-Beam sensors (any Genie)',
    models: ['Safe-T-Beam', 'STB', '37220R'],
    howToRead: 'Look at the red and green LEDs on the source eye (the sending side). Count red blinks before each pause.',
    codes: [
      { code: 'Red on, green on', meaning: 'Normal', checks: ['Nothing to fix.'] },
      {
        code: 'Both off',
        meaning: 'No power at the powerhead, or bad wire from the powerhead',
        checks: ['Check the breaker, fuse and outlet.', 'Look for obvious shorts in the beam wire.'],
      },
      { code: 'Red off, green on', meaning: 'Bad or missing wire to the source, or a power blip', checks: ['Check the wire.', 'Unplug the opener and plug it back in.'] },
      {
        code: 'Red 2 blinks, green on',
        meaning: 'Beams misaligned, blocked, or the sensor eye is bad',
        checks: ['Clear the beam path.', 'Realign the source and sensor eyes.'],
      },
      { code: 'Red 2 blinks, green off', meaning: 'Bad or missing wire to the sensor eye, or the sensor eye is bad', checks: ['Check the wire to the sensor eye.'] },
      {
        code: 'Red 3 blinks, green on',
        meaning: 'Interference reaching the sensor eye',
        checks: ['Find the cause and remove it: low sun on the lens, or another brand of photo eyes nearby.'],
      },
      { code: 'Red 4 blinks, green on', meaning: 'Source eye not sending, or bad', checks: ['Replace the beams or contact Genie.'] },
    ],
    sources: [GENIE_BEAM, GENIE_TROUBLE],
  },
  {
    id: 'linear-ldo',
    brand: 'linear',
    name: 'LDO33 and LDO50',
    models: ['LDO33', 'LDO50'],
    howToRead: 'Count the flashes of the opener light. The receiving safety beam has a red LED: on is good, off is blocked, flashing is poorly aimed.',
    codes: [
      { code: '1 flash', meaning: 'Not a fault: a remote was added', checks: ['Add any other remotes.'] },
      {
        code: '2 flashes',
        meaning: 'Wall station wires shorted',
        symptom: 'Door will not close.',
        checks: ['Make sure both wires are tight on the terminal screws.', 'Look for a staple pinching the wire and pull it.'],
      },
      {
        code: '3 flashes',
        meaning: 'Safety beam blocked',
        symptom: 'Door will not close, or stops and reopens while closing.',
        checks: [
          'Clear the beam path.',
          'Realign until the red LED on the receiver is steady. Clean the lenses and shade them from low sun.',
          'Remotes will not close the door while the beam is blocked.',
        ],
      },
      {
        code: '4 flashes',
        meaning: 'Open or close force exceeded, or the motor overheated',
        symptom: 'Door reverses, or will not open or close.',
        checks: ['Check for binding and for an out-of-balance door.', 'Adjust the force in small steps. Do not use force to cover for binding.', 'If the motor overheated, wait 30 minutes.'],
      },
      { code: '5 flashes', meaning: 'Remote used while the vacation lock was on', checks: ['Slide the wall station lock to unlocked.'] },
      { code: '6 flashes', meaning: 'Motor ran over 30 seconds: mechanical or electronic failure', checks: ['Check the door and drive. Then call Linear technical services.'] },
    ],
    sources: [LINEAR_LDO],
  },
  {
    id: 'linear-ldco',
    brand: 'linear',
    name: 'LDCO 841 and 863 (Wi-Fi)',
    models: ['LDCO841', 'LDCO863', 'LDCO 841', 'LDCO 863'],
    howToRead: 'Count the flashes of the opener light. With a battery backup, count the beeps when the door is stopped open.',
    codes: [
      { code: '1 flash', meaning: 'Not a fault: a remote was added', checks: ['Add any other remotes.'] },
      {
        code: '2 flashes',
        meaning: 'Wall station wires shorted',
        symptom: 'Door will not run.',
        checks: ['Make sure both wires are tight on the terminal screws.', 'Pull any staple pinching the wire and replace frayed wire.'],
      },
      { code: '3 flashes', meaning: 'Safety beam blocked', symptom: 'Door will not close.', checks: ['Clear the beam path and realign the beams.'] },
      {
        code: '4 flashes',
        meaning: 'Open or close force exceeded',
        symptom: 'Door reverses, or will not open or close.',
        checks: ['Check for obstructions and binding.', 'Adjust the force if needed, or do a field reset.'],
      },
      { code: '5 flashes', meaning: 'Remote used while vacation mode was on', checks: ['Turn off vacation mode at the wall station.'] },
      { code: '6 flashes', meaning: 'Limit error: up and down limits too close together', checks: ['Set the open and close limits again.'] },
      { code: '7 flashes', meaning: 'Encoder error', symptom: 'Door reverses, or will not open or close.', checks: ['Check for obstructions and binding.', 'If it keeps happening, the opener needs service.'] },
      { code: '2 beeps', meaning: 'Battery low', checks: ['Make sure the opener has AC power and let the battery charge, about 10 hours.'] },
      { code: '4 beeps', meaning: 'Battery no longer holds a charge', checks: ['Replace the battery.'] },
      { code: '5 beeps', meaning: 'Battery or battery leads shorted', checks: ['Check the battery wires for a short. If they are good, replace the battery.'] },
    ],
    sources: [LINEAR_LDCO],
  },
  {
    id: 'guardian-beeps',
    brand: 'guardian',
    name: 'Guardian openers (beep codes)',
    models: ['600SL', '615', '628', '7160V', '7250V', '7280V', '928CC', '928V'],
    howToRead: 'Count the beeps from the powerhead. After a power-up, also count the courtesy light flashes.',
    codes: [
      {
        code: '20 beeps',
        meaning: 'Photo eyes blocked while closing',
        checks: ['Clear the beam and realign. Both eye LEDs, red and green, should be solid.', 'Guardian openers only work with Guardian photo eyes.'],
      },
      {
        code: '12 beeps',
        meaning: 'Running at the wrong speed, or no RPM encoder signal',
        checks: [
          'Unplug, wait a few seconds, and plug back in. Light flashes 5 times: limits and force were lost, so program them again. Flashes 3 times: limits are stored.',
          'If it still will not move, tap the board cover with a screwdriver handle. If that frees it, a relay is sticking: plan on a new logic board, and find what overloaded it.',
          'Travels 1 to 28 inches then beeps 12 times: check the RPM encoder wiring and the encoder.',
        ],
      },
      { code: '5 beeps', meaning: 'Limits and force not stored', checks: ['Program the limits and force from the manual.'] },
    ],
    sources: [GUARDIAN_FAQ],
  },
];

export const SYMPTOMS: Symptom[] = [
  {
    id: 'wont-close',
    title: "Won't close",
    summary: 'Misaligned or blocked safety eyes are the most common cause. Check them first.',
    checks: [
      'Look at both eye LEDs. A dark or blinking LED means blocked, misaligned or a wiring fault.',
      'Clear the beam path: boxes, cobwebs, a trash can, low sun on a lens.',
      'Loosen the receiving eye, aim it at the sending eye until its LED is steady, and tighten it. Eyes go no higher than 6 inches off the floor.',
      'Hold the wall button down. If the door closes while held, the eyes or their wiring are the problem.',
      'Follow the eye wire for staples and cuts, and check the terminals at the powerhead.',
      'Check the vacation or lock switch on the wall control.',
      'Read the code on the powerhead and look it up under By code.',
    ],
    related: [
      { family: 'lm-sec2', code: '1-1' },
      { family: 'lm-sec2', code: '1-2' },
      { family: 'lm-learn-led', code: '4 flashes' },
      { family: 'genie-beam', code: 'Red 2 blinks, green on' },
      { family: 'linear-ldo', code: '3 flashes' },
      { family: 'guardian-beeps', code: '20 beeps' },
    ],
    sources: [LM_WONT_CLOSE, LM_ALIGN, GENIE_TROUBLE],
  },
  {
    id: 'reverses',
    title: 'Reverses or stops going down',
    summary: 'Usually the door, not the opener. Find what it is fighting before touching force.',
    checks: [
      'Clear anything in the door path and make sure the eyes are steady.',
      'Pull the release with the door closed and run it by hand. It should move smoothly with no tight spots.',
      'Look at rollers, hinges and track. Lubricate. Look for a bent or loose track.',
      'Do a balance test: lift the door 3 to 4 feet and let go. It should stay put or drift slowly.',
      'If the door goes past the floor or bucks at the bottom, set the travel limits again.',
      'Only then adjust force, in small steps. Never turn it up to cover for binding.',
      'Test the safety reversal with a 2x4 laid flat under the door.',
    ],
    related: [
      { family: 'lm-sec2', code: '4-1' },
      { family: 'lm-sec2', code: '4-3' },
      { family: 'lm-rjo', code: '11' },
      { family: 'linear-ldo', code: '4 flashes' },
    ],
    sources: [LM_WONT_CLOSE, LM_BALANCE, LM_REVERSAL],
  },
  {
    id: 'stops-opening',
    title: 'Stops before fully open',
    summary: 'A door that gets heavy going up usually has a weak or broken spring.',
    checks: [
      'Look at the springs and cables first. A gap in a torsion spring or a slack cable means stop and fix the door.',
      'Do a balance test with the release pulled.',
      'Check for binding near the top: rollers at the curve, the track radius, the opener arm.',
      'Check the open limit and the open force.',
    ],
    related: [
      { family: 'lm-sec2', code: '4-2' },
      { family: 'lm-sec2', code: '4-4' },
      { family: 'lm-rjo', code: '13' },
    ],
    sources: [LM_CODES, LM_BALANCE, GENIE_TROUBLE],
  },
  {
    id: 'hums',
    title: "Hums or clicks, door doesn't move",
    summary: 'Rule out a broken spring before you blame the opener.',
    checks: [
      'Look for a broken spring or a cable off the drum. If so, stop: the door is what is stuck.',
      'Take off any manual lock or slide bolt.',
      'Make sure the trolley or carriage is engaged and not jammed against the stop bolt.',
      'Motor runs but the door does not: check for a broken chain or belt, a stripped sprocket, or white plastic shavings from stripped gears. On a screw drive, check the coupler.',
      'AC opener that hums then quits: check the start capacitor.',
      'If it ran a lot, let the motor cool about 45 minutes.',
    ],
    related: [
      { family: 'lm-sec2', code: '1-5' },
      { family: 'lm-learn-led', code: '5 flashes' },
      { family: 'lm-rjo', code: '5' },
      { family: 'guardian-beeps', code: '12 beeps' },
    ],
    sources: [LM_LEARN_LED, LM_CODES, GENIE_TROUBLE],
  },
  {
    id: 'remote',
    title: "Remote doesn't work, wall button does",
    summary: 'If the wall button works, the motor and board drive side are fine. Look at the radio side.',
    checks: [
      'Check the vacation or lock switch on the wall control. It shuts off remotes.',
      'Press the remote and watch its LED. Dim or dark means a new battery.',
      'Try a second remote. If only one fails, reprogram or replace it. If every remote quit at once, suspect the receiver or logic board.',
      'Make sure the antenna wire on the powerhead hangs down, away from other wires.',
      'Pull any LED or energy-saving bulb in the opener and test again. Some cause radio interference.',
      'Short range only: look for new interference in the garage, like a new light, charger or radio.',
    ],
    related: [
      { family: 'genie-600-800', code: 'Red 1 blink' },
      { family: 'genie-excelerator', code: '8 blinks' },
      { family: 'linear-ldo', code: '5 flashes' },
    ],
    sources: [GENIE_TROUBLE, GUARDIAN_FAQ],
  },
  {
    id: 'dead',
    title: 'Nothing works, no lights',
    summary: 'Start at the outlet and work toward the board.',
    checks: [
      'Plug a work light or tester into the opener outlet. No power: check the breaker and any GFCI.',
      'Check the wall control wire at both ends for staples and loose terminals.',
      'Unplug the opener and battery backup for 5 seconds, then plug back in.',
      'On older openers, touch the wall control wires together at the powerhead. If it runs, the wall control or its wire is bad. This test does not work on Security+ 2.0.',
      'Still dead with power at the outlet: suspect the logic board or transformer.',
    ],
    related: [
      { family: 'lm-sec2', code: '2-1 to 2-5' },
      { family: 'lm-learn-led', code: '3 flashes' },
      { family: 'lm-rjo', code: '7' },
      { family: 'genie-beam', code: 'Both off' },
    ],
    sources: [GENIE_TROUBLE, LM_LEARN_LED],
  },
  {
    id: 'flashes',
    title: 'Lights flash or it beeps',
    summary: 'Flashing lights and beeps are usually a code. Count them, then look them up.',
    checks: [
      'Count the flashes or beeps before the pause, and watch it repeat to be sure.',
      'LiftMaster or Chamberlain with UP and DOWN arrows: count the UP flashes, then the DOWN flashes.',
      'Older LiftMaster or Chamberlain: opener lights blinking 10 times means a sensor problem. Look at the LED by the Learn button for the code.',
      'Genie: read the LEDs on the powerhead and on the Safe-T-Beam source eye.',
      'Linear: count the opener light flashes. Guardian: count the beeps.',
      'Pick the brand under By code and match what you counted.',
    ],
    related: [
      { family: 'lm-learn-led', code: '1 flash' },
      { family: 'linear-ldo', code: '3 flashes' },
      { family: 'guardian-beeps', code: '20 beeps' },
    ],
    sources: [LM_LEARN_LED, LINEAR_LDO, GUARDIAN_FAQ],
  },
  {
    id: 'moves-alone',
    title: 'Opens or moves by itself',
    summary: 'Either the door is out of balance, or something is sending a signal.',
    checks: [
      'Door drifts after it stops: do a balance test. The springs may need adjusting.',
      'Door starts on its own: look for a stuck button on a remote or the wall control.',
      'Pull the wall control wires off the powerhead for a while. If it stops, the wall control or its wire is shorting.',
      'Lost or stolen remote: erase all remotes from the opener and program the ones they still have.',
    ],
    related: [
      { family: 'lm-sec2', code: '1-6' },
      { family: 'lm-rjo', code: '6' },
    ],
    sources: [GENIE_TROUBLE, LM_BALANCE, LM_CODES],
  },
];
