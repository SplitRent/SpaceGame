import type { DatabaseEntryDef } from './types';

/**
 * The science database fills as the player scans things. Entries are grounded in real
 * lunar science; anomalies are clearly marked as unknown. Discovery is its own reward,
 * but some entries also yield samples or unlock story beats.
 */
export const DATABASE: DatabaseEntryDef[] = [
  {
    id: 'db.regolith', title: 'Lunar Regolith', category: 'geology', tier: 1,
    text: 'The Moon’s surface layer: rock pulverised by 4 billion years of micrometeorite impacts, with no wind or water to round the grains. It is sharp, abrasive and electrostatically sticky — it clung to every Apollo suit. Near the poles it is a few metres to tens of metres deep.',
    yields: [{ item: 'regolith', qty: 3 }],
  },
  {
    id: 'db.anorthosite', title: 'Anorthosite', category: 'geology', tier: 1,
    text: 'The pale rock of the lunar highlands, made mostly of plagioclase feldspar. It floated to the top of a global magma ocean when the Moon was young, forming its original crust. Rich in aluminium, calcium and silicon.',
  },
  {
    id: 'db.basalt', title: 'Mare Basalt', category: 'geology', tier: 1,
    text: 'Dark volcanic rock. Lava flooded the Moon’s great basins 3–3.8 billion years ago, forming the dark “seas” visible from Earth. Out here in the highlands, basalt boulders are mostly impact ejecta thrown from far away.',
  },
  {
    id: 'db.ilmenite', title: 'Ilmenite', category: 'geology', tier: 1,
    text: 'Iron-titanium oxide (FeTiO₃). Abundant in some lunar basalts. Heating it with hydrogen releases water — a proposed way to make oxygen on the Moon — and leaves titanium metal behind.',
  },
  {
    id: 'db.meteorite', title: 'Iron Meteorite Fragment', category: 'geology', tier: 1,
    text: 'A piece of an asteroid’s metallic core, mostly iron and nickel. With no atmosphere to burn them up, meteorites strike the Moon at full speed; iron fragments like this survive partly intact.',
  },
  {
    id: 'db.ice', title: 'Polar Cold-Trap Ice', category: 'geology', tier: 1,
    text: 'Permanently shadowed craters near the poles have not seen sunlight for up to two billion years. At 40 K (−233 °C) they trap water ice and other volatiles delivered by comets, asteroids and solar-wind chemistry. Orbiters and impact probes confirmed the ice. Here it is mixed through the regolith like frost-cemented gravel.',
    yields: [{ item: 'ice', qty: 2 }],
  },
  {
    id: 'db.wreckage', title: 'Lantern Wreckage', category: 'technology', tier: 1,
    text: 'Hull plating, bracketry and avionics torn from the EXV Lantern as it slid to a stop. Recyclable into scrap metal and salvaged electronics.',
  },
  {
    id: 'db.lantern', title: 'EXV Lantern', category: 'technology', tier: 1,
    text: 'Expedition vessel, ~150 m. Built to land on and leave Mars-sized worlds, with a compact fission reactor, hydrolox main drive and closed-loop life support for six. Currently: lying on her port side on the lunar far side, 7° list, dark.',
    onScan: [{ discover: 'lantern' }],
  },
  {
    id: 'db.fragment', title: 'Unknown Material (“Blackglass”)', category: 'anomaly', tier: 1,
    text: 'Reflectance: effectively zero across every band the scanner can measure. Density readings change between samples. Temperature: exactly ambient, always, even in direct sunlight. The scanner cannot classify it. Further analysis needs laboratory equipment.',
    onScan: [{ setFlag: 'fragment.scanned' }],
  },
  {
    id: 'db.harbormodule', title: 'Harbor Station — Habitation Module 3', category: 'technology', tier: 1,
    text: 'A pressurised module from Harbor Station, the cislunar staging post in a halo orbit above the south pole. It should not be here. Scorching at one end suggests it was torn free, not jettisoned.',
  },
  {
    id: 'db.kepler9', title: 'Outpost Kepler-9', category: 'history', tier: 1,
    text: 'A robotic-plus-crewed mining survey outpost operated for three years, then mothballed eleven years ago “for budget reasons”. Habitat, comms tower, a rover and a tunnel bored into the hill for the seismometer array.',
  },
  {
    id: 'db.summit', title: 'Earthrise Summit', category: 'astronomy', tier: 1,
    text: 'The Moon is tidally locked: one hemisphere always faces Earth. Near the poles, Earth sits on the horizon and slow wobbles (libration) raise and lower it. From high ground on the near-side-facing flank, Earth can be seen — and radioed — from places that are otherwise out of contact.',
  },
  {
    id: 'db.earth', title: 'Earth', category: 'astronomy', tier: 1,
    text: 'Home. 384,400 km away, 1.28 light-seconds. From the Moon it shows phases like the Moon does from Earth, and it never rises or sets — it simply hangs where it is, turning.',
  },
  {
    id: 'db.basecamp', title: 'Base Camp', category: 'technology', tier: 1,
    text: 'Surveyed construction pads beside the Lantern’s cargo ramp. Level, close to the ship, and on the side of the crater that sees the most sunlight.',
  },
  {
    id: 'db.drone', title: 'Kepler-9 Survey Drone', category: 'technology', tier: 1,
    text: 'A tracked prospecting drone with a sampling cutter. Its firmware has been running for eleven years without supervision. Its behaviour is… not in the manual.',
  },
  {
    id: 'db.seismometer', title: 'Kepler-9 Seismometer Array', category: 'geology', tier: 1,
    text: 'Moonquakes are real: Apollo seismometers recorded deep quakes linked to Earth’s tides, thermal quakes at sunrise, and rare shallow quakes strong enough to rattle buildings. This array was built to map the crust for mining. Its last months of data were never transmitted.',
  },
  {
    id: 'db.cavity', title: 'Unexplained Cavity', category: 'anomaly', tier: 2,
    text: 'A void in the bedrock beneath Kepler-9, too regular to be a lava tube (there are none in these highlands) and too smooth to be an excavation. The walls have the same zero-reflectance signature as the Blackglass fragment.',
    onScan: [{ setFlag: 'cavity.scanned' }],
  },
  {
    id: 'db.moon', title: 'The Moon', category: 'astronomy', tier: 1,
    text: 'Earth’s only natural satellite, 3,474 km across, probably formed from debris when a Mars-sized body struck the young Earth. Tidally locked, airless, and scarred by four billion years of impacts. Twelve humans walked on it in the twentieth century; many more have worked on it since.',
  },
  {
    id: 'db.salvage', title: 'Harbor Cargo Canister', category: 'technology', tier: 1,
    text: 'A standard pressurised cargo canister blown loose from Harbor Station’s logistics bay. Manifest intact.',
  },
  {
    id: 'db.harbor', title: 'Harbor Station', category: 'technology', tier: 1,
    text: 'Cislunar staging station in a near-rectilinear halo orbit over the lunar south pole. Docking for four vessels, a small hotel of a crew, and — until recently — the relay for the Cadence.',
  },
];
