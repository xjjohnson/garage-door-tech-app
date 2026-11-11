import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { MeasureField, SectionTitle, Segmented } from '../components/controls';
import { formatJobDate } from '../lib/jobs';
import { formatMoney } from '../lib/prices';
import { formatTime } from '../lib/schedule';
import { useWorkLog } from '../lib/useWorkLog';
import { formatHours, inPeriod, openShift, Shift, shiftMiles, shiftMs, totals, weekOf, workLogCsv } from '../lib/worklog';
import { colors, touch, type } from '../theme';

/** Re-renders every minute so a running clock stays current. */
function useMinuteTick(now: () => number) {
  const [, setT] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setT(now()), 60_000);
    return () => clearInterval(h);
  }, [now]);
}

const toNum = (v: string) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** At the top of Jobs: on the clock or not, and a way in. */
export function ClockButton({ now = Date.now }: { now?: () => number }) {
  const { shifts } = useWorkLog();
  useMinuteTick(now);
  const open = openShift(shifts);
  return (
    <Pressable onPress={() => router.push('/time-log')} accessibilityRole="button" testID="open-time-log" style={({ pressed }) => [styles.button, styles.grow, open && styles.onClock, pressed && styles.pressed]}>
      <Text style={[styles.buttonText, open && styles.onClockText]}>{open ? `On the clock ${formatHours(shiftMs(open, now()))}` : 'Time and miles'}</Text>
    </Pressable>
  );
}

/**
 * Clock in and out with the truck's odometer, see the week's hours, miles and
 * mileage deduction, and send the week to a spreadsheet.
 */
export function WorkLogScreen({ now = Date.now }: { now?: () => number }) {
  const { shifts, centsPerMile, clockIn, clockOut, updateShift, removeShift, setCentsPerMile } = useWorkLog();
  useMinuteTick(now);
  const [odo, setOdo] = useState('');
  const [week, setWeek] = useState(0);
  const t = now();
  const open = openShift(shifts);
  const period = weekOf(t, week);
  const list = inPeriod(shifts, period);
  const sum = totals(list, centsPerMile, t);
  const lastOdo = [...shifts].sort((a, b) => b.start - a.start).find((s) => s.odoEnd !== undefined)?.odoEnd;

  return (
    <View style={styles.stack} testID="time-log">
      <View style={[styles.clock, open && styles.clockOn]} testID="clock-card">
        {open ? (
          <>
            <Text style={styles.clockTitle} testID="clock-status">
              On the clock {formatHours(shiftMs(open, t))}
            </Text>
            <Text style={styles.detail}>
              Since {formatTime(open.start)}
              {open.odoStart !== undefined ? ` · odometer ${open.odoStart}` : ''}
            </Text>
          </>
        ) : (
          <Text style={styles.clockTitle} testID="clock-status">
            Off the clock
          </Text>
        )}
        <MeasureField
          label={open ? 'Odometer now' : 'Odometer at the start'}
          hint={!open && lastOdo !== undefined ? `Last time it read ${lastOdo}.` : 'Optional. Miles are worked out from the two readings.'}
          value={odo}
          onChange={setOdo}
          unit="mi"
          allowFraction={false}
          testID="clock-odometer"
        />
        <Pressable
          onPress={() => {
            if (open) clockOut(toNum(odo));
            else clockIn(toNum(odo));
            setOdo('');
          }}
          accessibilityRole="button"
          testID={open ? 'clock-out' : 'clock-in'}
          style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}
        >
          {({ pressed }) => <Text style={[styles.buttonText, !pressed && styles.primaryText]}>{open ? 'End the day' : 'Start the day'}</Text>}
        </Pressable>
      </View>

      <SectionTitle>Week</SectionTitle>
      <Segmented
        options={[
          { label: 'This week', value: 0 },
          { label: 'Last week', value: -1 },
          { label: '2 weeks ago', value: -2 },
        ]}
        value={week}
        onChange={setWeek}
        testID="time-week"
      />
      <View style={styles.totals} testID="time-totals">
        <Total label="Hours" value={formatHours(sum.ms)} />
        <Total label="Miles" value={String(sum.miles)} />
        <Total label="Deduction" value={formatMoney(sum.deductionCents)} />
      </View>
      {list.length === 0 ? <Text style={styles.note}>No days logged this week.</Text> : null}
      {list.map((s) => (
        <Day key={s.id} s={s} now={t} onMiles={(miles) => updateShift(s.id, { miles })} onRemove={() => removeShift(s.id)} />
      ))}
      {list.length > 0 ? (
        <Pressable
          onPress={() => Share.share({ title: 'Time and miles', message: workLogCsv(list, centsPerMile, t) }).catch(() => undefined)}
          accessibilityRole="button"
          testID="time-share"
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>Send this week (spreadsheet)</Text>
        </Pressable>
      ) : null}

      <SectionTitle>Mileage rate</SectionTitle>
      <MeasureField
        label="Cents a mile"
        hint="The IRS standard business rate was 70¢ for 2025. Set this year's rate."
        value={String(centsPerMile)}
        onChange={(v) => {
          const n = toNum(v);
          if (n !== undefined) setCentsPerMile(n);
        }}
        unit="¢"
        allowFraction={false}
        testID="time-rate"
      />
    </View>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.total}>
      <Text style={styles.totalValue}>{value}</Text>
      <Text style={styles.meta}>{label}</Text>
    </View>
  );
}

function Day({ s, now, onMiles, onRemove }: { s: Shift; now: number; onMiles: (m: number | undefined) => void; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <View style={styles.item} testID={`shift-${s.id}`}>
      <Text style={styles.name}>{formatJobDate(s.start)}</Text>
      <Text style={styles.detail}>
        {formatTime(s.start)} to {s.end !== undefined ? formatTime(s.end) : 'now'} · {formatHours(shiftMs(s, now))}
      </Text>
      {s.odoStart !== undefined || s.odoEnd !== undefined ? (
        <Text style={styles.meta}>
          Odometer {s.odoStart ?? '?'} to {s.odoEnd ?? '?'}
        </Text>
      ) : null}
      <MeasureField label="Miles" value={String(shiftMiles(s))} onChange={(v) => onMiles(v === '' ? undefined : toNum(v))} unit="mi" allowFraction={false} testID={`shift-miles-${s.id}`} />
      {confirm ? (
        <View style={styles.row}>
          <Pressable onPress={onRemove} accessibilityRole="button" testID={`shift-delete-yes-${s.id}`} style={({ pressed }) => [styles.button, styles.grow, styles.danger, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>Delete this day</Text>
          </Pressable>
          <Pressable onPress={() => setConfirm(false)} accessibilityRole="button" style={({ pressed }) => [styles.button, styles.grow, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>Keep</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setConfirm(true)} accessibilityRole="button" testID={`shift-delete-${s.id}`} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Delete</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  clock: { padding: 12, gap: 8, borderRadius: 12, borderWidth: 2, borderColor: colors.border },
  clockOn: { borderWidth: 4, borderColor: colors.selected },
  clockTitle: { fontSize: type.value, fontWeight: '900', color: colors.text },
  totals: { flexDirection: 'row', gap: 8 },
  total: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: colors.card, alignItems: 'center' },
  totalValue: { fontSize: type.value, fontWeight: '900', color: colors.text },
  item: { padding: 12, gap: 6, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  name: { fontSize: type.body, fontWeight: '900', color: colors.text },
  detail: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  primaryText: { color: colors.onSelected },
  onClock: { borderWidth: 4, borderColor: colors.selected },
  onClockText: { fontWeight: '900' },
  danger: { borderColor: colors.caution, borderWidth: 4 },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
});
