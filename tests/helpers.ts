import { Store } from '../src/state/Store';
import { CONTENT } from '../src/content';
import { createNewGameState } from '../src/state/newGame';
import { QuestSystem } from '../src/gameplay/quests';
import { Scope } from '../src/engine/Scope';

export function makeStore(): { store: Store; quests: QuestSystem; scope: Scope } {
  const store = new Store(createNewGameState(CONTENT, 'Tester', 1), CONTENT);
  const scope = new Scope('test');
  const quests = new QuestSystem(store);
  quests.attach(scope);
  return { store, quests, scope };
}
