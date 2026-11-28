import { router } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, Share, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { Action, NavRow as HubRow } from '../components/Buttons';
import { goodOf, ItemSheet, tileGroups, TileGrid, uncheckedItems } from '../components/InspectionTiles';
import { addRepairs, EMPTY_TICKET, newLineId, repairsOnTicket } from '../lib/ticket';
import { cents, formatMoney } from '../lib/prices';
import { ChipRow, SectionTitle } from '../components/controls';
import { SignatureSheet } from '../components/SignaturePad';
import { VoiceNotes } from '../components/VoiceNotes';
import { photosFor, signatureFor } from '../lib/attachments';
import {
  checklist,
  ExtraDef,
  setExtra,
  Answer,
  AnswerKey,
  EMPTY_INSPECTION,
  entryStats,
  HubEntry,
  hubEntries,
  Inspection,
  inspectionText,
  isFlagged,
  newDoor,
  newMotor,
  RATING_LABEL,
  Repair,
  repairForItem,
  restGood,
  sections,
  setAnswer,
  summary, checklistVersion, subscribeChecklist } from '../lib/inspection';
import { lastAnswer, previousInspection } from '../lib/lastInspection';
import { inspectionReportHtml } from '../lib/reportFiles';
import { formatJobDate, Job, jobName } from '../lib/jobs';
import { log } from '../lib/log';
import { jobsModel, reportNote, reportTarget, sendReport } from '../lib/odooReports';
import { MAX_ODOO_PDF_BASE64, pdfName } from '../lib/pdf';
import { useAttachments } from '../lib/useAttachments';
import { useCustomers } from '../lib/useCustomers';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
import { useSchedule } from '../lib/useSchedule';
import { colors, touch, type, bw, fs, rad, sz, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

const TAX_OPTIONS = [
  { label: 'Taxed (parts)', value: 'yes' as const },
  { label: 'No tax (labor)', value: 'no' as const },
];
const GATE_TYPES = [
  { label: 'Swing', value: 'swing' as const },
  { label: 'Slide', value: 'slide' as const },
];

/** Which page is showing: the list of inspections, one of them, or Finish. */
type Page = 'hub' | 'finish' | string;

/**
 * The inspection report for one job. It holds as many inspections as the
 * visit needs (doors, openers, a gate), added one at a time, each filled out
 * on its own page. Items start blank. Fair, Poor and worse flag an item, which
 * can carry a note, photos and a suggested repair (a part and price). Finish
 * collects the customer's signature, saves the report to Odoo, and can send
 * the suggested repairs on to the ticket.
 */
export function InspectionScreen({ job }: { job: Job }) {
  const styles = useStyles();
  const { jobs, setInspection, setTicket } = useJobs();
  // Redraw when the checklist changes (Odoo's surveys arrive).
  useSyncExternalStore(subscribeChecklist, checklistVersion);
  const attachments = useAttachments();
  const { business } = useInvoices();
  const odoo = useOdoo();
  const { appointments } = useSchedule();
  const { customers } = useCustomers();
  const [page, setPage] = useState<Page>('hub');
  const [signing, setSigning] = useState(false);
  const [autoSave, setAutoSave] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** A remove that would lose answers waits for a second tap. */
  const [armed, setArmed] = useState<string | null>(null);
  /** Suggested repairs the tech unticked on Finish; everything starts ticked. */
  const [skipped, setSkipped] = useState<string[]>([]);
  const [added, setAdded] = useState<number | null>(null);
  /** The tile whose pop-up is open, and whether the door details are open for editing. */
  const [sheet, setSheet] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const insp: Inspection = job.inspection ?? EMPTY_INSPECTION(job.savedAt);
  const save = (fn: (i: Inspection) => Inspection) => setInspection(job.id, { ...fn(insp), at: Date.now() });
  const sum = summary(insp);
  const photos = photosFor(attachments, job.id);
  const signature = signatureFor(attachments, 'inspection', job.id);
  const media = attachments.media;
  const target = odoo.client ? reportTarget(job, appointments, customers, jobsModel(odoo.client)) : null;
  /** The customer's last inspection on this phone, for the "last time" notes. */
  const before = useMemo(() => previousInspection(jobs, job), [jobs, job]);
  const entries = hubEntries(insp);
  const entry = entries.find((e) => e.id === page);
  const here: Page = page === 'finish' || entry ? page : 'hub';

  const guarded = (id: string, losesAnswers: boolean, run: () => void) => {
    if (losesAnswers && armed !== id) return setArmed(id);
    setArmed(null);
    run();
  };
  const tapAgain = (id: string, label: string) => (armed === id ? 'Tap again: answers will be lost' : label);
  const hasAnswers = (a: Record<string, Answer>) => Object.values(a).some((x) => x.rating || x.note.trim() || x.action.trim());

  const takePhoto = async (key: AnswerKey) => {
    const uri = await media?.takePhoto().catch(() => null);
    if (uri) attachments.addPhotos(job.id, [uri], 'other', key);
  };

  const reportHtml = () =>
    inspectionReportHtml({ ...job, inspection: insp }, attachments, media, business, {
      reference: target?.model === 'fsm.order' ? undefined : job.odooOrder?.name,
      inspector: odoo.client?.session.name || business.name,
    });

  const sharePdf = async () => {
    if (!media) return;
    setBusy('pdf');
    setNote(null);
    try {
      await media.sharePdf(await reportHtml(), pdfName('Inspection', job.customer));
    } catch (e) {
      log.error('inspect', e);
      setNote("Couldn't make the PDF. Try again.");
    }
    setBusy(null);
  };

  /** Opens the report in the phone's PDF viewer, where it can be read, saved or shared (like the invoice's Download). */
  const viewPdf = async () => {
    if (!media) return;
    setBusy('view');
    setNote(null);
    try {
      const name = pdfName('Inspection', job.customer);
      if (media.pdfBase64 && media.openPdf) await media.openPdf(await media.pdfBase64(await reportHtml()), name);
      else await media.sharePdf(await reportHtml(), name);
    } catch (e) {
      log.error('inspect', e);
      setNote("Couldn't make the PDF. Try again.");
    }
    setBusy(null);
  };

  const sendToOdoo = async () => {
    if (!odoo.client || !target || !media?.pdfBase64) {
      setNote(odoo.client ? 'To save the report in Odoo, link this job to an Odoo customer first.' : 'Not signed in to Odoo. Sign in, then save the report.');
      return;
    }
    setBusy('odoo');
    setNote(null);
    try {
      const pdf = await media.pdfBase64(await reportHtml());
      if (pdf.length > MAX_ODOO_PDF_BASE64) {
        setNote('The report is too big for Odoo with this many photos. Share the PDF instead, or remove some item photos.');
        setBusy(null);
        return;
      }
      await sendReport(odoo.client, target, pdfName('Inspection', job.customer), pdf, reportNote(insp));
      log.info('inspect', `report sent to ${target.model} ${target.id}`);
      save((i) => ({ ...i, sent: { at: Date.now(), to: target.label } }));
      setNote(`Saved to ${target.label} in Odoo${signature ? '' : ' as not signed. The customer can sign later'}.`);
    } catch (e) {
      log.error('inspect', e);
      setNote("Couldn't save it to Odoo. Check the signal and try again.");
    }
    setBusy(null);
  };

  // Once the customer has signed (and the signature is on the phone), the report saves to Odoo by itself.
  useEffect(() => {
    if (!autoSave || !signature) return;
    setAutoSave(false);
    void sendToOdoo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSave, signature?.id]);

  const photosOf = (key: AnswerKey) => photos.filter((p) => (p.item ?? '') === key).length;
  const backToList = <Action label="‹ All inspections" onPress={() => setPage('hub')} testID="inspection-back" />;

  /** The tiles, top bar and pop-up for the given checklist sections. */
  const tilesOf = (entryId: string, keys: string[], titles?: Record<string, string>) => {
    const secs = sections(insp).filter((x) => keys.includes(x.key));
    const all = secs.flatMap((x) => x.items);
    const total = all.length;
    const done = all.filter((i) => i.answer?.rating).length;
    const flaggedN = all.filter((i) => isFlagged(i.answer?.rating)).length;
    const open = uncheckedItems(secs);
    const sheetItem = sheet ? all.find((i) => i.key === sheet) : undefined;
    const photosList = (key: AnswerKey) => photos.filter((p) => (p.item ?? '') === key);
    return (
      <>
        <View style={styles.topBar} testID={`progress-${entryId}`}>
          <Text style={styles.for}>{`${done} of ${total} checked${flaggedN ? ` · ${flaggedN} flagged` : ''}`}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${total ? Math.round((done / total) * 100) : 0}%` }]} />
          </View>
          <View style={styles.row}>
            <Action label={open.length ? `Mark the rest Good (${open.length})` : 'Mark the rest Good'} grow disabled={open.length === 0} onPress={() => save((i) => keys.reduce((acc, k) => restGood(acc, k), i))} testID={`rest-good-${entryId}`} />
            <Action label="Jump to unchecked" grow disabled={open.length === 0} onPress={() => setSheet(open[0].key)} testID={`jump-${entryId}`} />
          </View>
        </View>
        <Text style={styles.note}>Tap a tile for Good. Tap a Good tile to clear it. Hold a tile to rate it Fair or worse, add a note or photos, or suggest a repair.</Text>
        {secs.map((sec) => (
          <View key={sec.key} style={styles.stack}>
            {titles?.[sec.key] ? <Text style={styles.subTitle}>{titles[sec.key]}</Text> : null}
            <TileGrid
              groups={tileGroups(sec, secs.length > 1 ? '' : 'Frame and panels')}
              repairFor={(k) => repairForItem(insp, k)}
              photoCount={photosOf}
              onTap={(i) => save((x) => setAnswer(x, i.key, { rating: i.answer?.rating ? undefined : goodOf(i.def) }))}
              onOpen={(i) => setSheet(i.key)}
            />
          </View>
        ))}
        {sheetItem ? (
          <ItemSheet
            item={sheetItem}
            last={(() => {
              const prior = lastAnswer(insp, before, sheetItem.key);
              return prior ? `Last time${before ? ` (${formatJobDate(before.at)})` : ''}: ${RATING_LABEL[prior.rating!]}${prior.note ? `, ${prior.note}` : ''}` : undefined;
            })()}
            repair={repairForItem(insp, sheetItem.key)}
            photos={photosList(sheetItem.key)}
            onAnswer={(patch) => save((i) => setAnswer(i, sheetItem.key, patch))}
            onTakePhoto={media ? () => void takePhoto(sheetItem.key) : undefined}
            onRepair={(r) => save((i) => ({ ...i, repairs: [...i.repairs.filter((x) => x.item !== sheetItem.key), { ...r, item: sheetItem.key }] }))}
            onRepairPatch={(id, patch) => save((i) => ({ ...i, repairs: i.repairs.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))}
            onRepairRemove={(id) => save((i) => ({ ...i, repairs: i.repairs.filter((r) => r.id !== id) }))}
            onClose={() => setSheet(null)}
          />
        ) : null}
      </>
    );
  };

  // One inspection's page.
  if (entry) {
    const di = insp.doors.findIndex((d) => entry.id === d.id || entry.id.startsWith(`${d.id}/`));
    const d = insp.doors[di];
    const m = d?.motors.find((x) => entry.id === `${d.id}/${x.id}`);
    const info = checklist().info;
    const upDoor = (patch: Partial<typeof d>) => save((i) => ({ ...i, doors: i.doors.map((x) => (x.id === d.id ? { ...x, ...patch } : x)) }));
    const upMotor = (patch: Partial<NonNullable<typeof m>>) => save((i) => ({ ...i, doors: i.doors.map((x) => (x.id === d.id ? { ...x, motors: x.motors.map((y) => (y.id === m!.id ? { ...y, ...patch } : y)) } : x)) }));
    const done = () => setPage('hub');
    return (
      <View style={styles.stack} testID="inspection">
        {backToList}
        <SectionTitle first>{entry.title}</SectionTitle>
        {entry.kind === 'door' && d ? (
          <>
            {tilesOf(entry.id, [d.id])}
            <View style={styles.summaryCard} testID={`door-${di}-summary`}>
              <View style={styles.grow}>
                <Text style={styles.partName}>{[d.maker, d.size, d.age].filter((x) => x.trim()).join(' · ') || 'Door details'}</Text>
                <Text style={styles.note}>{d.springCycles.trim() ? `Springs ${d.springCycles} cycles` : 'Add make, size, year and springs'}</Text>
              </View>
              <Pressable onPress={() => setEditing(!editing)} accessibilityRole="button" testID={`door-${di}-edit`} style={styles.editLink}>
                <Text style={styles.editText}>{editing ? 'Done' : 'Edit'}</Text>
              </Pressable>
            </View>
            {editing ? (
              <View style={styles.stack} testID={`door-${di}-details`}>
                <Text style={styles.fieldLabel}>{info.door.maker}</Text>
                <ChipRow options={checklist().doorMakers.map((x) => ({ label: x, value: x }))} value={d.maker} onChange={(maker) => upDoor({ maker })} testID={`door-${di}-maker`} />
                <Field label={info.door.size} value={d.size} placeholder="16x7" onChange={(size) => upDoor({ size })} testID={`door-${di}-size`} />
                <Field label={info.door.age} value={d.age} placeholder="2012" onChange={(age) => upDoor({ age })} testID={`door-${di}-age`} />
                <Field label={info.door.code} value={d.springCode} onChange={(springCode) => upDoor({ springCode })} testID={`door-${di}-spring-code`} />
                <Field label={info.door.cycles} value={d.springCycles} placeholder="10,000" onChange={(springCycles) => upDoor({ springCycles })} testID={`door-${di}-cycles`} />
                <ExtraFields defs={checklist().extras.door} values={d.extra} onChange={(id, v) => save((i) => setExtra(i, { door: d.id }, id, v))} testPrefix={`door-${di}-extra`} />
              </View>
            ) : null}
            <Text style={styles.note}>Items marked PRO are under spring tension. Only a trained tech should adjust or replace them.</Text>
            <Action
              label={tapAgain(d.id, `Remove ${entry.title}`)}
              onPress={() => guarded(d.id, hasAnswers(d.answers) || d.motors.some((x) => hasAnswers(x.answers)), () => { save((i) => ({ ...i, doors: i.doors.filter((x) => x.id !== d.id) })); done(); })}
              testID={`door-${di}-remove`}
            />
          </>
        ) : null}
        {entry.kind === 'opener' && d && m ? (
          <>
            <Text style={styles.fieldLabel}>{info.opener.maker}</Text>
            <ChipRow options={checklist().motorMakers.map((x) => ({ label: x, value: x }))} value={m.maker} onChange={(maker) => upMotor({ maker })} testID="opener-maker" />
            <Field label={info.opener.built} value={m.built} placeholder="2019" onChange={(built) => upMotor({ built })} testID="opener-built" />
            <ExtraFields defs={checklist().extras.opener} values={m.extra} onChange={(id, v) => save((i) => setExtra(i, { door: d.id, motor: m.id }, id, v))} testPrefix="opener-extra" />
            {tilesOf(entry.id, [`${d.id}/${m.id}`])}
            <Action
              label={tapAgain(m.id, `Remove ${entry.title}`)}
              onPress={() => guarded(m.id, hasAnswers(m.answers), () => { save((i) => ({ ...i, doors: i.doors.map((x) => (x.id === d.id ? { ...x, motors: x.motors.filter((y) => y.id !== m.id) } : x)) })); done(); })}
              testID="opener-remove"
            />
          </>
        ) : null}
        {entry.kind === 'gate' && insp.gate ? (
          <>
            <ChipRow options={GATE_TYPES} value={insp.gate.type as 'swing' | 'slide'} onChange={(t) => save((i) => ({ ...i, gate: { ...i.gate!, type: t } }))} testID="gate-type" />
            <ExtraFields defs={checklist().extras.gate} values={insp.gate.extra} onChange={(id, v) => save((i) => setExtra(i, {}, id, v))} testPrefix="gate-extra" />
            {tilesOf(entry.id, ['gate-ul', ...(insp.gate.type ? ['gate-type'] : []), 'gate-astm'], { 'gate-ul': 'UL 325', 'gate-type': insp.gate.type === 'slide' ? 'Slide gate' : 'Swing gate', 'gate-astm': 'ASTM F2200, all gates' })}
            <HubRow label="Gate safety guide" onPress={() => router.push('/manuals')} />
            <Action label={tapAgain('gate', 'Remove the gate')} onPress={() => guarded('gate', hasAnswers(insp.gate!.answers), () => { save((i) => ({ ...i, gate: undefined })); done(); })} testID="gate-remove" />
          </>
        ) : null}
        <Action label={`Finish this ${entry.kind === 'door' ? 'door' : entry.kind === 'opener' ? 'opener' : 'gate'}`} primary onPress={() => { setSheet(null); setEditing(false); setPage('hub'); }} testID="inspection-done" />
      </View>
    );
  }

  // Finish.
  if (here === 'finish') {
    const onTicketIds = repairsOnTicket(job.ticket ?? EMPTY_TICKET);
    const priced = insp.repairs.filter((r) => !r.declined && cents(r.price) > 0 && r.label.trim() !== '');
    const waiting = priced.filter((r) => !onTicketIds.has(r.id));
    const chosen = waiting.filter((r) => !skipped.includes(r.id));
    const addChosen = () => {
      setTicket(job.id, (t) => addRepairs(t, chosen, () => newLineId(Date.now())));
      setAdded(chosen.length);
    };
    return (
      <View style={styles.stack} testID="inspection-finish">
        {backToList}
        <SectionTitle first>Customer signature</SectionTitle>
        <Text style={styles.note}>Signing saves the report to Odoo. If the customer isn't here, save it now; they can sign later.</Text>
        <Action label={signature ? `Signed by ${signature.name || 'customer'} · sign again` : 'Customer signs'} primary={!signature} disabled={!!busy} onPress={() => setSigning(true)} testID="inspection-sign" />
        {!signature ? <Action label={busy === 'odoo' ? 'Saving...' : 'Save without signature'} disabled={!!busy} onPress={sendToOdoo} testID="inspection-save-unsigned" /> : null}
        <SignatureSheet
          visible={signing}
          title="Sign the inspection report"
          agreement="I have received this inspection report."
          initialName={job.customer}
          onCancel={() => setSigning(false)}
          onSave={(sig) => {
            attachments.sign({ for: 'inspection', refId: job.id, ...sig });
            setSigning(false);
            setAutoSave(true);
          }}
        />
        {insp.sent && !busy && !note ? <Text style={styles.done} testID="inspection-sent">{`In Odoo: ${insp.sent.to}.`}</Text> : null}
        {note ? (
          <Text style={styles.done} testID="inspection-note" accessibilityLiveRegion="polite">
            {note}
          </Text>
        ) : null}
        {odoo.client && !target ? (
          <Text style={styles.note} testID="inspection-odoo-none">
            To save the report in Odoo, link this job to an Odoo customer first.
          </Text>
        ) : null}
        {insp.sent && signature ? <Action label={busy === 'odoo' ? 'Saving...' : 'Save to Odoo again'} disabled={!!busy} onPress={sendToOdoo} testID="inspection-odoo" /> : null}

        <SectionTitle>Suggested repairs</SectionTitle>
        {priced.length === 0 ? <Text style={styles.note}>No priced repairs were suggested on this report.</Text> : null}
        {priced.length > 0 ? (
          <Text style={styles.note}>
            {waiting.length > 0 ? 'Tick the repairs to put on the ticket. They stay off it until you add them.' : 'All of the suggested repairs are on the ticket.'}
          </Text>
        ) : null}
        {priced.map((r) => {
          const on = onTicketIds.has(r.id);
          const total = formatMoney(cents(r.price) * (r.qty && r.qty > 1 ? r.qty : 1));
          const label = `${r.qty && r.qty > 1 ? `${r.qty} × ` : ''}${r.label} · ${total}${on ? ' · on the ticket' : ''}`;
          return on ? (
            <Text key={r.id} style={styles.note} testID={`finish-repair-${r.id}`}>{`✓ ${label}`}</Text>
          ) : (
            <Toggle key={r.id} label={label} on={!skipped.includes(r.id)} onPress={() => setSkipped((x) => (x.includes(r.id) ? x.filter((y) => y !== r.id) : [...x, r.id]))} testID={`finish-repair-${r.id}`} />
          );
        })}
        {waiting.length > 0 ? <Action label={chosen.length > 0 ? `Add selected to the ticket (${chosen.length})` : 'Add selected to the ticket'} primary disabled={chosen.length === 0} onPress={addChosen} testID="inspection-send-repairs" /> : null}
        {added ? <Text style={styles.done} testID="inspection-repairs-added" accessibilityLiveRegion="polite">{`Added ${added} ${added === 1 ? 'repair' : 'repairs'} to the ticket.`}</Text> : null}

        <SectionTitle>Then</SectionTitle>
        <Action label="Open the ticket" onPress={() => router.push({ pathname: '/ticket/[id]', params: { id: job.id } })} testID="inspection-ticket" />
        {media ? <Action label={busy === 'pdf' ? 'Making the PDF...' : 'Send report'} disabled={!!busy} onPress={sharePdf} testID="inspection-pdf" /> : null}
        {media ? <Action label={busy === 'view' ? 'Making the PDF...' : 'View or download PDF'} disabled={!!busy} onPress={viewPdf} testID="inspection-pdf-view" /> : null}
        <Action label="Text a summary" onPress={() => Share.share({ message: inspectionText(insp, job.customer) }).catch(() => undefined)} testID="inspection-share" />
      </View>
    );
  }

  // The list of inspections on this report.
  const repairs = insp.repairs.filter((r) => r.label.trim() !== '');
  const where = (r: Repair) => {
    const e = r.item ? sections(insp).flatMap((x) => x.items.map((i) => ({ k: i.key, t: `${x.title} · ${i.def.label}` }))).find((i) => i.k === r.item) : undefined;
    return e ? `from ${e.t}` : 'typed on the report';
  };
  const addOpener = () => save((i) => {
    const doors = i.doors.length ? i.doors : [newDoor(Date.now())];
    const last = doors[doors.length - 1];
    return { ...i, doors: doors.map((x) => (x.id === last.id ? { ...x, motors: [...x.motors, newMotor(Date.now(), x.motors.length)] } : x)) };
  });
  return (
    <View style={styles.stack} testID="inspection">
      <Text style={styles.for}>{jobName(job)}</Text>
      <Text style={styles.note}>{entries.length === 0 ? 'Add only what this visit needs.' : `${entries.length} ${entries.length === 1 ? 'inspection' : 'inspections'} on this report`}</Text>
      <View style={styles.stats} testID="inspection-summary">
        <Stat big={sum.score === null ? '–' : `${sum.score}%`} label="Score" />
        <Stat big={String(sum.flagged)} label="Flagged" warn={sum.flagged > 0} />
        <Stat big={`${sum.answered}/${sum.total}`} label="Checked" />
      </View>

      <SectionTitle>Inspections</SectionTitle>
      <View>
        {entries.map((e) => (
          <EntryRow key={e.id} insp={insp} entry={e} onOpen={() => setPage(e.id)} />
        ))}
      </View>
      <View style={styles.row}>
        <Action label="+ Door" grow onPress={() => save((i) => ({ ...i, doors: [...i.doors, newDoor(Date.now(), i.doors.length)] }))} testID="inspection-add-door" />
        <Action label="+ Opener" grow onPress={addOpener} testID="inspection-add-opener" />
        {!insp.gate ? <Action label="+ Gate" grow onPress={() => save((i) => ({ ...i, gate: { type: '', answers: {} } }))} testID="inspection-add-gate" /> : null}
      </View>
      <Text style={styles.note}>A commercial door is a Door. A second door is another + Door.</Text>
      <Toggle label={checklist().info.door.lube} on={insp.lubricated} onPress={() => save((i) => ({ ...i, lubricated: !i.lubricated }))} testID="inspection-lube" />

      {repairs.length > 0 ? (
        <>
          <SectionTitle>{`Suggested repairs (${repairs.length})`}</SectionTitle>
          <View testID="suggested-repairs">
            {repairs.map((r) => (
              <View key={r.id} style={styles.suggest} testID={`suggested-${r.id}`}>
                <View style={styles.grow}>
                  <Text style={styles.partName}>{`${r.qty && r.qty > 1 ? `${r.qty} × ` : ''}${r.label}`}</Text>
                  <Text style={styles.note}>{where(r)}</Text>
                </View>
                <Text style={styles.partName}>{cents(r.price) > 0 ? formatMoney(cents(r.price) * (r.qty && r.qty > 1 ? r.qty : 1)) : 'No price'}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <SectionTitle>Voice notes</SectionTitle>
      <VoiceNotes
        notes={insp.voice}
        keepFile={media?.keepFile}
        onAdd={(n) => save((i) => ({ ...i, voice: [...i.voice, n] }))}
        onRemove={(id) => {
          const n = insp.voice.find((x) => x.id === id);
          if (n) media?.deletePhoto(n.uri);
          save((i) => ({ ...i, voice: i.voice.filter((x) => x.id !== id) }));
        }}
      />
      <Action label="Finish report" primary onPress={() => setPage('finish')} testID="inspection-finish-button" />
    </View>
  );
}

function EntryRow({ insp, entry, onOpen }: { insp: Inspection; entry: HubEntry; onOpen: () => void }) {
  const st = entryStats(insp, entry);
  const detail = st.answered === 0 ? 'Not started' : `${st.answered} of ${st.total} checked`;
  return <HubRow label={entry.title} detail={detail} badge={st.flagged > 0 ? `${st.flagged} flagged` : undefined} onPress={onOpen} testID={`entry-${entry.id}`} />;
}

function Stat({ big, label, warn }: { big: string; label: string; warn?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.stat, warn && styles.statWarn]}>
      <Text style={[styles.statBig, warn && styles.statWarnText]}>{big}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Toggle({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID: string }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} testID={testID} style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
      <View style={[styles.box, on && styles.boxOn]}>{on ? <Text style={styles.tick}>✓</Text> : null}</View>
      <Text style={styles.toggleText}>{label}</Text>
    </Pressable>
  );
}

/** The extra info questions added in Odoo: a pick list, or a box to type in. */
function ExtraFields({ defs, values, onChange, testPrefix }: { defs: ExtraDef[]; values: Record<string, string> | undefined; onChange: (id: string, value: string) => void; testPrefix: string }) {
  const styles = useStyles();
  return (
    <>
      {defs.map((d) =>
        d.type === 'choice' ? (
          <View key={d.id} style={styles.field}>
            <Text style={styles.fieldLabel}>{d.label}</Text>
            <ChipRow options={(d.choices ?? []).map((c) => ({ label: c, value: c }))} value={values?.[d.id] ?? ''} onChange={(v) => onChange(d.id, v)} scroll compact testID={`${testPrefix}-${d.id}`} />
          </View>
        ) : (
          <Field key={d.id} label={d.label} value={values?.[d.id] ?? ''} placeholder={d.type === 'date' ? 'YYYY-MM-DD' : undefined} onChange={(v) => onChange(d.id, v)} testID={`${testPrefix}-${d.id}`} />
        ),
      )}
    </>
  );
}

function Field({ label, value, onChange, placeholder, testID }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} accessibilityLabel={label} testID={testID} style={styles.input} />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(12) },
  row: { flexDirection: 'row', gap: sp(8) },
  for: { fontSize: type.value, fontWeight: '800', color: colors.text },
  stats: { flexDirection: 'row', gap: sp(8) },
  stat: { flex: 1, borderWidth: bw(1.5), borderColor: colors.border, borderRadius: rad(12), padding: sp(8), alignItems: 'center' },
  statWarn: { borderColor: colors.stop },
  statBig: { fontSize: type.big, fontWeight: '800', color: colors.text },
  statWarnText: { color: colors.stop },
  statLabel: { fontSize: fs(15), fontWeight: '800', color: colors.muted },
  note: { fontSize: fs(16), color: colors.muted, lineHeight: fs(22) },
  done: { fontSize: type.body, fontWeight: '800', color: colors.text },
  subTitle: { fontSize: type.body, fontWeight: '800', color: colors.text, marginTop: sp(4) },
  item: { padding: sp(12), gap: sp(8), borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, backgroundColor: colors.card },
  itemFlag: { borderWidth: bw(4), borderColor: colors.stop },
  itemFair: { borderWidth: bw(3), borderColor: colors.caution },
  last: { fontSize: fs(15), fontWeight: '700', color: colors.muted },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: sp(10), minHeight: touch.min, paddingVertical: sp(8), borderBottomWidth: 1, borderBottomColor: colors.line },
  itemTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(6) },
  choice: { flexGrow: 1, minWidth: 64, minHeight: touch.min, paddingHorizontal: sp(8), borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  choiceOn: { backgroundColor: colors.selected, borderColor: colors.selected },
  choiceBad: { backgroundColor: colors.stop, borderColor: colors.stop },
  choiceFair: { backgroundColor: colors.warn, borderColor: colors.warn },
  choiceText: { fontSize: fs(16), fontWeight: '800', color: colors.text, textAlign: 'center' },
  choiceTextOn: { color: colors.onSelected },
  moreLink: { minHeight: sz(44), justifyContent: 'center' },
  moreText: { fontSize: fs(16), fontWeight: '800', color: colors.text, textDecorationLine: 'underline' },
  grow: { flex: 1 },
  partBox: { flexDirection: 'row', alignItems: 'center', gap: sp(10), padding: sp(10), borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border },
  partName: { fontSize: type.body, fontWeight: '800', color: colors.text },
  step: { width: touch.min, minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: type.value, fontWeight: '800', color: colors.text },
  repair: { padding: sp(12), gap: sp(8), borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, backgroundColor: colors.card },
  field: { flex: 1, gap: sp(4) },
  fieldLabel: { fontSize: fs(15), fontWeight: '800', color: colors.muted },
  input: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: sp(14), fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: sp(12), minHeight: touch.min },
  box: { width: 32, height: 32, borderRadius: rad(6), borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.selected, borderColor: colors.selected },
  tick: { color: colors.onSelected, fontSize: fs(20), fontWeight: '800' },
  toggleText: { flex: 1, fontSize: type.body, fontWeight: '800', color: colors.text },
  pressed: { backgroundColor: colors.info },
  topBar: { gap: sp(8) },
  track: { height: 8, borderRadius: rad(4), backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.selected },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: sp(10), padding: sp(12), borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, backgroundColor: colors.card },
  editLink: { minHeight: sz(44), minWidth: 56, alignItems: 'center', justifyContent: 'center' },
  editText: { fontSize: type.body, fontWeight: '800', color: colors.selected },
}));
