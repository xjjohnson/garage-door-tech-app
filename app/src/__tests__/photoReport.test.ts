import { photoPairs, photoReportHtml, MAX_PHOTO_PAIRS } from '../lib/photoReport';
import { beforeAfterReportHtml } from '../lib/reportFiles';
import { EMPTY_ATTACHMENTS, JobPhoto } from '../lib/attachments';

const p = (id: string, kind: JobPhoto['kind'], at: number) => ({ id, kind, at, src: `data:image/jpeg;base64,${id}` });
const biz = { name: 'Johnsons', phone: '555' } as never;

describe('before/after photo report', () => {
  it('lines up before and after photos oldest first and skips other photos', () => {
    const pairs = photoPairs([p('b2', 'before', 2), p('a1', 'after', 5), p('o', 'other', 1), p('b1', 'before', 1), p('a2', 'after', 6), p('b3', 'before', 3)]);
    expect(pairs.map((x) => [x.before?.src.slice(-2), x.after?.src.slice(-2)])).toEqual([['b1', 'a1'], ['b2', 'a2'], ['b3', undefined]]);
  });

  it('caps the pairs', () => {
    const many = Array.from({ length: 20 }, (_, i) => p(`b${i}`, 'before', i));
    expect(photoPairs(many)).toHaveLength(MAX_PHOTO_PAIRS);
  });

  it('is empty without photos and escapes names', () => {
    expect(photoReportHtml([], { customer: 'x', address: '' }, biz, '')).toBe('');
    const html = photoReportHtml(photoPairs([p('b', 'before', 1)]), { customer: '<b>Pat</b>', address: '1 Oak', reference: 'INV/1' }, biz, '');
    expect(html).toContain('&lt;b&gt;Pat');
    expect(html).toContain('No after photo');
    expect(html).toContain('INV/1');
  });

  it('builds from the saved photos of the job only', async () => {
    const att = { ...EMPTY_ATTACHMENTS, photos: [{ id: '1', jobId: 'j1', uri: 'f1', kind: 'before' as const, at: 1 }, { id: '2', jobId: 'j2', uri: 'f2', kind: 'after' as const, at: 2 }] };
    const media = { photoDataUrl: async (u: string) => `data:image/jpeg;base64,${u}` };
    const html = await beforeAfterReportHtml({ id: 'j1', customer: 'Pat', address: '' }, att, media, biz);
    expect(html).toContain('base64,f1');
    expect(html).not.toContain('base64,f2');
    expect(await beforeAfterReportHtml({ id: 'j3', customer: 'Pat', address: '' }, att, media, biz)).toBe('');
  });
});
