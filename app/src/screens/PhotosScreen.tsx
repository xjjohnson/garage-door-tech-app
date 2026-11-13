import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Segmented } from '../components/controls';
import { JobPhoto, PHOTO_KINDS, PHOTO_LABEL, PhotoKind, photosFor } from '../lib/attachments';
import { formatJobDate } from '../lib/jobs';
import { useAttachments } from '../lib/useAttachments';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type } from '../theme';

/**
 * Before and after photos for one job: the old spring, the cable, the
 * finished door. Taken with the camera or picked from the gallery, kept in the
 * app's own folder. Signed in to Odoo, each one also goes to the job in Odoo
 * (src/components/OdooPhotoSync.tsx).
 */
export function PhotosScreen({ jobId }: { jobId: string }) {
  const { photos, media, addPhotos, setPhotoKind, removePhoto } = useAttachments();
  const [kind, setKind] = useState<PhotoKind>('before');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const list = photosFor({ photos, signatures: [] }, jobId);
  const { client } = useOdoo();
  const odooJob = useJobs().jobs.find((j) => j.id === jobId)?.odooJob;
  const where = !client
    ? 'Photos stay on this phone until you sign in to Odoo, then they go to the job in Odoo.'
    : odooJob
      ? `Photos go to ${odooJob.name || 'the job'} in Odoo when there's signal.`
      : 'Photos go to the job in Odoo once the job is there.';

  const run = async (fn: () => Promise<string[]>) => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const uris = await fn();
      if (uris.length > 0) addPhotos(jobId, uris, kind);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.stack} testID="photos">
      {!media ? <Text style={styles.note}>Photos need the phone app.</Text> : null}
      <Text style={styles.label}>New photos go under</Text>
      <Segmented options={PHOTO_KINDS.map((k) => ({ label: PHOTO_LABEL[k], value: k }))} value={kind} onChange={setKind} testID="photos-kind" />
      <View style={styles.row}>
        <Action label="Take a photo" primary grow disabled={!media || busy} onPress={() =>
            run(async () => {
              const uri = await media!.takePhoto();
              return uri ? [uri] : [];
            })
          } testID="photos-take" />
        <Action label="From gallery" grow disabled={!media || busy} onPress={() => run(() => media!.pickPhotos())} testID="photos-pick" />
      </View>
      {error ? <Text style={styles.note}>Couldn't get that photo. Check the app is allowed to use the camera and photos.</Text> : null}
      <Text style={styles.note} testID="photos-where">
        {list.length === 0 ? 'No photos for this job yet. ' : ''}
        {where}
      </Text>
      {PHOTO_KINDS.map((k) => {
        const group = list.filter((p) => p.kind === k);
        if (group.length === 0) return null;
        return (
          <View key={k} style={styles.stack}>
            <Text style={styles.section}>
              {PHOTO_LABEL[k]} ({group.length})
            </Text>
            {group.map((p) => (
              <Photo key={p.id} p={p} onKind={(x) => setPhotoKind(p.id, x)} onShare={media ? () => media.sharePhoto(p.uri).catch(() => undefined) : undefined} onRemove={() => removePhoto(p.id)} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function Photo({ p, onKind, onShare, onRemove }: { p: JobPhoto; onKind: (k: PhotoKind) => void; onShare?: () => void; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <View style={styles.item} testID={`photo-${p.id}`}>
      <Image source={{ uri: p.uri }} style={styles.image} resizeMode="cover" accessibilityLabel={`${PHOTO_LABEL[p.kind]} photo`} />
      <Text style={styles.meta}>
        {formatJobDate(p.at)}
        {p.odooId ? ' · In Odoo ✓' : ''}
      </Text>
      <Segmented options={PHOTO_KINDS.map((k) => ({ label: PHOTO_LABEL[k], value: k }))} value={p.kind} onChange={onKind} testID={`photo-kind-${p.id}`} />
      <View style={styles.row}>
        {onShare ? <Action label="Share" grow onPress={onShare} testID={`photo-share-${p.id}`} /> : null}
        {confirm ? (
          <Action label="Tap again to delete" grow onPress={onRemove} testID={`photo-delete-yes-${p.id}`} />
        ) : (
          <Action label="Delete" grow onPress={() => setConfirm(true)} testID={`photo-delete-${p.id}`} />
        )}
      </View>
    </View>
  );
}

function Action({ label, onPress, primary, grow, disabled, testID }: { label: string; onPress: () => void; primary?: boolean; grow?: boolean; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [styles.button, grow && styles.grow, primary && styles.primary, disabled && styles.off, pressed && styles.pressed]}
    >
      {({ pressed }) => <Text style={[styles.buttonText, primary && !pressed && styles.primaryText]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  section: { fontSize: type.value, fontWeight: '900', color: colors.text, marginTop: 8 },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  item: { padding: 10, gap: 8, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8, backgroundColor: colors.card },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  primaryText: { color: colors.onSelected },
  off: { opacity: 0.5 },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
});
