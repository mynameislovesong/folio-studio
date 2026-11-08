import {useEffect, useRef, useState} from 'react';
import {Check, ChevronDown, CloudOff, CodeXml, Download, FolderOpen, LayoutTemplate, PanelLeft, PanelRight, Redo2, ScanLine, Undo2} from 'lucide-react';
import {Canvas} from './Canvas';
import {checkSvg, svgSize} from './code';
import {CodeDialog, ExportDialog, LibraryDialog, templateProject} from './Dialogs';
import type {CodeTarget} from './Dialogs';
import {exampleProject} from './example';
import {Inspector} from './Inspector';
import {LayerPanel} from './LayerPanel';
import {addLayers, asDataUrl, duplicateLayers, groupLayers, kindNames, loadRaster, makeLayer, newProject, patchLayers, readProject, reorder, round, uid, ungroupLayers} from './model';
import type {FontAsset, Kind, Layer, LayerPatch, Project} from './model';
import {download, listProjects, listTemplates, removeProject, removeTemplate, saveProject, saveTemplate} from './storage';
import type {SavedProject, SavedTemplate} from './storage';

interface History {past: Project[]; project: Project; future: Project[]; key?: string; at?: number}
type Notice = {message: string; error?: boolean};
const ACTIVE_KEY = 'folio.active-project';
const messageOf = (reason: unknown) => reason instanceof Error ? reason.message : '작업을 완료하지 못했습니다.';
const acceptedRaster = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';
const focusedField = (target: EventTarget | null) => target instanceof Element && !!target.closest('input,textarea,select,[contenteditable=true]');
const activeProjectId = () => {try {return localStorage.getItem(ACTIVE_KEY);} catch {return null;}};
const dateSort = <T extends {updated: number}>(a: T, b: T) => b.updated - a.updated;

