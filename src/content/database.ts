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
    id: 'db.scarpulse', title: 'Impact Scar — Periodic Emission', category: 'anomaly', tier: 2,
    text: 'Since the survivors’ transmission, the Blackglass impact scar emits a faint pulse in the far infrared every 1,969 seconds. The fragment is gone from the scar, yet the ground where it lay keeps time. Whatever the Blackglass left behind, it is still listening — or still talking.',
    onScan: [{ setFlag: 'scar.pulse.scanned' }],
  },
  {
    id: 'db.harbor', title: 'Harbor Station', category: 'technology', tier: 1,
    text: 'Cislunar staging station in a near-rectilinear halo orbit over the lunar south pole. Docking for four vessels, a small hotel of a crew, and — until recently — the relay for the Cadence.',
  },
  /* ------------------------------ Mars ------------------------------ */
  {
    id: 'db.mars', title: 'Mars', category: 'astronomy', tier: 1,
    text: 'The fourth planet: half Earth’s diameter, 38% of its gravity, with an atmosphere of carbon dioxide at under 1% of Earth’s surface pressure. Iron oxide dust colours it red. Ancient river valleys, lakebeds and minerals that only form in water show it was once wetter and warmer. Its day, the sol, is 24 hours 39 minutes.',
    onScan: [{ discover: 'mars' }],
  },
  {
    id: 'db.aresrelay', title: 'Ares Relay 2 (derelict)', category: 'technology', tier: 1,
    text: 'A communications relay in Mars orbit, dead since the Melas blackout. Its solar wings are intact; its avionics bus is not. Every relay in Mars orbit failed at 04:12:07.',
  },
  {
    id: 'db.melas', title: 'Melas Station', category: 'technology', tier: 1,
    text: 'A four-person science outpost on the floor of Melas Chasma, studying the canyon’s layered sediments. Powered by a small fission reactor; water from buried ice. Went dark at 04:12:07 — the same second as Harbor Station.',
  },
  {
    id: 'db.marsregolith', title: 'Martian Regolith', category: 'geology', tier: 1,
    text: 'Fine basaltic dust and sand, stained by iron oxides. It contains perchlorate salts — toxic to people and a useful oxidiser — so habitats wash it off suits before it comes inside.',
    yields: [{ item: 'regolith', qty: 3 }],
  },
  {
    id: 'db.layers', title: 'Layered Sulfate & Clay Deposits', category: 'geology', tier: 1,
    text: 'The canyon walls of Valles Marineris expose kilometres of layered rock. In Melas Chasma, orbiters have mapped hydrated sulfates and clays — minerals that form in water — deposited when parts of the canyon held lakes.',
  },
  {
    id: 'db.marsbasalt', title: 'Martian Basalt', category: 'geology', tier: 1,
    text: 'Dark volcanic rock, the bedrock of most of Mars. The dark dunes on the canyon floor are made of its weathered grains, pushed along by thin but persistent winds.',
  },
  {
    id: 'db.hematite', title: 'Hematite Concretions', category: 'geology', tier: 1,
    text: 'Small grey spheres of iron oxide, like the “blueberries” the Opportunity rover found at Meridiani Planum. They grow inside sediments soaked by groundwater — evidence of Mars’s wet past.',
  },
  {
    id: 'db.marsice', title: 'Exposed Ground Ice', category: 'geology', tier: 1,
    text: 'Orbiters have photographed steep scarps where thick sheets of nearly pure water ice lie just below the surface of Mars. In the shade of this bluff it survives; in sunlight it slowly sublimates straight into the thin air.',
    yields: [{ item: 'ice', qty: 2 }],
  },
  {
    id: 'db.kilopower', title: 'Fission Surface Power Unit', category: 'technology', tier: 1,
    text: 'A compact fission reactor with Stirling converters and a radiator skirt, the kind first tested on Earth as “Kilopower”. Ten kilowatts, day and night, dust storm or not — the reason Melas Station could exist at all.',
  },
  {
    id: 'db.cablecut', title: 'Severed Feeder Cable', category: 'anomaly', tier: 1,
    text: 'The cut is perfectly planar, the conductor surfaces mirror-smooth and cold. No heat damage, no tool marks, no debris. Whatever did this did not touch anything else.',
  },
  {
    id: 'db.rover', title: 'Melas Pressurised Rover', category: 'technology', tier: 1,
    text: 'Six-wheeled pressurised rover, tipped on its side at the edge of a gully. Hatch open. No bodies, no suits. Its drive log survives.',
  },
  {
    id: 'db.spire', title: 'Blackglass Spire', category: 'anomaly', tier: 1,
    text: 'A faceted column of the same zero-reflectance material as the lunar fragment, eleven metres tall, perfectly vertical, standing on bare canyon floor with no impact scar around it. It emits a pulse every 1,969 seconds, in phase with the scar on the Moon. The footprints end at its base.',
    onScan: [{ setFlag: 'spire.scanned' }],
  },
  {
    id: "db.ceres", title: "Ceres", category: "astronomy", tier: 1,
    text: "The largest object in the asteroid belt and the only dwarf planet in the inner Solar System: 940 km across. NASA’s Dawn found a crust rich in ammoniated clays and carbonates, and evidence of briny water beneath the surface.",
    onScan: [{ discover: "ceres" }],
  },
  {
    id: "db.ceresregolith", title: "Ceres Regolith", category: "geology", tier: 1,
    text: "Dark, clay-rich dust. Ceres reflects only about 9% of the sunlight that hits it — darker than fresh asphalt.",
  },
  {
    id: "db.faculae", title: "Occator Faculae", category: "geology", tier: 1,
    text: "Bright deposits of sodium carbonate left when brine from a deep reservoir reached the surface and its water sublimated away. The brightest spots on Ceres, seen by Dawn in 2015.",
  },
  {
    id: "db.cerclay", title: "Ammoniated Clay", category: "geology", tier: 1,
    text: "Clay minerals containing ammonia — a hint that Ceres formed farther out in the Solar System, where ammonia ice was common, and drifted inward.",
  },
  {
    id: "db.cerice", title: "Buried Ice Lens", category: "geology", tier: 1,
    text: "Water ice survives just beneath Ceres’s surface at higher latitudes and in shadow. Dawn’s neutron spectrometer mapped it.",
  },
  {
    id: "db.chondrite", title: "Carbonaceous Chondrite", category: "geology", tier: 1,
    text: "Primitive asteroid material, barely changed since the Solar System formed — rich in metal grains and organics.",
  },
  {
    id: "db.ceresdeep", title: "Ceres Deep", category: "technology", tier: 1,
    text: "A mining and research station in Occator crater: water, ammonia and carbonates for the outer-system economy — and, secretly, a fusion propulsion lab.",
  },
  {
    id: "db.cerbrine", title: "Brine Drill", category: "technology", tier: 1,
    text: "Drills into the brine lens beneath Occator for water and salts. The same brine that made the bright spots.",
  },
  {
    id: "db.cerespylon", title: "Drone Relay Pylon", category: "technology", tier: 1,
    text: "Mesh relay for Ceres Deep’s autonomous drones. Their quarantine protocol needs a quorum of relays.",
  },
  {
    id: "db.cerdrone", title: "Drone Wreckage", category: "technology", tier: 1,
    text: "Prospecting drones that tried to reach the seed at 04:12:07 and simply stopped, mid-stride, forever.",
  },
  {
    id: "db.seed", title: "Blackglass Seed", category: "anomaly", tier: 1,
    text: "A sphere of the zero-reflectance material, half sunk in the salt of Cerealia Facula. The salt dome grew around it: it was there before the brine rose. It keeps the Cadence.",
  },
  {
    id: "db.europa", title: "Europa", category: "astronomy", tier: 1,
    text: "Jupiter’s ice moon: a shell of water ice over a global salty ocean perhaps 100 km deep. One of the most promising places in the Solar System to look for life. Jupiter’s radiation belts bathe its surface.",
    onScan: [{ discover: "europa" }],
  },
  {
    id: "db.europaice", title: "Europa Ice", category: "geology", tier: 1,
    text: "Some of the cleanest, brightest ice in the Solar System, constantly resurfaced from below.",
  },
  {
    id: "db.europasalt", title: "Hydrated Salts", category: "geology", tier: 1,
    text: "The reddish-brown lineae are stained by salts and possibly sulfur compounds from the ocean below, reddened by radiation.",
  },
  {
    id: "db.plume", title: "Water Plume Vent", category: "geology", tier: 1,
    text: "Hubble and Galileo data suggest water vapour plumes escape from cracks in Europa’s shell. Here, one vents beside the node.",
  },
  {
    id: "db.edeep", title: "Europa Deep-1", category: "history", tier: 1,
    text: "A robotic melt-probe lander, officially lost to an ice fracture in 2046. Officially.",
  },
  {
    id: "db.europaspire", title: "Europa Node", category: "anomaly", tier: 1,
    text: "A spire of Blackglass rising from a fresh crack, its roots in the ocean two kilometres below. The scanner hears it sing a line of the Cadence — the first of three.",
    onScan: [{ setFlag: "cadence.1" }],
  },
  {
    id: "db.recorder", title: "Suit Recorder", category: "technology", tier: 1,
    text: "A personal voice recorder from an expedition suit. Gold band: command crew.",
  },
  {
    id: "db.titan", title: "Titan", category: "astronomy", tier: 1,
    text: "Saturn’s largest moon: a thick nitrogen atmosphere 1.5 times Earth’s surface pressure, methane rain, rivers and seas of liquid hydrocarbons at −179 °C. The Huygens probe landed here in 2005.",
    onScan: [{ discover: "titan" }],
  },
  {
    id: "db.tholin", title: "Tholin Sand", category: "geology", tier: 1,
    text: "Titan’s dunes are made of organic grains that settled out of the haze, shaped into long linear dunes by the winds.",
  },
  {
    id: "db.titanice", title: "Water-Ice Bedrock", category: "geology", tier: 1,
    text: "At −179 °C, water ice is as hard as rock. Titan’s “pebbles” — seen by Huygens — are made of it.",
  },
  {
    id: "db.titanrefinery", title: "Automated Refinery", category: "technology", tier: 1,
    text: "An uncrewed plant cracking tholins into feedstock for outer-system stations.",
  },
  {
    id: "db.dragonfly", title: "Dragonfly II", category: "technology", tier: 1,
    text: "A rotorcraft lander, successor to NASA’s Dragonfly. Titan’s dense air and low gravity make it the easiest place in the Solar System to fly.",
  },
  {
    id: "db.titanspire", title: "Titan Node", category: "anomaly", tier: 1,
    text: "A spire in the shallows of Kraken Mare. The methane ripples around it every 1,969 s. The second line of the Cadence.",
    onScan: [{ setFlag: "cadence.2" }],
  },
  {
    id: "db.pluto", title: "Pluto", category: "astronomy", tier: 1,
    text: "A dwarf planet 39.5 AU out, with a thin nitrogen atmosphere, blue haze layers and a heart-shaped glacier. New Horizons flew past in 2015 and found a world far more active than anyone expected.",
    onScan: [{ discover: "pluto" }],
  },
  {
    id: "db.nitrogen", title: "Nitrogen Ice", category: "geology", tier: 1,
    text: "Sputnik Planitia is a glacier of nitrogen ice, heated from below so it slowly convects, forming polygonal cells tens of kilometres across.",
  },
  {
    id: "db.plutoice", title: "Water-Ice Mountains", category: "geology", tier: 1,
    text: "At Pluto’s temperatures water ice is bedrock. Blocks of it float on the denser nitrogen ice like icebergs.",
  },
  {
    id: "db.plutospire", title: "Pluto Node", category: "anomaly", tier: 1,
    text: "The greatest spire yet, standing in the heart of the heart. The third line of the Cadence — and a gold-banded figure waiting beside it.",
    onScan: [{ setFlag: "cadence.3" }],
  },
  {
    id: "db.threshold", title: "The Threshold", category: "anomaly", tier: 1,
    text: "A ring 1.8 km across of the zero-reflectance material, turning slowly at 51 AU. The source of the Cadence. A door.",
  },
  {
    id: "db.vesperb", title: "Vesper b", category: "astronomy", tier: 1,
    text: "A rocky planet slightly larger than Earth, tidally locked to an orange K-dwarf 41 light-years from the Sun. Dayside desert, nightside ice, and between them a ring of permanent dusk — alive.",
    onScan: [{ discover: "vesperb" }],
  },
  {
    id: "db.vespersoil", title: "Living Soil", category: "biology", tier: 1,
    text: "Soil threaded with violet filaments. It is, by any definition, alive.",
  },
  {
    id: "db.vesperwater", title: "Freshwater", category: "geology", tier: 1,
    text: "Liquid water, low in salt, pH 7.2. Microbial life at 10⁶ cells per millilitre.",
  },
  {
    id: "db.vesperrock", title: "Vesper Basalt", category: "geology", tier: 1,
    text: "Volcanic rock much like Earth’s — the universe reuses its recipes.",
  },
  {
    id: "db.glowbulb", title: "Glowbulb", category: "biology", tier: 1,
    text: "A bioluminescent plant. In the eternal dusk, light attracts the kites that pollinate it.",
  },
  {
    id: "db.grazer", title: "Grazer", category: "biology", tier: 1,
    text: "Six-legged, slow, gentle, grazing on violet moss. It glows along its back when frightened, which is often.",
  },
  {
    id: "db.kite", title: "Kite", category: "biology", tier: 1,
    text: "A gliding animal with membrane wings, riding the steady wind that blows from the hot dayside to the cold nightside.",
  },
  {
    id: "db.stalker", title: "Stalker", category: "biology", tier: 1,
    text: "A low, many-limbed predator of the shadows. Its eyes are tuned for dusk; bright light blinds and frightens it.",
  },
  {
    id: "db.builders", title: "Builder Ruins", category: "history", tier: 1,
    text: "Architecture of the zero-reflectance material, a billion years old and unweathered. The Builders were tall, slow and many-limbed. They are not here any more.",
  },
  {
    id: "db.archive", title: "The Archive", category: "anomaly", tier: 1,
    text: "The Builders’ hall of memory. Its door has been open for a billion years, waiting for someone to come.",
  },
  {
    id: "db.venus", title: "Venus", category: "astronomy", tier: 1,
    text: "Earth’s twin in size, with a crushing 92-bar CO₂ atmosphere and a 465 °C surface. At 50 km altitude the pressure and temperature are Earth-like.",
    onScan: [{ discover: "venus" }],
  },
  {
    id: "db.halcyon", title: "Halcyon Aerostat", category: "technology", tier: 1,
    text: "A floating city: breathable air is a lifting gas in Venus’s dense CO₂, so a habitat full of it floats at cloud level.",
  },
  {
    id: "db.venusradar", title: "Radar: Maxwell Montes", category: "anomaly", tier: 1,
    text: "A radar-dark structure embedded in lava roughly 500 million years old. The structure is older than the lava.",
  },
  {
    id: "db.mercury", title: "Mercury", category: "astronomy", tier: 1,
    text: "The smallest planet and the closest to the Sun. Its poles hold water ice in craters the Sun never reaches — confirmed by MESSENGER.",
    onScan: [{ discover: "mercury" }],
  },
  {
    id: "db.mercuryice", title: "Mercury Polar Ice", category: "geology", tier: 1,
    text: "Water ice in the permanent shadow of Chao Meng-Fu crater, a few hundred kilometres from a surface that reaches 430 °C in sunlight.",
  },
  {
    id: "db.mercuryrock", title: "Mercury Crust", category: "geology", tier: 1,
    text: "Mercury has a huge iron core — 85% of its radius — and a thin, iron-poor but sulfur-rich crust.",
  },
  {
    id: "db.mercuryregolith", title: "Mercury Regolith", category: "geology", tier: 1,
    text: "Dark, space-weathered dust. Mercury is darker than the Moon, perhaps because of carbon from comets.",
  },
  {
    id: "db.oldspire", title: "The Old Spire", category: "anomaly", tier: 1,
    text: "A Blackglass spire in rock that solidified about four billion years ago, during the Late Heavy Bombardment. Older than any rock on Earth. Older than life. It was waiting then, too.",
  },
];
