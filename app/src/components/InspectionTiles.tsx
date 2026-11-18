import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { Action } from './Buttons';
import { ChipRow, MeasureField } from './controls';
import { KeyboardBackdrop } from './KeyboardBackdrop';
import { PartPickerSheet } from './PartPickerSheet';
import { JobPhoto } from '../lib/attachments';
import { Answer, AnswerKey, isBad, isFlagged, ItemDef, RATING_LABEL, Rating, Repair, repairFromPart, SCALES, Section } from '../lib/inspection';
import { PriceBookItem } from '../lib/priceBook';
import { cents, formatMoney } from '../lib/prices';
import { colors, touch, type } from '../theme';

const TAX_OPTIONS = [
  { label: 'Taxed (parts)', value: 'yes' as const },
  { label: 'No tax (labor)', value: 'no' as const },
];

type SectionItem = Section['items'][number];

/** The tile groups for one checklist section: springs and cables (PRO items) apart from the rest. */
export function tileGroups(section: Section, plain = 'Frame and panels'): { title: string; items: SectionItem[] }[] {
  const pro = section.items.filter((i) => i.def.pro);
  const rest = section.items.filter((i) => !i.def.pro);
  const compliance = rest.filter((i) => i.def.scale === 'compliance');
  const other = rest.filter((i) => i.def.scale !== 'compliance');
  const groups: { title: string; items: SectionItem[] }[] = [];
  if (other.length) groups.push({ title: pro.length || compliance.length ? plain : '', items: other });
  if (pro.length) groups.push({ title: 'Springs and cables · PRO', items: pro });
  if (compliance.length) groups.push({ title: 'Safety and settings', items: compliance });
  return groups;
}

/** What a tap on the tile does: the first rating on its scale is "Good" (Good, Compliant or Pass). */
export const goodOf = (def: ItemDef): Rating => SCALES[def.scale][0];

/** Every item the tech still has to look at, in page order. */
export const uncheckedItems = (sections: Section[]): SectionItem[] => sections.flatMap((s) => s.items).filter((i) => !i.answer?.rating);

/**
 * The tiles of one or more checklist sections in three columns. A blank tile is
 * dashed. One tap marks it Good (green); a tap on a Good tile clears it; a hold
 * (or a tap on any other tile) opens its pop-up.
 */
