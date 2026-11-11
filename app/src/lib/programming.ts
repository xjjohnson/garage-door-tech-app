import { MANUAL_LINKS, ManualLink } from '../data/manuals';
import { PROG_FAMILIES, ProgFamily, ProgTask, ProgTaskKind } from '../data/programming';

/** Maker ids that have at least one programming guide, in list order. */
export function progBrands(families: ProgFamily[] = PROG_FAMILIES): string[] {
  return [...new Set(families.map((f) => f.brand))];
}

export function progFamiliesFor(brandId: string, families: ProgFamily[] = PROG_FAMILIES): ProgFamily[] {
  return families.filter((f) => f.brand === brandId);
}

export function progFamilyById(id: string, families: ProgFamily[] = PROG_FAMILIES): ProgFamily | undefined {
  return families.find((f) => f.id === id);
}

export function taskFor(family: ProgFamily, kind: ProgTaskKind): ProgTask | undefined {
  return family.tasks.find((t) => t.kind === kind);
}

/** The family's manuals from the Manuals library, skipping any id that's gone. */
export function manualsFor(family: ProgFamily, links: ManualLink[] = MANUAL_LINKS): ManualLink[] {
  return family.manuals.map((id) => links.find((l) => l.id === id)).filter((l): l is ManualLink => !!l);
}
