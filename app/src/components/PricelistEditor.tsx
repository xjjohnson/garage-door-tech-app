import { useCallback, useEffect, useState } from 'react';
import { useBackStep } from '../lib/backStep';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { Action } from './Buttons';
import { Card, Message, Meta, Note, NumBox, Row, TextBox, Title, toCents, toNum, useRun } from './Dept';
import { ChipRow } from './controls';
import { OdooClient } from '../lib/odoo';
import { listPricelists, Pricelist, pricelistOptionOn, pricelistRules, pricelistsAvailable, PriceRule, removePriceRule, RuleKind, RuleScope, ruleText, savePriceRule } from '../lib/odooPurchasing';
import { browseProducts } from '../lib/odooStock';
import { colors } from '../theme';

interface Draft {
  id?: number;
  scope: RuleScope;
  targetId?: number;
  target: string;
  kind: 'fixed' | 'percentage';
  amount: string;
  minQty: string;
}

const blank = (): Draft => ({ scope: 'product', target: '', kind: 'percentage', amount: '', minQty: '' });

/**
 * Odoo's own pricelists, edited in place: pick one, then change, add or remove
 * its rules (a fixed price or a percent off, for one part, a category or
 * everything). It shows a notice when Odoo's Sales pricelist option is off; the
 * app never turns that on. Used in Management and in Purchasing.
 */
