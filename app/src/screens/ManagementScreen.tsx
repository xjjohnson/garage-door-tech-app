import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { Dock } from '../components/Page';
import { MenuGroup, SectionMenu, SectionPage } from '../components/SectionMenu';
import type { OdooClient } from '../lib/odoo';
import {
  archiveJobType,
  archivePart,
  archiveQuoteTemplate,
  archiveTech,
  archiveTruck,
  ensureTruckLocation,
  truckLocationNamed,
  vehicleLinksLocation,
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
import { addStarterPlans, archivePlan, blankPlan, fetchPlans, MaintenancePlan, PLANS_STORAGE_KEY, planSummary, plansProblem, savePlan } from '../lib/maintenancePlans';
import { resetQuoteTemplates } from '../lib/useQuoteTemplates';
import { isOwner } from '../lib/scorecard';
import { useOdoo } from '../lib/useOdoo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, radius, shadow, touch, type } from '../theme';
import { BusinessScreen } from './BusinessScreen';
import { ChecklistsScreen } from './ChecklistsScreen';
import { PricelistEditor } from '../components/PricelistEditor';
import { CustomerTypesTab } from './CustomerTypesTab';
import { RolesTab } from './RolesTab';
import { DiscountsTab } from './DiscountsTab';
import { useCustomerTypes } from '../lib/useInvoices';
import { TextsTab } from './TextsTab';

type Tab = 'customerTypes' | 'jobTypes' | 'templates' | 'parts' | 'techs' | 'roles' | 'trucks' | 'plans' | 'discounts' | 'pricelists' | 'texts' | 'checklists' | 'business';
const GROUPS: MenuGroup<Tab>[] = [
  {
    title: 'Jobs and scheduling',
    items: [
      { id: 'jobTypes', label: 'Job types', detail: 'Visit lengths and instructions' },
      { id: 'templates', label: 'Templates', detail: 'Quotation templates' },
      { id: 'plans', label: 'Maintenance plans', detail: 'Yearly tune-up plans' },
      { id: 'checklists', label: 'Checklists', detail: 'Inspection items' },
    ],
  },
  {
    title: 'Parts and prices',
    items: [
      { id: 'parts', label: 'Parts', detail: 'Products and stock rules' },
      { id: 'pricelists', label: 'Pricelists', detail: 'Prices by customer type' },
      { id: 'discounts', label: 'Discounts', detail: 'Quick discount buttons' },
    ],
  },
  {
    title: 'Team',
    items: [
      { id: 'techs', label: 'Techs', detail: 'People and their schedules' },
      { id: 'roles', label: 'Team roles', detail: 'Who can do what' },
      { id: 'trucks', label: 'Trucks', detail: 'Vehicles and truck stock places' },
    ],
  },
  {
    title: 'Customers and messages',
    items: [
      { id: 'customerTypes', label: 'Customer types', detail: 'Types and their plans' },
      { id: 'texts', label: 'Texts', detail: 'On my way, ETA, review, confirm' },
    ],
  },
  {
    title: 'Business',
    items: [{ id: 'business', label: 'Your business', detail: 'Name, payment handles, review link' }],
  },
];
const LABELS = Object.fromEntries(GROUPS.flatMap((g) => g.items.map((i) => [i.id, i.label]))) as Record<Tab, string>;

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
  const [tab, setTab] = useState<Tab | null>(null);
  const back = useCallback(() => setTab(null), []);
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
      {tab === null ? <SectionMenu groups={GROUPS} onPick={setTab} testID="manage-menu" rowTestID={(id) => `manage-tab-${id}`} /> : null}
      <Text style={styles.note} testID="manage-who">
        {owner === true ? 'Changes save straight to Odoo and every phone picks them up.' : owner === false ? 'Only the owner can change these. Ask the owner to make a change.' : 'Checking with Odoo...'}
      </Text>
      {tab !== null ? (
        <SectionPage area="Management" title={LABELS[tab]} onBack={back} testID="manage-back">
          {tab === 'jobTypes' ? <JobTypes client={client} canEdit={owner === true} /> : null}
          {tab === 'templates' ? <Templates client={client} canEdit={owner === true} /> : null}
          {tab === 'parts' ? <Parts client={client} canEdit={owner === true} /> : null}
          {tab === 'techs' ? <Techs client={client} canEdit={owner === true} /> : null}
          {tab === 'trucks' ? <Trucks client={client} canEdit={owner === true} /> : null}
          {tab === 'roles' ? <RolesTab client={client} /> : null}
          {tab === 'customerTypes' ? <CustomerTypesTab client={client} canEdit={owner === true} /> : null}
          {tab === 'plans' ? <Plans client={client} canEdit={owner === true} /> : null}
          {tab === 'discounts' ? <DiscountsTab canEdit={owner === true} /> : null}
          {tab === 'pricelists' ? <PricelistEditor client={client} canEdit={owner === true} /> : null}
          {tab === 'texts' ? <TextsTab canEdit={owner === true} /> : null}
          {tab === 'checklists' ? <ChecklistsScreen /> : null}
          {tab === 'business' ? <BusinessScreen /> : null}
        </SectionPage>
      ) : null}
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
        <Dock>
        <Pressable onPress={onSave} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }} testID="manage-save" style={styles.primary}>
          <Text style={styles.primaryText}>{busy ? 'Saving...' : 'Save to Odoo'}</Text>
        </Pressable>
        </Dock>
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
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={styles.addPill}>
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
  const [links, setLinks] = useState(true);
  const [made, setMade] = useState<Choice | null>(null);
  const [locMsg, setLocMsg] = useState('');
  useEffect(() => {
    vehicleLinksLocation(client).then(setLinks, () => undefined);
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
        {source === 'vehicle' && links && places.length ? pick('Stock location', places, edit.locationId, (locationId) => setEdit({ ...edit, locationId }), 'place') : null}
        {source === 'vehicle' ? (
          <View style={styles.field}>
            {!links ? <Text style={styles.label}>Stock location</Text> : null}
            <Text style={styles.note} testID="manage-truck-place-note">
              {links ? 'Or make a new Inventory location named for this truck.' : `This Odoo's vehicles aren't linked to a stock location, so Truck stock finds the truck's stock by the truck's name. ${made ? `Stock location: ${made.label}.` : 'Make the stock location for this truck:'}`}
            </Text>
            {canEdit && edit.name.trim() ? (
              <Pressable
                accessibilityRole="button"
                testID="manage-truck-make-place"
                style={styles.chip}
                onPress={async () => {
                  setLocMsg('');
                  try {
                    const hadOne = await truckLocationNamed(client, edit.name);
                    const loc = await ensureTruckLocation(client, edit.name);
                    setMade(loc);
                    setPlaces((p) => (p.some((x) => x.id === loc.id) ? p : [...p, loc]));
                    if (links) setEdit({ ...edit, locationId: loc.id });
                    setLocMsg(hadOne ? `Using the existing location ${loc.label}.` : `Made ${loc.label} in Odoo Inventory.`);
                  } catch (e) {
                    setLocMsg(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                <Text style={styles.tabText}>{`Make "${edit.name.trim()}" stock location`}</Text>
              </Pressable>
            ) : null}
            {locMsg ? <Text style={styles.note} testID="manage-truck-place-msg">{locMsg}</Text> : null}
          </View>
        ) : null}
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

/* -------------------------------------------------------- Maintenance plans */

const EVERY = [3, 6, 12];
const TERMS: { months: number; label: string }[] = [
  { months: 12, label: '1 year' },
  { months: 24, label: '2 years' },
  { months: 0, label: 'Ongoing' },
];

function Chips<T>({ options, value, onPick, canEdit, testID }: { options: { id: T; label: string }[]; value: T; onPick: (v: T) => void; canEdit: boolean; testID: string }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={String(o.id)} disabled={!canEdit} onPress={() => onPick(o.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} testID={`${testID}-${String(o.id)}`} style={[styles.chip, on && styles.tabOn]}>
            <Text style={[styles.tabText, on && styles.tabTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const intOf = (v: string) => Number.parseInt(v.replace(/\D/g, ''), 10) || 0;

function Plans({ client, canEdit }: TabProps) {
  const [problem, setProblem] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    plansProblem(client).then(setProblem);
  }, [client]);
  const load = useCallback(() => fetchPlans(client, { includeArchived: true }), [client]);
  const { rows, err, reload } = useList(load);
  const [edit, setEdit] = useState<MaintenancePlan | null>(null);
  const [jobTypes, setJobTypes] = useState<Choice[]>([]);
  const [price, setPrice] = useState('');
  const [perks, setPerks] = useState('');
  const [starterMsg, setStarterMsg] = useState('');
  const customerTypes = useCustomerTypes();
  useEffect(() => {
    listJobTypes(client).then((l) => setJobTypes(l.map((t) => ({ id: t.id, label: t.name })))).catch(() => undefined);
  }, [client]);
  const { busy, msg, run, setMsg } = useAction(() => {
    setEdit(null);
    AsyncStorage.removeItem(PLANS_STORAGE_KEY).catch(() => undefined);
    reload();
  });
  const open = (p: MaintenancePlan) => {
    setEdit(p);
    setPrice(p.priceCents ? String(p.priceCents / 100) : '');
    setPerks(p.perks.join('\n'));
    setMsg('');
  };
  if (problem) return <Text style={styles.note} testID="manage-plans-unsupported">{problem}</Text>;
  if (edit) {
    const dollars = Number(price.replace('$', '').trim());
    const full: MaintenancePlan = { ...edit, priceCents: Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : 0, perks: perks.split('\n').map((x) => x.trim()).filter(Boolean) };
    const set = (patch: Partial<MaintenancePlan>) => setEdit({ ...edit, ...patch });
    const customEvery = !EVERY.includes(edit.everyMonths);
    return (
      <EditShell
        title={edit.id ? edit.name || 'Plan' : 'New plan'}
        canEdit={canEdit}
        busy={busy}
        msg={msg}
        onSave={() => run(() => savePlan(client, full))}
        onArchive={edit.id && edit.active ? () => run(() => archivePlan(client, edit.id!)) : undefined}
        onBack={() => { setEdit(null); setMsg(''); }}
        archiveLabel="Archive this plan"
      >
        <TextField label="Name" value={edit.name} onChange={(name) => set({ name })} editable={canEdit} testID="manage-plan-name" hint="What the tech picks on a ticket and the customer reads on the estimate." />
        <TextField label="What is included" value={edit.description} onChange={(description) => set({ description })} editable={canEdit} multiline testID="manage-plan-description" hint="Short, in words the customer understands." />
        <View style={styles.field}>
          <Text style={styles.label}>Visit every</Text>
          <Chips options={[...EVERY.map((m) => ({ id: String(m), label: `${m} months` })), { id: 'custom', label: 'Custom' }]} value={customEvery ? 'custom' : String(edit.everyMonths)} onPick={(v) => set({ everyMonths: v === 'custom' ? 4 : Number(v), visitsPerYear: v === 'custom' ? edit.visitsPerYear : Math.max(1, Math.round(12 / Number(v))) })} canEdit={canEdit} testID="manage-plan-every" />
          {customEvery ? <TextField label="Months between visits" value={String(edit.everyMonths || '')} onChange={(v) => set({ everyMonths: intOf(v) })} editable={canEdit} keyboard="numeric" testID="manage-plan-every-custom" /> : null}
        </View>
        <TextField label="Visits per year" value={String(edit.visitsPerYear || '')} onChange={(v) => set({ visitsPerYear: intOf(v) })} editable={canEdit} keyboard="numeric" testID="manage-plan-visits" />
        <TextField label="Make each visit this many days ahead" value={String(edit.daysAhead)} onChange={(v) => set({ daysAhead: intOf(v) })} editable={canEdit} keyboard="numeric" testID="manage-plan-ahead" hint="Odoo creates the job this long before it is due. 30 is the usual." />
        {jobTypes.length ? (
          <View style={styles.field}>
            <Text style={styles.label}>Visit type</Text>
            <Text style={styles.note}>Any leaves the type open: Odoo makes the visits without picking one for you.</Text>
            <Chips options={[{ id: 0, label: 'Any' }, ...jobTypes]} value={edit.jobTypeId ?? 0} onPick={(id) => set({ jobTypeId: id || undefined, jobTypeName: jobTypes.find((t) => t.id === id)?.label })} canEdit={canEdit} testID="manage-plan-type" />
          </View>
        ) : null}
        <View style={styles.field}>
          <Text style={styles.label}>Term</Text>
          <Chips options={TERMS.map((t) => ({ id: t.months, label: t.label }))} value={edit.termMonths} onPick={(termMonths) => set({ termMonths })} canEdit={canEdit} testID="manage-plan-term" />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>At the end of the term</Text>
          <Chips options={[{ id: 'no', label: 'Ends' }, { id: 'yes', label: 'Renews' }]} value={edit.renews ? 'yes' : 'no'} onPick={(v) => set({ renews: v === 'yes' })} canEdit={canEdit} testID="manage-plan-renews" />
        </View>
        <TextField label="Price (dollars)" value={price} onChange={setPrice} editable={canEdit} keyboard="numeric" testID="manage-plan-price" hint="Leave empty for no charge. A fee is added to the ticket as one line and covers the term. Nothing bills again by itself." />
        <TextField label="Renewal notice (days before the end)" value={String(edit.noticeDays)} onChange={(v) => set({ noticeDays: intOf(v) })} editable={canEdit} keyboard="numeric" testID="manage-plan-notice" />
        <TextField label="Perks" value={perks} onChange={setPerks} editable={canEdit} multiline testID="manage-plan-perks" hint="One per line, like Priority scheduling. Text only; nothing is figured from it." />
        <View style={styles.field}>
          <Text style={styles.label}>Who it is for</Text>
          <View style={styles.chips}>
            {[{ id: '', label: 'Everyone' }, ...customerTypes.map((t) => ({ id: t, label: t }))].map((o) => {
              const on = o.id === '' ? edit.types.length === 0 : edit.types.includes(o.id);
              return (
                <Pressable key={o.id || 'all'} disabled={!canEdit} onPress={() => set({ types: o.id === '' ? [] : on ? edit.types.filter((t) => t !== o.id) : [...edit.types, o.id], audience: 'all' })} accessibilityRole="checkbox" accessibilityState={{ checked: on }} testID={`manage-plan-type-${o.id || 'all'}`} style={[styles.chip, on && styles.tabOn]}>
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <TextField label="Order in the list" value={String(edit.sort)} onChange={(v) => set({ sort: intOf(v) })} editable={canEdit} keyboard="numeric" testID="manage-plan-sort" hint="Smaller numbers come first." />
        <View style={styles.field}>
          <Text style={styles.label}>Active</Text>
          <Chips options={[{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }]} value={edit.active ? 'on' : 'off'} onPick={(v) => set({ active: v === 'on' })} canEdit={canEdit} testID="manage-plan-active" />
        </View>
      </EditShell>
    );
  }
  return (
    <View style={styles.stack} testID="manage-plans">
      <Text style={styles.note}>Plans the tech can add to a ticket. Each one is an agreement template in Odoo.</Text>
      {err ? <Text style={styles.warn}>{err}</Text> : null}
      {rows === null && !err ? <Text style={styles.note}>Reading Odoo...</Text> : null}
      {rows?.map((p) => (
        <Row key={p.id} label={p.active ? p.name : `${p.name} (off)`} detail={planSummary(p)} testID={`manage-plan-${p.id}`} onPress={() => open(p)} />
      ))}
      {rows?.length === 0 ? (
        <View style={styles.stack}>
          <Text style={styles.note} testID="manage-plans-empty">No plans yet. You can start with Yearly tune-up, Twice-a-year and Commercial / Property manager, then set prices and wording yourself.</Text>
          {canEdit ? (
            <Pressable
              onPress={async () => {
                setStarterMsg('');
                try {
                  const n = await addStarterPlans(client);
                  setStarterMsg(`Made ${n} plan${n === 1 ? '' : 's'} in Odoo.`);
                  reload();
                } catch (e) {
                  setStarterMsg(`Not made: ${errText(e)}`);
                }
              }}
              accessibilityRole="button"
              testID="manage-plans-starter"
              style={styles.back}
            >
              <Text style={styles.buttonText}>Add starter plans</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {starterMsg ? <Text style={styles.note} testID="manage-plans-msg">{starterMsg}</Text> : null}
      <AddButton show={canEdit} label="Add a plan" testID="manage-plan-new" onPress={() => open(blankPlan())} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  warn: { fontSize: type.body, fontWeight: '700', color: colors.stop },
  tabScroll: { flexGrow: 0, marginHorizontal: -16 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  tab: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.selected, borderColor: colors.selected },
  tabText: { fontSize: 16, fontWeight: '800', color: colors.text },
  tabTextOn: { color: colors.onSelected },
  title: { fontSize: type.value, fontWeight: '800', color: colors.text },
  field: { gap: 4 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  input: { minHeight: touch.min, borderRadius: radius.field, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  multiline: { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: touch.min, backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12, ...shadow },
  rowText: { flex: 1, gap: 2 },
  pressed: { backgroundColor: colors.info },
  chevron: { fontSize: 28, fontWeight: '800', color: colors.text },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  meta: { fontSize: 16, color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 10 },
  pick: { minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, justifyContent: 'center', paddingHorizontal: 14, backgroundColor: colors.card },
  back: { alignSelf: 'flex-start', minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.info, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  addPill: { alignSelf: 'flex-end', minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primary: { minHeight: touch.min, borderRadius: radius.card, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { fontSize: type.body, fontWeight: '800', color: colors.onSelected },
  danger: { minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.stop, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  dangerText: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
});
