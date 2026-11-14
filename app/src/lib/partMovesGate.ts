/**
 * Whether this Odoo can record parts used as stock moves on a job's order
 * (Field Service Stock, src/lib/odooPartMoves.ts). Found out once per
 * sign-in by OdooPartsUsedSync and read when a part is taken for a job, so
 * the use is marked then and the truck count sync leaves it to the move.
 * False until it has been found out, so nothing changes while offline.
 */
let available = false;

export const movesAvailable = () => available;
export const setMovesAvailable = (on: boolean) => {
  available = on;
};
