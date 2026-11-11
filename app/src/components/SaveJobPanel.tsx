import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { JobInputs, jobName } from '../lib/jobs';
import { useJobs } from '../lib/useJobs';
import { colors, touch, type } from '../theme';
import { BarSummary } from './CalcLayout';
import { JobDetailsSheet } from './JobDetailsSheet';

const SAVED_MS = 4000;

/**
 * Under a calculator's results: save these inputs as a job, or, when the
 * screen was opened from a saved job, save the changes back to it.
 */
export function SaveJobPanel({
  inputs,
  summary,
  ready,
  linkedId,
  onLink,
  testID,
}: {
  inputs: JobInputs;
  summary: BarSummary;
  /** False until the calculator has an answer to save. */
  ready: boolean;
  /** The saved job this screen's inputs came from, if any. */
  linkedId?: string;
  onLink: (id: string | undefined) => void;
  testID?: string;
}) {
  const { jobs, add, updateInputs } = useJobs();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const linked = linkedId ? jobs.find((j) => j.id === linkedId) : undefined;

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), SAVED_MS);
    return () => clearTimeout(t);
  }, [saved]);

  const answer = { title: summary.title, detail: summary.detail };

  return (
    <View style={styles.box} testID={testID}>
      {linked ? (
        <Text style={styles.linked} testID="linked-job">
          Job: {jobName(linked)}
        </Text>
      ) : null}
      {!ready ? <Text style={styles.hint}>Enter the measurements to save this as a job.</Text> : null}
      {saved ? (
        <Text style={styles.saved} accessibilityLiveRegion="polite" testID="job-saved">
          {saved}
        </Text>
      ) : null}
      {linked ? (
        <View style={styles.row}>
          <Button
            label="Save changes"
            primary
            grow
            disabled={!ready}
            onPress={() => {
              updateInputs(linked.id, inputs, answer);
              setSaved(`Saved to ${jobName(linked)}`);
            }}
            testID="job-update"
          />
          <Button label="New job" grow disabled={!ready} onPress={() => setSheetOpen(true)} testID="job-new" />
        </View>
      ) : (
        <Button label="Save as a job" primary disabled={!ready} onPress={() => setSheetOpen(true)} testID="job-save" />
      )}
      <JobDetailsSheet
        visible={sheetOpen}
        title="Save as a job"
        onCancel={() => setSheetOpen(false)}
        onSave={(details) => {
          const job = add(inputs, details, answer);
          setSheetOpen(false);
          onLink(job.id);
          setSaved(`Saved to Jobs: ${jobName(job)}`);
        }}
      />
    </View>
  );
}

function Button({ label, onPress, primary, disabled, grow, testID }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean; grow?: boolean; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [styles.button, grow && styles.grow, primary && styles.primary, disabled && styles.off, pressed && styles.pressed]}
    >
      {({ pressed }) => <Text style={[styles.buttonText, primary && !disabled && styles.primaryText, disabled && styles.offText, pressed && styles.pressedText]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, paddingTop: 14, marginTop: 4, borderTopWidth: 3, borderTopColor: colors.border },
  linked: { fontSize: type.body, fontWeight: '900', color: colors.text },
  hint: { fontSize: 16, color: colors.muted },
  saved: { fontSize: type.body, fontWeight: '800', color: colors.text, backgroundColor: colors.safety, padding: 10, borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  off: { backgroundColor: colors.card, borderColor: colors.muted, borderStyle: 'dashed' },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  primaryText: { color: colors.onSelected },
  offText: { color: colors.muted },
  pressedText: { color: colors.text },
});
