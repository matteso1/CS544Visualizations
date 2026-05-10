/* ==========================================================================
   Figure I — The Cassandra ring, by the walk
   Six independent figures share geometry and palette helpers below.
   ========================================================================== */

(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);

  /* ---------- shared geometry ----------------------------------- */
  const TOKEN_MAX = 256;
  const LX0 = 80;
  const LX1 = 880;
  function tokenToX(t) {
    return LX0 + (t / TOKEN_MAX) * (LX1 - LX0);
  }

  /* ---------- shared palette ------------------------------------ */
  const COLORS = {
    A: '#8b1f0e', // oxblood
    B: '#46566a', // slate
    C: '#4a6b3a', // moss
    D: '#b8860b', // ochre
    E: '#5e3370', // plum (joins later)
  };
  const INK   = '#1a1814';
  const PAPER = '#f4f0e6';
  const MUTE  = '#8a8472';

  /* ---------- shared SVG helpers -------------------------------- */
  function el(tag, attrs = {}, parent = null, text = null) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) {
      if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function clearSVG(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }
  function arrowMarker(svg, id, color) {
    let defs = svg.querySelector('defs');
    if (!defs) defs = el('defs', {}, svg);
    const m = el('marker', {
      id, viewBox: '0 0 10 10', refX: '9', refY: '5',
      markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse',
    }, defs);
    el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color }, m);
  }

  /* ---------- shared hash --------------------------------------- */
  // djb2-ish, mod 256, deterministic across reloads
  function hashToken(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
    }
    return h % TOKEN_MAX;
  }

  /* ---------- shared vnode dataset ------------------------------ */
  // Same set used by figures 3, 4, 5 so the line stays consistent.
  const NODES_INIT = ['A', 'B', 'C', 'D'];
  const VNODES_INIT = {
    A: [6, 84, 138, 220],
    B: [30, 102, 168, 236],
    C: [54, 122, 190, 250],
    D: [72, 154, 198, 228],
  };
  const VNODES_E = [18, 110, 180, 215];

  function flatVnodes(vnodes, nodes) {
    const list = [];
    for (const node of nodes) {
      for (const t of (vnodes[node] || [])) list.push({ node, token: t });
    }
    list.sort((a, b) => a.token - b.token);
    return list;
  }

  function findReplicasFromList(list, token, rf) {
    let startIdx = list.findIndex(v => v.token >= token);
    if (startIdx === -1) startIdx = 0;
    const replicas = [];
    const skipped = [];
    const seen = new Set();
    for (let i = 0; i < list.length && replicas.length < rf; i++) {
      const v = list[(startIdx + i) % list.length];
      if (seen.has(v.node)) {
        if (replicas.length < rf) skipped.push(v);
        continue;
      }
      seen.add(v.node);
      replicas.push(v);
    }
    return { replicas, skipped };
  }

  function drawNumberLine(svg, lineY, label) {
    el('line', { x1: LX0, x2: LX1, y1: lineY, y2: lineY,
                 stroke: INK, 'stroke-width': 1.5 }, svg);
    el('line', { x1: LX0, x2: LX0, y1: lineY - 6, y2: lineY + 6,
                 stroke: INK, 'stroke-width': 1 }, svg);
    el('line', { x1: LX1, x2: LX1, y1: lineY - 6, y2: lineY + 6,
                 stroke: INK, 'stroke-width': 1 }, svg);
    el('text', { x: LX0, y: lineY + 22, 'text-anchor': 'middle',
                 class: 'label-sm', 'font-size': 10 }, svg, '0');
    el('text', { x: LX1, y: lineY + 22, 'text-anchor': 'middle',
                 class: 'label-sm', 'font-size': 10 }, svg, '256');
    if (label) {
      el('text', { x: 460, y: 24, 'text-anchor': 'middle',
                   class: 'label-sm', 'font-size': 10 }, svg, label);
    }
  }

  /* ============================================================= */
  /* Figure I.1 — Ring → line                                      */
  /* ============================================================= */
  (function setupUnwrap() {
    const svg = $('svg-unwrap');
    if (!svg) return;

    const VB_W = 920;
    const cx = 460, cyCircle = 170, R = 110;
    const lineYTarget = 200;  // where the line settles when fully unwrapped
    const NPTS = 220;

    const NODES = [
      { token: 0,   label: 'A', color: COLORS.A },
      { token: 64,  label: 'B', color: COLORS.B },
      { token: 128, label: 'C', color: COLORS.C },
      { token: 192, label: 'D', color: COLORS.D },
    ];

    let progress = 0; // 0 = circle, 1 = line
    let target = 0;
    let raf = null;

    // map fraction (0..1 around circle / along line) → animated position
    function pointAt(frac, t) {
      const angle = frac * 2 * Math.PI - Math.PI / 2; // top, going clockwise
      const cxp = cx + R * Math.cos(angle);
      const cyp = cyCircle + R * Math.sin(angle);
      const lxp = LX0 + frac * (LX1 - LX0);
      const lyp = lineYTarget;
      return {
        x: (1 - t) * cxp + t * lxp,
        y: (1 - t) * cyp + t * lyp,
      };
    }

    function render() {
      clearSVG(svg);
      arrowMarker(svg, 'unwrap-arr', COLORS.A);

      // Header (placed in the top-left, away from the circle)
      el('text', { x: 14, y: 22, class: 'label-sm', 'font-size': 10,
                   'letter-spacing': '0.18em', fill: MUTE }, svg,
        progress < 0.5 ? 'TOKEN SPACE — drawn as a ring' : 'TOKEN SPACE — drawn as a line');

      // Build morphing path
      let d = 'M ';
      for (let i = 0; i <= NPTS; i++) {
        const p = pointAt(i / NPTS, progress);
        d += `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        if (i < NPTS) d += ' L ';
      }
      el('path', { d, fill: 'none', stroke: INK, 'stroke-width': 1.4 }, svg);

      // Tick marks at the line endpoints (fade in as we straighten)
      if (progress > 0.3) {
        const op = (progress - 0.3) / 0.7;
        const a = pointAt(0, progress);
        const b = pointAt(1, progress);
        const ht = 6 * op;
        el('line', { x1: a.x, x2: a.x, y1: a.y - ht, y2: a.y + ht,
                     stroke: INK, 'stroke-width': 1, opacity: op }, svg);
        el('line', { x1: b.x, x2: b.x, y1: b.y - ht, y2: b.y + ht,
                     stroke: INK, 'stroke-width': 1, opacity: op }, svg);
        el('text', { x: a.x, y: a.y + 22, 'text-anchor': 'middle',
                     class: 'label-sm', 'font-size': 10, opacity: op }, svg, '0');
        el('text', { x: b.x, y: b.y + 22, 'text-anchor': 'middle',
                     class: 'label-sm', 'font-size': 10, opacity: op }, svg, '256');
      }

      // Render the four node tokens
      NODES.forEach(n => {
        const p = pointAt(n.token / TOKEN_MAX, progress);

        // Label position — outside the circle, then above the line
        const angle = (n.token / TOKEN_MAX) * 2 * Math.PI - Math.PI / 2;
        const cLblX = p.x + (1 - progress) * 22 * Math.cos(angle);
        const cLblY = p.y + (1 - progress) * 22 * Math.sin(angle) - progress * 18;
        el('text', { x: cLblX, y: cLblY, 'text-anchor': 'middle',
                     'dominant-baseline': 'middle',
                     class: 'label-lg', 'font-size': 12, 'font-weight': '600',
                     fill: n.color }, svg, n.label);
        el('text', { x: cLblX, y: cLblY + 12, 'text-anchor': 'middle',
                     class: 'label-sm', 'font-size': 9, fill: MUTE }, svg, `t${n.token}`);

        // The dot
        el('circle', { cx: p.x, cy: p.y, r: 7,
                       fill: n.color, stroke: PAPER, 'stroke-width': 1.5 }, svg);
      });

      // Wrap arrow (fades in once unwrapped)
      if (progress > 0.7) {
        const op = (progress - 0.7) / 0.3;
        const r = pointAt(1, progress);
        const l = pointAt(0, progress);
        const dy = 50;
        const path = `M ${r.x},${r.y + 8} `
                   + `Q ${r.x + 10},${r.y + dy} ${(r.x + l.x) / 2},${r.y + dy} `
                   + `Q ${l.x - 10},${l.y + dy} ${l.x},${l.y + 10}`;
        el('path', { d: path, fill: 'none', stroke: COLORS.A,
                     'stroke-width': 1.2, 'stroke-dasharray': '4 3',
                     opacity: op, 'marker-end': 'url(#unwrap-arr)' }, svg);
        el('text', { x: (r.x + l.x) / 2, y: r.y + dy + 14,
                     'text-anchor': 'middle', class: 'label-sm',
                     'font-size': 10, 'font-style': 'italic',
                     opacity: op, fill: COLORS.A }, svg, 'past 256, wrap to 0');
      }
    }

    function tick() {
      const speed = 0.022;
      const diff = target - progress;
      if (Math.abs(diff) < 0.003) {
        progress = target;
        render();
        raf = null;
        return;
      }
      progress += Math.sign(diff) * Math.min(speed, Math.abs(diff));
      render();
      raf = requestAnimationFrame(tick);
    }

    $('btn-unwrap').addEventListener('click', () => {
      target = 1;
      if (!raf) raf = requestAnimationFrame(tick);
    });
    $('btn-rewrap').addEventListener('click', () => {
      target = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    });

    render();
  })();

  /* ============================================================= */
  /* Figure I.2 — Hash + walk                                      */
  /* ============================================================= */
  (function setupWalk() {
    const svg = $('svg-walk');
    if (!svg) return;

    const VB_W = 920;
    const lineY = 130;
    const NODES = [
      { token: 0,   label: 'A', color: COLORS.A },
      { token: 64,  label: 'B', color: COLORS.B },
      { token: 128, label: 'C', color: COLORS.C },
      { token: 192, label: 'D', color: COLORS.D },
    ];

    let activeKey = null, activeToken = null;
    let walk = null; // { startToken, ownerToken, owner, wraps, t }
    let raf = null;

    function findOwner(token) {
      const sorted = [...NODES].sort((a, b) => a.token - b.token);
      for (const n of sorted) if (n.token >= token) return n;
      return sorted[0];
    }

    function render() {
      clearSVG(svg);
      arrowMarker(svg, 'walk-arr', COLORS.A);

      // Header banner (left-aligned)
      el('text', { x: 14, y: 22, class: 'label-sm', 'font-size': 10,
                   'letter-spacing': '0.18em', fill: MUTE }, svg,
        'TOKEN SPACE — walk right, wrap at the end');

      // Combined caption above the line
      if (activeKey != null) {
        const ownerSeg = walk && walk.t >= 1
          ? `   →   owner: ${walk.owner.label}`
          : '';
        el('text', { x: VB_W / 2, y: 50, 'text-anchor': 'middle',
                     class: 'label-lg', 'font-size': 13, 'font-weight': '600' }, svg,
          `"${activeKey}"   →   hash → t${activeToken}${ownerSeg}`);
      }

      drawNumberLine(svg, lineY, null);

      // Nodes
      NODES.forEach(n => {
        const x = tokenToX(n.token);
        el('text', { x, y: lineY - 36, 'text-anchor': 'middle',
                     class: 'label-sm', 'font-size': 9, fill: MUTE }, svg, `t${n.token}`);
        el('text', { x, y: lineY - 20, 'text-anchor': 'middle',
                     class: 'label-lg', 'font-size': 13, 'font-weight': '600',
                     fill: n.color }, svg, n.label);
        el('circle', { cx: x, cy: lineY, r: 7,
                       fill: n.color, stroke: PAPER, 'stroke-width': 1.5 }, svg);
      });

      // Key dot below the line (text moved to header above)
      if (activeKey != null) {
        const x = tokenToX(activeToken);
        el('circle', { cx: x, cy: lineY + 14, r: 5, fill: INK }, svg);
        el('line', { x1: x, x2: x, y1: lineY + 4, y2: lineY + 9,
                     stroke: INK, 'stroke-width': 0.8 }, svg);
      }

      if (walk) {
        const startX = tokenToX(walk.startToken);
        const ownerX = tokenToX(walk.ownerToken);

        if (!walk.wraps) {
          const cur = startX + (ownerX - startX) * walk.t;
          if (cur > startX + 0.5) {
            el('line', { x1: startX, x2: cur, y1: lineY - 4, y2: lineY - 4,
                         stroke: COLORS.A, 'stroke-width': 2,
                         'marker-end': walk.t > 0.95 ? 'url(#walk-arr)' : null }, svg);
          }
        } else {
          // Phase 1: startX → LX1 (0..0.5), Phase 2: LX0 → ownerX (0.5..1)
          if (walk.t < 0.5) {
            const cur = startX + (LX1 - startX) * (walk.t * 2);
            el('line', { x1: startX, x2: cur, y1: lineY - 4, y2: lineY - 4,
                         stroke: COLORS.A, 'stroke-width': 2 }, svg);
          } else {
            // Phase 1 fully drawn
            el('line', { x1: startX, x2: LX1, y1: lineY - 4, y2: lineY - 4,
                         stroke: COLORS.A, 'stroke-width': 2 }, svg);
            // Wrap loop below
            const dy = 56;
            const dPath = `M ${LX1},${lineY + 8} `
                        + `Q ${LX1 + 10},${lineY + dy} ${(LX0 + LX1) / 2},${lineY + dy} `
                        + `Q ${LX0 - 10},${lineY + dy} ${LX0},${lineY + 8}`;
            el('path', { d: dPath, fill: 'none', stroke: COLORS.A,
                         'stroke-width': 1.2, 'stroke-dasharray': '4 3' }, svg);
            const ph2 = (walk.t - 0.5) * 2;
            const cur = LX0 + (ownerX - LX0) * ph2;
            el('line', { x1: LX0, x2: cur, y1: lineY - 4, y2: lineY - 4,
                         stroke: COLORS.A, 'stroke-width': 2,
                         'marker-end': ph2 > 0.95 ? 'url(#walk-arr)' : null }, svg);
          }
        }

        if (walk.t >= 1) {
          el('circle', { cx: ownerX, cy: lineY, r: 12,
                         fill: 'none', stroke: walk.owner.color, 'stroke-width': 2 }, svg);
        }
      }
    }

    function startWalk(key) {
      activeKey = key;
      activeToken = hashToken(key);
      const owner = findOwner(activeToken);
      walk = {
        startToken: activeToken,
        ownerToken: owner.token,
        owner,
        wraps: owner.token < activeToken,
        t: 0,
      };
      const start = performance.now();
      const dur = walk.wraps ? 1500 : 850;
      function loop(now) {
        walk.t = Math.min(1, (now - start) / dur);
        render();
        if (walk.t < 1) raf = requestAnimationFrame(loop);
        else raf = null;
      }
      raf = requestAnimationFrame(loop);
    }

    $('btn-walk-go').addEventListener('click', () => {
      const k = $('walk-key').value || 'user:42';
      startWalk(k);
    });
    $('walk-key').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        startWalk($('walk-key').value || 'user:42');
      }
    });

    render();
  })();

  /* ============================================================= */
  /* Figure I.3 — Vnodes + node join                               */
  /* ============================================================= */
  (function setupVnodes() {
    const svg = $('svg-vnode');
    if (!svg) return;

    const lineY = 110;

    let nodes = [...NODES_INIT];
    let vnodes = JSON.parse(JSON.stringify(VNODES_INIT));
    let added = false;

    function render() {
      clearSVG(svg);

      drawNumberLine(svg, lineY, 'TOKEN SPACE  ·  every tick is a vnode');

      const list = flatVnodes(vnodes, nodes);

      // Owned segments (the tail wraps to the first vnode's owner)
      let prev = LX0;
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        const x = tokenToX(v.token);
        const isNew = added && v.node === 'E';
        el('rect', { x: prev, y: lineY - 28, width: x - prev, height: 12,
                     fill: COLORS[v.node],
                     opacity: isNew ? 0.45 : 0.20 }, svg);
        if (isNew) {
          el('rect', { x: prev, y: lineY - 28, width: x - prev, height: 12,
                       fill: 'none', stroke: COLORS.E,
                       'stroke-width': 1.2, 'stroke-dasharray': '3 2' }, svg);
        }
        prev = x;
      }
      if (list.length > 0) {
        const first = list[0];
        const isNew = added && first.node === 'E';
        el('rect', { x: prev, y: lineY - 28, width: LX1 - prev, height: 12,
                     fill: COLORS[first.node],
                     opacity: isNew ? 0.45 : 0.20 }, svg);
      }

      // Vnode ticks
      list.forEach(v => {
        const x = tokenToX(v.token);
        const isNew = added && v.node === 'E';
        el('line', { x1: x, x2: x, y1: lineY - 18, y2: lineY + 4,
                     stroke: COLORS[v.node],
                     'stroke-width': isNew ? 3 : 2.5 }, svg);
      });

      // Legend
      let lx = LX0;
      const ly = lineY + 64;
      nodes.forEach(node => {
        el('circle', { cx: lx, cy: ly, r: 5, fill: COLORS[node] }, svg);
        const lbl = `Node ${node}` + (added && node === 'E' ? '  (joined)' : '');
        el('text', { x: lx + 10, y: ly + 4, class: 'label-sm', 'font-size': 11,
                     fill: added && node === 'E' ? COLORS.E : INK }, svg, lbl);
        lx += 100;
      });

      // Helper line under the legend
      el('text', { x: LX0, y: ly + 24, class: 'label-sm', 'font-size': 9,
                   'font-style': 'italic', fill: MUTE }, svg,
        added
          ? 'segments shaded with a dashed border just changed owner — only those did'
          : 'each band shows which physical node owns that range of keys');
    }

    $('btn-add-node').addEventListener('click', () => {
      if (nodes.includes('E')) return;
      nodes.push('E');
      vnodes.E = [...VNODES_E];
      added = true;
      render();
    });
    $('btn-vnode-reset').addEventListener('click', () => {
      nodes = [...NODES_INIT];
      vnodes = JSON.parse(JSON.stringify(VNODES_INIT));
      added = false;
      render();
    });

    render();
  })();

  /* ============================================================= */
  /* Figure I.4 — Replication                                      */
  /* ============================================================= */
  (function setupReplication() {
    const svg = $('svg-rep');
    if (!svg) return;

    const lineY = 120;

    let key = null, token = null;
    let rf = 3;
    let result = null;

    function render() {
      clearSVG(svg);

      drawNumberLine(svg, lineY, null);

      const list = flatVnodes(VNODES_INIT, NODES_INIT);

      list.forEach(v => {
        const x = tokenToX(v.token);
        const isReplica = result && result.replicas.some(r => r.token === v.token);
        const isSkipped = result && result.skipped.some(s => s.token === v.token);
        const dim = result && !isReplica && !isSkipped;
        el('line', { x1: x, x2: x, y1: lineY - 18, y2: lineY + 4,
                     stroke: COLORS[v.node], 'stroke-width': 2.5,
                     opacity: dim ? 0.35 : 1 }, svg);
        if (isReplica) {
          el('circle', { cx: x, cy: lineY - 8, r: 10,
                         fill: 'none', stroke: COLORS[v.node], 'stroke-width': 2 }, svg);
        }
        if (isSkipped) {
          el('line', { x1: x - 7, x2: x + 7, y1: lineY - 8, y2: lineY - 8,
                       stroke: MUTE, 'stroke-width': 1.4 }, svg);
        }
      });

      // Active key dot
      if (key != null) {
        const x = tokenToX(token);
        el('circle', { cx: x, cy: lineY + 16, r: 5, fill: INK }, svg);
        el('text', { x, y: lineY + 38, 'text-anchor': 'middle',
                     class: 'label-sm', 'font-size': 10, 'font-style': 'italic' }, svg,
          `"${key}"  →  t${token}`);
      }

      if (result) {
        const summary = `RF=${rf} · replicas: ` + result.replicas.map(r => r.node).join(' · ');
        el('text', { x: LX0, y: lineY - 50, class: 'label-sm', 'font-size': 11,
                     'font-weight': '600', fill: INK }, svg, summary);
        if (result.skipped.length > 0) {
          el('text', { x: LX0, y: lineY - 34, class: 'label-sm', 'font-size': 10,
                       'font-style': 'italic', fill: MUTE }, svg,
            `skipped (already counted): ${result.skipped.map(s => s.node + '@t' + s.token).join(', ')}`);
        }
      }

      // Legend
      let lx = LX0;
      const ly = lineY + 78;
      NODES_INIT.forEach(node => {
        el('circle', { cx: lx, cy: ly, r: 5, fill: COLORS[node] }, svg);
        el('text', { x: lx + 10, y: ly + 4, class: 'label-sm', 'font-size': 11 }, svg,
          `Node ${node}`);
        lx += 100;
      });
    }

    function go() {
      key = $('rep-key').value || 'user:42';
      token = hashToken(key);
      const list = flatVnodes(VNODES_INIT, NODES_INIT);
      result = findReplicasFromList(list, token, rf);
      render();
    }

    $('btn-rep-go').addEventListener('click', go);
    $('rep-key').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); go(); }
    });
    $('rep-rf').addEventListener('input', e => {
      rf = parseInt(e.target.value, 10);
      $('rep-rf-val').textContent = rf;
      if (result) go();
    });

    render();
  })();

  /* ============================================================= */
  /* Figure I.5 — Failure                                          */
  /* ============================================================= */
  (function setupFailure() {
    const svg = $('svg-fail');
    if (!svg) return;

    const lineY = 130;
    let rf = 1;
    const dead = { A: false, B: false, C: false, D: false };

    function lostSegments() {
      const list = flatVnodes(VNODES_INIT, NODES_INIT);
      const segments = [];
      let prev = 0;
      for (const v of list) {
        const repl = findReplicasFromList(list, v.token, rf).replicas;
        const allDead = repl.length > 0 && repl.every(r => dead[r.node]);
        segments.push({ start: prev, end: v.token, lost: allDead });
        prev = v.token;
      }
      // Tail segment past the last vnode wraps back to the first vnode
      if (list.length > 0) {
        const repl = findReplicasFromList(list, (list[list.length - 1].token + 1) % TOKEN_MAX, rf).replicas;
        const allDead = repl.length > 0 && repl.every(r => dead[r.node]);
        segments.push({ start: prev, end: TOKEN_MAX, lost: allDead });
      }
      return segments;
    }

    function pctLost(segs) {
      let lost = 0, total = 0;
      for (const s of segs) {
        const w = s.end - s.start;
        total += w;
        if (s.lost) lost += w;
      }
      return total === 0 ? 0 : (100 * lost / total);
    }

    function render() {
      clearSVG(svg);
      drawNumberLine(svg, lineY, null);

      const segs = lostSegments();
      segs.forEach(s => {
        if (s.lost) {
          const x1 = tokenToX(s.start);
          const x2 = tokenToX(s.end);
          el('rect', { x: x1, y: lineY - 8, width: x2 - x1, height: 16,
                       fill: COLORS.A, opacity: 0.55 }, svg);
        }
      });

      // Vnode ticks
      const list = flatVnodes(VNODES_INIT, NODES_INIT);
      list.forEach(v => {
        const x = tokenToX(v.token);
        const isDead = dead[v.node];
        el('line', { x1: x, x2: x, y1: lineY - 22, y2: lineY + 4,
                     stroke: COLORS[v.node], 'stroke-width': 2.5,
                     opacity: isDead ? 0.3 : 1,
                     'stroke-dasharray': isDead ? '2 2' : null }, svg);
        if (isDead) {
          el('line', { x1: x - 5, x2: x + 5, y1: lineY - 14, y2: lineY - 4,
                       stroke: INK, 'stroke-width': 1 }, svg);
          el('line', { x1: x - 5, x2: x + 5, y1: lineY - 4, y2: lineY - 14,
                       stroke: INK, 'stroke-width': 1 }, svg);
        }
      });

      $('fail-lost').textContent = pctLost(segs).toFixed(0) + '%';

      // Legend
      let lx = LX0;
      const ly = lineY + 70;
      NODES_INIT.forEach(node => {
        const isDead = dead[node];
        el('circle', { cx: lx, cy: ly, r: 5,
                       fill: isDead ? PAPER : COLORS[node],
                       stroke: COLORS[node], 'stroke-width': 1.5 }, svg);
        el('text', { x: lx + 10, y: ly + 4,
                     class: 'label-sm', 'font-size': 11,
                     fill: isDead ? MUTE : INK,
                     'text-decoration': isDead ? 'line-through' : null }, svg,
          `Node ${node}`);
        lx += 100;
      });

      // Helper text
      const pct = pctLost(segs).toFixed(0);
      el('text', { x: LX0, y: ly + 24, class: 'label-sm', 'font-size': 9,
                   'font-style': 'italic', fill: pct === '0' ? COLORS.C : COLORS.A }, svg,
        pct === '0'
          ? 'all keys still have at least one live replica'
          : `${pct}% of keys have lost every replica — those rows are unreachable`);
    }

    // Build kill checkboxes
    const killsContainer = $('fail-kills');
    NODES_INIT.forEach(node => {
      const lbl = document.createElement('label');
      lbl.style.cssText = 'display:flex; gap:6px; align-items:center;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `fail-kill-${node}`;
      cb.addEventListener('change', () => {
        dead[node] = cb.checked;
        render();
      });
      const span = document.createElement('span');
      span.className = 'control__value';
      span.style.color = COLORS[node];
      span.textContent = node;
      lbl.appendChild(cb);
      lbl.appendChild(span);
      killsContainer.appendChild(lbl);
    });

    $('fail-rf').addEventListener('input', e => {
      rf = parseInt(e.target.value, 10);
      $('fail-rf-val').textContent = rf;
      render();
    });

    render();
  })();

  /* ============================================================= */
  /* Figure I.6 — Quorums and the conflict scenario                */
  /* ============================================================= */
  (function setupQuorum() {
    const svg = $('svg-quorum');
    if (!svg) return;

    const VB_W = 920;
    const REPLICAS = ['N1', 'N2'];
    const COLS = ['col0', 'col1'];

    let state;
    function freshState() {
      return {
        R: 2, W: 1,
        alive: { N1: true, N2: true },
        data: {
          N1: { col0: { value: 1, ts: 0 }, col1: { value: 1, ts: 0 } },
          N2: { col0: { value: 1, ts: 0 }, col1: { value: 1, ts: 0 } },
        },
        nextTs: 1,
        lastOp: null,
        log: [],
      };
    }

    function reset() {
      state = freshState();
      $('q-w').value = 1; $('q-w-val').textContent = '1';
      $('q-r').value = 2; $('q-r-val').textContent = '2';
      $('q-alive-N1').checked = true;
      $('q-alive-N2').checked = true;
    }

    function doWrite(col, val) {
      const targets = REPLICAS.filter(r => state.alive[r]);
      const ack = targets.length;
      const ts = state.nextTs++;
      if (ack < state.W) {
        state.lastOp = { type: 'write', success: false, col, val,
                         ack, required: state.W };
        state.log.push(`WRITE ${col}=${val} → only ${ack} live, need W=${state.W}. FAILED`);
      } else {
        targets.forEach(r => { state.data[r][col] = { value: val, ts }; });
        state.lastOp = { type: 'write', success: true, col, val,
                         ack, required: state.W, reached: targets, ts };
        state.log.push(`WRITE ${col}=${val} (ts=${ts}) → reached ${targets.join(', ')}`);
      }
      render();
    }

    function doRead() {
      const targets = REPLICAS.filter(r => state.alive[r]);
      if (targets.length < state.R) {
        state.lastOp = { type: 'read', success: false,
                         ack: targets.length, required: state.R };
        state.log.push(`READ → only ${targets.length} live, need R=${state.R}. FAILED`);
        render();
        return;
      }
      const used = targets.slice(0, state.R);
      const merged = {};
      let divergent = false;
      for (const c of COLS) {
        const versions = used.map(r => ({ r, ...state.data[r][c] }));
        versions.sort((a, b) => b.ts - a.ts);
        merged[c] = { value: versions[0].value, ts: versions[0].ts, fromR: versions[0].r };
        if (new Set(versions.map(v => v.value)).size > 1) divergent = true;
      }
      state.lastOp = { type: 'read', success: true,
                       reached: used, merged, divergent };
      const mStr = COLS.map(c => `${c}=${merged[c].value}`).join(', ');
      state.log.push(`READ from ${used.join(', ')} → merged (${mStr})${divergent ? '   ⚠ replicas disagreed' : ''}`);
      render();
    }

    function render() {
      clearSVG(svg);

      // Title + R/W relationship
      const rwOk = state.R + state.W > REPLICAS.length;
      el('text', { x: VB_W / 2, y: 26, 'text-anchor': 'middle',
                   class: 'label-sm', 'font-size': 11 }, svg,
        `RF=2  ·  W=${state.W}  ·  R=${state.R}   ${rwOk ? '(R+W > RF)' : '(R+W ≤ RF — no overlap guarantee)'}`);

      // Two replica boxes
      const boxW = 290, boxH = 110, boxY = 50;
      const boxXs = [180, 460];
      REPLICAS.forEach((r, i) => {
        const alive = state.alive[r];
        const x = boxXs[i];
        el('rect', { x, y: boxY, width: boxW, height: boxH,
                     fill: PAPER, stroke: INK,
                     'stroke-width': alive ? 1.5 : 0.6,
                     'stroke-dasharray': alive ? null : '3 3',
                     opacity: alive ? 1 : 0.5 }, svg);
        el('text', { x: x + 14, y: boxY + 22,
                     class: 'label-lg', 'font-size': 13, 'font-weight': '600',
                     fill: alive ? INK : MUTE }, svg, `Replica ${r}`);
        el('text', { x: x + boxW - 14, y: boxY + 22, 'text-anchor': 'end',
                     class: 'label-sm', 'font-size': 10,
                     fill: alive ? COLORS.C : COLORS.A }, svg,
          alive ? 'ALIVE' : 'DOWN');

        // Two cells
        const cellW = (boxW - 28) / 2;
        COLS.forEach((c, ci) => {
          const cx = x + 14 + ci * cellW;
          const cy = boxY + 36;
          el('rect', { x: cx, y: cy, width: cellW - 6, height: 64,
                       fill: '#fdfaf2', stroke: INK, 'stroke-width': 0.5,
                       opacity: alive ? 1 : 0.4 }, svg);
          el('text', { x: cx + 8, y: cy + 14,
                       class: 'label-sm', 'font-size': 9,
                       fill: alive ? '#4a4538' : MUTE }, svg, c);
          el('text', { x: cx + (cellW - 6) / 2, y: cy + 42,
                       'text-anchor': 'middle',
                       class: 'label-lg', 'font-size': 24, 'font-weight': '600',
                       fill: alive ? INK : MUTE }, svg,
            String(state.data[r][c].value));
          el('text', { x: cx + (cellW - 6) / 2, y: cy + 58,
                       'text-anchor': 'middle',
                       class: 'label-sm', 'font-size': 9, fill: MUTE }, svg,
            `ts=${state.data[r][c].ts}`);
        });
      });

      // Last op summary
      const op = state.lastOp;
      const opY = 188;
      if (op) {
        const success = op.success !== false;
        let s;
        if (op.type === 'write') {
          s = success
            ? `WRITE ${op.col} = ${op.val}  ·  ack ${op.ack}/${REPLICAS.length}  ·  W=${op.required}`
            : `WRITE ${op.col} = ${op.val}  ·  FAILED  (${op.ack} live, need W=${op.required})`;
        } else {
          s = success
            ? `READ from ${op.reached.join(', ')}  ·  merged → (${COLS.map(c => `${op.merged[c].value}`).join(', ')})`
              + (op.divergent ? '   ⚠ replicas disagreed — last-write-wins picked one' : '')
            : `READ FAILED  (${op.ack} live, need R=${op.required})`;
        }
        el('text', { x: VB_W / 2, y: opY, 'text-anchor': 'middle',
                     class: 'label-lg', 'font-size': 12,
                     'font-weight': '600',
                     fill: success ? INK : COLORS.A }, svg, s);
      }

      // Transcript log
      const logY = 226;
      el('text', { x: 30, y: logY, class: 'label-sm', 'font-size': 9,
                   fill: MUTE, 'letter-spacing': '0.18em' }, svg,
        'TRANSCRIPT');
      const lines = state.log.slice(-8);
      lines.forEach((line, i) => {
        const isWarn = line.includes('⚠') || line.includes('FAILED');
        el('text', { x: 30, y: logY + 18 + i * 15,
                     class: 'label-sm', 'font-size': 10,
                     fill: isWarn ? COLORS.A : '#4a4538',
                     'font-family': 'JetBrains Mono, monospace' }, svg, line);
      });
    }

    // Wire up
    $('q-r').addEventListener('input', e => {
      state.R = parseInt(e.target.value, 10);
      $('q-r-val').textContent = state.R;
      render();
    });
    $('q-w').addEventListener('input', e => {
      state.W = parseInt(e.target.value, 10);
      $('q-w-val').textContent = state.W;
      render();
    });
    $('q-alive-N1').addEventListener('change', e => {
      state.alive.N1 = e.target.checked; render();
    });
    $('q-alive-N2').addEventListener('change', e => {
      state.alive.N2 = e.target.checked; render();
    });
    $('btn-q-write-c0').addEventListener('click', () => {
      const cur = Math.max(...REPLICAS.map(r => state.data[r].col0.value));
      doWrite('col0', cur + 1);
    });
    $('btn-q-write-c1').addEventListener('click', () => {
      const cur = Math.max(...REPLICAS.map(r => state.data[r].col1.value));
      doWrite('col1', cur + 1);
    });
    $('btn-q-read').addEventListener('click', doRead);
    $('btn-q-reset').addEventListener('click', () => { reset(); render(); });

    let scenarioRunning = false;
    $('btn-q-scenario').addEventListener('click', async () => {
      if (scenarioRunning) return;
      scenarioRunning = true;
      reset();
      state.W = 1; state.R = 2;
      state.log.push('— scenario: RF=2, W=1, R=2; row starts (1, 1) —');
      render();
      const sleep = ms => new Promise(r => setTimeout(r, ms));

      await sleep(900);
      state.alive.N1 = false;
      $('q-alive-N1').checked = false;
      state.log.push('N1 goes down (network partition)');
      render();

      await sleep(900);
      doWrite('col1', 2);

      await sleep(1100);
      state.alive.N1 = true;
      $('q-alive-N1').checked = true;
      state.alive.N2 = false;
      $('q-alive-N2').checked = false;
      state.log.push('N1 recovers, N2 goes down');
      render();

      await sleep(900);
      doWrite('col0', 2);

      await sleep(1100);
      state.alive.N2 = true;
      $('q-alive-N2').checked = true;
      state.log.push('all replicas back up');
      render();

      await sleep(900);
      doRead();
      state.log.push('R+W=3 > RF=2, but the read still found two divergent replicas');
      render();
      scenarioRunning = false;
    });

    reset();
    render();
  })();

})();
