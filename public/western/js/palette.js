// Note: the 32-colour dusty Western palette; every tile and sprite indexes into it.

export const PAL = [
  '#0a0806', '#1a1410', '#2a2119', '#3d2c1e', '#5c4129', '#7d5c3a', '#9a7549', '#b8925e',
  '#8a7350', '#b09a6e', '#cdb88a', '#8c6a4a', '#b08a64', '#cfa97f', '#d8c9a8', '#ece0c4',
  '#6b645c', '#8f877c', '#3a3a3e', '#5a5a60', '#6f9a9c', '#a8cfcb', '#6b2a20', '#9a3a2a',
  '#c45a3a', '#d9a441', '#ecd27a', '#2f3a26', '#55663a', '#3f5a7a', '#2a3a52', '#e8dcc0',
];

export const C = {
  VOID: 0, SHADOW: 1, DARK: 2, WOOD_D: 3, WOOD: 4, WOOD_L: 5, PLANK: 6, PLANK_L: 7,
  SAND_D: 8, SAND: 9, SAND_L: 10, ADOBE_D: 11, ADOBE: 12, ADOBE_L: 13, PLASTER: 14, PLASTER_L: 15,
  STONE: 16, STONE_L: 17, IRON: 18, IRON_L: 19, GLASS: 20, GLASS_L: 21, RED_D: 22, RED: 23,
  RED_L: 24, GOLD: 25, GOLD_L: 26, GREEN_D: 27, GREEN: 28, BLUE: 29, BLUE_D: 30, BONE: 31,
};

export const rgb = (i) => {
  const h = PAL[i];
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
};

export const hexNum = (i) => parseInt(PAL[i].slice(1), 16);
