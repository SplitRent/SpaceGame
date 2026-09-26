import type { Game } from '../Game';

let instance: Game | null = null;

export function setGame(g: Game): void {
  instance = g;
}

export function game(): Game | null {
  return instance;
}
