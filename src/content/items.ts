import type { ItemDef } from './types';

/**
 * A deliberately small set of items with many uses. Every item exists for a reason
 * (see `science`/`description`). Adding an item = adding an entry here.
 */
export const ITEMS: ItemDef[] = [
  // ---------------- Resources ----------------
  {
    id: 'regolith', name: 'Regolith', category: 'resource', stack: 50, color: '#9a968e', glyph: 'Rg',
    description: 'Fine lunar soil. Sintered into sealant paste, shielding and building blocks.',
    science: 'Lunar regolith is pulverised rock produced by billions of years of micrometeorite impacts. It is sharp, abrasive and electrostatically clingy.',
    value: 1,
  },
  {
    id: 'ice', name: 'Water Ice', category: 'resource', stack: 30, color: '#bfe4ff', glyph: 'H₂O',
    description: 'Ice mixed with regolith from a permanently shadowed crater. Electrolysed into oxygen and propellant.',
    science: 'Cold traps near the lunar poles never see sunlight and stay below −230 °C, preserving water ice delivered by comets and solar wind chemistry.',
    value: 6,
  },
  {
    id: 'iron', name: 'Iron', category: 'resource', stack: 40, color: '#a6776b', glyph: 'Fe',
    description: 'Native iron grains and meteoritic metal. Used for structural frames.',
    science: 'Lunar soil contains small amounts of native metallic iron, much of it from meteorite impacts.',
    value: 3,
  },
  {
    id: 'aluminum', name: 'Aluminum', category: 'resource', stack: 40, color: '#d6dbe0', glyph: 'Al',
    description: 'Refined from highland anorthosite. Light panels, conduits and solar frames.',
    science: 'The bright lunar highlands are dominated by anorthosite, a rock rich in aluminium-bearing plagioclase feldspar.',
    value: 3,
  },
  {
    id: 'silicon', name: 'Silicon', category: 'resource', stack: 40, color: '#6d7a8f', glyph: 'Si',
    description: 'Extracted from silicate rock. Solar cells and circuit substrates.',
    science: 'Silicates make up most of the Moon’s crust; oxygen is the most abundant element in lunar rock by mass.',
    value: 3,
  },
  {
    id: 'titanium', name: 'Titanium', category: 'resource', stack: 30, color: '#8fa3b8', glyph: 'Ti',
    description: 'From ilmenite-bearing rock. High-strength parts like reactor actuators.',
    science: 'Ilmenite (FeTiO₃) is common in some lunar basalts and can also be reduced to release oxygen.',
    value: 6,
  },
  {
    id: 'carbon', name: 'Volatiles', category: 'resource', stack: 30, color: '#4b4b55', glyph: 'C',
    description: 'Frozen carbon compounds trapped with polar ice. Polymers, sealants, medical supplies.',
    science: 'Impact probes into polar craters detected carbon monoxide, carbon dioxide, ammonia and other volatiles alongside water.',
    value: 5,
  },
  {
    id: 'scrap', name: 'Scrap Metal', category: 'resource', stack: 40, color: '#8a7f73', glyph: 'Sc',
    description: 'Twisted hull plating and brackets from the crash. Recyclable.',
    value: 2,
  },
  {
    id: 'electronics', name: 'Salvaged Electronics', category: 'resource', stack: 30, color: '#3fb58e', glyph: 'El',
    description: 'Boards and chips pulled from wreckage. Needed for anything that thinks.',
    value: 8,
  },

  // ---------------- Components ----------------
  {
    id: 'sealant', name: 'Hull Sealant', category: 'component', stack: 20, color: '#e0a840', glyph: 'Se',
    description: 'Sintered regolith paste in a pressure cartridge. Seals hull breaches.',
    value: 10,
  },
  {
    id: 'frame', name: 'Structural Frame', category: 'component', stack: 20, color: '#b08d6b', glyph: 'Fr',
    description: 'Welded truss segment for base modules and hull repairs.',
    value: 12,
  },
  {
    id: 'conduit', name: 'Power Conduit', category: 'component', stack: 20, color: '#e46b3a', glyph: 'Pc',
    description: 'Shielded aluminium conductor. Carries power between modules and systems.',
    value: 12,
  },
  {
    id: 'circuit', name: 'Circuit Board', category: 'component', stack: 20, color: '#46c46c', glyph: 'Cb',
    description: 'Fabricated control board. Required by computers, sensors and drive controllers.',
    value: 20,
  },
  {
    id: 'solarcell', name: 'Solar Cell Array', category: 'component', stack: 10, color: '#3a5fd8', glyph: 'Sa',
    description: 'Folded photovoltaic sheet on an aluminium backing.',
    value: 25,
  },
  {
    id: 'powercell', name: 'Power Cell', category: 'component', stack: 10, color: '#f2d44b', glyph: 'Pw',
    description: 'High-density battery module for base storage and suit recharge.',
    value: 30,
  },

  // ---------------- Consumables ----------------
  {
    id: 'o2canister', name: 'Oxygen Canister', category: 'consumable', stack: 5, color: '#7fd3ff', glyph: 'O₂',
    description: 'Emergency suit oxygen. Restores your suit supply to full.',
    use: [{ refillOxygen: true }], value: 15,
  },
  {
    id: 'medpatch', name: 'Med Patch', category: 'consumable', stack: 5, color: '#ff6b6b', glyph: '+',
    description: 'Hemostatic analgesic patch. Restores 40 health.',
    use: [{ heal: 40 }], value: 15,
  },

  // ---------------- Quest / unique ----------------
  {
    id: 'fuelcell', name: 'Emergency Fuel Cell', category: 'quest', stack: 1, color: '#ffd166', glyph: 'FC',
    description: 'A sealed hydrogen fuel cell from the cargo hold. Enough to wake the ship’s batteries.',
  },
  {
    id: 'scrubber', name: 'CO₂ Scrubber Cartridge', category: 'quest', stack: 4, color: '#9be7c4', glyph: 'CO₂',
    description: 'Lithium hydroxide cartridge for the life support plant.',
  },
  {
    id: 'actuator', name: 'Control-Rod Actuator', category: 'quest', stack: 1, color: '#c0c8d8', glyph: 'Ac',
    description: 'Titanium drive screw and motor for the reactor’s control rods. Fabricated to Mira’s spec.',
  },
  {
    id: 'relaykit', name: 'Comms Relay Kit', category: 'quest', stack: 1, color: '#ff9f43', glyph: 'Rk',
    description: 'Folding dish, mast and transceiver. Needs line-of-sight to Earth.',
  },
  {
    id: 'startracker', name: 'Star Tracker Unit', category: 'quest', stack: 1, color: '#a29bfe', glyph: 'St',
    description: 'Survey-grade star camera salvaged from Outpost Kepler-9. Replaces the Lantern’s destroyed unit.',
  },
  {
    id: 'injector', name: 'Drive Injector Assembly', category: 'quest', stack: 3, color: '#fd79a8', glyph: 'In',
    description: 'Precision propellant injector for the main drive.',
  },
  {
    id: 'fragment', name: 'Blackglass Fragment', category: 'quest', stack: 1, color: '#15151c', glyph: '◆',
    description: 'A shard of the object that struck the Lantern. It reflects nothing. The scanner returns contradictory readings.',
  },
  {
    id: 'quakelog', name: 'Kepler-9 Seismic Log', category: 'quest', stack: 1, color: '#dfe6e9', glyph: 'Lg',
    description: 'Data core with years of seismometer records from the outpost.',
  },
  {
    id: 'keycard', name: 'Kepler-9 Access Card', category: 'quest', stack: 1, color: '#00cec9', glyph: 'K9',
    description: 'Maintenance access card, still clipped to an abandoned suit.',
  },
];
