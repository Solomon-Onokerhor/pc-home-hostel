(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const rooms = PCH.getRooms();
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  $('#year').textContent = new Date().getFullYear();

  const typeSel = $('#type'), inEl = $('#checkin'), outEl = $('#checkout'), bedsEl = $('#beds');
  const quoteEl = $('#quote'), steps = [...document.querySelectorAll('#steps li')];
  let draft = null, details = null;

  // ---------- Room cards + type select ----------
  const t0 = PCH.today(), t1 = PCH.addDays(t0, 1);
  rooms.forEach(r => {
    typeSel.add(new Option(r.name + ' \u2013 ' + PCH.money(r.monthly) + '/mo', r.id));
    const c = el('article', 'card');
    c.append(el('h3', null, r.name), el('p', null, r.blurb),
      el('p', 'meta', r.occupancy + ' students per room'),
      el('p', 'price', 'From ' + PCH.money(r.monthly) + ' / month per bed'),
      el('p', 'meta', PCH.available(r.id, t0, t1) + ' beds free tonight'));
    const b = el('button', 'button', 'Book ' + r.name); b.type = 'button';
    b.addEventListener('click', () => { typeSel.value = r.id; syncBeds(); refreshQuote(); $('#book').scrollIntoView({ behavior: 'smooth' }); inEl.focus({ preventScroll: true }); });
    c.append(b);
    $('#room-cards').append(c);
  });

  const current = () => rooms.find(r => r.id === typeSel.value);
  function syncBeds() {
    const t = current(); bedsEl.max = t.occupancy;
    if (+bedsEl.value > t.occupancy) bedsEl.value = t.occupancy;
    $('#beds-help').textContent = '1 to ' + t.occupancy + ' (up to a full room for friends sharing)';
  }
  inEl.min = t0; outEl.min = PCH.addDays(t0, PCH.MIN_NIGHTS);
  syncBeds();

  // ---------- Quote ----------
  function readStay() { return { typeId: typeSel.value, checkIn: inEl.value, checkOut: outEl.value, beds: parseInt(bedsEl.value, 10) }; }
  function refreshQuote() {
    const s = readStay(), t = current();
    quoteEl.className = 'quote'; quoteEl.replaceChildren();
    if (!s.checkIn || !s.checkOut) { quoteEl.textContent = 'Choose your dates to see availability and price.'; return null; }
    const err = PCH.validateStay(t, s.checkIn, s.checkOut, s.beds);
    if (err) { quoteEl.classList.add('bad'); quoteEl.textContent = err; return null; }
    const n = PCH.nightsBetween(s.checkIn, s.checkOut), q = PCH.price(t, n, s.beds);
    quoteEl.classList.add('good');
    quoteEl.append(el('strong', null, PCH.available(t.id, s.checkIn, s.checkOut) + ' beds available'),
      el('span', null, ' for ' + n + ' nights. '),
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
  typeSel.addEventListener('change', () => { syncBeds(); refreshQuote(); });

  // ---------- Steps ----------
  function show(n) {
    [1, 2, 3, 4].forEach(i => { $('#step' + i).hidden = i !== n; });
    steps.forEach((li, i) => { li.classList.toggle('current', i === n - 1); li.classList.toggle('done', i < n - 1); if (i === n - 1) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    $('#book').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  show(1);
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => show(+b.dataset.back)));

  $('#step1').addEventListener('submit', e => {
    e.preventDefault();
    draft = refreshQuote();
    if (!draft) { quoteEl.classList.add('bad'); if (!quoteEl.textContent || quoteEl.textContent.startsWith('Choose your dates')) quoteEl.textContent = 'Please choose your check-in and check-out dates.'; return; }
    show(2);
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
    renderReview(); show(3);
  });

  function summary(b, extra) {
    const dl = el('dl', 'summary');
    const rows = [['Room type', b.typeName || current().name], ['Check-in', PCH.fmtDate(b.checkIn)], ['Check-out', PCH.fmtDate(b.checkOut) + ' (' + b.nights + ' nights)'],
      ['Beds', String(b.beds)], ['Name', b.name || details.name], ['Phone', b.phone || details.phone], ['Total', PCH.money(b.total)], ['Deposit (30%)', PCH.money(b.deposit)]]
      .concat(extra || []);
    rows.forEach(([k, v]) => dl.append(el('dt', null, k), el('dd', null, v)));
    return dl;
  }
  function statusLabel(b) {
    return b.status === 'cancelled' ? 'Cancelled' : b.depositPaid ? 'Confirmed, deposit paid' + (b.payMethod ? ' via ' + b.payMethod : '') : 'Reserved, pay on arrival';
  }
  function renderReview() { $('#review').replaceChildren(el('h3', null, 'Review your booking'), summary({ ...draft, typeName: current().name, name: details.name, phone: details.phone })); }

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
        show(4); $('#done-title').focus({ preventScroll: true });
      } catch (ex) {
        err.textContent = ex.message + ' Please go back and adjust your dates.';
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
