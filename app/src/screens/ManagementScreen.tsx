import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { OdooClient } from '../lib/odoo';
import {
  archiveJobType,
  archivePart,
  archiveQuoteTemplate,
  archiveTech,
  archiveTruck,
  Choice,
  JobTypeEdit,
  listJobTypes,
  listParts,
  listQuoteTemplates,
  listTechs,
  listTruckEdits,
  loadQuoteTemplate,
  orderTypes,
  PartEdit,
  QuoteTemplateEdit,
  saveJobType,
  savePart,
  saveQuoteTemplate,
  saveTech,
  saveTruck,
  stockLocations,
  TechEdit,
  TruckEdit,
  TruckSource,
  truckSource,
} from '../lib/odooManage';
import { FSM_TEMPLATES_STORAGE_KEY } from '../lib/fsmTemplates';
import { resetQuoteTemplates } from '../lib/useQuoteTemplates';
import { isOwner } from '../lib/scorecard';
import { useOdoo } from '../lib/useOdoo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, touch, type } from '../theme';
import { ChecklistsScreen } from './ChecklistsScreen';
import { DiscountsTab } from './DiscountsTab';
import { TextsTab } from './TextsTab';

type Tab = 'jobTypes' | 'templates' | 'parts' | 'techs' | 'trucks' | 'discounts' | 'texts' | 'checklists';
const TABS: { id: Tab; label: string }[] = [
  { id: 'jobTypes', label: 'Job types' },
  { id: 'templates', label: 'Templates' },
  { id: 'parts', label: 'Parts' },
  { id: 'techs', label: 'Techs' },
  { id: 'trucks', label: 'Trucks' },
  { id: 'discounts', label: 'Discounts' },
  { id: 'texts', label: 'Texts' },
  { id: 'checklists', label: 'Checklists' },
];

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The owner's area: the lists the app runs on, edited here and saved straight
 * to Odoo. Pick a tab, tap a row to edit it, then Save to Odoo. Everyone else
 * can look but not change anything.
 */
export function ManagementScreen() {
  const { client, status } = useOdoo();
  const signedIn = status === 'signedIn' && !!client;
  const [tab, setTab] = useState<Tab>('jobTypes');
  const [owner, setOwner] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    setOwner(null);
    if (signedIn && client) isOwner(client).then((ok) => alive && setOwner(ok));
    return () => {
      alive = false;
    };
  }, [signedIn, client]);

  if (!signedIn || !client) return <Text style={styles.note} testID="manage-signin">Sign in to Odoo to manage these lists. They are kept in Odoo, not on this phone.</Text>;
  return (
    <View style={styles.stack} testID="manage">
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((t) => (
          <Pressable key={t.id} onPress={() => setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }} testID={`manage-tab-${t.id}`} style={[styles.tab, tab === t.id && styles.tabOn]}>
            <Text style={[styles.tabText, tab === t.id && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.note} testID="manage-who">
        {owner === true ? 'Changes save straight to Odoo and every phone picks them up.' : owner === false ? 'Only the owner can change these. Ask the owner to make a change.' : 'Checking with Odoo...'}
      </Text>
      {tab === 'jobTypes' ? <JobTypes client={client} canEdit={owner === true} /> : null}
      {tab === 'templates' ? <Templates client={client} canEdit={owner === true} /> : null}
      {tab === 'parts' ? <Parts client={client} canEdit={owner === true} /> : null}
      {tab === 'techs' ? <Techs client={client} canEdit={owner === true} /> : null}
      {tab === 'trucks' ? <Trucks client={client} canEdit={owner === true} /> : null}
      {tab === 'discounts' ? <DiscountsTab canEdit={owner === true} /> : null}
      {tab === 'texts' ? <TextsTab canEdit={owner === true} /> : null}
      {tab === 'checklists' ? <ChecklistsScreen /> : null}
    </View>
  );
}

interface TabProps {
  client: OdooClient;
  canEdit: boolean;
}

/** The edit screen every tab shares: its fields, then one Save to Odoo button. */
function EditShell({ title, canEdit, busy, msg, onSave, onArchive, onBack, children, archiveLabel }: { title: string; canEdit: boolean; busy: boolean; msg: string; onSave: () => void; onArchive?: () => void; onBack: () => void; children: ReactNode; archiveLabel: string }) {
  return (
    <View style={styles.stack} testID="manage-edit">
      <Pressable onPress={onBack} accessibilityRole="button" testID="manage-back" style={styles.back}>
        <Text style={styles.buttonText}>‹ Back to the list</Text>
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      {children}
      {canEdit ? (
        <Pressable onPress={onSave} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }} testID="manage-save" style={styles.primary}>
          <Text style={styles.primaryText}>{busy ? 'Saving...' : 'Save to Odoo'}</Text>
        </Pressable>
      ) : null}
      {canEdit && onArchive ? (
        <Pressable onPress={onArchive} disabled={busy} accessibilityRole="button" testID="manage-archive" style={styles.danger}>
          <Text style={styles.dangerText}>{archiveLabel}</Text>
        </Pressable>
      ) : null}
      {msg ? (
        <Text style={styles.note} testID="manage-msg" accessibilityLiveRegion="polite">
          {msg}
        </Text>
      ) : null}
    </View>
  );
}

