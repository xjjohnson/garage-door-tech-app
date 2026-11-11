/**
 * Opener programming guides: step by step, per model family, for remotes,
 * keypads, travel limits, force, and erasing everything the opener has
 * learned. Bundled in the app, so it works with no signal.
 *
 * Where it comes from: written in our own words from how these openers
 * work in the field. Nothing is copied from the makers. Each family links
 * the maker's manual (from the Manuals library) to check against; star it
 * there to keep it on the phone.
 *
 * Checking: a task with no `checked` date hasn't been read against the
 * maker's manual yet, and the screen says so. `toCheck` lists the exact
 * points to confirm. When you've confirmed a task against the manual, fix
 * any step that's wrong, clear `toCheck`, and set `checked` to the date.
 */

export type ProgTaskKind = 'remote' | 'keypad' | 'limits' | 'force' | 'erase';

export const PROG_TASK_LABEL: Record<ProgTaskKind, string> = {
  remote: 'Remotes',
  keypad: 'Keypad',
  limits: 'Travel limits',
  force: 'Force',
  erase: 'Erase all',
};

export const PROG_TASK_ORDER: ProgTaskKind[] = ['remote', 'keypad', 'limits', 'force', 'erase'];

export interface ProgTask {
  kind: ProgTaskKind;
  /** What to have ready or know before starting, one line. */
  before?: string;
  steps: string[];
  /** A tip shown after the steps. */
  note?: string;
  /** Points not yet confirmed against the maker's manual. */
  toCheck?: string[];
  /** The day someone read this task against the maker's manual, YYYY-MM-DD. */
  checked?: string;
}

export interface ProgFamily {
  id: string;
  /** A maker id from DIAG_BRANDS, so Diagnose and Program share the maker list. */
  brand: string;
  name: string;
  /** How to tell this family from the others on the ladder. */
  identify: string;
  models: string[];
  tasks: ProgTask[];
  /** Ids from MANUAL_LINKS to check the steps against. */
  manuals: string[];
}

/** Shown with every travel limit and force guide. Never hidden. */
export const PROG_SAFETY: string[] = [
  'Set limits and force only on a door that is balanced and runs free by hand. Never use force to make a binding or heavy door run.',
  'After any change, lay a 2x4 flat on the floor under the door and close it. The door must reverse when it hits the board.',
  'Then close the door and wave something through the safety eyes. The door must stop and go back up.',
];

const LM_LEARN_SPOT = 'The Learn button is on the back or side of the motor unit, often under the light lens, next to a small LED.';

