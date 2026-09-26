import { useEffect, useState } from 'preact/hooks';
import { ui } from './uiState';
import { game } from './gameRef';
import { Hud } from './Hud';
import { OverlayRouter, Saves, SettingsPanel } from './Overlays';
import type { SaveSummary } from '../save/SaveManager';
import { GAME_VERSION } from '../save/SaveManager';

function Title() {
  const g = game();
  const [latest, setLatest] = useState<SaveSummary | null>(null);
  const [mode, setMode] = useState<'menu' | 'new' | 'load' | 'settings' | 'about'>('menu');
  const [name, setName] = useState('Sam Reyes');
  useEffect(() => {
    void g?.saves.latest().then(setLatest);
  }, [mode]);
  if (!g) return null;
  const start = () => {
    g.audio.unlock();
    void g.newGame(name);
  };
  return (
    <div class="title-screen interactive">
      {mode === 'menu' && (
        <>
          <h1 class="logo">LANT<span>E</span>RN</h1>
          <div class="tagline">A voyage from the known into the unknown</div>
          <div class="menu">
            <button disabled={!latest} onClick={() => { g.audio.unlock(); void g.loadSlot(latest!.slot); }}>
              Continue {latest && <span class="cap" style={{ textTransform: 'none', letterSpacing: 0 }}>· {latest.meta.location}</span>}
            </button>
            <button onClick={() => setMode('new')}>New expedition</button>
            <button onClick={() => setMode('load')}>Load</button>
            <button onClick={() => setMode('settings')}>Settings</button>
            <button onClick={() => setMode('about')}>About</button>
          </div>
        </>
      )}
      {mode === 'new' && (
        <div class="panel" style={{ maxWidth: '520px' }}>
          <h2>New expedition</h2>
          <div class="sub">You are the expedition’s EVA &amp; Systems Specialist aboard the EXV Lantern.</div>
          <div class="row">
            <span>Name</span>
            <input type="text" value={name} maxLength={24} onInput={(e) => setName((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && start()} />
          </div>
          <p class="cap">The crew will address you by this name. The opening sequence can be skipped with Space.</p>
          <div class="row">
            <button class="btn primary" onClick={start}>Begin</button>
            <button class="btn" onClick={() => setMode('menu')}>Back</button>
          </div>
        </div>
      )}
      {mode === 'load' && <Saves loadOnly onBack={() => setMode('menu')} />}
      {mode === 'settings' && <SettingsPanel onBack={() => setMode('menu')} />}
      {mode === 'about' && (
        <div class="panel" style={{ maxWidth: '620px' }}>
          <button class="close-x" onClick={() => setMode('menu')}>×</button>
          <h2>About</h2>
          <p>LANTERN is an original science-inspired exploration game. It begins in our real Solar System — every world is based on what scientists currently know — and grows outward into the unknown.</p>
          <p class="cap">Earth coastlines: Natural Earth (public domain). All other art, audio and code are generated for this project.</p>
          <button class="btn" onClick={() => setMode('menu')}>Back</button>
        </div>
      )}
      <div class="version">v{GAME_VERSION} · early development build</div>
    </div>
  );
}

function Dialogue() {
  const d = ui.dialogue.value;
  const g = game();
  if (!d || !g) return null;
  return (
    <div class="dialogue">
      <div>
        <span class="who">{d.speaker}</span>
        {d.speakerRole && <span class="role">{d.speakerRole}</span>}
      </div>
      <div class="line">{d.text}</div>
      {d.choices.map((c, i) => (
        <button key={c.index} class="choice" onClick={() => g.dialogue.choose(c.index)}>
          {i + 1}. {c.text}
        </button>
      ))}
      {d.canContinue && (
        <div class="cont">
          <button class="btn small" onClick={() => g.dialogue.continue()}>Continue ▸</button>
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const now = performance.now();
  const list = ui.notifications.value.filter((n) => now - n.at < 6000);
  return (
    <div class="notifications">
      {list.map((n) => (
        <div key={n.id} class={`note ${n.kind}`}>{n.text}</div>
      ))}
    </div>
  );
}

export function App() {
  const screen = ui.screen.value;
  const fade = ui.fade.value;
  // Number keys for dialogue choices
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = ui.dialogue.value;
      const g = game();
      if (!d || !g) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= d.choices.length) g.dialogue.choose(d.choices[n - 1].index);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      {screen === 'title' && <Title />}
      {screen === 'boot' && <div class="loading">{ui.bootError.value ?? 'Initializing…'}</div>}
      {screen === 'game' && (
        <>
          {!ui.letterbox.value && !ui.loading.value && <Hud />}
          {ui.title.value && (
            <div class="titlecard">
              <div class="a">{ui.title.value.text}</div>
              <div class="b">{ui.title.value.sub}</div>
            </div>
          )}
          {ui.hint.value && <div class="hint">{ui.hint.value}</div>}
          {ui.panelHelp.value && <div class="panelhelp">{ui.panelHelp.value}</div>}
          <Dialogue />
          <OverlayRouter />
        </>
      )}
      {ui.letterbox.value && <div class="letterbox fade" />}
      {ui.subtitle.value && (
        <div class="subtitle">
          {ui.subtitle.value.speaker && <b>{ui.subtitle.value.speaker}</b>}
          {ui.subtitle.value.text}
        </div>
      )}
      <Notifications />
      <div class="fade" style={{ background: ui.fadeColor.value, opacity: fade }} />
      {ui.loading.value && <div class="loading">{ui.loading.value}</div>}
      {ui.debug.value && <div class="debug">{ui.debugText.value}</div>}
    </>
  );
}