function TextField({ label, value, onChange, testID, multiline, keyboard, editable = true, hint }: { label: string; value: string; onChange: (v: string) => void; testID: string; multiline?: boolean; keyboard?: 'numeric' | 'default'; editable?: boolean; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.note}>{hint}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        editable={editable}
        multiline={multiline}
        keyboardType={keyboard ?? 'default'}
        accessibilityLabel={label}
        testID={testID}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}

function Row({ label, detail, onPress, testID }: { label: string; detail?: string; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowText}>
        <Text style={styles.buttonText}>{label}</Text>
        {detail ? <Text style={styles.meta}>{detail}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function AddButton({ label, onPress, testID, show }: { label: string; onPress: () => void; testID: string; show: boolean }) {
  return show ? (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={styles.primary}>
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  ) : null;
}

/** Loads a list from Odoo, with a reload for after a save. */
function useList<T>(load: () => Promise<T[]>): { rows: T[] | null; err: string; reload: () => void } {
  const [rows, setRows] = useState<T[] | null>(null);
  const [err, setErr] = useState('');
  const reload = useCallback(() => {
    load().then(
      (r) => {
        setRows(r);
        setErr('');
      },
      (e) => setErr(`Couldn't read Odoo: ${errText(e)}`),
    );
  }, [load]);
  useEffect(reload, [reload]);
  return { rows, err, reload };
}

/** Runs a save or archive, tells how it went, and goes back to the list when it worked. */
function useAction(done: () => void) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async (what: () => Promise<unknown>) => {
    setBusy(true);
    setMsg('');
    try {
      await what();
      done();
    } catch (e) {
      setMsg(`Not saved: ${errText(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, run, setMsg };
}

/* ---------------------------------------------------------------- Job types */

function JobTypes({ client, canEdit }: TabProps) {
  const load = useCallback(() => listJobTypes(client), [client]);
  const { rows, err, reload } = useList(load);
  const [types, setTypes] = useState<Choice[]>([]);
  const [edit, setEdit] = useState<JobTypeEdit | null>(null);
  useEffect(() => {
    orderTypes(client).then(setTypes);
  }, [client]);
  const { busy, msg, run, setMsg } = useAction(() => {
    setEdit(null);
    AsyncStorage.removeItem(FSM_TEMPLATES_STORAGE_KEY).catch(() => undefined);
    reload();
  });
  if (client.session.kind !== 'oca') return <Text style={styles.note}>Job types need the Field Service app in Odoo.</Text>;
  if (edit) {
    return (
      <EditShell title={edit.id ? edit.name || 'Job type' : 'New job type'} canEdit={canEdit} busy={busy} msg={msg} onSave={() => run(() => saveJobType(client, edit))} onArchive={edit.id ? () => run(() => archiveJobType(client, edit.id!)) : undefined} onBack={() => { setEdit(null); setMsg(''); }} archiveLabel="Remove this job type">
        <TextField label="Name" value={edit.name} onChange={(name) => setEdit({ ...edit, name })} editable={canEdit} testID="manage-jt-name" hint="What shows under What's wrong on a new job." />
        <TextField label="Instructions" value={edit.instructions} onChange={(instructions) => setEdit({ ...edit, instructions })} editable={canEdit} multiline testID="manage-jt-instructions" hint="Copied onto the job for the tech." />
        <TextField label="Planned minutes" value={edit.minutes ? String(edit.minutes) : ''} onChange={(v) => setEdit({ ...edit, minutes: Number.parseInt(v.replace(/\D/g, ''), 10) || 0 })} editable={canEdit} keyboard="numeric" testID="manage-jt-minutes" />
        {types.length ? (
          <View style={styles.field}>
            <Text style={styles.label}>Odoo job type</Text>
            <View style={styles.chips}>
              {[{ id: 0, label: 'None' }, ...types].map((t) => {
                const on = (edit.typeId ?? 0) === t.id;
                return (
                  <Pressable key={t.id} disabled={!canEdit} onPress={() => setEdit({ ...edit, typeId: t.id || undefined })} accessibilityRole="radio" accessibilityState={{ selected: on }} testID={`manage-jt-type-${t.id}`} style={[styles.chip, on && styles.tabOn]}>
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </EditShell>
    );
  }
  return (
    <View style={styles.stack} testID="manage-jobtypes">
      <Text style={styles.note}>Each job type is a Field Service template in Odoo, with its Odoo job type.</Text>
      {err ? <Text style={styles.warn}>{err}</Text> : null}
      {rows === null && !err ? <Text style={styles.note}>Reading Odoo...</Text> : null}
      {rows?.map((t) => (
        <Row key={t.id} label={t.name} detail={[t.minutes ? `${t.minutes} min` : '', t.instructions.split('\n')[0]].filter(Boolean).join(' · ') || undefined} testID={`manage-jt-${t.id}`} onPress={() => setEdit({ id: t.id, name: t.name, instructions: t.instructions, minutes: t.minutes ?? 0, typeId: t.typeId })} />
      ))}
      {rows?.length === 0 ? <Text style={styles.note}>No job types in Odoo yet.</Text> : null}
      <AddButton show={canEdit} label="Add a job type" testID="manage-jt-new" onPress={() => setEdit({ name: '', instructions: '', minutes: 0 })} />
    </View>
  );
}

/* ---------------------------------------------------------------- Templates */

function Templates({ client, canEdit }: TabProps) {
  const load = useCallback(() => listQuoteTemplates(client), [client]);
  const { rows, err, reload } = useList(load);
  const [edit, setEdit] = useState<QuoteTemplateEdit | null>(null);
  const [names, setNames] = useState<Record<number, string>>({});
  const [pickFor, setPickFor] = useState<number | null>(null);
  const { busy, msg, run, setMsg } = useAction(() => {
    setEdit(null);
    resetQuoteTemplates();
    reload();
  });
  const open = async (id: number) => {
    try {
      const t = await loadQuoteTemplate(client, id);
      const known = await listParts(client, '', 500).catch(() => []);
      setNames(Object.fromEntries(known.map((p) => [p.id, p.name])));
      setEdit(t);
      setMsg('');
    } catch (e) {
      setMsg(`Couldn't read the template: ${errText(e)}`);
    }
  };
  if (edit) {
    const setLine = (i: number, patch: Partial<QuoteTemplateEdit['lines'][number]>) => setEdit({ ...edit, lines: edit.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
    return (
      <EditShell title={edit.id ? edit.name || 'Template' : 'New template'} canEdit={canEdit} busy={busy} msg={msg} onSave={() => run(() => saveQuoteTemplate(client, edit))} onArchive={edit.id ? () => run(() => archiveQuoteTemplate(client, edit.id!)) : undefined} onBack={() => { setEdit(null); setMsg(''); }} archiveLabel="Remove this template">
        <TextField label="Name" value={edit.name} onChange={(name) => setEdit({ ...edit, name })} editable={canEdit} testID="manage-tpl-name" hint={'For good, better and best, name them like "Opener · Good", "Opener · Better", "Opener · Best".'} />
        <Text style={styles.label}>Lines</Text>
        {edit.lines.map((l, i) => (
          <View key={l.id ?? `n${i}`} style={styles.card} testID={`manage-tpl-line-${i}`}>
            {pickFor === i ? (
              <PartPicker client={client} onPick={(p) => { setNames((n) => ({ ...n, [p.id]: p.name })); setLine(i, { productId: p.id, name: l.name || p.name }); setPickFor(null); }} onClose={() => setPickFor(null)} />
            ) : (
              <>
                <Pressable disabled={!canEdit} onPress={() => setPickFor(i)} accessibilityRole="button" testID={`manage-tpl-product-${i}`} style={styles.pick}>
                  <Text style={styles.buttonText}>{names[l.productId] ?? (l.productId ? `Product ${l.productId}` : 'Pick a product')}</Text>
                </Pressable>
                <TextField label="Says" value={l.name} onChange={(name) => setLine(i, { name })} editable={canEdit} testID={`manage-tpl-says-${i}`} />
                <TextField label="Quantity" value={String(l.qty)} onChange={(v) => setLine(i, { qty: Number.parseFloat(v) > 0 ? Number.parseFloat(v) : 0 })} editable={canEdit} keyboard="numeric" testID={`manage-tpl-qty-${i}`} />
                {canEdit ? (
                  <Pressable onPress={() => setEdit({ ...edit, lines: edit.lines.filter((_, j) => j !== i) })} accessibilityRole="button" testID={`manage-tpl-remove-${i}`} style={styles.danger}>
                    <Text style={styles.dangerText}>Take this line off</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        ))}
        {canEdit ? (
          <Pressable onPress={() => { setEdit({ ...edit, lines: [...edit.lines, { productId: 0, name: '', qty: 1 }] }); setPickFor(edit.lines.length); }} accessibilityRole="button" testID="manage-tpl-add-line" style={styles.back}>
            <Text style={styles.buttonText}>Add a line</Text>
          </Pressable>
        ) : null}
      </EditShell>
    );
  }
  return (
    <View style={styles.stack} testID="manage-templates">
      <Text style={styles.note}>Quote templates from Odoo Sales, including the good / better / best sets.</Text>
      {err ? <Text style={styles.warn}>{err}</Text> : null}
      {msg ? <Text style={styles.warn}>{msg}</Text> : null}
      {rows === null && !err ? <Text style={styles.note}>Reading Odoo...</Text> : null}
      {rows?.map((t) => <Row key={t.id} label={t.label} testID={`manage-tpl-${t.id}`} onPress={() => open(t.id)} />)}
      {rows?.length === 0 ? <Text style={styles.note}>No quote templates in Odoo yet.</Text> : null}
      <AddButton show={canEdit} label="Add a template" testID="manage-tpl-new" onPress={() => { setEdit({ name: '', lines: [] }); setNames({}); }} />
    </View>
  );
}

/** Searches Odoo's products and picks one. */
function PartPicker({ client, onPick, onClose }: { client: OdooClient; onPick: (p: { id: number; name: string }) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<{ id: number; name: string; cents: number }[] | null>(null);
  useEffect(() => {
    let alive = true;
    listParts(client, q, 20).then((r) => alive && setList(r), () => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [client, q]);
  return (
    <View style={styles.stack} testID="manage-picker">
      <TextInput value={q} onChangeText={setQ} placeholder="Search products" placeholderTextColor={colors.muted} accessibilityLabel="Search products" testID="manage-picker-search" style={styles.input} autoCorrect={false} />
      {list?.map((p) => (
        <Row key={p.id} label={p.name} detail={money(p.cents)} testID={`manage-picker-${p.id}`} onPress={() => onPick(p)} />
      ))}
      <Pressable onPress={onClose} accessibilityRole="button" testID="manage-picker-close" style={styles.back}>
        <Text style={styles.buttonText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

/* -------------------------------------------------------------------- Parts */

function Parts({ client, canEdit }: TabProps) {
  const [q, setQ] = useState('');
  const load = useCallback(() => listParts(client, q), [client, q]);
  const { rows, err, reload } = useList(load);
  const [edit, setEdit] = useState<(PartEdit & { price: string }) | null>(null);
  const { busy, msg, run, setMsg } = useAction(() => {
    setEdit(null);
    reload();
  });
  if (edit) {
    const price = Number.parseFloat(edit.price);
    const ready = Number.isFinite(price) && price >= 0 ? { ...edit, cents: Math.round(price * 100) } : { ...edit, cents: -1 };
    return (
      <EditShell title={edit.id ? edit.name || 'Part' : 'New part'} canEdit={canEdit} busy={busy} msg={msg} onSave={() => run(() => savePart(client, ready))} onArchive={edit.id ? () => run(() => archivePart(client, edit.id!)) : undefined} onBack={() => { setEdit(null); setMsg(''); }} archiveLabel="Remove this part">
        <TextField label="Name" value={edit.name} onChange={(name) => setEdit({ ...edit, name })} editable={canEdit} testID="manage-part-name" />
        <TextField label="Internal reference" value={edit.code} onChange={(code) => setEdit({ ...edit, code })} editable={canEdit} testID="manage-part-code" />
        <TextField label="Price (dollars)" value={edit.price} onChange={(price) => setEdit({ ...edit, price })} editable={canEdit} keyboard="numeric" testID="manage-part-price" hint="Odoo adds sales tax on parts; the app never does." />
        {!edit.id && canEdit ? (
          <View style={styles.chips}>
            {[false, true].map((service) => (
              <Pressable key={String(service)} onPress={() => setEdit({ ...edit, service })} accessibilityRole="radio" accessibilityState={{ selected: edit.service === service }} testID={`manage-part-${service ? 'service' : 'goods'}`} style={[styles.chip, edit.service === service && styles.tabOn]}>
                <Text style={[styles.tabText, edit.service === service && styles.tabTextOn]}>{service ? 'Service (labor)' : 'Part'}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </EditShell>
    );
  }
  return (
    <View style={styles.stack} testID="manage-parts">
      <Text style={styles.note}>Odoo&apos;s products and prices. The price book on phones picks up changes the next time it updates from Odoo.</Text>
      <TextInput value={q} onChangeText={setQ} placeholder="Search by name or reference" placeholderTextColor={colors.muted} accessibilityLabel="Search parts" testID="manage-part-search" style={styles.input} autoCorrect={false} />
      {err ? <Text style={styles.warn}>{err}</Text> : null}
      {rows === null && !err ? <Text style={styles.note}>Reading Odoo...</Text> : null}
      {rows?.map((p) => (
        <Row key={p.id} label={p.name} detail={`${money(p.cents)}${p.code ? ` · ${p.code}` : ''}${p.service ? ' · service' : ''}`} testID={`manage-part-${p.id}`} onPress={() => setEdit({ ...p, price: (p.cents / 100).toFixed(2) })} />
      ))}
      {rows?.length === 0 ? <Text style={styles.note}>Nothing found.</Text> : null}
      <AddButton show={canEdit} label="Add a part" testID="manage-part-new" onPress={() => setEdit({ name: '', code: '', cents: 0, service: false, price: '' })} />
    </View>
  );
}

/* -------------------------------------------------------------------- Techs */

function Techs({ client, canEdit }: TabProps) {
  const load = useCallback(() => listTechs(client), [client]);
  const { rows, err, reload } = useList(load);
  const [edit, setEdit] = useState<TechEdit | null>(null);
  const { busy, msg, run, setMsg } = useAction(() => {
    setEdit(null);
    reload();
  });
  if (client.session.kind !== 'oca') return <Text style={styles.note}>Techs need the Field Service app in Odoo.</Text>;
  if (edit) {
    return (
      <EditShell title={edit.id ? edit.name || 'Tech' : 'New tech'} canEdit={canEdit} busy={busy} msg={msg} onSave={() => run(() => saveTech(client, edit))} onArchive={edit.id ? () => run(() => archiveTech(client, edit.id!)) : undefined} onBack={() => { setEdit(null); setMsg(''); }} archiveLabel="Remove this tech">
        <TextField label="Name" value={edit.name} onChange={(name) => setEdit({ ...edit, name })} editable={canEdit} testID="manage-tech-name" />
        <TextField label="Phone" value={edit.phone} onChange={(phone) => setEdit({ ...edit, phone })} editable={canEdit} keyboard="numeric" testID="manage-tech-phone" />
        <TextField label="Email" value={edit.email} onChange={(email) => setEdit({ ...edit, email })} editable={canEdit} testID="manage-tech-email" hint="A tech signs in with their own Odoo user. Add the login in Odoo's Users." />
      </EditShell>
    );
  }
  return (
    <View style={styles.stack} testID="manage-techs">
      <Text style={styles.note}>The Field Service workers jobs can be given to.</Text>
      {err ? <Text style={styles.warn}>{err}</Text> : null}
      {rows === null && !err ? <Text style={styles.note}>Reading Odoo...</Text> : null}
      {rows?.map((t) => <Row key={t.id} label={t.name} detail={[t.phone, t.email].filter(Boolean).join(' · ') || undefined} testID={`manage-tech-${t.id}`} onPress={() => setEdit({ id: t.id, name: t.name, phone: t.phone, email: t.email })} />)}
      {rows?.length === 0 ? <Text style={styles.note}>No techs in Odoo yet.</Text> : null}
      <AddButton show={canEdit} label="Add a tech" testID="manage-tech-new" onPress={() => setEdit({ name: '', phone: '', email: '' })} />
    </View>
  );
}

/* ------------------------------------------------------------------- Trucks */

function Trucks({ client, canEdit }: TabProps) {
  const [source, setSource] = useState<TruckSource | null>(null);
  const [techs, setTechs] = useState<Choice[]>([]);
  const [places, setPlaces] = useState<Choice[]>([]);
  useEffect(() => {
    truckSource(client).then(setSource, () => setSource('none'));
    listTechs(client).then((t) => setTechs(t.map((x) => ({ id: x.id, label: x.name }))), () => undefined);
    stockLocations(client).then(setPlaces);
  }, [client]);
  const load = useCallback(() => (source ? listTruckEdits(client, source) : Promise.resolve([])), [client, source]);
  const { rows, err, reload } = useList(load);
  const [edit, setEdit] = useState<TruckEdit | null>(null);
  const { busy, msg, run, setMsg } = useAction(() => {
    setEdit(null);
    reload();
  });
  if (source === 'none') return <Text style={styles.note}>Trucks need Field Service Vehicles or Inventory in Odoo.</Text>;
  if (edit && source) {
    const pick = (label: string, list: Choice[], value: number | undefined, set: (id?: number) => void, id: string) => (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.chips}>
          {[{ id: 0, label: 'None' }, ...list].map((o) => {
            const on = (value ?? 0) === o.id;
            return (
              <Pressable key={o.id} disabled={!canEdit} onPress={() => set(o.id || undefined)} accessibilityRole="radio" accessibilityState={{ selected: on }} testID={`manage-truck-${id}-${o.id}`} style={[styles.chip, on && styles.tabOn]}>
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
    return (
      <EditShell title={edit.id ? edit.name || 'Truck' : 'New truck'} canEdit={canEdit} busy={busy} msg={msg} onSave={() => run(() => saveTruck(client, source, edit))} onArchive={edit.id ? () => run(() => archiveTruck(client, source, edit.id!)) : undefined} onBack={() => { setEdit(null); setMsg(''); }} archiveLabel="Remove this truck">
        <TextField label="Name" value={edit.name} onChange={(name) => setEdit({ ...edit, name })} editable={canEdit} testID="manage-truck-name" hint={'Truck stock finds a tech\'s truck by their name in it, like "Truck - Justin Johnson".'} />
        {source === 'vehicle' && techs.length ? pick('Driver', techs, edit.personId, (personId) => setEdit({ ...edit, personId }), 'driver') : null}
        {source === 'vehicle' && places.length ? pick('Stock location', places, edit.locationId, (locationId) => setEdit({ ...edit, locationId }), 'place') : null}
      </EditShell>
    );
  }
  return (
    <View style={styles.stack} testID="manage-trucks">
      <Text style={styles.note}>{source === 'vehicle' ? 'Field Service Vehicles in Odoo.' : 'Truck locations in Odoo Inventory.'}</Text>
      {err ? <Text style={styles.warn}>{err}</Text> : null}
      {rows === null && !err ? <Text style={styles.note}>Reading Odoo...</Text> : null}
      {rows?.map((t) => <Row key={t.id} label={t.name} detail={[techs.find((x) => x.id === t.personId)?.label, places.find((x) => x.id === t.locationId)?.label].filter(Boolean).join(' · ') || undefined} testID={`manage-truck-${t.id}`} onPress={() => setEdit({ ...t })} />)}
      {rows?.length === 0 ? <Text style={styles.note}>No trucks in Odoo yet.</Text> : null}
      <AddButton show={canEdit && !!source} label="Add a truck" testID="manage-truck-new" onPress={() => setEdit({ name: '' })} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  warn: { fontSize: type.body, fontWeight: '700', color: colors.stop },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { minHeight: touch.min, paddingHorizontal: 16, borderRadius: 10, borderWidth: 3, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.selected },
  tabText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  tabTextOn: { color: colors.onSelected },
  title: { fontSize: type.value, fontWeight: '900', color: colors.text },
  field: { gap: 4 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  input: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg },
  multiline: { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: touch.min, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  rowText: { flex: 1, gap: 2 },
  pressed: { backgroundColor: colors.safety },
  chevron: { fontSize: 28, fontWeight: '800', color: colors.text },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  meta: { fontSize: 16, color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 10 },
  pick: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, justifyContent: 'center', paddingHorizontal: 14, backgroundColor: colors.bg },
  back: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primary: { minHeight: touch.min, borderRadius: 10, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { fontSize: type.body, fontWeight: '800', color: colors.onSelected },
  danger: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.stop, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  dangerText: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: touch.min, paddingHorizontal: 14, borderRadius: 10, borderWidth: 3, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
});
