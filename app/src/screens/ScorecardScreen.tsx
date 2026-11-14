import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Segmented } from '../components/controls';
import { formatMoney } from '../lib/prices';
import { isOwner, odooOwnerData, odooScoreData, OwnerData, ownerSummary, phoneOwnerData, phoneScoreData, SCORE_PERIOD_LABEL, ScoreData, ScorePeriod, scorecard, scorePeriod, TechScore } from '../lib/scorecard';
import { percent } from '../lib/stats';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
import { colors, type } from '../theme';

const PERIODS: ScorePeriod[] = ['week', '30d', 'year'];

/**
 * Owner only: how each tech is doing. Signed in to Odoo as an admin or Field
 * Service manager, every tech's numbers come from Odoo; anyone else signed in
 * is told it's for the owner. Not signed in, it shows this phone's own.
 */
export function ScorecardScreen({ now = Date.now }: { now?: () => number }) {
  const { client, status } = useOdoo();
  const { jobs } = useJobs();
  const { invoices, business } = useInvoices();
  const [period, setPeriod] = useState<ScorePeriod>('30d');
  const [owner, setOwner] = useState<boolean | null>(null);
  const [odoo, setOdoo] = useState<{ since: number; data: ScoreData } | null>(null);
  const [ownerOdoo, setOwnerOdoo] = useState<{ since: number; data: OwnerData } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = now();
  const p = scorePeriod(period, t);

  useEffect(() => {
    let alive = true;
    setOwner(null);
    if (!client) return;
    isOwner(client).then((ok) => alive && setOwner(ok));
    return () => {
      alive = false;
    };
  }, [client]);

  useEffect(() => {
    let alive = true;
    if (!client || !owner) return;
    // The year covers the other periods, so one read does for all three.
    const since = Math.min(scorePeriod('year', t).start, scorePeriod('30d', t).start, scorePeriod('week', t).start);
    if (odoo && odoo.since <= since) return;
    setError(null);
    odooScoreData(client, since)
      .then((data) => alive && setOdoo({ since, data }))
      .then(() => odooOwnerData(client, since))
      .then((data) => alive && setOwnerOdoo({ since, data }))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, owner]);

  if (status === 'loading' || status === 'signingIn' || (client && owner === null)) return <Text style={styles.sub}>Checking your Odoo access…</Text>;
  if (client && !owner) {
    return (
      <View style={styles.card} testID="scorecard-owner-only">
        <Text style={styles.name}>For the owner</Text>
        <Text style={styles.body}>The tech scorecard is for the owner: an Odoo admin or Field Service manager.</Text>
      </View>
    );
  }

  const fromOdoo = !!client;
  const data = fromOdoo ? odoo?.data : phoneScoreData(jobs, invoices, business.name.trim() || 'You');
  const scores = data ? scorecard(data, p) : [];
  const ownerData = fromOdoo ? ownerOdoo?.data : phoneOwnerData(invoices);
  const summary = data && ownerData ? ownerSummary(data.visits, ownerData, p, t) : null;
  return (
    <View style={styles.stack} testID="scorecard">
      <Text style={styles.sub}>{fromOdoo ? 'Owner only · from Odoo jobs, sales orders and invoices' : 'This phone only · sign in to Odoo to see every tech'}</Text>
      <Segmented options={PERIODS.map((x) => ({ label: SCORE_PERIOD_LABEL[x], value: x }))} value={period} onChange={setPeriod} testID="scorecard-period" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {fromOdoo && !odoo && !error ? <Text style={styles.sub}>Reading Odoo…</Text> : null}
      {data && scores.length === 0 ? <Text style={styles.body}>Nothing in this stretch yet.</Text> : null}
      {summary ? <Overview s={summary} fromOdoo={fromOdoo} /> : null}
      {scores.map((s) => (
        <TechCard key={s.tech} s={s} />
      ))}
      <Text style={styles.note}>
        A callback is a new job at the same address within 30 days; it counts for the tech on the first job.{fromOdoo ? ' Quotes won counts the quotes in Odoo, and Better or Best needs the option in the order reference.' : ''}
      </Text>
    </View>
  );
}

function Overview({ s, fromOdoo }: { s: ReturnType<typeof ownerSummary>; fromOdoo: boolean }) {
  return (
    <View style={styles.card} testID="scorecard-overview">
      <Text style={styles.name}>The business</Text>
      <View style={styles.grid}>
        <Stat big={String(s.jobs)} label="Jobs" />
        <Stat big={formatMoney(s.revenue)} label="Invoiced" />
        <Stat big={formatMoney(s.collected)} label="Paid so far" />
      </View>
      <View style={styles.grid}>
        <Stat big={formatMoney(s.openCents)} label={`Open invoices · ${s.openInvoices}`} />
        <Stat big={formatMoney(s.overdueCents)} label={`Past due · ${s.overdueInvoices}`} warn={s.overdueInvoices > 0} />
      </View>
      {fromOdoo ? (
        <View style={styles.stack} testID="scorecard-followups">
          <Text style={styles.meta}>Follow-ups waiting</Text>
          {s.followUps.length === 0 ? <Text style={styles.body}>None open.</Text> : null}
          {s.followUps.map((f) => (
            <Text key={f.tech} style={styles.body}>
              {f.tech}: {f.open} open{f.overdue ? `, ${f.overdue} late` : ''}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TechCard({ s }: { s: TechScore }) {
  return (
    <View style={styles.card} testID={`score-${s.tech}`}>
      <Text style={styles.name}>{s.tech}</Text>
      <View style={styles.grid}>
        <Stat big={percent(s.winRate)} label={`Quotes won${s.quotes ? ` · ${s.won}/${s.quotes}` : ''}`} />
        <Stat big={s.averageTicket === null ? '—' : formatMoney(s.averageTicket)} label="Avg ticket" />
        <Stat big={String(s.callbacks)} label="Callbacks" warn={s.callbacks >= 3} />
      </View>
      <Text style={styles.meta}>
        {s.jobs} job{s.jobs === 1 ? '' : 's'} · Picked Better or Best · {percent(s.betterBest)}
      </Text>
      <View style={styles.track} accessibilityLabel={`Better or Best ${percent(s.betterBest)}`}>
        <View style={[styles.fill, { width: `${Math.round((s.betterBest ?? 0) * 100)}%` }]} />
      </View>
    </View>
  );
}

function Stat({ big, label, warn }: { big: string; label: string; warn?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.big, warn && styles.warn]}>{big}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  sub: { fontSize: 16, fontWeight: '700', color: colors.muted },
  card: { borderWidth: 3, borderColor: colors.border, borderRadius: 16, padding: 14, gap: 10 },
  name: { fontSize: 20, fontWeight: '900', color: colors.text },
  body: { fontSize: type.body, fontWeight: '600', color: colors.text },
  grid: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, gap: 2 },
  big: { fontSize: 24, fontWeight: '900', color: colors.text },
  warn: { color: colors.stop },
  statLabel: { fontSize: 13, fontWeight: '800', color: colors.muted },
  meta: { fontSize: 15, fontWeight: '800', color: colors.muted },
  track: { height: 12, borderRadius: 6, backgroundColor: colors.info, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.selected },
  note: { fontSize: 15, fontWeight: '600', color: colors.muted },
  error: { fontSize: 16, fontWeight: '800', color: colors.stop },
});
