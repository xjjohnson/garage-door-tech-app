/**
 * Sends inspection voice notes and signed reports to the job's Field Service
 * order in the background. Each voice note is attached to the order once the
 * job is in Odoo, so a lost phone doesn't lose it.
 *
 * Sends a signed inspection report to the job's Field Service order in the
 * background while signed in, so it's in Odoo without the tech tapping Save
 * to Odoo: a PDF attached to the order, with a chatter note listing the
 * flagged items. It goes shortly after signing, when the app comes back, and
 * every few minutes; signing again sends it again. Only reports signed after
 * this first ran on the phone go on their own, so an update doesn't send old
 * reports in bulk. Renders nothing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { log } from '../lib/log';
import type { Inspection } from '../lib/inspection';
import { equipmentReady, equipmentToSend, orderLocation, sendEquipment } from '../lib/odooEquipment';
import { setSurveyStatus } from '../lib/surveyStatus';
import { surveyIndex, surveyNote, SurveyIndex, sendSurveys, surveysToSend } from '../lib/odooSurveyAnswers';
import { jobTarget, reportNote, reportsToSend, sendReport, sendVoice, voiceToSend } from '../lib/odooReports';
import { MAX_ODOO_PDF_BASE64, pdfName } from '../lib/pdf';
import { inspectionReportHtml } from '../lib/reportFiles';
import { onSyncNow } from '../lib/syncNow';
import { useAppForeground } from '../lib/useAppForeground';
import { useAttachments } from '../lib/useAttachments';
import { useFollowUps } from '../lib/useFollowUps';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';

/** When this phone started sending signed reports on its own. */
export const REPORT_SYNC_SINCE_KEY = 'johnsons.reportSync.since';