export const PROG_FAMILIES: ProgFamily[] = [
  {
    id: 'lm-arrows',
    brand: 'liftmaster',
    name: 'Belt and chain with UP and DOWN arrow buttons',
    identify: 'Security+ 2.0 (yellow Learn button). Has UP and DOWN arrow buttons and an Adjust or travel button on the motor unit, no limit screws or force dials. Most LiftMaster and Chamberlain belt and chain openers from about 2011 on.',
    models: ['8550W', '8557W', '8587W', '8165W', '8164W', '8160W', '8155W', '8365W', '8360W', '8355W', '84501', '87802', 'B970', 'B980', 'C870', 'B730'],
    tasks: [
      {
        kind: 'remote',
        before: LM_LEARN_SPOT,
        steps: [
          'Stand where you can see the opener lights. Press and release the Learn button once. The LED next to it stays on for about 30 seconds.',
          'While the LED is on, press and hold the remote button you want to use.',
          'Let go when the opener lights blink or you hear two clicks.',
          'Press the remote button again. The door should move. Repeat for each button or remote.',
        ],
        note: 'If the LED went out before you pressed the remote, start again. Remotes older than Security+ 2.0 may not work with this board.',
        toCheck: ['How long the Learn LED stays on (30 seconds).', 'Whether lights blink, clicks, or both confirm on every model in this list.'],
      },
      {
        kind: 'keypad',
        before: 'Pick a 4-digit PIN with the homeowner first. ' + LM_LEARN_SPOT,
        steps: [
          'Press and release the Learn button on the motor unit. The LED stays on for about 30 seconds.',
          'At the keypad, type the 4-digit PIN.',
          'Press and hold ENTER until the opener lights blink or you hear two clicks, then let go.',
          'Test it: type the PIN and press ENTER. The door should move.',
        ],
        toCheck: ['That ENTER is held (not tapped) on current LiftMaster keypads.'],
      },
      {
        kind: 'limits',
        before: 'Start with the door closed and the trolley connected. Stand clear of the door while it moves.',
        steps: [
          'Press and hold the Adjust (travel) button until the UP arrow starts to flash, then let go.',
          'Press and hold UP until the door is where you want it fully open. Tap DOWN to back it off if it goes too far.',
          'Press and release the Adjust button. The opener lights blink and the DOWN arrow starts to flash.',
          'Press and hold DOWN until the door is fully closed with the bottom seal just touching the floor, not bowing the panels. Tap UP to back off.',
          'Press and release the Adjust button. The lights blink to save the travel.',
          'Press the wall control or a remote. The door opens on its own. Press again and it closes. The opener sets its force on these two runs, so let both finish without stopping the door.',
        ],
        toCheck: ['Which button starts it on each model (Adjust, travel, or Learn plus arrow).', 'That the lights blink twice when each end is saved.', 'That the open and close runs at the end are what sets the force.'],
      },
      {
        kind: 'force',
        steps: [
          'These openers have no force dials. They learn the force on the first open and close after travel is set.',
          'If the door reverses or stops on its own, first fix the door: check balance, rollers, track and hinges.',
          'Then set the travel limits again so the opener relearns the force on a door that runs free.',
        ],
        note: 'A door that only runs after relearning on a binding door is not fixed. The force it learned will be too high.',
        toCheck: ['Whether any model in this list has a separate force-learn step or a force setting in the menu.'],
      },
      {
        kind: 'erase',
        before: 'This clears every remote and keypad. Re-program the ones the homeowner keeps.',
        steps: [
          'Press and hold the Learn button until the LED next to it goes out, about 6 seconds.',
          'Let go. Every remote and keypad is erased.',
          'Test one old remote: the door should not move.',
        ],
        note: 'Wi-Fi (myQ) links and car remotes like HomeLink are not always cleared this way.',
        toCheck: ['Hold time (about 6 seconds).', 'Whether this also clears myQ or HomeLink on Wi-Fi models.'],
      },
    ],
    manuals: ['liftmaster-8160w', 'liftmaster-8550w', 'liftmaster-8155w', 'chamberlain-b970c', 'liftmaster-manuals'],
  },
  {
    id: 'lm-dials',
    brand: 'liftmaster',
    name: 'Older openers with limit screws and force dials',
    identify: 'Purple, red/orange or green Learn button. Has two travel limit screws (UP and DOWN) on the side and force dials or a force screw on the back. No arrow buttons.',
    models: ['Purple Learn button', 'Red/orange Learn button', 'Green Learn button', 'Security+', 'Billion Code', 'Older chain and screw drive'],
    tasks: [
      {
        kind: 'remote',
        before: LM_LEARN_SPOT + ' The remote has to match the Learn button color.',
        steps: [
          'Press and release the Learn button. The LED stays on for about 30 seconds.',
          'While it is on, press and hold the remote button.',
          'Let go when the opener lights blink.',
          'Press the remote again to test it.',
        ],
        toCheck: ['Which current remotes still match each older Learn button color.'],
      },
      {
        kind: 'keypad',
        before: 'Pick a 4-digit PIN with the homeowner. The keypad has to match the Learn button color.',
        steps: [
          'Press and release the Learn button. The LED stays on for about 30 seconds.',
          'At the keypad, type the 4-digit PIN.',
          'Press and hold ENTER until the opener lights blink, then let go.',
          'Type the PIN and press ENTER to test it.',
        ],
        toCheck: ['Whether green (Billion Code) keypads use a different sequence.'],
      },
      {
        kind: 'limits',
        before: 'Find the two limit screws on the side of the motor unit, marked UP and DOWN with arrows. You need a flat or Phillips screwdriver.',
        steps: [
          'Run the door all the way open, then all the way closed, and watch where it stops.',
          'Door does not open far enough: turn the UP screw the way the label arrow shows to add travel.',
          'Door does not close all the way: turn the DOWN screw the way the label arrow shows to add travel. Turn it the other way if the door closes and reverses off the floor.',
          'One full turn moves the stop about 2 inches. Make one change at a time and run a full cycle after each.',
          'Stop when the door opens clear of the opening and closes with the seal just touching the floor.',
        ],
        toCheck: ['That one full turn is about 2 inches of door travel.', 'Which way each screw turns for more travel on these labels.'],
      },
      {
        kind: 'force',
        before: 'Find the UP FORCE and DOWN FORCE dials (or a single force screw) on the back of the motor unit.',
        steps: [
          'Make sure the door is balanced and runs free by hand before touching force.',
          'If the door stops or reverses while opening, turn the UP FORCE dial a small amount clockwise. If it reverses while closing, do the same with DOWN FORCE.',
          'Move only a little at a time, about an eighth of a turn, and run a full cycle after each change.',
          'Use the lowest setting that runs the door the whole way.',
        ],
        note: 'If the door still needs more force, the door has a problem. Fix the door rather than turning the dial further.',
        toCheck: ['Clockwise for more force on every model with dials.', 'The size of a safe step (an eighth of a turn).'],
      },
      {
        kind: 'erase',
        before: 'This clears every remote and keypad.',
        steps: [
          'Press and hold the Learn button until the LED goes out, about 6 seconds.',
          'Let go. Every remote and keypad is erased.',
          'Test one old remote: the door should not move.',
        ],
        toCheck: ['Hold time on purple and red/orange boards.'],
      },
    ],
    manuals: ['liftmaster-manuals', 'chamberlain-manuals'],
  },
  {
    id: 'genie-arrows',
    brand: 'genie',
    name: 'Belt and chain with UP, DOWN and round PROGRAM buttons',
    identify: 'Intellicode 2 (about 2011 on). Has UP and DOWN arrow buttons, a round PROGRAM button, and a long LED on the motor unit. No knobs or rail switches.',
    models: ['1022', '1024', '1028', '1042', '2022', '2024', '2027', '2028', '2042', '3024', '4042', '7035', '7055', '7155', 'ChainLift 800', 'ReliaG 800', 'QuietLift 800', 'StealthDrive'],
    tasks: [
      {
        kind: 'remote',
        steps: [
          'Press and hold the round PROGRAM button until the long LED turns blue, then let go.',
          'Press and release the remote button you want to use. The long LED flashes purple.',
          'Press and release the same remote button again. The LED goes off and the opener light flashes.',
          'Press the remote once more to test it. The door should move.',
        ],
        toCheck: ['The LED colors at each step (blue, then purple).', 'Whether the remote button is pressed two or three times on these boards.'],
      },
      {
        kind: 'keypad',
        before: 'Pick a 4-digit PIN with the homeowner first.',
        steps: [
          'Press and hold the round PROGRAM button on the motor unit until the long LED turns blue, then let go.',
          'At the keypad, type the 4-digit PIN and press the UP/DOWN key. The long LED flashes purple.',
          'Type the PIN and press UP/DOWN again. The LED goes off and the opener light flashes.',
          'Type the PIN and press UP/DOWN to test it.',
        ],
        toCheck: ['The whole keypad sequence. Genie keypads have changed over the years.'],
      },
      {
        kind: 'limits',
        before: 'Start with the door closed and the carriage connected.',
        steps: [
          'Press and hold the UP arrow until the long LED starts flashing blue, then let go.',
          'Press and hold UP until the door is where you want it fully open. Use DOWN to back it off.',
          'Press and release the round PROGRAM button. The LED changes color to show the open stop is saved.',
          'Press and hold DOWN until the door is fully closed with the seal just touching the floor. Use UP to back off.',
          'Press and release the PROGRAM button to save the closed stop.',
          'Press the wall console. The door runs open and closed on its own to learn the force. Let it finish.',
        ],
        toCheck: ['Which button starts travel setting (holding UP).', 'The LED colors after each save.', 'Whether the learn run at the end happens on its own or needs the wall console.'],
      },
      {
        kind: 'force',
        steps: [
          'These openers learn the force on the run after the travel limits are set. There are no force knobs.',
          'If the door stops or reverses on its own, fix the door first: balance, rollers, track, hinges.',
          'Then set the travel limits again so the opener relearns on a door that runs free.',
        ],
        toCheck: ['Whether these boards have a manual force adjustment and how to reach it.'],
      },
      {
        kind: 'erase',
        before: 'This clears every remote and keypad.',
        steps: [
          'Press and hold the round PROGRAM button. The long LED turns blue.',
          'Keep holding until the LED turns purple and then goes out.',
          'Let go. Test one old remote: the door should not move.',
        ],
        toCheck: ['The whole erase sequence and how long to hold.'],
      },
    ],
    manuals: ['genie-2022-2024-2042', 'genie-1022-1024-1042', 'genie-7055-7155', 'genie-4042-3024', 'genie-support'],
  },
  {
    id: 'genie-knobs',
    brand: 'genie',
    name: 'Older screw and chain drives with Learn Code button',
    identify: 'Intellicode (about 1997 to 2011) or older. Has a LEARN CODE button and an LED, force knobs on the motor unit, and limit switches you slide along the rail.',
    models: ['IS', 'ISL', 'IMS', 'H4000', 'H6000', 'Pro 95', 'Chain Glide', 'GCG', 'PCG', 'H2000C', '1020L', '2020L'],
    tasks: [
      {
        kind: 'remote',
        steps: [
          'Press and release the LEARN CODE button on the motor unit. The LED lights up.',
          'Press and release the remote button. The LED starts to flash.',
          'Press and release the same remote button again. The LED goes off.',
          'Press the remote to test it. The door should move.',
        ],
        toCheck: ['The LED behavior at each step.', 'Whether pre-Intellicode (dip switch) remotes need a different method.'],
      },
      {
        kind: 'keypad',
        steps: [
          'Press and release the LEARN CODE button on the motor unit. The LED lights up.',
          'At the keypad, type the PIN and press the enter or UP/DOWN key. The LED flashes.',
          'Type the PIN and press the key again. The LED goes off.',
          'Type the PIN and press the key to test it.',
        ],
        toCheck: ['The whole keypad sequence for these older boards.'],
      },
      {
        kind: 'limits',
        before: 'Unplug the opener before moving a limit switch. The switches are on the rail; you need a screwdriver or nut driver.',
        steps: [
          'Run the door open and closed and note where it stops. Then unplug the opener.',
          'Door does not open far enough: loosen the open limit switch and slide it a little toward the motor unit. Tighten it.',
          'Door does not close all the way: loosen the close limit switch and slide it a little toward the door. Tighten it.',
          'Plug in and run a full cycle. Move a little at a time until the door opens clear and closes with the seal just touching the floor.',
        ],
        toCheck: ['Which way each switch moves on screw drives and on chain drives.', 'Models with limit screws on the motor unit instead of switches on the rail.'],
      },
      {
        kind: 'force',
        before: 'Find the OPEN FORCE and CLOSE FORCE knobs on the motor unit.',
        steps: [
          'Make sure the door is balanced and runs free by hand first.',
          'If the door stops while opening, turn OPEN FORCE up a little. If it reverses while closing, turn CLOSE FORCE up a little.',
          'Make one small change at a time and run a full cycle after each.',
          'Use the lowest setting that runs the door the whole way.',
        ],
        note: 'If it still needs more, fix the door rather than turning the knob further.',
        toCheck: ['Which way the knobs turn for more force.'],
      },
      {
        kind: 'erase',
        before: 'This clears every remote and keypad.',
        steps: [
          'Press and hold the LEARN CODE button until the LED goes out, then let go.',
          'Test one old remote: the door should not move.',
        ],
        toCheck: ['How long to hold the button.'],
      },
    ],
    manuals: ['genie-is-isl-screw', 'genie-chain-glide', 'genie-support'],
  },
];
