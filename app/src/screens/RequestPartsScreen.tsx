import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../components/AppText';
import { Action } from '../components/Buttons';
import { Card, Message, Meta, Note, NumBox, Row, TextBox, Title, toNum, useRun } from '../components/Dept';
import { ChipRow } from '../components/controls';
import { DAY_MS, findCustomers } from '../lib/odooOffice';
import { requestParts, RequestedPart } from '../lib/odooPartsRequests';
import { searchProducts, StockProduct } from '../lib/odooStock';
import type { OdooTask } from '../lib/odoo';
import { useOdoo } from '../lib/useOdoo';
import { colors, fs, radius, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

const WHEN = [
  { label: 'Today', value: 0 },
  { label: 'Tomorrow', value: 1 },
  { label: 'In 3 days', value: 3 },
  { label: 'Next week', value: 7 },
];

/**
 * Request parts: pick the open job the parts are for (any job that is not closed can still need
 * parts), or search for a customer when it is not for a job. Then the parts and how many, when
 * they are needed, and a note. the parts and how many, when they are needed, and a note.
 * The request is saved in Odoo as a to-do on the customer for the buyer, naming the job. Nothing is ordered from here.
 */
export function RequestPartsScreen({ now = Date.now }: { now?: () => number }) {
  const styles = useStyles();
  const { client } = useOdoo();
  const { busy, msg, run } = useRun();
  const [jobTerm, setJobTerm] = useState('');
  const [jobs, setJobs] = useState<OdooTask[]>([]);
  const [job, setJob] = useState<OdooTask | null>(null);
  const [noJob, setNoJob] = useState(false);
  const [custTerm, setCustTerm] = useState('');
  const [custs, setCusts] = useState<{ id: number; name: string }[]>([]);
  const [cust, setCust] = useState<{ id: number; name: string } | null>(null);
  const [partTerm, setPartTerm] = useState('');
  const [found, setFound] = useState<StockProduct[]>([]);
  const [parts, setParts] = useState<(RequestedPart & { key: string })[]>([]);
  const [days, setDays] = useState(1);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!client || cust || noJob || typeof client.listJobs !== 'function') return;
    let alive = true;
    client.listJobs('open', jobTerm, 0, 30).then((r) => alive && setJobs(r), () => alive && setJobs([]));
    return () => {
      alive = false;
    };
  }, [client, jobTerm, cust, noJob]);
  useEffect(() => {
    if (!client || cust || !noJob) return;
    let alive = true;
    findCustomers(client, custTerm).then((r) => alive && setCusts(r), () => alive && setCusts([]));
    return () => {
      alive = false;
    };
  }, [client, custTerm, cust, noJob]);
  useEffect(() => {
    if (!client) return;
    let alive = true;
    searchProducts(client, partTerm, 8).then((r) => alive && setFound(r), () => alive && setFound([]));
    return () => {
      alive = false;
    };
  }, [client, partTerm]);

  if (!client) return <Note testID="parts-signin">Sign in to Odoo to request parts. The request is saved there for the buyer.</Note>;
  if (sent) {
    return (
      <Card testID="parts-sent">
        <Title>Sent to the buyer</Title>
        <Note>{msg?.text ?? 'Saved in Odoo as a to-do on the customer.'} Nothing has been ordered yet: the buyer sees it under Purchasing.</Note>
        <Action label="Request more parts" primary onPress={() => { setSent(false); setParts([]); setNote(''); setCust(null); setCustTerm(''); setJob(null); setJobTerm(''); setNoJob(false); }} testID="parts-again" />
      </Card>
    );
  }
  const needed = now() + days * DAY_MS;
  const byText = new Date(needed).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const add = (p: StockProduct) => {
    setParts((l) => (l.some((x) => x.key === String(p.id)) ? l.map((x) => (x.key === String(p.id) ? { ...x, qty: x.qty + 1 } : x)) : [...l, { key: String(p.id), name: p.name, qty: 1 }]));
    setPartTerm('');
  };
  return (
    <View style={styles.stack} testID="request-parts">
      <Text style={styles.label}>{noJob && !job ? 'CUSTOMER' : 'JOB'}</Text>
      {cust ? (
        <Card testID="parts-customer">
          <Row>
            <View style={styles.grow}>
              <Title>{job ? job.name : cust.name}</Title>
              {job ? <Meta>{[cust.name, job.address].filter(Boolean).join(' · ')}</Meta> : null}
            </View>
            <Action label="Change" onPress={() => { setCust(null); setJob(null); }} testID="parts-change-customer" />
          </Row>
        </Card>
      ) : noJob ? (
        <View style={styles.stack}>
          <TextBox value={custTerm} onChange={setCustTerm} label="Search customers" testID="parts-customer-search" />
          {custs.map((c) => (
            <Pressable key={c.id} onPress={() => setCust(c)} accessibilityRole="button" testID={`parts-customer-${c.id}`} style={styles.pick}>
              <Text style={styles.pickText}>{c.name}</Text>
            </Pressable>
          ))}
          <Action label="Pick from open jobs instead" onPress={() => setNoJob(false)} testID="parts-use-jobs" />
        </View>
      ) : (
        <View style={styles.stack}>
          <TextBox value={jobTerm} onChange={setJobTerm} label="Search open jobs" testID="parts-job-search" />
          {jobs.map((j) => (
            <Pressable
              key={j.id}
              onPress={() => {
                if (j.customerId) {
                  setJob(j);
                  setCust({ id: j.customerId, name: j.customer || j.name });
                } else {
                  setNoJob(true);
                }
              }}
              accessibilityRole="button"
              testID={`parts-job-${j.id}`}
              style={styles.pick}
            >
              <Text style={styles.pickText}>{j.name}</Text>
              <Meta>{[j.customer, j.address, j.stage].filter(Boolean).join(' · ')}</Meta>
            </Pressable>
          ))}
          {jobs.length === 0 ? <Note testID="parts-no-jobs">{jobTerm.trim() ? 'No open job matches that.' : 'No open jobs.'}</Note> : null}
          <Action label="Not for a job? Search customers" onPress={() => setNoJob(true)} testID="parts-no-job" />
        </View>
      )}

      <Text style={styles.label}>PARTS</Text>
      {parts.map((p) => (
        <Card key={p.key} testID={`parts-line-${p.key}`}>
          <Title>{p.name}</Title>
          <Row>
            <NumBox value={String(p.qty)} onChange={(v) => setParts((l) => l.map((x) => (x.key === p.key ? { ...x, qty: toNum(v) ?? 0 } : x)))} label="Qty" testID={`parts-qty-${p.key}`} width={80} />
            <Action label="Remove" onPress={() => setParts((l) => l.filter((x) => x.key !== p.key))} testID={`parts-remove-${p.key}`} />
          </Row>
        </Card>
      ))}
      <TextBox value={partTerm} onChange={setPartTerm} label="Search parts to add" testID="parts-search" />
      {partTerm.trim() ? (
        found.length ? (
          found.map((p) => (
            <Pressable key={p.id} onPress={() => add(p)} accessibilityRole="button" testID={`parts-pick-${p.id}`} style={styles.pick}>
              <Text style={styles.pickText}>{p.name}</Text>
              {p.code ? <Meta>{p.code}</Meta> : null}
            </Pressable>
          ))
        ) : (
          <Note>No part matches that.</Note>
        )
      ) : null}

      <Text style={styles.label}>NEEDED BY</Text>
      <ChipRow options={WHEN} value={days} onChange={(v) => setDays(Number(v))} testID="parts-when" />
      <Meta>{byText}</Meta>
      <Text style={styles.label}>NOTE TO BUYER</Text>
      <TextBox value={note} onChange={setNote} label="For Tuesday's job, any brand" testID="parts-note" />
      <Message msg={sent ? null : msg} testID="parts-msg" />
      <Action
        label="Send to buyer"
        primary
        disabled={busy !== null || !cust || !parts.some((p) => p.qty > 0)}
        testID="parts-send"
        onPress={() =>
          run('send', async () => {
            await requestParts(client, cust!.id, parts, needed, job ? `For job ${job.name}${job.address ? ` (${job.address})` : ''}.\n${note}` : note, byText);
            setSent(true);
            return `Request for ${cust!.name} saved in Odoo.`;
          })
        }
      />
      <Meta>Saved in Odoo as a to-do on the customer. The buyer orders it. Nothing is ordered from here.</Meta>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(8) },
  grow: { flex: 1, gap: sp(2) },
  label: { fontSize: fs(12), fontWeight: '800', letterSpacing: 1, color: colors.muted, marginTop: sp(6) },
  pick: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, paddingHorizontal: sp(12), paddingVertical: sp(10), minHeight: 44, justifyContent: 'center' },
  pickText: { fontSize: fs(16), fontWeight: '700', color: colors.text },
}));
