export function choosePreciseIntersection(intersections) {
  return intersections
    .map((intersection, order) => {
      const marker = intersection.object.userData?.point
        ? intersection.object
        : intersection.object.parent;
      const data = marker?.userData ?? {};
      return { intersection, order, data, visual: intersection.object === data.visual };
    })
    .filter(({ data }) => data.point)
    .sort((a, b) => Number(b.visual) - Number(a.visual)
      || (a.data.pickRadius ?? Infinity) - (b.data.pickRadius ?? Infinity)
      || a.intersection.distance - b.intersection.distance
      || a.order - b.order)[0]?.intersection;
}
