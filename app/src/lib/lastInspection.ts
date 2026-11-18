/**
 * "Last time: Good": the answer given to the same item at the same door on
 * the customer's previous inspection, kept on this phone. Kept free of React.
 */
import { Answer, AnswerKey, Inspection } from './inspection';
import type { Job } from './jobs';

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();
const hasAnswers = (i: Inspection) => i.doors.some((d) => Object.values(d.answers).some((a) => a.rating) || d.motors.some((m) => Object.values(m.answers).some((a) => a.rating))) || (!!i.gate && Object.values(i.gate.answers).some((a) => a.rating));

/** The customer's most recent other job with answered inspection items. */
export function previousInspection(jobs: Pick<Job, 'id' | 'customer' | 'customerId' | 'inspection'>[], job: Pick<Job, 'id' | 'customer' | 'customerId'>): Inspection | undefined {
  const same = (j: Pick<Job, 'customer' | 'customerId'>) => (job.customerId && j.customerId ? job.customerId === j.customerId : norm(j.customer) !== '' && norm(j.customer) === norm(job.customer));
  return jobs
    .filter((j) => j.id !== job.id && j.inspection && same(j) && hasAnswers(j.inspection))
    .map((j) => j.inspection!)
    .sort((a, b) => b.at - a.at)[0];
}

/** Which door of the earlier inspection is this one: the same make and size, else the same position. */
function matchDoor(cur: Inspection, prev: Inspection, doorId: string) {
  const i = cur.doors.findIndex((d) => d.id === doorId);
  const d = cur.doors[i];
  if (!d) return undefined;
  if (d.size.trim() && d.maker) {
    const hit = prev.doors.find((p) => norm(p.size) === norm(d.size) && p.maker === d.maker);
    if (hit) return hit;
  }
  return prev.doors[i];
}

/** The earlier answer for an item key ("d:<door>:<item>", "m:<door>:<motor>:<item>", "g:<item>"), if it was answered. */
export function lastAnswer(cur: Inspection, prev: Inspection | undefined, key: AnswerKey): Answer | undefined {
  if (!prev) return undefined;
  const [kind, a, b, c] = key.split(':');
  let found: Answer | undefined;
  if (kind === 'd') found = matchDoor(cur, prev, a)?.answers[b];
  else if (kind === 'm') {
    const door = cur.doors.find((d) => d.id === a);
    const pd = matchDoor(cur, prev, a);
    const mi = door ? door.motors.findIndex((m) => m.id === b) : -1;
    found = mi >= 0 ? pd?.motors[mi]?.answers[c] : undefined;
  } else if (kind === 'g') found = prev.gate?.answers[a];
  return found?.rating ? found : undefined;
}
