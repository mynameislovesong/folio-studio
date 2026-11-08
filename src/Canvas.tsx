import {useEffect, useRef, useState} from 'react';
import type {PointerEvent as ReactPointer, DragEvent} from 'react';
import {Expand, Grid2X2, Magnet, Minus, Plus, Ruler, ScanLine} from 'lucide-react';
import {Artboard, position, textStyle} from './Artboard';
import {canvasHandles, dragCanvasSize} from './canvasSize';
import type {CanvasHandle, CanvasSize} from './canvasSize';
import {canvasSizeLimits, clamp, layerUnit, patchLayers, round} from './model';
import type {Layer, Project} from './model';

type Point = {x: number; y: number};
type Box = {x: number; y: number; w: number; h: number};
type Mode = 'move' | 'rotate' | 'nw' | 'ne' | 'sw' | 'se';
type Guide = Partial<Point>;
type Action = {project: Project; ids: string[]; mode: Mode; start: Point; box: Box; angle: number; draft: Project};
type CanvasDrag = {size: CanvasSize; zoom: number; start: Point; pointerId: number; handle: CanvasHandle};
const corners = ['nw', 'ne', 'sw', 'se'] as const;
const handlePosition = {'-1': 'min(0px, calc(50% - 24px))', '0': '50%', '1': 'max(100%, calc(50% + 24px))'};
const rad = (degrees: number) => degrees * Math.PI / 180;
const spin = ({x, y}: Point, angle: number): Point => ({x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle)});

function bounds(layers: Layer[]): Box {
  const points = layers.flatMap(layer => [-1, 1].flatMap(x => [-1, 1].map(y => {
    const offset = spin({x: x * layer.w / 2, y: y * layer.h / 2}, rad(layer.rotation));
    return {x: layer.x + layer.w / 2 + offset.x, y: layer.y + layer.h / 2 + offset.y};
  })));
  const x = Math.min(...points.map(point => point.x));
  const y = Math.min(...points.map(point => point.y));
  return {x, y, w: Math.max(...points.map(point => point.x)) - x, h: Math.max(...points.map(point => point.y)) - y};
}

function snapping(action: Action, delta: Point, zoom: number) {
  const {project, box, ids} = action;
  const result: Guide = {};
  if (!project.snap && !project.guides) return result;
  const others = project.layers.filter(layer => layer.visible && !ids.includes(layer.id)).map(layer => bounds([layer]));
  const targets = [{x: 0, y: 0, w: project.width, h: project.height}, ...others];
  for (const axis of ['x', 'y'] as const) {
    const length = axis === 'x' ? 'w' : 'h';
    const base = box[axis] + delta[axis];
    const positions = [base, base + box[length] / 2, base + box[length]];
    const edges = targets.flatMap(item => [item[axis], item[axis] + item[length] / 2, item[axis] + item[length]]);
    if (project.grid) edges.push(Math.round(base / 40) * 40);
    let closest = 6 / zoom;
    let correction = 0;
    for (const position of positions) {
      for (const edge of edges) {
        const distance = Math.abs(edge - position);
        if (distance < closest) {
          closest = distance;
          correction = edge - position;
          result[axis] = edge;
        }
      }
    }
    if (project.snap) delta[axis] += correction;
  }
  return result;
}

