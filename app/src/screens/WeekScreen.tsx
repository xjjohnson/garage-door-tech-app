import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Action } from '../components/Buttons';
import { DayStrip } from '../components/DayStrip';
import { VisitCard } from '../components/VisitCard';
import { balance } from '../lib/invoices';
import { cleanNotes } from '../lib/odooJobs';
import { formatMoney } from '../lib/prices';
import { addDays, Appointment, dayLabel, formatTime, onDay, startOfDay, windowLabel } from '../lib/schedule';
import { useInvoices } from '../lib/useInvoices';
import { useVisits } from '../lib/useVisits';
import { useGeocode } from '../lib/useGeocode';
import { useStartJob } from '../lib/useStartJob';
import { useWeather } from '../lib/useWeather';
import { hoursFor, summarize, Summary, weatherKey, weatherText } from '../lib/weather';
import { colors, fs, sp } from '../theme';

/**
 * Home > Week: seven day chips starting today, each with its visit count.
 * Tap a day and its visits show below with the time first. Money owed and
 * Wrap up the day sit under the list.
 */
export function WeekScreen({ now = Date.now }: { now?: () => number }) {
  const appointments = useVisits();
  const { invoices } = useInvoices();
  const startJob = useStartJob();
  const t = now();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfDay(t), i)), [t]);
  const live = useMemo(() => appointments.filter((a) => a.status !== 'cancelled'), [appointments]);
  const counts = days.map((d) => onDay(live, d).length);
  const [picked, setPicked] = useState(days[0]);
  const visits = onDay(live, picked);
  // Weather at each stop of the picked day, when there's signal and the address is on the map; nothing shows otherwise.
  const { points } = useGeocode(useMemo(() => visits.map((a) => a.address), [visits]));
  const hours = useWeather(useMemo(() => Object.values(points).filter((p): p is NonNullable<typeof p> => !!p), [points]));
  const weatherOf = (a: Appointment): Summary | null => {
    const p = points[a.address.trim()];
    return p ? summarize(hoursFor(hours[weatherKey(p)] ?? [], a.start, a.minutes)) : null;
  };
  const owed = invoices.filter((i) => !i.voidedAt).reduce((n, i) => n + balance(i), 0);

  return (
    <View style={styles.stack} testID="week">
      <DayStrip days={days} counts={counts} selected={picked} onSelect={setPicked} testID="week-days" />
      <View style={styles.head}>
        <Text style={styles.day}>{dayLabel(picked, t)}</Text>
        <Text style={styles.count} testID="week-count">
          {visits.length === 0 ? 'Nothing booked' : `${visits.length} visit${visits.length === 1 ? '' : 's'}`}
        </Text>
      </View>
      {visits.map((a) => (
        <VisitCard
          key={a.id}
          top={windowLabel(a).toUpperCase()}
          chip={a.status === 'done' ? 'Done' : 'Scheduled'}
          name={a.name}
          address={a.address}
          what={a.what ? cleanNotes(a.what).split('\n')[0] : ''}
          weather={weatherOf(a) ? weatherText(weatherOf(a)!) : undefined}
          weatherTestID={`week-weather-${a.id}`}
          warn={!!weatherOf(a)?.warn}
          muted={a.status === 'done'}
          onPress={() => startJob(a)}
          testID={`week-visit-${a.id}`}
        />
      ))}
      {visits.length === 0 ? <Action label="Open the schedule" onPress={() => router.push('/schedule')} testID="week-schedule" /> : null}
      {owed > 0 ? <Action label={`${formatMoney(owed)} owed to you · see invoices`} onPress={() => router.push('/sales')} testID="week-owed" /> : null}
      <Action label="Wrap up the day" onPress={() => router.push('/end-of-day')} testID="week-wrap-up" />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: sp(12) },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  day: { fontSize: fs(18), fontWeight: '800', color: colors.text },
  count: { fontSize: fs(14), fontWeight: '700', color: colors.muted },
});
