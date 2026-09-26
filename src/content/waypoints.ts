import type { Condition } from './types';

/**
 * Where each quest objective points the on-screen waypoint. Keys are
 * `questId/stageId/objectiveId`; the first entry whose `when` holds is used.
 *
 * `loc` is the location the target lives in (omit for `npc:` targets: the presence
 * resolver knows where each crew member is). When the player is somewhere else, the
 * waypoint system routes them there instead: out through the nearest exit, back to the
 * Lantern, to the pilot seat, or to the star map.
 *
 * `at` keys are resolved by `Location.waypointPos`: `it:` interactable, `itp:`/`its:`
 * nearest interactable by id prefix/suffix, `npc:`, `tool:` workable tool target by id
 * prefix, `scan:` scannable entry, and on surfaces `zone:`, `poi:`, `pos:x,z`, `module:`.
 * A space-zone `loc` with no `at` means "fly there".
 */
export interface WaypointSpec {
  loc?: string;
  at?: string;
  label: string;
  when?: Condition;
}

const L = 'lantern.interior';
const MOON = 'moon.south';

const ship = (at: string, label: string, when?: Condition): WaypointSpec => ({ loc: L, at, label, when });
const moon = (at: string, label: string, when?: Condition): WaypointSpec => ({ loc: MOON, at, label, when });
const npc = (id: string, label: string): WaypointSpec => ({ at: `npc:${id}`, label });
const fly = (zone: string, label: string): WaypointSpec => ({ loc: zone, label });

