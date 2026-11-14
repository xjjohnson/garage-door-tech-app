/**
 * A Notes section for a record in Odoo (a job, a customer, a house): every
 * note and message in its chatter, newest first, and an Add note box with
 * photos and a voice note. A new note goes to the phone's outbox first, so it
 * works with no signal and is sent in the background (OdooNotesSync). The last
 * read is kept for no signal. Notes are internal only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { log } from '../lib/log';
import type { VoiceNote } from '../lib/inspection';
import { cacheNotes, fetchNotes, NoteRow, NoteTarget, onOutboxChange, PendingNote, queueNote, readCachedNotes, readOutbox, dropFromOutbox } from '../lib/odooNotes';
import { dayLabel, formatTime } from '../lib/schedule';
import { requestSyncNow } from '../lib/syncNow';
import { useAttachments } from '../lib/useAttachments';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type } from '../theme';
import { Action } from './Buttons';
import { VoiceNotes } from './VoiceNotes';

export function OdooNotes({ target: given, title = 'Notes', now = Date.now, testID = 'notes' }: { target: NoteTarget; title?: string; now?: () => number; testID?: string }) {
  const { client } = useOdoo();
  const target = useMemo<NoteTarget>(() => ({ model: given.model, id: given.id }), [given.model, given.id]);
  const { media } = useAttachments();
  const [rows, setRows] = useState<NoteRow[] | null>(null);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState<PendingNote[]>([]);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [voice, setVoice] = useState<VoiceNote[]>([]);
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState('');
  const asked = useRef(0);
  const key = `${target.model}:${target.id}`;

  const mine = useCallback(async () => setWaiting((await readOutbox()).filter((n) => `${n.target.model}:${n.target.id}` === key)), [key]);

  const refresh = useCallback(async () => {
    if (!client) return;
    const n = ++asked.current;
    try {
      const got = await fetchNotes(client, target);
      if (n !== asked.current) return;
      setRows(got);
      setError('');
      cacheNotes(target, got);
    } catch (e) {
      if (n !== asked.current) return;
      setError(e instanceof Error ? e.message : String(e));
      log.warn('odoo', `notes: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [client, target]);

  useEffect(() => {
    readCachedNotes(target).then((c) => c && setRows((r) => r ?? c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    mine();
    // When the outbox empties, the notes that just went should appear.
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = onOutboxChange(() => {
      mine();
      if (t) clearTimeout(t);
      t = setTimeout(refresh, 1500);
    });
    return () => {
      off();
      if (t) clearTimeout(t);
    };
  }, [mine, refresh]);

  const cleared = () => {
    setText('');
    setPhotos([]);
    setVoice([]);
    setProblem('');
    setOpen(false);
  };
  const add = async () => {
    if (!text.trim() && photos.length === 0 && voice.length === 0) {
      setProblem('Write something, or add a photo or voice note.');
      return;
    }
    await queueNote({ target, body: text, photos, voice: voice.map((v) => ({ uri: v.uri, seconds: v.seconds, at: v.at })) }, now());
    cleared();
    requestSyncNow();
  };
  const take = async () => {
    const uri = await media?.takePhoto().catch(() => null);
    if (uri) setPhotos((p) => [...p, uri]);
  };
  const pick = async () => {
    const uris = (await media?.pickPhotos().catch(() => [])) ?? [];
    if (uris.length) setPhotos((p) => [...p, ...uris]);
  };
  const removePhoto = (uri: string) => {
    setPhotos((p) => p.filter((x) => x !== uri));
    media?.deletePhoto(uri);
  };
  const t0 = now();
  const when = (at: number) => `${dayLabel(at, t0)} ${formatTime(at)}`;
  const count = (rows?.length ?? 0) + waiting.length;

  return (
    <View style={styles.stack} testID={testID}>
      <Text style={styles.section} accessibilityRole="header">
        {title}
        {count ? ` (${count})` : ''}
      </Text>
      {error ? (
        <Text style={styles.error} testID={`${testID}-error`}>
          Couldn&apos;t read Odoo: {error}
          {rows ? ' Showing the last notes read.' : ''}
        </Text>
      ) : null}

      {open ? (
        <View style={styles.form} testID={`${testID}-form`}>
          <TextInput value={text} onChangeText={setText} multiline placeholder="Write a note" placeholderTextColor={colors.muted} accessibilityLabel="Note" style={styles.input} testID={`${testID}-text`} />
          {photos.length ? (
            <View style={styles.thumbs}>
              {photos.map((p) => (
                <View key={p} style={styles.thumb}>
                  <Image source={{ uri: p }} style={styles.img} accessibilityLabel="Photo on this note" />
                  <Action label="Remove" onPress={() => removePhoto(p)} testID={`${testID}-photo-remove`} />
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.row}>
            {media ? <Action label="Take photo" grow onPress={take} testID={`${testID}-photo`} /> : null}
            {media ? <Action label="Gallery" grow onPress={pick} testID={`${testID}-gallery`} /> : null}
          </View>
          <VoiceNotes notes={voice} keepFile={media?.keepFile} onAdd={(n) => setVoice((v) => [...v, n])} onRemove={(id) => setVoice((v) => v.filter((x) => x.id !== id))} />
          {problem ? <Text style={styles.error}>{problem}</Text> : null}
          <View style={styles.row}>
            <Action label="Add note" primary grow onPress={add} testID={`${testID}-save`} />
            <Action label="Cancel" grow onPress={cleared} testID={`${testID}-cancel`} />
          </View>
          <Text style={styles.meta}>Internal only. The customer never gets this.</Text>
        </View>
      ) : (
        <Action label="Add note" onPress={() => setOpen(true)} testID={`${testID}-add`} />
      )}

      {waiting.map((n) => (
        <View key={n.id} style={[styles.item, styles.waiting]} testID={`${testID}-waiting-${n.id}`}>
          <Text style={styles.who}>
            You · {when(n.at)} · waiting to send
          </Text>
          {n.body ? <Text style={styles.body}>{n.body}</Text> : null}
          {n.photos.length || n.voice.length ? (
            <Text style={styles.meta}>
              {[n.photos.length ? `${n.photos.length} photo${n.photos.length === 1 ? '' : 's'}` : '', n.voice.length ? `${n.voice.length} voice note${n.voice.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ')}
            </Text>
          ) : null}
          <Action label="Discard" onPress={() => dropFromOutbox(n.id)} testID={`${testID}-discard-${n.id}`} />
        </View>
      ))}
      {rows === null && client ? <Text style={styles.meta}>Reading Odoo...</Text> : null}
      {(rows ? rows.length === 0 : !client) && waiting.length === 0 ? <Text style={styles.meta}>No notes yet.</Text> : null}
      {(rows ?? []).map((r) => (
        <View key={r.id} style={styles.item} testID={`${testID}-row-${r.id}`}>
          <Text style={styles.who}>
            {r.who} · {when(r.at)}
          </Text>
          {r.body ? <Text style={styles.body}>{r.body}</Text> : null}
          {r.files.map((f, i) => (
            <Text key={`${f}${i}`} style={styles.meta}>
              Attached: {f}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  section: { fontSize: type.body, fontWeight: '800', color: colors.text, marginTop: 8 },
  form: { gap: 8 },
  input: { minHeight: touch.min * 2, borderWidth: 2, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: type.body, color: colors.text, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 110, gap: 4 },
  img: { width: 110, height: 110, borderRadius: 8 },
  item: { borderWidth: 2, borderColor: colors.border, borderRadius: 8, padding: 10, gap: 4 },
  waiting: { borderStyle: 'dashed' },
  who: { fontSize: type.body, fontWeight: '700', color: colors.text },
  body: { fontSize: type.body, color: colors.text },
  meta: { fontSize: type.body, color: colors.muted },
  error: { fontSize: type.body, color: colors.stop },
});
