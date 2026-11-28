import * as Updates from 'expo-updates';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, Switch, View } from 'react-native';
import type { OdooClient } from '../lib/odoo';
import { Text, TextInput } from '../components/AppText';
import { Action, NavRow } from '../components/Buttons';
import { ChipRow, SectionTitle } from '../components/controls';
import { DatabaseSwitcher } from '../components/DatabaseSwitcher';
import { DevTestTools } from '../components/DevTestTools';
import { OdooSignInForm } from '../components/OdooSignInForm';
import { BUILD_INFO, UPDATE_CHANNEL } from '../lib/appVersion';
import { releaseFrom } from '../lib/buildInfo';
import { clearLocalCache, CLEAR_CACHE_WARNING } from '../lib/clearCache';
import { ageLabel, bytesLabel, checkCounts, photoUse, diagnosticsText, filterLog, LogFilter, queueRows, recentProblems, STUCK_MS, storageLabel, UpdateDetails, updateLines } from '../lib/devInfo';
import { callTrace, clearCallTrace, onCallTrace, slowest } from '../lib/callTrace';
import { onDevFlags, pretendOffline, setPretendOffline } from '../lib/devFlags';
import { FEATURE_FLAGS, featureOn, loadFeatureFlags, onFeatureFlags, setFeature } from '../lib/featureFlags';
import { checkNetwork, NetResult } from '../lib/networkCheck';
import { useAttachments } from '../lib/useAttachments';
import { formatLog, log, Logger, stamp } from '../lib/log';
import { checkAndFetchOta, OtaApi, OtaCheck } from '../lib/otaUpdate';
import { appsFound } from '../lib/odoo';
import { describePending } from '../lib/pending';
import { isOwner } from '../lib/scorecard';
import { CheckResult, runSetupCheck } from '../lib/setupCheck';
import { onSyncStatus, requestSyncNow, syncStatus } from '../lib/syncNow';
import { shareTextFile } from '../lib/shareText';
import { ChannelApi, readBeta, setBeta } from '../lib/updateChannel';
import { useLog } from '../lib/useLog';
import { useOdoo } from '../lib/useOdoo';
import { usePending, usePendingItems } from '../lib/usePending';
import { colors, touch, type, bw, fs, rad, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

type Filter = LogFilter;
const FILTERS = [
  { label: 'All', value: 'all' as const },
  { label: 'Problems', value: 'errors' as const },
  { label: 'Warnings', value: 'warnings' as const },
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
  /** Runs the Odoo setup check; tests pass a fake. */
  runCheck?: (c: OdooClient | null) => Promise<CheckResult[]>;
  /** Which update is running; tests pass their own. */
  details?: UpdateDetails;
  /** Free and total space on the phone, in bytes. */
  storage?: () => { free: number | null; total: number | null };
  now?: () => number;
  /** Runs the network check; tests pass a fake. */
  network?: (odooUrl: string | null) => Promise<NetResult[]>;
  /** Size of a saved photo in bytes, or null. */
  fileSize?: (uri: string) => number | null;
}

function deviceFileSize(uri: string): number | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { File } = require('expo-file-system') as typeof import('expo-file-system');
    const f = new File(uri);
    return f.exists ? f.size ?? null : null;
  } catch {
    return null;
  }
}

/** Read once: what's running doesn't change until the app restarts. */
const RUNNING: UpdateDetails = {
  release: releaseFrom(Updates.manifest) ?? Updates.runtimeVersion ?? 'development',
  runtimeVersion: Updates.runtimeVersion ?? null,
  updateId: Updates.updateId ?? null,
  publishedAt: Updates.createdAt ?? null,
  channel: UPDATE_CHANNEL,
  embedded: !!Updates.isEmbeddedLaunch,
};

function deviceStorage() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Paths } = require('expo-file-system') as typeof import('expo-file-system');
    return { free: Paths.availableDiskSpace ?? null, total: Paths.totalDiskSpace ?? null };
  } catch {
    return { free: null, total: null };
  }
}

