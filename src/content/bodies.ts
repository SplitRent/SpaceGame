import type { CelestialBodyDef } from './types';

/**
 * Real Solar System bodies (values from NASA fact sheets, rounded). These drive the star
 * map, space rendering scale, gravity of landable regions and the discovery database.
 * Visual summaries are the art reference and must stay consistent with observations.
 */
export const BODIES: CelestialBodyDef[] = [
  {
    id: 'sun', name: 'The Sun', kind: 'star', radiusKm: 695700, gravity: 274, orbit: 0, axialTiltDeg: 7.25, rotationHours: 609.1,
    atmosphere: 'Plasma', playMode: 'backdrop', visual: 'Blinding white disc with corona; never look directly.',
    facts: ['G2V main-sequence star, about 4.6 billion years old.', 'Contains 99.86% of the Solar System’s mass.'],
  },
  {
    id: 'mercury', name: 'Mercury', kind: 'planet', radiusKm: 2439.7, gravity: 3.7, orbit: 0.387, axialTiltDeg: 0.03, rotationHours: 1407.6,
    atmosphere: 'Exosphere (O, Na, H, He, K)', playMode: 'landable',
    visual: 'Dark grey, heavily cratered, lobate scarps, bright rayed craters; harsh sunlight.',
    facts: ['Permanently shadowed polar craters contain water ice.', 'A solar day lasts 176 Earth days.'],
  },
  {
    id: 'venus', name: 'Venus', kind: 'planet', radiusKm: 6051.8, gravity: 8.87, orbit: 0.723, axialTiltDeg: 177.4, rotationHours: -5832.5,
    atmosphere: '96.5% CO₂, 92 bar, sulfuric acid clouds', playMode: 'orbital',
    visual: 'Featureless pale yellow-cream cloud deck; faint chevron patterns in UV.',
    facts: ['Surface temperature about 465 °C — hot enough to melt lead.', 'At ~50 km altitude pressure and temperature are Earth-like.'],
  },
  {
    id: 'earth', name: 'Earth', kind: 'planet', radiusKm: 6371, gravity: 9.81, orbit: 1.0, axialTiltDeg: 23.44, rotationHours: 23.93,
    atmosphere: '78% N₂, 21% O₂, 1 bar', playMode: 'orbital',
    visual: 'Blue oceans, green/brown continents, white clouds and polar ice, thin blue atmospheric limb, city lights at night.',
    facts: ['The only known world with life.', 'About 71% of the surface is ocean.'],
  },
  {
    id: 'moon', name: 'The Moon', kind: 'moon', parent: 'earth', radiusKm: 1737.4, gravity: 1.62, orbit: 384400, axialTiltDeg: 6.68, rotationHours: 655.7,
    atmosphere: 'Negligible exosphere', playMode: 'landable',
    visual: 'Grey regolith, dark basaltic maria, bright highlands, craters of every size; black sky even by day.',
    facts: ['Tidally locked: the same hemisphere always faces Earth.', 'Polar cold traps hold water ice.', 'Surface gravity is about 1/6 of Earth’s.'],
  },
  {
    id: 'mars', name: 'Mars', kind: 'planet', radiusKm: 3389.5, gravity: 3.71, orbit: 1.524, axialTiltDeg: 25.19, rotationHours: 24.62,
    atmosphere: '95% CO₂, ~0.006 bar', playMode: 'landable',
    visual: 'Rust-orange with dark albedo regions, white polar caps, Valles Marineris canyon, dusty butterscotch sky.',
    facts: ['Home to Olympus Mons, the tallest volcano known.', 'Global dust storms can last months.'],
  },
  {
    id: 'phobos', name: 'Phobos', kind: 'moon', parent: 'mars', radiusKm: 11.1, gravity: 0.0057, orbit: 9376, axialTiltDeg: 0, rotationHours: 7.65,
    atmosphere: 'None', playMode: 'stationHost', visual: 'Lumpy dark grey potato with the large Stickney crater and grooves.',
    facts: ['Orbits Mars three times a day and is slowly spiralling inward.'],
  },
  {
    id: 'ceres', name: 'Ceres', kind: 'dwarf', radiusKm: 469.7, gravity: 0.28, orbit: 2.77, axialTiltDeg: 4, rotationHours: 9.07,
    atmosphere: 'Transient water vapour', playMode: 'landable', visual: 'Dark grey with bright salt deposits (Occator crater).',
    facts: ['Largest object in the asteroid belt.', 'Bright spots are sodium carbonate from briny water.'],
  },
  {
    id: 'jupiter', name: 'Jupiter', kind: 'planet', radiusKm: 69911, gravity: 24.79, orbit: 5.203, axialTiltDeg: 3.13, rotationHours: 9.93,
    atmosphere: 'H₂/He, ammonia clouds', playMode: 'stationHost',
    visual: 'Cream zones and brown/orange belts, turbulent eddies, the Great Red Spot; faint ring.',
    facts: ['More than twice as massive as all other planets combined.', 'The Great Red Spot is a storm larger than Earth.'],
  },
  {
    id: 'europa', name: 'Europa', kind: 'moon', parent: 'jupiter', radiusKm: 1560.8, gravity: 1.31, orbit: 671100, axialTiltDeg: 0.1, rotationHours: 85.2,
    atmosphere: 'Tenuous O₂', playMode: 'landable', visual: 'Bright white-tan ice crossed by reddish-brown lineae; chaos terrain.',
    facts: ['A global salty ocean likely lies beneath its ice shell.'],
  },
  {
    id: 'ganymede', name: 'Ganymede', kind: 'moon', parent: 'jupiter', radiusKm: 2634.1, gravity: 1.43, orbit: 1070400, axialTiltDeg: 0.2, rotationHours: 171.7,
    atmosphere: 'Tenuous O₂', playMode: 'stationHost', visual: 'Mixed dark ancient terrain and bright grooved terrain.',
    facts: ['Largest moon in the Solar System, bigger than Mercury.', 'Has its own magnetic field.'],
  },
  {
    id: 'saturn', name: 'Saturn', kind: 'planet', radiusKm: 58232, gravity: 10.44, orbit: 9.537, axialTiltDeg: 26.73, rotationHours: 10.66,
    atmosphere: 'H₂/He', playMode: 'orbital', visual: 'Pale gold banded globe, hexagon at north pole, vast bright rings with the Cassini Division.',
    facts: ['Its rings are mostly water ice, some pieces as large as houses.', 'Less dense than water.'],
  },
  {
    id: 'titan', name: 'Titan', kind: 'moon', parent: 'saturn', radiusKm: 2574.7, gravity: 1.35, orbit: 1221870, axialTiltDeg: 0.3, rotationHours: 382.7,
    atmosphere: '95% N₂, 1.5 bar, methane haze', playMode: 'landable', visual: 'Orange haze globe; surface of dunes, methane lakes and seas.',
    facts: ['The only moon with a dense atmosphere.', 'Has lakes of liquid methane and ethane.'],
  },
  {
    id: 'enceladus', name: 'Enceladus', kind: 'moon', parent: 'saturn', radiusKm: 252.1, gravity: 0.113, orbit: 237948, axialTiltDeg: 0, rotationHours: 32.9,
    atmosphere: 'Plume water vapour', playMode: 'landable', visual: 'Brilliant white ice, blue “tiger stripe” fractures, geysers at the south pole.',
    facts: ['Geysers vent an internal ocean into space.'],
  },
  {
    id: 'uranus', name: 'Uranus', kind: 'planet', radiusKm: 25362, gravity: 8.69, orbit: 19.19, axialTiltDeg: 97.77, rotationHours: -17.24,
    atmosphere: 'H₂/He/CH₄', playMode: 'orbital', visual: 'Pale cyan, almost featureless; faint narrow dark rings; rolls on its side.',
    facts: ['Axis tilted about 98°, so its poles face the Sun in turn.'],
  },
  {
    id: 'neptune', name: 'Neptune', kind: 'planet', radiusKm: 24622, gravity: 11.15, orbit: 30.07, axialTiltDeg: 28.32, rotationHours: 16.11,
    atmosphere: 'H₂/He/CH₄', playMode: 'orbital', visual: 'Deep blue with dark storms and bright white methane cirrus; faint rings.',
    facts: ['Fastest winds measured in the Solar System, over 2000 km/h.'],
  },
  {
    id: 'triton', name: 'Triton', kind: 'moon', parent: 'neptune', radiusKm: 1353.4, gravity: 0.78, orbit: 354759, axialTiltDeg: 0, rotationHours: -141,
    atmosphere: 'Thin N₂', playMode: 'landable', visual: 'Pinkish nitrogen ice, cantaloupe terrain, dark geyser streaks.',
    facts: ['Orbits backwards — likely a captured Kuiper belt object.'],
  },
  {
    id: 'pluto', name: 'Pluto', kind: 'dwarf', radiusKm: 1188.3, gravity: 0.62, orbit: 39.48, axialTiltDeg: 122.53, rotationHours: -153.3,
    atmosphere: 'Thin N₂/CH₄/CO with blue haze layers', playMode: 'landable',
    visual: 'Tan and grey with the bright nitrogen-ice heart (Sputnik Planitia), reddish-brown tholin regions, water-ice mountains.',
    facts: ['Sputnik Planitia is a glacier of nitrogen ice that slowly convects.', 'Has mountains of water ice as tall as the Rockies.'],
  },
  {
    id: 'charon', name: 'Charon', kind: 'moon', parent: 'pluto', radiusKm: 606, gravity: 0.29, orbit: 19591, axialTiltDeg: 0, rotationHours: 153.3,
    atmosphere: 'None', playMode: 'landable', visual: 'Grey ice with a dark reddish north polar cap (Mordor Macula).',
    facts: ['So large relative to Pluto that they orbit a point in space between them.'],
  },
];
