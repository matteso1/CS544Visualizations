/* ==========================================================================
   Figure I — Cassandra ring
   Eight vnodes around a token ring [0, 256). Drag the key, see the walk.
   ========================================================================== */

(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const CENTER = { x: 360, y: 260 };
  const RING_R = 200;
  const RING_MAX = 256;

  // Eight vnodes, irregular node assignment so the "skip duplicate" case shows up.
  const VNODES = [
    { token: 0,   node: 'A' },
    { token: 32,  node: 'B' },
    { token: 64,  node: 'C' },
    { token: 96,  node: 'D' },
    { token: 128, node: 'B' },
    { token: 160, node: 'A' },
    { token: 192, node: 'D' },
    { token: 224, node: 'C' },
  ];

  const NODE_COLORS = {
    A: '#1a1814',  // ink
    B: '#46566a',  // steel
    C: '#4a6b3a',  // moss
    D: '#b8860b',  // ochre
  };

  /* ---------- math --------------------------------------------------- */

  const tokenToAngle = t => (t / RING_MAX) * 2 * Math.PI;

  function tokenToPos(token, radius = RING_R) {
    const theta = tokenToAngle(token);
    return {
      x: CENTER.x + radius * Math.sin(theta),
      y: CENTER.y - radius * Math.cos(theta),
    };
  }

  function posToToken(x, y) {
    const dx = x - CENTER.x;
    const dy = y - CENTER.y;
    let theta = Math.atan2(dx, -dy);
    if (theta < 0) theta += 2 * Math.PI;
    return Math.round((theta / (2 * Math.PI)) * RING_MAX) % RING_MAX;
  }

  function arcPath(t1, t2, radius = RING_R) {
    const p1 = tokenToPos(t1, radius);
    const p2 = tokenToPos(t2, radius);
    let span = (t2 - t1 + RING_MAX) % RING_MAX;
    if (span === 0) span = RING_MAX;       // full ring
    const largeArc = span > RING_MAX / 2 ? 1 : 0;
    return `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${largeArc} 1 ${p2.x} ${p2.y}`;
  }

  function quorum(rf) {
    return Math.floor(rf / 2) + 1;
  }

  function clValue(setting, rf) {
    if (setting === 'rf') return rf;
    if (setting === '2') return quorum(rf);
    return parseInt(setting, 10);
  }

  function findReplicas(token, rf) {
    const sorted = [...VNODES].sort((a, b) => a.token - b.token);
    let ownerIdx = sorted.findIndex(v => v.token >= token);
    if (ownerIdx === -1) ownerIdx = 0;
    const replicas = [];
    const seen = new Set();
    for (let i = 0; i < sorted.length && replicas.length < rf; i++) {
      const idx = (ownerIdx + i) % sorted.length;
      const v = sorted[idx];
      if (!seen.has(v.node)) {
        seen.add(v.node);
        replicas.push({ ...v, vnodeIdx: idx });
      }
    }
    return { sorted, ownerIdx, owner: sorted[ownerIdx], replicas };
  }

  /* ---------- elements ---------------------------------------------- */

  const svg       = document.getElementById('ring-svg');
  const gVnodes   = document.getElementById('ring-vnodes');
  const gArc      = document.getElementById('ring-arc');
  const gReplicas = document.getElementById('ring-replicas');
  const keyHandle = document.getElementById('key-handle');
  const keyRadial = document.getElementById('key-radial');
  const keyHUD    = document.getElementById('key-hud');

  const rfRange = document.getElementById('rf');
  const rfVal   = document.getElementById('rf-val');
  const rfS     = document.getElementById('rf-s');
  const clRSel  = document.getElementById('cl-r');
  const clWSel  = document.getElementById('cl-w');
  const btnPulse = document.getElementById('btn-pulse');

  const rToken    = document.getElementById('r-token');
  const rOwner    = document.getElementById('r-owner');
  const rReplicas = document.getElementById('r-replicas');
  const rQuorum   = document.getElementById('r-quorum');
  const rStrong   = document.getElementById('r-strong');

  /* ---------- state -------------------------------------------------- */

  let state = {
    keyToken: 18,
    rf: 3,
  };

  /* ---------- vnode draw -------------------------------------------- */

  function drawVnodes(activeNodes = new Set(), ownerIdx = -1) {
    gVnodes.innerHTML = '';
    const sorted = [...VNODES].sort((a, b) => a.token - b.token);

    sorted.forEach((v, idx) => {
      const p = tokenToPos(v.token, RING_R);
      const labelP = tokenToPos(v.token, RING_R + 38);
      const fill = NODE_COLORS[v.node];
      const isActive = activeNodes.has(v.node);
      const isOwner  = idx === ownerIdx;

      // halo for active replicas
      if (isActive) {
        const halo = document.createElementNS(SVG_NS, 'circle');
        halo.setAttribute('cx', p.x);
        halo.setAttribute('cy', p.y);
        halo.setAttribute('r', isOwner ? 19 : 16);
        halo.setAttribute('fill', 'none');
        halo.setAttribute('stroke', '#8b1f0e');
        halo.setAttribute('stroke-width', isOwner ? 2.4 : 1.4);
        gVnodes.appendChild(halo);
      }

      // vnode square (filled w/ physical-node color)
      const sq = document.createElementNS(SVG_NS, 'rect');
      const size = 22;
      sq.setAttribute('x', p.x - size/2);
      sq.setAttribute('y', p.y - size/2);
      sq.setAttribute('width', size);
      sq.setAttribute('height', size);
      sq.setAttribute('fill', fill);
      sq.setAttribute('stroke', '#f4f0e6');
      sq.setAttribute('stroke-width', 1.5);
      gVnodes.appendChild(sq);

      // physical-node letter inside square
      const letter = document.createElementNS(SVG_NS, 'text');
      letter.setAttribute('x', p.x);
      letter.setAttribute('y', p.y + 4);
      letter.setAttribute('text-anchor', 'middle');
      letter.setAttribute('fill', '#f4f0e6');
      letter.setAttribute('font-family', 'JetBrains Mono, monospace');
      letter.setAttribute('font-size', '12');
      letter.setAttribute('font-weight', '600');
      letter.textContent = v.node;
      gVnodes.appendChild(letter);

      // single combined outer label "v1 · t0"
      const lbl = document.createElementNS(SVG_NS, 'text');
      lbl.setAttribute('x', labelP.x);
      lbl.setAttribute('y', labelP.y + 4);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('class', 'label-sm');
      lbl.setAttribute('font-size', '10');
      lbl.textContent = `v${idx + 1} · t${v.token}`;
      gVnodes.appendChild(lbl);
    });
  }

  /* ---------- arc draw (the walk indicator) ------------------------ */

  function drawWalkArc(fromToken, toToken) {
    gArc.innerHTML = '';
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', arcPath(fromToken, toToken, RING_R));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#8b1f0e');
    path.setAttribute('stroke-width', 4);
    path.setAttribute('stroke-linecap', 'butt');
    path.setAttribute('opacity', 0.85);
    gArc.appendChild(path);

    // arrowhead at end
    const endP = tokenToPos(toToken, RING_R);
    const tan = tokenToAngle(toToken);
    const ax = Math.cos(tan), ay = Math.sin(tan);
    const tip = document.createElementNS(SVG_NS, 'polygon');
    const s = 8;
    const p1 = `${endP.x + s * ax}, ${endP.y + s * ay}`;
    const p2 = `${endP.x - s * ay - s * ax / 2}, ${endP.y + s * ax - s * ay / 2}`;
    const p3 = `${endP.x + s * ay - s * ax / 2}, ${endP.y - s * ax - s * ay / 2}`;
    tip.setAttribute('points', `${p1} ${p2} ${p3}`);
    tip.setAttribute('fill', '#8b1f0e');
    gArc.appendChild(tip);
  }

  /* ---------- key handle render ------------------------------------ */

  function drawKey(token) {
    // dot sits on inner dotted ring, radial line continues to outer ring
    // so it's visually clear which token the key occupies
    const inner = tokenToPos(token, RING_R - 30);
    const outer = tokenToPos(token, RING_R);
    keyHandle.setAttribute('cx', inner.x);
    keyHandle.setAttribute('cy', inner.y);
    keyHandle.setAttribute('r', 7);
    keyRadial.setAttribute('x2', outer.x);
    keyRadial.setAttribute('y2', outer.y);
    keyHUD.textContent = token;
  }

  /* ---------- main render ------------------------------------------ */

  function render() {
    const rf = state.rf;
    const { owner, ownerIdx, replicas } = findReplicas(state.keyToken, rf);
    const activeNodes = new Set(replicas.map(r => r.node));

    drawVnodes(activeNodes, ownerIdx);
    drawWalkArc(state.keyToken, owner.token);
    drawKey(state.keyToken);

    // readouts
    rToken.textContent = state.keyToken;
    rOwner.textContent = `v${ownerIdx + 1} @ ${owner.node}`;
    rReplicas.textContent = replicas.map(r => r.node).join(' · ');
    const q = quorum(rf);
    rQuorum.textContent = q;

    const r = clValue(clRSel.value, rf);
    const w = clValue(clWSel.value, rf);
    if (r + w > rf) {
      rStrong.textContent = `${r} + ${w} > ${rf}  ·  strong`;
      rStrong.className = 'v v--ok';
    } else {
      rStrong.textContent = `${r} + ${w} ≤ ${rf}  ·  eventual`;
      rStrong.className = 'v v--warn';
    }
  }

  /* ---------- drag --------------------------------------------------- */

  let dragging = false;

  function pointerToToken(evt) {
    const rect = svg.getBoundingClientRect();
    const sx = (evt.clientX - rect.left) * (720 / rect.width);
    const sy = (evt.clientY - rect.top) * (520 / rect.height);
    return posToToken(sx, sy);
  }

  keyHandle.addEventListener('pointerdown', e => {
    dragging = true;
    keyHandle.setPointerCapture(e.pointerId);
    keyHandle.style.cursor = 'grabbing';
  });
  keyHandle.addEventListener('pointermove', e => {
    if (!dragging) return;
    state.keyToken = pointerToToken(e);
    render();
  });
  keyHandle.addEventListener('pointerup', e => {
    dragging = false;
    keyHandle.style.cursor = 'grab';
  });

  // click anywhere on ring → move key
  svg.addEventListener('click', e => {
    if (e.target === keyHandle) return;
    const rect = svg.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (720 / rect.width);
    const sy = (e.clientY - rect.top) * (520 / rect.height);
    const dx = sx - CENTER.x, dy = sy - CENTER.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 80 || dist > 280) return;
    state.keyToken = posToToken(sx, sy);
    render();
  });

  /* ---------- controls ---------------------------------------------- */

  rfRange.addEventListener('input', () => {
    state.rf = parseInt(rfRange.value, 10);
    rfVal.textContent = state.rf;
    rfS.textContent = state.rf === 1 ? '' : 's';
    render();
  });
  clRSel.addEventListener('change', render);
  clWSel.addEventListener('change', render);

  /* ---------- pulse animation -------------------------------------- */

  btnPulse.addEventListener('click', () => {
    const { sorted, ownerIdx, replicas } = findReplicas(state.keyToken, state.rf);
    btnPulse.disabled = true;

    let step = 0;
    const indices = [];
    const seen = new Set();
    for (let i = 0; i < sorted.length && indices.length < state.rf; i++) {
      const idx = (ownerIdx + i) % sorted.length;
      if (!seen.has(sorted[idx].node)) {
        seen.add(sorted[idx].node);
        indices.push(idx);
      }
    }

    const flash = (idx) => {
      const halo = document.createElementNS(SVG_NS, 'circle');
      const v = sorted[idx];
      const p = tokenToPos(v.token, RING_R);
      halo.setAttribute('cx', p.x);
      halo.setAttribute('cy', p.y);
      halo.setAttribute('r', 28);
      halo.setAttribute('fill', 'none');
      halo.setAttribute('stroke', '#8b1f0e');
      halo.setAttribute('stroke-width', 2);
      halo.setAttribute('opacity', 0);
      halo.style.animation = 'pulse-ox 0.7s ease-out forwards';
      gReplicas.appendChild(halo);
      setTimeout(() => halo.remove(), 800);
    };

    const tick = () => {
      if (step >= indices.length) {
        btnPulse.disabled = false;
        return;
      }
      flash(indices[step]);
      step++;
      setTimeout(tick, 480);
    };
    tick();
  });

  /* ---------- init --------------------------------------------------- */

  render();
})();
