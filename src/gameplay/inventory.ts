import type { Container, ItemStack } from '../state/GameState';
import type { ItemDef } from '../content/types';

/**
 * Pure container operations. All transfers are atomic: they either fully succeed or
 * leave the container untouched. Quest items are never refused for capacity reasons
 * (they may exceed the slot limit) so progression can never be blocked by a full pack.
 */

export type ItemLookup = (id: string) => ItemDef | undefined;

export function countItem(c: Container, itemId: string): number {
  let n = 0;
  for (const s of c.stacks) if (s.itemId === itemId) n += s.qty;
  return n;
}

export function usedSlots(c: Container): number {
  return c.stacks.length;
}

/** How many of itemId could be added without exceeding capacity. */
export function spaceFor(c: Container, item: ItemDef): number {
  if (item.category === 'quest') return Number.MAX_SAFE_INTEGER;
  let space = 0;
  for (const s of c.stacks) if (s.itemId === item.id) space += item.stack - s.qty;
  space += Math.max(0, c.slots - c.stacks.length) * item.stack;
  return space;
}

/** Adds up to qty; returns how many were actually added. */
export function addItem(c: Container, item: ItemDef, qty: number, allowPartial = true): number {
  if (qty <= 0) return 0;
  const space = spaceFor(c, item);
  if (!allowPartial && space < qty) return 0;
  let remaining = Math.min(qty, space);
  const added = remaining;
  for (const s of c.stacks) {
    if (remaining <= 0) break;
    if (s.itemId !== item.id) continue;
    const take = Math.min(item.stack - s.qty, remaining);
    s.qty += take;
    remaining -= take;
  }
  while (remaining > 0) {
    const take = Math.min(item.stack, remaining);
    c.stacks.push({ itemId: item.id, qty: take });
    remaining -= take;
  }
  return added;
}

/** Removes exactly qty or nothing. Returns success. */
export function removeItem(c: Container, itemId: string, qty: number): boolean {
  if (qty <= 0) return true;
  if (countItem(c, itemId) < qty) return false;
  let remaining = qty;
  // Remove from the smallest stacks first to keep inventory tidy.
  const order = c.stacks
    .map((s, i) => ({ s, i }))
    .filter((e) => e.s.itemId === itemId)
    .sort((a, b) => a.s.qty - b.s.qty);
  for (const { s } of order) {
    if (remaining <= 0) break;
    const take = Math.min(s.qty, remaining);
    s.qty -= take;
    remaining -= take;
  }
  c.stacks = c.stacks.filter((s) => s.qty > 0);
  return true;
}

/** Atomic transfer. Returns the amount moved (0 if nothing could move). */
export function transfer(from: Container, to: Container, item: ItemDef, qty: number): number {
  const available = countItem(from, item.id);
  const n = Math.min(qty, available, spaceFor(to, item));
  if (n <= 0) return 0;
  removeItem(from, item.id, n);
  addItem(to, item, n);
  return n;
}

/** Check whether all inputs are present. */
export function hasAll(c: Container, inputs: { item: string; qty: number }[]): boolean {
  return inputs.every((i) => countItem(c, i.item) >= i.qty);
}

/** Merge stacks and sort by category for display. Does not change counts. */
export function compact(c: Container, lookup: ItemLookup): void {
  const totals = new Map<string, number>();
  for (const s of c.stacks) totals.set(s.itemId, (totals.get(s.itemId) ?? 0) + s.qty);
  const stacks: ItemStack[] = [];
  for (const [id, total] of totals) {
    const def = lookup(id);
    const per = def?.stack ?? 99;
    let r = total;
    while (r > 0) {
      const t = Math.min(per, r);
      stacks.push({ itemId: id, qty: t });
      r -= t;
    }
  }
  c.stacks = stacks;
}