export function TileGrid({
  groups,
  repairFor,
  photoCount,
  onTap,
  onOpen,
}: {
  groups: { title: string; items: SectionItem[] }[];
  repairFor: (key: AnswerKey) => Repair | undefined;
  photoCount: (key: AnswerKey) => number;
  onTap: (item: SectionItem) => void;
  onOpen: (item: SectionItem) => void;
}) {
  return (
    <View style={styles.groups}>
      {groups.map((g, n) => (
        <View key={`${g.title}-${n}`} style={styles.groupBox}>
          {g.title ? <Text style={styles.groupTitle}>{g.title}</Text> : null}
          <View style={styles.grid}>
            {g.items.map((i) => (
              <Tile key={i.key} item={i} repaired={!!repairFor(i.key)} photos={photoCount(i.key)} onTap={() => onTap(i)} onOpen={() => onOpen(i)} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function Tile({ item, repaired, photos, onTap, onOpen }: { item: SectionItem; repaired: boolean; photos: number; onTap: () => void; onOpen: () => void }) {
  const r = item.answer?.rating;
  const good = r === goodOf(item.def);
  const bad = isBad(r);
  const flagged = isFlagged(r);
  const filled = !!r;
  const light = filled; // filled tiles use light text on a solid colour
  const label = r ? RATING_LABEL[r] : 'Tap';
  return (
    <Pressable
      onPress={() => (r && !good ? onOpen() : onTap())}
      onLongPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${item.def.label}: ${r ? RATING_LABEL[r] : 'not checked'}`}
      testID={`tile-${item.key}`}
      style={({ pressed }) => [styles.tile, !filled && styles.tileBlank, filled && (bad ? styles.tileBad : flagged ? styles.tileFair : styles.tileGood), pressed && styles.pressed]}
    >
      <Text style={[styles.tileTitle, light && styles.onColor]} numberOfLines={3}>
        {item.def.label}
      </Text>
      <Text style={[styles.tileState, light && styles.onColor]}>
        {label}
        {item.answer?.note?.trim() ? ' · ✎' : ''}
        {photos ? ` · ▣${photos > 1 ? photos : ''}` : ''}
      </Text>
      {repaired ? (
        <View style={styles.badge} testID={`tile-${item.key}-repair`}>
          <Text style={styles.badgeText}>repair added</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * The pop-up for one tile: last time's note, the rating, a note, photos, N/A and
 * the suggested repair (a part picked from the price book, or one typed).
 */
export function ItemSheet({
  item,
  last,
  repair,
  photos,
  onAnswer,
  onTakePhoto,
  onRepair,
  onRepairPatch,
  onRepairRemove,
  onClose,
}: {
  item: SectionItem;
  last: string | undefined;
  repair: Repair | undefined;
  photos: JobPhoto[];
  onAnswer: (patch: Partial<Answer>) => void;
  onTakePhoto?: () => void;
  onRepair: (r: Repair) => void;
  onRepairPatch: (id: string, patch: Partial<Repair>) => void;
  onRepairRemove: (id: string) => void;
  onClose: () => void;
}) {
  const { def, key } = item;
  const answer = item.answer;
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<PriceBookItem | null>(null);
  const [qty, setQty] = useState(1);
  const rate = SCALES[def.scale].filter((r) => r !== 'na');
  const newRepair = (r: Partial<Repair>): Repair => ({ id: `r-${Date.now().toString(36)}-${key}`, label: '', price: '', taxable: true, ...r });
  const canRepair = isFlagged(answer?.rating);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardBackdrop style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet} testID="item-sheet">
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
            <Text style={styles.sheetTitle}>{`${def.label}${def.pro ? '  · PRO' : ''}`}</Text>
            {last ? (
              <Text style={styles.last} testID={`item-${key}-last`}>
                {last}
              </Text>
            ) : null}
            <View style={styles.choices}>
              {rate.map((r) => {
                const on = answer?.rating === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => onAnswer({ rating: on ? undefined : r })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${def.label}: ${RATING_LABEL[r]}`}
                    testID={`item-${key}-${r}`}
                    style={[styles.choice, on && (isBad(r) ? styles.choiceBad : isFlagged(r) ? styles.choiceFair : styles.choiceGood)]}
                  >
                    <Text style={[styles.choiceText, on && styles.onColor]}>{RATING_LABEL[r]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput value={answer?.note ?? ''} onChangeText={(note) => onAnswer({ note })} placeholder="Note" placeholderTextColor={colors.muted} accessibilityLabel={`${def.label} note`} testID={`item-${key}-note`} style={styles.input} />
            <View style={styles.photoRow}>
              {photos.slice(-3).map((p) => (
                <Image key={p.id} source={{ uri: p.uri }} style={styles.thumb} accessibilityLabel="Photo of this item" />
              ))}
              {onTakePhoto ? (
                <Pressable onPress={onTakePhoto} accessibilityRole="button" accessibilityLabel="Add a photo" testID={`item-${key}-photo`} style={styles.plus}>
                  <Text style={styles.plusText}>+</Text>
                </Pressable>
              ) : null}
              <Text style={styles.photoCount} testID={`item-${key}-photos`}>{photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : ''}</Text>
              {SCALES[def.scale].includes('na') ? (
                <Pressable
                  onPress={() => onAnswer({ rating: answer?.rating === 'na' ? undefined : 'na' })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: answer?.rating === 'na' }}
                  testID={`item-${key}-na`}
                  style={[styles.na, answer?.rating === 'na' && styles.choiceGood]}
                >
                  <Text style={[styles.choiceText, answer?.rating === 'na' && styles.onColor]}>N/A</Text>
                </Pressable>
              ) : null}
            </View>

            {repair ? (
              <View style={styles.repair} testID={`repair-${repair.id}`}>
                <Text style={styles.fieldLabel}>Suggested repair</Text>
                <TextInput value={repair.label} onChangeText={(label) => onRepairPatch(repair.id, { label })} placeholder="Part or repair" placeholderTextColor={colors.muted} accessibilityLabel="Repair name" testID={`repair-name-${repair.id}`} style={styles.input} />
                {repair.productId ? <Stepper value={repair.qty ?? 1} onChange={(q) => onRepairPatch(repair.id, { qty: q })} id={repair.id} /> : null}
                <MeasureField label="Price" value={repair.price} onChange={(price) => onRepairPatch(repair.id, { price })} unit="dollars" allowFraction={false} placeholder="Tap to set" testID={`repair-price-${repair.id}`} />
                <ChipRow options={TAX_OPTIONS} value={repair.taxable ? 'yes' : 'no'} onChange={(v) => onRepairPatch(repair.id, { taxable: v === 'yes' })} testID={`repair-tax-${repair.id}`} />
                <Action label="Remove the repair" onPress={() => onRepairRemove(repair.id)} testID={`repair-remove-${repair.id}`} />
              </View>
            ) : picked ? (
              <View style={styles.repair} testID="picked-part">
                <Text style={styles.partName}>{picked.variant ?? picked.name}</Text>
                <Stepper value={qty} onChange={setQty} id="new" />
                <Text style={styles.partName}>{formatMoney(picked.cents * qty)}</Text>
                <Action
                  label="Add as suggested repair"
                  primary
                  onPress={() => {
                    onRepair(newRepair(repairFromPart(picked, qty, Date.now(), 0, key)));
                    setPicked(null);
                    setQty(1);
                  }}
                  testID={`item-${key}-add-repair`}
                />
              </View>
            ) : canRepair ? (
              <View style={styles.row}>
                <Action label="Suggest a repair" grow onPress={() => setPicking(true)} testID={`item-${key}-pick-part`} />
                <Action label="Type one" grow onPress={() => onRepair(newRepair({}))} testID={`item-${key}-repair`} />
              </View>
            ) : (
              <Text style={styles.last}>Rate it Fair or worse to suggest a repair.</Text>
            )}
            {picking ? (
              <PartPickerSheet
                initialQuery={def.label}
                onPick={(p: PriceBookItem) => {
                  setPicked(p);
                  setQty(1);
                  setPicking(false);
                }}
                onClose={() => setPicking(false)}
              />
            ) : null}
            <Action label="Done" primary onPress={onClose} testID="item-sheet-done" />
          </ScrollView>
        </View>
      </KeyboardBackdrop>
    </Modal>
  );
}

function Stepper({ value, onChange, id }: { value: number; onChange: (n: number) => void; id: string }) {
  return (
    <View style={styles.partBox}>
      <Text style={[styles.partName, styles.grow]}>How many</Text>
      <Pressable onPress={() => onChange(Math.max(1, value - 1))} accessibilityRole="button" accessibilityLabel="One less" testID={`repair-qty-down-${id}`} style={styles.step}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.partName} testID={`repair-qty-${id}`}>{value}</Text>
      <Pressable onPress={() => onChange(value + 1)} accessibilityRole="button" accessibilityLabel="One more" testID={`repair-qty-up-${id}`} style={styles.step}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  groups: { gap: 14 },
  groupBox: { gap: 6 },
  groupTitle: { fontSize: 14, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { width: '32%', flexGrow: 1, minHeight: 76, padding: 8, borderRadius: 12, justifyContent: 'space-between', gap: 4, borderWidth: 1.5 },
  tileBlank: { borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.card },
  tileGood: { backgroundColor: colors.selected, borderColor: colors.selected },
  tileFair: { backgroundColor: colors.warn, borderColor: colors.warn },
  tileBad: { backgroundColor: colors.stop, borderColor: colors.stop },
  tileTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  tileState: { fontSize: 14, fontWeight: '700', color: colors.muted },
  onColor: { color: colors.onSelected },
  badge: { alignSelf: 'flex-start', borderRadius: 999, backgroundColor: colors.card, paddingHorizontal: 8, paddingVertical: 1 },
  badgeText: { fontSize: 12, fontWeight: '800', color: colors.text },
  pressed: { opacity: 0.8 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  scrim: { flex: 1 },
  sheet: { maxHeight: '85%', backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  sheetBody: { padding: 16, gap: 10, paddingBottom: 28 },
  sheetTitle: { fontSize: type.value, fontWeight: '800', color: colors.text },
  last: { fontSize: 15, fontWeight: '700', color: colors.muted },
  choices: { flexDirection: 'row', gap: 6 },
  choice: { flex: 1, minHeight: touch.min, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  choiceGood: { backgroundColor: colors.selected, borderColor: colors.selected },
  choiceFair: { backgroundColor: colors.warn, borderColor: colors.warn },
  choiceBad: { backgroundColor: colors.stop, borderColor: colors.stop },
  choiceText: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center' },
  input: { minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.info },
  plus: { width: 56, height: 56, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  plusText: { fontSize: 28, fontWeight: '800', color: colors.text },
  photoCount: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.muted },
  na: { minHeight: touch.min, minWidth: 64, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  repair: { padding: 12, gap: 8, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border },
  fieldLabel: { fontSize: 15, fontWeight: '800', color: colors.muted },
  partBox: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  partName: { fontSize: type.body, fontWeight: '800', color: colors.text },
  step: { width: touch.min, minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: type.value, fontWeight: '800', color: colors.text },
});
