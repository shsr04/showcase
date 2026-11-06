// Note: the 32-color dusty palette; every sprite and tile indexes into it.

export const PAL = [
  '#0d0b0a', '#1c1815', '#2b2622', '#3a3430', '#4d4640', '#6b625a', '#8c8379', '#b3a898',
  '#d9cfbd', '#f2ead8', '#2a3324', '#3b4730', '#55603f', '#77804f', '#9a9461', '#4a3a2a',
  '#6b5236', '#8e6f48', '#b8956a', '#1f2c2e', '#2f4446', '#4b6563', '#5c2a22', '#8a3d2c',
  '#b5603a', '#d9a441', '#e8d27a', '#2c3a52', '#4f6f8f', '#7d2f3a', '#c44a3a', '#3f7fbf',
];

export const C = {
  VOID: 0, SHADOW: 1, ASPH_D: 2, ASPH: 3, ASPH_L: 4, CONC: 5, DUST: 6, BONE: 7,
  BONE_L: 8, WHITE: 9, MARSH_D: 10, GRASS_D: 11, GRASS: 12, GRASS_DRY: 13, STRAW: 14, MUD: 15,
  DIRT: 16, DIRT_L: 17, SAND: 18, WATER_D: 19, WATER: 20, WATER_L: 21, RUST_D: 22, RUST: 23,
  RUST_L: 24, AMBER: 25, YELLOW: 26, NAVY: 27, STEEL: 28, MAROON: 29, RED: 30, BLUE: 31,
};

export const rgb = (i) => {
  const h = PAL[i];
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
};

export const hexNum = (i) => parseInt(PAL[i].slice(1), 16);