function phoneName(): string {
  const c = (Platform as unknown as { constants?: { Brand?: string; Model?: string } }).constants;
  const model = [c?.Brand, c?.Model].filter(Boolean).join(' ');
  return `${model ? `${model} · ` : ''}${Platform.OS} ${String(Platform.Version)}`;
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
export function DeveloperScreen({ logger = log, updates = Updates, restart = () => Updates.reloadAsync(), share = shareTextFile, buildInfo = BUILD_INFO, channel = UPDATE_CHANNEL, runCheck = runSetupCheck, details = RUNNING, storage = deviceStorage, now = Date.now, network, fileSize = deviceFileSize }: Props) {
  const styles = useStyles();
  const odoo = useOdoo();
  const pending = usePending();
  const items = usePendingItems();
  const [sync, setSync] = useState(syncStatus());
  const [setup, setSetup] = useState<CheckResult[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [owner, setOwner] = useState(false);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [accountNote, setAccountNote] = useState<string | null>(null);
  const [signInAgain, setSignInAgain] = useState(false);
  const entries = useLog(logger);
  const [filter, setFilter] = useState<Filter>('all');
  const [note, setNote] = useState<string | null>(null);
  /** Notes about updates, shown under the update buttons rather than by the log. */
  const [updateNote, setUpdateNote] = useState<string | null>(null);
  const [ping, setPing] = useState<string | null>(null);
  const [beta, setBetaOn] = useState<boolean | null>(null);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [offline, setOffline] = useState(pretendOffline());
  const [, setFlagTick] = useState(0);
  const [calls, setCalls] = useState(callTrace());
  const [net, setNet] = useState<NetResult[] | null>(null);
  const [netBusy, setNetBusy] = useState(false);
  const [showCalls, setShowCalls] = useState(false);
  const { photos } = useAttachments();

  useEffect(() => {
    readBeta().then(setBetaOn);
    const off = onDevFlags(() => {
      setOffline(pretendOffline());
    });
    const offSync = onSyncStatus(() => setSync(syncStatus()));
    const offCalls = onCallTrace(() => setCalls(callTrace()));
    const offFlags = onFeatureFlags(() => setFlagTick((n) => n + 1));
    loadFeatureFlags().catch(() => undefined);
    return () => {
      off();
      offSync();
      offCalls();
      offFlags();
    };
  }, []);

  const client = odoo.client;
  const runSetup = async () => {
    setChecking(true);
    const r = await runCheck(client).catch((): CheckResult[] => [{ id: 'error', label: 'Odoo', state: 'missing', detail: "Couldn't reach Odoo.", fix: 'Check the signal and try again.' }]);
    setSetup(r);
    setChecking(false);
  };
  useEffect(() => {
    if (!client) {
      setSetup(null);
      setOwner(false);
      return;
    }
    let alive = true;
    isOwner(client).then((o) => alive && setOwner(o), () => undefined);
    runCheck(client).then((r) => alive && setSetup(r), () => undefined);
    return () => {
      alive = false;
    };
  }, [client, runCheck]);

  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [cacheNote, setCacheNote] = useState<string | null>(null);
  const filtered = useMemo(() => filterLog(entries, filter, query), [entries, filter, query]);
  const shown = useMemo(() => filtered.slice(-SHOWN).reverse(), [filtered]);
  const problems = entries.filter((e) => e.level !== 'info').length;

  const s = odoo.client?.session;
  const odooLine = odoo.status === 'signedIn' && s ? `${s.name || s.login} · ${s.url.replace(/^https?:\/\//, '')} · database ${s.db}` : odoo.status === 'loading' || odoo.status === 'signingIn' ? 'Signing in...' : 'Not signed in';

  const testOdoo = async () => {
    if (!odoo.client) {
      setPing('Sign in to Odoo first (Odoo account section above).');
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
    setLastChecked(now());
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

  const shareDiagnostics = async () => {
    const t = now();
    const st = storage();
    const sess = client?.session;
    const text = diagnosticsText({
      buildInfo,
      update: details,
      beta,
      phone: phoneName(),
      odoo: sess ? { url: sess.url, db: sess.db, user: sess.name || sess.login, role: owner ? 'owner' : 'tech' } : null,
      appsFound: sess ? appsFound(sess) : [],
      setup,
      pendingText: pending.total ? describePending(pending) : 'nothing',
      sync: { lastOkAt: sync.lastOkAt, lastError: sync.lastError },
      freeStorage: storageLabel(st.free, st.total),
      errors24h: recentProblems(logger.entries(), t),
      now: t,
      entries: logger.entries(),
    });
    const ok = await share(`johnsons-diagnostics-${new Date(t).toISOString().slice(0, 10)}.txt`, text).catch(() => false);
    if (!ok) setNote("Couldn't open sharing on this phone.");
  };

  const runNetwork = async () => {
    setNetBusy(true);
    const url = client?.session.url ?? null;
    const r = await (network ?? ((u) => checkNetwork({ odooUrl: u, offline: pretendOffline() })))(url).catch((): NetResult[] => [{ name: 'Check', state: 'failed', ms: null, detail: "Couldn't run the check." }]);
    setNet(r);
    setNetBusy(false);
    logger.info('dev', `network check: ${r.map((x) => `${x.name} ${x.state}${x.ms !== null ? ` ${x.ms} ms` : ''}`).join(', ')}`);
  };

  const use = useMemo(() => photoUse(photos, fileSize), [photos, fileSize]);

  const shareLines = async (lines: typeof entries, name: string) => {
    const text = formatLog(lines, ['Johnsons app log (part)', buildInfo, `${lines.length} line${lines.length === 1 ? '' : 's'}${query.trim() ? ` matching "${query.trim()}"` : ''}`]);
    const ok = await share(`${name}-${new Date(now()).toISOString().slice(0, 10)}.txt`, text).catch(() => false);
    if (!ok) setNote("Couldn't open sharing on this phone.");
  };

  const clearCache = async () => {
    setConfirmClear(false);
    const n = await clearLocalCache();
    logger.info('dev', `cleared local cache (${n} kinds)`);
    if (client) {
      setCacheNote(`Cleared ${n} saved lists. Downloading them again...`);
      await requestSyncNow().catch(() => undefined);
      setCacheNote(`Cleared ${n} saved lists and downloaded them again. Nothing waiting to send was touched.`);
    } else {
      setCacheNote(`Cleared ${n} saved lists. Sign in to Odoo to download them again. Nothing waiting to send was touched.`);
    }
  };

  const redownload = async () => {
    setCacheNote('Downloading lists...');
    await requestSyncNow().catch(() => undefined);
    setCacheNote('Lists downloaded again from Odoo.');
  };

  const refreshAccess = async () => {
    setAccountNote('Refreshing...');
    const ok = await odoo.refresh();
    setAccountNote(ok ? 'Signed in again. Access re-read from Odoo.' : 'Couldn\'t refresh. Sign in again below.');
    if (!ok) setSignInAgain(true);
  };

  const t0 = now();
  const rows = queueRows(items);
  const counts = setup ? checkCounts(setup) : null;
  const errors24h = recentProblems(entries, t0);
  const sessionApps = s ? appsFound(s) : [];

  return (
    <View style={styles.stack} testID="developer">
      <View style={styles.card} testID="dev-status">
        <Line k="Running" v={buildInfo} />
        <Line k="Updates" v={beta === null ? '...' : beta ? 'Beta (gets releases first)' : `Everyone (${channel ?? 'none'})`} />
        <Line k="Odoo" v={odooLine} />
        <Line k="To send" v={pending.total ? describePending(pending) : 'Nothing, all in Odoo'} testID="dev-pending" />
        <Line k="Problems" v={`${errors24h} in the last 24 hours`} testID="dev-errors" />
      </View>

      <SectionTitle>Odoo account (backup)</SectionTitle>
      <View style={styles.card} testID="dev-account">
        {odoo.status === 'signedIn' && s ? (
          <>
            <Line k="Signed in" v={s.name || s.login} />
            <Line k="Address" v={s.url.replace(/^https?:\/\//, '')} />
            <Line k="Database" v={s.db} />
            <Line k="Role" v={owner ? 'Owner' : 'Tech'} />
            <Line k="Apps" v={sessionApps.length ? sessionApps.join(', ') : 'none found'} testID="dev-apps" />
            <Line k="Worker" v={s.kind === 'oca' ? (s.me ? 'Field Service worker' : 'Not a Field Service worker') : s.kind === 'task' ? 'Project tasks' : 'No jobs app'} />
          </>
        ) : (
          <Text style={styles.v} testID="dev-account-state">
            {odoo.status === 'signingIn' || odoo.status === 'loading' ? 'Signing in...' : 'Not signed in'}
          </Text>
        )}
      </View>
      {odoo.status === 'signedIn' ? (
        <View style={styles.row}>
          <Action label="Refresh my access" grow onPress={refreshAccess} testID="dev-refresh-access" />
          <Action label="Sign in again" grow onPress={() => setSignInAgain((v) => !v)} testID="dev-signin-again" />
          <Action
            label="Sign out"
            grow
            onPress={() => {
              odoo.signOut();
              logger.info('dev', 'signed out of Odoo');
              setAccountNote(null);
            }}
            testID="dev-signout"
          />
        </View>
      ) : null}
      {accountNote ? (
        <Text style={styles.note} testID="dev-account-note" accessibilityLiveRegion="polite">
          {accountNote}
        </Text>
      ) : null}
      {odoo.status === 'signedIn' ? <Text style={styles.meta}>Signing out keeps everything on this phone, including anything not yet sent to Odoo.</Text> : null}
      {odoo.status !== 'signedIn' || signInAgain ? <OdooSignInForm intro={false} testID="dev-signin-form" /> : null}

      <SectionTitle>Database</SectionTitle>
      <DatabaseSwitcher pendingText={pending.total ? describePending(pending) : ''} restart={restart} />

      <SectionTitle>Sync</SectionTitle>
      <View style={styles.card} testID="dev-sync">
        <Line k="Last good" v={sync.lastOkAt ? ageLabel(sync.lastOkAt, t0) : 'None since the app opened'} testID="dev-sync-ok" />
        <Line k="Last problem" v={sync.lastError ? `${sync.lastError} (${sync.lastErrorAt ? ageLabel(sync.lastErrorAt, t0) : ''})` : 'None'} testID="dev-sync-error" />
        <Line k="Now" v={sync.running ? 'Syncing...' : pending.total ? 'Retries on its own every few minutes and when the app opens' : 'Nothing waiting'} />
      </View>
      <View style={styles.row}>
        <Action label={sync.running ? 'Syncing...' : 'Sync now'} grow disabled={sync.running} onPress={() => requestSyncNow().catch(() => undefined)} testID="dev-sync-now" />
      </View>

      <SectionTitle>Waiting for Odoo</SectionTitle>
      {rows.length === 0 ? (
        <Text style={styles.meta} testID="dev-queue-empty">
          Nothing waiting. Everything is in Odoo.
        </Text>
      ) : (
        <View style={styles.card} testID="dev-queue">
          {rows.map((r) => {
            const stuck = r.oldest !== null && t0 - r.oldest > STUCK_MS;
            return (
              <View key={r.kind} style={styles.line}>
                <Text style={styles.k}>{r.kind}</Text>
                <Text style={[styles.v, stuck && styles.logErrorText]} testID={`dev-queue-${r.kind.toLowerCase()}`}>
                  {r.count} · oldest {ageLabel(r.oldest, t0)}
                  {stuck ? ' · stuck?' : ''}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      {pending.total ? <NavRow label="See what's waiting" detail="Each one, and Sync now" href="/odoo-waiting" testID="dev-waiting" /> : null}

      <SectionTitle>Version and update</SectionTitle>
      <View style={styles.card} testID="dev-update-details">
        {updateLines(details, lastChecked, t0).map(([k, v]) => (
          <Line key={k} k={k} v={v} />
        ))}
      </View>

      <SectionTitle>Beta updates</SectionTitle>
      <View style={styles.switchRow}>
        <Text style={[styles.label, styles.grow]}>Get new releases first</Text>
        <Switch value={!!beta} onValueChange={toggleBeta} accessibilityLabel="Beta updates" testID="dev-beta" trackColor={{ true: colors.selected, false: colors.info }} thumbColor={colors.bg} style={styles.switch} />
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
      <View style={styles.card} testID="dev-setup-summary">
        <Text style={styles.v}>
          {!client ? 'Sign in to run the setup check.' : checking || !counts ? 'Checking Odoo...' : `${counts.ok} ready · ${counts.warn} to look at · ${counts.missing} missing`}
        </Text>
      </View>
      {setup && client
        ? setup
            .filter((r) => r.state !== 'ok')
            .map((r) => (
              <View key={r.id} style={styles.card} testID={`dev-setup-fix-${r.id}`}>
                <Text style={styles.v}>{`${r.state === 'missing' ? 'Missing' : 'Look at'}: ${r.label}`}</Text>
                {r.fix ? <Text style={styles.meta}>{`How to fix: ${r.fix}`}</Text> : null}
              </View>
            ))
        : null}
      <View style={styles.row}>
        <Action label="Check again" grow disabled={!client || checking} onPress={runSetup} testID="dev-setup-again" />
      </View>
      <NavRow label="Odoo setup check" detail="Each item and how to fix it" href="/setup" testID="dev-setup" />
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

      <SectionTitle>Network</SectionTitle>
      <View style={styles.row}>
        <Action label={netBusy ? 'Checking...' : 'Check network'} grow disabled={netBusy} onPress={runNetwork} testID="dev-network" />
      </View>
      {net ? (
        <View style={styles.card} testID="dev-network-result">
          {net.map((r) => (
            <View key={r.name} style={styles.line}>
              <Text style={styles.k}>{r.name}</Text>
              <Text style={[styles.v, r.state === 'failed' && styles.logErrorText]}>
                {r.state === 'ok' ? 'Good' : r.state === 'slow' ? 'Slow' : 'Failed'} · {r.detail}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <SectionTitle>Storage</SectionTitle>
      <View style={styles.card} testID="dev-storage">
        <Line k="Waiting" v={use.waiting.count ? `${use.waiting.count} photo${use.waiting.count === 1 ? '' : 's'} · ${bytesLabel(use.waiting.bytes)} to upload` : 'No photos waiting to upload'} testID="dev-storage-waiting" />
        <Line k="In Odoo" v={`${use.sent.count} photo${use.sent.count === 1 ? '' : 's'} · ${bytesLabel(use.sent.bytes)} also kept on this phone`} />
        <Line k="Free" v={storageLabel(storage().free, storage().total)} />
      </View>

      <SectionTitle>Odoo calls</SectionTitle>
      <Text style={styles.meta}>The last 50 calls by model and method, with how long each took. Nothing that was sent or answered is kept.</Text>
      <View style={styles.row}>
        <Action label={showCalls ? 'Hide calls' : `Show calls (${calls.length})`} grow onPress={() => setShowCalls((v) => !v)} testID="dev-calls-toggle" />
        <Action label="Clear" onPress={clearCallTrace} testID="dev-calls-clear" />
      </View>
      {showCalls ? (
        <View style={styles.log} testID="dev-calls">
          {calls.length === 0 ? <Text style={styles.logLine}>No calls yet.</Text> : null}
          {slowest(calls, 3).length ? <Text style={styles.logLine}>Slowest: {slowest(calls, 3).map((c) => `${c.model}.${c.method} ${c.ms} ms`).join(' · ')}</Text> : null}
          {[...calls].reverse().map((c, i) => (
            <Text key={`${c.t}-${i}`} style={[styles.logLine, !c.ok && styles.logError, c.ms > 3000 && styles.logWarn]}>
              {stamp(c.t)} {c.model}.{c.method} {c.ms} ms{c.ok ? '' : ' failed'}
            </Text>
          ))}
        </View>
      ) : null}

      <SectionTitle>Testing tools</SectionTitle>
      <DevTestTools release={details.release} shareText={share} logText={() => formatLog(logger.entries(), ['Johnsons app log', buildInfo])} />
      {FEATURE_FLAGS.map((f) => (
        <View key={f.id}>
          <View style={styles.switchRow}>
            <Text style={[styles.label, styles.grow]}>{f.label}</Text>
            <Switch value={featureOn(f.id)} onValueChange={(on) => setFeature(f.id, on)} accessibilityLabel={f.label} testID={`dev-flag-${f.id}`} trackColor={{ true: colors.selected, false: colors.info }} thumbColor={colors.bg} style={styles.switch} />
          </View>
          <Text style={styles.meta}>{f.detail}</Text>
        </View>
      ))}

      <SectionTitle>Saved lists</SectionTitle>
      <Text style={styles.meta}>Prices, templates and lists copied from Odoo for when there's no signal.</Text>
      <View style={styles.row}>
        <Action label="Re-download lists" grow disabled={!client} onPress={redownload} testID="dev-redownload" />
        <Action label="Clear cache" grow onPress={() => setConfirmClear(true)} testID="dev-clear-cache" />
      </View>
      {confirmClear ? (
        <View style={styles.card} testID="dev-clear-confirm">
          <Text style={styles.note}>{CLEAR_CACHE_WARNING}</Text>
          <View style={styles.row}>
            <Action label="Keep it" grow onPress={() => setConfirmClear(false)} testID="dev-clear-no" />
            <Action label="Yes, clear cache" primary grow onPress={clearCache} testID="dev-clear-yes" />
          </View>
        </View>
      ) : null}
      {cacheNote ? (
        <Text style={styles.note} testID="dev-cache-note" accessibilityLiveRegion="polite">
          {cacheNote}
        </Text>
      ) : null}

      <SectionTitle>Log</SectionTitle>
      <Text style={styles.meta}>Last 7 days on this phone. Passwords and keys are blanked out. Share diagnostics sends the build, phone, Odoo setup, what's waiting and this log in one file, with no keys.</Text>
      <View style={styles.row}>
        <Action label="Share diagnostics" primary grow onPress={shareDiagnostics} testID="dev-share-log" />
        <Action label="Share these lines" grow onPress={() => shareLines(filtered, 'johnsons-log')} testID="dev-share-lines" />
        <Action label="Clear" onPress={() => logger.clear()} testID="dev-clear-log" />
      </View>
      {note ? (
        <Text style={styles.note} testID="dev-note" accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}
      <ChipRow options={FILTERS.map((f) => (f.value === 'errors' ? { ...f, label: `Problems ${problems}` } : f))} value={filter} onChange={setFilter} compact testID="dev-filter" />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search the log"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search the log"
        testID="dev-log-search"
        style={styles.search}
      />
      <Text style={styles.meta} testID="dev-log-count">{`${filtered.length} line${filtered.length === 1 ? '' : 's'}${filtered.length > SHOWN ? `, showing the latest ${SHOWN}` : ''}. Tap a line to share just it.`}</Text>
      <View style={styles.log} testID="dev-log">
        {shown.length === 0 ? <Text style={styles.logLine}>Nothing logged yet.</Text> : null}
        {shown.map((e, i) => (
          <Pressable key={`${e.t}-${i}`} onPress={() => shareLines([e], 'johnsons-log-line')} accessibilityRole="button" accessibilityLabel={`Share this log line: ${e.area} ${e.msg}`} testID={`dev-log-line-${i}`}>
            <Text style={[styles.logLine, e.level === 'error' && styles.logError, e.level === 'warn' && styles.logWarn]}>
              {stamp(e.t)} {e.area} {e.msg}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Line({ k, v, testID }: { k: string; v: string; testID?: string }) {
  const styles = useStyles();
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

const useStyles = makeStyles(() => ({
  stack: { gap: sp(12) },
  row: { flexDirection: 'row', gap: sp(8) },
  grow: { flex: 1 },
  card: { backgroundColor: colors.card, borderRadius: rad(12), padding: sp(12), gap: sp(6) },
  line: { flexDirection: 'row', gap: sp(8) },
  k: { width: 82, fontSize: fs(15), fontWeight: '700', color: colors.muted },
  v: { flex: 1, fontSize: fs(15), fontWeight: '800', color: colors.text },
  label: { fontSize: type.body, fontWeight: '800', color: colors.text },
  meta: { fontSize: fs(15), fontWeight: '600', color: colors.muted },
  note: { fontSize: fs(16), fontWeight: '700', color: colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', minHeight: touch.min, gap: sp(8) },
  switch: { transform: [{ scale: 1.3 }] },
  search: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: sp(14), fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  log: { backgroundColor: colors.text, borderRadius: rad(12), padding: sp(10), gap: sp(4) },
  logLine: { fontFamily: mono, fontSize: fs(12), lineHeight: fs(17), color: '#E3E3E3' },
  logWarn: { color: colors.safety },
  logError: { color: '#FF8A80' },
  logErrorText: { color: colors.stop },
}));
