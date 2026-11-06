export function isGlobeFacing(normal, cameraPosition, pointPosition) {
  const toCamera = {
    x: cameraPosition.x - pointPosition.x,
    y: cameraPosition.y - pointPosition.y,
    z: cameraPosition.z - pointPosition.z,
  };
  const length = Math.hypot(toCamera.x, toCamera.y, toCamera.z);
  return length > 0 && (normal.x * toCamera.x + normal.y * toCamera.y + normal.z * toCamera.z) / length > 0;
}
