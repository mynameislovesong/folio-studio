import {useState} from 'react';
import type {ReactNode} from 'react';
import {BoxSelect, CodeXml, ImagePlus, Layers3, ScanLine, X} from 'lucide-react';
import {compileHtml} from './code';
import {changeCanvasSide, presetCanvasSize} from './canvasSize';
import {blendModes, canvasSizeLimits, clamp, fonts, kindNames, round} from './model';
import type {Layer, LayerPatch, Project} from './model';
import {kindIcons, LayerCommands} from './LayerPanel';
import type {LayerActions} from './LayerPanel';

export function NumberField({label, value, min = -65536, max = 65536, step = 1, set}: {label: string; value: number; min?: number; max?: number; step?: number; set: (value: number) => void}) {
  const [draft, setDraft] = useState<string>();
  return <label className="numeric"><span>{label}</span><input type="number" aria-label={label} min={min} max={max} step={step} value={draft ?? String(value)} onChange={event => setDraft(event.target.value)}
    onBlur={event => {
      const next = Number(event.currentTarget.value);
      if (event.currentTarget.dataset.cancel !== 'yes' && draft?.trim() && Number.isFinite(next)) {
        const result = clamp(next, min, max);
        if (result !== value) set(result);
      }
      setDraft(undefined);
      delete event.currentTarget.dataset.cancel;
    }}
    onKeyDown={event => {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') {event.currentTarget.dataset.cancel = 'yes'; event.currentTarget.blur();}
    }} /></label>;
}

function Slider({label, value, set, min = 0, max = 100, step = 1}: {label: string; value: number; set: (value: number) => void; min?: number; max?: number; step?: number}) {
  return <div className="slider-row"><label><span>{label}</span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={event => set(Number(event.target.value))} /></label>
    <NumberField label={label + ' 값'} value={value} set={set} min={min} max={max} step={step} /></div>;
}

function Section({title, children}: {title: string; children: ReactNode}) {
  return <section className="inspector-section"><h3>{title}</h3>{children}</section>;
}
export function Toggle({label, value, set}: {label: string; value: boolean; set: (value: boolean) => void}) {
  return <label className="toggle"><span>{label}</span><input type="checkbox" checked={value} onChange={event => set(event.target.checked)} /></label>;
}
function Color({label, value, set}: {label: string; value: string; set: (value: string) => void}) {
  return <label className="color-row"><span>{label}</span><span className="color-value"><input type="color" value={value} onChange={event => set(event.target.value)} />{value.toUpperCase()}</span></label>;
}

interface Props {
  project: Project;
  selection: string[];
  change: (patch: Partial<Project>, key?: string) => void;
  edit: (patch: LayerPatch, key?: string) => void;
  actions: LayerActions;
  openCode: (layer: Layer, tab?: 'svg' | 'mask') => void;
  chooseImage: (destination: 'canvas' | 'replace' | string) => void;
  chooseFont: () => void;
}

