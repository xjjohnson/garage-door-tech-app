import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { customerTargets, FileTarget, fileData, imageUrl, listFiles, OdooFile, THUMB_MAX_BYTES, THUMB_MAX_COUNT } from '../lib/odooFiles';
import { formatJobDate } from '../lib/jobs';
import { useAttachments } from '../lib/useAttachments';
import { useOdoo } from '../lib/useOdoo';
import { jobsModel } from '../lib/odooReports';
import { colors, touch, type, bw, fs, rad } from '../theme';

/**
 * What Odoo holds for a job: photos from every phone as a grid (tap to see one
 * big) and documents as rows (tap to open). Photos this phone already shows
 * above are left out. Signed in only; read only.
 */
export function OdooFiles({ targets, mine }: { targets: FileTarget[]; mine: number[] }) {
  const { client } = useOdoo();
  const { media } = useAttachments();
  const [files, setFiles] = useState<OdooFile[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [big, setBig] = useState<{ file: OdooFile; uri: string } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const key = targets.map((t) => `${t.model}:${t.id}`).join(',');
  const have = useRef(new Set<number>());

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setFiles(await listFiles(client, targets));
      setFailed(false);
    } catch {
      setFailed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);
  useEffect(() => {
    load();
  }, [load]);

  const shown = (files ?? []).filter((f) => !mine.includes(f.id));
  const photos = shown.filter((f) => f.kind === 'image');
  const docs = shown.filter((f) => f.kind !== 'image');

  useEffect(() => {
    if (!client) return;
    let live = true;
    (async () => {
      for (const f of photos.filter((p) => p.size <= THUMB_MAX_BYTES).slice(0, THUMB_MAX_COUNT)) {
        if (have.current.has(f.id)) continue;
        have.current.add(f.id);
        try {
          const uri = await imageUrl(client, f);
          if (live) setThumbs((t) => ({ ...t, [f.id]: uri }));
        } catch {
          have.current.delete(f.id);
        }
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, files]);

  if (!client) return null;

  const openPhoto = async (f: OdooFile) => {
    setBusy(f.id);
    try {
      setBig({ file: f, uri: thumbs[f.id] ?? (await imageUrl(client, f)) });
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };
  const openDoc = async (f: OdooFile) => {
    if (!media?.openPdf || f.kind !== 'pdf') return;
    setBusy(f.id);
    try {
      await media.openPdf(await fileData(client, f.id), f.name);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.stack} testID="odoo-files">
      <Text style={styles.section}>In Odoo{files ? ` (${shown.length})` : ''}</Text>
      {files === null && !failed ? <Text style={styles.note}>Looking in Odoo…</Text> : null}
      {failed ? <Text style={styles.note} testID="odoo-files-error">Couldn&apos;t reach Odoo for the files. Try again when there&apos;s signal.</Text> : null}
      {files && shown.length === 0 ? <Text style={styles.note}>Nothing else is attached to this job in Odoo.</Text> : null}
      {photos.length > 0 ? (
        <View style={styles.grid}>
          {photos.map((f) => (
            <Pressable key={f.id} onPress={() => openPhoto(f)} accessibilityRole="button" accessibilityLabel={`Open ${f.name}`} testID={`odoo-photo-${f.id}`} style={styles.tile}>
              {thumbs[f.id] ? <Image source={{ uri: thumbs[f.id] }} style={styles.thumb} resizeMode="cover" /> : <View style={[styles.thumb, styles.empty]}><Text style={styles.small}>{busy === f.id ? '…' : 'Tap to open'}</Text></View>}
            </Pressable>
          ))}
        </View>
      ) : null}
      {docs.map((f) => (
        <Pressable key={f.id} onPress={() => openDoc(f)} disabled={f.kind !== 'pdf' || !media?.openPdf} accessibilityRole="button" testID={`odoo-doc-${f.id}`} style={styles.row}>
          <View style={styles.icon}><Text style={styles.iconText}>{f.kind === 'pdf' ? 'PDF' : 'FILE'}</Text></View>
          <View style={styles.grow}>
            <Text style={styles.name}>{f.name}</Text>
            <Text style={styles.small}>{f.at ? `${formatJobDate(f.at)} · ` : ''}{busy === f.id ? 'Opening…' : f.kind === 'pdf' ? 'In Odoo' : 'In Odoo · open it on the Odoo website'}</Text>
          </View>
        </Pressable>
      ))}
      <Modal visible={!!big} transparent animationType="fade" onRequestClose={() => setBig(null)}>
        <View style={styles.modal} testID="odoo-photo-big">
          {big ? <Image source={{ uri: big.uri }} style={styles.full} resizeMode="contain" accessibilityLabel={big.file.name} /> : null}
          <Text style={styles.cap}>{big?.file.name}</Text>
          <Pressable onPress={() => setBig(null)} accessibilityRole="button" testID="odoo-photo-close" style={styles.close}>
            <Text style={styles.closeText}>Back</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  section: { fontSize: type.value, fontWeight: '800', color: colors.text, marginTop: 8 },
  note: { fontSize: fs(16), color: colors.muted, lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { width: '32%', aspectRatio: 1 },
  thumb: { flex: 1, borderRadius: rad(10), backgroundColor: colors.card },
  empty: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border },
  icon: { width: 40, height: 48, borderRadius: rad(6), backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: fs(11), fontWeight: '800', color: colors.text },
  grow: { flex: 1 },
  name: { fontSize: type.body, fontWeight: '700', color: colors.text },
  small: { fontSize: fs(14), color: colors.muted },
  modal: { flex: 1, backgroundColor: '#000', justifyContent: 'center', padding: 12 },
  full: { flex: 1 },
  cap: { color: '#fff', fontSize: fs(14), textAlign: 'center', marginVertical: 8 },
  close: { minHeight: touch.min, borderRadius: rad(14), backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: type.body, fontWeight: '800', color: '#000' },
});

/** Every file on every job, order and invoice of one customer (the customer's Files tab). */
export function CustomerFiles({ partnerId }: { partnerId: number }) {
  const { client } = useOdoo();
  const [targets, setTargets] = useState<FileTarget[] | null>(null);
  useEffect(() => {
    if (!client) return;
    let live = true;
    customerTargets(client, partnerId, jobsModel(client)).then((t) => live && setTargets(t));
    return () => {
      live = false;
    };
  }, [client, partnerId]);
  if (!client) return <Text style={styles.note}>Sign in to Odoo to see this customer&apos;s files.</Text>;
  if (!targets) return <Text style={styles.note}>Looking in Odoo…</Text>;
  return <OdooFiles targets={targets} mine={[]} />;
}
