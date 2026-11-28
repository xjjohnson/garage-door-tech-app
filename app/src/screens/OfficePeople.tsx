import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../components/AppText';
import { Card, Meta, Note, Title } from '../components/Dept';
import { PageError, usePageRows } from '../components/DeptRows';
import { ChipRow } from '../components/controls';
import { canReadAttendance, hoursText, PersonHours, readPeopleWeek, summarizeHours, weekStart } from '../lib/odooPeople';
import type { OdooClient } from '../lib/odoo';
import { colors, fs, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

const DAY = 86_400_000;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** Reads the people and their punches for the week that starts at `start`. `null` for the whole result means Odoo has no Attendances app for this login. */
function useWeek(client: OdooClient, start: number, now: () => number) {
  const { data, error } = usePageRows(async () => {
    if (!(await canReadAttendance(client))) return null;
    const { people, punches } = await readPeopleWeek(client, start);
    return summarizeHours(people, punches, start, now());
  }, [client, start]);
  return { data, error };
}

const NO_ATTENDANCE = 'Odoo has no Attendances app for this login, so there are no hours to show. Turn it on in Odoo, then come back.';

/** The People tab: how many are clocked in, hours this week, and who is working now. Reads only. */
export function PeopleFront({ client, onOpen, owner, now = Date.now }: { client: OdooClient; onOpen: (id: 'timesheets') => void; owner: boolean; now?: () => number }) {
  const styles = useStyles();
  const start = useMemo(() => weekStart(now()), []);
  const { data, error } = useWeek(client, start, now);
  if (error) return <PageError what="People" error={error} />;
  if (data === undefined) return <Note>Reading Odoo…</Note>;
  if (data === null) return <Note testID="people-no-attendance">{NO_ATTENDANCE}</Note>;
  const working = data.filter((p) => p.in);
  const total = Math.round(data.reduce((n, p) => n + p.hours, 0) * 10) / 10;
  return (
    <View style={styles.stack} testID="people-front">
      <View style={styles.tiles}>
        <Tile big={`${working.length} of ${data.length}`} small="Clocked in now" testID="people-tile-in" />
        <Tile big={`${total.toFixed(0)} h`} small="This week" testID="people-tile-hours" />
      </View>
      <Text style={styles.heading}>Team today</Text>
      <PeopleRows rows={data} now={now} />
      <Text style={styles.heading}>Manage people</Text>
      <Card testID="people-menu">
        <NavLine label="Time sheets" detail="Hours for each day, this week and last" onPress={() => onOpen('timesheets')} testID="people-open-timesheets" />
        {owner ? <NavLine label="People and roles" detail="Who can do what in Odoo and the app" onPress={() => router.push('/management')} testID="people-open-roles" /> : null}
        <Meta>Pay and commission is a separate plan and is not in the app yet.</Meta>
      </Card>
    </View>
  );
}

function PeopleRows({ rows, now }: { rows: PersonHours[]; now: () => number }) {
  const styles = useStyles();
  if (!rows.length) return <Note>No employees in Odoo yet.</Note>;
  return (
    <Card testID="people-rows">
      {[...rows].sort((a, b) => Number(b.in) - Number(a.in) || a.person.name.localeCompare(b.person.name)).map((p) => (
        <View key={p.person.id} style={styles.person} testID={`person-${p.person.id}`}>
          <View style={[styles.dot, p.in && styles.dotOn]} />
          <View style={styles.who}>
            <Text style={styles.name}>{p.person.name}</Text>
            <Text style={styles.sub}>{[p.person.job, p.in && p.since ? `in ${clock(p.since)}` : 'not clocked in'].filter(Boolean).join(' · ')}</Text>
          </View>
          <Text style={styles.hours}>{hoursText(p.hours)}</Text>
        </View>
      ))}
    </Card>
  );
}

/** Hours for each day of one week per person. Reads only: nothing here changes Odoo. */
export function TimeSheets({ client, now = Date.now }: { client: OdooClient; now?: () => number }) {
  const styles = useStyles();
  const [which, setWhich] = useState<'this' | 'last'>('this');
  const thisWeek = useMemo(() => weekStart(now()), []);
  const start = which === 'this' ? thisWeek : thisWeek - 7 * DAY;
  const { data, error } = useWeek(client, start, now);
  return (
    <View style={styles.stack} testID="timesheets">
      <ChipRow options={[{ label: 'This week', value: 'this' as const }, { label: 'Last week', value: 'last' as const }]} value={which} onChange={setWhich} compact testID="timesheets-week" />
      {error ? <PageError what="Time sheets" error={error} /> : data === undefined ? <Note>Reading Odoo…</Note> : data === null ? <Note>{NO_ATTENDANCE}</Note> : (
        <>
          {data.filter((p) => p.hours > 0).length === 0 ? <Note testID="timesheets-empty">No hours were clocked this week.</Note> : null}
          {data.filter((p) => p.hours > 0).map((p) => (
            <Card key={p.person.id} testID={`sheet-${p.person.id}`}>
              <View style={styles.sheetTop}>
                <Title>{p.person.name}</Title>
                <Text style={styles.hours}>{hoursText(p.hours)}</Text>
              </View>
              <Meta>{p.days.map((h, i) => `${DAY_NAMES[i]} ${h > 0 ? h.toFixed(1) : '–'}`).join(' · ')}</Meta>
            </Card>
          ))}
          <Meta>Hours come from the Odoo time clock. Approving and fixing hours is still done in Odoo.</Meta>
        </>
      )}
    </View>
  );
}

function Tile({ big, small, testID }: { big: string; small: string; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.tile} testID={testID}>
      <Text style={styles.big}>{big}</Text>
      <Text style={styles.sub}>{small}</Text>
    </View>
  );
}

function NavLine({ label, detail, onPress, testID }: { label: string; detail: string; onPress: () => void; testID: string }) {
  const styles = useStyles();
  return (
    <Text onPress={onPress} accessibilityRole="button" testID={testID} style={styles.navLine}>
      {label}
      {'  ›\n'}
      <Text style={styles.sub}>{detail}</Text>
    </Text>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(10) },
  tiles: { flexDirection: 'row', gap: sp(8) },
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: sp(10), gap: sp(2) },
  big: { fontSize: fs(22), fontWeight: '800', color: colors.text },
  heading: { fontSize: fs(13), fontWeight: '800', letterSpacing: 1, color: colors.muted, textTransform: 'uppercase', paddingHorizontal: sp(4), paddingTop: sp(4) },
  person: { flexDirection: 'row', alignItems: 'center', gap: sp(10), paddingVertical: sp(6) },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.line },
  dotOn: { backgroundColor: colors.ok },
  who: { flex: 1 },
  name: { fontSize: fs(16), fontWeight: '800', color: colors.text },
  sub: { fontSize: fs(14), fontWeight: '600', color: colors.muted },
  hours: { fontSize: fs(16), fontWeight: '800', color: colors.text },
  sheetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  navLine: { fontSize: fs(17), fontWeight: '800', color: colors.text, paddingVertical: sp(6) },
}));