const EVERY_MS = 5 * 60_000;
const AFTER_CHANGE_MS = 3000;
/** Voice notes sent in one pass, so a slow signal isn't tied up. */
const VOICE_BATCH = 4;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function OdooReportSync() {
  const { status, client } = useOdoo();
  const { jobs, loaded: jobsLoaded, setInspection } = useJobs();
  const attachments = useAttachments();
  const { business, invoices } = useInvoices();
  const { settings: followSettings } = useFollowUps();
  const [since, setSince] = useState<number | null>(null);
  const running = useRef(false);
  /** Reports too big for Odoo, by job and signing time, so they aren't remade every pass. */
  const tooBig = useRef(new Set<string>());
  const latest = useRef({ jobs, attachments, business, invoices, followSettings });
  latest.current = { jobs, attachments, business, invoices, followSettings };

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(REPORT_SYNC_SINCE_KEY)
      .catch(() => null)
      .then(async (v) => {
        let at = Number(v);
        if (!v || !Number.isFinite(at)) {
          at = Date.now();
          await AsyncStorage.setItem(REPORT_SYNC_SINCE_KEY, String(at)).catch(() => undefined);
        }
        if (live) setSince(at);
      });
    return () => {
      live = false;
    };
  }, []);

  const media = attachments.media;
  const make = media?.pdfBase64;
  const readFile = media?.fileBase64;
  const online = status === 'signedIn' && !!client && !!make && attachments.loaded && jobsLoaded && since !== null;
  const waiting = online ? reportsToSend(jobs, attachments.signatures, since).filter((r) => !tooBig.current.has(`${r.job.id}@${r.signedAt}`)).length + (readFile ? voiceToSend(jobs, since).length : 0) : 0;

  const surveysWaiting = online ? surveysToSend(jobs, attachments.signatures, since!).length : 0;
  const equipmentWaiting = online ? equipmentToSend(jobs, attachments.signatures, invoices, followSettings, since).length : 0;

  const pass = useCallback(async () => {
    if (!client || !make || since === null || running.current) return;
    running.current = true;
    try {
      // Voice notes sent this pass (job → note → attachment), put on the job with every save below,
      // since the saved job may not have caught up with an earlier save yet.
      const marks = new Map<string, Map<string, number>>();
      const marked = (jobId: string, insp: Inspection): Inspection => {
        const m = marks.get(jobId);
        return m ? { ...insp, voice: insp.voice.map((n) => (m.has(n.id) ? { ...n, odooId: m.get(n.id) } : n)) } : insp;
      };
      const current = (jobId: string) => latest.current.jobs.find((j) => j.id === jobId)?.inspection;
      if (readFile) {
        for (const { jobId, note, ref } of voiceToSend(latest.current.jobs, since).slice(0, VOICE_BATCH)) {
          try {
            const data = await readFile(note.uri);
            if (!data) continue;
            const id = await sendVoice(client, ref, note, data);
            if (!marks.has(jobId)) marks.set(jobId, new Map());
            marks.get(jobId)!.set(note.id, id);
            const insp = current(jobId);
            if (insp) setInspection(jobId, marked(jobId, insp));
          } catch (e) {
            log.warn('odoo', `voice note to ${ref.name}: ${message(e)}`);
            break;
          }
        }
      }
      const { jobs: all, attachments: a, business: biz } = latest.current;
      for (const { job, signedAt } of reportsToSend(all, a.signatures, since)) {
        const key = `${job.id}@${signedAt}`;
        if (tooBig.current.has(key)) continue;
        const target = jobTarget(job.odooJob);
        try {
          const html = await inspectionReportHtml(job, a, a.media, biz, { inspector: client.session.name || biz.name });
          const pdf = await make(html);
          if (pdf.length > MAX_ODOO_PDF_BASE64) {
            tooBig.current.add(key);
            log.warn('inspect', `report for ${target.label} is too big for Odoo; use Share PDF`);
            continue;
          }
          await sendReport(client, target, pdfName('Inspection', job.customer), pdf, reportNote(job.inspection));
          log.info('inspect', `signed report sent to ${target.model} ${target.id}`);
          // Read the job again: the tech may have changed the inspection while the PDF was made.
          setInspection(job.id, { ...marked(job.id, current(job.id) ?? job.inspection), sent: { at: Date.now(), to: target.label } });
        } catch (e) {
          log.warn('odoo', `report to ${target.label}: ${message(e)}`);
          break;
        }
      }
      // Doors and openers as equipment on the house's location; a failure here doesn't hold up reports.
      const sent = equipmentToSend(latest.current.jobs, latest.current.attachments.signatures, latest.current.invoices, latest.current.followSettings, since);
      if (sent.length) {
        const ready = await equipmentReady(client);
        for (const { job, items, key } of ready ? sent : []) {
          try {
            const loc = await orderLocation(client, job.odooJob.id);
            if (!loc) continue;
            const n = await sendEquipment(client, loc, items, ready!.htmlNotes);
            log.info('odoo', `${n} door/opener record(s) on location ${loc}`);
            const insp = latest.current.jobs.find((j) => j.id === job.id)?.inspection ?? job.inspection;
            setInspection(job.id, { ...insp, equipment: { at: Date.now(), key } });
          } catch (e) {
            log.warn('odoo', `equipment for ${job.odooJob.name}: ${message(e)}`);
            break;
          }
        }
      }
      // Filled-in Odoo surveys; skipped until the Survey app and the three surveys are in Odoo. A failure doesn't hold up anything else.
      const toSurvey = surveysToSend(latest.current.jobs, latest.current.attachments.signatures, since);
      if (toSurvey.length) {
        try {
          const idx: SurveyIndex | null = await surveyIndex(client);
          if (!idx) setSurveyStatus({ at: Date.now(), ok: false, text: `${toSurvey.length} inspection(s) waiting, but the Survey app or one of the three surveys isn't in Odoo. Open Settings › Inspection checklists and create them.` });
          for (const { job, inputs, key } of idx ? toSurvey : []) {
            const target = jobTarget(job.odooJob);
            const before = job.inspection.surveys?.ids ?? {};
            const [o] = (await client.call('fsm.order', 'read', [[job.odooJob.id]], { fields: ['partner_id'] })) as { partner_id?: unknown }[];
            const partner = Array.isArray(o?.partner_id) ? (o!.partner_id as number[])[0] : undefined;
            const { ids, created } = await sendSurveys(client, idx!, inputs, before, partner);
            if (created.length) await client.call('fsm.order', 'message_post', [[target.id]], { body: surveyNote(created, ids), message_type: 'comment', subtype_xmlid: 'mail.mt_note' }).catch(() => undefined);
            const insp = latest.current.jobs.find((j) => j.id === job.id)?.inspection ?? job.inspection;
            setInspection(job.id, { ...insp, surveys: { at: Date.now(), key, ids } });
            log.info('inspect', `${inputs.length} survey(s) for ${target.label}`);
            setSurveyStatus({ at: Date.now(), ok: true, text: `Saved ${inputs.length} survey answer(s) for ${target.label}.` });
          }
        } catch (e) {
          log.warn('odoo', `inspection surveys: ${message(e)}`);
          setSurveyStatus({ at: Date.now(), ok: false, text: `Odoo refused the survey answers: ${message(e)}` });
        }
      }
    } finally {
      running.current = false;
    }
  }, [client, make, readFile, since, setInspection]);

  useEffect(() => {
    if (!online || waiting + equipmentWaiting + surveysWaiting === 0) return;
    const t = setTimeout(pass, AFTER_CHANGE_MS);
    return () => clearTimeout(t);
  }, [online, waiting, equipmentWaiting, surveysWaiting, pass]);

  useEffect(() => {
    if (!online) return;
    const t = setInterval(pass, EVERY_MS);
    return () => clearInterval(t);
  }, [online, pass]);

  useAppForeground(useCallback(() => online && pass(), [online, pass]));
  useEffect(() => (online ? onSyncNow(pass) : undefined), [online, pass]);
  return null;
}