export function PricelistEditor({ client, canEdit }: { client: OdooClient; canEdit: boolean }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [optionOn, setOptionOn] = useState<boolean | null>(null);
  const [lists, setLists] = useState<Pricelist[] | null>(null);
  const [open, setOpen] = useState<Pricelist | null>(null);
  useBackStep(() => setOpen(null), open !== null);
  const [rules, setRules] = useState<PriceRule[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [found, setFound] = useState<{ id: number; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [query, setQuery] = useState('');
  const { busy, msg, run, setMsg } = useRun();

  useEffect(() => {
    let alive = true;
    pricelistsAvailable(client).then(async (ok) => {
      if (!alive) return;
      setAvailable(ok);
      setOptionOn(await pricelistOptionOn(client));
      if (ok) listPricelists(client).then((l) => alive && setLists(l), (e) => alive && setMsg({ text: e instanceof Error ? e.message : String(e), bad: true }));
    });
    return () => {
      alive = false;
    };
  }, [client, setMsg]);

  const loadRules = useCallback((p: Pricelist) => pricelistRules(client, p.id).then(setRules, (e) => setMsg({ text: e instanceof Error ? e.message : String(e), bad: true })), [client, setMsg]);
  const choose = (p: Pricelist) => {
    setOpen(p);
    setRules(null);
    setDraft(null);
    loadRules(p);
  };

  useEffect(() => {
    if (!draft || draft.scope !== 'product' || !query.trim()) return setFound([]);
    let alive = true;
    const t = setTimeout(() => browseProducts(client, query, 8).then((r) => alive && setFound(r.map((p) => ({ id: p.id, name: p.name }))), () => undefined), 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [client, draft?.scope, query]);

  useEffect(() => {
    if (draft?.scope !== 'category' || categories.length) return;
    client.call('product.category', 'search_read', [[]], { fields: ['complete_name'], order: 'complete_name asc', limit: 60 }).then(
      (r) => setCategories((r as { id: number; complete_name?: string }[]).map((c) => ({ id: c.id, name: c.complete_name ?? '' }))),
      () => undefined,
    );
  }, [client, draft?.scope, categories.length]);

  if (available === null) return <Note>Checking Odoo pricelists…</Note>;
  if (!available) {
    return (
      <Card testID="pricelist-off">
        <Title>Pricelists are off in Odoo</Title>
        <Note>In Odoo, go to Sales, Configuration, Settings, Pricing, and turn on Pricelists. The app does not change that setting. Then come back here.</Note>
      </Card>
    );
  }

  const save = () =>
    open &&
    draft &&
    run('save', async () => {
      const amount = draft.kind === 'fixed' ? toCents(draft.amount) : toNum(draft.amount);
      if (amount === null) throw new Error(draft.kind === 'fixed' ? 'Enter the fixed price.' : 'Enter the percent off.');
      await savePriceRule(client, open.id, { id: draft.id, scope: draft.scope, targetId: draft.targetId, kind: draft.kind, ...(draft.kind === 'fixed' ? { fixedCents: amount } : { percent: amount }), minQty: toNum(draft.minQty) ?? 0 });
      setDraft(null);
      await loadRules(open);
      return 'Saved to Odoo.';
    });
  const remove = (r: PriceRule) =>
    open &&
    run('remove', async () => {
      await removePriceRule(client, r.id);
      await loadRules(open);
      return 'Rule removed in Odoo.';
    });
  const edit = (r: PriceRule) => {
    if (r.kind === 'formula') return setMsg({ text: 'This rule uses a formula. Change it in Odoo.', bad: true });
    setQuery('');
    setDraft({ id: r.id, scope: r.scope, targetId: r.targetId, target: r.target, kind: r.kind, amount: r.kind === 'fixed' ? String(r.fixedCents / 100) : String(r.percent), minQty: r.minQty ? String(r.minQty) : '' });
  };

  return (
    <View style={styles.stack} testID="pricelists">
      {optionOn === false ? <Note>The Sales Pricelists option looks off for your user in Odoo, so pricelists may not apply to quotes yet. Tick it in Sales, Configuration, Settings, Pricing.</Note> : null}
      <Message msg={msg} testID="pricelist-message" />
      {!open ? (
        <>
          {!lists ? <Note>Reading pricelists…</Note> : null}
          {lists && lists.length === 0 ? <Note>Odoo has no pricelists yet. Make one in Sales, Products, Pricelists.</Note> : null}
          {(lists ?? []).map((p) => (
            <Card key={p.id} testID={`pricelist-${p.id}`}>
              <Title>{p.name}</Title>
              <Meta>{`${p.items} rule${p.items === 1 ? '' : 's'}${p.currency ? ` · ${p.currency}` : ''}`}</Meta>
              <Action label="Open" onPress={() => choose(p)} testID={`pricelist-open-${p.id}`} />
            </Card>
          ))}
        </>
      ) : (
        <>
          <Title>{open.name}</Title>
          {!rules ? <Note>Reading rules…</Note> : null}
          {rules && rules.length === 0 ? <Note>No rules yet: prices follow the parts' own prices.</Note> : null}
          {(rules ?? []).map((r) => (
            <Card key={r.id} testID={`rule-${r.id}`}>
              <Title>{r.target || 'Everything'}</Title>
              <Meta>{ruleText(r)}</Meta>
              {canEdit ? (
                <Row>
                  <Action label="Change" onPress={() => edit(r)} testID={`rule-edit-${r.id}`} />
                  <Action label="Remove" onPress={() => remove(r)} disabled={busy !== null} testID={`rule-remove-${r.id}`} />
                </Row>
              ) : null}
            </Card>
          ))}
          {canEdit && !draft ? <Action primary label="Add a rule" onPress={() => { setQuery(''); setDraft(blank()); }} testID="rule-add" /> : null}
          {!canEdit ? <Note>Only a manager who can set prices can change these.</Note> : null}
          {draft ? (
            <Card testID="rule-draft">
              <Title>{draft.id ? 'Change this rule' : 'New rule'}</Title>
              {!draft.id ? (
                <ChipRow options={[{ label: 'One part', value: 'product' as RuleScope }, { label: 'A category', value: 'category' as RuleScope }, { label: 'Everything', value: 'all' as RuleScope }]} value={draft.scope} onChange={(scope) => setDraft({ ...draft, scope, targetId: undefined, target: '' })} testID="rule-scope" compact />
              ) : null}
              {draft.scope !== 'all' ? <Meta>{draft.target ? `For: ${draft.target}` : draft.scope === 'product' ? 'Search for the part' : 'Pick the category'}</Meta> : null}
              {!draft.id && draft.scope === 'product' ? (
                <>
                  <TextBox value={query} onChange={setQuery} label="Part name or code" testID="rule-search" />
                  {found.map((f) => (
                    <Action key={f.id} label={f.name} onPress={() => { setDraft({ ...draft, targetId: f.id, target: f.name }); setQuery(''); setFound([]); }} testID={`rule-pick-${f.id}`} />
                  ))}
                </>
              ) : null}
              {!draft.id && draft.scope === 'category' ? categories.map((c) => <Action key={c.id} label={c.name} onPress={() => setDraft({ ...draft, targetId: c.id, target: c.name })} testID={`rule-cat-${c.id}`} />) : null}
              <ChipRow options={[{ label: 'Percent off', value: 'percentage' as RuleKind }, { label: 'Fixed price', value: 'fixed' as RuleKind }]} value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind: kind === 'fixed' ? 'fixed' : 'percentage', amount: '' })} testID="rule-kind" compact />
              <Row>
                <NumBox value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} label={draft.kind === 'fixed' ? 'Price $' : 'Percent off'} testID="rule-amount" />
                <NumBox value={draft.minQty} onChange={(minQty) => setDraft({ ...draft, minQty })} label="From qty" testID="rule-min" />
              </Row>
              <Row>
                <Action primary label={busy === 'save' ? 'Saving…' : 'Save to Odoo'} disabled={busy !== null} onPress={save} testID="rule-save" />
                <Action label="Cancel" onPress={() => setDraft(null)} testID="rule-cancel" />
              </Row>
            </Card>
          ) : null}
        </>
      )}
      <Text style={styles.foot}>Changes save straight to Odoo, which applies them to quotes.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  foot: { fontSize: 14, color: colors.muted },
});
