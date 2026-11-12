(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const rooms = PCH.getRooms();
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  $('#year').textContent = new Date().getFullYear();

  const typeSel = $('#type'), genderEl = $('#gender'), inEl = $('#checkin'), outEl = $('#checkout'), bedsEl = $('#beds');
  const quoteEl = $('#quote'), steps = [...document.querySelectorAll('#steps li')];
  let draft = null, details = null;

  // Simple floor-plan drawing: shows how many beds share the room (no photos needed).
  function floorPlan(n) {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 110'); svg.setAttribute('class', 'plan'); svg.setAttribute('aria-hidden', 'true');
    const add = (tag, a) => { const e = document.createElementNS(NS, tag); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); svg.append(e); };
    add('rect', { x: 4, y: 4, width: 192, height: 102, rx: 10, fill: 'none', stroke: 'currentColor', 'stroke-width': 3 });
    const bed = (x, y) => { add('rect', { x, y, width: 30, height: 52, rx: 5, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5 });
      add('rect', { x: x + 6, y: y + 5, width: 18, height: 10, rx: 3, fill: 'currentColor' }); };
    (n === 2 ? [[16, 14], [154, 14]] : [[16, 14], [54, 14], [116, 14], [154, 14]]).forEach(([x, y]) => bed(x, y));
    add('rect', { x: 16, y: 80, width: 40, height: 14, rx: 3, fill: 'currentColor', opacity: .35 });
    add('path', { d: 'M150 106 A 30 30 0 0 1 180 76', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-dasharray': '4 4' });
    return svg;
  }

  // ---------- Room cards + type select ----------
  const t0 = PCH.today(), t1 = PCH.addDays(t0, 1);
  rooms.forEach(r => {
    typeSel.add(new Option(r.name + ' \u2013 ' + PCH.money(r.monthly) + '/mo', r.id));
    const c = el('article', 'card');
    c.append(floorPlan(r.occupancy));
    c.append(el('h3', null, r.name), el('p', null, r.blurb),
      el('p', 'meta', r.occupancy + ' students per room'),
      el('p', 'price', PCH.money(r.monthly * 4) + ' / semester'),
      el('p', 'meta', 'per bed, about ' + PCH.money(r.monthly) + ' a month'),
      el('p', 'pill', 'Men ' + PCH.available(r.id, t0, t1, undefined, 'male') + ' \u00B7 Women ' + PCH.available(r.id, t0, t1, undefined, 'female') + ' beds free tonight'));
    const b = el('button', 'button', 'Book ' + r.name); b.type = 'button';
    b.addEventListener('click', () => { typeSel.value = r.id; syncBeds(); refreshQuote(); $('#book').scrollIntoView({ behavior: 'smooth' }); inEl.focus({ preventScroll: true }); });
    c.append(b);
    $('#room-cards').append(c);
  });

  const current = () => rooms.find(r => r.id === typeSel.value);
  function syncBeds() {
    const t = current(); bedsEl.max = t.occupancy;
    if (+bedsEl.value > t.occupancy) bedsEl.value = t.occupancy;
    $('#beds-help').textContent = '1 to ' + t.occupancy + '. Booking with friends? Book several beds and share one room.';
  }
  inEl.min = t0; outEl.min = PCH.addDays(t0, PCH.MIN_NIGHTS);
  syncBeds();

  // ---------- Quote ----------
  function readStay() { return { typeId: typeSel.value, gender: genderEl.value, checkIn: inEl.value, checkOut: outEl.value, beds: parseInt(bedsEl.value, 10) }; }
  function refreshQuote() {
    document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed',
      String(!!inEl.value && outEl.value === PCH.addMonths(inEl.value, +c.dataset.months))));
    const s = readStay(), t = current();
    quoteEl.className = 'quote'; quoteEl.replaceChildren();
    if (!s.checkIn || !s.checkOut) { quoteEl.textContent = 'Choose your dates to see availability and price.'; return null; }
    const err = PCH.validateStay(t, s.checkIn, s.checkOut, s.beds, undefined, s.gender);
    if (err) { quoteEl.classList.add('bad'); quoteEl.textContent = err; return null; }
    const n = PCH.nightsBetween(s.checkIn, s.checkOut), q = PCH.price(t, n, s.beds);
    quoteEl.classList.add('good');
    quoteEl.append(el('strong', null, PCH.available(t.id, s.checkIn, s.checkOut, undefined, s.gender) + ' beds available'),
      el('span', null, ' for ' + PCH.fmtDate(s.checkIn) + ' to ' + PCH.fmtDate(s.checkOut) + ' (' + n + ' nights). '),
      el('span', null, s.beds + ' bed' + (s.beds > 1 ? 's' : '') + ' × ' + PCH.money(q.perBed) + ' = '),
      el('strong', null, PCH.money(q.total)),
      el('span', null, ' (deposit ' + PCH.money(q.deposit) + ')'));
    return { ...s, nights: n, ...q };
  }
  inEl.addEventListener('change', () => {
    if (inEl.value) {
      const m = PCH.addDays(inEl.value, PCH.MIN_NIGHTS); outEl.min = m;
      if (!outEl.value || outEl.value < m) outEl.value = m;
    }
    refreshQuote();
  });
  [outEl, bedsEl].forEach(e => e.addEventListener('input', refreshQuote));
  document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    if (!inEl.value) {
      quoteEl.className = 'quote bad'; quoteEl.textContent = 'Pick your check-in date first, then choose a stay length.'; inEl.focus(); return;
    }
    outEl.value = PCH.addMonths(inEl.value, +c.dataset.months); refreshQuote();
  }));
  // Mobile "Book a bed" bar: hide it while the booking panel is on screen.
  const sticky = $('#sticky');
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { sticky.classList.toggle('hide', es[0].isIntersecting); }, { threshold: 0.05 }).observe($('#book'));
  }
  typeSel.addEventListener('change', () => { syncBeds(); refreshQuote(); });
  genderEl.addEventListener('change', refreshQuote);

  // ---------- Steps ----------
  const ORDER = ['step1', 'steproom', 'step2', 'step3', 'step4'];
  function show(n) {
    ORDER.forEach((id, i) => { $('#' + id).hidden = i + 1 !== n; });
    steps.forEach((li, i) => { li.classList.toggle('current', i === n - 1); li.classList.toggle('done', i < n - 1); if (i === n - 1) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    $('#book').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  show(1);
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => show(+b.dataset.back)));

  $('#step1').addEventListener('submit', e => {
    e.preventDefault();
    draft = refreshQuote();
    if (!draft) { quoteEl.classList.add('bad'); if (!quoteEl.textContent || quoteEl.textContent.startsWith('Choose your dates')) quoteEl.textContent = 'Please choose your check-in and check-out dates.'; return; }
    draft.roomId = null; buildRoomStep(); show(2);
  });

  // ---------- Choose room: search, browse by floor, or take any available room ----------
  const grid = $('#room-grid'), searchEl = $('#room-search'), noteEl = $('#room-note');
  const roomById = id => PCH.getRoomList().find(r => r.id === id);
  const floorLabel = r => (r.block ? 'Block ' + r.block + ', ' : '') + 'floor ' + r.floor;
  function buildRoomStep() {
    searchEl.value = ''; noteEl.textContent = ''; $('#err-room').textContent = '';
    $('#room-sample').hidden = !PCH.usingSampleRooms();
    $('#room-intro').textContent = PCH.GENDERS[draft.gender] + ' \u00B7 ' + current().name + ' \u00B7 ' + PCH.fmtDate(draft.checkIn) + ' to ' + PCH.fmtDate(draft.checkOut) + ' \u00B7 ' + draft.beds + ' bed' + (draft.beds > 1 ? 's' : '');
    renderRooms(false);
  }
  function renderRooms(keepFocus) {
    const q = searchEl.value.trim().toLowerCase();
    const all = PCH.roomStatus(draft.typeId, draft.gender, draft.checkIn, draft.checkOut);
    const list = all.filter(s => !q || s.room.number.toLowerCase().includes(q));
    const groups = new Map();
    list.forEach(s => { const k = floorLabel(s.room); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
    grid.replaceChildren();
    groups.forEach((items, label) => {
      const sec = el('section', 'floor'), row = el('div', 'room-row'); sec.append(el('h4', null, label));
      items.forEach(({ room, free }) => {
        const ok = free >= draft.beds, status = free === 0 ? 'Full' : ok ? free + ' of ' + room.beds + ' free' : 'Only ' + free + ' free';
        const b = el('button', 'room-tile'); b.type = 'button'; b.dataset.room = room.id; b.disabled = !ok;
        b.setAttribute('aria-pressed', String(draft.roomId === room.id));
        b.setAttribute('aria-label', 'Room ' + room.number + ', ' + status + (ok || free === 0 ? '' : ', not enough beds for your booking'));
        b.append(el('strong', null, room.number), el('span', null, status));
        b.addEventListener('click', () => { draft.roomId = room.id; $('#err-room').textContent = ''; renderRooms(true); });
        row.append(b);
      });
      sec.append(row); grid.append(sec);
    });
    noteEl.textContent = '';
    if (q) {
      if (!list.length) noteEl.textContent = 'No room matches "' + searchEl.value.trim() + '". Clear the search to see all rooms.';
      else {
        const exact = all.find(s => s.room.number.toLowerCase() === q);
        if (exact && exact.free < draft.beds) {
          const near = all.filter(s => s.room.floor === exact.room.floor && s.room.id !== exact.room.id && s.free >= draft.beds).slice(0, 3).map(s => s.room.number);
          noteEl.textContent = 'Room ' + exact.room.number + (exact.free === 0 ? ' is full' : ' has only ' + exact.free + ' bed' + (exact.free === 1 ? '' : 's') + ' free') + ' for these dates.' + (near.length ? ' Free on the same floor: ' + near.join(', ') + '.' : '');
        }
      }
    }
    $('#room-picked').textContent = draft.roomId ? 'Selected: room ' + roomById(draft.roomId).number : 'No room selected yet.';
    $('#room-continue').disabled = !draft.roomId;
    if (keepFocus) { const sel = grid.querySelector('[aria-pressed="true"]'); if (sel) sel.focus(); }
  }
  searchEl.addEventListener('input', () => renderRooms(false));
  $('#any-room').addEventListener('click', () => {
    const r = PCH.autoAssign(draft.typeId, draft.gender, draft.checkIn, draft.checkOut, draft.beds);
    if (!r) { noteEl.textContent = 'No room has ' + draft.beds + ' beds free together. Go back and try fewer beds.'; return; }
    draft.roomId = r.id; searchEl.value = ''; renderRooms(true);
    noteEl.textContent = 'We picked room ' + r.number + ' for you. You can choose a different room if you prefer.';
  });
  $('#steproom').addEventListener('submit', e => {
    e.preventDefault();
    if (!draft.roomId) { $('#err-room').textContent = 'Choose a room, or tap "Give me any available room".'; return; }
    show(3);
  });

  const validPhone = p => { const d = PCH.digits(p); return d.length >= 9 && d.length <= 13; };
  $('#step2').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#name').value.trim(), phone = $('#phone').value.trim(), email = $('#email').value.trim(), err = $('#err2');
    if (name.length < 2) { err.textContent = 'Please enter your full name.'; return $('#name').focus(); }
    if (!validPhone(phone)) { err.textContent = 'Please enter a valid phone number (at least 9 digits).'; return $('#phone').focus(); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Please enter a valid email address.'; return $('#email').focus(); }
    err.textContent = '';
    details = { name, phone, email, notes: $('#notes').value.trim() };
    renderReview(); show(4);
  });

  function summary(b, extra) {
    const dl = el('dl', 'summary');
    const rows = [['Room type', b.typeName || current().name]].concat(b.roomNumber ? [['Room', b.roomNumber]] : [], b.gender ? [['For', PCH.GENDERS[b.gender]]] : [], [['Check-in', PCH.fmtDate(b.checkIn)], ['Check-out', PCH.fmtDate(b.checkOut) + ' (' + b.nights + ' nights)'],
      ['Beds', String(b.beds)], ['Name', b.name || details.name], ['Phone', b.phone || details.phone], ['Total', PCH.money(b.total)], ['Deposit (30%)', PCH.money(b.deposit)]])
      .concat(extra || []);
    rows.forEach(([k, v]) => dl.append(el('dt', null, k), el('dd', null, v)));
    return dl;
  }
  function statusLabel(b) {
    return b.status === 'cancelled' ? 'Cancelled' : b.depositPaid ? 'Confirmed, deposit paid' + (b.payMethod ? ' via ' + b.payMethod : '') : 'Reserved, pay on arrival';
  }
  function renderReview() { $('#review').replaceChildren(el('h3', null, 'Review your booking'), summary({ ...draft, typeName: current().name, name: details.name, phone: details.phone, roomNumber: roomById(draft.roomId).number })); }

  const payNow = () => document.querySelector('input[name=pay]:checked').value === 'now';
  const syncPay = () => { $('#momo').hidden = !payNow(); $('#confirm').textContent = payNow() ? 'Pay deposit ' + (draft ? PCH.money(draft.deposit) : '') : 'Confirm booking'; };
  document.querySelectorAll('input[name=pay]').forEach(r => r.addEventListener('change', syncPay));
  $('#step3').addEventListener('focusin', syncPay);
  $('#step2').addEventListener('submit', () => setTimeout(syncPay, 0));

  $('#step3').addEventListener('submit', e => {
    e.preventDefault();
    const err = $('#err3'), btn = $('#confirm'), paying = payNow();
    if (paying && !validPhone($('#momo-number').value)) { err.textContent = 'Please enter your mobile money number.'; return $('#momo-number').focus(); }
    err.textContent = ''; btn.disabled = true;
    btn.textContent = paying ? 'Waiting for approval on your phone (simulated)...' : 'Saving...';
    setTimeout(() => {
      try {
        const b = PCH.addBooking({ ...draft, ...details, depositPaid: paying, payMethod: paying ? $('#network').value + ' (demo)' : '' });
        $('#done-ref').textContent = b.ref;
        $('#done-title').textContent = b.status === 'confirmed' ? 'Booking confirmed' : 'Bed reserved';
        $('#done-summary').replaceChildren(summary(b, [['Status', statusLabel(b)]]));
        show(5); $('#done-title').focus({ preventScroll: true });
      } catch (ex) {
        const room = draft.roomId && roomById(draft.roomId);
        if (room && PCH.roomFree(room, draft.checkIn, draft.checkOut) < draft.beds) {
          // Someone else took the last bed first: send the student back to pick another room.
          draft.roomId = null; renderRooms(false);
          noteEl.textContent = 'Sorry, room ' + room.number + ' was just taken by someone else. Please choose another room.';
          show(2); $('#room-title').focus({ preventScroll: true });
        } else {
          err.textContent = ex.message + ' Please go back and adjust your booking.';
        }
      } finally { btn.disabled = false; syncPay(); }
    }, paying ? 1500 : 300);
  });
  $('#print').addEventListener('click', () => window.print());
  $('#again').addEventListener('click', () => { $('#step1').reset(); $('#step2').reset(); $('#step3').reset(); draft = details = null; syncBeds(); refreshQuote(); show(1); });

  // ---------- Look up / cancel ----------
  $('#lookup-form').addEventListener('submit', e => {
    e.preventDefault();
    const out = $('#l-result'), err = $('#l-err'); out.replaceChildren(); err.textContent = '';
    const b = PCH.findBooking($('#l-ref').value, $('#l-phone').value);
    if (!b) { err.textContent = 'No booking found. Check the reference and the phone number you booked with.'; return; }
    renderLookup(b);
  });
  function renderLookup(b) {
    const out = $('#l-result'); out.replaceChildren(el('h3', null, 'Booking ' + b.ref), summary(b, [['Status', statusLabel(b)]]));
    if (b.status !== 'cancelled') {
      const c = el('button', 'button danger', 'Cancel this booking'); c.type = 'button';
      c.addEventListener('click', () => {
        if (!confirm('Cancel booking ' + b.ref + '? Your beds will be released.')) return;
        renderLookup(PCH.updateBooking(b.ref, { status: 'cancelled' }));
      });
      out.append(c);
    }
  }
})();
