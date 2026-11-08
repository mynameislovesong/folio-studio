export const uid = () => crypto.randomUUID();
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const round = (value: number) => Math.round(value * 10) / 10;

export const blendModes = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'] as const;
export const fonts = ['Malgun Gothic', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Segoe UI', 'serif', 'sans-serif', 'monospace'];
export const kinds = ['text', 'image', 'svg', 'rect', 'circle', 'line', 'background', 'html', 'frame'] as const;
export type Kind = typeof kinds[number];
export const kindNames: Record<Kind, string> = {text: '텍스트', image: '이미지', svg: 'SVG', rect: '사각형', circle: '원형', line: '선', background: '배경', html: 'HTML', frame: '프레임'};
export type FieldType = 'text' | 'image' | 'background';

export interface Layer {
  id: string;
  name: string;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  blend: typeof blendModes[number];
  visible: boolean;
  locked: boolean;
  group: string;
  ratio: boolean;
  color: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
  shadow: boolean;
  text: string;
  font: string;
  fontSize: number;
  weight: number;
  tracking: number;
  leading: number;
  align: 'left' | 'center' | 'right';
  vertical: boolean;
  src: string;
  flipX: boolean;
  flipY: boolean;
  blur: number;
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  sepia: number;
  cropZoom: number;
  cropX: number;
  cropY: number;
  fit: 'cover' | 'contain';
  svg: string;
  tint: boolean;
  mask: string;
  maskMode: 'alpha' | 'luminance' | 'clip';
  html: string;
  css: string;
  fields: Record<string, string>;
}
export interface FontAsset {name: string; family: string; src: string}
export interface CanvasResizeSettings {min: number; max: number; ratioLocked: boolean}
export const canvasSizeLimits = {min: 16, max: 4096, ratioLocked: false};

export interface Project {
  version: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  canvasResize?: CanvasResizeSettings;
  background: string;
  backgroundImage: string;
  transparent: boolean;
  grid: boolean;
  guides: boolean;
  snap: boolean;
  outputScale: 1 | 2 | 4;
  layers: Layer[];
  groups: Record<string, string>;
  fonts: FontAsset[];
}
export type LayerPatch = Partial<Omit<Layer, 'id' | 'kind'>>;

const frameSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" preserveAspectRatio="none"><path d="M6 95V6H95M705 6H794V95M6 905V994H95M705 994H794V905" stroke="#d8e2df" fill="none" stroke-width="5"/></svg>';
export const defaultHtml = '<div class="card"><p class="label">FIELD NOTES / 01</p><h1 id="title" data-editable="text">미확인 기록</h1><p id="description" data-editable="text">여기에 내용을 입력하세요.</p></div>';
export const defaultCss = '.card { height: 100%; box-sizing: border-box; background: #dce6df; color: #172b2a; padding: 32px; font-family: Arial, sans-serif; }\n.label { font: bold 13px monospace; letter-spacing: .16em; }\nh1 { margin: 16px 0; font-size: 36px; }';

export function makeLayer(kind: Kind, patch: LayerPatch = {}): Layer {
  const base: Layer = {
    id: uid(), kind, name: kindNames[kind], x: 0, y: 0, w: 240, h: 160, rotation: 0,
    opacity: 100, blend: 'normal', visible: true, locked: false, group: '', ratio: false,
    color: '#b7cec4', stroke: '#a1b5ae', strokeWidth: 0, radius: 0, shadow: false,
    text: '텍스트를 입력하세요', font: 'Malgun Gothic', fontSize: 32, weight: 600, tracking: 0, leading: 1.2,
    align: 'left', vertical: false, src: '', flipX: false, flipY: false, blur: 0, brightness: 100,
    contrast: 100, saturation: 100, grayscale: 0, sepia: 0, cropZoom: 100, cropX: 50, cropY: 50,
    fit: 'cover', svg: '', tint: false, mask: '', maskMode: 'alpha', html: '', css: '', fields: {},
  };
  const defaults: Partial<Record<Kind, LayerPatch>> = {
    text: {w: 340, h: 64, color: '#f0eee5'},
    image: {ratio: true},
    svg: {ratio: true, svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="#e7edcb" d="M50 0L61 39L100 50L61 61L50 100L39 61L0 50L39 39Z"/></svg>', w: 140, h: 140},
    circle: {w: 160, h: 160, ratio: true},
    line: {w: 240, h: 3},
    background: {color: '#253733'},
    html: {w: 400, h: 260, html: defaultHtml, css: defaultCss},
    frame: {svg: frameSvg, w: 320, h: 400},
  };
  return {...base, ...defaults[kind], ...patch};
}

export function newProject(name = '제목 없는 프로젝트'): Project {
  return {
    version: 1, id: uid(), name, width: 1080, height: 1080, background: '#262e2c',
    backgroundImage: '', transparent: false, grid: false, guides: true, snap: true,
    outputScale: 1, layers: [], groups: {}, fonts: [],
  };
}
export function addLayers(project: Project, layers: Layer[]): Project {
  const background = layers.filter(layer => layer.kind === 'background' && !layer.group);
  const foreground = layers.filter(layer => layer.kind !== 'background' || layer.group);
  return {...project, layers: [...foreground, ...project.layers, ...background]};
}
export function duplicateLayers(project: Project, layers: Layer[]): Layer[] {
  const map = new Map<string, string>();
  return layers.map(layer => {
    if (layer.group && !map.has(layer.group)) map.set(layer.group, uid());
    const x = layer.x + 20 > project.width - 8 ? layer.x - 20 : layer.x + 20;
    const y = layer.y + 20 > project.height - 8 ? layer.y - 20 : layer.y + 20;
    return {...layer, id: uid(), x, y, name: layer.name + ' 복제', group: map.get(layer.group) ?? ''};
  });
}
export function patchLayers(project: Project, ids: string[], patch: LayerPatch) {
  return {...project, layers: project.layers.map(layer => ids.includes(layer.id) ? {...layer, ...patch} : layer)};
}
export function layerUnit(project: Project, layer: Layer) {
  return layer.group ? project.layers.filter(candidate => candidate.group === layer.group) : [layer];
}
export function reorder(project: Project, ids: string[], target: 'front' | 'back' | 'forward' | 'backward' | string) {
  const moved = project.layers.filter(layer => ids.includes(layer.id) || (layer.group && project.layers.some(item => ids.includes(item.id) && item.group === layer.group)));
  const rest = project.layers.filter(layer => !moved.includes(layer));
  if (moved.length === 0 || rest.length === 0) return project;
  let at = 0;
  if (target === 'back') at = rest.length;
  else if (target === 'forward') at = Math.max(0, rest.filter(layer => project.layers.indexOf(layer) < project.layers.indexOf(moved[0])).length - 1);
  else if (target === 'backward') at = Math.min(rest.length, rest.filter(layer => project.layers.indexOf(layer) < project.layers.indexOf(moved.at(-1)!)).length + 1);
  else if (target !== 'front') {
    const candidate = rest.find(layer => layer.id === target);
    if (!candidate) return project;
    at = rest.indexOf(candidate) + Number(project.layers.indexOf(moved[0]) < project.layers.indexOf(candidate));
  }
  const group = rest[at]?.group;
  if (group && group === rest[at - 1]?.group) {
    at = target === 'backward' || (target !== 'forward' && project.layers.indexOf(moved[0]) < project.layers.indexOf(rest[at]))
      ? rest.findLastIndex(layer => layer.group === group) + 1 : rest.findIndex(layer => layer.group === group);
  }
  const layers = [...rest.slice(0, at), ...moved, ...rest.slice(at)];
  return layers.every((layer, index) => layer === project.layers[index]) ? project : {...project, layers};
}
export function groupLayers(project: Project, ids: string[]) {
  const groups = new Set(project.layers.filter(layer => ids.includes(layer.id)).map(layer => layer.group).filter(Boolean));
  const selected = project.layers.filter(layer => !layer.locked && (ids.includes(layer.id) || groups.has(layer.group)));
  if (selected.length < 2 || project.layers.some(layer => layer.locked && groups.has(layer.group))) return project;
  const id = uid();
  const at = project.layers.indexOf(selected[0]);
  const rest = project.layers.filter(layer => !selected.includes(layer));
  return {...project, groups: {...project.groups, [id]: '그룹'}, layers: [...rest.slice(0, at), ...selected.map(layer => ({...layer, group: id})), ...rest.slice(at)]};
}
export function ungroupLayers(project: Project, ids: string[]) {
  const groups = new Set(project.layers.filter(layer => ids.includes(layer.id)).map(layer => layer.group).filter(Boolean));
  return {...project, layers: project.layers.map(layer => groups.has(layer.group) ? {...layer, group: ''} : layer)};
}

export const safeRaster = (value: string) => /^data:image\/(?:png|jpe?g|webp);base64,[a-z\d+/=\s]+$/i.test(value);
export const safeFont = (value: string) => /^data:font\/(?:woff2?|ttf|otf);base64,[a-z\d+/=\s]+$/i.test(value);
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (value: unknown, fallback = '', max = 2_000_000) => typeof value === 'string' ? value.slice(0, max) : fallback;
const num = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
const hex = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const raster = (value: unknown) => typeof value === 'string' && safeRaster(value) ? value : '';

export function readProject(value: unknown): Project {
  const data = record(value);
  if (data.version !== 1 || !Array.isArray(data.layers) || data.layers.length > 500) throw new Error('Folio Studio 프로젝트 JSON(버전 1, 레이어 최대 500개)이 필요합니다.');
  const project = newProject(str(data.name, '가져온 프로젝트', 100));
  const groupMap = new Map<string, string>();
  const sourceGroups = record(data.groups);
  let precedingGroup = '';
  let currentGroup = '';
  project.layers = data.layers.map(raw => {
    const item = record(raw);
    if (!kinds.includes(item.kind as Kind)) throw new Error('지원하지 않는 레이어 유형입니다.');
    const layer = makeLayer(item.kind as Kind);
    const sourceGroup = str(item.group, '', 100);
    if (sourceGroup && sourceGroup !== precedingGroup) {
      currentGroup = uid();
      groupMap.set(currentGroup, str(sourceGroups[sourceGroup], '그룹', 80));
    }
    precedingGroup = sourceGroup;
    layer.group = sourceGroup ? currentGroup : '';
    const ranges = {
      x: [-65536, 65536], y: [-65536, 65536], w: [1, 16384], h: [1, 16384], rotation: [-360, 360],
      opacity: [0, 100], strokeWidth: [0, 100], radius: [0, 2048], fontSize: [1, 1024],
      weight: [100, 900], tracking: [-40, 100], leading: [0.5, 5], blur: [0, 40],
      brightness: [0, 300], contrast: [0, 300], saturation: [0, 300], grayscale: [0, 100],
      sepia: [0, 100], cropZoom: [100, 500], cropX: [0, 100], cropY: [0, 100],
    } as const;
    for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) layer[key] = num(item[key], layer[key], ranges[key][0], ranges[key][1]);
    for (const key of ['visible', 'locked', 'ratio', 'shadow', 'vertical', 'flipX', 'flipY', 'tint'] as const) if (typeof item[key] === 'boolean') layer[key] = item[key];
    for (const key of ['svg', 'mask', 'html', 'css', 'text'] as const) layer[key] = str(item[key], layer[key]);
    layer.name = str(item.name, layer.name, 100);
    layer.font = str(item.font, layer.font, 100);
    layer.color = hex(item.color, layer.color);
    layer.stroke = hex(item.stroke, layer.stroke);
    layer.blend = blendModes.includes(item.blend as Layer['blend']) ? item.blend as Layer['blend'] : 'normal';
    layer.align = item.align === 'center' || item.align === 'right' ? item.align : 'left';
    layer.fit = item.fit === 'contain' ? 'contain' : 'cover';
    layer.maskMode = item.maskMode === 'clip' || item.maskMode === 'luminance' ? item.maskMode : 'alpha';
    layer.src = raster(item.src);
    layer.fields = Object.fromEntries(Object.entries(record(item.fields)).filter(([key, val]) => key.length <= 160 && typeof val === 'string').slice(0, 500)) as Layer['fields'];
    return layer;
  });
  project.groups = Object.fromEntries(groupMap);
  const {min, max} = canvasSizeLimits;
  project.width = Math.round(num(data.width, 1080, min, max));
  project.height = Math.round(num(data.height, 1080, min, max));
  if (data.canvasResize) {
    const settings = record(data.canvasResize);
    project.canvasResize = {
      min: Math.round(num(settings.min, min, min, Math.min(project.width, project.height))),
      max: Math.round(num(settings.max, max, Math.max(project.width, project.height), max)),
      ratioLocked: settings.ratioLocked === true,
    };
  }
  project.background = hex(data.background, project.background);
  project.backgroundImage = raster(data.backgroundImage);
  for (const key of ['transparent', 'grid', 'guides', 'snap'] as const) if (typeof data[key] === 'boolean') project[key] = data[key];
  if (data.outputScale === 2 || data.outputScale === 4) project.outputScale = data.outputScale;
  if (Array.isArray(data.fonts)) {
    project.fonts = data.fonts.slice(0, 40).map(record).filter(asset => typeof asset.src === 'string' && safeFont(asset.src) && /^Folio-[a-f0-9-]+$/i.test(String(asset.family)))
      .map(asset => ({name: str(asset.name, '폰트', 100), family: String(asset.family), src: String(asset.src)}));
  }
  return project;
}

export async function asDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
}

export async function loadRaster(file: File) {
  const inferred = /\.(png|jpe?g|webp)$/i.exec(file.name)?.[1]?.toLowerCase();
  const type = /^image\/(png|jpeg|webp)$/.test(file.type) ? file.type : inferred ? 'image/' + (inferred === 'jpg' ? 'jpeg' : inferred) : '';
  if (!type || file.size > 24 * 1024 * 1024) throw new Error('24MB 이하 PNG, JPEG, WebP 파일을 선택하세요.');
  const src = await asDataUrl(new Blob([file], {type}));
  const image = new Image();
  image.src = src;
  await image.decode().catch(() => { throw new Error('이미지 형식을 읽을 수 없습니다.'); });
  return {src, width: image.naturalWidth, height: image.naturalHeight};
}

