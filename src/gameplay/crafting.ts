import type { Game } from '../Game';
import type { Facility, RecipeDef } from '../content/types';
import { PLAYER_INV } from '../state/Store';
import { countItem, spaceFor } from './inventory';

export interface CraftCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Crafting tied to facilities. A craft is atomic: inputs are removed and outputs added in
 * one batch, or nothing happens. Output that doesn't fit in the suit goes to the
 * facility's storage (ship cargo / base storage) instead of being lost.
 */
export class CraftingSystem {
  constructor(private game: Game) {}

  recipesFor(facility: Facility): RecipeDef[] {
    const store = this.game.store;
    return Object.values(store.content.recipes).filter((r) => r.facility.includes(facility) && store.check(r.requires));
  }

  check(recipe: RecipeDef, facility: Facility): CraftCheck {
    const store = this.game.store;
    if (!recipe.facility.includes(facility)) return { ok: false, reason: 'Wrong facility' };
    if (!store.check(recipe.requires)) return { ok: false, reason: 'Not available yet' };
    const inv = store.container(PLAYER_INV);
    for (const i of recipe.inputs) {
      if (countItem(inv, i.item) < i.qty) return { ok: false, reason: `Need ${i.qty} ${store.content.items[i.item]?.name ?? i.item}` };
    }
    return { ok: true };
  }

  craft(recipeId: string, facility: Facility): boolean {
    const game = this.game;
    const store = game.store;
    const recipe = store.content.recipes[recipeId];
    if (!recipe) return false;
    const c = this.check(recipe, facility);
    if (!c.ok) {
      store.notify(c.reason ?? 'Cannot craft', 'warn');
      game.audio.play('error', 0.6);
      return false;
    }
    const outDef = store.content.items[recipe.output.item];
    let ok = false;
    store.batch('craft', () => {
      if (!store.takeAll(recipe.inputs)) return;
      const inv = store.container(PLAYER_INV);
      const fits = Math.min(recipe.output.qty, spaceFor(inv, outDef));
      if (fits > 0) store.give(outDef.id, fits);
      const rest = recipe.output.qty - fits;
      if (rest > 0) {
        const overflow = facility === 'workbench' || facility === 'lab' ? 'base.storage' : 'ship.cargo';
        store.give(outDef.id, rest, overflow);
        store.notify(`${rest} ${outDef.name} sent to ${overflow === 'ship.cargo' ? 'ship cargo' : 'base storage'}`, 'info');
      }
      store.setFlag('stat.crafted', ((store.state.flags['stat.crafted'] as number) ?? 0) + 1);
      store.setFlag(`crafted.${outDef.id}`, true);
      ok = true;
    });
    if (ok) game.audio.play('craft', 0.8);
    return ok;
  }
}
