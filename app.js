const STORAGE_KEY = 'abstellplan_state_v2';
const SHOW_BLOCK_TIME = true; // Zeit-Badge im Balken anzeigen?
const ENABLE_CONFLICT_SHADE = false; // rote Schraffur bei Überlappungen
const SCROLL_SYNC_ENABLED = true; // Header <-> Tracks synchronisieren
// Stapelmodus: Layout-Konstanten (müssen zu styles.css passen)
const BLOCK_HEIGHT = 42; // .block { height: 42px; }
const V_GAP = 6; // vertikaler Abstand
const TOP_PADDING = 12; // Innenabstand oben/unten in der Spur

// Zustand
let state = {
  time: { start: '06:00', end: '22:00', pxPerMin: 3 },
  tracks: [
    { id: uid(), name: 'Gleis 1', length: 300 },
    { id: uid(), name: 'Gleis 2', length: 250 },
    { id: uid(), name: 'Gleis 3', length: 180 }
  ],
  trains: [
    { id: uid(), name: 'Talent 2 (3tlg)', length: 160, color: '#2e86de' },
    { id: uid(), name: 'Desiro ML (4tlg)', length: 220, color: '#10b981' },
    { id: uid(), name: 'Railjet (7tlg)', length: 205, color: '#ef4444' }
  ],
  blocks: [] // { id, trackId, trainId, startMin, endMin }
};

// Utilities
function uid(){ return 'id-' + Math.random().toString(36).slice(2,10); }
function toMinutes(hhmm){ const [h,m]=hhmm.split(':').map(Number); return h*60+m; }
function toHHMM(min){ const h=Math.floor(min/60), m=min%60; return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'); }
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadState(){ try{ const raw=localStorage.getItem(STORAGE_KEY); if(raw) state=JSON.parse(raw);}catch(e){ console.warn('Konnte Zustand nicht laden:',e);} }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function intervalsOverlap(aStart,aEnd,bStart,bEnd){ return Math.max(aStart,bStart) < Math.min(aEnd,bEnd); }
function blockOverlapsWindow(b){
  const startW = toMinutes(state.time.start);
  const endW = toMinutes(state.time.end);
  return intervalsOverlap(b.startMin,b.endMin,startW,endW);
}
function assignStacks(blocks) {
  const sorted = [...blocks].sort((a,b)=> a.startMin - b.startMin || a.endMin - b.endMin);
  const laneEnd = [];
  const laneById = new Map();
  for (const b of sorted){
    let lane = 0;
    while (lane < laneEnd.length && laneEnd[lane] > b.startMin) lane++;
    laneById.set(b.id, lane);
    laneEnd[lane] = b.endMin;
  }
  return { laneById, laneCount: laneEnd.length || 1 };
}

// DOM
const startTimeEl = document.getElementById('startTime');
const endTimeEl = document.getElementById('endTime');
const pxPerMinEl = document.getElementById('pxPerMin');
const btnApplyTime = document.getElementById('btnApplyTime');
const timelineHeader = document.getElementById('timelineHeader');
const tracksView = document.getElementById('tracksView');
const trackForm = document.getElementById('trackForm');
const trackNameEl = document.getElementById('trackName');
const trackLengthEl = document.getElementById('trackLength');
const trackListEl = document.getElementById('trackList');
const trainForm = document.getElementById('trainForm');
const trainNameEl = document.getElementById('trainName');
const trainLengthEl = document.getElementById('trainLength');
const trainColorEl = document.getElementById('trainColor');
const trainListEl = document.getElementById('trainList');
const selectionPanel = document.getElementById('selectionPanel');
const btnExport = document.getElementById('btnExport');
const fileImport = document.getElementById('fileImport');
const btnReset = document.getElementById('btnReset');
const blockDialog = document.getElementById('blockDialog');
const blockForm = document.getElementById('blockForm');
const blockTrainSelect = document.getElementById('blockTrain');
const blockStartEl = document.getElementById('blockStart');
const blockEndEl = document.getElementById('blockEnd');

// 🔎 Suche
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');

// Init
loadState();
if (SCROLL_SYNC_ENABLED) setupScrollSync();
renderAll();

// Events
btnApplyTime.addEventListener('click', () => {
  state.time.start = startTimeEl.value;
  state.time.end = endTimeEl.value;
  state.time.pxPerMin = Number(pxPerMinEl.value);
  saveState();
  const oldScroll = tracksView.scrollLeft;
  renderTimelineHeader();
  renderTracks();
  renderTrainsList();
  timelineHeader.scrollLeft = tracksView.scrollLeft = oldScroll;
});

trackForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = trackNameEl.value.trim();
  const length = Number(trackLengthEl.value);
  if (!name || !length) return;
  state.tracks.push({ id: uid(), name, length });
  trackNameEl.value = ''; trackLengthEl.value = '';
  saveState();
  renderTracksList();
  renderTracks();
});

trainForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = trainNameEl.value.trim();
  const length = Number(trainLengthEl.value);
  const color = trainColorEl.value;
  if (!name || !length) return;
  state.trains.push({ id: uid(), name, length, color });
  trainNameEl.value = ''; trainLengthEl.value = '';
  saveState();
  renderTrainsList();
});

btnExport.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='abstellplan.json'; a.click();
  setTimeout(()=> URL.revokeObjectURL(url), 500);
});

fileImport.addEventListener('change', (e) => {
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{ try{ const data=JSON.parse(reader.result); state=data; saveState(); renderAll(); }catch(err){ alert('Ungültige Datei: '+err.message);} };
  reader.readAsText(file);
});

btnReset.addEventListener('click', () => {
  if (!confirm('Wirklich alles zurücksetzen?')) return;
  localStorage.removeItem(STORAGE_KEY);
  state={ time:{start:'06:00',end:'22:00',pxPerMin:3}, tracks:[], trains:[], blocks:[] };
  renderAll();
});

// Suche
searchBtn?.addEventListener('click', runSearch);
searchInput?.addEventListener('keydown', (e) => { if (e.key==='Enter') runSearch(); });
searchInput?.addEventListener('input', () => { // Live-Hinweis
  if (!searchInput.value.trim()) clearHighlights();
});

// Rendering
function renderAll(){
  startTimeEl.value = state.time.start;
  endTimeEl.value = state.time.end;
  pxPerMinEl.value = state.time.pxPerMin;
  const oldScroll = tracksView.scrollLeft;
  renderTimelineHeader();
  renderTracksList();
  renderTrainsList();
  renderTracks();
  timelineHeader.scrollLeft = tracksView.scrollLeft = oldScroll;
}

function renderTimelineHeader(){
  timelineHeader.innerHTML = '';
  const startMin = toMinutes(state.time.start);
  const endMin = toMinutes(state.time.end);
  const totalMin = endMin - startMin;
  const totalWidth = totalMin * state.time.pxPerMin;
  timelineHeader.style.width = totalWidth + 'px';
  timelineHeader.style.minWidth = totalWidth + 'px';
  const firstTickMin = Math.ceil(startMin / 60) * 60;
  for (let m = firstTickMin; m < endMin; m += 60){
    const h = Math.floor(m / 60);
    const tick = document.createElement('div');
    tick.className = 'timeTick';
    tick.style.width = (60 * state.time.pxPerMin) + 'px';
    tick.textContent = String(h).padStart(2,'0') + ':00';
    timelineHeader.appendChild(tick);
  }
}

function renderTracksList(){
  trackListEl.innerHTML = '';
  state.tracks.forEach(track => {
    const li = document.createElement('li');
    li.className='trainItem';
    li.innerHTML = `<div><strong>${track.name}</strong> <span class="meta">(${track.length} m)</span></div>`;
    const del = document.createElement('button'); del.className='smallBtn'; del.textContent='Entfernen';
    del.addEventListener('click', () => {
      state.blocks = state.blocks.filter(b => b.trackId !== track.id);
      state.tracks = state.tracks.filter(t => t.id !== track.id);
      saveState();
      renderTracksList();
      renderTracks();
    });
    li.appendChild(del);
    trackListEl.appendChild(li);
  });
}