export function Inspector({project, selection, change, edit, actions, openCode, chooseImage, chooseFont}: Props) {
  const limits = project.canvasResize ?? canvasSizeLimits;
  const selected = project.layers.filter(layer => selection.includes(layer.id) && !layer.locked);
  const one = selected.length === 1 ? selected[0] : null;
  const group = selected.some(layer => layer.group);
  let fields: ReturnType<typeof compileHtml>['fields'] = [];
  if (one?.kind === 'html') {
    try {fields = compileHtml(one.html, one.css, one.fields, 'fields').fields;} catch { /* Code dialog shows parser errors. */ }
  }
  if (!selected.length) return <div className="inspector">
    <div className="inspector-heading"><span className="heading-icon"><ScanLine size={19} /></span><div><span className="panel-hint">ARTBOARD</span><h2>캔버스 설정</h2></div></div>
    <Section title="크기 및 비율">
      <div className="fields-pair">
        <NumberField label="너비" min={limits.min} max={limits.max} value={project.width} set={value => change(changeCanvasSide(project, 'width', value, limits))} />
        <NumberField label="높이" min={limits.min} max={limits.max} value={project.height} set={value => change(changeCanvasSide(project, 'height', value, limits))} />
      </div>
      <Toggle label="캔버스 비율 잠금" value={limits.ratioLocked} set={ratioLocked => change({canvasResize: {...limits, ratioLocked}})} />
      <div className="ratio-grid">{([['16:9', 1920, 1080], ['4:3', 1200, 900], ['1:1', 1080, 1080], ['3:4', 900, 1200]] as const).map(([label, width, height]) => {
        const size = presetCanvasSize({width, height}, limits);
        return <button key={label} className="button subtle" disabled={!size} onClick={() => size && change(size)}>{label}</button>;
      })}</div>
    </Section>
    <Section title="캔버스 크기 제한">
      <div className="fields-pair">
        <NumberField label="최소 변" min={canvasSizeLimits.min} max={Math.min(project.width, project.height)} value={limits.min}
          set={value => change({canvasResize: {...limits, min: Math.round(value)}})} />
        <NumberField label="최대 변" min={Math.max(project.width, project.height)} max={canvasSizeLimits.max} value={limits.max}
          set={value => change({canvasResize: {...limits, max: Math.round(value)}})} />
      </div>
      <p className="muted">너비와 높이에 같은 픽셀 한도를 적용합니다. 한도를 정할 때 현재 크기를 포함해야 합니다.</p>
    </Section>
    <Section title="배경">
      <Toggle label="투명 배경" value={project.transparent} set={transparent => change({transparent})} />
      {!project.transparent && <Color label="배경색" value={project.background} set={background => change({background}, 'background')} />}
      <div className="row-buttons"><button className="button subtle" onClick={() => chooseImage('canvas')}><ImagePlus />{project.backgroundImage ? '이미지 교체' : '배경 이미지'}</button>
        {project.backgroundImage && <button className="icon-button" aria-label="배경 이미지 제거" title="배경 이미지 제거" onClick={() => change({backgroundImage: ''})}><X /></button>}</div>
    </Section>
    <Section title="보조 도구">
      <Toggle label="격자 표시" value={project.grid} set={grid => change({grid})} />
      <Toggle label="정렬 가이드" value={project.guides} set={guides => change({guides})} />
      <Toggle label="스냅" value={project.snap} set={snap => change({snap})} />
    </Section>
    <Section title="기본 PNG 배율">
      <div className="segmented">{([1, 2, 4] as const).map(outputScale => <button key={outputScale} className={outputScale === project.outputScale ? 'chosen' : ''} onClick={() => change({outputScale})}>{outputScale}×</button>)}</div>
    </Section>
  </div>;

  const Icon = one ? kindIcons[one.kind] : Layers3;
  const number = (key: 'x' | 'y' | 'w' | 'h' | 'rotation' | 'fontSize' | 'tracking' | 'leading' | 'strokeWidth' | 'radius', label: string, min?: number, max?: number, step?: number) => one && <NumberField label={label} value={one[key]} min={min} max={max} step={step} set={value => {
    if (one.ratio && (key === 'w' || key === 'h')) {
      const factor = clamp(value / one[key], Math.max(1 / one.w, 1 / one.h), Math.min(16384 / one.w, 16384 / one.h));
      edit({w: round(one.w * factor), h: round(one.h * factor)});
    } else edit({[key]: value});
  }} />;
  const slider = (key: 'opacity' | 'blur' | 'brightness' | 'contrast' | 'saturation' | 'grayscale' | 'sepia' | 'cropZoom' | 'cropX' | 'cropY', label: string, max = 100, min = 0) =>
    <Slider label={label} min={min} max={max} value={selected[0][key]} set={value => edit({[key]: value}, key)} />;

  return <div className="inspector">
    <div className="inspector-heading"><span className="heading-icon"><Icon size={19} /></span><div><span className="panel-hint">{one ? kindNames[one.kind].toUpperCase() : 'SELECTION'}</span><h2>{one?.name ?? selected.length + '개 레이어'}</h2></div></div>
    <Section title="레이어">
      {one && <label className="field-stack"><span>이름</span><input key={one.id + one.name} aria-label="레이어 이름" defaultValue={one.name} maxLength={100} onBlur={event => {const name = event.target.value.trim(); if (name && name !== one.name) edit({name}); else event.target.value = one.name;}} onKeyDown={event => {if (event.key === 'Enter') event.currentTarget.blur();}} /></label>}
      <LayerCommands actions={actions} canGroup={selected.length > 1} grouped={group} />
    </Section>
    {one && <Section title="위치 및 크기">
      <div className="fields-pair">{number('x', 'X')}{number('y', 'Y')}{number('w', '너비', 1, 16384)}{number('h', '높이', 1, 16384)}</div>
      <div className="fields-pair align-center">{number('rotation', '회전 °', -360, 360)}<Toggle label="비율 유지" value={one.ratio} set={ratio => edit({ratio})} /></div>
    </Section>}
    {one?.kind === 'text' && <Section title="텍스트">
      <label className="field-stack"><span>내용</span><textarea aria-label="텍스트 내용" value={one.text} onChange={event => edit({text: event.target.value}, 'text')} rows={3} /></label>
      <label className="field-stack"><span>폰트</span><select aria-label="폰트" value={one.font} onChange={event => edit({font: event.target.value})}>
        {!fonts.includes(one.font) && !project.fonts.some(font => font.family === one.font) && <option>{one.font}</option>}
        {fonts.map(font => <option key={font}>{font}</option>)}{project.fonts.map(font => <option value={font.family} key={font.family}>{font.name}</option>)}
      </select></label>
      <button className="button subtle full" onClick={chooseFont}>로컬 폰트 추가</button>
      <div className="fields-pair">{number('fontSize', '크기', 1, 1024)}
        <label className="numeric"><span>굵기</span><select aria-label="굵기" value={one.weight} onChange={event => edit({weight: Number(event.target.value)})}>{[100, 200, 300, 400, 500, 600, 700, 800, 900].map(weight => <option key={weight}>{weight}</option>)}</select></label>
        {number('tracking', '자간', -40, 100, .1)}{number('leading', '행간', .5, 5, .05)}
      </div>
      <div className="segmented">{(['left', 'center', 'right'] as const).map((align, index) => <button key={align} className={one.align === align ? 'chosen' : ''} onClick={() => edit({align})}>{['왼쪽', '가운데', '오른쪽'][index]}</button>)}</div>
      <Color label="글자색" value={one.color} set={color => edit({color}, 'color')} />
      <Toggle label="세로쓰기" value={one.vertical} set={vertical => edit({vertical})} />
    </Section>}
    {one?.kind === 'image' && <>
      <Section title="이미지 및 자르기">
        <button className="button subtle full" onClick={() => chooseImage('replace')}><ImagePlus />이미지 교체</button>
        <label className="field-stack"><span>프레임 채우기</span><select value={one.fit} onChange={event => edit({fit: event.target.value as Layer['fit']})}><option value="cover">자르며 채우기</option><option value="contain">원본 전체 표시</option></select></label>
        {slider('cropZoom', '원본 확대', 500, 100)}{slider('cropX', '가로 위치')}{slider('cropY', '세로 위치')}
        <Toggle label="좌우 반전" value={one.flipX} set={flipX => edit({flipX})} /><Toggle label="상하 반전" value={one.flipY} set={flipY => edit({flipY})} />
        {number('radius', '모서리', 0, 2048)}
      </Section>
      <Section title="이미지 필터">
        {slider('blur', '블러', 40)}{slider('brightness', '밝기', 300)}{slider('contrast', '대비', 300)}
        {slider('saturation', '채도', 300)}{slider('grayscale', '흑백')}{slider('sepia', '세피아')}
        <button className="button subtle full" onClick={() => edit({blur: 0, brightness: 100, contrast: 100, saturation: 100, grayscale: 0, sepia: 0})}>필터 초기화</button>
      </Section>
    </>}
    {(one?.kind === 'svg' || one?.kind === 'frame') && <Section title="벡터">
      <button className="button subtle full" onClick={() => openCode(one, 'svg')}><CodeXml />SVG 코드 편집</button>
      <Toggle label="단색으로 변경" value={one.tint} set={tint => edit({tint})} />
      {one.tint && <Color label="색상" value={one.color} set={color => edit({color}, 'color')} />}
    </Section>}
    {one && ['rect', 'circle', 'line', 'background'].includes(one.kind) && <Section title="모양">
      <Color label="채우기" value={one.color} set={color => edit({color}, 'color')} />
      <Color label="테두리" value={one.stroke} set={stroke => edit({stroke}, 'stroke')} />
      <div className="fields-pair">{number('strokeWidth', '선 두께', 0, 100)}{one.kind !== 'circle' && number('radius', '모서리', 0, 2048)}</div>
    </Section>}
    {one?.kind === 'html' && <Section title="템플릿 편집 영역">
      {fields.length === 0 && <p className="muted">인식된 편집 영역이 없습니다.</p>}
      {fields.map(field => <div key={field.id} className="template-field">
        {field.type === 'text' && <label className="field-stack"><span>{field.label}</span><textarea aria-label={field.label} rows={2} value={field.value}
          onChange={event => edit({fields: {...one.fields, [field.id]: event.target.value}}, field.id)} /></label>}
        {field.type === 'background' && <Color label={field.label} value={/^#[\da-f]{6}$/i.test(field.value) ? field.value : '#e5dfcd'}
          set={value => edit({fields: {...one.fields, [field.id]: value}}, field.id)} />}
        {field.type !== 'text' && <button className="button subtle full" onClick={() => chooseImage('field:' + field.id)}><ImagePlus />{field.label} 이미지 선택</button>}
        {Object.hasOwn(one.fields, field.id) && <button className="text-button" onClick={() => {const values = {...one.fields}; delete values[field.id]; edit({fields: values});}}>원래 {field.label} 복원</button>}
      </div>)}
      <button className="button subtle full" onClick={() => openCode(one)}><CodeXml />HTML / CSS 편집</button>
    </Section>}
    <Section title="모양 효과">
      {slider('opacity', '투명도')}
      <label className="field-stack"><span>블렌드 모드</span><select aria-label="블렌드 모드" value={selected[0].blend} onChange={event => edit({blend: event.target.value as Layer['blend']})}>{blendModes.map(mode => <option key={mode} value={mode}>{mode}</option>)}</select></label>
      <Toggle label="그림자" value={selected[0].shadow} set={shadow => edit({shadow})} />
      {one && <button className="button subtle full" onClick={() => openCode(one, 'mask')}><BoxSelect />{one.mask ? 'SVG 마스크 수정' : 'SVG 마스크 / 클리핑'}</button>}
    </Section>
    </div>;
}


