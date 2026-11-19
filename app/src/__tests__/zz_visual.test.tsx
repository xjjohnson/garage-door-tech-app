import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import fs from 'fs';
import { SCHEDULE_STORAGE_KEY } from '../lib/schedule';
import { renderApp } from '../testing/renderApp';

jest.mock('../lib/themeStart', () => ({
  readStartChoice: () => (process.env.VIS_DARK === '1' ? 'dark' : 'light'),
  readStartValue: (k: string) => (k === 'apptheme' ? process.env.VIS_THEME ?? null : null),
  writeStartChoice: () => undefined,
  writeStartValue: () => undefined,
}));

const PX = new Set(['padding', 'paddingHorizontal', 'paddingVertical', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'margin', 'marginHorizontal', 'marginVertical', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'gap', 'rowGap', 'columnGap', 'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'top', 'left', 'right', 'bottom', 'fontSize', 'lineHeight', 'letterSpacing', 'borderRadius', 'borderWidth', 'borderLeftWidth', 'borderTopWidth', 'borderBottomWidth', 'borderRightWidth']);
const MAP: Record<string, string> = { paddingHorizontal: 'padding-inline', paddingVertical: 'padding-block', marginHorizontal: 'margin-inline', marginVertical: 'margin-block' };
const kebab = (k: string) => MAP[k] ?? k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function css(style: any, isText: boolean): string {
  const f: Record<string, any> = StyleSheet.flatten(style) ?? {};
  const out: string[] = [];
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null) continue;
    if (['elevation', 'shadowColor', 'shadowOpacity', 'shadowRadius', 'shadowOffset', 'textAlignVertical', 'includeFontPadding', 'borderCurve'].includes(k)) continue;
    if (k === 'flex') { out.push(`flex:${v} ${v > 0 ? 1 : 0} ${v > 0 ? '0%' : 'auto'}`); continue; }
    if (k === 'transform' || k === 'pointerEvents' || k === 'userSelect') continue;
    if (k === 'aspectRatio') { out.push(`aspect-ratio:${v}`); continue; }
    if (k === 'fontWeight') { out.push(`font-weight:${v}`); continue; }
    if (k === 'zIndex' || k === 'opacity' || k === 'flexGrow' || k === 'flexShrink') { out.push(`${kebab(k)}:${v}`); continue; }
    if (k === 'borderStyle') continue;
    if (PX.has(k) && typeof v === 'number') out.push(`${kebab(k)}:${v}px`);
    else if (typeof v === 'number' || typeof v === 'string') out.push(`${kebab(k)}:${v}`);
  }
  if (f.borderWidth || f.borderLeftWidth || f.borderTopWidth || f.borderBottomWidth || f.borderRightWidth) out.push('border-style:solid');
  return out.join(';');
}

function html(n: any, parentText = false): string {
  if (n == null) return '';
  if (typeof n === 'string') return esc(n);
  if (Array.isArray(n)) return n.map((c) => html(c, parentText)).join('');
  const type: string = n.type;
  const p = n.props ?? {};
  const isText = type === 'Text';
  if (type === 'TextInput') return `<div class="v" style="${css(p.style, true)};color:#888">${esc(p.value || p.placeholder || '')}</div>`;
  if (type === 'Image' || type === 'RNSVGSvgView' || /WebView|RNCWebView/.test(type)) return `<div class="v" style="${css(p.style, false)};background:#cfd8cf"></div>`;
  let style = css(p.style, isText);
  if (type === 'RCTScrollView' || type === 'ScrollView') { style += ';overflow:hidden;flex:1 1 0%'; }
  const kids = (n.children ?? []).map((c: any) => html(c, isText || parentText)).join('');
  if (isText) {
    const lines = p.numberOfLines;
    const clamp = lines ? `;display:-webkit-box;-webkit-line-clamp:${lines};-webkit-box-orient:vertical;overflow:hidden` : parentText ? ';display:inline' : ';display:block';
    return `<span class="t" style="${style}${clamp}">${kids}</span>`;
  }
  return `<div class="v" style="${style}">${kids}</div>`;
}

const PAGE = (body: string, dark: boolean) => `<!doctype html><meta charset=utf-8><style>
html,body{margin:0;background:#888}
.v{display:flex;flex-direction:column;box-sizing:border-box;position:relative;align-items:stretch;flex-shrink:0;min-width:0;min-height:0;border-color:transparent}
.t{box-sizing:border-box;margin:0;white-space:normal}
#app{width:411px;height:870px;overflow:hidden;display:flex;flex-direction:column;font-family:Inter,Roboto,system-ui,sans-serif;font-size:14px;color:#000}
</style><div id=app>${body}</div>`;

export async function snap(name: string) {
  const json: any = screen.toJSON();
  const body = html(json);
  fs.writeFileSync(`/tmp/claude-0/vis/${name}.html`, PAGE(body, process.env.VIS_DARK === '1'));
}

const at = (h: number, d = 0) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.getTime(); };
const appt = (id: string, start: number, name: string, what: string, address: string) => ({ id, start, minutes: 60, name, address, phone: '', what, status: 'booked', createdAt: 1, updatedAt: 1 });

describe('visual', () => {
  it('home', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify([appt('a1', at(14), 'Pat Lee', 'Spring repair', 'Old Bastrop Hwy, San Marcos'), appt('a2', at(16, 0), 'Dana Cruz', 'Opener install', 'Hillside Terrace, Kyle')]));
    await renderApp('/');
    for (let i = 0; i < 6; i++) await act(async () => undefined);
    await snap(`${process.env.VIS_THEME}-${process.env.VIS_DARK === '1' ? 'dark' : 'light'}-home`);
  });

  it('customers and tools', async () => {
    await AsyncStorage.clear();
    const c = (id: string, name: string, address: string, phone = '') => ({ id, name, phone, email: '', address, notes: '', createdAt: 1, updatedAt: 1 });
    await AsyncStorage.setItem('customers/v1', JSON.stringify([c('c1', 'Flash Garage Doors LLC', 'Kyle Parkway, Kyle', '5123335542'), c('c2', 'George jones', 'West Lockhart Street, Kyle'), c('c3', 'Grand papi', 'Kyle Parkway, Kyle', '5123335542'), c('c4', 'john smith', '1250 robert s light blvd, Buda')]));
    for (const [r, n] of [['/customers', 'customers'], ['/tools', 'tools']] as const) {
      await renderApp(r);
      for (let i = 0; i < 6; i++) await act(async () => undefined);
      await snap(`${process.env.VIS_THEME}-${process.env.VIS_DARK === '1' ? 'dark' : 'light'}-${n}`);
    }
  });
});
