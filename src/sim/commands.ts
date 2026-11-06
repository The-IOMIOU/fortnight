// Player commands. Every state change from outside the sim goes through a command, so a
// (seed, settings, command log) triple fully determines a match.

interface Base { tick: number; player: number; seq: number }

/** Move units to a fixed-point position (groups get formation slots; big groups use a flow field). */
export interface MoveCommand extends Base { type: 'move'; ids: number[]; x: number; y: number; formation?: 'box' | 'line' }
/** Workers gather from a resource tile (wood/stone/gold/carbon/adamite). */
export interface GatherCommand extends Base { type: 'gather'; ids: number[]; tile: number }
/** Units act on an entity: build, work, hunt, gather a carcass, drop off cargo, garrison, board a
 *  transport, or attack an enemy — the sim decides from the target. */
export interface InteractCommand extends Base { type: 'interact'; ids: number[]; target: number }
/** Place a building (workers start building it). For a settlement, `ids` must include a settler. */
export interface PlaceCommand extends Base { type: 'place'; ids: number[]; btype: number; tile: number }
/** Place a line of walls/gates/towers (one per tile, built in order). */
export interface PlaceLineCommand extends Base { type: 'placeLine'; ids: number[]; btype: number; tiles: number[] }
export interface TrainCommand extends Base { type: 'train'; building: number; utype: number }
export interface CancelTrainCommand extends Base { type: 'cancelTrain'; building: number; index: number }
export interface UpgradeCommand extends Base { type: 'upgrade'; building: number }
// ---- Phase 3 ----
export interface AttackCommand extends Base { type: 'attack'; ids: number[]; target: number }
export interface StopCommand extends Base { type: 'stop'; ids: number[] }
export interface HoldCommand extends Base { type: 'hold'; ids: number[] }
export interface RetreatCommand extends Base { type: 'retreat'; ids: number[] }
export interface PatrolCommand extends Base { type: 'patrol'; ids: number[]; x: number; y: number }
export interface RallyCommand extends Base { type: 'setRally'; building: number; tile: number }
export interface DemolishCommand extends Base { type: 'demolish'; building: number }
export interface UngarrisonCommand extends Base { type: 'ungarrison'; building: number }
/** Workers dig trenches on the listed tiles, in order. */
export interface DigCommand extends Base { type: 'dig'; ids: number[]; tiles: number[] }
/** Units set fire to a forest tile or building tile. */
export interface IgniteCommand extends Base { type: 'ignite'; ids: number[]; tile: number }
/** A transport sails next to a shore tile and lets its passengers off. */
export interface UnloadCommand extends Base { type: 'unload'; ship: number; tile: number }

// ---- Phase 5 ----
/** Start researching a shared tech node or a node of the player's race tree (paid up front, done at the capital). */
export interface ResearchCommand extends Base { type: 'research'; node: string }
export interface CancelResearchCommand extends Base { type: 'cancelResearch' }
/** Queue gear (GEAR_IDS index) at a forge. */
export interface CraftCommand extends Base { type: 'craft'; building: number; item: number }
/** Hand crafted gear to units standing near a forge, barracks or town. */
export interface EquipCommand extends Base { type: 'equip'; ids: number[]; item: number }
/** Delvers: go underground or come up. */
export interface BurrowCommand extends Base { type: 'burrow'; ids: number[]; on: boolean }
/** Wildbond: tame a wild animal with scouts or workers. */
export interface TameCommand extends Base { type: 'tame'; ids: number[]; target: number }

// ---- Phase 6 ----
export interface OfferCommand extends Base { type: 'offer'; to: number; give: import('./diplomacy').Deal; get: import('./diplomacy').Deal; treaty: import('./diplomacy').Treaty | null; counterOf?: number }
export interface RespondCommand extends Base { type: 'respond'; offer: number; accept: boolean }
export interface DeclareWarCommand extends Base { type: 'declareWar'; to: number }
/** Chat to one player (to ≥ 0) or everyone (to = −1). */
export interface ChatCommand extends Base { type: 'chat'; to: number; text: string }
/** Spies / saboteurs: steal, reveal, sabotage or poison (F-140–F-142). */
export interface CovertCommand extends Base { type: 'covert'; ids: number[]; act: import('./diplomacy').CovertAct; target: number }

/** Turn a test option (F-197) on or off for the issuing player. Never touches resources. */
export interface TestOptionCommand extends Base { type: 'testOption'; flag: number; on: boolean }

export type Command =
  | MoveCommand | GatherCommand | InteractCommand | PlaceCommand | PlaceLineCommand | TrainCommand | CancelTrainCommand | UpgradeCommand
  | AttackCommand | StopCommand | HoldCommand | RetreatCommand | PatrolCommand | RallyCommand | DemolishCommand | UngarrisonCommand
  | DigCommand | IgniteCommand | UnloadCommand | TestOptionCommand
  | ResearchCommand | CancelResearchCommand | CraftCommand | EquipCommand | BurrowCommand | TameCommand
  | OfferCommand | RespondCommand | DeclareWarCommand | ChatCommand | CovertCommand;

/** A command as sent by a client, before the sim stamps tick/player/seq. */
export type CommandBody = Command extends infer C ? (C extends Command ? Omit<C, 'tick' | 'player' | 'seq'> : never) : never;

export function compareCommands(a: Command, b: Command): number {
  return a.tick - b.tick || a.player - b.player || a.seq - b.seq;
}
