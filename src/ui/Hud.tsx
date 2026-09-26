import { ui } from './uiState';
import type { HudData } from './uiState';
import { game } from './gameRef';

function Vital({ label, value, max, color, unit = '%' }: { label: string; value: number; max: number; color: string; unit?: string }) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div class={`vital ${pct < 0.25 ? 'low' : ''}`}>
      <span>{label}</span>
      <div class="track">
        <div class="fill" style={{ width: `${pct * 100}%`, background: color }} />
      </div>
      <span class="val">{unit === '%' ? `${Math.round(pct * 100)}%` : `${Math.round(value)}${unit}`}</span>
    </div>
  );
}

function Compass({ yaw }: { yaw: number }) {
  // yaw 0 faces -Z ("north")
  const deg = ((-yaw * 180) / Math.PI + 360) % 360;
  const marks: { label: string; card: boolean }[] = [];
  const names: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  for (let i = -2; i < 3; i++) for (let d = 0; d < 360; d += 15) marks.push({ label: names[d] ?? '·', card: d in names });
  const px = 45 / 15;
  const offset = -((deg + 720) * px) + 180 - 22;
  return (
    <div class="compass">
      <div class="strip" style={{ left: `${offset}px` }}>
        {marks.map((m, i) => (
          <span key={i} class={m.card ? 'card' : ''}>{m.label}</span>
        ))}
      </div>
    </div>
  );
}

function FlightHud({ h }: { h: NonNullable<HudData['flight']> }) {
  return (
    <div class="flight">
      <div class="reticle" />
      <div class="left">
        <div class="cap">VELOCITY</div>
        <div class="big">{h.speed.toFixed(0)} m/s</div>
        <div class="cap">{h.mode} · ASSIST {h.assist ? 'ON' : 'OFF'} (Z)</div>
        <div class="throttle"><i style={{ height: `${h.throttle * 100}%` }} /></div>
      </div>
      <div class="right">
        {h.target && (
          <>
            <div class="cap">TARGET</div>
            <div class="big" style={{ fontSize: '20px' }}>{h.target}</div>
            <div class="cap">{h.targetDist !== null ? `${(h.targetDist / 1000).toFixed(2)} km` : ''}</div>
          </>
        )}
        {h.altitude !== null && <div class="cap">ALT {(h.altitude / 1000).toFixed(1)} km</div>}
        <div class="cap">PROPELLANT {h.propellant.toFixed(0)} kg · HULL {(h.hull * 100).toFixed(0)}%</div>
      </div>
    </div>
  );
}

export function Hud() {
  const h = ui.hud.value;
  const prompt = ui.prompt.value;
  if (!h) return null;
  const g = game();
  const work = g?.tools.workState ?? null;
  const inPanel = g?.input.context === 'panel';
  return (
    <div class="hud">
      {h.flight ? (
        <FlightHud h={h.flight} />
      ) : (
        <>
          {!inPanel && ui.crosshair.value && <div class={`crosshair ${prompt ? 'active' : ''}`} />}
          <div class="vitals">
            <div class="suit-status">
              SUIT · {h.pressurized ? <b>PRESSURIZED</b> : <b class="v">VACUUM</b>} · {Math.round(h.temperature)}°C
            </div>
            <Vital label="O₂" value={h.oxygen} max={h.oxygenMax} color="#7fd3ff" />
            <Vital label="PWR" value={h.suitPower} max={h.suitPowerMax} color="#ffc857" />
            <Vital label="HP" value={h.health} max={100} color="#ff7b7b" />
            {h.stamina < 0.98 && <Vital label="STM" value={h.stamina} max={1} color="#b7f5c5" />}
          </div>
          <Compass yaw={h.compass} />
        </>
      )}
      {h.hazard && <div class="hazard">⚠ {h.hazard}</div>}
      {h.objective && (
        <div class="objective">
          <div class="q">{h.questTitle}</div>
          <div class="o">{h.objective}</div>
        </div>
      )}
      <div class="locinfo">
        <div class="l">{h.locationName}</div>
        {h.timeOfDay && <div>{h.timeOfDay}</div>}
        <div>
          VIEW {h.view === 'first' ? '1ST' : h.view === 'back' ? '3RD' : 'FRONT'} (V)
        </div>
      </div>
      {prompt && (
        <div class="prompt">
          <span class="key">{prompt.key}</span>
          <span>{prompt.text}</span>
          {prompt.detail && <span class="detail2">{prompt.detail}</span>}
        </div>
      )}
      {h.scan && (
        <div class="scanbox">
          <svg class="scanring" viewBox="0 0 60 60" style={{ position: 'fixed', left: '50%', top: '50%' }}>
            <circle cx="30" cy="30" r="26" stroke="rgba(143,227,255,0.25)" stroke-width="3" fill="none" />
            <circle cx="30" cy="30" r="26" stroke="#8fe3ff" stroke-width="3" fill="none" stroke-dasharray={`${h.scan.progress * 163} 163`} transform="rotate(-90 30 30)" />
          </svg>
          <div>{h.scan.result ?? h.scan.label}</div>
        </div>
      )}
      {work && (
        <div class="workbar">
          <div>{work.label}</div>
          <div class="bar"><i style={{ width: `${work.progress * 100}%` }} /></div>
          {work.detail && <div class="cap">{work.detail}</div>}
        </div>
      )}
    </div>
  );
}
