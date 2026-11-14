import { router } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Action } from '../components/Buttons';
import { ChipRow, MeasureField, SectionTitle } from '../components/controls';
import { SignatureSheet } from '../components/SignaturePad';
import { VoiceNotes } from '../components/VoiceNotes';
import { photosFor, signatureFor } from '../lib/attachments';
import {
  Answer,
  AnswerKey,
  DOOR_MAKERS,
  EMPTY_INSPECTION,
  flags,
  Inspection,
  inspectionText,
  isFlagged,
  ItemDef,
  MOTOR_MAKERS,
  newDoor,
  newMotor,
  RATING_LABEL,
  Rating,
  Repair,
  repairFromFlag,
  restGood,
  SCALES,
  sections,
  setAnswer,
  summary, checklistVersion, subscribeChecklist } from '../lib/inspection';
import { inspectionReportHtml } from '../lib/reportFiles';
import { Job, jobName } from '../lib/jobs';
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
/**
 * The inspection for one job, the checklist from SafetyCulture: each door
 * with its motors, and a gate if there is one. Every item gets a rating;
 * Poor, Safety risk, Non-compliant and Fail are flagged, and open a note,
 * an action, a photo and "Add as repair". The report is a PDF with the
 * customer's signature, shared or sent to Odoo.
 */
