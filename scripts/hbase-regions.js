/* ==========================================================================
   Figure IV — HBase regions on a row line
   Keyspace [a, z]. Regions split. Region → exactly one RegionServer.
   ========================================================================== */

(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const svg     = document.getElementById('hbase-svg');
  const gReg    = document.getElementById('regions-g');
  const gRS     = document.getElementById('rs-g');
  const gAssign = document.getElementById('assign-g');

  const $ = id => document.getElementById(id);

  const LINE_X1 = 40;
  const LINE_X2 = 880;
  const LINE_Y  = 120;
  const RS_Y    = 320;
  const RS_W    = 160, RS_H = 60;
  const RS_X    = [120, 380, 640];   // three RegionServers

  const REGION_COLORS = ['#8b1f0e', '#46566a', '#4a6b3a', '#b8860b', '#5e3370', '#7a3320', '#3a5a8a'];

  /* ---------- state ------------------------------------------------ */

  // a region is { id, start, end, ownerRS, rows: [string] }
  // start/end are in "letter space" — letters become positions on the line.
  // initial: one region covering the whole keyspace, owned by RS 0
  let regionCounter = 1;
  const state = {
    regions: [
      { id: regionCounter++, start: 'a', end: 'z', owner: 0, rows: [] },
    ],
    rsAlive: [true, true, true],
    rowCount: 0,
    lastPut: null,
  };

  /* ---------- helpers --------------------------------------------- */

  function letterPos(letter) {
    // 'a'..'z' → LINE_X1..LINE_X2
    const idx = Math.max(0, Math.min(25, letter.toLowerCase().charCodeAt(0) - 97));
    return LINE_X1 + (LINE_X2 - LINE_X1) * (idx / 25);
  }

  function midLetter(start, end) {
    const a = start.charCodeAt(0);
    const b = end.charCodeAt(0);
    const mid = Math.round((a + b) / 2);
    if (mid === a || mid === b) return null;
    return String.fromCharCode(mid);
  }

  function findRegion(rowKey) {
    const k = rowKey.toLowerCase();
    return state.regions.find(r =>
      r.start <= k && k < r.end
    ) || state.regions[state.regions.length - 1];
  }

  function liveRSCount() {
    return state.rsAlive.filter(Boolean).length;
  }

  function reassignDeadRegions() {
    state.regions.forEach(r => {
      if (!state.rsAlive[r.owner]) {
        // pick any live RS, round-robin by region id
        const live = state.rsAlive.map((a, i) => a ? i : -1).filter(i => i >= 0);
        if (live.length === 0) return;
        r.owner = live[r.id % live.length];
      }
    });
  }

  function rebalanceFresh() {
    state.regions.forEach((r, i) => {
      const live = state.rsAlive.map((a, idx) => a ? idx : -1).filter(idx => idx >= 0);
      if (live.length === 0) return;
      r.owner = live[i % live.length];
    });
  }

  /* ---------- draw ------------------------------------------------ */

  function drawRegions() {
    gReg.innerHTML = '';
    state.regions.forEach((r, i) => {
      const x1 = letterPos(r.start);
      const x2 = letterPos(r.end);
      const w = x2 - x1;
      const color = REGION_COLORS[r.id % REGION_COLORS.length];

      // bar above line
      const bar = document.createElementNS(SVG_NS, 'rect');
      bar.setAttribute('x', x1);
      bar.setAttribute('y', LINE_Y - 36);
      bar.setAttribute('width', w);
      bar.setAttribute('height', 22);
      bar.setAttribute('fill', color);
      bar.setAttribute('opacity', 0.9);
      gReg.appendChild(bar);

      // region label
      const lbl = document.createElementNS(SVG_NS, 'text');
      lbl.setAttribute('x', x1 + w / 2);
      lbl.setAttribute('y', LINE_Y - 22);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('fill', '#f4f0e6');
      lbl.setAttribute('font-family', 'JetBrains Mono, monospace');
      lbl.setAttribute('font-size', '10');
      lbl.setAttribute('font-weight', '600');
      lbl.textContent = `r${r.id}  [${r.start}, ${r.end})`;
      gReg.appendChild(lbl);

      // row count under the bar
      const cnt = document.createElementNS(SVG_NS, 'text');
      cnt.setAttribute('x', x1 + w / 2);
      cnt.setAttribute('y', LINE_Y + 18);
      cnt.setAttribute('text-anchor', 'middle');
      cnt.setAttribute('class', 'label-sm');
      cnt.setAttribute('font-size', '10');
      cnt.textContent = `${r.rows.length} row${r.rows.length === 1 ? '' : 's'}`;
      gReg.appendChild(cnt);

      // boundary tick on row line
      const tk = document.createElementNS(SVG_NS, 'line');
      tk.setAttribute('x1', x1); tk.setAttribute('x2', x1);
      tk.setAttribute('y1', LINE_Y - 6); tk.setAttribute('y2', LINE_Y + 6);
      tk.setAttribute('class', 'stroke-ink');
      tk.setAttribute('stroke-width', '1');
      gReg.appendChild(tk);
    });
    // last boundary (z)
    const tk = document.createElementNS(SVG_NS, 'line');
    tk.setAttribute('x1', LINE_X2); tk.setAttribute('x2', LINE_X2);
    tk.setAttribute('y1', LINE_Y - 6); tk.setAttribute('y2', LINE_Y + 6);
    tk.setAttribute('class', 'stroke-ink');
    tk.setAttribute('stroke-width', '1');
    gReg.appendChild(tk);
  }

  function drawRS() {
    gRS.innerHTML = '';
    RS_X.forEach((x, i) => {
      const alive = state.rsAlive[i];
      const r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('x', x);
      r.setAttribute('y', RS_Y);
      r.setAttribute('width', RS_W);
      r.setAttribute('height', RS_H);
      r.setAttribute('class', 'fill-paper stroke-ink');
      r.setAttribute('stroke-width', alive ? 1.5 : 0.6);
      r.setAttribute('opacity', alive ? 1 : 0.4);
      if (!alive) r.setAttribute('stroke-dasharray', '3 3');
      gRS.appendChild(r);

      const lbl = document.createElementNS(SVG_NS, 'text');
      lbl.setAttribute('x', x + RS_W / 2);
      lbl.setAttribute('y', RS_Y + 24);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('class', 'label-lg');
      lbl.setAttribute('font-size', '13');
      lbl.setAttribute('fill', alive ? '#1a1814' : '#8a8472');
      lbl.textContent = `RegionServer ${i + 1}`;
      gRS.appendChild(lbl);

      // owned regions list
      const owned = state.regions.filter(r => r.owner === i);
      const sub = document.createElementNS(SVG_NS, 'text');
      sub.setAttribute('x', x + RS_W / 2);
      sub.setAttribute('y', RS_Y + 44);
      sub.setAttribute('text-anchor', 'middle');
      sub.setAttribute('class', 'label-sm');
      sub.setAttribute('font-size', '9');
      sub.setAttribute('fill', alive ? '#4a4538' : '#8a8472');
      sub.textContent = alive
        ? (owned.length === 0 ? 'no regions' : 'owns: ' + owned.map(r => `r${r.id}`).join(' · '))
        : 'DOWN';
      gRS.appendChild(sub);
    });
  }

  function drawAssignments() {
    gAssign.innerHTML = '';
    state.regions.forEach(r => {
      const x1 = letterPos(r.start);
      const x2 = letterPos(r.end);
      const midX = (x1 + x2) / 2;
      const rsX = RS_X[r.owner] + RS_W / 2;
      const color = REGION_COLORS[r.id % REGION_COLORS.length];

      const ln = document.createElementNS(SVG_NS, 'line');
      ln.setAttribute('x1', midX);
      ln.setAttribute('y1', LINE_Y + 22);
      ln.setAttribute('x2', rsX);
      ln.setAttribute('y2', RS_Y);
      ln.setAttribute('stroke', color);
      ln.setAttribute('stroke-width', 0.8);
      ln.setAttribute('opacity', 0.5);
      gAssign.appendChild(ln);
    });
  }

  function updateReadout() {
    $('r-rows').textContent    = state.rowCount;
    $('r-regions').textContent = state.regions.length;
    $('r-live').textContent    = liveRSCount();
    $('r-last').textContent    = state.lastPut
      ? `r${state.lastPut.region} @ RS-${state.lastPut.rs + 1}`
      : '—';
  }

  function renderAll() {
    drawRegions();
    drawRS();
    drawAssignments();
    updateReadout();
  }

  /* ---------- actions --------------------------------------------- */

  function addRow(key) {
    if (!key || !/^[a-zA-Z]/.test(key)) return;
    const region = findRegion(key);
    region.rows.push(key.toLowerCase());
    state.rowCount++;
    state.lastPut = { region: region.id, rs: region.owner };

    // auto-split if a region holds 6+ rows
    if (region.rows.length >= 6) splitRegion(region);

    renderAll();
  }

  function splitRegion(region) {
    const mid = midLetter(region.start, region.end);
    if (!mid) return;
    const sortedRows = [...region.rows].sort();
    const rowsLeft = sortedRows.filter(r => r < mid);
    const rowsRight = sortedRows.filter(r => r >= mid);

    const left = {
      id: regionCounter++,
      start: region.start,
      end: mid,
      owner: region.owner,
      rows: rowsLeft,
    };
    const right = {
      id: regionCounter++,
      start: mid,
      end: region.end,
      owner: liveRSCount() > 0
        ? state.rsAlive.map((a, i) => a ? i : -1).filter(i => i >= 0)[(left.id) % liveRSCount()]
        : region.owner,
      rows: rowsRight,
    };
    const idx = state.regions.indexOf(region);
    state.regions.splice(idx, 1, left, right);
  }

  function splitLargest() {
    if (state.regions.length === 0) return;
    const biggest = [...state.regions].sort((a, b) => b.rows.length - a.rows.length)[0]
                  || [...state.regions].sort((a, b) => (b.end.charCodeAt(0)-b.start.charCodeAt(0)) - (a.end.charCodeAt(0)-a.start.charCodeAt(0)))[0];
    splitRegion(biggest);
    renderAll();
  }

  function killRS(idx) {
    state.rsAlive[idx] = false;
    reassignDeadRegions();
    renderAll();
  }

  /* ---------- controls -------------------------------------------- */

  $('row-key').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addRow($('row-key').value);
    }
  });
  $('btn-add').addEventListener('click', () => addRow($('row-key').value));

  const SAMPLE = ['apple', 'banana', 'cherry', 'date', 'fig', 'grape',
                  'honey', 'lemon', 'mango', 'olive', 'pear', 'plum',
                  'quince', 'raisin', 'rye', 'thyme', 'wheat'];
  $('btn-burst').addEventListener('click', () => {
    let i = 0;
    const tick = () => {
      if (i >= 8) return;
      const k = SAMPLE[Math.floor(Math.random() * SAMPLE.length)];
      addRow(k);
      i++;
      setTimeout(tick, 220);
    };
    tick();
  });

  $('btn-split').addEventListener('click', splitLargest);

  $('kill-rs').addEventListener('change', e => {
    if (e.target.value === '') return;
    const idx = parseInt(e.target.value, 10);
    if (state.rsAlive[idx]) {
      killRS(idx);
    } else {
      // restore
      state.rsAlive[idx] = true;
      rebalanceFresh();
      renderAll();
    }
    e.target.value = '';
  });

  /* ---------- init -------------------------------------------------- */

  renderAll();
})();