function transformed(action: Action, point: Point, zoom: number, shift: boolean) {
  const {project, ids, mode, start, box} = action;
  const delta = {x: point.x - start.x, y: point.y - start.y};
  let guides: Guide = {};
  const single = ids.length === 1;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  let angle = 0;
  if (mode === 'move') guides = snapping(action, delta, zoom);
  if (mode === 'rotate') {
    angle = (Math.atan2(point.y - cy, point.x - cx) - action.angle) * 180 / Math.PI;
    if (shift) angle = Math.round(angle / 15) * 15;
  }
  const sx = mode.endsWith('w') ? -1 : 1;
  const sy = mode.startsWith('n') ? -1 : 1;
  return {guides, project: {...project, layers: project.layers.map(layer => {
    if (!ids.includes(layer.id)) return layer;
    if (mode === 'move') return {...layer, x: round(layer.x + delta.x), y: round(layer.y + delta.y)};
    if (mode === 'rotate') {
      const offset = spin({x: layer.x + layer.w / 2 - cx, y: layer.y + layer.h / 2 - cy}, rad(angle));
      return {...layer, rotation: round(((layer.rotation + angle + 540) % 360) - 180),
        x: round(cx + offset.x - layer.w / 2), y: round(cy + offset.y - layer.h / 2)};
    }
    if (single) {
      const local = spin(delta, -rad(layer.rotation));
      let w = clamp(layer.w + sx * local.x, 1, 16384);
      let h = clamp(layer.h + sy * local.y, 1, 16384);
      if (layer.ratio || shift) {
        const scale = clamp(Math.abs(w / layer.w - 1) > Math.abs(h / layer.h - 1) ? w / layer.w : h / layer.h,
          Math.max(1 / layer.w, 1 / layer.h), Math.min(16384 / layer.w, 16384 / layer.h));
        w = layer.w * scale;
        h = layer.h * scale;
      }
      const offset = spin({x: sx * (w - layer.w) / 2, y: sy * (h - layer.h) / 2}, rad(layer.rotation));
      return {...layer, w: round(w), h: round(h),
        x: round(layer.x + (layer.w - w) / 2 + offset.x), y: round(layer.y + (layer.h - h) / 2 + offset.y)};
    }
    const horizontal = (box.w + sx * delta.x) / box.w;
    const vertical = (box.h + sy * delta.y) / box.h;
    const scale = clamp(Math.abs(horizontal - 1) > Math.abs(vertical - 1) ? horizontal : vertical, .02, 16);
    const anchorX = sx > 0 ? box.x : box.x + box.w;
    const anchorY = sy > 0 ? box.y : box.y + box.h;
    return {...layer, w: round(clamp(layer.w * scale, 1, 16384)), h: round(clamp(layer.h * scale, 1, 16384)),
      x: round(anchorX + (layer.x - anchorX) * scale), y: round(anchorY + (layer.y - anchorY) * scale)};
  })}};
}

interface Props {
  project: Project;
  selection: string[];
  select: (ids: string[]) => void;
  commit: (project: Project) => void;
  onFiles: (files: File[], point?: Point) => void;
  canvasResizeMode: boolean;
  setCanvasResizeMode: (active: boolean) => void;
  resizeCanvas: (size: CanvasSize) => void;
}