export function InspectionScreen({ job }: { job: Job }) {
  const { setInspection } = useJobs();
  // Redraw when the checklist changes (Odoo's surveys arrive).
  useSyncExternalStore(subscribeChecklist, checklistVersion);
  const attachments = useAttachments();
  const { business } = useInvoices();
  const odoo = useOdoo();
  const { appointments } = useSchedule();
  const { customers } = useCustomers();
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** A remove that would lose answers waits for a second tap. */
  const [armed, setArmed] = useState<string | null>(null);

  const insp: Inspection = job.inspection ?? EMPTY_INSPECTION(job.savedAt);
  const save = (fn: (i: Inspection) => Inspection) => setInspection(job.id, { ...fn(insp), at: Date.now() });
  const answer = (key: AnswerKey, patch: Partial<Answer>) => save((i) => setAnswer(i, key, patch));
  const sum = summary(insp);
  const photos = photosFor(attachments, job.id);
  const signature = signatureFor(attachments, 'inspection', job.id);
  const media = attachments.media;
  const target = odoo.client ? reportTarget(job, appointments, customers, jobsModel(odoo.client)) : null;

  const answered = (a: Record<string, Answer>) => Object.values(a).some((x) => x.rating || x.note.trim() || x.action.trim());
  const guarded = (id: string, losesAnswers: boolean, run: () => void) => {
    if (losesAnswers && armed !== id) return setArmed(id);
    setArmed(null);
    run();
  };
  const tapAgain = (id: string, label: string) => (armed === id ? 'Tap again: answers will be lost' : label);

  const addRepair = (r: Repair) => save((i) => ({ ...i, repairs: [...i.repairs, r] }));
  const setRepair = (id: string, patch: Partial<Repair>) => save((i) => ({ ...i, repairs: i.repairs.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
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

  const sendToOdoo = async () => {
    if (!odoo.client || !target || !media?.pdfBase64) return;
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
      setNote(`Sent to ${target.label} in Odoo.`);
    } catch (e) {
      log.error('inspect', e);
      setNote("Couldn't send it to Odoo. Check the signal and try again.");
    }
    setBusy(null);
  };

  const flagList = flags(insp);

  return (
    <View style={styles.stack} testID="inspection">
      <Text style={styles.for}>{jobName(job)}</Text>
      <View style={styles.stats} testID="inspection-summary">
        <Stat big={sum.score === null ? '–' : `${sum.score}%`} label="Score" />
        <Stat big={String(sum.flagged)} label="Flagged" warn={sum.flagged > 0} />
        <Stat big={`${sum.answered}/${sum.total}`} label="Checked" />
      </View>
      <Text style={styles.note}>Items marked PRO are under spring tension. Only a trained tech should adjust or replace them.</Text>

      <Toggle label="Lubricated rollers, track and opener" on={insp.lubricated} onPress={() => save((i) => ({ ...i, lubricated: !i.lubricated }))} testID="inspection-lube" />

      {insp.doors.map((d, di) => (
        <View key={d.id} style={styles.stack}>
          <SectionTitle>{`Door ${di + 1}`}</SectionTitle>
          <ChipRow options={DOOR_MAKERS.map((m) => ({ label: m, value: m }))} value={d.maker} onChange={(maker) => save((i) => ({ ...i, doors: i.doors.map((x) => (x.id === d.id ? { ...x, maker } : x)) }))} scroll compact testID={`door-${di}-maker`} />
          <View style={styles.row}>
            <Field label="Size" value={d.size} placeholder="16x7" onChange={(size) => save((i) => ({ ...i, doors: i.doors.map((x) => (x.id === d.id ? { ...x, size } : x)) }))} testID={`door-${di}-size`} />
            <Field label="Year installed" value={d.age} placeholder="2012" onChange={(age) => save((i) => ({ ...i, doors: i.doors.map((x) => (x.id === d.id ? { ...x, age } : x)) }))} testID={`door-${di}-age`} />
          </View>
          <View style={styles.row}>
            <Field label="Spring date code" value={d.springCode} onChange={(springCode) => save((i) => ({ ...i, doors: i.doors.map((x) => (x.id === d.id ? { ...x, springCode } : x)) }))} testID={`door-${di}-spring-code`} />
            <Field label="Spring cycles" value={d.springCycles} placeholder="10,000" onChange={(springCycles) => save((i) => ({ ...i, doors: i.doors.map((x) => (x.id === d.id ? { ...x, springCycles } : x)) }))} testID={`door-${di}-cycles`} />
          </View>
          <SectionItems insp={insp} sectionKey={d.id} job={job} photos={photos.map((p) => p.item ?? '')} onAnswer={answer} onPhoto={media ? takePhoto : undefined} onRepair={addRepair} onRestGood={() => save((i) => restGood(i, d.id))} />

          {d.motors.map((m, mi) => (
            <View key={m.id} style={styles.stack}>
              <Text style={styles.subTitle}>{`Door ${di + 1} · Motor ${mi + 1}`}</Text>
              <ChipRow
                options={MOTOR_MAKERS.map((x) => ({ label: x, value: x }))}
                value={m.maker}
                onChange={(maker) => save((i) => ({ ...i, doors: i.doors.map((x) => (x.id === d.id ? { ...x, motors: x.motors.map((y) => (y.id === m.id ? { ...y, maker } : y)) } : x)) }))}
                scroll
                compact
                testID={`motor-${di}-${mi}-maker`}
              />
              <Field label="Build date" value={m.built} placeholder="2019" onChange={(built) => save((i) => ({ ...i, doors: i.doors.map((x) => (x.id === d.id ? { ...x, motors: x.motors.map((y) => (y.id === m.id ? { ...y, built } : y)) } : x)) }))} testID={`motor-${di}-${mi}-built`} />
              <SectionItems insp={insp} sectionKey={`${d.id}/${m.id}`} job={job} photos={photos.map((p) => p.item ?? '')} onAnswer={answer} onPhoto={media ? takePhoto : undefined} onRepair={addRepair} onRestGood={() => save((i) => restGood(i, `${d.id}/${m.id}`))} />
              <Action
                label={tapAgain(m.id, `Remove motor ${mi + 1}`)}
                onPress={() => guarded(m.id, answered(m.answers), () => save((i) => ({ ...i, doors: i.doors.map((x) => (x.id === d.id ? { ...x, motors: x.motors.filter((y) => y.id !== m.id) } : x)) })))}
                testID={`motor-${di}-${mi}-remove`}
              />
            </View>
          ))}
          <View style={styles.row}>
            <Action label="+ Motor" grow onPress={() => save((i) => ({ ...i, doors: i.doors.map((x) => (x.id === d.id ? { ...x, motors: [...x.motors, newMotor(Date.now(), x.motors.length)] } : x)) }))} testID={`door-${di}-add-motor`} />
            <Action
              label={tapAgain(d.id, `Remove door ${di + 1}`)}
              grow
              onPress={() => guarded(d.id, answered(d.answers) || d.motors.some((m) => answered(m.answers)), () => save((i) => ({ ...i, doors: i.doors.filter((x) => x.id !== d.id) })))}
              testID={`door-${di}-remove`}
            />
          </View>
        </View>
      ))}
      <Action label="+ Door" onPress={() => save((i) => ({ ...i, doors: [...i.doors, newDoor(Date.now(), i.doors.length)] }))} testID="inspection-add-door" />

      <SectionTitle>Gate</SectionTitle>
      <Toggle
        label={armed === 'gate' ? 'Tap again to remove the gate and its answers' : "There's a gate to inspect"}
        on={!!insp.gate}
        onPress={() =>
          insp.gate
            ? guarded('gate', answered(insp.gate.answers), () => save((i) => ({ ...i, gate: undefined })))
            : save((i) => ({ ...i, gate: { type: '', answers: {} } }))
        }
        testID="inspection-gate"
      />
      {insp.gate ? (
        <View style={styles.stack}>
          <ChipRow options={GATE_TYPES} value={insp.gate.type as 'swing' | 'slide'} onChange={(t) => save((i) => ({ ...i, gate: { ...i.gate!, type: t } }))} testID="gate-type" />
          {insp.gate.type ? (
            <>
              <Text style={styles.subTitle}>{insp.gate.type === 'slide' ? 'Slide gate' : 'Swing gate'}</Text>
              <SectionItems insp={insp} sectionKey="gate-type" job={job} photos={photos.map((p) => p.item ?? '')} onAnswer={answer} onPhoto={media ? takePhoto : undefined} onRepair={addRepair} onRestGood={() => save((i) => restGood(i, 'gate-type'))} />
            </>
          ) : null}
          <NavRow label="Gate safety guide" onPress={() => router.push('/manuals')} />
          <Text style={styles.subTitle}>UL 325</Text>
          <SectionItems insp={insp} sectionKey="gate-ul" job={job} photos={photos.map((p) => p.item ?? '')} onAnswer={answer} onPhoto={media ? takePhoto : undefined} onRepair={addRepair} onRestGood={() => save((i) => restGood(i, 'gate-ul'))} />
          <Text style={styles.subTitle}>ASTM F2200, all gates</Text>
          <SectionItems insp={insp} sectionKey="gate-astm" job={job} photos={photos.map((p) => p.item ?? '')} onAnswer={answer} onPhoto={media ? takePhoto : undefined} onRepair={addRepair} onRestGood={() => save((i) => restGood(i, 'gate-astm'))} />
        </View>
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

      <SectionTitle>Repairs</SectionTitle>
      <Text style={styles.note}>Each repair with a price is added to every option on the quote.</Text>
      {insp.repairs.map((r) => (
        <View key={r.id} style={styles.repair} testID={`repair-${r.id}`}>
          <TextInput value={r.label} onChangeText={(label) => setRepair(r.id, { label })} placeholder="Part or repair" placeholderTextColor={colors.muted} accessibilityLabel="Repair name" testID={`repair-name-${r.id}`} style={styles.input} />
          <MeasureField label="Price" value={r.price} onChange={(price) => setRepair(r.id, { price })} unit="dollars" allowFraction={false} placeholder="Tap to set" testID={`repair-price-${r.id}`} />
          <ChipRow options={TAX_OPTIONS} value={r.taxable ? 'yes' : 'no'} onChange={(v) => setRepair(r.id, { taxable: v === 'yes' })} testID={`repair-tax-${r.id}`} />
          <Action label="Remove" onPress={() => save((i) => ({ ...i, repairs: i.repairs.filter((x) => x.id !== r.id) }))} testID={`repair-remove-${r.id}`} />
        </View>
      ))}
      <Action label="Add a repair" onPress={() => addRepair({ id: `r-${Date.now().toString(36)}-${insp.repairs.length}`, label: '', price: '', taxable: true })} testID="repair-add" />

      <SectionTitle>Report</SectionTitle>
      {flagList.length > 0 ? (
        <Text style={styles.note} testID="inspection-flags">
          Flagged: {flagList.map((f) => `${f.section} ${f.label}`).join(', ')}
        </Text>
      ) : null}
      <Action label={signature ? `Signed by ${signature.name || 'customer'} · sign again` : 'Customer signs the report'} onPress={() => setSigning(true)} testID="inspection-sign" />
      <SignatureSheet
        visible={signing}
        title="Sign the inspection report"
        agreement="I have received this inspection report."
        initialName={job.customer}
        onCancel={() => setSigning(false)}
        onSave={(s) => {
          attachments.sign({ for: 'inspection', refId: job.id, ...s });
          setSigning(false);
        }}
      />
      {media ? <Action label={busy === 'pdf' ? 'Making the PDF...' : 'Share PDF report'} primary disabled={!!busy} onPress={sharePdf} testID="inspection-pdf" /> : null}
      {odoo.client ? (
        target ? (
          <Action label={busy === 'odoo' ? 'Sending...' : insp.sent ? `Send to Odoo again (sent to ${insp.sent.to})` : `Save report to ${target.label} in Odoo`} disabled={!!busy || !media?.pdfBase64} onPress={sendToOdoo} testID="inspection-odoo" />
        ) : (
          <Text style={styles.note} testID="inspection-odoo-none">
            To save the report in Odoo, link this job to an Odoo customer first.
          </Text>
        )
      ) : null}
      {note ? (
        <Text style={styles.done} testID="inspection-note" accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}
      <Action label="Quote with repairs" onPress={() => router.push({ pathname: '/quote/[id]', params: { id: job.id } })} testID="inspection-quote" />
      <Action label="Text a summary" onPress={() => Share.share({ message: inspectionText(insp, job.customer) }).catch(() => undefined)} testID="inspection-share" />
    </View>
  );
}

function SectionItems({
  insp,
  sectionKey,
  photos,
  onAnswer,
  onPhoto,
  onRepair,
  onRestGood,
}: {
  insp: Inspection;
  sectionKey: string;
  job: Job;
  /** The item key of each job photo, to count photos per item. */
  photos: string[];
  onAnswer: (key: AnswerKey, patch: Partial<Answer>) => void;
  onPhoto?: (key: AnswerKey) => void;
  onRepair: (r: Repair) => void;
  onRestGood: () => void;
}) {
  const section = sections(insp).find((s) => s.key === sectionKey);
  if (!section) return null;
  const open = section.items.filter((i) => !i.answer?.rating).length;
  return (
    <View style={styles.stack}>
      {section.items.map((i) => (
        <ItemRow
          key={i.key}
          itemKey={i.key}
          def={i.def}
          answer={i.answer}
          photoCount={photos.filter((p) => p === i.key).length}
          hasRepair={insp.repairs.some((r) => r.label === (i.answer?.action.trim() || `${i.def.label}: repair`))}
          onAnswer={(patch) => onAnswer(i.key, patch)}
          onPhoto={onPhoto ? () => onPhoto(i.key) : undefined}
          onRepair={() => onRepair(repairFromFlag({ key: i.key, label: i.def.label, action: i.answer?.action ?? '' }, Date.now(), insp.repairs.length))}
        />
      ))}
      {open > 0 && open < section.items.length ? <Action label={`Mark the other ${open} as good`} onPress={onRestGood} testID={`rest-good-${sectionKey}`} /> : null}
    </View>
  );
}

function ItemRow({
  itemKey,
  def,
  answer,
  photoCount,
  hasRepair,
  onAnswer,
  onPhoto,
  onRepair,
}: {
  itemKey: string;
  def: ItemDef;
  answer: Answer | undefined;
  photoCount: number;
  hasRepair: boolean;
  onAnswer: (patch: Partial<Answer>) => void;
  onPhoto?: () => void;
  onRepair: () => void;
}) {
  const [more, setMore] = useState(false);
  const flagged = isFlagged(answer?.rating);
  // Fair items open too, so they can be offered as add-ons.
  const showMore = flagged || answer?.rating === 'fair' || more || !!answer?.note || !!answer?.action;
  return (
    <View style={[styles.item, flagged && styles.itemFlag]} testID={`item-${itemKey}`}>
      <Text style={styles.itemTitle}>
        {def.label}
        {def.pro ? '  · PRO' : ''}
      </Text>
      <View style={styles.choices}>
        {SCALES[def.scale].map((r: Rating) => {
          const on = answer?.rating === r;
          const bad = isFlagged(r);
          return (
            <Pressable
              key={r}
              onPress={() => onAnswer({ rating: on ? undefined : r })}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${def.label}: ${RATING_LABEL[r]}`}
              testID={`item-${itemKey}-${r}`}
              style={({ pressed }) => [styles.choice, on && (bad ? styles.choiceBad : styles.choiceOn), pressed && !on && styles.pressed]}
            >
              <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{RATING_LABEL[r]}</Text>
            </Pressable>
          );
        })}
      </View>
      {showMore ? (
        <>
          <TextInput value={answer?.note ?? ''} onChangeText={(note) => onAnswer({ note })} placeholder="Note" placeholderTextColor={colors.muted} accessibilityLabel={`${def.label} note`} testID={`item-${itemKey}-note`} style={styles.input} />
          <TextInput value={answer?.action ?? ''} onChangeText={(action) => onAnswer({ action })} placeholder="Action (e.g. Replace rollers)" placeholderTextColor={colors.muted} accessibilityLabel={`${def.label} action`} testID={`item-${itemKey}-action`} style={styles.input} />
          <View style={styles.row}>
            {onPhoto ? <Action label={photoCount ? `Photo (${photoCount})` : 'Photo'} grow onPress={onPhoto} testID={`item-${itemKey}-photo`} /> : null}
            {!hasRepair ? <Action label="Add as repair" grow onPress={onRepair} testID={`item-${itemKey}-repair`} /> : null}
          </View>
        </>
      ) : (
        <Pressable onPress={() => setMore(true)} accessibilityRole="button" testID={`item-${itemKey}-more`} style={styles.moreLink}>
          <Text style={styles.moreText}>Note, photo, action{photoCount ? ` · ${photoCount} photo${photoCount === 1 ? '' : 's'}` : ''}</Text>
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

function Field({ label, value, onChange, placeholder, testID }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; testID: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} accessibilityLabel={label} testID={testID} style={styles.input} />
    </View>
  );
}

function NavRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={styles.moreLink}>
      <Text style={styles.moreText}>{label} ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  for: { fontSize: type.value, fontWeight: '900', color: colors.text },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderWidth: 3, borderColor: colors.border, borderRadius: 12, padding: 8, alignItems: 'center' },
  statWarn: { borderColor: colors.stop },
  statBig: { fontSize: type.big, fontWeight: '900', color: colors.text },
  statWarnText: { color: colors.stop },
  statLabel: { fontSize: 15, fontWeight: '800', color: colors.muted },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  done: { fontSize: type.body, fontWeight: '800', color: colors.text },
  subTitle: { fontSize: type.body, fontWeight: '900', color: colors.text, marginTop: 4 },
  item: { padding: 12, gap: 8, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg },
  itemFlag: { borderWidth: 4, borderColor: colors.stop },
  itemTitle: { fontSize: type.body, fontWeight: '900', color: colors.text },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { flexGrow: 1, minWidth: 64, minHeight: touch.min, paddingHorizontal: 8, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  choiceOn: { backgroundColor: colors.selected, borderColor: colors.selected },
  choiceBad: { backgroundColor: colors.stop, borderColor: colors.stop },
  choiceText: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center' },
  choiceTextOn: { color: colors.onSelected },
  moreLink: { minHeight: 44, justifyContent: 'center' },
  moreText: { fontSize: 16, fontWeight: '800', color: colors.text, textDecorationLine: 'underline' },
  repair: { padding: 12, gap: 8, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card },
  field: { flex: 1, gap: 4 },
  fieldLabel: { fontSize: 15, fontWeight: '800', color: colors.muted },
  input: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: touch.min },
  box: { width: 32, height: 32, borderRadius: 6, borderWidth: 3, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.selected, borderColor: colors.selected },
  tick: { color: colors.onSelected, fontSize: 20, fontWeight: '900' },
  toggleText: { flex: 1, fontSize: type.body, fontWeight: '800', color: colors.text },
  pressed: { backgroundColor: colors.safety },
});
