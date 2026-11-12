// Note: item 395: where the lead's map fragment lies in each source scene, read by the painter and by the storyboard that keeps the likeness clear of it; pure data, no painting.

// Note: x, y, width, height in art pixels and a tilt, by source scene.
export const MAP_AT = {
  papers: [24, 98, 104, 72, -0.05],
  table: [100, 104, 84, 38, -0.04],
  road: [152, 96, 46, 32, -0.16],
  body: [26, 128, 84, 40, 0.05],
  belongings: [118, 116, 112, 58, 0.04],
  witness: [96, 126, 72, 40, -0.05],
  plain: [96, 60, 128, 88, -0.06],
};

// Note: the side of the frame the likeness stands on: away from the map, so it never covers it; the art is 320 pixels wide.
export const leadCastSide = (source) => {
  const [x, , w] = MAP_AT[source] || MAP_AT.plain;
  return x + w / 2 < 160 ? 'right' : 'left';
};
