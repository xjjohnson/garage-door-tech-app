/**
 * Developer screen testing tools: look at the app as another role, a weak
 * signal switch, pretend time of day, the "What to test in this release"
 * tick-list and the changelog. Nothing here writes to Odoo; every switch
 * lives in memory and a restart puts the app back to normal. Ticks stay on
 * the phone only.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { Action } from './Buttons';
import { ChipRow, SectionTitle } from './controls';
import { RELEASE_NOTES, newerThan, type ReleaseNote } from '../data/releaseNotes';
import { onDevFlags, pretendTime, Preview, PREVIEWS, rolePreview, setPretendTime, setRolePreview, setWeakSignal, Signal, weakSignal } from '../lib/devFlags';
import { doneCount, loadSeenRelease, loadTicks, saveSeenRelease, setTick, Ticks } from '../lib/testChecklist';
import { colors, touch, type } from '../theme';

interface Props {
  /** The release number the phone is running. */
  release: string;
  /** Share a text file, as the Developer screen does. Resolves false if sharing isn't possible. */
  shareText: (name: string, text: string) => Promise<boolean>;
  /** The log as text, to attach to a Problem. */
  logText: () => string;
  notes?: ReleaseNote[];
}

const SIGNALS: { value: Signal; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'slow', label: 'Slow' },
  { value: 'flaky', label: 'Drops some' },
];

const ROLE_OPTIONS: { value: Preview | 'off'; label: string }[] = [{ value: 'off', label: 'Me' }, ...PREVIEWS.map((p) => ({ value: p.id, label: p.label }))];

export function DevTestTools({ release, shareText, logText, notes = RELEASE_NOTES }: Props) {
  const [, tick] = useState(0);
  useEffect(() => onDevFlags(() => tick((n) => n + 1)), []);
  const [ticks, setTicks] = useState<Ticks>({});
  const [seen, setSeen] = useState<string | null>(null);
  const [seenLoaded, setSeenLoaded] = useState(false);
  const [timeText, setTimeText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const current = notes.find((n) => n.release === release) ?? notes[0];
  const [openRelease, setOpenRelease] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (current) loadTicks(current.release).then((t) => alive && setTicks(t));
    loadSeenRelease().then((s) => {
      if (!alive) return;
      setSeen(s);
      setSeenLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [current?.release]);

  const fresh = seenLoaded ? newerThan(seen, notes) : [];
  const freshIds = new Set(fresh.map((n) => n.release));
  const preview = rolePreview();
  const pt = pretendTime();

  const mark = async (i: number, m: 'pass' | 'problem') => {
    if (!current) return;
    setTicks(await setTick(current.release, i, m));
    if (m === 'problem') {
      const item = current.test[i];
      const text = [`Problem found while testing release ${current.release}`, `Item: ${item}`, '', logText()].join('\n');
      const ok = await shareText(`johnsons-problem-${current.release}.txt`, text).catch(() => false);
      setNote(ok ? null : "Couldn't open sharing on this phone.");
    }
  };

  const gotIt = async () => {
    if (!notes[0]) return;
    await saveSeenRelease(notes[0].release);
    setSeen(notes[0].release);
  };

  return (
    <View style={styles.stack}>
      <SectionTitle>Look at the app as</SectionTitle>
      <ChipRow options={ROLE_OPTIONS} value={preview ?? 'off'} onChange={(v) => setRolePreview(v === 'off' ? null : v)} scroll testID="dev-role" />
      <Text style={styles.meta}>{preview ? `Viewing as ${PREVIEWS.find((p) => p.id === preview)?.label}. ` : ''}Shows only what that role opens. It only changes what this phone shows: nothing is written to Odoo, and a restart turns it off.</Text>

      <SectionTitle>Weak signal</SectionTitle>
      <ChipRow options={SIGNALS} value={weakSignal()} onChange={setWeakSignal} compact testID="dev-signal" />
      <Text style={styles.meta}>Slow: every Odoo call waits 5 seconds first. Drops some: every 4th call fails as if the signal dropped. Work saved meanwhile waits and sends like normal, so it is real. A restart turns it off.</Text>

      <SectionTitle>Pretend time of day</SectionTitle>
      <View style={styles.row}>
        <TextInput value={timeText} onChangeText={setTimeText} placeholder="07:30" accessibilityLabel="Pretend time, hours and minutes" style={[styles.input, styles.grow]} keyboardType="numbers-and-punctuation" testID="dev-time-input" />
        <Action label="Set" onPress={() => setPretendTime(timeText)} testID="dev-time-set" />
        <Action
          label="Real time"
          onPress={() => {
            setPretendTime(null);
            setTimeText('');
          }}
          testID="dev-time-off"
        />
      </View>
      <Text style={styles.meta} testID="dev-time-note">
        {pt ? `Pretending it is ${new Date(pt).toTimeString().slice(0, 5)} today.` : 'Using the real clock.'} Only weather lines and Dispatch's who-is-working use it. Nothing saved or sent changes. There is no pretend location: the app only reads this phone's position to send it to Odoo, so faking it would put a false position in Odoo.
      </Text>

      {current ? (
        <>
          <SectionTitle>{`What to test in ${current.release}`}</SectionTitle>
          <Text style={styles.meta} testID="dev-test-count">{`${doneCount(ticks, current.test.length)} of ${current.test.length} done. Ticks stay on this phone only.`}</Text>
          {current.test.map((t, i) => (
            <View key={i} style={styles.item} testID={`dev-test-item-${i}`}>
              <Text style={[styles.itemText, ticks[i] === 'pass' && styles.done]}>{`${ticks[i] === 'pass' ? '✓ ' : ticks[i] === 'problem' ? '! ' : ''}${t}`}</Text>
              <View style={styles.row}>
                <Action label={ticks[i] === 'pass' ? 'Passed' : 'Pass'} grow primary={ticks[i] === 'pass'} onPress={() => mark(i, 'pass')} testID={`dev-test-pass-${i}`} />
                <Action label={ticks[i] === 'problem' ? 'Problem (sent)' : 'Problem'} grow onPress={() => mark(i, 'problem')} testID={`dev-test-problem-${i}`} />
              </View>
            </View>
          ))}
          {note ? <Text style={styles.meta}>{note}</Text> : null}
        </>
      ) : null}

      <SectionTitle>Changelog</SectionTitle>
      {fresh.length ? (
        <View style={styles.row}>
          <Text style={[styles.meta, styles.grow]} testID="dev-changelog-new">{`${fresh.length} new since you last looked.`}</Text>
          <Action label="Got it" onPress={gotIt} testID="dev-changelog-seen" />
        </View>
      ) : null}
      {notes.map((n) => (
        <View key={n.release} style={styles.item}>
          <Pressable onPress={() => setOpenRelease(openRelease === n.release ? null : n.release)} accessibilityRole="button" accessibilityLabel={`${n.release} ${n.title}`} testID={`dev-log-${n.release}`}>
            <Text style={styles.itemText}>{`${freshIds.has(n.release) ? 'NEW · ' : ''}${n.release} · ${n.title}`}</Text>
          </Pressable>
          {openRelease === n.release ? n.changes.map((c, i) => <Text key={i} style={styles.meta}>{`• ${c}`}</Text>) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  grow: { flex: 1 },
  meta: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  item: { gap: 8, paddingVertical: 4 },
  itemText: { color: colors.text, fontSize: type.body, fontWeight: '700' },
  done: { color: colors.muted },
  input: { minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
});
