/* ==========================================================================
   Figure II — Kafka topic, partitioned
   Producer → topic with N partitions → two consumer groups.
   ========================================================================== */

(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const svg = document.getElementById('kafka-svg');
  const gParts = document.getElementById('partitions-g');
  const gGroups = document.getElementById('groups-g');
  const gFlight = document.getElementById('msg-flight');

  const $ = id => document.getElementById(id);

  // Geometry
  const TOPIC = { x: 245, y: 80, w: 380, h: 380 };
  const PRODUCER_OUT = { x: 140, y: 250 };
  const PART_X = TOPIC.x + 24;
  const PART_W = TOPIC.w - 48;

  const GROUP_AREA = { x: 670, w: 230, top: 80, bottom: 460 };

  /* ---------- state -------------------------------------------------- */

  const state = {
    numParts: 4,
    useKey: true,
    alphaConsumers: 2,
    betaConsumers: 1,
    msgCount: 0,
    // per-partition arrays of recent messages [{key, color, t}]
    partLog: [],
  };

  function resetPartLog(n) {
    state.partLog = Array.from({length: n}, () => []);
  }
  resetPartLog(state.numParts);

  /* ---------- hashing & color assignment ---------------------------- */

  function hashKey(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  const COLOR_POOL = ['#8b1f0e', '#46566a', '#4a6b3a', '#b8860b', '#5e3370', '#7a3320', '#3a5a8a', '#6a4d2a'];
  const keyColor = new Map();
  function colorForKey(key) {
    if (!keyColor.has(key)) {
      keyColor.set(key, COLOR_POOL[keyColor.size % COLOR_POOL.length]);
    }
    return keyColor.get(key);
  }

  /* ---------- partition rendering ----------------------------------- */

  function partitionRect(idx, n) {
    const inner = TOPIC.h - 60;            // leave room for header + bottom margin
    const gap = 8;
    const rowH = (inner - gap * (n - 1)) / n;
    return {
      x: PART_X,
      y: TOPIC.y + 36 + idx * (rowH + gap),
      w: PART_W,
      h: rowH,
    };
  }

  function drawPartitions() {
    gParts.innerHTML = '';
    const n = state.numParts;

    for (let i = 0; i < n; i++) {
      const r = partitionRect(i, n);

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', r.x);
      rect.setAttribute('y', r.y);
      rect.setAttribute('width', r.w);
      rect.setAttribute('height', r.h);
      rect.setAttribute('class', 'fill-paper stroke-ink');
      rect.setAttribute('stroke-width', '1');
      gParts.appendChild(rect);

      // partition label
      const lbl = document.createElementNS(SVG_NS, 'text');
      lbl.setAttribute('x', r.x + 8);
      lbl.setAttribute('y', r.y + 16);
      lbl.setAttribute('class', 'label-sm');
      lbl.setAttribute('font-size', '10');
      lbl.textContent = `partition ${i}`;
      gParts.appendChild(lbl);

      // offset markers (faint)
      for (let j = 1; j < 6; j++) {
        const tick = document.createElementNS(SVG_NS, 'line');
        const tx = r.x + r.w * j / 6;
        tick.setAttribute('x1', tx);
        tick.setAttribute('x2', tx);
        tick.setAttribute('y1', r.y + r.h - 6);
        tick.setAttribute('y2', r.y + r.h - 2);
        tick.setAttribute('class', 'stroke-mute');
        tick.setAttribute('stroke-width', '0.6');
        gParts.appendChild(tick);
      }

      // log of past messages, drawn left-to-right
      const log = state.partLog[i] || [];
      const cellW = 14;
      const cellH = Math.min(18, r.h - 26);
      const startX = r.x + 8;
      const y = r.y + r.h - cellH - 6;
      const max = Math.floor((r.w - 16) / (cellW + 2));
      const visible = log.slice(-max);
      visible.forEach((m, j) => {
        const cx = startX + j * (cellW + 2);
        const sq = document.createElementNS(SVG_NS, 'rect');
        sq.setAttribute('x', cx);
        sq.setAttribute('y', y);
        sq.setAttribute('width', cellW);
        sq.setAttribute('height', cellH);
        sq.setAttribute('fill', m.color);
        sq.setAttribute('opacity', 0.85);
        gParts.appendChild(sq);
      });
    }
  }

  /* ---------- consumer groups -------------------------------------- */

  // partitions split round-robin within a group
  function assign(numParts, numConsumers) {
    if (numConsumers === 0) return [];
    const out = Array.from({length: numConsumers}, () => []);
    for (let p = 0; p < numParts; p++) out[p % numConsumers].push(p);
    return out;
  }

  function consumerY(groupIdx, consumerIdx, numConsumers, areaTop, areaH) {
    const gap = 6;
    const cellH = Math.min(40, (areaH - gap * (numConsumers - 1)) / numConsumers);
    return {
      y: areaTop + consumerIdx * (cellH + gap),
      h: cellH,
    };
  }

  function drawGroups() {
    gGroups.innerHTML = '';

    const groups = [
      { name: 'α', n: state.alphaConsumers, color: '#8b1f0e', top: GROUP_AREA.top, h: 170 },
      { name: 'β', n: state.betaConsumers,  color: '#46566a', top: GROUP_AREA.top + 200, h: 170 },
    ];

    groups.forEach(g => {
      // group frame
      const frame = document.createElementNS(SVG_NS, 'rect');
      frame.setAttribute('x', GROUP_AREA.x - 6);
      frame.setAttribute('y', g.top - 18);
      frame.setAttribute('width', GROUP_AREA.w + 12);
      frame.setAttribute('height', g.h + 28);
      frame.setAttribute('fill', 'none');
      frame.setAttribute('stroke', g.color);
      frame.setAttribute('stroke-width', '1.2');
      frame.setAttribute('stroke-dasharray', '2 4');
      gGroups.appendChild(frame);

      // group label
      const lbl = document.createElementNS(SVG_NS, 'text');
      lbl.setAttribute('x', GROUP_AREA.x);
      lbl.setAttribute('y', g.top - 5);
      lbl.setAttribute('class', 'label-sm');
      lbl.setAttribute('font-size', '10');
      lbl.setAttribute('fill', g.color);
      lbl.setAttribute('font-weight', '600');
      lbl.textContent = `consumer group ${g.name}`;
      gGroups.appendChild(lbl);

      if (g.n === 0) {
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', GROUP_AREA.x + GROUP_AREA.w / 2);
        t.setAttribute('y', g.top + g.h / 2);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('class', 'label-sm');
        t.textContent = '(no consumers)';
        gGroups.appendChild(t);
        return;
      }

      const assignment = assign(state.numParts, g.n);

      for (let i = 0; i < g.n; i++) {
        const cellH = Math.min(40, (g.h - 6 * (g.n - 1)) / g.n);
        const y = g.top + i * (cellH + 6);
        const owns = assignment[i];
        const idle = owns.length === 0;

        const r = document.createElementNS(SVG_NS, 'rect');
        r.setAttribute('x', GROUP_AREA.x);
        r.setAttribute('y', y);
        r.setAttribute('width', GROUP_AREA.w);
        r.setAttribute('height', cellH);
        r.setAttribute('class', 'fill-paper stroke-ink');
        r.setAttribute('stroke-width', '1');
        if (idle) r.setAttribute('opacity', 0.4);
        gGroups.appendChild(r);

        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', GROUP_AREA.x + 10);
        t.setAttribute('y', y + cellH / 2 - 2);
        t.setAttribute('class', 'label-sm');
        t.setAttribute('font-size', '10');
        t.textContent = `c${g.name}-${i + 1}`;
        gGroups.appendChild(t);

        const t2 = document.createElementNS(SVG_NS, 'text');
        t2.setAttribute('x', GROUP_AREA.x + 10);
        t2.setAttribute('y', y + cellH / 2 + 12);
        t2.setAttribute('class', 'label-sm');
        t2.setAttribute('font-size', '9');
        t2.setAttribute('fill', idle ? '#8a8472' : '#1a1814');
        t2.textContent = idle
          ? 'idle (no partition)'
          : 'owns: ' + owns.map(p => `p${p}`).join(' · ');
        gGroups.appendChild(t2);

        // store consumer center for animation
        if (!state.consumerCenters) state.consumerCenters = {};
        state.consumerCenters[`${g.name}-${i}`] = {
          x: GROUP_AREA.x + GROUP_AREA.w + 6,
          y: y + cellH / 2,
          owns,
        };
      }
    });
  }

  /* ---------- animation -------------------------------------------- */

  function animateDot(x1, y1, x2, y2, color, size = 8, duration = 700, onArrive = null) {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', x1);
    c.setAttribute('cy', y1);
    c.setAttribute('r', size);
    c.setAttribute('fill', color);
    c.setAttribute('opacity', 0.9);
    gFlight.appendChild(c);

    const start = performance.now();
    function step(t) {
      const k = Math.min(1, (t - start) / duration);
      const ease = 1 - (1 - k) * (1 - k);
      const x = x1 + (x2 - x1) * ease;
      const y = y1 + (y2 - y1) * ease;
      c.setAttribute('cx', x);
      c.setAttribute('cy', y);
      if (k < 1) requestAnimationFrame(step);
      else {
        c.remove();
        if (onArrive) onArrive();
      }
    }
    requestAnimationFrame(step);
  }

  /* ---------- send a message --------------------------------------- */

  function sendMessage(key, opts = {}) {
    const useKey = opts.hasOwnProperty('useKey') ? opts.useKey : state.useKey;
    let partition;
    let hashShown;
    if (useKey && key) {
      const h = hashKey(key);
      partition = h % state.numParts;
      hashShown = `${h % 10000} mod ${state.numParts} = ${partition}`;
    } else {
      partition = state.msgCount % state.numParts;
      hashShown = `RR → ${partition}`;
    }

    const color = colorForKey(useKey && key ? key : `__rr_${state.msgCount}`);
    state.msgCount += 1;

    // readout
    $('rk-key').textContent = useKey && key ? key : '(no key)';
    $('rk-hash').textContent = hashShown;
    $('rk-part').textContent = `p${partition}`;
    $('rk-count').textContent = state.msgCount;

    // animate from producer to partition
    const r = partitionRect(partition, state.numParts);
    const pTarget = { x: r.x + 6, y: r.y + r.h / 2 };

    animateDot(PRODUCER_OUT.x + 8, PRODUCER_OUT.y, pTarget.x, pTarget.y, color, 8, 650, () => {
      // append to partition log + redraw partitions only
      state.partLog[partition].push({ key, color, t: Date.now() });
      drawPartitions();

      // dispatch to each consumer group's owning consumer
      const groups = [
        { name: 'α', n: state.alphaConsumers },
        { name: 'β', n: state.betaConsumers },
      ];
      const partLogX = r.x + r.w;
      const partLogY = r.y + r.h / 2;

      groups.forEach(g => {
        if (g.n === 0) return;
        const ownerIdx = partition % g.n;
        const center = state.consumerCenters[`${g.name}-${ownerIdx}`];
        if (!center) return;
        animateDot(partLogX, partLogY, center.x - 6, center.y, color, 6, 700);
      });
    });
  }

  /* ---------- controls --------------------------------------------- */

  $('msg-key').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage($('msg-key').value);
    }
  });
  $('btn-send').addEventListener('click', () => sendMessage($('msg-key').value));

  const SAMPLE_KEYS = ['user-1', 'user-42', 'cart-3', 'order-9', 'sku-77', 'gift-2', 'pay-5'];
  $('btn-burst').addEventListener('click', () => {
    let i = 0;
    const tick = () => {
      const k = SAMPLE_KEYS[Math.floor(Math.random() * SAMPLE_KEYS.length)];
      sendMessage(k, {});
      i++;
      if (i < 5) setTimeout(tick, 280);
    };
    tick();
  });

  $('use-key').addEventListener('change', e => {
    state.useKey = e.target.checked;
    $('use-key-val').textContent = state.useKey ? 'keyed' : 'round-robin';
  });

  $('num-parts').addEventListener('input', e => {
    const n = parseInt(e.target.value, 10);
    state.numParts = n;
    $('num-parts-val').textContent = n;
    resetPartLog(n);
    drawPartitions();
    drawGroups();
  });

  $('alpha-c').addEventListener('input', e => {
    state.alphaConsumers = parseInt(e.target.value, 10);
    $('alpha-c-val').textContent = state.alphaConsumers;
    drawGroups();
  });
  $('beta-c').addEventListener('input', e => {
    state.betaConsumers = parseInt(e.target.value, 10);
    $('beta-c-val').textContent = state.betaConsumers;
    drawGroups();
  });

  /* ---------- init -------------------------------------------------- */

  drawPartitions();
  drawGroups();
})();
