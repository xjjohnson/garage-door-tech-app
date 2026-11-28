import { View } from 'react-native';
import { Text } from '../components/AppText';
import { useBadges } from '../lib/useBadges';
import { dispatchTotal } from '../lib/deptBadges';
import { colors, fs, sp } from '../theme';
import { DispatchScreen, Part } from './DispatchScreen';
import { makeStyles } from '../lib/makeStyles';

const GROUPS: { part: Part; title: string; urgent: boolean }[] = [
  { part: 'late', title: 'Running late', urgent: true },
  { part: 'unassigned', title: 'Not assigned', urgent: true },
  { part: 'double', title: 'Double booked', urgent: false },
  { part: 'notime', title: 'No time set', urgent: false },
];

/**
 * Needs you: the four problem lists on one page, most urgent first (late, not
 * assigned, then double booked and no time). Each job keeps the buttons it
 * has on its own page (Assign, Change, call, text). A heading shows its count
 * from Odoo; red for the urgent two, amber for the others.
 */
export function NeedsYouScreen() {
  const styles = useStyles();
  const b = useBadges();
  const count: Record<string, number> = { late: b.dispatch.late, unassigned: b.dispatch.unassigned, double: b.dispatch.double, notime: b.dispatch.noTime };
  const total = dispatchTotal(b);
  return (
    <View style={styles.stack} testID="needs-you">
      <Text style={styles.sum}>{total === 0 ? 'Nothing needs you right now.' : `${total} job${total === 1 ? '' : 's'} need you, most urgent first`}</Text>
      {GROUPS.map((g) => (
        <View key={g.part} testID={`needs-${g.part}`}>
          <View style={styles.head}>
            <Text style={styles.title}>{g.title}</Text>
            {count[g.part] > 0 ? (
              <View style={[styles.pill, g.urgent ? styles.red : styles.amber]}>
                <Text style={[styles.pillText, g.urgent ? styles.redText : styles.amberText]}>{count[g.part]}</Text>
              </View>
            ) : null}
          </View>
          <DispatchScreen part={g.part} />
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(14) },
  sum: { fontSize: fs(16), fontWeight: '700', color: colors.text },
  head: { flexDirection: 'row', alignItems: 'center', gap: sp(8), marginBottom: sp(6) },
  title: { fontSize: fs(16), fontWeight: '800', color: colors.text },
  pill: { minWidth: 26, paddingHorizontal: sp(8), paddingVertical: sp(2), borderRadius: 13, alignItems: 'center' },
  red: { backgroundColor: '#FDE4E4' },
  amber: { backgroundColor: '#FDF0D6' },
  pillText: { fontSize: fs(14), fontWeight: '800' },
  redText: { color: '#B3202A' },
  amberText: { color: '#8A5A00' },
}));
