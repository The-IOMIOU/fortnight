// Player commands. Every state change from outside the sim goes through a command, so a
// (seed, settings, command log) triple fully determines a match.

interface Base { tick: number; player: number; seq: number }

/** Move units to a fixed-point position. */
export interface MoveCommand extends Base { type: 'move'; ids: number[]; x: number; y: number }
/** Workers gather from a resource tile (wood/stone/gold/carbon/adamite). */
export interface GatherCommand extends Base { type: 'gather'; ids: number[]; tile: number }
/** Units act on an entity: build/repair a construction site, work a farm or fishing hut, hunt an animal,
 *  gather a carcass, or drop off cargo — the sim decides from the target's state. */
export interface InteractCommand extends Base { type: 'interact'; ids: number[]; target: number }
/** Place a building (workers start building it). For a settlement, `ids` must include a settler. */
export interface PlaceCommand extends Base { type: 'place'; ids: number[]; btype: number; tile: number }
export interface TrainCommand extends Base { type: 'train'; building: number; utype: number }
export interface CancelTrainCommand extends Base { type: 'cancelTrain'; building: number; index: number }
export interface UpgradeCommand extends Base { type: 'upgrade'; building: number }

export type Command = MoveCommand | GatherCommand | InteractCommand | PlaceCommand | TrainCommand | CancelTrainCommand | UpgradeCommand;

/** A command as sent by a client, before the sim stamps tick/player/seq. */
export type CommandBody = Command extends infer C ? (C extends Command ? Omit<C, 'tick' | 'player' | 'seq'> : never) : never;

export function compareCommands(a: Command, b: Command): number {
  return a.tick - b.tick || a.player - b.player || a.seq - b.seq;
}
