// Player commands. Every state change from outside the sim goes through a command, so a
// (seed, settings, command log) triple fully determines a match.

export interface MoveCommand {
  type: 'move';
  tick: number;   // tick on which the command executes
  player: number;
  seq: number;    // per-player sequence number (tie-break, deterministic order)
  ids: number[];  // entity slots
  x: number;      // target, fixed-point
  y: number;
}
export type Command = MoveCommand;

export function compareCommands(a: Command, b: Command): number {
  return a.tick - b.tick || a.player - b.player || a.seq - b.seq;
}
