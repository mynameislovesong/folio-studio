import {makeLayer, newProject} from './model';
import type {LayerPatch} from './model';

const portrait = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 540">
<defs>
 <linearGradient id="sky" x2=".9" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#384f50"/><stop offset="1" stop-color="#192c35"/></linearGradient>
 <linearGradient id="skin" x2="1" y2=".8" gradientUnits="objectBoundingBox"><stop stop-color="#e3c8a5"/><stop offset="1" stop-color="#94796b"/></linearGradient>
 <pattern id="dots" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".62" fill="#a0b9ac" opacity=".27"/></pattern>
 <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 0L5 5" stroke="#8daca9" stroke-opacity=".24" stroke-width=".7"/></pattern>
 <pattern id="cloth" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 2H9M0 6H9" stroke="#aec0af" stroke-opacity=".16" stroke-width=".55"/></pattern>
 <clipPath id="outline"><path d="M0 0H500V540H0z"/></clipPath>
</defs>
<path fill="url(#sky)" d="M0 0H500V540H0z"/><path fill="url(#dots)" d="M0 0H500V540H0z"/>
<g clip-path="url(#outline)">
 <g fill="none" stroke="#9aada4" opacity=".44">
 <circle cx="252" cy="253" r="190"/><circle cx="252" cy="253" r="177" stroke-dasharray="2 4"/>
 <path d="M252 30V475M30 253H473M55 96L453 410M61 402L446 106" stroke-dasharray="3 5"/>
 <path d="M27 55V27H55M445 27H473V55M27 485V513H55M445 513H473V485"/>
 <path d="M67 119H152M67 126H107M67 133H119M408 350H459M424 357H459M439 364H459"/>
 </g>
 <path fill="#d3b783" opacity=".8" d="M339 69a76 76 0 0 1 70 115 88 88 0 0 0-70-115Z"/>
 <path fill="#8b9b8d" opacity=".4" d="M0 451L67 382 112 397 143 371 198 427 233 410 280 441 347 405 374 430 430 380 500 406V540H0Z"/>
 <path fill="#12262d" stroke="#14232b" stroke-width="5" d="M55 540l22-69q15-26 44-39l62-33 16-50 106-8 17 49 71 32q27 13 42 42l29 76z"/>
 <path fill="#23383d" stroke="#13232b" stroke-width="4" d="M68 540l20-60q11-28 41-42l59-28 25 42 44-13 60-40 75 35q30 18 41 48l19 58Z"/>
 <path fill="url(#cloth)" d="M68 540l20-60q11-28 41-42l59-28 25 42 44-13 60-40 75 35q30 18 41 48l19 58Z"/>
 <path fill="#bd9d82" stroke="#263039" stroke-width="4" d="M219 309l-6 73-23 30 45 34 30-6 51-40-22-24-4-71z"/>
 <path fill="#806759" d="M221 333l69-16 4 53-18 23-37 3-24-19z"/>
 <path fill="#16292f" stroke="#718983" stroke-width="2" d="M187 390l53 32 23 47-29 71h-57l12-63-27-30zM314 377l-57 43-13 40 36 80h49l-13-61 22-42z"/>
 <path fill="none" stroke="#c3ac79" stroke-width="1.4" opacity=".7" d="M180 452l24 22-10 59m137-84-29 30 9 50M104 487l21-31 42-18m208 12 31 20 24 62"/>
 <path fill="#182b33" stroke="#111e25" stroke-width="5" d="M166 186q-10-48 39-84l44-20 52 8 45 27 22 48-12 72-17 47-34 45-108-18-24-45z"/>
 <path fill="url(#skin)" stroke="#272b32" stroke-width="4" d="M190 185l35-47 72-12 42 48 2 57-15 64-27 42-35 17-29-7-30-22-18-37-12-57z"/>
 <path fill="#af8d77" stroke="#312f35" stroke-width="2.4" d="M184 225q-22-13-20 13l8 30 17 7m150-49q23-13 20 11l-9 28-17 5"/>
 <path fill="#806759" opacity=".65" d="M309 148l32 36-1 55-14 55-27 43-35 17-27-9 40-16 27-38 9-46-15-32z"/>
 <path fill="#dfc3a0" opacity=".5" d="M231 169l58-22-21 52-17 43-9 49-20 9-15-44z"/>
 <path fill="none" stroke="#604f4c" stroke-width="2" d="M263 227l-13 42 11 5 12-5M241 301l23-4 17 4-15 5-17-1M221 285l12 3m68-9-13 6"/>
 <path fill="#313134" d="M200 217l9-8 22 2 10 8-29-2zm78 0 11-9 24-1 13 8-20-1z"/>
 <path fill="#e6d5b8" stroke="#403638" stroke-width="1.6" d="M203 230q16-11 34 1-18 8-34-1zm77 0q15-12 36-3-13 12-36 3z"/>
 <circle fill="#3e5851" cx="221" cy="230" r="5"/><circle fill="#3e5851" cx="298" cy="229" r="5"/><circle fill="#e9dfcb" cx="222" cy="229" r="1.3"/><circle fill="#e9dfcb" cx="299" cy="228" r="1.3"/>
 <path fill="#1a2e35" stroke="#17242a" stroke-width="3" d="M175 249l-13-31-6-44 15-40 35-37 49-19 44 7 43 24 25 41-1 45-20 50-12 8 4-43-9-38-31-31-25 20-33 14-31 5-22 28-4 41z"/>
 <path fill="url(#hatch)" d="M160 197l-4-23 15-40 35-37 49-19 44 7 43 24 25 41-1 45-19 47-5-57-24-42-22-14-23 20-54 20-28 14-13 31z"/>
 <g fill="none" stroke="#6c8682" opacity=".55" stroke-width="1.3">
 <path d="M169 174q24-68 114-72m-112 90q21-52 86-73m-60 45q43-10 88-50m-62 32q31-15 47-28m38-14q48 28 45 83m-44-63q32 23 35 55m-39-39q27 22 32 45"/>
 </g>
 <path fill="none" stroke="#cdb58b" stroke-width="2" d="M178 264q-9 13 0 22 9-2 6-11m151-7q11 5 7 15-7 3-10-6"/>
 <path fill="#bda976" d="M359 474h35v5h-35zm3 9h29v2h-29zm7 11h15l-7 10z"/>
