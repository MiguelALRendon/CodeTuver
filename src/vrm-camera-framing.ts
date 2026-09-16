export interface FramingBoxSize {
  width: number;
  height: number;
  depth: number;
}

const MIN_DISTANCE = 0.2;

// "Contain": la caja completa cabe en el eje que restringe (el otro deja aire) -- D4 de revision-ux-sesion-real-3.
export function computeFramingDistance(
  box: FramingBoxSize,
  aspect: number,
  fovDeg: number,
): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const halfFovY = (fovDeg * Math.PI) / 360;
  const halfFovX = Math.atan(Math.tan(halfFovY) * safeAspect);
  const distanceForHeight = box.height / 2 / Math.tan(halfFovY);
  const distanceForWidth = box.width / 2 / Math.tan(halfFovX);
  const distance =
    Math.max(distanceForHeight, distanceForWidth) + box.depth / 2;
  return Number.isFinite(distance)
    ? Math.max(distance, MIN_DISTANCE)
    : MIN_DISTANCE;
}