export function Canvas({project, selection, select, commit, onFiles, canvasResizeMode, setCanvasResizeMode, resizeCanvas}: Props) {
  const view = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const action = useRef<Action | null>(null);
  const canvasDrag = useRef<CanvasDrag | null>(null);
  const [canvasPreview, setCanvasPreview] = useState<ReturnType<typeof dragCanvasSize>>();
  const [viewSize, setViewSize] = useState({w: 840, h: 700});
  const [fitSize, setFitSize] = useState<CanvasSize>(() => ({width: project.width, height: project.height}));
  const [manualZoom, setManualZoom] = useState<number>();
  const [draft, setDraft] = useState<Project>();
  const [guides, setGuides] = useState<Guide>({});
  const [editing, setEditing] = useState<string>();
  const [dragOver, setDragOver] = useState(false);
  const preview = canvasResizeMode ? canvasPreview : undefined;
  const display = preview ? {...project, ...preview.size} : draft ?? project;
  const fit = Math.max(.02, Math.min(1.5, (viewSize.w - 116) / fitSize.width, (viewSize.h - 100) / fitSize.height));
  const zoom = canvasDrag.current?.zoom ?? manualZoom ?? fit;
  const selected = display.layers.filter(layer => selection.includes(layer.id) && layer.visible && !layer.locked);
  const one = selected.length === 1 ? selected[0] : null;
  const box = selected.length > 0 ? bounds(selected) : null;
  const text = display.layers.find(layer => layer.id === editing);

  useEffect(() => {
    const element = view.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      if (rect.width && rect.height) setViewSize({w: rect.width, h: rect.height});
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    canvasDrag.current = null;
    setCanvasPreview(undefined);
  }, [canvasResizeMode, project.width, project.height]);

  function beginCanvasDrag(event: ReactPointer<HTMLElement>, handle: CanvasHandle) {
    if (event.button !== 0 || canvasDrag.current) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    canvasDrag.current = {size: {width: project.width, height: project.height}, zoom, handle,
      start: {x: event.clientX, y: event.clientY}, pointerId: event.pointerId};
    setCanvasPreview({size: canvasDrag.current.size, x: 0, y: 0});
  }

  function updateCanvasDrag(event: ReactPointer<HTMLElement>, apply = false) {
    const drag = canvasDrag.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = (event.clientX - drag.start.x) / drag.zoom;
    const dy = (event.clientY - drag.start.y) / drag.zoom;
    const next = dragCanvasSize(drag.size, drag.handle, dx, dy, project.canvasResize ?? canvasSizeLimits, event.shiftKey, event.altKey);
    if (!apply) {
      setCanvasPreview(next);
      return;
    }
    cancelCanvasDrag(event);
    if (next.size.width !== drag.size.width || next.size.height !== drag.size.height) resizeCanvas(next.size);
  }

  function cancelCanvasDrag(event: ReactPointer<HTMLElement>) {
    if (event.pointerId !== canvasDrag.current?.pointerId) return;
    canvasDrag.current = null;
    setCanvasPreview(undefined);
  }

  function point(clientX: number, clientY: number): Point {
    const rect = board.current!.getBoundingClientRect();
    return {x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom};
  }

  function start(event: ReactPointer, layer?: Layer, mode: Mode = 'move') {
    if (event.button !== 0 || editing) return;
    event.stopPropagation();
    if (layer?.locked) return;
    let ids = selection;
    if (layer) {
      const unit = (event.altKey ? [layer] : layerUnit(project, layer)).filter(item => !item.locked).map(item => item.id);
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        select(unit.every(id => selection.includes(id)) ? selection.filter(id => !unit.includes(id)) : [...new Set([...selection, ...unit])]);
        return;
      }
      if (!selection.includes(layer.id) || event.altKey) ids = unit;
      select(ids);
    }
    const moving = project.layers.filter(item => ids.includes(item.id) && !item.locked && item.visible);
    if (!moving.length) return;
    const groupBox = bounds(moving);
    const origin = point(event.clientX, event.clientY);
    action.current = {project, ids: moving.map(item => item.id), mode, start: origin, box: groupBox, draft: project,
      angle: Math.atan2(origin.y - groupBox.y - groupBox.h / 2, origin.x - groupBox.x - groupBox.w / 2)};
    // Move captures after the drag threshold so stationary clicks still generate a double-click.
    if (mode !== 'move') surface.current?.setPointerCapture(event.pointerId);
  }

  function move(event: ReactPointer<HTMLDivElement>) {
    const active = action.current;
    if (!active) return;
    if (!(event.buttons & 1)) return end(false);
    const current = point(event.clientX, event.clientY);
    if (active.draft === active.project && Math.hypot(current.x - active.start.x, current.y - active.start.y) * zoom < 2) return;
    if (!surface.current!.hasPointerCapture(event.pointerId)) surface.current!.setPointerCapture(event.pointerId);
    const next = transformed(active, current, zoom, event.shiftKey);
    active.draft = next.project;
    setDraft(next.project);
    setGuides(next.guides);
  }

  function end(apply: boolean) {
    const active = action.current;
    action.current = null;
    if (apply && active && active.project !== active.draft) commit(active.draft);
    setDraft(undefined);
    setGuides({});
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files.length) onFiles(Array.from(event.dataTransfer.files), point(event.clientX, event.clientY));
  }
  const stepZoom = (factor: number) => setManualZoom(clamp(zoom * factor, .02, 4));

  return <section className="canvas-pane" aria-label="디자인 캔버스">
    <div ref={view} className={'viewport' + (dragOver ? ' file-over' : '')}
      onDragOver={event => {if (event.dataTransfer.types.includes('Files')) {event.preventDefault(); setDragOver(true);}}}
      onDragLeave={event => {if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false);}}
      onDrop={drop}>
      <div className="workarea" onPointerDown={event => {if (event.button === 0 && !editing) select([]);}}>
        <div style={{width: project.width * zoom, height: project.height * zoom}}>
          <div className={'board-frame' + (canvasResizeMode ? ' canvas-resizing' : '')} style={{
            width: display.width * zoom, height: display.height * zoom, left: (preview?.x ?? 0) * zoom, top: (preview?.y ?? 0) * zoom,
          }} onPointerMove={event => updateCanvasDrag(event)} onPointerUp={event => updateCanvasDrag(event, true)}
            onPointerCancel={cancelCanvasDrag} onLostPointerCapture={cancelCanvasDrag}>
            <div className="board-label">
              <button aria-label="아트보드 선택" aria-pressed={canvasResizeMode} onClick={() => setCanvasResizeMode(!canvasResizeMode)}><i />아트보드 01</button>
              <span>{display.width} × {display.height}</span>
            </div>
            <div ref={board} className="board-plane" style={{width: display.width, height: display.height, transform: 'scale(' + zoom + ')'}}>
              <Artboard project={display} omit={editing} />
              <div ref={surface} className="interaction" onPointerMove={move} onPointerUp={() => end(true)} onPointerCancel={() => end(false)}
                onPointerLeave={event => {if (!event.currentTarget.hasPointerCapture(event.pointerId)) end(false);}}>
                {display.grid && <div className="design-grid" />}
                {!canvasResizeMode && <div className="layer-hit-area">{display.layers.toReversed().filter(layer => layer.visible && !layer.locked && layer.id !== editing).map(layer =>
                  <div key={layer.id} className="hit-layer" data-layer={layer.id} data-name={layer.name} style={position(layer)}
                    onPointerDown={event => start(event, layer)}
                    onDoubleClick={event => {if (layer.kind === 'text') {event.stopPropagation(); select([layer.id]); setEditing(layer.id);}}} />)}</div>}
                {display.guides && guides.x !== undefined && <div className="guide guide-x" style={{left: guides.x, width: 1 / zoom}} />}
                {display.guides && guides.y !== undefined && <div className="guide guide-y" style={{top: guides.y, height: 1 / zoom}} />}
                {box && !editing && !canvasResizeMode && <div className="selection-box" style={{
                  ...(one ? position(one) : {left: box.x, top: box.y, width: box.w, height: box.h}),
                  borderWidth: 1 / zoom, '--handle': 9 / zoom + 'px', '--arm': 25 / zoom + 'px',
                } as React.CSSProperties}>
                  {corners.map(corner => <button key={corner} aria-label={'크기 조절 ' + corner} className={'handle ' + corner}
                    onPointerDown={event => start(event, undefined, corner)} />)}
                  <button aria-label="회전 핸들" className="handle rotation" onPointerDown={event => start(event, undefined, 'rotate')} />
                </div>}
                {text && <div className="direct-text" style={position(text)} onPointerDown={event => event.stopPropagation()}>
                  <textarea autoFocus aria-label="캔버스 텍스트 편집" defaultValue={text.text}
                    style={{...textStyle(text), outlineWidth: 2 / zoom}}
                    onBlur={event => {
                      if (event.currentTarget.dataset.cancel !== 'true' && event.currentTarget.value !== text.text) commit(patchLayers(project, [text.id], {text: event.currentTarget.value}));
                      setEditing(undefined);
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Escape') {event.currentTarget.dataset.cancel = 'true'; event.currentTarget.blur();}
                      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) event.currentTarget.blur();
                    }} />
                </div>}
              </div>
            </div>
            {canvasResizeMode && canvasHandles.filter(handle => !handle.x || !handle.y).map(handle =>
              <span key={handle.name} className={'canvas-edge ' + handle.cursor} data-edge={handle.name}
                style={handle.x ? {left: handlePosition[handle.x]} : {top: handlePosition[handle.y]}}
                aria-hidden="true" onPointerDown={event => beginCanvasDrag(event, handle)} />)}
            {canvasResizeMode && canvasHandles.map(handle => <button type="button" key={handle.name}
              aria-label={'캔버스 ' + handle.name + ' 크기 조절'} className={'canvas-handle ' + handle.cursor}
              style={{left: handlePosition[handle.x], top: handlePosition[handle.y]}}
              onPointerDown={event => beginCanvasDrag(event, handle)} />)}
          </div>
        </div>
      </div>
      {dragOver && <div className="drop-veil">여기에 이미지 또는 SVG 놓기</div>}
    </div>
    {preview && <output className="canvas-size-preview" aria-label="드래그 중 캔버스 크기">{display.width} × {display.height} px</output>}
    <div className="canvas-status">
      <div className="status-tools">
        <button className={'icon-button canvas-mode-button' + (canvasResizeMode ? ' active' : '')} title="캔버스 크기 조절" aria-label="캔버스 크기 조절"
          aria-pressed={canvasResizeMode} onClick={() => setCanvasResizeMode(!canvasResizeMode)}><ScanLine /></button>
        <button className={'icon-button' + (project.grid ? ' active' : '')} title="격자" aria-label="격자" aria-pressed={project.grid} onClick={() => commit({...project, grid: !project.grid})}><Grid2X2 /></button>
        <button className={'icon-button' + (project.guides ? ' active' : '')} title="정렬 가이드" aria-label="정렬 가이드" aria-pressed={project.guides} onClick={() => commit({...project, guides: !project.guides})}><Ruler /></button>
        <button className={'icon-button' + (project.snap ? ' active' : '')} title="스냅" aria-label="스냅" aria-pressed={project.snap} onClick={() => commit({...project, snap: !project.snap})}><Magnet /></button>
      </div>
      <div className="zoom-tools">
        <button className="icon-button" title="축소" aria-label="축소" onClick={() => stepZoom(1 / 1.2)}><Minus /></button>
        <button className="zoom-readout" title="실제 크기" onClick={() => setManualZoom(1)}>{Math.round(zoom * 100)}%</button>
        <button className="icon-button" title="확대" aria-label="확대" onClick={() => stepZoom(1.2)}><Plus /></button>
        <span className="tool-separator" />
        <button className="icon-button" title="화면에 맞춤" aria-label="화면에 맞춤" onClick={() => {
          setFitSize({width: project.width, height: project.height});
          setManualZoom(undefined);
        }}><Expand /></button>
      </div>
    </div>
  </section>;
}

