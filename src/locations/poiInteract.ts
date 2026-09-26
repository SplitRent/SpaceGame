import type * as THREE from 'three';
import type { Game } from '../Game';
import type { Location } from './Location';
import type { PoiInteract } from '../content/worldTypes';
import type { Interactable } from '../interaction/Interactable';
import { openNamedPanel } from '../interaction/namedPanels';

/**
 * Data-driven interaction shared by generic surfaces and interiors: requirement checks,
 * effects through the Store (so quests react), one-shot persistence, logs, doors and
 * named first-person panels.
 */
export function registerPoiInteract(game: Game, loc: Location, id: string, object: THREE.Object3D, d: PoiInteract, visible: () => boolean = () => true): Interactable {
  const store = game.store;
  const done = () => !!store.getEntity(loc.id, id, 'done');
  const it: Interactable = {
    id,
    object,
    kind: d.kind ?? (d.travel ? 'door' : d.panel ? 'panel' : 'use'),
    range: d.range ?? 3.5,
    prompt: () => d.prompt,
    detail: () => {
      if (d.requires?.length) {
        const missing = d.requires.find((r) => store.count(r.item) < r.qty);
        if (missing) return `Requires ${missing.qty} × ${store.content.items[missing.item]?.name ?? missing.item}`;
        return `Uses ${d.requires.map((r) => `${r.qty} × ${store.content.items[r.item]?.name ?? r.item}`).join(', ')}`;
      }
      return d.detail ?? null;
    },
    available: () => visible() && (!d.once || !done()) && (!d.available || store.check(d.available)),
    interact: () => {
      if (d.requires?.length) {
        if (!store.takeAll(d.requires)) {
          const missing = d.requires.find((r) => store.count(r.item) < r.qty);
          store.notify(`Need ${missing?.qty} × ${store.content.items[missing?.item ?? '']?.name ?? missing?.item}`, 'warn');
          game.audio.play('error');
          return;
        }
      }
      store.batch(`poi:${id}`, () => {
        if (d.once) store.setEntity(loc.id, id, 'done', true);
        if (d.effects?.length) store.apply(d.effects);
      });
      if (d.log) game.openReader(d.log.title, d.log.text);
      if (d.panel) openNamedPanel(game, d.panel, object);
      if (d.travel) {
        game.audio.play(d.kind === 'door' || !d.kind ? 'airlock' : 'door');
        void game.locations.travel({ location: d.travel.location, spawn: d.travel.spawn }, { label: d.travel.label ?? '' });
      } else if (!d.log && !d.panel) game.audio.play('confirm', 0.6);
    },
  };
  loc.registerInteractable(it);
  return it;
}
