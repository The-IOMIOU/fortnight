// Display names, help texts and default hotkeys. Hotkeys are rebindable (F-174) via src/app/keymap.ts.
import type { BuildingTypeName, UnitTypeName } from '../sim/defs';

export const BUILDING_NAMES: Record<BuildingTypeName, string> = {
  capital: 'Capital', settlement: 'Settlement', house: 'House', farm: 'Farm', lumberCamp: 'Lumber camp',
  mineCamp: 'Mine camp', fishingHut: 'Fishing hut', storehouse: 'Storehouse', outpost: 'Outpost',
  barracks: 'Barracks', workshop: 'Siege workshop', dock: 'Dock', wall: 'Wall', gate: 'Gate', tower: 'Tower',
  forge: 'Forge', pier: 'Pier', tidepool: 'Tidepool', beastPen: 'Beast pen', tunnelHall: 'Tunnel hall', sporeTower: 'Spore tower',
  aerie: 'Aerie', greatForge: 'Great forge', stiltHall: 'Stilt hall', iceLodge: 'Ice lodge',
  caravanserai: 'Caravanserai', library: 'Great library', grove: 'Sacred grove', reefDock: 'Reef dock',
};
export const BUILDING_HELP: Record<BuildingTypeName, string> = {
  capital: 'Seat of your people. Trains workers, settlers and scouts. Accepts all resources. Garrison soldiers to shoot arrows. Lose it and you are open to conquest.',
  settlement: 'A new town founded by a settler. Claims land, houses people, accepts all resources.',
  house: 'Housing for more people.',
  farm: 'Up to 2 workers grow food. Yield depends on the ground (plains best, desert poor).',
  lumberCamp: 'Drop-off point for wood.',
  mineCamp: 'Drop-off point for stone, gold, carbon and adamite.',
  fishingHut: 'Up to 3 workers fish. Must be next to water; more water nearby means more fish.',
  storehouse: 'Drop-off point for every resource.',
  outpost: 'Claims nearby land and gives vision. Can be built just outside your borders.',
  barracks: 'Trains spearmen, archers, riders, spies and saboteurs.',
  workshop: 'Builds battering rams for breaking walls and buildings.',
  dock: 'Builds warships and transports. Must touch the sea or a lake.',
  wall: 'Blocks every unit. Drag to build a line. Archers next to your walls take less damage.',
  gate: 'A wall your own units can walk through; enemies cannot.',
  tower: 'Shoots at enemies in range. Garrison up to 4 soldiers for extra arrows.',
  forge: 'Crafts alloy, tools, weapons and armour from your stock. Soldiers near a forge can be equipped. Needs Smithing.',
  pier: 'A wooden deck built on water. Land units can stand on it. Needs Piers.',
  tidepool: 'Deepkin: trains tideguards and, at the end of the tree, leviathans. Must touch water.',
  beastPen: 'Wildbond: trains war beasts, revived beasts and thunder lizards.',
  tunnelHall: 'Delvers: trains burrowers and the great drill.',
  sporeTower: 'Mycelids: spreads fungus around it faster; trains sporelings and bloom hulks.',
  aerie: 'Windriders: trains gliders and sky lancers.',
  greatForge: 'Anvilborn: trains ironguards and steam golems.',
  stiltHall: 'Fenfolk: trains bog stalkers and mire horrors.',
  iceLodge: 'Rimeborn: trains frost wardens and mammoths. Up to 3 workers fish through ice (best next to sea ice).',
  caravanserai: 'Dune raiders: trains dune riders and the sand wyrm.', library: 'Scholars: trains arcanists and colossi.',
  grove: 'Treewardens: trains grovewardens and treants.', reefDock: 'Reefbuilders: trains reefguards and krakens. Must touch the sea.',
};
export const UNIT_NAMES: Record<UnitTypeName, string> = {
  scout: 'Scout', worker: 'Worker', settler: 'Settler', spearman: 'Spearman', archer: 'Archer', rider: 'Rider',
  ram: 'Battering ram', spy: 'Spy', saboteur: 'Saboteur', warship: 'Warship', transport: 'Transport',
  beast: 'Beast', warbeast: 'War beast', thunderlizard: 'Thunder lizard', tideguard: 'Tideguard', leviathan: 'Leviathan',
  burrower: 'Burrower', deepDrill: 'Great drill', sporeling: 'Sporeling', bloomHulk: 'Bloom hulk', glider: 'Glider', skyLancer: 'Sky lancer',
  ironguard: 'Ironguard', steamGolem: 'Steam golem', bogStalker: 'Bog stalker', mireHorror: 'Mire horror', frostWarden: 'Frost warden', mammoth: 'Mammoth',
  duneRider: 'Dune rider', sandWyrm: 'Sand wyrm', arcanist: 'Arcanist', colossus: 'Colossus', grovewarden: 'Grovewarden', treant: 'Treant', reefguard: 'Reefguard', kraken: 'Kraken',
};
export const UNIT_HELP: Record<UnitTypeName, string> = {
  scout: 'Fast explorer.', worker: 'Gathers, builds, digs trenches.', settler: 'Founds a new settlement.',
  spearman: 'Sturdy melee infantry.', archer: 'Ranged. Strong from high ground and behind walls.', rider: 'Fast heavy cavalry.',
  ram: 'Crushes walls and buildings; nearly harmless to soldiers.', spy: 'Hidden unless enemies are within 2 tiles. Sees far.',
  saboteur: 'Hidden; wrecks buildings.', warship: 'Sails and shoots ships and coasts.', transport: 'Carries up to 8 housing worth of land units across water.',
  beast: 'A tamed or revived wild animal that fights for you.', warbeast: 'Trained war beast: fast and strong.', thunderlizard: 'A giant reptile of old, woken by long study.',
  tideguard: 'Amphibious infantry.', leviathan: 'Huge deep-sea beast that also walks on land.', burrower: 'Tough infantry that tunnels well.',
  deepDrill: 'Siege drill that tears down walls and buildings.', sporeling: 'Cheap, fragile fungal fighter.', bloomHulk: 'Massive fungal brute.',
  glider: 'Glides straight over walls, water and mountains; must rest after each flight.', skyLancer: 'Heavy glider lancer.',
  ironguard: 'Heavily armoured infantry.', steamGolem: 'Walking iron siege engine.', bogStalker: 'Swift marsh skirmisher.',
  mireHorror: 'Bog monster.', frostWarden: 'Hardy northern infantry.', mammoth: 'Woolly giant that tramples armies and gates.',
  duneRider: 'Fast desert raider.', sandWyrm: 'Burrowing giant of the dunes.', arcanist: 'Ranged scholar-soldier.', colossus: 'Clockwork giant.',
  grovewarden: 'Forest archer.', treant: 'Walking ancient tree; burns easily.', reefguard: 'Coastal infantry.', kraken: 'Sea monster that crushes ships and coasts.',
};
export const RES_LABELS = ['Food', 'Wood', 'Stone', 'Gold', 'Carbon', 'Adamite'];
export const RES_COLORS = ['#e8705f', '#b98a55', '#a9adb3', '#f2c844', '#585d66', '#8fd9e6'];
