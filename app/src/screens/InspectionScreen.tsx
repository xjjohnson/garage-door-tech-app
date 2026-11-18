import { router } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { Action, NavRow as HubRow } from '../components/Buttons';
import { PartPickerSheet } from '../components/PartPickerSheet';
import { PriceBookItem } from '../lib/priceBook';
import { cents, formatMoney } from '../lib/prices';
import { ChipRow, MeasureField, SectionTitle } from '../components/controls';
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
  isBad,
  isFlagged,
  ItemDef,
  newDoor,
  newMotor,
  RATING_LABEL,
  Rating,
  Repair,
  repairForItem,
  repairFromPart,
  restGood,
  SCALES,
  sections,
  setAnswer,
  suggestedRepairs,
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
import { colors, touch, type } from '../theme';

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
  const { jobs, setInspection } = useJobs();
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

  const itemsOf = (keys: string[], restKey?: (k: string) => string) =>
    keys.map((k) => (
      <SectionItems
        key={k}
        insp={insp}
        sectionKey={k}
        before={before}
        photoCount={photosOf}
        onAnswer={(key, patch) => save((i) => setAnswer(i, key, patch))}
        onPhoto={media ? takePhoto : undefined}
        onRepair={(key, r) => save((i) => ({ ...i, repairs: [...i.repairs.filter((x) => x.item !== key), { ...r, item: key }] }))}
        onRepairPatch={(id, patch) => save((i) => ({ ...i, repairs: i.repairs.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))}
        onRepairRemove={(id) => save((i) => ({ ...i, repairs: i.repairs.filter((r) => r.id !== id) }))}
        onRestGood={() => save((i) => restGood(i, k))}
        testKey={restKey ? restKey(k) : k}
      />
    ));

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
            <Text style={styles.fieldLabel}>{info.door.maker}</Text>
            <ChipRow options={checklist().doorMakers.map((x) => ({ label: x, value: x }))} value={d.maker} onChange={(maker) => upDoor({ maker })} compact testID={`door-${di}-maker`} />
            <Field label={info.door.size} value={d.size} placeholder="16x7" onChange={(size) => upDoor({ size })} testID={`door-${di}-size`} />
            <Field label={info.door.age} value={d.age} placeholder="2012" onChange={(age) => upDoor({ age })} testID={`door-${di}-age`} />
            <Field label={info.door.code} value={d.springCode} onChange={(springCode) => upDoor({ springCode })} testID={`door-${di}-spring-code`} />
            <Field label={info.door.cycles} value={d.springCycles} placeholder="10,000" onChange={(springCycles) => upDoor({ springCycles })} testID={`door-${di}-cycles`} />
            <ExtraFields defs={checklist().extras.door} values={d.extra} onChange={(id, v) => save((i) => setExtra(i, { door: d.id }, id, v))} testPrefix={`door-${di}-extra`} />
            <Text style={styles.note}>Items marked PRO are under spring tension. Only a trained tech should adjust or replace them.</Text>
            {itemsOf([d.id])}
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
            <ChipRow options={checklist().motorMakers.map((x) => ({ label: x, value: x }))} value={m.maker} onChange={(maker) => upMotor({ maker })} compact testID="opener-maker" />
            <Field label={info.opener.built} value={m.built} placeholder="2019" onChange={(built) => upMotor({ built })} testID="opener-built" />
            <ExtraFields defs={checklist().extras.opener} values={m.extra} onChange={(id, v) => save((i) => setExtra(i, { door: d.id, motor: m.id }, id, v))} testPrefix="opener-extra" />
            {itemsOf([`${d.id}/${m.id}`])}
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
            {insp.gate.type ? (
              <>
                <Text style={styles.subTitle}>{insp.gate.type === 'slide' ? 'Slide gate' : 'Swing gate'}</Text>
                {itemsOf(['gate-type'])}
              </>
            ) : null}
            <HubRow label="Gate safety guide" onPress={() => router.push('/manuals')} />
            <Text style={styles.subTitle}>UL 325</Text>
            {itemsOf(['gate-ul'])}
            <Text style={styles.subTitle}>ASTM F2200, all gates</Text>
            {itemsOf(['gate-astm'])}
            <Action label={tapAgain('gate', 'Remove the gate')} onPress={() => guarded('gate', hasAnswers(insp.gate!.answers), () => { save((i) => ({ ...i, gate: undefined })); done(); })} testID="gate-remove" />
          </>
        ) : null}
        {backToList}
      </View>
    );
  }

  // Finish.
  if (here === 'finish') {
    const held = suggestedRepairs(insp);
    const onTicket = insp.holdRepairs === false || insp.holdRepairs === undefined;
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

        <SectionTitle>Then</SectionTitle>
        {held.length > 0 && !onTicket ? (
          <Action label={`Send suggested repairs to the ticket (${held.length})`} primary onPress={() => { save((i) => ({ ...i, holdRepairs: false })); router.push({ pathname: '/quote/[id]', params: { id: job.id } }); }} testID="inspection-send-repairs" />
        ) : null}
        {held.length > 0 && onTicket ? <Text style={styles.note}>The suggested repairs are on the ticket.</Text> : null}
        <Action label="Open the quote" onPress={() => router.push({ pathname: '/quote/[id]', params: { id: job.id } })} testID="inspection-quote" />
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

function SectionItems({
  insp,
  sectionKey,
  before,
  photoCount,
  onAnswer,
  onPhoto,
  onRepair,
  onRepairPatch,
  onRepairRemove,
  onRestGood,
  testKey,
}: {
  insp: Inspection;
  sectionKey: string;
  /** The customer's last inspection, for "last time" notes. */
  before: Inspection | undefined;
  photoCount: (key: AnswerKey) => number;
  onAnswer: (key: AnswerKey, patch: Partial<Answer>) => void;
  onPhoto?: (key: AnswerKey) => void;
  onRepair: (key: AnswerKey, r: Repair) => void;
  onRepairPatch: (id: string, patch: Partial<Repair>) => void;
  onRepairRemove: (id: string) => void;
  onRestGood: () => void;
  testKey: string;
}) {
  const section = sections(insp).find((s) => s.key === sectionKey);
  if (!section) return null;
  const open = section.items.filter((i) => !i.answer?.rating).length;
  return (
    <View style={styles.stack}>
      {section.items.map((i) => {
        const prior = lastAnswer(insp, before, i.key);
        return (
          <ItemRow
            key={i.key}
            itemKey={i.key}
            def={i.def}
            answer={i.answer}
            photoCount={photoCount(i.key)}
            repair={repairForItem(insp, i.key)}
            last={prior ? `Last time: ${RATING_LABEL[prior.rating!]}${before ? ` (${formatJobDate(before.at)})` : ''}` : undefined}
            onAnswer={(patch) => onAnswer(i.key, patch)}
            onPhoto={onPhoto ? () => onPhoto(i.key) : undefined}
            onRepair={(r) => onRepair(i.key, r)}
            onRepairPatch={onRepairPatch}
            onRepairRemove={onRepairRemove}
          />
        );
      })}
      {open > 0 ? <Action label={`Mark the rest Good (${open})`} onPress={onRestGood} testID={`rest-good-${testKey}`} /> : null}
    </View>
  );
}

function ItemRow({
  itemKey,
  def,
  answer,
  photoCount,
  repair,
  last,
  onAnswer,
  onPhoto,
  onRepair,
  onRepairPatch,
  onRepairRemove,
}: {
  itemKey: string;
  def: ItemDef;
  answer: Answer | undefined;
  photoCount: number;
  repair: Repair | undefined;
  last: string | undefined;
  onAnswer: (patch: Partial<Answer>) => void;
  onPhoto?: () => void;
  onRepair: (r: Repair) => void;
  onRepairPatch: (id: string, patch: Partial<Repair>) => void;
  onRepairRemove: (id: string) => void;
}) {
  const [more, setMore] = useState(false);
  const [picking, setPicking] = useState(false);
  const flagged = isFlagged(answer?.rating);
  // Flagged items open on their own: note, photo and a suggested repair.
  const showMore = flagged || more || !!answer?.note || !!repair;
  const newRepair = (r: Partial<Repair>): Repair => ({ id: `r-${Date.now().toString(36)}-${itemKey}`, label: '', price: '', taxable: true, ...r });
  return (
    <View style={[styles.item, flagged && (isBad(answer?.rating) ? styles.itemFlag : styles.itemFair)]} testID={`item-${itemKey}`}>
      <Text style={styles.itemTitle}>
        {def.label}
        {def.pro ? '  · PRO' : ''}
      </Text>
      {last ? <Text style={styles.last} testID={`item-${itemKey}-last`}>{last}</Text> : null}
      <View style={styles.choices}>
        {SCALES[def.scale].map((r: Rating) => {
          const on = answer?.rating === r;
          const bad = isBad(r);
          const fair = r === 'fair';
          return (
            <Pressable
              key={r}
              onPress={() => onAnswer({ rating: on ? undefined : r })}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${def.label}: ${RATING_LABEL[r]}`}
              testID={`item-${itemKey}-${r}`}
              style={({ pressed }) => [styles.choice, on && (bad ? styles.choiceBad : fair ? styles.choiceFair : styles.choiceOn), pressed && !on && styles.pressed]}
            >
              <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{RATING_LABEL[r]}</Text>
            </Pressable>
          );
        })}
      </View>
      {showMore ? (
        <>
          <TextInput value={answer?.note ?? ''} onChangeText={(note) => onAnswer({ note })} placeholder="Note" placeholderTextColor={colors.muted} accessibilityLabel={`${def.label} note`} testID={`item-${itemKey}-note`} style={styles.input} />
          {onPhoto ? <Action label={photoCount ? `Photo (${photoCount})` : 'Photo'} onPress={onPhoto} testID={`item-${itemKey}-photo`} /> : null}
          {repair ? (
            <View style={styles.repair} testID={`repair-${repair.id}`}>
              <Text style={styles.fieldLabel}>Suggested repair</Text>
              <TextInput value={repair.label} onChangeText={(label) => onRepairPatch(repair.id, { label })} placeholder="Part or repair" placeholderTextColor={colors.muted} accessibilityLabel="Repair name" testID={`repair-name-${repair.id}`} style={styles.input} />
              {repair.productId ? (
                <View style={styles.partBox}>
                  <Text style={[styles.partName, styles.grow]}>How many</Text>
                  <Pressable onPress={() => onRepairPatch(repair.id, { qty: Math.max(1, (repair.qty ?? 1) - 1) })} accessibilityRole="button" accessibilityLabel="One less" testID={`repair-qty-down-${repair.id}`} style={styles.step}>
                    <Text style={styles.stepText}>−</Text>
                  </Pressable>
                  <Text style={styles.partName} testID={`repair-qty-${repair.id}`}>{repair.qty ?? 1}</Text>
                  <Pressable onPress={() => onRepairPatch(repair.id, { qty: (repair.qty ?? 1) + 1 })} accessibilityRole="button" accessibilityLabel="One more" testID={`repair-qty-up-${repair.id}`} style={styles.step}>
                    <Text style={styles.stepText}>+</Text>
                  </Pressable>
                </View>
              ) : null}
              <MeasureField label="Price" value={repair.price} onChange={(price) => onRepairPatch(repair.id, { price })} unit="dollars" allowFraction={false} placeholder="Tap to set" testID={`repair-price-${repair.id}`} />
              <ChipRow options={TAX_OPTIONS} value={repair.taxable ? 'yes' : 'no'} onChange={(v) => onRepairPatch(repair.id, { taxable: v === 'yes' })} testID={`repair-tax-${repair.id}`} />
              <Action label="Remove the repair" onPress={() => onRepairRemove(repair.id)} testID={`repair-remove-${repair.id}`} />
            </View>
          ) : (
            <View style={styles.row}>
              <Action label="Pick a part" grow onPress={() => setPicking(true)} testID={`item-${itemKey}-pick-part`} />
              <Action label="Type a repair" grow onPress={() => onRepair(newRepair({}))} testID={`item-${itemKey}-repair`} />
            </View>
          )}
          {picking ? (
            <PartPickerSheet
              initialQuery={def.label}
              onPick={(p: PriceBookItem) => {
                onRepair(newRepair(repairFromPart(p, 1, Date.now(), 0, itemKey)));
                setPicking(false);
              }}
              onClose={() => setPicking(false)}
            />
          ) : null}
        </>
      ) : (
        <Pressable onPress={() => setMore(true)} accessibilityRole="button" testID={`item-${itemKey}-more`} style={styles.moreLink}>
          <Text style={styles.moreText}>{photoCount ? `Note or photo · ${photoCount} photo${photoCount === 1 ? '' : 's'}` : 'Note or photo'}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Stat({ big, label, warn }: { big: string; label: string; warn?: boolean }) {
  return (
    <View style={[styles.stat, warn && styles.statWarn]}>
      <Text style={[styles.statBig, warn && styles.statWarnText]}>{big}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Toggle({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} testID={testID} style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
      <View style={[styles.box, on && styles.boxOn]}>{on ? <Text style={styles.tick}>✓</Text> : null}</View>
      <Text style={styles.toggleText}>{label}</Text>
    </Pressable>
  );
}

/** The extra info questions added in Odoo: a pick list, or a box to type in. */
function ExtraFields({ defs, values, onChange, testPrefix }: { defs: ExtraDef[]; values: Record<string, string> | undefined; onChange: (id: string, value: string) => void; testPrefix: string }) {
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
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} accessibilityLabel={label} testID={testID} style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  for: { fontSize: type.value, fontWeight: '800', color: colors.text },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 8, alignItems: 'center' },
  statWarn: { borderColor: colors.stop },
  statBig: { fontSize: type.big, fontWeight: '800', color: colors.text },
  statWarnText: { color: colors.stop },
  statLabel: { fontSize: 15, fontWeight: '800', color: colors.muted },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  done: { fontSize: type.body, fontWeight: '800', color: colors.text },
  subTitle: { fontSize: type.body, fontWeight: '800', color: colors.text, marginTop: 4 },
  item: { padding: 12, gap: 8, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  itemFlag: { borderWidth: 4, borderColor: colors.stop },
  itemFair: { borderWidth: 3, borderColor: colors.caution },
  last: { fontSize: 15, fontWeight: '700', color: colors.muted },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: touch.min, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  itemTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { flexGrow: 1, minWidth: 64, minHeight: touch.min, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  choiceOn: { backgroundColor: colors.selected, borderColor: colors.selected },
  choiceBad: { backgroundColor: colors.stop, borderColor: colors.stop },
  choiceFair: { backgroundColor: colors.warn, borderColor: colors.warn },
  choiceText: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center' },
  choiceTextOn: { color: colors.onSelected },
  moreLink: { minHeight: 44, justifyContent: 'center' },
  moreText: { fontSize: 16, fontWeight: '800', color: colors.text, textDecorationLine: 'underline' },
  grow: { flex: 1 },
  partBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border },
  partName: { fontSize: type.body, fontWeight: '800', color: colors.text },
  step: { width: touch.min, minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: type.value, fontWeight: '800', color: colors.text },
  repair: { padding: 12, gap: 8, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  field: { flex: 1, gap: 4 },
  fieldLabel: { fontSize: 15, fontWeight: '800', color: colors.muted },
  input: { minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: touch.min },
  box: { width: 32, height: 32, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.selected, borderColor: colors.selected },
  tick: { color: colors.onSelected, fontSize: 20, fontWeight: '800' },
  toggleText: { flex: 1, fontSize: type.body, fontWeight: '800', color: colors.text },
  pressed: { backgroundColor: colors.info },
});
