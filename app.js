/* Práctica 8 · Reloj digital — simulador, circuito lógico, tabla de verdad y carta de tiempos */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const bit = (v, i) => (v >> i) & 1;
  const pad2 = (n) => String(n).padStart(2, '0');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* =====================================================================
     MODELO: seis contadores BCD en cascada (igual que el sketch de Arduino)
     ===================================================================== */
  const S = { us: 0, ds: 0, um: 0, dm: 0, uh: 0, dh: 0 };

  const hours = (s) => s.dh * 10 + s.uh;
  const mins = (s) => s.dm * 10 + s.um;
  const secs = (s) => s.ds * 10 + s.us;

  function hourPulse(s) {
    s.uh++;
    if (s.uh === 10) { s.uh = 0; s.dh++; }
    if (s.dh === 2 && s.uh === 4) { s.dh = 0; s.uh = 0; }   // compuerta R24
  }
  function advance(s) {
    s.us++;
    if (s.us === 10) { s.us = 0; s.ds++;
      if (s.ds === 6) { s.ds = 0; s.um++;
        if (s.um === 10) { s.um = 0; s.dm++;
          if (s.dm === 6) { s.dm = 0; hourPulse(s); }
        }
      }
    }
  }

  let running = true;
  let speed = 1;
  let phase = 0;          // ms dentro del periodo actual (0..1000). CLK alto en [0,500)
  let tickN = 0;
  let ver = 0;            // versión del estado (para saber cuándo redibujar)
  const hist = [];        // {n, before, after}
  const HMAX = 400;
  let sel = 'us';         // contador seleccionado (circuito, tabla y carta)
  let transient = null;   // estado transitorio (antes del reset asíncrono)

  const clkLevel = () => (phase < 500 ? 1 : 0);

  function tick() {
    const before = { ...S };
    advance(S);
    tickN++;
    hist.push({ n: tickN, before, after: { ...S } });
    if (hist.length > HMAX) hist.shift();
    ver++;
    return before;
  }

  function setTime(h, m, s) {
    h = ((h % 24) + 24) % 24; m = ((m % 60) + 60) % 60; s = ((s % 60) + 60) % 60;
    S.dh = Math.floor(h / 10); S.uh = h % 10;
    S.dm = Math.floor(m / 10); S.um = m % 10;
    S.ds = Math.floor(s / 10); S.us = s % 10;
    phase = 0;
    ver++;
  }

  // Estado intermedio que existe unos nanosegundos en un contador asíncrono
  // justo antes de que la compuerta lo reinicie (p. ej. 1010 en un mod 10).
  function transientFor(b, key) {
    const cUs = true;
    const cDs = cUs && b.us === 9;
    const cUm = cDs && b.ds === 5;
    const cDm = cUm && b.um === 9;
    const cH = cDm && b.dm === 5;
    const base = { ...b };
    switch (key) {
      case 'us': return b.us === 9 ? { ...base, us: 10 } : null;
      case 'ds': return cDs && b.ds === 5 ? { ...base, us: 0, ds: 6 } : null;
      case 'um': return cUm && b.um === 9 ? { ...base, us: 0, ds: 0, um: 10 } : null;
      case 'dm': return cDm && b.dm === 5 ? { ...base, us: 0, ds: 0, um: 0, dm: 6 } : null;
      case 'h':
        if (!cH) return null;
        if (hours(b) === 23) return { ...base, us: 0, ds: 0, um: 0, dm: 0, uh: 4, dh: 2 };
        if (b.uh === 9) return { ...base, us: 0, ds: 0, um: 0, dm: 0, uh: 10 };
        return null;
    }
    return null;
  }

  function stepManual() {
    // un pulso completo: el conteo ocurre en el flanco de bajada
    const b = tick();
    phase = 500;
    const st = transientFor(b, sel);
    if (st) {
      transient = { key: sel, st, until: performance.now() + 550 };
      setTimeout(() => renderAll(false), 580);
    }
    logSerial();
  }

  /* =====================================================================
     SIMULADOR
     ===================================================================== */
  const DIG = ['1111110', '0110000', '1101101', '1111001', '0110011', '1011011', '1011111', '1110000', '1111111', '1111011'];
  const hseg = (x1, x2, y) => `${x1},${y} ${x1 + 4},${y - 4} ${x2 - 4},${y - 4} ${x2},${y} ${x2 - 4},${y + 4} ${x1 + 4},${y + 4}`;
  const vseg = (x, y1, y2) => `${x},${y1} ${x + 4},${y1 + 4} ${x + 4},${y2 - 4} ${x},${y2} ${x - 4},${y2 - 4} ${x - 4},${y1 + 4}`;
  const SEGP = [hseg(10, 50, 6), vseg(54, 8, 48), vseg(54, 52, 92), hseg(10, 50, 94), vseg(6, 52, 92), vseg(6, 8, 48), hseg(10, 50, 50)];
  function digitSVG(pattern) {
    const polys = SEGP.map((p, i) => `<polygon points="${p}" class="${pattern[i] === '1' ? 'on' : 'off'}"/>`).join('');
    return `<svg class="digit" viewBox="-6 -2 72 104" aria-hidden="true"><g transform="skewX(-6) translate(6 0)">${polys}</g></svg>`;
  }

  const clockEl = $('#clock');
  function renderClock() {
    const d = [S.dh, S.uh, S.dm, S.um, S.ds, S.us].map((v) => digitSVG(DIG[v]));
    const colon = `<div class="colon${clkLevel() ? '' : ' off'}"><i></i><i></i></div>`;
    clockEl.innerHTML = d[0] + d[1] + colon + d[2] + d[3] + colon + d[4] + d[5];
    clockEl.setAttribute('aria-label', `${pad2(hours(S))}:${pad2(mins(S))}:${pad2(secs(S))}`);
  }

  // LEDs de segundos en binario (D9..D4 = b5..b0)
  const ledsEl = $('#leds');
  ledsEl.innerHTML = [5, 4, 3, 2, 1, 0].map((b) => `<div class="ledbox"><span class="led" data-b="${b}"></span><small>b${b}·D${4 + b}</small></div>`).join('');
  const ledEls = [...ledsEl.querySelectorAll('.led')];

  function renderHW() {
    const s = secs(S);
    ledEls.forEach((el) => el.classList.toggle('on', !!bit(s, +el.dataset.b)));
    $('#lcd0').textContent = `    ${pad2(hours(S))}:${pad2(mins(S))}:${pad2(secs(S))}    `;
    $('#lcd1').textContent = `Seg bin: ${s.toString(2).padStart(6, '0')} `;
  }
  function renderClk() {
    const c = clkLevel();
    $('#led13').classList.toggle('on', !!c);
    $('#clkDot').classList.toggle('on', !!c);
    clockEl.querySelectorAll('.colon').forEach((el) => el.classList.toggle('off', !c));
  }

  // Monitor serie
  const serialOut = $('#serialOut');
  const serialLines = [];
  function serialPrint(line) {
    serialLines.push(line);
    if (serialLines.length > 80) serialLines.shift();
    serialOut.textContent = serialLines.join('\n');
    serialOut.scrollTop = serialOut.scrollHeight;
  }
  function logSerial() {
    const bcd = `${S.ds.toString(2).padStart(3, '0')} ${S.us.toString(2).padStart(4, '0')}`;
    serialPrint(`${pad2(hours(S))}:${pad2(mins(S))}:${pad2(secs(S))}   BCD seg = ${bcd}`);
    if (ready) renderAll(false);   // respuesta inmediata a las acciones del usuario
  }
  let ready = false;

  // Botones con repetición (600 ms de espera, luego cada 250 ms) como en el sketch
  function btnHora() { hourPulse(S); phase = 0; ver++; logSerial(); }
  function btnMin() {
    S.um++; if (S.um === 10) { S.um = 0; S.dm++; if (S.dm === 6) S.dm = 0; }
    S.us = 0; S.ds = 0; phase = 0; ver++; logSerial();
  }
  function holdButton(el, fn) {
    let t1 = null, t2 = null;
    const stop = () => { el.classList.remove('pressed'); clearTimeout(t1); clearInterval(t2); t1 = t2 = null; };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('pressed');
      fn();
      t1 = setTimeout(() => { t2 = setInterval(fn, 250); }, 600);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, stop));
    el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); fn(); } });
  }
  holdButton($('#btnHora'), btnHora);
  holdButton($('#btnMin'), btnMin);

  $('#serialForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#serialInput');
    const txt = inp.value.trim();
    const m = txt.match(/^[tT]\s*(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
    serialPrint(`> ${txt}`);
    if (m) { setTime(+m[1], +m[2], +m[3]); serialPrint('Hora ajustada.'); logSerial(); }
    else serialPrint('Formato: T hh:mm:ss');
    inp.value = '';
  });

  function setRunning(r) {
    running = r;
    const t = running ? '⏸ Pausa' : '▶ Correr';
    $('#btnPlay').textContent = t;
    $('#btnPlay2').textContent = t;
  }
  $('#btnPlay').addEventListener('click', () => setRunning(!running));
  $('#btnPlay2').addEventListener('click', () => setRunning(!running));
  ['#btnStep', '#btnStep2', '#btnStep3'].forEach((id) => $(id).addEventListener('click', stepManual));
  $('#speedCtl').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    speed = +b.dataset.speed;
    $('#speedCtl').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  });
  function syncPC() { const d = new Date(); setTime(d.getHours(), d.getMinutes(), d.getSeconds()); }
  $('#btnSync').addEventListener('click', () => { syncPC(); logSerial(); });
  $('#btnZero').addEventListener('click', () => { setTime(0, 0, 0); logSerial(); });
  $('#btn2359').addEventListener('click', () => { setTime(23, 59, 50); logSerial(); });

  /* =====================================================================
     CIRCUITO LÓGICO
     ===================================================================== */
  const DET = {
    us: { tab: 'U seg · mod 10', chain: [['us', 4, 'U seg']], clk: { name: 'CLK 1 Hz', v: () => clkLevel() }, out: 'Q3 → CLK de D seg',
      gates: [{ id: 'R10', ins: [3, 1], det: 'detecta 1010 (10)' }], buses: [{ ffs: [0, 1, 2, 3], from: ['R10'] }],
      text: 'Contador de décadas asíncrono (como el 74LS90): cuatro flip‑flops T con T = 1 que cambian en el flanco de bajada de su reloj. El primero recibe la señal de 1 Hz y cada uno de los siguientes usa como reloj la salida Q del anterior. Cuando el conteo llega a 1010 (10), la compuerta AND (Q3·Q1) activa CLR y el contador regresa a 0000 de inmediato, así que solo recorre 0–9. Al pasar de 9 a 0, Q3 cae de 1 a 0: ese flanco es el reloj de las decenas de segundo. Prueba con “Pulso CLK” en 9 para ver el estado transitorio.' },
    ds: { tab: 'D seg · mod 6', chain: [['ds', 3, 'D seg']], clk: { name: 'Q3 de U seg', v: (s) => bit(s.us, 3) }, out: 'Q2 → CLK de U min',
      gates: [{ id: 'R6', ins: [2, 1], det: 'detecta 110 (6)' }], buses: [{ ffs: [0, 1, 2], from: ['R6'] }],
      text: 'Contador mod 6 de tres flip‑flops: cuenta 0–5. Su reloj es Q3 de las unidades de segundo, que tiene un flanco de bajada cada 10 s. La compuerta AND (Q2·Q1) detecta 110 (6) y lo reinicia. Junto con las unidades forma el contador mod 60 de segundos; Q2 cae cada 60 s y avanza los minutos.' },
    um: { tab: 'U min · mod 10', chain: [['um', 4, 'U min']], clk: { name: 'Q2 de D seg', v: (s) => bit(s.ds, 2) }, out: 'Q3 → CLK de D min',
      gates: [{ id: 'R10', ins: [3, 1], det: 'detecta 1010 (10)' }], buses: [{ ffs: [0, 1, 2, 3], from: ['R10'] }],
      text: 'Mismo circuito que las unidades de segundo (mod 10), pero su reloj es Q2 de las decenas de segundo: avanza una vez por minuto. El botón +MIN del Arduino equivale a inyectar un pulso directamente aquí.' },
    dm: { tab: 'D min · mod 6', chain: [['dm', 3, 'D min']], clk: { name: 'Q3 de U min', v: (s) => bit(s.um, 3) }, out: 'Q2 → CLK de horas',
      gates: [{ id: 'R6', ins: [2, 1], det: 'detecta 110 (6)' }], buses: [{ ffs: [0, 1, 2], from: ['R6'] }],
      text: 'Contador mod 6 de decenas de minuto (0–5). Su Q2 cae cada 60 minutos y es el reloj del contador de horas.' },
    h: { tab: 'Horas · mod 24', chain: [['uh', 4, 'U hr'], ['dh', 2, 'D hr']], clk: { name: 'Q2 de D min', v: (s) => bit(s.dm, 2) }, out: null,
      gates: [{ id: 'R24', ins: [5, 2], det: 'D·Q1 · U·Q2 → 24' }, { id: 'R10', ins: [3, 1], det: 'U = 1010 (10)' }],
      buses: [{ ffs: [0, 1, 2, 3], from: ['R24', 'R10'] }, { ffs: [4, 5], from: ['R24'] }],
      text: 'Contador mod 24 formado por las unidades de hora (4 FF, mod 10) y las decenas de hora (2 FF). Las unidades se reinician con R10 al llegar a 10 (y su Q3 avanza las decenas) o con R24. R24 es una AND que detecta 24: decenas = 10 (Q1 = 1) y unidades = 0100 (Q2 = 1); reinicia ambos contadores y el reloj pasa de 23:59:59 a 00:00:00. Usa el botón 23:59:50 del simulador para verlo.' },
  };
  const DET_KEYS = Object.keys(DET);
  const keyOf = (c) => (c === 'uh' || c === 'dh' ? 'h' : c);

  function ffsOf(d) {
    const out = [];
    d.chain.forEach(([c, n, name]) => { for (let i = 0; i < n; i++) out.push({ c, b: i, name }); });
    return out;
  }

  function andPath(x, y) { return `M${x},${y - 24} H${x + 22} A24,24 0 0 1 ${x + 22},${y + 24} H${x} Z`; }
  function orPath(x, y) { return `M${x},${y - 22} Q${x + 14},${y} ${x},${y + 22} Q${x + 30},${y + 22} ${x + 46},${y} Q${x + 30},${y - 22} ${x},${y - 22} Z`; }

  const detailSvg = $('#detailSvg');
  function renderDetail() {
    const d = DET[sel];
    const tr = transient && transient.key === sel && performance.now() < transient.until ? transient.st : null;
    const st = tr || S;
    const ffs = ffsOf(d);
    const n = ffs.length;
    const q = ffs.map((f) => bit(st[f.c], f.b));
    const W = 74, H = 96, P = 128, X0 = 128, Y0 = 92;
    const xs = ffs.map((_, i) => X0 + i * P);
    const tx = (i) => xs[i] + W + 14;
    const busY = d.buses.map((_, b) => Y0 + H + 22 + b * 18);
    const gy = d.gates.map((_, g) => busY[busY.length - 1] + 62 + g * 72);
    const GX = X0 + n * P + 20;
    const needOr = d.buses.some((b) => b.from.length > 1);
    const OX = GX + 196;
    const gv = {};
    d.gates.forEach((g) => { gv[g.id] = g.ins.every((k) => q[k]) ? 1 : 0; });
    const busV = d.buses.map((b) => (b.from.some((id) => gv[id]) ? 1 : 0));
    const clkIn = tr ? 0 : d.clk.v(st);
    const wc = (v) => `w${v ? ' hi' : ''}`;
    const rc = (v) => `w${v ? ' rst' : ''}`;
    const width = (needOr ? OX + 70 : GX + 70) + (d.out ? 150 : 40);
    const height = gy[gy.length - 1] + 46;
    let o = '';

    // reloj de entrada
    o += `<text x="12" y="${Y0 + 58}" class="lbl-strong">${d.clk.name}</text>`;
    o += `<path class="${wc(clkIn)}" d="M12,${Y0 + 68} H${xs[0] - 8}"/>`;

    // flip-flops
    ffs.forEach((f, i) => {
      const x = xs[i];
      const bi = d.buses.findIndex((b) => b.ffs.includes(i));
      // CLR (desde su bus)
      o += `<path class="${rc(busV[bi])}" d="M${x + W / 2},${busY[bi]} V${Y0 + H}"/>`;
      o += `<circle class="dot${busV[bi] ? '' : ''}" cx="${x + W / 2}" cy="${busY[bi]}" r="3" style="fill:${busV[bi] ? 'var(--rst)' : 'var(--lo)'}"/>`;
      // T = 1
      o += `<path class="w hi" d="M${x - 18},${Y0 + 24} H${x}"/><text x="${x - 30}" y="${Y0 + 28}" class="lbl-hi">1</text>`;
      // cuerpo
      o += `<rect class="ff" x="${x}" y="${Y0}" width="${W}" height="${H}" rx="6"/>`;
      o += `<text x="${x + 6}" y="${Y0 + 28}">T</text><text x="${x + W - 16}" y="${Y0 + 32}">Q</text>`;
      o += `<text x="${x + W / 2}" y="${Y0 + H - 8}" text-anchor="middle" style="font-size:10px">CLR</text>`;
      o += `<path d="M${x},${Y0 + 61} L${x + 9},${Y0 + 68} L${x},${Y0 + 75}" fill="none" stroke="#5a6676" stroke-width="1.5"/>`;
      o += `<circle cx="${x - 4}" cy="${Y0 + 68}" r="4" fill="var(--bg)" stroke="#5a6676" stroke-width="1.5"/>`;
      o += `<text x="${x + W / 2 + 4}" y="${Y0 + 55}" text-anchor="middle" class="ffname">FF${i}</text>`;
      // reloj desde el FF anterior
      if (i > 0) o += `<path class="${wc(q[i - 1])}" d="M${xs[i - 1] + W},${Y0 + 28} H${xs[i - 1] + W + 34} V${Y0 + 68} H${x - 8}"/>`;
      // salida del último
      if (i === n - 1) {
        const endX = (needOr ? OX + 70 : GX + 70);
        o += `<path class="${wc(q[i])}" d="M${x + W},${Y0 + 28} H${endX}"/>`;
        if (d.out) o += `<text x="${endX + 8}" y="${Y0 + 32}" class="${q[i] ? 'lbl-hi' : ''}">${d.out}</text>`;
      }
      // tap Q hacia el LED
      o += `<path class="${wc(q[i])}" d="M${tx(i)},${Y0 + 28} V52"/>`;
      o += `<circle class="qled${q[i] ? ' hi' : ''}" cx="${tx(i)}" cy="44" r="8"/>`;
      o += `<text x="${tx(i)}" y="24" text-anchor="middle" class="lbl-strong">${f.name}.Q${f.b}</text>`;
      o += `<text x="${tx(i) + 13}" y="48" class="${q[i] ? 'lbl-hi' : ''}">${q[i]}</text>`;
    });

    // compuertas AND de reset
    d.gates.forEach((g, gi) => {
      const y = gy[gi];
      const m = g.ins.length;
      g.ins.forEach((k, j) => {
        const iy = y - 12 * (m - 1) + j * 24;
        o += `<path class="${wc(q[k])}" d="M${tx(k)},${Y0 + 28} V${iy} H${GX}"/>`;
        o += `<text x="${GX - 46}" y="${iy - 4}" style="font-size:10.5px">${ffs[k].name.split(' ')[0]}.Q${ffs[k].b}</text>`;
      });
      o += `<path class="gate${gv[g.id] ? ' rst' : ''}" d="${andPath(GX, y)}"/>`;
      o += `<text x="${GX + 6}" y="${y + 4}" style="font-size:10px">AND</text>`;
      o += `<text x="${GX - 4}" y="${y - 30}" class="${gv[g.id] ? 'lbl-rst' : 'lbl-strong'}">${g.id}: ${g.det}</text>`;
    });
    // dots en los taps
    ffs.forEach((_, i) => { o += `<circle class="dot${q[i] ? ' hi' : ''}" cx="${tx(i)}" cy="${Y0 + 28}" r="3.2"/>`; });

    // buses de reset
    d.buses.forEach((b, bi) => {
      const xL = xs[Math.min(...b.ffs)] + W / 2;
      if (b.from.length === 1) {
        const g = d.gates.findIndex((x) => x.id === b.from[0]);
        o += `<path class="${rc(busV[bi])}" d="M${GX + 46},${gy[g]} H${GX + 58} V${busY[bi]} H${xL}"/>`;
      } else {
        const [ga, gb] = b.from.map((id) => d.gates.findIndex((x) => x.id === id));
        const oy = (gy[ga] + gy[gb]) / 2;
        o += `<path class="${rc(gv[d.gates[ga].id])}" d="M${GX + 46},${gy[ga]} H${GX + 74} V${oy - 10} H${OX + 6}"/>`;
        o += `<path class="${rc(gv[d.gates[gb].id])}" d="M${GX + 46},${gy[gb]} H${GX + 74} V${oy + 10} H${OX + 6}"/>`;
        o += `<path class="gate${busV[bi] ? ' rst' : ''}" d="${orPath(OX, oy)}"/>`;
        o += `<text x="${OX + 12}" y="${oy + 4}" style="font-size:10px">OR</text>`;
        o += `<path class="${rc(busV[bi])}" d="M${OX + 46},${oy} H${OX + 60} V${busY[bi]} H${xL}"/>`;
      }
      o += `<text x="${xL - 2}" y="${busY[bi] - 5}" style="font-size:10px" class="${busV[bi] ? 'lbl-rst' : ''}" text-anchor="end">CLR</text>`;
    });
    if (tr) o += `<text x="12" y="${height - 14}" class="lbl-rst">Estado transitorio: el contador tocó el valor de reset y la compuerta activa CLR…</text>`;

    detailSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    detailSvg.style.minWidth = `${Math.round(width * 0.78)}px`;
    detailSvg.innerHTML = o;
    $('#detailExplain').textContent = d.text;
  }

  // Diagrama a bloques (cascada)
  const cascadeEl = $('#cascade');
  const CBLK = [
    { c: 'dh', name: 'D hr', mod: 'mod 3*', bits: 2 },
    { arrow: 'Q3', sig: (s) => bit(s.uh, 3) },
    { c: 'uh', name: 'U hr', mod: 'mod 10*', bits: 4 },
    { arrow: 'Q2', sig: (s) => bit(s.dm, 2), gap: true },
    { c: 'dm', name: 'D min', mod: 'mod 6', bits: 3 },
    { arrow: 'Q3', sig: (s) => bit(s.um, 3) },
    { c: 'um', name: 'U min', mod: 'mod 10', bits: 4 },
    { arrow: 'Q2', sig: (s) => bit(s.ds, 2), gap: true },
    { c: 'ds', name: 'D seg', mod: 'mod 6', bits: 3 },
    { arrow: 'Q3', sig: (s) => bit(s.us, 3) },
    { c: 'us', name: 'U seg', mod: 'mod 10', bits: 4 },
    { arrow: 'CLK', sig: () => clkLevel() },
  ];
  function renderCascade() {
    let o = '';
    CBLK.forEach((b) => {
      if (b.arrow) {
        o += `<div class="carrow${b.sig(S) ? ' on' : ''}"><span>${b.arrow}</span><div class="ln"></div><span>${b.sig(S)}</span></div>`;
      } else {
        const v = S[b.c];
        const bits = [];
        for (let i = b.bits - 1; i >= 0; i--) bits.push(`<span class="bit${bit(v, i) ? ' on' : ''}">${bit(v, i)}</span>`);
        o += `<div class="cblock${keyOf(b.c) === sel ? ' sel' : ''}" data-k="${keyOf(b.c)}" role="button" tabindex="0">
          <span class="cname">${b.name}</span><span class="cval">${v}</span><span class="bits">${bits.join('')}</span><span class="cmod">${b.mod}</span></div>`;
      }
    });
    o += `<div class="csrc"><div class="osc">Oscilador<br>1 Hz<br><small>(millis / RTC)</small></div></div>`;
    cascadeEl.innerHTML = o;
  }
  cascadeEl.addEventListener('click', (e) => { const b = e.target.closest('.cblock'); if (b) select(b.dataset.k); });
  cascadeEl.addEventListener('keydown', (e) => { const b = e.target.closest('.cblock'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(b.dataset.k); } });

  // pestañas sincronizadas
  function buildTabs(el) {
    el.innerHTML = DET_KEYS.map((k) => `<button type="button" data-k="${k}">${DET[k].tab}</button>`).join('');
    el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) select(b.dataset.k); });
  }
  buildTabs($('#detailTabs'));
  buildTabs($('#tableCounterTabs'));
  function syncTabs() {
    document.querySelectorAll('#detailTabs button, #tableCounterTabs button').forEach((b) => b.classList.toggle('on', b.dataset.k === sel));
  }
  function select(k) {
    sel = k;
    transient = null;
    syncTabs();
    buildTransTable();
    renderAll(true);
  }

  /* =====================================================================
     TABLA DE VERDAD
     ===================================================================== */
  const ttTrans = $('#ttTrans');
  const bitsStr = (v, n) => v.toString(2).padStart(n, '0').split('');
  const cell = (b, cls = '') => `<td class="${b === '1' ? 'one' : 'zero'} ${cls}">${b}</td>`;

  function curValue() {
    if (sel === 'h') return hours(S);
    return S[sel];
  }
  function buildTransTable() {
    let head = '', body = '';
    if (sel === 'h') {
      head = `<thead><tr class="grp"><th rowspan="2">Hora</th><th colspan="2" class="sep">D hr</th><th colspan="4">U hr</th><th colspan="2" class="sep">D hr⁺</th><th colspan="4">U hr⁺</th><th rowspan="2" class="sep">R10</th><th rowspan="2">R24</th></tr>
        <tr><th class="sep">Q1</th><th>Q0</th><th>Q3</th><th>Q2</th><th>Q1</th><th>Q0</th><th class="sep">Q1</th><th>Q0</th><th>Q3</th><th>Q2</th><th>Q1</th><th>Q0</th></tr></thead>`;
      for (let h = 0; h < 24; h++) {
        const nx = (h + 1) % 24;
        const D = bitsStr(Math.floor(h / 10), 2), U = bitsStr(h % 10, 4);
        const Dn = bitsStr(Math.floor(nx / 10), 2), Un = bitsStr(nx % 10, 4);
        const r10 = h % 10 === 9 ? 1 : 0, r24 = h === 23 ? 1 : 0;
        body += `<tr data-v="${h}"><td>${pad2(h)}</td>${D.map((b, i) => cell(b, i === 0 ? 'sep' : '')).join('')}${U.map((b) => cell(b)).join('')}${Dn.map((b, i) => cell(b, i === 0 ? 'sep' : '')).join('')}${Un.map((b) => cell(b)).join('')}<td class="sep ${r10 ? 'r1' : 'zero'}">${r10}</td><td class="${r24 ? 'r1' : 'zero'}">${r24}</td></tr>`;
      }
      ttTrans.innerHTML = head + `<tbody>${body}</tbody>`;
      setNote('R10 = 1: las unidades pasan por 1010 y se reinician; su Q3 cae y avanza las decenas. R24 = 1: se detecta 24 (10 0100) y se reinician ambos contadores → 00.');
      return;
    }
    const d = DET[sel];
    const nb = d.chain[0][1];
    const N = nb === 4 ? 10 : 6;
    const qs = []; for (let i = nb - 1; i >= 0; i--) qs.push(`Q${i}`);
    const rst = d.gates[0].id;
    const msb = `Q${nb - 1}`;
    head = `<thead><tr class="grp"><th rowspan="2">Dec</th><th colspan="${nb}" class="sep">Estado presente</th><th colspan="${nb}" class="sep">Estado siguiente</th><th rowspan="2" class="sep">Transitorio</th><th rowspan="2">${rst}</th><th rowspan="2">Acarreo<br>(${msb} ↓)</th></tr>
      <tr>${qs.map((x, i) => `<th class="${i === 0 ? 'sep' : ''}">${x}</th>`).join('')}${qs.map((x, i) => `<th class="${i === 0 ? 'sep' : ''}">${x}⁺</th>`).join('')}</tr></thead>`;
    for (let v = 0; v < N; v++) {
      const nx = (v + 1) % N;
      const last = v === N - 1;
      const pres = bitsStr(v, nb), next = bitsStr(nx, nb);
      body += `<tr data-v="${v}"><td>${v}</td>${pres.map((b, i) => cell(b, i === 0 ? 'sep' : '')).join('')}${next.map((b, i) => cell(b, i === 0 ? 'sep' : '')).join('')}
        <td class="sep ${last ? 'r1' : 'zero'}">${last ? bitsStr(N, nb).join('') : '—'}</td><td class="${last ? 'r1' : 'zero'}">${last ? 1 : 0}</td><td class="${last ? 'one' : 'zero'}">${last ? 1 : 0}</td></tr>`;
    }
    ttTrans.innerHTML = head + `<tbody>${body}</tbody>`;
    setNote(`Contador mod ${N}: del estado ${N - 1} el siguiente flanco lo lleva a ${bitsStr(N, nb).join('')} (${N}) por un instante; la compuerta ${rst} activa CLR y queda en ${'0'.repeat(nb)}. En ese momento ${msb} cae de 1 a 0 y da el pulso de reloj al siguiente contador.`);
  }
  function setNote(t) {
    let n = $('#ttNote');
    if (!n) { n = document.createElement('p'); n.id = 'ttNote'; n.className = 'tt-note'; ttTrans.parentElement.after(n); }
    n.textContent = t;
  }
  function highlightTrans() {
    const v = curValue();
    const N = ttTrans.querySelectorAll('tbody tr').length;
    ttTrans.querySelectorAll('tbody tr').forEach((tr) => {
      const r = +tr.dataset.v;
      tr.classList.toggle('cur', r === v);
      tr.classList.toggle('next', r === (v + 1) % N);
    });
  }
  ttTrans.addEventListener('click', (e) => {
    const tr = e.target.closest('tbody tr'); if (!tr) return;
    const v = +tr.dataset.v;
    if (sel === 'h') { S.dh = Math.floor(v / 10); S.uh = v % 10; } else S[sel] = v;
    ver++; logSerial();
  });

  // pestañas de tablas
  $('#tableTabs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $('#tableTabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    $('#tableTrans').hidden = b.dataset.t !== 'trans';
    $('#tableDec').hidden = b.dataset.t !== 'dec';
  });

  // Decodificador BCD → 7 segmentos (7448 / CD4511, cátodo común)
  let decVal = 5;
  const ttDec = $('#ttDec');
  function buildDec() {
    let o = `<thead><tr class="grp"><th colspan="4">Entradas BCD</th><th colspan="7" class="sep">Salidas (1 = encendido)</th><th rowspan="2" class="sep">Display</th></tr>
      <tr><th>D</th><th>C</th><th>B</th><th>A</th>${'abcdefg'.split('').map((s, i) => `<th class="${i === 0 ? 'sep' : ''}">${s}</th>`).join('')}</tr></thead><tbody>`;
    for (let v = 0; v < 16; v++) {
      const inv = v > 9;
      const pat = inv ? '0000000' : DIG[v];
      o += `<tr data-v="${v}" class="${inv ? 'inv' : ''}">${bitsStr(v, 4).map((b) => cell(b)).join('')}${pat.split('').map((b, i) => cell(b, i === 0 ? 'sep' : '')).join('')}<td class="sep">${inv ? 'apagado' : v}</td></tr>`;
    }
    ttDec.innerHTML = o + '</tbody>';
  }
  function renderDec() {
    const dip = $('#dip');
    dip.innerHTML = [3, 2, 1, 0].map((i) => `<div class="sw1${bit(decVal, i) ? ' on' : ''}" data-i="${i}" role="switch" aria-checked="${!!bit(decVal, i)}" tabindex="0"><div class="track"><div class="knob"></div></div><small>${'ABCD'[i]}</small></div>`).join('');
    const pat = decVal > 9 ? '0000000' : DIG[decVal];
    $('#decDigit').innerHTML = digitSVG(pat) + `<div class="segs">DCBA = ${bitsStr(decVal, 4).join('')}<br>abcdefg = ${pat}<br>${decVal > 9 ? 'no es BCD válido' : 'dígito ' + decVal}</div>`;
    ttDec.querySelectorAll('tbody tr').forEach((tr) => tr.classList.toggle('cur', +tr.dataset.v === decVal));
  }
  $('#dip').addEventListener('click', (e) => { const s = e.target.closest('.sw1'); if (!s) return; decVal ^= 1 << +s.dataset.i; renderDec(); });
  $('#dip').addEventListener('keydown', (e) => { const s = e.target.closest('.sw1'); if (s && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); decVal ^= 1 << +s.dataset.i; renderDec(); $(`#dip .sw1[data-i="${s.dataset.i}"]`).focus(); } });
  ttDec.addEventListener('click', (e) => { const tr = e.target.closest('tbody tr'); if (!tr) return; decVal = +tr.dataset.v; renderDec(); });

  /* =====================================================================
     CARTA DE TIEMPOS
     ===================================================================== */
  let tMode = 'detail';
  let win = 24;
  let freeze = false;
  let hoverX = null;
  let tLayout = null;
  const timingSvg = $('#timingSvg');

  const half = (e, h) => (h ? e.after : e.before);
  function signalsFor() {
    const clk = { name: 'CLK 1 Hz', type: 'clk', get: (e, h) => (h ? 0 : 1) };
    if (tMode === 'cascade') {
      return [clk,
        { name: 'U seg.Q3', type: 'bit', get: (e, h) => bit(half(e, h).us, 3) },
        { name: 'D seg.Q2', type: 'bit', get: (e, h) => bit(half(e, h).ds, 2) },
        { name: 'U min.Q3', type: 'bit', get: (e, h) => bit(half(e, h).um, 3) },
        { name: 'D min.Q2', type: 'bit', get: (e, h) => bit(half(e, h).dm, 2) },
        { name: 'Segundos', type: 'bus', get: (e, h) => pad2(secs(half(e, h))) },
        { name: 'Minutos', type: 'bus', get: (e, h) => pad2(mins(half(e, h))) },
        { name: 'Horas', type: 'bus', get: (e, h) => pad2(hours(half(e, h))) }];
    }
    const d = DET[sel];
    const list = [];
    if (sel === 'us') list.push(clk);
    else list.push({ name: `CLK = ${d.clk.name.replace('Q', 'Q').replace(' de ', ' ')}`, type: 'clk', get: (e, h) => d.clk.v(half(e, h)) });
    ffsOf(d).forEach((f) => list.push({ name: `${f.name}.Q${f.b}`, type: 'bit', get: (e, h) => bit(half(e, h)[f.c], f.b) }));
    list.push({ name: sel === 'h' ? 'Horas' : `${d.chain[0][2]} (dec)`, type: 'bus', get: (e, h) => (sel === 'h' ? pad2(hours(half(e, h))) : String(half(e, h)[sel])) });
    return list;
  }

  function renderTiming() {
    const sigs = signalsFor();
    const entries = hist.slice(-win);
    const PW = 980, LW = 132, RW = 12, TOP = 30, RH = 36;
    const tw = (PW - LW - RW) / win;
    const off = win - entries.length;
    const height = TOP + sigs.length * RH + 10;
    let o = '';
    // filas y grid
    sigs.forEach((s, r) => {
      const y = TOP + r * RH;
      if (r % 2 === 0) o += `<rect class="rowbg" x="0" y="${y}" width="${PW}" height="${RH}"/>`;
      o += `<text x="10" y="${y + RH / 2 + 4}" class="name">${s.name}</text>`;
    });
    const step = Math.ceil(win / 12);
    for (let k = 0; k <= win; k++) {
      const x = LW + k * tw;
      o += `<line class="grid" x1="${x}" y1="${TOP - 4}" x2="${x}" y2="${height - 6}"/>`;
      if (k < win) o += `<line class="edge" x1="${x + tw / 2}" y1="${TOP}" x2="${x + tw / 2}" y2="${height - 6}"/>`;
      const e = entries[k - off];
      if (e && k < win && (e.n % step === 0)) o += `<text class="axis" x="${x + 2}" y="${TOP - 10}">t=${e.n}</text>`;
    }
    // ondas
    sigs.forEach((s, r) => {
      const y = TOP + r * RH;
      const yH = y + 7, yL = y + RH - 8;
      if (!entries.length) return;
      const segs = [];
      entries.forEach((e, i) => {
        const k = i + off;
        segs.push({ x: LW + k * tw, v: s.get(e, 0) });
        segs.push({ x: LW + k * tw + tw / 2, v: s.get(e, 1) });
      });
      const xEnd = LW + win * tw;
      if (s.type === 'bus') {
        const runs = [];
        segs.forEach((g, i) => {
          if (runs.length && runs[runs.length - 1].v === g.v) return;
          if (runs.length) runs[runs.length - 1].x2 = g.x;
          runs.push({ x1: g.x, v: g.v, x2: xEnd });
        });
        const ym = (yH + yL) / 2;
        runs.forEach((ru) => {
          const sl = Math.min(4, (ru.x2 - ru.x1) / 2);
          o += `<polygon class="bus" points="${ru.x1},${ym} ${ru.x1 + sl},${yH} ${ru.x2 - sl},${yH} ${ru.x2},${ym} ${ru.x2 - sl},${yL} ${ru.x1 + sl},${yL}"/>`;
          if (ru.x2 - ru.x1 > 20) o += `<text class="bustxt" x="${(ru.x1 + ru.x2) / 2}" y="${ym + 4}" text-anchor="middle">${ru.v}</text>`;
        });
      } else {
        let p = `M${segs[0].x},${segs[0].v ? yH : yL}`;
        let pv = segs[0].v;
        for (let i = 1; i < segs.length; i++) {
          if (segs[i].v !== pv) { p += ` H${segs[i].x} V${segs[i].v ? yH : yL}`; pv = segs[i].v; }
        }
        p += ` H${xEnd}`;
        o += `<path class="wave${s.type === 'clk' ? ' clk' : ''}" d="${p}"/>`;
      }
    });
    o += `<line class="cursor" id="tCursor" x1="0" y1="${TOP - 4}" x2="0" y2="${height - 6}" style="display:none"/>`;
    timingSvg.setAttribute('viewBox', `0 0 ${PW} ${height}`);
    timingSvg.innerHTML = o;
    tLayout = { sigs, entries, LW, tw, off, PW };
    if (hoverX !== null) updateCursor();
    $('#timingExplain').textContent = tMode === 'cascade'
      ? 'Vista de toda la cascada: la línea punteada es el flanco de bajada del CLK, donde ocurre el conteo. Observa cómo U seg.Q3 cae cada 10 s, D seg.Q2 cada 60 s, y cada caída hace avanzar al siguiente contador. Usa 60× o 600× para ver los minutos y las horas.'
      : `Carta de tiempos del contador ${DET[sel].tab}. Cada bit Qn cambia en el flanco de bajada del bit anterior (contador asíncrono), así que Q0 tiene la mitad de la frecuencia del reloj, Q1 la cuarta parte, etc. El renglón azul es el valor del contador como bus.`;
  }

  function updateCursor() {
    const L = tLayout; if (!L) return;
    const cur = $('#tCursor');
    const rel = hoverX - L.LW;
    const k = Math.floor(rel / L.tw);
    const e = L.entries[k - L.off];
    if (rel < 0 || !e) { cur.style.display = 'none'; $('#readout').innerHTML = 'Pasa el cursor sobre la carta para ver los valores.'; return; }
    const h = rel - k * L.tw >= L.tw / 2 ? 1 : 0;
    cur.style.display = '';
    cur.setAttribute('x1', hoverX); cur.setAttribute('x2', hoverX);
    const vals = L.sigs.map((s) => {
      const v = s.get(e, h);
      return `<span>${s.name} = <b class="${v === 1 ? 'v1' : ''}">${v}</b></span>`;
    });
    $('#readout').innerHTML = `<span><b>t = ${e.n}${h ? '.5' : '.0'} s</b> ${h ? '(después del flanco ↓)' : '(CLK alto)'}</span>` + vals.join('');
  }
  timingSvg.addEventListener('pointermove', (ev) => {
    const r = timingSvg.getBoundingClientRect();
    hoverX = (ev.clientX - r.left) * ((tLayout ? tLayout.PW : 980) / r.width);
    updateCursor();
  });
  timingSvg.addEventListener('pointerleave', () => { hoverX = null; const c = $('#tCursor'); if (c) c.style.display = 'none'; });

  $('#timingTabs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    tMode = b.dataset.m;
    $('#timingTabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    renderTiming();
  });
  $('#winSel').addEventListener('change', (e) => { win = +e.target.value; renderTiming(); });
  $('#btnFreeze').addEventListener('click', () => {
    freeze = !freeze;
    $('#btnFreeze').textContent = freeze ? 'Descongelar' : 'Congelar';
    if (!freeze) renderTiming();
  });

  /* =====================================================================
     DIAGRAMA DE CONEXIONES (Arduino)
     ===================================================================== */
  function buildWiring() {
    const svg = $('#wiringSvg');
    svg.setAttribute('viewBox', '0 0 700 500');
    const P = { D2: 64, D3: 118, D4: 160, D5: 186, D6: 212, D7: 238, D8: 264, D9: 290, '5V': 332, GND: 358, A4: 384, A5: 410 };
    const RX = 252, RAIL = 668;
    let o = '';
    o += `<rect x="20" y="36" width="${RX - 20}" height="404" rx="14" fill="#0f3b6e" stroke="#2a5d9a"/>`;
    o += `<text x="40" y="70" style="fill:#e7eaef;font-size:15px;font-weight:600">Arduino UNO</text>`;
    o += `<rect x="40" y="90" width="110" height="60" rx="6" fill="#0b2c52" stroke="#2a5d9a"/><text x="95" y="124" text-anchor="middle" style="fill:#9cc3ee">ATmega328P</text>`;
    o += `<rect x="40" y="396" width="60" height="30" rx="4" fill="#9aa5b3"/><text x="70" y="416" text-anchor="middle" style="fill:#111">USB</text>`;
    Object.entries(P).forEach(([k, y]) => {
      o += `<rect x="${RX - 10}" y="${y - 6}" width="12" height="12" fill="#111" stroke="#666"/>`;
      o += `<text x="${RX - 16}" y="${y + 4}" text-anchor="end" style="fill:#e7eaef">${k}</text>`;
    });
    const wire = (d, color, dash) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" ${dash ? 'stroke-dasharray="6 4"' : ''} stroke-linejoin="round"/>`;
    const dot = (x, y, c) => `<circle cx="${x}" cy="${y}" r="3.5" fill="${c}"/>`;
    // riel GND
    o += wire(`M${RX},${P.GND} H${RAIL} V${P.D2}`, '#9aa5b3');
    o += `<text x="${RAIL - 4}" y="${P.D2 - 12}" text-anchor="end">GND</text>`;
    // botones
    [['D2', '+HORA', '#e04848'], ['D3', '+MIN', '#3d7fe0']].forEach(([pin, lbl, c]) => {
      const y = P[pin];
      o += wire(`M${RX},${y} H330`, c);
      o += `<circle cx="334" cy="${y}" r="4" fill="none" stroke="#ccc" stroke-width="2"/><circle cx="378" cy="${y}" r="4" fill="none" stroke="#ccc" stroke-width="2"/>`;
      o += `<path d="M330,${y - 14} H382 M356,${y - 14} V${y - 22}" stroke="#ccc" stroke-width="2" fill="none"/>`;
      o += `<text x="356" y="${y - 28}" text-anchor="middle" style="fill:${c}">${lbl}</text>`;
      o += wire(`M382,${y} H${RAIL}`, '#9aa5b3');
      o += dot(RAIL, y, '#9aa5b3');
    });
    // LEDs
    ['D4', 'D5', 'D6', 'D7', 'D8', 'D9'].forEach((pin, i) => {
      const y = P[pin];
      o += wire(`M${RX},${y} H300`, '#3ee38f');
      o += `<path d="M300,${y} l5,-6 l8,12 l8,-12 l8,12 l8,-12 l8,12 l5,-6" fill="none" stroke="#d8b25a" stroke-width="2"/>`;
      o += wire(`M350,${y} H440`, '#3ee38f');
      o += `<path d="M440,${y - 8} L456,${y} L440,${y + 8} Z" fill="#3ee38f" stroke="#3ee38f"/><path d="M457,${y - 8} V${y + 8}" stroke="#3ee38f" stroke-width="2"/>`;
      o += `<path d="M448,${y - 10} l6,-6 M453,${y - 9} l6,-6" stroke="#3ee38f" stroke-width="1.4"/>`;
      o += `<text x="472" y="${y + 4}">b${i}</text>`;
      o += wire(`M458,${y} H${RAIL}`, '#9aa5b3');
      o += dot(RAIL, y, '#9aa5b3');
    });
    o += `<text x="325" y="${P.D4 - 14}" text-anchor="middle">220 Ω</text><text x="448" y="${P.D4 - 18}" text-anchor="middle">LED</text>`;
    // bus I2C + alimentación (opcional)
    o += wire(`M${RX},${P['5V']} H640`, '#ff6b6b', true);
    o += wire(`M${RX},${P.A4} H640`, '#c792ea', true);
    o += wire(`M${RX},${P.A5} H640`, '#ffcb6b', true);
    o += `<text x="646" y="${P['5V'] + 4}">5V</text><text x="646" y="${P.A4 + 4}">SDA</text><text x="646" y="${P.A5 + 4}">SCL</text>`;
    const mod = (x, name) => {
      let m = `<rect x="${x}" y="440" width="150" height="46" rx="6" fill="#151920" stroke="#8a94a3" stroke-dasharray="5 4"/>`;
      m += `<text x="${x + 75}" y="478" text-anchor="middle" style="fill:#e7eaef">${name}</text>`;
      [['5V', 18, '#ff6b6b'], ['GND', 52, '#9aa5b3'], ['A4', 86, '#c792ea'], ['A5', 120, '#ffcb6b']].forEach(([pin, dx, c]) => {
        m += wire(`M${x + dx},${P[pin]} V440`, c, true) + dot(x + dx, P[pin], c);
        m += `<text x="${x + dx}" y="456" text-anchor="middle" style="font-size:9.5px">${pin === '5V' ? 'VCC' : pin === 'A4' ? 'SDA' : pin === 'A5' ? 'SCL' : 'GND'}</text>`;
      });
      return m;
    };
    o += mod(300, 'LCD 16×2 I2C');
    o += mod(480, 'RTC DS3231');
    svg.innerHTML = o;
  }

  /* =====================================================================
     CÓDIGO
     ===================================================================== */
  let codeText = '';
  function highlight(src) {
    const re = /(\/\/.*$|\/\*[\s\S]*?\*\/)|(^[ \t]*#\w+.*$)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(void|bool|int|uint8_t|int8_t|unsigned|long|const|struct|return|if|else|for|while|true|false|static|switch|case)\b|\b(\d+)\b/gm;
    let out = '', last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      const cls = m[1] ? 'c' : m[2] ? 'p' : m[3] ? 's' : m[4] ? 'k' : 'n';
      out += `<span class="${cls}">${esc(m[0])}</span>`;
      last = re.lastIndex;
    }
    return out + esc(src.slice(last));
  }
  fetch('arduino/reloj_digital/reloj_digital.ino')
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then((t) => { codeText = t; $('#codeView').innerHTML = `<code>${highlight(t)}</code>`; })
    .catch(() => { $('#codeView').innerHTML = '<code>No se pudo cargar el código aquí. Descárgalo con el botón “Descargar .ino”.</code>'; });
  $('#btnCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(codeText); $('#btnCopy').textContent = '¡Copiado!'; }
    catch { $('#btnCopy').textContent = 'No se pudo copiar'; }
    setTimeout(() => { $('#btnCopy').textContent = 'Copiar'; }, 1600);
  });

  /* =====================================================================
     BUCLE PRINCIPAL
     ===================================================================== */
  let drawnVer = -1, drawnClk = -1, drawnTr = false;
  function renderAll(force) {
    const c = clkLevel();
    const trActive = !!(transient && performance.now() < transient.until);
    const changed = force || ver !== drawnVer;
    if (changed) {
      renderClock(); renderHW(); highlightTrans();
      if (!freeze) renderTiming();
    }
    if (changed || c !== drawnClk) { renderClk(); renderCascade(); }
    if (changed || c !== drawnClk || trActive !== drawnTr || trActive) renderDetail();
    if (!trActive) transient = null;
    drawnVer = ver; drawnClk = c; drawnTr = trActive;
  }

  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(now - lastT, 250);
    lastT = now;
    if (running) {
      let adv = dt * speed, ticks = 0;
      while (adv > 0) {
        const boundary = phase < 500 ? 500 : 1000;
        const need = boundary - phase;
        if (adv >= need) {
          adv -= need;
          if (boundary === 500) {
            phase = 500;
            const b = tick(); ticks++;
            if (speed <= 10) {
              const st = transientFor(b, sel);
              if (st) transient = { key: sel, st, until: performance.now() + 450 };
            }
          } else phase = 0;
        } else { phase += adv; adv = 0; }
      }
      if (ticks) logSerial();
    }
    renderAll(false);
    requestAnimationFrame(frame);
  }

  // inicio
  { // 24 s de historia que terminan en la hora actual (la carta no arranca vacía)
    const d = new Date(Date.now() - 24000);
    const T = { dh: Math.floor(d.getHours() / 10), uh: d.getHours() % 10, dm: Math.floor(d.getMinutes() / 10), um: d.getMinutes() % 10, ds: Math.floor(d.getSeconds() / 10), us: d.getSeconds() % 10 };
    for (let i = 0; i < 24; i++) { const b = { ...T }; advance(T); tickN++; hist.push({ n: tickN, before: b, after: { ...T } }); }
    Object.assign(S, T);
  }
  serialPrint('Reloj digital - Practica 8');
  serialPrint('D2 = +hora, D3 = +minuto, o escribe: T hh:mm:ss');
  logSerial();
  syncTabs();
  buildTransTable();
  buildDec(); renderDec();
  buildWiring();
  renderAll(true);
  ready = true;
  requestAnimationFrame(frame);
})();
