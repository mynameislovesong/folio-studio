import {useState} from 'react';
import {ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Circle, CodeXml, Copy, Eye, EyeOff, Frame, GripVertical, Group, Image as ImageIcon, Layers3, LockKeyhole, LockKeyholeOpen, Minus, Palette, Shapes, Square, Trash2, Type, Ungroup} from 'lucide-react';
import {kinds, kindNames, layerUnit} from './model';
import type {Kind, Layer, LayerPatch, Project} from './model';

export const kindIcons = {text: Type, image: ImageIcon, svg: Shapes, rect: Square, circle: Circle, line: Minus, background: Palette, html: CodeXml, frame: Frame};
export const orderActions = [
  ['front', '맨 앞으로', ArrowUpToLine], ['forward', '한 단계 앞으로', ArrowUp],
  ['backward', '한 단계 뒤로', ArrowDown], ['back', '맨 뒤로', ArrowDownToLine],
] as const;

export interface LayerActions {
  duplicate: () => void;
  remove: () => void;
  group: () => void;
  ungroup: () => void;
  order: (target: string) => void;
}

export function LayerCommands({actions, canGroup, grouped}: {actions: LayerActions; canGroup: boolean; grouped: boolean}) {
  return <div className="layer-actions">
    <div className="action-cluster">{orderActions.map(([value, label, Icon]) => <button className="icon-button" key={value} title={label} aria-label={label} onClick={() => actions.order(value)}><Icon /></button>)}</div>
    <div className="action-cluster">
      <button className="icon-button" title="복제 (Ctrl+D)" aria-label="레이어 복제" onClick={actions.duplicate}><Copy /></button>
      <button className="icon-button" title="그룹화 (Ctrl+G)" aria-label="그룹화" onClick={actions.group} disabled={!canGroup}><Group /></button>
      <button className="icon-button" title="그룹 해제 (Ctrl+Shift+G)" aria-label="그룹 해제" onClick={actions.ungroup} disabled={!grouped}><Ungroup /></button>
      <button className="icon-button danger" title="삭제 (Delete / Backspace)" aria-label="레이어 삭제" onClick={actions.remove}><Trash2 /></button>
    </div>
  </div>;
}

interface Props {
  project: Project;
  selection: string[];
  select: (ids: string[]) => void;
  add: (kind: Kind) => void;
  patch: (ids: string[], patch: LayerPatch) => void;
  reorder: (ids: string[], target: string) => void;
  removeLayer: (id: string) => void;
  removeAllLayers: () => void;
}

export function LayerPanel({project, selection, select, add, patch, reorder, removeLayer, removeAllLayers}: Props) {
  const [drag, setDrag] = useState<{id: string; target: string}>();
  function selectRow(layer: Layer, multi: boolean, alt: boolean) {
    if (layer.locked) return;
    const ids = (alt ? [layer] : layerUnit(project, layer)).filter(item => !item.locked).map(item => item.id);
    select(multi ? ids.every(id => selection.includes(id)) ? selection.filter(id => !ids.includes(id)) : [...new Set([...selection, ...ids])] : ids);
  }
  return <div className="layer-panel">
    <section className="element-panel">
      <div className="panel-title"><span>요소 추가</span><span className="panel-hint">ELEMENTS</span></div>
      <div className="element-tiles">
        {kinds.map(kind => {
          const Icon = kindIcons[kind];
          return <button key={kind} onClick={() => add(kind)} title={kindNames[kind] + ' 추가'} aria-label={kindNames[kind] + ' 추가'}><Icon /><span>{kindNames[kind]}</span></button>;
        })}
      </div>
    </section>
    <section className="layers-section">
      <div className="panel-title">
        <span title="앞에서 뒤 순서"><Layers3 />레이어 <small className="count">{project.layers.length}</small></span>
        <button className="delete-all-layers" disabled={!project.layers.some(layer => !layer.locked)}
          onClick={removeAllLayers}>모든 레이어 삭제</button>
      </div>
      <div className="layer-list">
        {project.layers.length === 0 && <p className="empty-panel">레이어가 없습니다</p>}
        {project.layers.map((layer, index) => {
          const Icon = kindIcons[layer.kind];
          const grouped = layer.group && layer.group !== project.layers[index - 1]?.group;
          const unit = layerUnit(project, layer);
          return <div key={layer.id}>
            {grouped && <button className="group-row" title="그룹 전체 선택" onClick={() => select(unit.filter(item => !item.locked).map(item => item.id))}>
              <Group size={14} />{project.groups[layer.group] ?? '그룹'} <small>{unit.length}</small>
            </button>}
            <div className={'layer-row' + (selection.includes(layer.id) ? ' selected' : '') + (!layer.visible ? ' dimmed' : '') + (layer.group ? ' indented' : '') + (drag?.target === layer.id && drag?.id !== layer.id ? ' drag-target' : '')}
              data-testid="layer-row" data-layer-name={layer.name}
              draggable={!layer.locked}
              onDragStart={event => {setDrag({id: layer.id, target: ''}); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/folio-layer', layer.id);}}
              onDragOver={event => {if (event.dataTransfer.types.includes('text/folio-layer')) {event.preventDefault(); setDrag(previous => previous ? {...previous, target: layer.id} : previous);}}}
              onDrop={event => {
                const id = event.dataTransfer.getData('text/folio-layer');
                if (!id) return;
                event.preventDefault();
                if (id !== layer.id) reorder(selection.includes(id) ? selection : [id], layer.id);
                setDrag(undefined);
              }}
              onDragEnd={() => setDrag(undefined)}>
              <span className="grip" aria-hidden><GripVertical size={13} /></span>
              <button className="layer-label" onClick={event => selectRow(layer, event.shiftKey || event.ctrlKey || event.metaKey, event.altKey)}
                aria-pressed={selection.includes(layer.id)} disabled={layer.locked} title={layer.name}>
                <span className={'layer-glyph glyph-' + layer.kind}><Icon size={15} /></span><span>{layer.name}</span>
              </button>
              <button className="row-icon" aria-label={layer.name + (layer.visible ? ' 숨기기' : ' 표시')} title={layer.visible ? '숨기기' : '표시'} onClick={() => patch([layer.id], {visible: !layer.visible})}>{layer.visible ? <Eye /> : <EyeOff />}</button>
              <button className="row-icon" aria-label={layer.name + (layer.locked ? ' 잠금 해제' : ' 잠그기')} title={layer.locked ? '잠금 해제' : '잠그기'} onClick={() => {patch([layer.id], {locked: !layer.locked}); if (!layer.locked) select(selection.filter(id => id !== layer.id));}}>{layer.locked ? <LockKeyhole /> : <LockKeyholeOpen />}</button>
              <button className="row-icon row-delete" aria-label={layer.name + ' 레이어 삭제'} title={layer.locked ? '잠긴 레이어' : '레이어 삭제'}
                disabled={layer.locked} onClick={() => removeLayer(layer.id)}><Trash2 /></button>
            </div>
          </div>;
        })}
      </div>
    </section>
  </div>;
}
