import { render, h } from 'preact';
import './ui/styles.css';
import { Game } from './Game';
import { App } from './ui/App';
import { setGame } from './ui/gameRef';
import { ui } from './ui/uiState';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game();
const q = new URLSearchParams(location.search).get('quality');
if (q === 'low' || q === 'medium' || q === 'high') game.settings.quality = q;
setGame(game);
(window as any).__ui = ui;
render(h(App, {}), document.getElementById('ui')!);

game.boot(canvas).then(async () => {
  // Dev convenience: ?start=moon jumps straight into a post-crash state for testing.
  const params = new URLSearchParams(location.search);
  const start = params.get('start');
  if (start && import.meta.env.DEV) {
    const { devScenario } = await import('./debug/scenarios');
    await devScenario(game, start);
  }
}).catch((err) => {
  console.error(err);
  ui.bootError.value = `Failed to start: ${(err as Error).message}. Your browser may not support WebGL2/WebAssembly.`;
});