export const WAYPOINTS: Record<string, WaypointSpec[]> = {
  /* ---------------------------- Act 0 ---------------------------- */
  'mq.prologue/cmdr/report': [npc('okonkwo', 'Commander Okonkwo')],
  'mq.prologue/rounds/diag': [ship('it:eng.console', 'Engineering console')],
  'mq.prologue/rounds/lab': [ship('it:lab.analyzer', 'Lab analyzer')],
  'mq.prologue/rounds/petra': [npc('novak', 'Petra')],
  'mq.prologue/rounds/earth': [ship('it:common.window', 'Common room window')],
  'mq.prologue/approach/seat': [ship('it:jump.seat', 'Jump seat')],

  /* ---------------------------- Act 1 ---------------------------- */
  'mq.aftermath/wake/find': [npc('castellanos', 'Mira')],
  'mq.aftermath/power/cell': [ship('it:emergency.crate', 'Emergency crate')],
  'mq.aftermath/power/seat': [ship('it:battery.bay', 'Battery bay')],
  'mq.aftermath/power/breakers': [ship('it:power.panel', 'Power panel')],
  'mq.aftermath/power/online': [ship('it:power.panel', 'Power panel')],

  'mq.air/seal/sealant': [
    ship('it:emergency.crate', 'Emergency crate', { not: { flag: 'crate.emergency' } }),
    ship('it:sealant.cabinet', 'Maintenance cabinet'),
  ],
  'mq.air/seal/corridor': [ship('it:seal.breach.corridor', 'Corridor breach')],
  'mq.air/seal/lab': [ship('it:seal.breach.lab', 'Lab breach')],
  'mq.air/scrub/cart': [ship('it:life.console', 'Life support console')],
  'mq.air/scrub/press': [ship('it:life.console', 'Life support console')],

  'mq.camp/build/shelter': [moon('itp:pad:', 'Construction pad')],
  'mq.camp/build/solar': [moon('itp:pad:', 'Construction pad')],
  'mq.camp/build/bench': [moon('itp:pad:', 'Construction pad')],
  'mq.camp/night/battery': [moon('itp:pad:', 'Construction pad')],

  'mq.ice/scout/reach': [moon('zone:moon.shadowcrater', 'Shadow Crater')],
  'mq.ice/scout/scan': [moon('scan:db.ice', 'Ice deposit')],
  'mq.ice/scout/mine': [moon('tool:node.ice.', 'Water ice')],
  'mq.ice/haul/proc': [moon('itp:pad:', 'Construction pad')],
  'mq.ice/haul/load': [moon('module:iceproc', 'Ice processor')],

  'mq.reactor/actuator/make': [ship('it:fabricator', 'Fabricator')],
  'mq.reactor/actuator/fit': [ship('it:reactor.actuator', 'Reactor vessel')],
  'mq.reactor/coolant/valves': [ship('it:reactor.coolant', 'Coolant valves')],
  'mq.reactor/startup/start': [ship('it:eng.console', 'Engineering console')],

  'mq.earthrise/antenna/fix': [moon('it:antenna', 'Hull antenna')],
  'mq.earthrise/antenna/on': [ship('it:comms.station', 'Comms station')],
  'mq.earthrise/relay/kit': [ship('it:fabricator', 'Fabricator')],
  'mq.earthrise/relay/deploy': [moon('it:relay.deploy', 'Earthrise Summit')],
  'mq.earthrise/relay/align': [moon('it:relay.align', 'Relay dish')],
  'mq.earthrise/call/call': [ship('it:comms.station', 'Comms station')],

  'mq.kepler/find/reach': [moon('zone:moon.kepler9', 'Outpost Kepler-9')],
  'mq.kepler/find/enter': [
    moon('it:k9.suit', 'Abandoned suit', { not: { hasItem: 'keycard' } }),
    moon('it:k9.door', 'Maintenance door'),
  ],
  'mq.kepler/inside/tracker': [{ loc: 'moon.kepler9', at: 'it:tracker', label: 'Star tracker' }],
  'mq.kepler/inside/logs': [{ loc: 'moon.kepler9', at: 'it:quakelog', label: 'Seismic data core' }],

  'mq.bearings/nav/install': [ship('it:nav.station', 'Navigation station')],
  'mq.bearings/nav/cal': [ship('it:nav.station', 'Navigation station')],

  'mq.lift/prep/inj': [
    ship('it:fabricator', 'Fabricator', { not: { hasItem: 'injector', qty: 3 } }),
    ship('it:drive.injectors', 'Drive crawlway'),
  ],
  'mq.lift/prep/hull': [moon('tool:weld.', 'Hull tear')],
  'mq.lift/prep/struts': [ship('it:eng.console', 'Engineering console')],
  'mq.lift/prep/prop': [moon('module:iceproc', 'Ice processor')],
  'mq.lift/prep/drive': [ship('it:eng.console', 'Engineering console')],

  'mq.ascent/gather/crew': [npc('arakawa', 'Kit')],
  'mq.ascent/launch/go': [ship('it:pilot.seat', 'Pilot seat')],

  'mq.harbor/approach/fly': [fly('space.cislunar', 'Harbor Station')],
  'mq.harbor/approach/dock': [fly('space.cislunar', 'Harbor Station')],
  'mq.harbor/inside/find': [npc('carvalho', 'Survivors')],

  /* ---------------------------- Act 2 ---------------------------- */
  'mq.frontier/brief/talk': [npc('haddad', 'Rafi')],
  'mq.frontier/fuel/fuel': [{ loc: 'harbor.interior', at: 'it:harbor.depot', label: 'Propellant depot' }],
  'mq.frontier/plot/plot': [ship('it:holo.table', 'Holo star map')],
  'mq.frontier/arrive/orbit': [fly('space.mars', 'Mars')],
  'mq.frontier/land/land': [{ loc: 'mars.melas', at: 'zone:mars.lz', label: 'Melas Chasma' }],
  'mq.frontier/find/find': [npc('rao', 'Melas Station')],
  'mq.frontier/power/cable': [{ loc: 'mars.melas', at: 'tool:melas.cable', label: 'Severed cable' }],
  'mq.frontier/power/cells': [{ loc: 'mars.station', at: 'it:melas.bus', label: 'Station bus' }],
  'mq.frontier/power/restart': [{ loc: 'mars.station', at: 'it:melas.bus', label: 'Station bus' }],
  'mq.frontier/debrief/rao': [npc('rao', 'Dr. Rao')],
  'mq.footprints/follow/follow': [{ loc: 'mars.melas', at: 'zone:mars.spire', label: 'Footprints' }],
  'mq.footprints/scan/scan': [{ loc: 'mars.melas', at: 'scan:db.spire', label: 'The Spire' }],
  'mq.footprints/report/imani': [npc('sola', 'Imani')],
  'sq.rover/find/log': [{ loc: 'mars.melas', at: 'it:rover.log', label: 'Rover wreck' }],

  'mq.network/brief/talk': [npc('haddad', 'Rafi')],
  'mq.network/ceres/fly': [fly('space.ceres', 'Ceres')],
  'mq.network/land/land': [{ loc: 'ceres.occator', at: 'zone:ceres.occator.lz', label: 'Occator crater' }],
  'mq.network/deep/meet': [npc('adeyemi', 'Ceres Deep')],
  'mq.network/pylons/a': [{ loc: 'ceres.occator', at: 'poi:pylon1', label: 'Relay A' }],
  'mq.network/pylons/b': [{ loc: 'ceres.occator', at: 'poi:pylon2', label: 'Relay B' }],
  'mq.network/pylons/c': [{ loc: 'ceres.occator', at: 'poi:pylon3', label: 'Relay C' }],
  'mq.network/pylons/seed': [{ loc: 'ceres.occator', at: 'poi:seed', label: 'The seed' }],
  'mq.network/hangar/cradle': [{ loc: 'ceres.occator', at: 'it:hangar', label: 'Hangar hatch' }],
  'mq.network/install/torch': [ship('it:upgrades', 'Upgrade console')],

  /* ---------------------------- Act 3 ---------------------------- */
  'mq.cadence/europa/land': [{ loc: 'europa.conamara', at: 'zone:europa.conamara.lz', label: 'Europa' }],
  'mq.cadence/europa/rec': [{ loc: 'europa.conamara', at: 'poi:recorder', label: 'Recorder' }],
  'mq.cadence/europa/scan': [{ loc: 'europa.conamara', at: 'poi:spire', label: 'The node' }],
  'mq.cadence/titan/land': [{ loc: 'titan.kraken', at: 'zone:titan.kraken.lz', label: 'Titan' }],
  'mq.cadence/titan/rec': [{ loc: 'titan.kraken', at: 'poi:recorder', label: 'Recorder' }],
  'mq.cadence/titan/scan': [{ loc: 'titan.kraken', at: 'poi:spire', label: 'The node' }],
  'mq.cadence/pluto/land': [{ loc: 'pluto.sputnik', at: 'zone:pluto.sputnik.lz', label: 'Pluto' }],
  'mq.cadence/pluto/find': [{ loc: 'pluto.sputnik', at: 'poi:okonkwo', label: 'Beacon' }],

  /* ---------------------------- Acts 4–5 ---------------------------- */
  'mq.threshold/fly/fly': [fly('space.threshold', 'The Threshold')],
  'mq.threshold/fly/dock': [fly('space.threshold', 'The Threshold')],
  'mq.threshold/door/open': [{ loc: 'threshold.interior', at: 'it:door', label: 'The Door' }],
  'mq.vesper/land/land': [{ loc: 'vesper.terminator', at: 'zone:vesper.terminator.lz', label: 'Vesper b' }],
  'mq.vesper/find/door': [{ loc: 'vesper.terminator', at: 'poi:archivedoor', label: 'Archive door' }],
  'mq.vesper/find/circle': [{ loc: 'vesper.terminator', at: 'poi:circle', label: 'Stone circle' }],
  'mq.vesper/enter/enter': [{ loc: 'vesper.terminator', at: 'poi:archivedoor', label: 'Archive door' }],
  'mq.truth/memories/m1': [{ loc: 'vesper.archive', at: 'it:mem1', label: 'Memory plinth' }],
  'mq.truth/memories/m2': [{ loc: 'vesper.archive', at: 'it:mem2', label: 'Memory plinth' }],
  'mq.truth/memories/m3': [{ loc: 'vesper.archive', at: 'it:mem3', label: 'Memory plinth' }],
  'mq.truth/heart/choose': [npc('okonkwo', 'Okonkwo')],

  /* ---------------------------- Side & crew ---------------------------- */
  'sq.visited/halcyon/radar': [{ loc: 'venus.halcyon', at: 'it:radar', label: 'Deep radar' }],
  'sq.visited/mercury/scan': [{ loc: 'mercury.chao', at: 'poi:oldspire', label: 'Old spire' }],
  'sq.visited/report/imani': [npc('sola', 'Imani')],
  'sq.kit/treat/patch': [
    ship('it:emergency.crate', 'Emergency crate', { all: [{ not: { hasItem: 'medpatch' } }, { not: { flag: 'crate.emergency' } }] }),
    ship('it:medbay.station', 'Medbay station'),
  ],
  'sq.fragment/analyze/an': [ship('it:lab.analyzer', 'Lab analyzer')],
  'sq.fragment/talk/imani': [npc('sola', 'Imani')],
  'sq.office/enter/open': [ship('it:office.lock', 'Commander’s office')],
  'sq.office/enter/read': [ship('it:office.terminal', 'Terminal')],
  'sq.office/enter/tell': [npc('haddad', 'Rafi')],
  'sq.fallen/salvage/salv': [moon('it:harbor.salvage', 'Fallen module')],
  'sq.greenhouse/build/gh': [moon('itp:pad:', 'Construction pad')],
  'sq.greenhouse/build/visit': [moon('module:greenhouse', 'Greenhouse')],
};
