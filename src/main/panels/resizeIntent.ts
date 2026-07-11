import type { Edge } from '../../shared/types';

interface Point {
  x: number;
  y: number;
}

interface Rectangle extends Point {
  width: number;
  height: number;
}

export const isPointInResizeIntentCorridor = (
  point: Point,
  bounds: Rectangle,
  edge: Edge,
  margin: number
): boolean => {
  const resizeEdgeX = edge === 'right' ? bounds.x : bounds.x + bounds.width;
  return (
    Math.abs(point.x - resizeEdgeX) <= margin &&
    point.y >= bounds.y - margin &&
    point.y <= bounds.y + bounds.height + margin
  );
};
