import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from './AppText';
import type { OdooTask, OdooUser } from '../lib/odoo';
import { addDays, formatTime, startOfDay } from '../lib/schedule';
import { useOdoo } from '../lib/useOdoo';
import { colors, bw, fs, radius, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

const FINISHED = /done|complete|closed|cancel/i;

/** What one tech is doing right now, from their jobs today in Odoo. */
export function crewLine(jobs: OdooTask[], now: number): { text: string; tone: 'on' | 'next' | 'free' } {
  const mine = jobs.filter((j) => !FINISHED.test(j.stage)).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
  const working = mine.find((j) => j.arrivedAt !== undefined);
  if (working) return { text: `On job · ${working.name}`, tone: 'on' };
  const next = mine.find((j) => j.start !== undefined && j.start + (j.minutes ?? 60) * 60000 > now);
  if (next) return { text: `${next.start! <= now ? 'Due now' : `Next ${formatTime(next.start!)}`} · ${next.name}`, tone: 'next' };
  return { text: mine.length > 0 ? `${mine.length} job${mine.length === 1 ? '' : 's'}, no time set` : jobs.length > 0 ? 'Done for today' : 'Nothing booked', tone: 'free' };
}

/** Owner Home: each tech and what they are on, from Odoo. Draws nothing when Odoo isn't connected or has no workers. */
export function CrewToday({ now = Date.now }: { now?: () => number }) {
  const styles = useStyles();
  const { client } = useOdoo();
  const [crew, setCrew] = useState<{ tech: OdooUser; jobs: OdooTask[] }[]>([]);
  useEffect(() => {
    if (!client) return;
    let alive = true;
    const day = startOfDay(now());
    Promise.all([client.techs(), client.jobsBetween(day, addDays(day, 1))])
      .then(([techs, jobs]) => alive && setCrew(techs.map((tech) => ({ tech, jobs: jobs.filter((j) => j.assignees.includes(tech.id)) }))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [client, now]);
  if (crew.length === 0) return null;
  return (
    <View style={styles.wrap} testID="today-crew">
      <Text style={styles.head}>CREW TODAY</Text>
      <View style={styles.box}>
        {crew.map(({ tech, jobs }, i) => {
          const line = crewLine(jobs, now());
          return (
            <View key={tech.id} style={[styles.row, i > 0 && styles.sep]} testID={`crew-${tech.id}`}>
              <View style={[styles.dot, line.tone === 'on' && styles.dotOn, line.tone === 'next' && styles.dotNext]} />
              <View style={styles.grow}>
                <Text style={styles.name} numberOfLines={1}>{tech.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{line.text}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: { gap: sp(8) },
  head: { fontSize: fs(13), fontWeight: '800', letterSpacing: 0.6, color: colors.muted },
  box: { borderRadius: radius.card, borderWidth: bw(1), borderColor: colors.line, backgroundColor: colors.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: sp(10), paddingHorizontal: sp(12), paddingVertical: sp(10) },
  sep: { borderTopWidth: bw(1), borderTopColor: colors.line },
  grow: { flex: 1, minWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.muted },
  dotOn: { backgroundColor: colors.selected },
  dotNext: { backgroundColor: colors.warn },
  name: { fontSize: fs(16), fontWeight: '800', color: colors.text },
  meta: { fontSize: fs(14), fontWeight: '600', color: colors.muted },
}));
