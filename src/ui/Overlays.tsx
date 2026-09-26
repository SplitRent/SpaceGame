import { useEffect, useState } from 'preact/hooks';
import { ui } from './uiState';
import { game } from './gameRef';
import type { Game, Settings } from '../Game';
import type { ItemDef, Facility } from '../content/types';
import { PLAYER_INV } from '../state/Store';
import { SLOT_IDS, type SaveSummary, parseSaveFile, buildSaveFile } from '../save/SaveManager';
import { LOCATION_REGISTRY } from '../locations/registry';
import { countItem } from '../gameplay/inventory';
import { LAUNCH_PROPELLANT, propellantCapacity } from '../content/shipSystems';
import { ENDINGS, CREDITS, endingParagraphs } from '../content/endings';

function useRev(): number {
  return ui.revision.value;
}

function Panel(props: { title: string; sub?: string; children: any; wide?: boolean; onClose?: () => void }) {
  const g = game()!;
  return (
    <div class="panel" style={props.wide ? { width: 'min(1060px, 94vw)' } : undefined}>
      <button class="close-x" onClick={() => (props.onClose ? props.onClose() : g.closeOverlay())}>×</button>
      <h2>{props.title}</h2>
      {props.sub && <div class="sub">{props.sub}</div>}
      {props.children}
    </div>
  );
}

function Glyph({ def }: { def: ItemDef }) {
  return (
    <div class="glyph" style={{ background: def.color, color: isDark(def.color) ? '#ddd' : 'rgba(0,0,0,0.75)' }}>
      {def.glyph}
    </div>
  );
}

function isDark(hex: string): boolean {
  const c = parseInt(hex.slice(1), 16);
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return r * 0.3 + g * 0.59 + b * 0.11 < 90;
}

/* ------------------------------- Pause ------------------------------- */

function Pause() {
  const g = game()!;
  const [sub, setSub] = useState<null | 'saves' | 'settings'>(null);
  if (sub === 'saves') return <Saves onBack={() => setSub(null)} />;
  if (sub === 'settings') return <SettingsPanel onBack={() => setSub(null)} />;
  const can = g.canSave();
  return (
    <Panel title="Paused" sub={`${g.store.state.meta.chapter} · ${formatTime(g.store.state.meta.playtimeSec)} played`}>
      <div class="menu">
        <button class="interactive" onClick={() => g.closeOverlay()}>Resume</button>
        <button class="interactive" disabled={!can.ok} title={can.reason} onClick={() => setSub('saves')}>Save / Load</button>
        <button class="interactive" onClick={() => { g.closeOverlay(); g.openOverlay('journal'); }}>Journal</button>
        <button class="interactive" onClick={() => { g.closeOverlay(); g.openOverlay('shipstatus', 'ship'); }}>Ship status</button>
        <button class="interactive" onClick={() => setSub('settings')}>Settings</button>
        <button class="interactive" onClick={() => void g.quitToTitle()}>Quit to title</button>
      </div>
      <h3>Controls</h3>
      <div class="kv" style={{ fontSize: '12px' }}>
        <span class="k">WASD / Space / Shift</span><span>Move · jump · sprint</span>
        <span class="k">Mouse · V</span><span>Look · cycle view (1st / behind / front)</span>
        <span class="k">E · F (hold) · LMB (hold)</span><span>Interact · scan · multi-tool</span>
        <span class="k">Tab · J · M · L</span><span>Inventory · journal · map · headlamp</span>
        <span class="k">F6 · F9</span><span>Quicksave · quickload</span>
        <span class="k">Flight: W/S · A/D · Space/C · Q/E · Z · X</span><span>Throttle · strafe · up/down · roll · assist · leave seat</span>
      </div>
    </Panel>
  );
}

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/* ------------------------------- Saves ------------------------------- */

