import * as Updates from 'expo-updates';
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { Action } from '../components/Buttons';
import { ChipRow, SectionTitle } from '../components/controls';
import { BUILD_INFO, UPDATE_CHANNEL } from '../lib/appVersion';
import { onDevFlags, pretendOffline, setPretendOffline } from '../lib/devFlags';
import { formatLog, log, LogEntry, Logger, stamp } from '../lib/log';
import { checkAndFetchOta, OtaApi, OtaCheck } from '../lib/otaUpdate';
import { describePending } from '../lib/pending';
import { shareTextFile } from '../lib/shareText';
import { ChannelApi, readBeta, setBeta } from '../lib/updateChannel';
import { useLog } from '../lib/useLog';
import { useOdoo } from '../lib/useOdoo';
import { usePending } from '../lib/usePending';
import { colors, touch, type } from '../theme';

type Filter = 'all' | 'errors' | 'odoo';
const FILTERS = [
  { label: 'All', value: 'all' as const },
  { label: 'Problems', value: 'errors' as const },
  { label: 'Odoo', value: 'odoo' as const },
];

const SHOWN = 150;

interface Props {
  logger?: Logger;
  updates?: OtaApi & ChannelApi;
  restart?: () => Promise<unknown>;
  share?: (name: string, text: string) => Promise<boolean>;
  buildInfo?: string;
  channel?: string | null;
}

const CHECK_NOTE: Record<OtaCheck, string> = {
  off: 'Updates are off in this build.',
  current: 'No newer update on this channel.',
  ready: 'Update downloaded. Restart to use it.',
  unknown: "Couldn't reach the update server.",
};

/**
 * The hidden Developer screen (tap the version in Settings 7 times): what's
 * running, the Odoo connection, what's waiting to send, the app's log with
 * a Share button, beta updates, and switches for testing.
 */
