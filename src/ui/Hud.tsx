// In-game HUD: top bar (resources, speed), selection panel with build/train/upgrade, continent stats,
// notification feed, settings, game-over overlay.
import { useState } from 'preact/hooks';
import { availableSpeeds, type Game } from '../app/game';
import { store, useStore, type GameState } from '../app/store';
import { applyUiScale, saveSettings, type Quality } from '../app/settings';
import { setVolume } from '../audio/sfx';
import { TUNING, type SpeedName } from '../sim/core/tuning';
import { TestOptionList } from './testOptions';
import { NUM_RES, TASK_NAMES, TRAINS, UNIT_TYPES, buildingDef, unitDef, upgradeDef, type BuildingTypeName, type UnitTypeName } from '../sim/defs';
import { playerLabel, playerSwatchCss } from '../render/palette';
import { BUILDING_HELP, BUILDING_NAMES, RES_COLORS, RES_LABELS, UNIT_HELP, UNIT_NAMES } from './names';
import { DEFAULT_KEYS, keyFor, keyLabel, resetKeys, setKey } from '../app/keymap';
import { ForgePanel, TechButton, TechPanel, UnitRaceBar, buildingAllowed, unitAllowed } from './RacePanels';
import { CovertBar, DiploButton, DiploPanel } from './DiploPanel';
import { NetButton, NetNotices, NetPanel, VoteBanner } from './NetPanels';
import { TutorialPanel } from './Tutorial';
import { raceById } from '../sim/races';

const SPEED_LABEL: Record<SpeedName, string> = { slow: '0.5×', normal: '1×', fast: '2×', veryFast: '4×', x8: '8×', x16: '16×' };
const BUILDABLE_LIST: BuildingTypeName[] = ['house', 'farm', 'lumberCamp', 'mineCamp', 'fishingHut', 'storehouse', 'outpost', 'barracks', 'workshop', 'dock'];
const DEFENCE_LIST: BuildingTypeName[] = ['wall', 'gate', 'tower'];
const K = (id: string): string => keyLabel(keyFor(id));