export default function App() {
  const [history, setHistory] = useState<History>();
  const current = useRef<History | undefined>(undefined);
  const [selection, setSelection] = useState<string[]>([]);
  const [canvasResizeMode, setCanvasResizeMode] = useState(false);
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saving');
  const [notice, setNotice] = useState<Notice>();
  const [dialog, setDialog] = useState<'library' | 'export' | CodeTarget>();
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  const [mobile, setMobile] = useState<'left' | 'canvas' | 'right'>('canvas');
  const imageInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const fontInput = useRef<HTMLInputElement>(null);
  const pendingImage = useRef<{projectId: string; destination: string; layerId?: string} | undefined>(undefined);
  const clipboard = useRef<{layers: Layer[]; fonts: FontAsset[]; marker: string} | undefined>(undefined);
  const project = history?.project;

  function setSnapshot(snapshot: History) {
    current.current = snapshot;
    setHistory(snapshot);
  }
  function reset(next: Project, close = true) {
    setSnapshot({past: [], project: next, future: []});
    setSelection([]);
    setCanvasResizeMode(false);
    if (close) setDialog(undefined);
  }
  function selectLayers(ids: string[]) {
    setSelection(ids);
    if (ids.length) setCanvasResizeMode(false);
  }
  function selectCanvas(active: boolean) {
    setCanvasResizeMode(active);
    if (active) setSelection([]);
  }
  function commit(update: Project | ((value: Project) => Project), key?: string) {
    const snapshot = current.current;
    if (!snapshot) return;
    const next = typeof update === 'function' ? update(snapshot.project) : update;
    if (next.id !== snapshot.project.id || next === snapshot.project) return;
    const now = Date.now();
    const merge = key && snapshot.key === key && now - (snapshot.at ?? 0) < 650;
    setSnapshot({past: merge ? snapshot.past : [...snapshot.past.slice(-39), snapshot.project], project: next, future: [], key, at: now});
  }
  function undo() {
    const snapshot = current.current;
    const previous = snapshot?.past.at(-1);
    if (!snapshot || !previous) return;
    setSnapshot({past: snapshot.past.slice(0, -1), project: previous, future: [snapshot.project, ...snapshot.future]});
    setSelection(ids => ids.filter(id => previous.layers.some(layer => layer.id === id && !layer.locked)));
  }
  function redo() {
    const snapshot = current.current;
    const next = snapshot?.future[0];
    if (!snapshot || !next) return;
    setSnapshot({past: [...snapshot.past, snapshot.project], project: next, future: snapshot.future.slice(1)});
    setSelection(ids => ids.filter(id => next.layers.some(layer => layer.id === id && !layer.locked)));
  }
  function tell(message: string, error = false) {setNotice({message, error});}
  function fail(reason: unknown) {tell(messageOf(reason), true);}

  useEffect(() => {
    let alive = true;
    Promise.all([listProjects(), listTemplates()]).then(([items, presets]) => {
      if (!alive) return;
      items.sort(dateSort);
      setProjects(items);
      setTemplates(presets.sort(dateSort));
      reset(items.find(item => item.id === activeProjectId())?.project ?? items[0]?.project ?? exampleProject());
    }).catch(() => {
      if (alive) {
        reset(exampleProject());
        tell('저장소를 열 수 없습니다. JSON 백업을 사용하세요.', true);
      }
    });
    return () => {alive = false;};
  }, []);

  useEffect(() => {
    if (!project) return;
    let alive = true;
    setSaveState('saving');
    try {localStorage.setItem(ACTIVE_KEY, project.id);} catch { /* IndexedDB remains the source of truth. */ }
    saveProject(project).then(() => {
      if (!alive) return;
      setSaveState('saved');
      setProjects(items => [{id: project.id, project, updated: Date.now()}, ...items.filter(item => item.id !== project.id)]);
    }).catch(() => {if (alive) setSaveState('error');});
    return () => {alive = false;};
  }, [project]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), 3400);
    return () => clearTimeout(timer);
  }, [notice]);

  function addWithSelection(layers: Layer[], fontsToAdd: FontAsset[] = []) {
    if (!layers.length) return;
    commit(value => {
      const result = addLayers(value, layers);
      const fontMap = new Map([...value.fonts, ...fontsToAdd].map(font => [font.family, font]));
      if (layers.some(layer => layer.group)) {
        result.groups = {...result.groups, ...Object.fromEntries(layers.filter(layer => layer.group).map(layer => [layer.group, '그룹']))};
      }
      return {...result, fonts: [...fontMap.values()]};
    });
    selectLayers(layers.map(layer => layer.id));
    setRight(true);
  }
  async function addFiles(files: File[], point?: {x: number; y: number}) {
    const value = current.current?.project;
    if (!value) return;
    const layers: Layer[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
        if (isSvg && file.size > 2_000_000) throw new Error('SVG 파일은 최대 2MB까지 지원됩니다.');
        const svg = isSvg ? await file.text() : '';
        const raster = isSvg ? {...svgSize(svg), src: ''} : await loadRaster(file);
        const scale = Math.min(1, value.width * .72 / raster.width, value.height * .72 / raster.height);
        const w = Math.max(1, round(raster.width * scale));
        const h = Math.max(1, round(raster.height * scale));
        const offset = layers.length * 22;
        layers.push(makeLayer(isSvg ? 'svg' : 'image', {
          src: raster.src, svg, name: file.name.replace(/\.[^.]+$/, '') || (isSvg ? 'SVG' : '붙여넣은 이미지'),
          w, h, x: round((point?.x ?? value.width / 2) - w / 2 + offset), y: round((point?.y ?? value.height / 2) - h / 2 + offset),
        }));
      } catch (reason) {errors.push(messageOf(reason));}
    }
    if (current.current?.project.id !== value.id) return;
    addWithSelection(layers);
    if (errors.length) tell(errors[0], true);
    else if (layers.length) tell(layers.length + '개 파일을 추가했습니다.');
  }
  function add(kind: Kind) {
    if (!project) return;
    if (kind === 'image') return chooseImage('add');
    if (kind === 'svg') return setDialog({mode: 'add-svg'});
    if (kind === 'html') return setDialog({mode: 'add-html'});
    const layer = makeLayer(kind);
    const w = kind === 'background' ? project.width : Math.min(project.width * .85, layer.w);
    const h = kind === 'background' ? project.height : Math.min(project.height * .85, layer.h);
    const shift = kind === 'background' ? 0 : (project.layers.length % 5 - 2) * Math.min(14, project.width / 15, project.height / 15);
    addWithSelection([{...layer, w, h, x: round((project.width - w) / 2 + shift), y: round((project.height - h) / 2 + shift)}]);
  }

  function chooseImage(destination: string) {
    if (!project) return;
    pendingImage.current = {projectId: project.id, destination, layerId: selection[0]};
    if (imageInput.current) {
      imageInput.current.accept = destination === 'add' ? acceptedRaster + ',.svg,image/svg+xml' : acceptedRaster;
      imageInput.current.multiple = destination === 'add';
      imageInput.current.click();
    }
  }
  async function pickedImage(files: File[]) {
    const intent = pendingImage.current;
    if (!intent || !files.length || current.current?.project.id !== intent.projectId) return;
    if (intent.destination === 'add') return addFiles(files);
    try {
      const {src} = await loadRaster(files[0]);
      if (current.current?.project.id !== intent.projectId) return;
      commit(value => {
        if (intent.destination === 'canvas') return {...value, backgroundImage: src};
        const layer = value.layers.find(item => item.id === intent.layerId && !item.locked);
        if (!layer) return value;
        return patchLayers(value, [layer.id], intent.destination === 'replace' ? {src} : {fields: {...layer.fields, [intent.destination.slice(6)]: src}});
      });
    } catch (reason) {fail(reason);}
  }
  async function pickedFont(file: File) {
    const id = current.current?.project.id;
    const selected = selection[0];
    try {
      const extension = file.name.toLowerCase().match(/\.(woff2?|ttf|otf)$/)?.[1];
      if (!extension || file.size > 12 * 1024 * 1024) throw new Error('12MB 이하 WOFF, WOFF2, TTF, OTF 파일을 선택하세요.');
      const family = 'Folio-' + uid();
      const src = await asDataUrl(new Blob([file], {type: 'font/' + extension}));
      await new FontFace(family, 'url("' + src + '")').load().catch(() => {throw new Error('폰트 파일을 해석할 수 없습니다.');});
      if (current.current?.project.id !== id) return;
      commit(value => {
        const patched = patchLayers(value, value.layers.filter(layer => layer.id === selected && !layer.locked).map(layer => layer.id), {font: family});
        return {...patched, fonts: [...value.fonts, {name: file.name.replace(/\.[^.]+$/, ''), family, src}]};
      });
      tell('로컬 폰트를 추가했습니다.');
    } catch (reason) {fail(reason);}
  }

  function chosen(value: Project) {return value.layers.filter(layer => selection.includes(layer.id) && !layer.locked);}
  function order(ids: string[], target: string) {
    commit(value => {
      const moving = value.layers.filter(layer => ids.includes(layer.id));
      if (moving.some(layer => layer.locked || (layer.group && value.layers.some(member => member.group === layer.group && member.locked)))) return value;
      return reorder(value, ids, target);
    });
  }
  const actions = {
    duplicate: () => {const value = current.current?.project; if (value) addWithSelection(duplicateLayers(value, chosen(value)));},
    remove: () => {
      commit(value => {
        const remove = new Set(chosen(value).map(layer => layer.id));
        return remove.size ? {...value, layers: value.layers.filter(layer => !remove.has(layer.id))} : value;
      });
      setSelection([]);
    },
    group: () => {
      const value = current.current?.project;
      if (!value) return;
      const next = groupLayers(value, selection);
      if (next !== value) {
        const group = next.layers.find(layer => selection.includes(layer.id))?.group;
        commit(next);
        setSelection(next.layers.filter(layer => layer.group === group).map(layer => layer.id));
      }
    },
    ungroup: () => commit(value => ungroupLayers(value, selection)),
    order: (target: string) => order(selection, target),
  };

  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (dialog || focusedField(event.target) || event.isComposing) return;
      const modifier = event.ctrlKey || event.metaKey;
      const pressed = event.key.toLowerCase();
      if (modifier && pressed === 'z') {event.preventDefault(); if (event.shiftKey) redo(); else undo();}
      if (modifier && pressed === 'y') {event.preventDefault(); redo();}
      if (modifier && pressed === 'd' && selection.length) {event.preventDefault(); actions.duplicate();}
      if (modifier && pressed === 'g' && selection.length) {event.preventDefault(); if (event.shiftKey) actions.ungroup(); else actions.group();}
      if (modifier && pressed === 'a' && project) {event.preventDefault(); selectLayers(project.layers.filter(layer => layer.visible && !layer.locked).map(layer => layer.id));}
      if (modifier && pressed === 's' && project) {event.preventDefault(); saveProject(project).then(() => tell('프로젝트를 저장했습니다.')).catch(fail);}
      if (pressed === 'delete' && selection.length) {event.preventDefault(); actions.remove();}
      if (pressed === 'escape') {setSelection([]); setCanvasResizeMode(false);}
      if (selection.length && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(pressed) && !modifier) {
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        const dx = pressed === 'arrowleft' ? -amount : pressed === 'arrowright' ? amount : 0;
        const dy = pressed === 'arrowup' ? -amount : pressed === 'arrowdown' ? amount : 0;
        commit(value => ({...value, layers: value.layers.map(layer => selection.includes(layer.id) && !layer.locked ? {...layer, x: layer.x + dx, y: layer.y + dy} : layer)}), 'nudge:' + selection.join(','));
      }
    }
    function copy(event: ClipboardEvent) {
      if (!project || dialog || focusedField(event.target)) return;
      const layers = chosen(project);
      if (!layers.length || !event.clipboardData) return;
      const marker = 'Folio Studio · ' + uid();
      clipboard.current = {layers, fonts: project.fonts, marker};
      event.clipboardData.setData('text/plain', marker);
      event.preventDefault();
    }
    function paste(event: ClipboardEvent) {
      if (!project || dialog || focusedField(event.target) || !event.clipboardData) return;
      const data = event.clipboardData;
      const files = Array.from(data.files).filter(file => /^image\//.test(file.type));
      if (!files.length) for (const item of data.items) {
        const file = item.kind === 'file' && /^image\//.test(item.type) ? item.getAsFile() : null;
        if (file) files.push(file);
      }
      if (files.length) {event.preventDefault(); void addFiles(files); return;}
      const copied = clipboard.current;
      if (copied && data.getData('text/plain') === copied.marker) {
        event.preventDefault();
        addWithSelection(duplicateLayers(project, copied.layers), copied.fonts);
      }
    }
    window.addEventListener('keydown', key);
    window.addEventListener('copy', copy);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('copy', copy);
      window.removeEventListener('paste', paste);
    };
  }, [project, selection, dialog]);

  function savePreset(name: string, value: Project) {
    const preset = {id: uid(), name, updated: Date.now(), project: value};
    saveTemplate(preset).then(() => {setTemplates(items => [preset, ...items]); tell('템플릿을 저장했습니다.');}).catch(fail);
  }
  async function deleteSaved(item: SavedProject) {
    if (!window.confirm('“' + item.project.name + '” 프로젝트를 삭제할까요?')) return;
    try {
      if (item.id === current.current?.project.id) reset(projects.find(saved => saved.id !== item.id)?.project ?? newProject(), false);
      await removeProject(item.id);
      setProjects(items => items.filter(saved => saved.id !== item.id));
      tell('프로젝트를 삭제했습니다.');
    } catch (reason) {fail(reason);}
  }
  async function deletePreset(item: SavedTemplate) {
    if (!window.confirm('“' + item.name + '” 템플릿을 삭제할까요?')) return;
    try {
      await removeTemplate(item.id);
      setTemplates(items => items.filter(saved => saved.id !== item.id));
      tell('템플릿을 삭제했습니다.');
    } catch (reason) {fail(reason);}
  }
  async function openJson(file: File) {
    try {
      if (file.size > 150 * 1024 * 1024) throw new Error('150MB 이하 JSON 파일을 선택하세요.');
      reset(readProject(JSON.parse(await file.text())));
      tell('프로젝트를 가져왔습니다.');
    } catch (reason) {fail(reason);}
  }
  function openCode(layer: Layer, tab?: 'svg' | 'mask') {setDialog({mode: 'edit', layer, tab: tab ?? 'html'});}

  if (!project || !history) return <main className="splash"><Logo /><p>편집기를 여는 중…</p></main>;
  const active = chosen(project);
  const codeLayer = active.length === 1 ? active[0] : undefined;
  const close = () => setDialog(undefined);
  return <div className="studio">
    <header className="app-header">
      <Logo />
      <div className="header-project">
        <div className="project-name"><input aria-label="프로젝트 이름" maxLength={100} key={project.id + project.name} defaultValue={project.name}
          onBlur={event => {
            const name = event.target.value.trim();
            if (name && name !== project.name) commit(value => ({...value, name}));
            else event.target.value = project.name;
          }} onKeyDown={event => {if (event.key === 'Enter') event.currentTarget.blur();}} />
          <button className="icon-button project-chevron" title="작업 보관함" aria-label="작업 보관함" onClick={() => setDialog('library')}><ChevronDown /></button>
        </div>
        <span className={'saved-state ' + saveState} title={saveState === 'error' ? 'IndexedDB에 저장할 수 없습니다. JSON 백업을 이용하세요.' : 'IndexedDB에 프로젝트를 저장합니다.'}>
          {saveState === 'saved' ? <Check /> : saveState === 'error' ? <CloudOff /> : <i />}
          {saveState === 'saved' ? '자동 저장됨' : saveState === 'error' ? '저장 실패' : '저장 중'}
        </span>
      </div>
      <div className="header-actions">
        <button className="button subtle library-button" onClick={() => setDialog('library')}><FolderOpen /><span>보관함</span></button>
        <button className="button primary" onClick={() => setDialog('export')}><Download /><span>PNG 내보내기</span></button>
      </div>
    </header>
    <div className="app-toolbar">
      <div className="toolbar-left">
        <button className={'icon-button desktop-panel' + (left ? ' active' : '')} title="요소 및 레이어 패널" aria-label="요소 및 레이어 패널" aria-pressed={left} onClick={() => setLeft(!left)}><PanelLeft /></button>
        <span className="tool-separator desktop-panel" />
        <button className="icon-button" title="실행 취소 (Ctrl+Z)" aria-label="실행 취소" disabled={!history.past.length} onClick={undo}><Undo2 /></button>
        <button className="icon-button" title="다시 실행 (Ctrl+Shift+Z)" aria-label="다시 실행" disabled={!history.future.length} onClick={redo}><Redo2 /></button>
      </div>
      <div className="toolbar-mode"><span className="workspace-dot" />{canvasResizeMode ? '캔버스 크기 조절' : '디자인 모드'}</div>
      <div className="toolbar-right">
        <button className="button quiet canvas-settings" title="캔버스 설정 및 크기 조절" aria-pressed={canvasResizeMode}
          onClick={() => {selectCanvas(!canvasResizeMode); setRight(true); setMobile('canvas');}}><ScanLine /><span>캔버스</span></button>
        <button className="button quiet" title="코드 모드" onClick={() => codeLayer?.kind === 'html' ? openCode(codeLayer) : codeLayer?.kind === 'svg' || codeLayer?.kind === 'frame' ? openCode(codeLayer, 'svg') : setDialog({mode: 'add-html'})}><CodeXml /><span>코드</span></button>
        <button className="button quiet import-button" onClick={() => setDialog({mode: 'template'})}><LayoutTemplate /><span>AI 템플릿 가져오기</span></button>
        <span className="tool-separator desktop-panel" />
        <button className={'icon-button desktop-panel' + (right ? ' active' : '')} title="속성 패널" aria-label="속성 패널" aria-pressed={right} onClick={() => setRight(!right)}><PanelRight /></button>
      </div>
    </div>
    <nav className="mobile-tabs" aria-label="작업 공간">{([['left', '요소 / 레이어'], ['canvas', '캔버스'], ['right', '속성']] as const).map(([value, label]) => <button key={value} className={mobile === value ? 'chosen' : ''} onClick={() => setMobile(value)}>{label}</button>)}</nav>
    <main className={'workspace show-' + mobile + (!left ? ' left-closed' : '') + (!right ? ' right-closed' : '')}>
      <aside className="left-panel" aria-label="요소 및 레이어"><LayerPanel project={project} selection={selection} select={selectLayers} add={add}
        patch={(ids, patch) => commit(value => patchLayers(value, ids, patch))} reorder={order} /></aside>
      <Canvas key={project.id} project={project} selection={selection} select={selectLayers} commit={commit} onFiles={addFiles}
        canvasResizeMode={canvasResizeMode} setCanvasResizeMode={selectCanvas}
        resizeCanvas={size => commit(value => ({...value, ...size}))} />
      <aside className="right-panel" aria-label="속성 패널"><Inspector key={selection.join(',') + project.id} project={project} selection={selection}
        change={(patch, key) => commit(value => ({...value, ...patch}), key)}
        edit={(patch, key) => commit(value => patchLayers(value, chosen(value).map(layer => layer.id), patch), key && selection.join(',') + ':' + key)}
        actions={actions} openCode={openCode} chooseImage={chooseImage} chooseFont={() => fontInput.current?.click()} /></aside>
    </main>
    <footer className="app-footer"><span><i />로컬 작업 공간</span><span>{project.layers.length}개 레이어{active.length > 0 ? ' · ' + active.length + '개 선택' : ''}</span><span className="footer-shortcuts">Shift + 클릭으로 다중 선택 <b>·</b> Ctrl + Z로 실행 취소</span></footer>
    <input ref={imageInput} type="file" hidden aria-label="이미지 파일 선택" onChange={event => {const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; void pickedImage(files);}} />
    <input ref={fontInput} type="file" hidden accept=".woff,.woff2,.ttf,.otf" aria-label="폰트 파일 선택" onChange={event => {const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void pickedFont(file);}} />
    <input ref={jsonInput} type="file" hidden accept=".json,application/json" aria-label="JSON 프로젝트 파일 선택" onChange={event => {const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void openJson(file);}} />
    {dialog === 'library' && <LibraryDialog current={project.id} projects={projects} templates={templates} close={close}
      open={value => value.id === project.id ? close() : reset(value)} create={() => reset(newProject())}
      copy={value => reset({...value, id: uid(), name: value.name + ' 복제'})} remove={deleteSaved}
      apply={item => reset({...item.project, id: uid(), name: item.name})} removePreset={deletePreset}
      save={() => savePreset(project.name, project)} importFile={() => jsonInput.current?.click()}
      exportFile={() => download(new Blob([JSON.stringify(project, null, 2)], {type: 'application/json'}), project.name + '.json')} />}
    {dialog === 'export' && <ExportDialog project={project} close={close} />}
    {dialog && typeof dialog !== 'string' && <CodeDialog project={project} target={dialog} close={close}
      apply={(layers, patch) => {
        if (dialog.mode === 'edit') commit(value => patchLayers(value, [dialog.layer.id], patch));
        else addWithSelection(layers.map(layer => ({...layer, id: uid(),
          x: round((project.width - layer.w) / 2), y: round((project.height - layer.h) / 2)})));
        close();
        tell(dialog.mode === 'edit' ? '코드 변경을 적용했습니다.' : dialog.mode === 'template' ? '템플릿을 적용했습니다.' : '레이어를 추가했습니다.');
      }} save={(name, layers) => savePreset(name, templateProject(project, name, layers.map(layer => ({...layer, id: uid()}))))} />}
    {notice && <div role="status" className={'toast' + (notice.error ? ' toast-error' : '')}>{notice.error ? <CloudOff /> : <Check />}{notice.message}</div>}
  </div>;
}

function Logo() {
  return <div className="brand"><span className="brand-icon" aria-hidden><svg viewBox="0 0 32 32" fill="none"><path d="M7.5 23.8 12.4 7.7h13.1l-1.2 4H15.2l-.9 3h7.4l-1.2 4h-7.4l-1.5 5.1H7.5Z" fill="currentColor"/><path d="M21.8 23.8h3.9" stroke="currentColor" strokeWidth="1.7"/></svg></span><span>folio<span className="brand-sub">STUDIO</span></span></div>;
}