export function DeveloperScreen({ logger = log, updates = Updates, restart = () => Updates.reloadAsync(), share = shareTextFile, buildInfo = BUILD_INFO, channel = UPDATE_CHANNEL }: Props) {
  const odoo = useOdoo();
  const pending = usePending();
  const entries = useLog(logger);
  const [filter, setFilter] = useState<Filter>('all');
  const [note, setNote] = useState<string | null>(null);
  /** Notes about updates, shown under the update buttons rather than by the log. */
  const [updateNote, setUpdateNote] = useState<string | null>(null);
  const [ping, setPing] = useState<string | null>(null);
  const [beta, setBetaOn] = useState<boolean | null>(null);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [offline, setOffline] = useState(pretendOffline());

  useEffect(() => {
    readBeta().then(setBetaOn);
    return onDevFlags(() => setOffline(pretendOffline()));
  }, []);

  const shown = useMemo(() => {
    const keep = (e: LogEntry) => (filter === 'errors' ? e.level !== 'info' : filter === 'odoo' ? e.area === 'odoo' || e.area === 'sync' : true);
    return entries.filter(keep).slice(-SHOWN).reverse();
  }, [entries, filter]);
  const problems = entries.filter((e) => e.level !== 'info').length;

  const s = odoo.client?.session;
  const odooLine = odoo.status === 'signedIn' && s ? `${s.name || s.login} · ${s.url.replace(/^https?:\/\//, '')} · database ${s.db}` : odoo.status === 'loading' || odoo.status === 'signingIn' ? 'Signing in...' : 'Not signed in';

  const testOdoo = async () => {
    if (!odoo.client) {
      setPing('Sign in to Odoo first (Settings › Odoo).');
      return;
    }
    const started = Date.now();
    try {
      await odoo.client.call('res.users', 'read', [[odoo.client.session.uid]], { fields: ['name'] });
      setPing(`Odoo answered in ${Date.now() - started} ms.`);
    } catch (e) {
      setPing(`Odoo didn't answer: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const checkUpdate = async () => {
    setUpdateNote('Checking...');
    const r = await checkAndFetchOta(updates);
    logger.info('update', `manual check: ${r}`);
    setUpdateNote(CHECK_NOTE[r]);
  };

  const toggleBeta = async (on: boolean) => {
    const ok = await setBeta(on, updates);
    if (!ok) {
      setUpdateNote("This build can't switch update channels (Expo Go or a test build).");
      return;
    }
    logger.info('update', `beta updates ${on ? 'on' : 'off'}`);
    setBetaOn(on);
    setNeedsRestart(true);
  };

  const shareLog = async () => {
    const text = formatLog(logger.entries(), [
      'Johnsons app log',
      buildInfo,
      `Channel: ${beta ? 'beta' : channel ?? 'none'} · ${Platform.OS} ${String(Platform.Version)}`,
      `Odoo: ${odooLine}`,
      `Waiting to send: ${pending.total ? describePending(pending) : 'nothing'}`,
    ]);
    const ok = await share(`johnsons-log-${new Date().toISOString().slice(0, 10)}.txt`, text).catch(() => false);
    if (!ok) setNote("Couldn't open sharing on this phone.");
  };

  return (
    <View style={styles.stack} testID="developer">
      <View style={styles.card} testID="dev-status">
        <Line k="Running" v={buildInfo} />
        <Line k="Updates" v={beta === null ? '...' : beta ? 'Beta (gets releases first)' : `Everyone (${channel ?? 'none'})`} />
        <Line k="Odoo" v={odooLine} />
        <Line k="To send" v={pending.total ? describePending(pending) : 'Nothing, all in Odoo'} testID="dev-pending" />
      </View>

      <SectionTitle>Beta updates</SectionTitle>
      <View style={styles.switchRow}>
        <Text style={[styles.label, styles.grow]}>Get new releases first</Text>
        <Switch value={!!beta} onValueChange={toggleBeta} accessibilityLabel="Beta updates" testID="dev-beta" trackColor={{ true: colors.brand, false: colors.info }} thumbColor={colors.bg} style={styles.switch} />
      </View>
      <Text style={styles.meta}>New releases reach this phone as soon as they're merged. Everyone else gets them once they're promoted.</Text>
      {needsRestart ? (
        <Action
          label="Restart to switch"
          primary
          onPress={() =>
            restart().catch((e) => {
              logger.warn('update', `restart failed: ${e instanceof Error ? e.message : String(e)}`);
              setUpdateNote("Couldn't restart from here. Swipe the app away and open it again to switch.");
            })
          }
          testID="dev-restart"
        />
      ) : null}
      <View style={styles.row}>
        <Action label="Check for update" grow onPress={checkUpdate} testID="dev-check-update" />
      </View>
      {updateNote ? (
        <Text style={styles.note} testID="dev-update-note" accessibilityLiveRegion="polite">
          {updateNote}
        </Text>
      ) : null}

      <SectionTitle>Odoo</SectionTitle>
      <View style={styles.row}>
        <Action label="Test Odoo" grow onPress={testOdoo} testID="dev-test-odoo" />
      </View>
      {ping ? (
        <Text style={styles.note} testID="dev-ping">
          {ping}
        </Text>
      ) : null}
      <View style={styles.switchRow}>
        <Text style={[styles.label, styles.grow]}>Pretend offline</Text>
        <Switch
          value={offline}
          onValueChange={(on) => {
            setPretendOffline(on);
            logger.info('dev', `pretend offline ${on ? 'on' : 'off'}`);
          }}
          accessibilityLabel="Pretend offline"
          testID="dev-offline"
          trackColor={{ true: colors.stop, false: colors.info }}
          thumbColor={colors.bg}
          style={styles.switch}
        />
      </View>
      <Text style={styles.meta}>Every Odoo call fails as if there were no signal, until you turn it off or restart.</Text>

      <SectionTitle>Log</SectionTitle>
      <Text style={styles.meta}>Last 7 days on this phone. Passwords and keys are blanked out.</Text>
      <View style={styles.row}>
        <Action label="Share log" primary grow onPress={shareLog} testID="dev-share-log" />
        <Action label="Clear" onPress={() => logger.clear()} testID="dev-clear-log" />
      </View>
      {note ? (
        <Text style={styles.note} testID="dev-note" accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}
      <ChipRow options={FILTERS.map((f) => (f.value === 'errors' ? { ...f, label: `Problems ${problems}` } : f))} value={filter} onChange={setFilter} compact testID="dev-filter" />
      <View style={styles.log} testID="dev-log">
        {shown.length === 0 ? <Text style={styles.logLine}>Nothing logged yet.</Text> : null}
        {shown.map((e, i) => (
          <Text key={`${e.t}-${i}`} style={[styles.logLine, e.level === 'error' && styles.logError, e.level === 'warn' && styles.logWarn]} selectable>
            {stamp(e.t)} {e.area} {e.msg}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Line({ k, v, testID }: { k: string; v: string; testID?: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.k}>{k}</Text>
      <Text style={styles.v} selectable testID={testID}>
        {v}
      </Text>
    </View>
  );
}

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  stack: { gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 6 },
  line: { flexDirection: 'row', gap: 8 },
  k: { width: 82, fontSize: 15, fontWeight: '700', color: colors.muted },
  v: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  label: { fontSize: type.body, fontWeight: '800', color: colors.text },
  meta: { fontSize: 15, fontWeight: '600', color: colors.muted },
  note: { fontSize: 16, fontWeight: '700', color: colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', minHeight: touch.min, gap: 8 },
  switch: { transform: [{ scale: 1.3 }] },
  log: { backgroundColor: colors.text, borderRadius: 12, padding: 10, gap: 4 },
  logLine: { fontFamily: mono, fontSize: 12, lineHeight: 17, color: '#E3E3E3' },
  logWarn: { color: colors.safety },
  logError: { color: '#FF8A80' },
});