function renderTrainsList(){
  trainListEl.innerHTML = '';
  state.trains.forEach(train => {
    const li = document.createElement('li');
    li.className='trainItem';
    const dot = document.createElement('span'); dot.className='colorDot'; dot.style.background=train.color;
    const label = document.createElement('div'); label.textContent = `${train.name} – ${train.length} m`;
    const del = document.createElement('button'); del.className='smallBtn'; del.textContent='Entfernen';
    del.addEventListener('click', () => {
      state.blocks = state.blocks.filter(b => b.trainId !== train.id);
      state.trains = state.trains.filter(t => t.id !== train.id);
      saveState();
      renderTrainsList();
      renderTracks();
    });
    li.appendChild(dot); li.appendChild(label); li.appendChild(del);
    const _isUsed = state.blocks.some(b => b.trainId === train.id && blockOverlapsWindow(b));
    if (_isUsed) li.classList.add('assigned');
    trainListEl.appendChild(li);
  });
}

function renderTracks(){
  tracksView.innerHTML = '';
  const startMin = toMinutes(state.time.start);
  const endMin = toMinutes(state.time.end);
  const totalMin = endMin - startMin;
  const totalWidth = totalMin * state.time.pxPerMin;
  const oldScroll = tracksView.scrollLeft;
  state.tracks.forEach(track => {
    const row = document.createElement('div');
    row.className = 'trackRow';
    const label = document.createElement('div');
    label.className = 'trackLabel';
    label.innerHTML = `
      <h3>${track.name}</h3>
      <div class="meta">Länge: ${track.length} m</div>
      <div class="trackTools">
        <button class="smallBtn" data-track="${track.id}">Belegung hinzufügen</button>
      </div>`;
    row.appendChild(label);
    const lane = document.createElement('div');
    lane.className = 'trackLane';
    lane.style.width = totalWidth + 'px';
    lane.style.minWidth = totalWidth + 'px';
    label.querySelector('button').addEventListener('click', () => openBlockDialog(track.id));
    lane.addEventListener('dblclick', () => openBlockDialog(track.id));

    const blocks = state.blocks.filter(b => b.trackId === track.id);
    const { laneById, laneCount } = assignStacks(blocks);
    const laneHeight = TOP_PADDING*2 + laneCount*BLOCK_HEIGHT + (laneCount-1)*V_GAP;
    lane.style.height = laneHeight + 'px';
    row.style.minHeight = Math.max(72, laneHeight) + 'px';

    blocks.forEach(b => {
      const train = state.trains.find(t => t.id === b.trainId);
      const left = (b.startMin - startMin) * state.time.pxPerMin;
      const width = (b.endMin - b.startMin) * state.time.pxPerMin;
      const laneIdx = laneById.get(b.id) ?? 0;
      const block = document.createElement('div');
      block.className = 'block';
      block.dataset.blockId = b.id; // ← wichtig für Suche
      block.style.left = left + 'px';
      block.style.width = Math.max(24, width) + 'px';
      const topPx = TOP_PADDING + laneIdx * (BLOCK_HEIGHT + V_GAP);
      block.style.top = topPx + 'px';
      block.style.background = train ? train.color : '#6b7280';
      block.title = `${train ? train.name : 'Unbekannt'}  ${toHHMM(b.startMin)}–${toHHMM(b.endMin)}`;
      const lbl = document.createElement('span');
      lbl.className = 'blockLabel';
      lbl.textContent = `${train ? train.name : '(Garnitur)'} – ${train ? train.length : '?'} m`;
      block.appendChild(lbl);
      if (SHOW_BLOCK_TIME) {
        const meta = document.createElement('span');
        meta.className = 'blockMeta';
        meta.textContent = `${toHHMM(b.startMin)}–${toHHMM(b.endMin)}`;
        block.appendChild(meta);
      }
      if (train && train.length > track.length) block.classList.add('invalid');
      if (ENABLE_CONFLICT_SHADE) {
        const conflicts = blocks.filter(o => o.id !== b.id && intervalsOverlap(b.startMin,b.endMin,o.startMin,o.endMin));
        if (conflicts.length > 0) block.classList.add('conflict');
      }
      block.addEventListener('click', () => selectBlock(b));
      enableDrag(block, b, startMin, endMin);
      lane.appendChild(block);
    });

    row.appendChild(lane);
    tracksView.appendChild(row);
  });
  tracksView.scrollLeft = oldScroll;
  if (SCROLL_SYNC_ENABLED) timelineHeader.scrollLeft = tracksView.scrollLeft;
}