export function Saves({ onBack, loadOnly }: { onBack: () => void; loadOnly?: boolean }) {
  const g = game()!;
  const [list, setList] = useState<SaveSummary[]>([]);
  const [msg, setMsg] = useState('');
  const refresh = () => void g.saves.list().then(setList);
  useEffect(refresh, []);
  const find = (slot: string) => list.find((s) => s.slot === slot);
  const doExport = async (slot: string) => {
    const r = await g.saves.read(slot);
    if (!r.ok) return setMsg(r.error);
    const blob = new Blob([g.saves.exportJson(r.file)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lantern-${slot}.json`;
    a.click();
  };
  const doImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const res = parseSaveFile(JSON.parse(await f.text()));
        if (!res.ok) return setMsg(`Import failed: ${res.error}`);
        const file = buildSaveFile(res.state, 'slot3', 'Imported', res.file.meta.objective, res.file.meta.location);
        await g.saves.write(file);
        setMsg('Imported into Slot 3');
        refresh();
      } catch {
        setMsg('Import failed: not a valid save file');
      }
    };
    input.click();
  };
  return (
    <Panel title={loadOnly ? 'Load game' : 'Save & load'} sub={g.saves.persistent ? 'Saved in this browser (IndexedDB). Export to back up.' : 'Browser storage unavailable — saves last only this session. Export to keep them.'} onClose={onBack}>
      <div class="list">
        {SLOT_IDS.map((slot) => {
          const s = find(slot);
          const auto = slot.startsWith('auto') || slot === 'quick';
          return (
            <div class="item row" key={slot} style={{ justifyContent: 'space-between' }}>
              <div>
                <div class="t">{slotName(slot)} {s && <span class="cap">· {new Date(s.savedAt).toLocaleString()}</span>}</div>
                <div class="s">{s ? `${s.meta.location} — ${s.meta.chapter}${s.meta.objective ? ` · ${s.meta.objective}` : ''}` : 'Empty'}</div>
              </div>
              <div class="row">
                {!loadOnly && !auto && (
                  <button class="btn small interactive" onClick={async () => { if (await g.save(slot, slotName(slot))) { setMsg('Saved'); refresh(); } }}>Save</button>
                )}
                {s && <button class="btn small primary interactive" onClick={async () => { const ok = await g.loadSlot(slot); if (!ok) setMsg('Load failed'); }}>Load</button>}
                {s && <button class="btn small interactive" onClick={() => void doExport(slot)}>Export</button>}
                {s && !auto && <button class="btn small interactive" onClick={async () => { await g.saves.remove(slot); refresh(); }}>Delete</button>}
              </div>
            </div>
          );
        })}
      </div>
      <div class="row" style={{ marginTop: '12px' }}>
        <button class="btn small interactive" onClick={doImport}>Import save file…</button>
        <span class="cap">{msg}</span>
      </div>
    </Panel>
  );
}

function slotName(slot: string): string {
  return slot === 'auto1' ? 'Autosave A' : slot === 'auto2' ? 'Autosave B' : slot === 'quick' ? 'Quicksave' : `Slot ${slot.slice(4)}`;
}

/* ------------------------------ Settings ------------------------------ */

export function SettingsPanel({ onBack }: { onBack: () => void }) {
  const g = game()!;
  const [s, setS] = useState<Settings>(structuredClone(g.settings));
  const upd = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    g.settings = next;
    g.applySettings();
  };
  const vol = (k: keyof Settings['volumes'], v: number) => upd({ volumes: { ...s.volumes, [k]: v } });
  return (
    <Panel title="Settings" onClose={onBack}>
      <h3>Graphics</h3>
      <div class="setting">
        <span>Quality</span>
        <select class="interactive" value={s.quality} onChange={(e) => upd({ quality: (e.target as HTMLSelectElement).value as Settings['quality'] })}>
          <option value="low">Low (integrated GPUs)</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <span />
      </div>
      <div class="setting">
        <span>Field of view</span>
        <input class="interactive" type="range" min="55" max="100" value={s.fov} onInput={(e) => upd({ fov: +(e.target as HTMLInputElement).value })} />
        <span>{s.fov}°</span>
      </div>
      <h3>Controls</h3>
      <div class="setting">
        <span>Mouse sensitivity</span>
        <input class="interactive" type="range" min="0.2" max="3" step="0.05" value={s.sensitivity} onInput={(e) => upd({ sensitivity: +(e.target as HTMLInputElement).value })} />
        <span>{s.sensitivity.toFixed(2)}</span>
      </div>
      <div class="setting">
        <span>Invert Y</span>
        <input class="interactive" type="checkbox" checked={s.invertY} onChange={(e) => upd({ invertY: (e.target as HTMLInputElement).checked })} />
        <span />
      </div>
      <h3>Accessibility</h3>
      <div class="setting">
        <span>Navigation assist</span>
        <select class="interactive" value={s.navAssist} onChange={(e) => upd({ navAssist: (e.target as HTMLSelectElement).value as Settings['navAssist'] })}>
          <option value="off">Off — logs, landmarks and scanner only</option>
          <option value="hints">Hints — objective text</option>
          <option value="markers">Waypoints — on-screen objective marker + map markers</option>
        </select>
        <span />
      </div>
      <h3>Audio</h3>
      {(['master', 'sfx', 'ambience', 'music'] as const).map((k) => (
        <div class="setting" key={k}>
          <span style={{ textTransform: 'capitalize' }}>{k}</span>
          <input class="interactive" type="range" min="0" max="1" step="0.05" value={s.volumes[k]} onInput={(e) => vol(k, +(e.target as HTMLInputElement).value)} />
          <span>{Math.round(s.volumes[k] * 100)}</span>
        </div>
      ))}
      <div class="setting">
        <span>Character voices</span>
        <input class="interactive" type="checkbox" checked={s.voices} onChange={(e) => upd({ voices: (e.target as HTMLInputElement).checked })} />
        <span />
      </div>
      <div class="setting">
        <span>Voice volume</span>
        <input class="interactive" type="range" min="0" max="1" step="0.05" value={s.voiceVolume} onInput={(e) => upd({ voiceVolume: +(e.target as HTMLInputElement).value })} />
        <span>{Math.round(s.voiceVolume * 100)}</span>
      </div>
    </Panel>
  );
}

/* ------------------------------ Inventory ------------------------------ */

function ItemGrid({ containerId, selected, onSelect }: { containerId: string; selected: string | null; onSelect: (id: string) => void }) {
  const g = game()!;
  const c = g.store.container(containerId);
  const cells = Math.max(c.slots, c.stacks.length);
  return (
    <div class="grid">
      {Array.from({ length: cells }).map((_, i) => {
        const st = c.stacks[i];
        if (!st) return <div class="slot empty" key={i} />;
        const def = g.store.content.items[st.itemId];
        if (!def) return <div class="slot empty" key={i} />;
        return (
          <div key={i} class={`slot interactive ${selected === st.itemId ? 'sel' : ''}`} onClick={() => onSelect(st.itemId)} title={def.name}>
            <Glyph def={def} />
            {def.category === 'quest' && <span class="quest">★</span>}
            <span class="qty">{st.qty}</span>
          </div>
        );
      })}
    </div>
  );
}

function ItemDetail({ id, children }: { id: string | null; children?: any }) {
  const g = game()!;
  if (!id) return <div class="detail"><p class="cap">Select an item.</p></div>;
  const def = g.store.content.items[id];
  if (!def) return null;
  const uses = Object.values(g.store.content.recipes).filter((r) => r.inputs.some((i) => i.item === id)).map((r) => g.store.content.items[r.output.item]?.name);
  return (
    <div class="detail">
      <div class="name">{def.name}</div>
      <div class="cat">{def.category}{def.category === 'quest' ? ' · cannot be dropped' : ''}</div>
      <p>{def.description}</p>
      {def.science && <p class="science">{def.science}</p>}
      {uses.length > 0 && <p class="cap">Used in: {[...new Set(uses)].join(', ')}</p>}
      {children}
    </div>
  );
}

function Inventory() {
  useRev();
  const g = game()!;
  const [sel, setSel] = useState<string | null>(null);
  const c = g.store.container(PLAYER_INV);
  const def = sel ? g.store.content.items[sel] : null;
  const has = sel ? countItem(c, sel) > 0 : false;
  return (
    <Panel title="Suit inventory" sub={`${c.stacks.length}/${c.slots} slots · Larger storage aboard the Lantern and at base camp`} wide>
      <div class="cols" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <ItemGrid containerId={PLAYER_INV} selected={sel} onSelect={setSel} />
        <ItemDetail id={has ? sel : null}>
          {def?.use && has && (
            <button class="btn primary interactive" onClick={() => { g.store.take(def.id, 1); g.store.apply(def.use, 'use'); g.audio.play('confirm'); }}>Use</button>
          )}
        </ItemDetail>
      </div>
      <h3>Field fabrication</h3>
      <Recipes facility="field" />
    </Panel>
  );
}

/* ------------------------------ Container ------------------------------ */

function ContainerPanel() {
  useRev();
  const g = game()!;
  const id = ui.overlayArg.value ?? 'ship.cargo';
  const [sel, setSel] = useState<{ from: string; item: string } | null>(null);
  const move = (from: string, to: string, item: string, all: boolean) => {
    const def = g.store.content.items[item];
    const n = all ? g.store.count(item, from) : 1;
    const fromC = g.store.container(from);
    const toC = g.store.container(to);
    g.store.batch('transfer', () => {
      const moved = Math.min(n, countItem(fromC, item));
      if (moved <= 0) return;
      // atomic: remove then add what fits, return the rest
      g.store.take(item, moved, from);
      const added = g.store.give(item, moved, to);
      if (added < moved) g.store.give(item, moved - added, from);
    });
    void def;
    void toC;
  };
  const name = id === 'ship.cargo' ? 'Lantern cargo hold' : id === 'base.storage' ? 'Base storage' : id;
  return (
    <Panel title={name} sub="Click an item to select · transfer between your suit and storage" wide>
      <div class="cols">
        <div>
          <h3>Suit</h3>
          <ItemGrid containerId={PLAYER_INV} selected={sel?.from === PLAYER_INV ? sel.item : null} onSelect={(item) => setSel({ from: PLAYER_INV, item })} />
        </div>
        <div>
          <h3>{name}</h3>
          <ItemGrid containerId={id} selected={sel?.from === id ? sel.item : null} onSelect={(item) => setSel({ from: id, item })} />
        </div>
      </div>
      {sel && (
        <div class="row" style={{ marginTop: '14px' }}>
          <span>{g.store.content.items[sel.item]?.name} × {g.store.count(sel.item, sel.from)}</span>
          <button class="btn small interactive" onClick={() => move(sel.from, sel.from === PLAYER_INV ? id : PLAYER_INV, sel.item, false)}>Move 1</button>
          <button class="btn small primary interactive" onClick={() => move(sel.from, sel.from === PLAYER_INV ? id : PLAYER_INV, sel.item, true)}>Move all</button>
        </div>
      )}
      <div class="row" style={{ marginTop: '10px' }}>
        <button class="btn small interactive" onClick={() => {
          const inv = g.store.container(PLAYER_INV);
          for (const st of [...inv.stacks]) {
            const d = g.store.content.items[st.itemId];
            if (d && d.category === 'resource') move(PLAYER_INV, id, st.itemId, true);
          }
        }}>Deposit all raw resources</button>
      </div>
    </Panel>
  );
}

/* ------------------------------ Crafting ------------------------------ */

function Recipes({ facility }: { facility: Facility }) {
  useRev();
  const g = game()!;
  const list = g.crafting.recipesFor(facility);
  if (!list.length) return <p class="cap">No recipes available here yet.</p>;
  return (
    <div>
      {list.map((r) => {
        const out = g.store.content.items[r.output.item];
        const check = g.crafting.check(r, facility);
        return (
          <div class="recipe" key={r.id}>
            <div class="row">
              <div class="slot" style={{ width: '46px', cursor: 'default' }}><Glyph def={out} /></div>
              <div>
                <div>{out.name}{r.output.qty > 1 ? ` ×${r.output.qty}` : ''}</div>
                <div class="ins">
                  {r.inputs.map((i, k) => {
                    const have = g.store.count(i.item);
                    return (
                      <span key={k} class={have >= i.qty ? 'have' : 'miss'}>
                        {k > 0 ? ' · ' : ''}{i.qty} {g.store.content.items[i.item]?.name} ({have})
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
            <button class="btn small primary interactive" disabled={!check.ok} onClick={() => g.crafting.craft(r.id, facility)}>Craft</button>
          </div>
        );
      })}
    </div>
  );
}

function Craft() {
  const facility = (ui.overlayArg.value ?? 'fabricator') as Facility;
  const names: Record<Facility, string> = { field: 'Field fabrication', fabricator: 'Lantern fabricator', workbench: 'Base workbench', lab: 'Field lab' };
  return (
    <Panel title={names[facility]} sub="Materials are drawn from your suit inventory" wide>
      <Recipes facility={facility} />
    </Panel>
  );
}

/* -------------------------------- Build -------------------------------- */

function Build() {
  useRev();
  const g = game()!;
  const pad = ui.overlayArg.value ?? '';
  const mods = Object.values(g.store.content.baseModules);
  return (
    <Panel title="Construction pad" sub="Choose a module. Materials come from your suit." wide>
      {mods.map((m) => {
        const can = g.base.canBuild(m.id);
        const built = g.base.builtModules().filter((x) => x === m.id).length;
        return (
          <div class="recipe" key={m.id}>
            <div>
              <div>{m.name} {built > 0 && <span class="cap">· built ×{built}</span>}</div>
              <div class="cap">{m.description} · {m.powerKW < 0 ? `generates up to ${-m.powerKW} kW` : m.powerKW > 0 ? `uses ${m.powerKW} kW` : 'no power draw'}</div>
              <div class="ins">
                {m.cost.map((c, k) => {
                  const have = g.store.count(c.item);
                  return <span key={k} class={have >= c.qty ? 'have' : 'miss'}>{k > 0 ? ' · ' : ''}{c.qty} {g.store.content.items[c.item]?.name} ({have})</span>;
                })}
              </div>
            </div>
            <button class="btn small primary interactive" disabled={!can.ok} title={can.reason} onClick={() => {
              if (g.base.build(pad, m.id)) {
                g.audio.play('build');
                g.closeOverlay();
              }
            }}>Build</button>
          </div>
        );
      })}
    </Panel>
  );
}

/* ------------------------------- Journal ------------------------------- */

function Journal() {
  useRev();
  const g = game()!;
  const quests = Object.entries(g.store.state.quests);
  const [sel, setSel] = useState<string | null>(g.story.currentObjective()?.questId ?? quests[0]?.[0] ?? null);
  const [tab, setTab] = useState<'quests' | 'database' | 'crew'>('quests');
  const q = sel ? g.store.state.quests[sel] : null;
  const def = sel ? g.store.content.quests[sel] : null;
  const stage = def?.stages.find((s) => s.id === q?.stage);
  return (
    <Panel title="Journal" wide>
      <div class="tabs">
        <button class={`interactive ${tab === 'quests' ? 'active' : ''}`} onClick={() => setTab('quests')}>Objectives</button>
        <button class={`interactive ${tab === 'database' ? 'active' : ''}`} onClick={() => setTab('database')}>Database</button>
        <button class={`interactive ${tab === 'crew' ? 'active' : ''}`} onClick={() => setTab('crew')}>Crew</button>
      </div>
      {tab === 'database' && <Database />}
      {tab === 'crew' && <Crew />}
      {tab === 'quests' && (
        <div class="cols" style={{ gridTemplateColumns: '300px 1fr' }}>
          <div class="list">
            {quests.length === 0 && <p class="cap">No entries yet.</p>}
            {[...quests].sort((a, b) => (a[1].status === 'active' ? -1 : 1) - (b[1].status === 'active' ? -1 : 1)).map(([id, st]) => {
              const d = g.store.content.quests[id];
              if (!d) return null;
              return (
                <div key={id} class={`item interactive ${sel === id ? 'sel' : ''} ${st.status !== 'active' ? 'done' : ''}`} onClick={() => setSel(id)}>
                  <div class="t">{d.title}</div>
                  <div class="s">{d.kind === 'main' ? 'Main' : d.kind === 'crew' ? 'Crew' : 'Side'} · {st.status}</div>
                </div>
              );
            })}
          </div>
          <div class="detail">
            {def && q && (
              <>
                <div class="name">{def.title}</div>
                <div class="cat">{def.kind} {def.giver ? `· ${g.store.content.npcs[def.giver]?.name ?? ''}` : ''}</div>
                <p>{def.summary}</p>
                {q.status === 'active' && stage && (
                  <>
                    <p class="science">{stage.journal}</p>
                    {g.settings.navAssist !== 'off' || true ? stage.objectives.map((o) => (
                      <div key={o.id} class={`obj ${q.progress[o.id] ? 'done' : ''}`}>
                        <span class="box" />
                        <span>{o.text}{o.optional ? ' (optional)' : ''}</span>
                      </div>
                    )) : null}
                    <button class="btn small interactive" onClick={() => (g.story.trackedQuest = sel)}>Track on HUD</button>
                  </>
                )}
                {q.status === 'completed' && <p class="cap">Completed.</p>}
                {q.history.length > 0 && (
                  <>
                    <h3>Log</h3>
                    {q.history.map((h) => {
                      const st = def.stages.find((s) => s.id === h);
                      return st ? <p key={h} class="cap">— {st.journal}</p> : null;
                    })}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Database() {
  useRev();
  const g = game()!;
  const entries = Object.values(g.store.content.database);
  const known = entries.filter((e) => g.store.state.database[e.id]);
  const [sel, setSel] = useState<string | null>(known[0]?.id ?? null);
  const e = sel ? g.store.content.database[sel] : null;
  return (
    <div class="cols" style={{ gridTemplateColumns: '300px 1fr' }}>
      <div class="list">
        <div class="cap">{known.length} / {entries.length} catalogued</div>
        {known.map((k) => (
          <div key={k.id} class={`item interactive ${sel === k.id ? 'sel' : ''}`} onClick={() => setSel(k.id)}>
            <div class="t">{k.title}</div>
            <div class="s">{k.category}</div>
          </div>
        ))}
      </div>
      <div class="detail">
        {e ? (
          <>
            <div class="name">{e.title}</div>
            <div class="cat">{e.category}</div>
            <p>{e.text}</p>
          </>
        ) : (
          <p class="cap">Scan things (hold F) to fill the database. Discovery is its own reward.</p>
        )}
      </div>
    </div>
  );
}

function Crew() {
  useRev();
  const g = game()!;
  return (
    <div class="list">
      {Object.values(g.store.content.npcs).map((n) => {
        const st = g.store.state.npcs[n.id];
        const missing = n.id === 'okonkwo' && g.store.state.flags.crashed;
        return (
          <div class="item" key={n.id}>
            <div class="t">{n.name} <span class="cap">· {n.role}</span></div>
            <div class="s">{missing ? 'MISSING since the crash.' : n.bio}</div>
            {!missing && st && <div class="s">Relationship: {st.relationship >= 40 ? 'Close' : st.relationship >= 15 ? 'Friendly' : st.relationship >= 0 ? 'Professional' : 'Strained'}{st.injured ? ' · Injured' : ''}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ Ship status ------------------------------ */

function ShipStatus() {
  useRev();
  const g = game()!;
  const s = g.store.state;
  const arg = ui.overlayArg.value;
  if (arg === 'base') {
    const r = g.base.report;
    return (
      <Panel title="Base camp" sub="Power, storage and production">
        <div class="kv">
          <span class="k">Modules</span><span>{g.base.builtModules().map((m) => g.store.content.baseModules[m]?.name).join(', ') || 'None'}</span>
          <span class="k">Generation</span><span>{r.generationKW.toFixed(1)} kW</span>
          <span class="k">Load</span><span>{r.demandKW.toFixed(1)} kW</span>
          <span class="k">Battery</span><span>{r.batteryKWh.toFixed(1)} / {r.capacityKWh} kWh</span>
          <span class="k">Status</span><span style={{ color: r.powered ? 'var(--ok)' : 'var(--danger)' }}>{r.powered ? 'POWERED' : 'NO POWER'}</span>
          <span class="k">Ice hopper</span><span>{(s.flags['iceproc.hopper'] as number) ?? 0} units</span>
          <span class="k">Propellant made</span><span>{Math.round(s.ship.propellant)} / {s.flags.launched ? propellantCapacity(s) : LAUNCH_PROPELLANT} kg{s.flags.launched ? '' : ' for lunar ascent'}</span>
        </div>
      </Panel>
    );
  }
  return (
    <Panel title="EXV Lantern — systems" sub={`Hull ${(s.ship.hull * 100).toFixed(0)}% · List ${s.ship.listDeg.toFixed(0)}° · Propellant ${Math.round(s.ship.propellant)} / ${s.flags.launched ? propellantCapacity(s) : LAUNCH_PROPELLANT} kg`} wide>
      {Object.values(g.store.content.shipSystems).map((d) => {
        const st = s.ship.systems[d.id];
        const ready = g.systemReady(d.id);
        const color = st.online ? 'var(--ok)' : ready.ok ? 'var(--warn)' : 'var(--danger)';
        return (
          <div class="sysrow" key={d.id}>
            <span class="dot" style={{ background: color }} />
            <span>{d.name}</span>
            <div>
              <div class="bar"><i style={{ width: `${st.condition * 100}%`, background: color }} /></div>
              <div class="cap">
                {d.steps.map((stp) => `${st.steps[stp.id] ? '✓' : '○'} ${stp.label}`).join('   ')}
              </div>
            </div>
            <span class="cap">{st.online ? 'ONLINE' : ready.ok ? 'READY' : 'OFFLINE'}</span>
          </div>
        );
      })}
      <p class="cap">Systems are brought online from their consoles aboard the Lantern.</p>
    </Panel>
  );
}

/* --------------------------------- Map --------------------------------- */

function MapPanel() {
  useRev();
  const g = game()!;
  const loc = g.currentLocation as any;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (loc?.renderMap) setUrl(loc.renderMap());
  }, []);
  const markers: { x: number; y: number; label: string; color: string }[] = loc?.mapMarkers?.() ?? [];
  const p = g.player.position;
  const toMap = loc?.mapTransform as ((x: number, z: number) => [number, number]) | undefined;
  const [px, py] = toMap ? toMap(p.x, p.z) : [0.5, 0.5];
  return (
    <Panel title={`Map — ${LOCATION_REGISTRY[loc?.id]?.name ?? ''}`} sub="Discovered landmarks only" wide>
      {url ? (
        <div style={{ position: 'relative', width: 'min(640px, 68vh)', height: 'min(640px, 68vh)', margin: '0 auto' }}>
          <img src={url} style={{ width: '100%', height: '100%', imageRendering: 'auto', filter: 'contrast(1.1)' }} />
          {markers.map((m, i) => (
            <div key={i} style={{ position: 'absolute', left: `${m.x * 100}%`, top: `${m.y * 100}%`, transform: 'translate(-50%,-50%)', fontSize: '11px', color: m.color, textShadow: '0 1px 2px #000', whiteSpace: 'nowrap' }}>◆ {m.label}</div>
          ))}
          <div style={{ position: 'absolute', left: `${px * 100}%`, top: `${py * 100}%`, transform: `translate(-50%,-50%) rotate(${-g.player.yaw}rad)`, color: '#ffb347', fontSize: '18px' }}>▲</div>
        </div>
      ) : (
        <p class="cap">No survey map available here. Interior deck plans are shown on ship consoles.</p>
      )}
    </Panel>
  );
}

/* -------------------------------- Death -------------------------------- */

function Death() {
  const g = game()!;
  return (
    <div class="panel death">
      <h2>Vital signs lost</h2>
      <p class="sub">Your suit’s emergency beacon recalls you to the last safe point. What you carried stays where you fell — you can recover it.</p>
      <button class="btn primary interactive" onClick={() => void g.respawn()}>Recover</button>
      <button class="btn interactive" onClick={() => void g.loadSlot('quick')}>Load quicksave</button>
    </div>
  );
}

/* ------------------------------- Reader ------------------------------- */

function Reader() {
  const r = ui.reader.value;
  if (!r) return null;
  return (
    <Panel title={r.title}>
      <div class="reader">
        {r.text.split('\n\n').map((p) => <p>{p}</p>)}
      </div>
    </Panel>
  );
}

/* ------------------------------- Ending ------------------------------- */

function Ending() {
  const g = game() as Game;
  const id = ui.ending.value;
  const def = ENDINGS.find((e) => e.id === id);
  const paras = def ? endingParagraphs(def, (c) => g.store.check(c)) : [];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!def) return;
    const total = paras.length + 1;
    if (i >= total) return;
    const t = setTimeout(() => setI((x) => x + 1), i === 0 ? 5000 : 9000);
    return () => clearTimeout(t);
  }, [i, id]);
  if (!def) return null;
  const credits = i > paras.length;
  return (
    <div class="ending">
      <div class="ending-title">{def.title}</div>
      <div class="ending-sub">{def.subtitle}</div>
      {!credits && paras.slice(Math.max(0, i - 3), i).map((p, k, arr) => <p class={k === arr.length - 1 ? 'fresh' : ''}>{p}</p>)}
      {credits && (
        <div class="credits">
          {CREDITS.map(([a, b]) => <div><span>{a}</span><b>{b}</b></div>)}
        </div>
      )}
      <div class="ending-actions">
        {!credits && <button class="interactive" onClick={() => setI((x) => x + 1)}>Continue ▸</button>}
        {credits && <button class="interactive" onClick={() => g.finishEnding()}>Keep exploring</button>}
      </div>
    </div>
  );
}

/* ------------------------------- Router ------------------------------- */

export function OverlayRouter() {
  const o = ui.overlay.value;
  if (!o) return null;
  const g = game() as Game;
  const view = (() => {
    switch (o) {
      case 'pause': return <Pause />;
      case 'saves': return <Saves onBack={() => g.closeOverlay()} />;
      case 'settings': return <SettingsPanel onBack={() => g.closeOverlay()} />;
      case 'inventory': return <Inventory />;
      case 'journal': return <Journal />;
      case 'database': return <Panel title="Database" wide><Database /></Panel>;
      case 'map': return <MapPanel />;
      case 'craft': return <Craft />;
      case 'build': return <Build />;
      case 'container': return <ContainerPanel />;
      case 'shipstatus': return <ShipStatus />;
      case 'death': return <Death />;
      case 'reader': return <Reader />;
      case 'ending': return <Ending />;
      default: return null;
    }
  })();
  return <div class="overlay interactive">{view}</div>;
}