</g>
<g fill="#cfdbca" font-family="monospace" font-size="10" letter-spacing="2"><text x="40" y="47">SCAN 01</text><text x="372" y="493">EYES ONLY</text></g>
</svg>`;

const paperDetails = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 980">
<defs><pattern id="paper" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M1 1h1m2 2h1" stroke="#6a624b" opacity=".16" stroke-width=".65"/></pattern></defs>
<path fill="url(#paper)" d="M0 0H780V980H0z"/>
<path fill="none" stroke="#283b37" stroke-width="1.4" d="M49 79H731M49 240H731M49 859H731M49 928H731M570 271V827"/>
<path fill="none" stroke="#8b8b75" stroke-width=".9" d="M594 351H731m-137 85H731m-137 87H731m-137 88H731"/>
<path fill="#253c36" d="M49 52h12v12H49zM64 52h4v12h-4zM71 52h8v12h-8z"/>
<path stroke="#3c4e42" stroke-width="2" d="M635 743v53m5-53v53m7-53v53m4-53v53m3-53v53m5-53v53m6-53v53m3-53v53m5-53v53m7-53v53m7-53v53m4-53v53m3-53v53m7-53v53m3-53v53m5-53v53m7-53v53m4-53v53m6-53v53m4-53v53"/>
</svg>`;

function textLayer(name: string, text: string, x: number, y: number, w: number, h: number, patch: LayerPatch = {}) {
  return makeLayer('text', {name, text, x, y, w, h, color: '#23352f', font: 'Arial', ...patch});
}

export function exampleProject() {
  const project = {...newProject('나이트폴 아카이브'), width: 780, height: 980, background: '#e3dcc6'};
  const mini: LayerPatch = {font: 'Courier New', fontSize: 14, weight: 700, tracking: 1.5};
  project.layers = [
    textLayer('표지 제목', 'NIGHTFALL', 45, 95, 685, 130, {font: 'Georgia', fontSize: 103, leading: 1, weight: 700, tracking: -5}),
    textLayer('문서 분류', 'P E R S O N N E L   /   F I E L D   D O S S I E R', 49, 202, 682, 30, {font: 'Courier New', fontSize: 17, weight: 700}),
    textLayer('아카이브 표기', 'LUNAR DIVISION ARCHIVES', 94, 51, 400, 26, mini),
    textLayer('문서 번호', 'FILE  N° 024', 565, 51, 165, 26, {...mini, align: 'right'}),
    textLayer('요원 식별 코드', 'SUBJECT / 024', 594, 271, 150, 22, mini),
    textLayer('요원 이름', 'Mara\nVale', 591, 298, 158, 51, {font: 'Georgia', fontSize: 26, leading: .94, weight: 700}),
    textLayer('요원 정보', 'DIVISION\nReconnaissance\n\n\nLOCATION\nNorth Sector\n\n\nACCESS\nLevel 04\n\n\nSTATUS\nACTIVE', 594, 370, 147, 352, {font: 'Courier New', fontSize: 14, leading: 1.54, weight: 700}),
    textLayer('기밀 표기', 'CONFIDENTIAL', 49, 878, 320, 30, {...mini, fontSize: 22, color: '#88492e'}),
    textLayer('문서 하단 문구', 'LD—024  /  INTERNAL CIRCULATION ONLY', 352, 883, 378, 25, {...mini, fontSize: 11, align: 'right'}),
    makeLayer('svg', {name: '요원 초상화', svg: portrait, x: 49, y: 271, w: 500, h: 540}),
    textLayer('사진 캡션', 'FIG. 01  /  FIELD IDENTIFICATION', 49, 824, 500, 22, {...mini, fontSize: 11}),
    makeLayer('frame', {name: '문서 장식선', svg: paperDetails, x: 0, y: 0, w: 780, h: 980, locked: true}),
  ];
  return project;
}