// Dialog: Neue Abstellung anlegen
function openBlockDialog(trackId){
  blockTrainSelect.innerHTML = '';
  if (state.trains.length === 0) { alert('Bitte zuerst eine Zuggarnitur anlegen.'); return; }
  const usedIds = new Set(state.blocks.filter(b => blockOverlapsWindow(b)).map(b => b.trainId));
  const available = state.trains.filter(t => !usedIds.has(t.id));
  if (available.length === 0) { alert('Alle Zuggarnituren sind im aktuellen Zeitfenster bereits verplant.'); return; }
  available.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id; opt.textContent = `${t.name} (${t.length} m)`;
    blockTrainSelect.appendChild(opt);
  });
  blockStartEl.value = state.time.start;
  blockEndEl.value = state.time.end;
  blockDialog.returnValue = '';
  blockDialog.showModal();
  const onSave = (ev) => {
    ev.preventDefault();
    const trainId = blockTrainSelect.value;
    const startMin = toMinutes(blockStartEl.value);
    const endMin = toMinutes(blockEndEl.value);
    const startW = toMinutes(state.time.start);
    const endW = toMinutes(state.time.end);
    if (endMin <= startMin) { alert('Ende muss nach Start liegen.'); return; }
    if (startMin < startW || endMin > endW) { alert('Zeiten liegen außerhalb des Zeithorizonts.'); return; }
    state.blocks.push({ id: uid(), trackId, trainId, startMin, endMin });
    saveState();
    blockDialog.close();
    renderTracks();
  };
  const onCancel = () => {
    blockDialog.close();
    blockForm.removeEventListener('submit', onSave);
  };
  blockForm.addEventListener('submit', onSave, { once:true });
  blockDialog.addEventListener('close', onCancel, { once:true });
}

// Auswahl / Bearbeitung
function selectBlock(b){
  const train = state.trains.find(t => t.id === b.trainId);
  const track = state.tracks.find(t => t.id === b.trackId);
  selectionPanel.innerHTML = '';
  const wrap = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = 'Ausgewählte Abstellung';
  title.style.margin = '6px 0';
  wrap.appendChild(title);
  const info = document.createElement('p');
  info.innerHTML = `<strong>Gleis:</strong> ${track?track.name:'?'} (${track?track.length:'?'} m)<br/>
<strong>Garnitur:</strong> ${train?train.name:'?'} (${train?train.length:'?'} m)<br/>
<strong>Zeit:</strong> ${toHHMM(b.startMin)}–${toHHMM(b.endMin)}`;
  wrap.appendChild(info);
  const editRow = document.createElement('div');
  editRow.className = 'fieldRow';
  const labS = document.createElement('label'); labS.textContent = 'Start';
  const inpS = document.createElement('input'); inpS.type = 'time'; inpS.value = toHHMM(b.startMin);
  const labE = document.createElement('label'); labE.textContent = 'Ende';
  const inpE = document.createElement('input'); inpE.type = 'time'; inpE.value = toHHMM(b.endMin);
  editRow.appendChild(labS); editRow.appendChild(inpS); editRow.appendChild(labE); editRow.appendChild(inpE);
  wrap.appendChild(editRow);
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  const btnUpdate = document.createElement('button'); btnUpdate.textContent = 'Aktualisieren';
  const btnDelete = document.createElement('button'); btnDelete.textContent = 'Löschen'; btnDelete.style.background = 'var(--warn)';
  actions.appendChild(btnUpdate); actions.appendChild(btnDelete);
  wrap.appendChild(actions);
  btnUpdate.addEventListener('click', () => {
    const startMin = toMinutes(inpS.value);
    const endMin = toMinutes(inpE.value);
    const startW = toMinutes(state.time.start);
    const endW = toMinutes(state.time.end);
    if (endMin <= startMin) { alert('Ende muss nach Start liegen.'); return; }
    if (startMin < startW || endMin > endW) { alert('Zeiten außerhalb des Zeithorizonts.'); return; }
    b.startMin = startMin; b.endMin = endMin;
    saveState();
    renderTracks();
    selectBlock(b);
  });
  btnDelete.addEventListener('click', () => {
    if (!confirm('Diesen Block wirklich löschen?')) return;
    state.blocks = state.blocks.filter(x => x.id !== b.id);
    saveState();
    renderTracks();
    selectionPanel.innerHTML = '<p>Kein Element ausgewählt.</p>';
  });
  selectionPanel.appendChild(wrap);
}

