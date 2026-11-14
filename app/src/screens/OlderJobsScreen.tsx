import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Action } from '../components/Buttons';
import { formatJobDate, jobName } from '../lib/jobs';
import { olderJobs } from '../lib/odooJobs';
import { useJobs } from '../lib/useJobs';
import { useJobsSince } from '../lib/useJobsSince';
import { colors, touch, type } from '../theme';

/**
 * Open jobs saved before the phone started sending jobs to Odoo. None go on
 * their own: the tech ticks the ones that are real work, and the rest stay
 * on the phone only.
 */
export function OlderJobsScreen() {
  const { jobs, setSendToOdoo } = useJobs();
  const since = useJobsSince();
  const list = olderJobs(jobs, since);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (list.length === 0) {
    return (
      <Text style={styles.meta} testID="older-none">
        Every older job has been sent or kept on the phone.
      </Text>
    );
  }
  const done = () => {
    setSendToOdoo(Object.fromEntries(list.map((j) => [j.id, picked.has(j.id)])));
    router.back();
  };
  return (
    <View style={styles.stack} testID="older-jobs">
      <Text style={styles.meta}>
        These open jobs were saved before the app sent jobs to Odoo. Tick the ones that are real work to make them Field Service orders. The rest stay on this phone only.
      </Text>
      {list.map((j) => {
        const on = picked.has(j.id);
        return (
          <Pressable
            key={j.id}
            onPress={() => toggle(j.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            testID={`older-${j.id}`}
            style={({ pressed }) => [styles.card, on && styles.cardOn, pressed && styles.pressed]}
          >
            <Text style={styles.name}>
              {on ? '☑' : '☐'} {jobName(j)}
            </Text>
            <Text style={styles.meta}>{[j.what, j.address, `saved ${formatJobDate(j.savedAt)}`].filter(Boolean).join(' · ')}</Text>
          </Pressable>
        );
      })}
      <Action
        label={picked.size === 0 ? 'Keep them all on the phone' : `Send ${picked.size} to Odoo, keep ${list.length - picked.size} on the phone`}
        primary
        onPress={done}
        testID="older-done"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  card: { minHeight: touch.min, padding: 12, gap: 4, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card },
  cardOn: { borderWidth: 4, backgroundColor: colors.bg },
  pressed: { backgroundColor: colors.info },
  name: { fontSize: type.body, fontWeight: '800', color: colors.text },
});
