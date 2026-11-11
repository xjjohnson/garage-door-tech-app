import { DIAG_BRANDS, DIAG_FAMILIES, DiagBrand, DiagCode, DiagFamily } from '../data/diagnostics';

/** The model families for one maker, in the order they are listed. */
export function familiesFor(brandId: string, families: DiagFamily[] = DIAG_FAMILIES): DiagFamily[] {
  return families.filter((f) => f.brand === brandId);
}

export function brandById(id: string): DiagBrand | undefined {
  return DIAG_BRANDS.find((b) => b.id === id);
}

export function familyById(id: string, families: DiagFamily[] = DIAG_FAMILIES): DiagFamily | undefined {
  return families.find((f) => f.id === id);
}

/** One code in one family, or undefined if either is unknown. */
export function findCode(familyId: string, code: string, families: DiagFamily[] = DIAG_FAMILIES): { family: DiagFamily; code: DiagCode } | undefined {
  const family = familyById(familyId, families);
  const hit = family?.codes.find((c) => c.code === code);
  return family && hit ? { family, code: hit } : undefined;
}

/** The website host of a source link, for "opens <host>" labels. */
export function hostOf(url: string): string {
  return url.replace(/^https:\/\/([^/]+).*$/, '$1');
}
