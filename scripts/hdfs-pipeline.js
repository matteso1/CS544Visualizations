/* ==========================================================================
   Figure III — HDFS pipelined write
   client → DN1 → DN2 → DN3 (or however many R requires).
   ========================================================================== */

(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const svg     = document.getElementById('hdfs-svg');
  const gDN     = document.getElementById('dn-g');
  const gPipe   = document.getElementById('pipe-g');
  const gBytes  = document.getElementById('bytes-g');

  const $ = id => document.getElementById(id);

  const NUM_DN = 5;
  // five DataNodes, evenly spaced on the right
  const DN_POS = [
    { x: 320, y: 360 },
    { x: 460, y: 360 },
    { x: 600, y: 360 },
    { x: 740, y: 360 },
    { x: 860, y: 360 },
  ];
  const DN_W = 90, DN_H = 60;
  const CLIENT_OUT = { x: 160, y: 250 };

  const state = {
    F: 128,
    R: 3,
    busy: false,
    diskFilled: new Set(),  // DN indices that hold a replica
    cumulative: {
      client: 0,
      net: 0,
      disk: 0,
      read: 0,
    },
  };

  /* ---------- DN draw ---------------------------------------------- */

  function drawDNs() {
    gDN.innerHTML = '';
    DN_POS.forEach((p, i) => {
      // box
      const r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('x', p.x - DN_W / 2);
      r.setAttribute('y', p.y - DN_H / 2);
      r.setAttribute('width', DN_W);
      r.setAttribute('height', DN_H);
      r.setAttribute('class', 'fill-paper stroke-ink');
      r.setAttribute('stroke-width', i < state.R ? 1.5 : 0.6);
      r.setAttribute('opacity', i < state.R ? 1 : 0.5);
      gDN.appendChild(r);

      // label
      const lbl = document.createElementNS(SVG_NS, 'text');
      lbl.setAttribute('x', p.x);
      lbl.setAttribute('y', p.y - 6);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('class', 'label-lg');
      lbl.setAttribute('font-size', '12');
      lbl.setAttribute('fill', i < state.R ? '#1a1814' : '#8a8472');
      lbl.textContent = `DN ${i + 1}`;

      const sub = document.createElementNS(SVG_NS, 'text');
      sub.setAttribute('x', p.x);
      sub.setAttribute('y', p.y + 10);
      sub.setAttribute('text-anchor', 'middle');
      sub.setAttribute('class', 'label-sm');
      sub.setAttribute('font-size', '9');
      sub.setAttribute('fill', i < state.R ? '#4a4538' : '#8a8472');
      sub.textContent = i < state.R ? 'in pipeline' : 'idle';
      gDN.appendChild(lbl);
      gDN.appendChild(sub);

      // disk status (filled bar at bottom of DN)
      const filled = state.diskFilled.has(i);
      const bar = document.createElementNS(SVG_NS, 'rect');
      bar.setAttribute('x', p.x - DN_W / 2 + 6);
      bar.setAttribute('y', p.y + DN_H / 2 - 8);
      bar.setAttribute('width', DN_W - 12);
      bar.setAttribute('height', 4);
      bar.setAttribute('fill', filled ? '#8b1f0e' : '#d4cdb6');
      gDN.appendChild(bar);

      // disk label
      const dl = document.createElementNS(SVG_NS, 'text');
      dl.setAttribute('x', p.x);
      dl.setAttribute('y', p.y + DN_H / 2 + 16);
      dl.setAttribute('text-anchor', 'middle');
      dl.setAttribute('class', 'label-sm');
      dl.setAttribute('font-size', '9');
      dl.setAttribute('fill', filled ? '#8b1f0e' : '#8a8472');
      dl.textContent = filled ? `${state.F} MB on disk` : 'empty';
      gDN.appendChild(dl);
    });
  }

  /* ---------- pipeline lines --------------------------------------- */

  function drawPipes() {
    gPipe.innerHTML = '';

    // client → DN1
    const c1 = makeLine(CLIENT_OUT.x, CLIENT_OUT.y, DN_POS[0].x - DN_W / 2, DN_POS[0].y, '#1a1814', 1.4);
    c1.setAttribute('marker-end', 'url(#arrow-ink2)');
    gPipe.appendChild(c1);
    addLabel((CLIENT_OUT.x + DN_POS[0].x - DN_W / 2) / 2, CLIENT_OUT.y - 14,
             'client → DN 1', '#1a1814');

    // DN i → DN i+1 for i < R-1
    for (let i = 0; i < state.R - 1; i++) {
      const a = DN_POS[i], b = DN_POS[i + 1];
      const ln = makeLine(a.x + DN_W / 2, a.y, b.x - DN_W / 2, b.y, '#46566a', 1.2);
      ln.setAttribute('stroke-dasharray', '6 3');
      ln.setAttribute('marker-end', 'url(#arrow-ink2)');
      gPipe.appendChild(ln);
      addLabel((a.x + b.x) / 2, a.y - 14, `pipeline ${i + 1}→${i + 2}`, '#46566a');
    }
  }

  function makeLine(x1, y1, x2, y2, stroke, w = 1) {
    const ln = document.createElementNS(SVG_NS, 'line');
    ln.setAttribute('x1', x1); ln.setAttribute('y1', y1);
    ln.setAttribute('x2', x2); ln.setAttribute('y2', y2);
    ln.setAttribute('stroke', stroke); ln.setAttribute('stroke-width', w);
    return ln;
  }

  function addLabel(x, y, text, color) {
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('class', 'label-sm');
    t.setAttribute('font-size', '9');
    t.setAttribute('fill', color);
    t.textContent = text;
    gPipe.appendChild(t);
  }

  /* ---------- byte animation -------------------------------------- */

  function animateBytes(x1, y1, x2, y2, color, duration, label, onArrive) {
    // a "packet" with the byte count printed inside
    const g = document.createElementNS(SVG_NS, 'g');

    const w = 56, h = 18;
    const r = document.createElementNS(SVG_NS, 'rect');
    r.setAttribute('x', -w/2); r.setAttribute('y', -h/2);
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('fill', color);
    r.setAttribute('opacity', 0.92);
    g.appendChild(r);

    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', 0);
    t.setAttribute('y', 4);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('fill', '#f4f0e6');
    t.setAttribute('font-family', 'JetBrains Mono, monospace');
    t.setAttribute('font-size', '10');
    t.setAttribute('font-weight', '600');
    t.textContent = label;
    g.appendChild(t);

    g.setAttribute('transform', `translate(${x1}, ${y1})`);
    gBytes.appendChild(g);

    const start = performance.now();
    function step(time) {
      const k = Math.min(1, (time - start) / duration);
      const ease = 1 - Math.pow(1 - k, 2);
      const x = x1 + (x2 - x1) * ease;
      const y = y1 + (y2 - y1) * ease;
      g.setAttribute('transform', `translate(${x}, ${y})`);
      if (k < 1) requestAnimationFrame(step);
      else {
        g.remove();
        if (onArrive) onArrive();
      }
    }
    requestAnimationFrame(step);
  }

  /* ---------- write sequence -------------------------------------- */

  function flashLine(x1, y1, x2, y2, color = '#8b1f0e') {
    const ln = makeLine(x1, y1, x2, y2, color, 4);
    ln.setAttribute('opacity', 0.7);
    gPipe.appendChild(ln);
    let op = 0.7;
    const tick = () => {
      op -= 0.04;
      if (op <= 0) { ln.remove(); return; }
      ln.setAttribute('opacity', op);
      requestAnimationFrame(tick);
    };
    setTimeout(() => requestAnimationFrame(tick), 60);
  }

  function startWrite() {
    if (state.busy) return;
    state.busy = true;
    state.diskFilled.clear();

    // hop 0: client → DN1, costs F bytes on cluster network + F on client
    const hops = [];
    hops.push({ from: CLIENT_OUT, to: DN_POS[0], color: '#8b1f0e', label: `${state.F} MB` });
    for (let i = 0; i < state.R - 1; i++) {
      hops.push({ from: DN_POS[i], to: DN_POS[i + 1], color: '#46566a', label: `${state.F} MB` });
    }

    let i = 0;
    const runHop = () => {
      if (i >= hops.length) {
        state.busy = false;
        return;
      }
      const h = hops[i];
      const fromX = h.from === CLIENT_OUT ? CLIENT_OUT.x + 4 : h.from.x + DN_W / 2;
      const fromY = h.from.y;
      const toX = h.to.x - DN_W / 2;
      const toY = h.to.y;

      flashLine(fromX, fromY, toX, toY, h.color);

      animateBytes(fromX, fromY, toX, toY, h.color, 900, h.label, () => {
        // arrival: DN writes to disk
        const dnIdx = DN_POS.indexOf(h.to);
        state.diskFilled.add(dnIdx);
        state.cumulative.net += state.F;
        state.cumulative.disk += state.F;
        if (i === 0) state.cumulative.client += state.F;
        drawDNs();
        updateReadout();
        i++;
        setTimeout(runHop, 180);
      });
    };
    runHop();
  }

  /* ---------- read sequence --------------------------------------- */

  function startRead() {
    if (state.busy) return;
    if (state.diskFilled.size === 0) {
      // can't read what isn't written
      flashLine(DN_POS[0].x - DN_W / 2, DN_POS[0].y, CLIENT_OUT.x, CLIENT_OUT.y, '#b8860b');
      return;
    }
    state.busy = true;
    // pick the first DN that has data — that's the closest in spirit
    const dnIdx = [...state.diskFilled].sort((a, b) => a - b)[0];
    const dn = DN_POS[dnIdx];

    flashLine(dn.x - DN_W / 2, dn.y, CLIENT_OUT.x + 4, CLIENT_OUT.y, '#4a6b3a');
    animateBytes(dn.x - DN_W / 2, dn.y, CLIENT_OUT.x + 4, CLIENT_OUT.y, '#4a6b3a', 900,
                 `${state.F} MB`, () => {
      state.cumulative.read += state.F;
      updateReadout();
      state.busy = false;
    });
  }

  /* ---------- readout --------------------------------------------- */

  function updateReadout() {
    $('r-client').textContent = `${state.cumulative.client} MB`;
    $('r-net').textContent    = `${state.cumulative.net} MB`;
    $('r-disk').textContent   = `${state.cumulative.disk} MB`;
    $('r-read').textContent   = `${state.cumulative.read} MB`;
    const total = state.cumulative.net + state.cumulative.read;
    $('r-total').textContent  = `${total} MB`;
  }

  function reset() {
    state.diskFilled.clear();
    state.cumulative = { client: 0, net: 0, disk: 0, read: 0 };
    drawDNs();
    drawPipes();
    updateReadout();
  }

  /* ---------- controls -------------------------------------------- */

  $('f-size').addEventListener('input', e => {
    state.F = parseInt(e.target.value, 10);
    $('f-size-val').textContent = state.F;
  });
  $('rf').addEventListener('input', e => {
    state.R = parseInt(e.target.value, 10);
    $('rf-val').textContent = state.R;
    state.diskFilled.clear();
    drawDNs();
    drawPipes();
  });
  $('btn-write').addEventListener('click', startWrite);
  $('btn-read').addEventListener('click', startRead);
  $('btn-reset').addEventListener('click', reset);

  /* ---------- init ------------------------------------------------- */

  drawDNs();
  drawPipes();
  updateReadout();
})();
