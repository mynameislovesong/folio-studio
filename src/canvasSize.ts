import {clamp} from './model';
import type {CanvasResizeSettings} from './model';

export interface CanvasSize {width: number; height: number}
type AxisDirection = -1 | 0 | 1;

export const canvasHandles = [
  {name: '왼쪽 위', x: -1, y: -1, cursor: 'nwse'},
  {name: '위쪽', x: 0, y: -1, cursor: 'ns'},
  {name: '오른쪽 위', x: 1, y: -1, cursor: 'nesw'},
  {name: '오른쪽', x: 1, y: 0, cursor: 'ew'},
  {name: '오른쪽 아래', x: 1, y: 1, cursor: 'nwse'},
  {name: '아래쪽', x: 0, y: 1, cursor: 'ns'},
  {name: '왼쪽 아래', x: -1, y: 1, cursor: 'nesw'},
  {name: '왼쪽', x: -1, y: 0, cursor: 'ew'},
] as const;

export type CanvasHandle = typeof canvasHandles[number];

function constrain(size: CanvasSize, {min, max}: CanvasResizeSettings): CanvasSize {
  return {width: clamp(Math.round(size.width), min, max), height: clamp(Math.round(size.height), min, max)};
}

function scaleSize(size: CanvasSize, factor: number, limits: CanvasResizeSettings): CanvasSize {
  const {min, max} = limits;
  const scale = clamp(factor, min / Math.min(size.width, size.height), max / Math.max(size.width, size.height));
  return constrain({width: size.width * scale, height: size.height * scale}, limits);
}

export function changeCanvasSide(size: CanvasSize, side: keyof CanvasSize, value: number, limits: CanvasResizeSettings) {
  return limits.ratioLocked ? scaleSize(size, value / size[side], limits) : constrain({...size, [side]: value}, limits);
}

export function presetCanvasSize(size: CanvasSize, limits: CanvasResizeSettings) {
  if (limits.min / Math.min(size.width, size.height) > limits.max / Math.max(size.width, size.height)) return undefined;
  return scaleSize(size, 1, limits);
}

function anchorOffset(previous: number, next: number, direction: AxisDirection, centered: boolean) {
  if (centered || direction === 0) return (previous - next) / 2;
  return direction < 0 ? previous - next : 0;
}

export function dragCanvasSize(
  start: CanvasSize, handle: CanvasHandle, dx: number, dy: number, limits: CanvasResizeSettings, shift: boolean, alt: boolean,
) {
  const multiplier = alt ? 2 : 1;
  const width = start.width + dx * handle.x * multiplier;
  const height = start.height + dy * handle.y * multiplier;
  const horizontal = width / start.width;
  const vertical = height / start.height;
  const factor = Math.abs(horizontal - 1) >= Math.abs(vertical - 1) ? horizontal : vertical;
  const preserveRatio = limits.ratioLocked || (shift && handle.x !== 0 && handle.y !== 0);
  const size = preserveRatio ? scaleSize(start, factor, limits) : constrain({width, height}, limits);
  return {
    size,
    x: anchorOffset(start.width, size.width, handle.x, alt),
    y: anchorOffset(start.height, size.height, handle.y, alt),
  };
}