export function fmtTime(tick: number): string {
  const s = Math.floor(tick / TUNING.sim.tickHz);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

function Cost({ c }: { c: Partial<Record<string, number>> }) {
  const parts = Object.entries(c).filter(([, v]) => v);
  return <span class="cost">{parts.map(([k, v]) => <span key={k}><i class="dot" style={{ background: RES_COLORS[['food', 'wood', 'stone', 'gold', 'carbon', 'adamite'].indexOf(k)] }} />{v}</span>)}</span>;
}

export function Hud({ game, onQuit, onSave, onRehost }: { game: Game; onQuit: () => void; onSave: () => void; onRehost?: () => void }) {
  return (
    <>
      <TopBar game={game} onQuit={onQuit} onSave={onSave} />
      <PerfHud />
      <Feed />
      <SelectionPanel game={game} />
      <TechPanel game={game} />
      <DiploPanel game={game} />
      <NetPanel game={game} />
      <VoteBanner game={game} />
      <TutorialPanel />
      <NetNotices onSave={onSave} onRehost={() => onRehost?.()} />
      <StatsPanel />
      <SettingsModal />
      <BoxRect />
      <GameOver onQuit={onQuit} />
      <KeysModal />
      <BotOverlay />
      <Spectating />
      <Toast />
      <Help />
    </>
  );
}

function Help() {
  const selected = useStore((st) => st.selected);
  if (selected > 0) return null;
  return <div class="help">Left: select / box-select · Right: order (attack, gather, garrison, board, rally) · Drag (middle/right) or WASD: pan · Wheel: zoom · Space: pause · +/−: speed · Tab: stats · Ctrl+1–9: groups</div>;
}

function TopBar({ game, onQuit, onSave }: { game: Game; onQuit: () => void; onSave: () => void }) {
  const bonusOn = useStore((st) => st.impossibleBonusOn);
  const modified = useStore((st) => st.modified);
  const opts = useStore((st) => st.opts);
  const s = useStore((st) => ({ tick: st.tick, paused: st.paused, speed: st.speed, isNight: st.isNight, pending: st.pendingOrders, stats: st.stats, seed: st.seed, size: st.size, owners: st.ownerOverlay }));
  const st = s.stats;
  return (
    <div class="topbar">
      <div class="speed" role="group" aria-label="Game speed">
        <button class={s.paused ? 'on' : ''} onClick={() => game.setPaused(!s.paused)} data-testid="pause" title="Pause (Space)">{s.paused ? '▶' : '❚❚'}</button>
        {availableSpeeds(opts).map((n) => (
          <button class={!s.paused && s.speed === n ? 'on' : s.speed === n ? 'sel' : ''} onClick={() => { game.setSpeed(n); if (s.paused) game.setPaused(false); }} data-testid={'speed-' + n}>{SPEED_LABEL[n]}</button>
        ))}
      </div>
      <div class="clock" data-testid="clock">{fmtTime(s.tick)} <span title={s.isNight ? 'Night' : 'Day'}>{s.isNight ? '☾' : '☀'}</span></div>
      {st && (
        <div class="resources" data-testid="resbar">
          {RES_LABELS.map((label, i) => (
            <span class="res" title={`${label}: ${st.stock[i]} (${signed(st.incomePerMin[i])}/min gathered)`} data-testid={'res-' + i}>
              <i class="dot" style={{ background: RES_COLORS[i] }} />{st.stock[i]}<small>{signed(i === 0 ? st.foodBalancePerMin : st.incomePerMin[i])}</small>
            </span>
          ))}
          <span class={'res' + (st.pop >= st.housing ? ' warn' : '')} title="Population / housing" data-testid="pop">👥 {st.pop}/{st.housing}</span>
          {st.starving && <span class="res warn" data-testid="starving">Starving</span>}
        </div>
      )}
      {s.paused && <div class="paused-tag">PAUSED{s.pending > 0 ? ` · ${s.pending} order${s.pending > 1 ? 's' : ''} queued` : ''}</div>}
      <div class="spacer" />
      {modified && <span class="res warn" title="Test options were used in this run" data-testid="modified-badge">Modified run</span>}
      {bonusOn && <span class="res warn" title="Impossible bots receive extra income" data-testid="bonus-badge">Impossible bonus +{TUNING.bots.impossibleIncomeBonusPct} %</span>}
      <TechButton />
      <DiploButton />
      <NetButton />
      <button onClick={() => store.set({ showBots: !store.state.showBots })} data-testid="bots-btn" title="Bot goals (F4)">Bots</button>
      <button onClick={() => store.set({ showStats: !store.state.showStats })} data-testid="stats-btn" title="Continent stats (Tab)">Stats</button>
      <button onClick={onSave} data-testid="save" title="Download a save file">Save</button>
      <button onClick={() => store.set({ settingsOpen: true })} data-testid="settings-btn">⚙</button>
      <button onClick={() => game.setOwnerOverlay(!s.owners)} title="Ownership overlay (O)">{s.owners ? 'Owners: on' : 'Owners: off'}</button>
      <button onClick={onQuit}>Menu</button>
    </div>
  );
}

function PerfHud() {
  const s = useStore((st) => ({ show: st.showPerf, perf: st.perf, tick: st.tick, hash: st.mapHash }));
  if (!s.show) return null;
  return (
    <div class="perf" data-testid="perf">
      <div>FPS {s.perf.fps.toFixed(0)} · p95 {s.perf.p95Ms.toFixed(1)} ms</div>
      <div>sim {s.perf.simMs.toFixed(2)} ms/tick · {s.perf.tps.toFixed(1)} ticks/s</div>
      <div>draws {s.perf.drawCalls} · tris {(s.perf.triangles / 1000).toFixed(0)}k · ents {s.perf.entities}</div>
      <div>tick {s.tick} · map {s.hash}</div>
    </div>
  );
}

function Feed() {
  const feed = useStore((st) => st.feed);
  return (
    <div class="feed" aria-live="polite" data-testid="feed">
      {feed.map((f) => <div key={f.id} class={'note ' + f.kind}>{f.text}</div>)}
    </div>
  );
}

function SelectionPanel({ game }: { game: Game }) {
  const sel = useStore((st) => st.selection);
  const placing = useStore((st) => st.placing);
  useStore((st) => st.stats); // re-render when stock changes (affordability)
  const me = useStore((st) => st.me);
  const extra: BuildingTypeName[] = me ? (['forge', 'pier', raceById(me.race).unique_building].filter(Boolean) as BuildingTypeName[]).filter((bt) => buildingAllowed(me.race, me.researched, bt)) : [];
  const units = Object.entries(sel.units);
  if (!units.length && !sel.building) return null;
  const b = sel.building;
  return (
    <div class="selpanel" data-testid="selpanel">
      {units.length > 0 && (
        <div class="sel-units">
          <div class="sel-title">{units.map(([t, n]) => `${n} × ${UNIT_NAMES[t as UnitTypeName]}`).join(', ')}</div>
          {sel.unit && <div class="sel-sub" data-testid="unit-info">{TASK_NAMES[sel.unit.task]} · health {Math.round(sel.unit.hp / 10)} %{sel.unit.carryAmt > 0 ? ` · carrying ${sel.unit.carryAmt} ${RES_LABELS[sel.unit.carryType].toLowerCase()}` : ''} · {UNIT_HELP[sel.unit.type as UnitTypeName]}</div>}
          {(sel.units.worker ?? 0) > 0 && (
            <div class="buildmenu" data-testid="buildmenu">
              {[...BUILDABLE_LIST, ...extra].map((bt) => {
                const d = buildingDef(bt), cost = { wood: d.wood, stone: d.stone };
                return (
                  <button class={placing === bt ? 'on' : ''} disabled={!game.canAfford(cost)} title={`${BUILDING_HELP[bt]} [${K('build.' + bt)}]`} onClick={() => game.startPlacement(bt)} data-testid={'build-' + bt}>
                    <b>{BUILDING_NAMES[bt]}</b> <kbd>{K('build.' + bt)}</kbd><Cost c={cost} />
                  </button>
                );
              })}
            </div>
          )}
          {(sel.units.worker ?? 0) > 0 && (
            <div class="buildmenu" data-testid="defencemenu">
              {DEFENCE_LIST.map((bt) => {
                const d = buildingDef(bt), cost = { wood: d.wood, stone: d.stone };
                return (
                  <button class={placing === bt ? 'on' : ''} disabled={!game.canAfford(cost)} title={`${BUILDING_HELP[bt]} Click the start, then the end of the line. [${K('build.' + bt)}]`} onClick={() => game.startPlacement(bt)} data-testid={'build-' + bt}>
                    <b>{BUILDING_NAMES[bt]}{bt !== 'tower' ? ' line' : 's'}</b> <kbd>{K('build.' + bt)}</kbd><Cost c={cost} />
                  </button>
                );
              })}
              <button class={placing === 'dig' ? 'on' : ''} onClick={() => game.startPlacement('dig')} title={`Dig a trench line. Trenches touching water flood into moats. [${K('dig')}]`} data-testid="build-dig">
                <b>Dig trench</b> <kbd>{K('dig')}</kbd>
              </button>
            </div>
          )}
          {(sel.units.settler ?? 0) > 0 && (
            <div class="buildmenu">
              <button class={placing === 'settlement' ? 'on' : ''} onClick={() => game.startPlacement('settlement')} title={BUILDING_HELP.settlement} data-testid="build-settlement">
                <b>Found settlement</b> <kbd>{K('build.settlement')}</kbd>
              </button>
            </div>
          )}
          <MilitaryBar game={game} />
          <UnitRaceBar game={game} />
          {((sel.units.spy ?? 0) > 0 || (sel.units.saboteur ?? 0) > 0) && <CovertBar />}
          {placing && <div class="sel-sub">{placing === 'patrol' ? 'Click the far end of the patrol route' : placing === 'ignite' ? 'Click a forest or building tile to set it on fire' : DEFENCE_LIST.includes(placing as BuildingTypeName) || placing === 'dig' ? 'Click the start, then the end of the line (Shift to keep drawing). Right-click or Esc cancels.' : `Placing ${BUILDING_NAMES[placing as BuildingTypeName]}: left-click to place (Shift for several), right-click or Esc to cancel`}</div>}
        </div>
      )}
      {b && <BuildingPanel game={game} b={b} />}
    </div>
  );
}

function BuildingPanel({ game, b }: { game: Game; b: NonNullable<GameState['selection']['building']> }) {
  const bt = b.btype as BuildingTypeName;
  const own = b.owner === game.viewer;
  const info = b.info;
  const d = buildingDef(bt);
  const next = upgradeDef(bt, b.level + 1);
  const me = useStore((st) => st.me);
  const trains = (TRAINS[bt] ?? []).filter((u) => !me || unitAllowed(me.race, me.researched, u));
  return (
    <div class="sel-building" data-testid="building-panel">
      <div class="sel-title">{BUILDING_NAMES[bt]} {b.complete ? <small>level {b.level}</small> : <small>under construction {Math.floor(b.progressPermille / 10)} %</small>}</div>
      <div class="sel-sub">{BUILDING_HELP[bt]}</div>
      <div class="sel-sub" data-testid="building-hp">Health {Math.round(b.hp / 10)} %{d.garrison > 0 ? ` · garrison ${b.garrison}/${d.garrison}` : ''}{own && (TRAINS[bt] ?? []).length > 0 ? ' · right-click the map to set a rally point' : ''}</div>
      {own && b.complete && d.maxWorkers && info && <div class="sel-sub" data-testid="workers">Workers {info.workers}/{d.maxWorkers}</div>}
      {own && b.complete && bt === 'forge' && <ForgePanel game={game} building={b.id} />}
      {own && b.complete && trains.length > 0 && (
        <div class="buildmenu">
          {trains.map((u) => {
            const ud = unitDef(u), cost = { food: ud.food, wood: ud.wood, gold: ud.gold };
            return (
              <button disabled={!game.canAfford(cost) || (info?.queue.length ?? 0) >= TUNING.economy.trainQueueMax} onClick={() => game.train(b.id, UNIT_TYPES.indexOf(u))} data-testid={'train-' + u} title={`${UNIT_NAMES[u]}: ${UNIT_HELP[u]} [${K('train.' + u)}]`}>
                <b>{UNIT_NAMES[u]}</b> <kbd>{K('train.' + u)}</kbd><Cost c={cost} />
              </button>
            );
          })}
        </div>
      )}
      {own && info && info.queue.length > 0 && (
        <div class="queue" data-testid="queue">
          {info.queue.map((q, i) => (
            <button class="qitem" title="Click to cancel (refund)" onClick={() => game.cancelTrain(b.id, i)}>
              {bt === 'forge' ? 'Gear' : UNIT_NAMES[UNIT_TYPES[q]]}{i === 0 && <span class="bar"><span style={{ width: `${info.trainPermille / 10}%` }} /></span>}
            </button>
          ))}
        </div>
      )}
      {own && b.complete && next && (
        info?.upTo ? <div class="sel-sub">Upgrading to level {info.upTo}: {Math.floor(info.upPermille / 10)} %</div> : (
          <button disabled={!game.canAfford({ wood: next.wood, stone: next.stone, gold: next.gold })} onClick={() => game.upgrade(b.id)} data-testid="upgrade" title={`[${K('upgrade')}]`}>
            Upgrade to level {b.level + 1} <kbd>{K('upgrade')}</kbd> <Cost c={{ wood: next.wood, stone: next.stone, gold: next.gold }} />
          </button>
        )
      )}
      {own && b.complete && (
        <div class="buildmenu">
          {d.garrison > 0 && b.garrison > 0 && <button onClick={() => game.ungarrison(b.id)} data-testid="ungarrison">Release garrison <kbd>{K('ungarrison')}</kbd></button>}
          {bt !== 'capital' && <button onClick={() => game.demolish(b.id)} data-testid="demolish">Demolish <kbd>{K('demolish')}</kbd></button>}
        </div>
      )}
    </div>
  );
}

/** Orders for selected soldiers (and any units). */
function MilitaryBar({ game }: { game: Game }) {
  const formation = useStore((st) => st.formation);
  const placing = useStore((st) => st.placing);
  return (
    <div class="buildmenu" data-testid="orders">
      <button onClick={() => game.order('stop')} data-testid="order-stop">Stop <kbd>{K('stop')}</kbd></button>
      <button onClick={() => game.order('hold')} data-testid="order-hold">Hold <kbd>{K('hold')}</kbd></button>
      <button onClick={() => game.order('retreat')} data-testid="order-retreat">Retreat <kbd>{K('retreat')}</kbd></button>
      <button class={placing === 'patrol' ? 'on' : ''} onClick={() => game.startPlacement('patrol')} data-testid="order-patrol">Patrol <kbd>{K('patrol')}</kbd></button>
      <button onClick={() => game.toggleFormation()} data-testid="order-formation" title="Formation used by the next move order">Formation: {formation} <kbd>{K('formation')}</kbd></button>
      <button class={placing === 'ignite' ? 'on' : ''} onClick={() => game.startPlacement('ignite')} data-testid="order-ignite">Set fire <kbd>{K('ignite')}</kbd></button>
    </div>
  );
}

function StatsPanel() {
  const s = useStore((st) => ({ show: st.showStats, stats: st.stats }));
  if (!s.show || !s.stats) return null;
  const st = s.stats;
  const pct = (pm: number): string => `${(pm / 10).toFixed(1)} %`;
  return (
    <div class="stats panel-float" data-testid="stats-panel" role="dialog" aria-label="Continent stats">
      <div class="stats-head"><b>Continent stats</b><small>tick {st.tick}</small><button onClick={() => store.set({ showStats: false })} aria-label="Close">✕</button></div>
      <table>
        <tbody>
          <tr><th>Land owned</th><td data-testid="st-land">{st.landOwned} / {st.landTotal} ({pct(st.landPermille)})</td></tr>
          {st.continents.map((c) => <tr><th>· Continent {c.index + 1}</th><td data-testid={'st-cont-' + c.index}>{c.owned} / {c.total}</td></tr>)}
          <tr><th>Population</th><td data-testid="st-pop">{st.pop} / {st.housing}</td></tr>
          <tr><th>Food</th><td data-testid="st-food">+{st.foodIncomePerMin} − {st.foodUpkeepPerMin} = {signed(st.foodBalancePerMin)} /min{st.starving ? ' (starving)' : ''}</td></tr>
          <tr><th>Army strength</th><td data-testid="st-army">{st.army}</td></tr>
          <tr><th>Units</th><td data-testid="st-units">{Object.entries(st.units).map(([k, v]) => `${v} ${UNIT_NAMES[k as UnitTypeName].toLowerCase()}`).join(', ')}</td></tr>
          <tr><th>Buildings</th><td data-testid="st-buildings">{st.buildings}</td></tr>
          <tr><th>Domination</th><td>{st.landPermille >= TUNING.economy.dominationPct * 10 ? `holding ${fmtTime(st.dominationTicks)} / ${fmtTime(TUNING.economy.dominationHoldTicks)}` : `need ${TUNING.economy.dominationPct} % of land`}</td></tr>
        </tbody>
      </table>
      <table class="restable">
        <thead><tr><th>Resource</th><th>Stock</th><th>Gathered /min</th><th>Deposits found</th></tr></thead>
        <tbody>
          {Array.from({ length: NUM_RES }, (_, i) => (
            <tr><th><i class="dot" style={{ background: RES_COLORS[i] }} />{RES_LABELS[i]}</th><td data-testid={'st-stock-' + i}>{st.stock[i]}</td><td data-testid={'st-income-' + i}>{st.incomePerMin[i]}</td><td data-testid={'st-found-' + i}>{i === 0 ? '—' : st.depositsFound[i]}</td></tr>
          ))}
        </tbody>
      </table>
      <table class="restable">
        <thead><tr><th>Player</th><th>Land</th><th>Pop</th><th>Towns</th></tr></thead>
        <tbody>
          {st.census.map((c) => (
            <tr class={c.player === st.player ? 'me' : ''}><th><i class="swatch" style={{ background: playerSwatchCss(c.player) }} />{playerLabel(c.player)}{c.player === st.player ? ' (you)' : ''}</th><td data-testid={'st-census-land-' + c.player}>{pct(c.landPermille)}</td><td>{c.pop}</td><td>{c.settlements}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SettingsModal() {
  const open = useStore((st) => st.settingsOpen);
  const settings = useStore((st) => st.settings);
  const inGame = useStore((st) => st.screen === 'game');
  const opts = useStore((st) => st.opts);
  const modified = useStore((st) => st.modified);
  const [q0] = useState(settings.quality);
  if (!open) return null;
  const set = (patch: Partial<typeof settings>): void => {
    const s = { ...settings, ...patch };
    saveSettings(s);
    applyUiScale(s.uiScale);
    setVolume(s.volume, s.muted);
    store.set({ settings: s });
  };
  return (
    <div class="modal" role="dialog" aria-label="Settings" data-testid="settings">
      <div class="panel">
        <h2>Settings</h2>
        <label>UI scale: {Math.round(settings.uiScale * 100)} %
          <input type="range" min="0.75" max="2" step="0.05" value={settings.uiScale} onInput={(e) => set({ uiScale: +(e.target as HTMLInputElement).value })} data-testid="ui-scale" />
        </label>
        <label>Graphics quality
          <select value={settings.quality} onChange={(e) => set({ quality: (e.target as HTMLSelectElement).value as Quality })} data-testid="quality">
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
        </label>
        {settings.quality !== q0 && <p class="later">Graphics quality applies from the next game you start or load.</p>}
        <label>Sound volume: {Math.round(settings.volume * 100)} %
          <input type="range" min="0" max="1" step="0.05" value={settings.volume} onInput={(e) => set({ volume: +(e.target as HTMLInputElement).value })} data-testid="volume" />
        </label>
        <label class="row"><input type="checkbox" checked={settings.muted} onChange={(e) => set({ muted: (e.target as HTMLInputElement).checked })} data-testid="mute" /> Mute</label>
        <button onClick={() => store.set({ keysOpen: true, settingsOpen: false })} data-testid="keys-btn">Key bindings…</button>
        <label class="row"><input type="checkbox" checked={settings.globeCurve} onChange={(e) => { set({ globeCurve: (e.target as HTMLInputElement).checked }); (window as { __game?: { game?: { applyCurve(): void } } }).__game?.game?.applyCurve(); }} data-testid="globe-curve" /> Curved globe view (globe maps)</label>
        {inGame && (
          <details class="more" data-testid="settings-test-options">
            <summary>Test options (cheats){opts ? ' · on' : ''}</summary>
            <TestOptionList mask={opts} modified={modified} onChange={(m) => (window as { __game?: { game?: { setTestOptions(m: number): void } } }).__game?.game?.setTestOptions(m)} />
          </details>
        )}
        {store.state.impossibleBonusOn && <p class="warn" data-testid="settings-bonus">This match: Impossible bots get +{TUNING.bots.impossibleIncomeBonusPct} % income.</p>}
        <button class="primary" onClick={() => store.set({ settingsOpen: false })}>Close</button>
      </div>
    </div>
  );
}

function KeysModal() {
  const open = useStore((st) => st.keysOpen);
  const [listening, setListening] = useState<string | null>(null);
  const [, bump] = useState(0);
  if (!open) return null;
  const capture = (e: KeyboardEvent): void => {
    if (!listening) return;
    e.preventDefault(); e.stopPropagation();
    if (e.key !== 'Escape') setKey(listening, e.key === ' ' ? ' ' : e.key.toLowerCase());
    setListening(null); bump((n) => n + 1);
  };
  return (
    <div class="modal" role="dialog" aria-label="Key bindings" data-testid="keys" tabIndex={-1} onKeyDown={capture as never} ref={(el) => { if (el && listening) el.focus(); }}>
      <div class="panel keys">
        <h2>Key bindings</h2>
        <div class="keylist">
          {DEFAULT_KEYS.map((a) => (
            <div class="keyrow"><span>{a.label} <small>({a.context})</small></span>
              <button class={listening === a.id ? 'on' : ''} onClick={() => setListening(a.id)} data-testid={'key-' + a.id}>{listening === a.id ? 'press a key…' : keyLabel(keyFor(a.id))}</button></div>
          ))}
        </div>
        <div class="row"><button onClick={() => { resetKeys(); bump((n) => n + 1); }}>Reset to defaults</button><button class="primary" onClick={() => store.set({ keysOpen: false })} data-testid="keys-close">Close</button></div>
      </div>
    </div>
  );
}

/** F-125: what every bot is trying to do right now, with its utility scores. */
function BotOverlay() {
  const show = useStore((st) => st.showBots);
  const bots = useStore((st) => st.bots);
  if (!show) return null;
  return (
    <div class="botpanel panel-float" data-testid="bot-overlay" role="dialog" aria-label="Bot goals">
      <div class="stats-head"><b>Bot goals</b><small>utility scores × personality</small><button onClick={() => store.set({ showBots: false })} aria-label="Close">✕</button></div>
      {!bots.length && <p class="later">No bots in this match.</p>}
      {bots.map((b) => {
        const max = Math.max(1, ...Object.values(b.scores));
        return (
          <div class="botrow" data-testid={'bot-' + b.player}>
            <div><i class="swatch" style={{ background: playerSwatchCss(b.player) }} />{playerLabel(b.player)} · {b.personality} · {b.difficulty} → <b data-testid={'bot-goal-' + b.player}>{b.goal}</b>{b.naval !== 'none' ? <small> (navy: {b.naval})</small> : null}</div>
            <div class="scorebars">
              {Object.entries(b.scores).map(([g, v]) => <span class={g === b.goal ? 'on' : ''} title={`${g}: ${v}`}><i style={{ width: `${(v / max) * 100}%` }} />{g.slice(0, 4)} {v}</span>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Spectating() {
  const s = useStore((st) => st.spectating);
  return s ? <div class="spectating" data-testid="spectating">You have been eliminated: spectating the whole map</div> : null;
}

function BoxRect() {
  const b = useStore((st) => st.box);
  if (!b) return null;
  return <div class="boxsel" style={{ left: b.x0, top: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 }} />;
}

function GameOver({ onQuit }: { onQuit: () => void }) {
  const s = useStore((st) => ({ winner: st.winner, winnerTeam: st.winnerTeam, myTeam: st.myTeam, modified: st.modified }));
  const spectating = useStore((st) => st.spectating);
  const [dismissed, setDismissed] = useState(false);
  if (s.winner < 0 || dismissed) return null;
  const won = s.winnerTeam === s.myTeam && !spectating;
  return (
    <div class="modal" data-testid="gameover">
      <div class="panel">
        <h2 data-testid="gameover-title">{won ? 'Victory' : 'Defeat'}</h2>
        <p>{won ? (s.winner === 0 ? 'The world is yours.' : 'Your alliance has won.') : `${playerLabel(s.winner)}${s.winnerTeam !== s.winner ? ' and allies have' : ' has'} won.`}</p>
        {s.modified && <p class="warn" data-testid="gameover-modified">Modified run: test options were used.</p>}
        <div class="row"><button class="primary" onClick={onQuit}>Main menu</button><button onClick={() => setDismissed(true)}>Keep looking</button></div>
      </div>
    </div>
  );
}

function Toast() {
  const t = useStore((st) => st.toast);
  return t ? <div class="toast">{t}</div> : null;
}