// Drag & Drop (horizontal)
function enableDrag(el, blockData, startMinWindow, endMinWindow){
  let startX=0, origStart=0, origEnd=0; let dragging=false;
  el.addEventListener('mousedown', (ev) => {
    dragging = true;
    startX = ev.clientX;
    origStart= blockData.startMin;
    origEnd = blockData.endMin;
    document.body.style.userSelect = 'none';
  });
  window.addEventListener('mousemove', (ev) => {
    if (!dragging) return;
    const dx = ev.clientX - startX;
    const deltaMin = Math.round(dx / state.time.pxPerMin);
    let newStart = clamp(origStart + deltaMin, startMinWindow, endMinWindow - (origEnd - origStart));
    let newEnd = newStart + (origEnd - origStart);
    blockData.startMin = newStart;
    blockData.endMin = newEnd;
    renderTracks();
  });
  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      document.body.style.userSelect = '';
      saveState();
    }
  });
}

// Scroll-Sync: Header <-> Tracks
function setupScrollSync(){
  let _syncing = false;
  tracksView.addEventListener('scroll', () => {
    if (_syncing || !SCROLL_SYNC_ENABLED) return;
    _syncing = true;
    timelineHeader.scrollLeft = tracksView.scrollLeft;
    _syncing = false;
  });
  timelineHeader.addEventListener('scroll', () => {
    if (_syncing || !SCROLL_SYNC_ENABLED) return;
    _syncing = true;
    tracksView.scrollLeft = timelineHeader.scrollLeft;
    _syncing = false;
  });
}

function runSearch(){
  const term = (searchInput?.value || '').trim().toLowerCase();
  clearHighlights();
  if (!term) return;

  // 1) Zuggarnituren
  state.trains.forEach(t => {
    if (t.name.toLowerCase().includes(term)) highlightTrain(t.id);
  });

  // 2) Gleise
  state.tracks.forEach(tr => {
    if (tr.name.toLowerCase().includes(term)) highlightTrack(tr.id);
  });

  // 3) Blöcke inkl. Uhrzeit
  state.blocks.forEach(b => {
    const train = state.trains.find(t => t.id === b.trainId);
    const track = state.tracks.find(t => t.id === b.trackId);
    const timeStr = `${toHHMM(b.startMin)}-${toHHMM(b.endMin)}`.toLowerCase();
    if ((train && train.name.toLowerCase().includes(term)) ||
        (track && track.name.toLowerCase().includes(term)) ||
        timeStr.includes(term) ||
        b.id.toLowerCase().includes(term)){
      highlightBlock(b.id, true);
    }
  });
}

function clearHighlights(){
  document.querySelectorAll('.searchHighlight').forEach(e => e.classList.remove('searchHighlight'));
}

function highlightTrain(trainId){
  const name = state.trains.find(t => t.id === trainId)?.name;
  if (!name) return;
  const el = [...document.querySelectorAll('#trainList li')]
    .find(li => li.textContent.includes(name));
  if (el) el.classList.add('searchHighlight');
}

function highlightTrack(trackId){
  const name = state.tracks.find(t => t.id === trackId)?.name;
  if (!name) return;
  const rows = document.querySelectorAll('.trackRow');
  for (const r of rows){
    const h3 = r.querySelector('.trackLabel h3');
    if (h3?.textContent === name){
      r.classList.add('searchHighlight');
      r.scrollIntoView({ behavior: 'smooth', block: 'center' });
      break;
    }
  }
}

function highlightBlock(blockId, scroll=false){
  const el = document.querySelector(`.block[data-block-id="${blockId}"]`);
  if (!el) return;
  el.classList.add('searchHighlight');
  if (scroll) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
}
