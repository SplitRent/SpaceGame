import type { Store } from '../state/Store';
import type { DialogueDef, DialogueNode } from '../content/types';
import { ui } from '../ui/uiState';

/**
 * Runs a dialogue graph. The entry node is chosen from the first passing `entries`
 * condition, so conversations always reflect current progress. Node/choice effects go
 * through the Store (grant-wrapped where once-only). Memory counts are stored per NPC.
 */
export class DialogueRunner {
  private def: DialogueDef | null = null;
  private node: DialogueNode | null = null;
  private visibleChoices: { text: string; index: number }[] = [];
  onEnd: (() => void) | null = null;
  playerName = 'Specialist';

  constructor(private store: Store) {}

  get active(): boolean {
    return !!this.def;
  }

  get npcId(): string | null {
    return this.def?.npc ?? null;
  }

  start(dialogueId: string): boolean {
    if (this.def) return false;
    const def = this.store.content.dialogues[dialogueId];
    if (!def) {
      console.warn('[Dialogue] missing', dialogueId);
      return false;
    }
    const entry = def.entries.find((e) => this.store.check(e.if));
    if (!entry) return false;
    this.def = def;
    this.goto(entry.node);
    return true;
  }

  private goto(nodeId: string | 'end'): void {
    if (!this.def) return;
    if (nodeId === 'end') return this.end();
    const node = this.def.nodes[nodeId];
    if (!node) {
      console.warn('[Dialogue] missing node', nodeId);
      return this.end();
    }
    this.node = node;
    const npc = this.store.state.npcs[this.def.npc];
    if (npc) npc.memory[nodeId] = (npc.memory[nodeId] ?? 0) + 1;
    if (node.effects) this.store.grant(`dlg:${this.def.id}:${nodeId}`, node.effects);
    this.visibleChoices = (node.choices ?? [])
      .map((c, index) => ({ c, index }))
      .filter(({ c, index }) => {
        if (c.if && !this.store.check(c.if)) return false;
        if (c.once && npc?.memory[`choice:${nodeId}:${index}`]) return false;
        return true;
      })
      .map(({ c, index }) => ({ text: this.format(c.text), index }));
    this.render();
  }

  private render(): void {
    if (!this.def || !this.node) return;
    const speakerId = this.node.speaker;
    const npcDef = this.store.content.npcs[speakerId];
    const speaker = speakerId === 'player' ? this.playerName : npcDef?.name ?? (speakerId === 'narrator' ? '' : speakerId);
    ui.dialogue.value = {
      speaker,
      speakerRole: npcDef?.role ?? '',
      text: this.format(this.node.text),
      choices: this.visibleChoices,
      canContinue: this.visibleChoices.length === 0,
    };
  }

  private format(t: string): string {
    return t.replace(/\{player\}/g, this.playerName);
  }

  choose(index: number): void {
    if (!this.def || !this.node) return;
    const choice = this.node.choices?.[index];
    if (!choice || !this.visibleChoices.some((v) => v.index === index)) return;
    const npc = this.store.state.npcs[this.def.npc];
    if (npc) npc.memory[`choice:${this.node.id}:${index}`] = (npc.memory[`choice:${this.node.id}:${index}`] ?? 0) + 1;
    if (choice.effects) this.store.grant(`dlg:${this.def.id}:${this.node.id}:c${index}`, choice.effects);
    this.goto(choice.to);
  }

  continue(): void {
    if (!this.node) return;
    if (this.visibleChoices.length) return;
    this.goto(this.node.next ?? 'end');
  }

  end(): void {
    const had = !!this.def;
    this.def = null;
    this.node = null;
    this.visibleChoices = [];
    ui.dialogue.value = null;
    this.store.markChanged('dialogueEnd');
    if (had) this.onEnd?.();
  }
}
