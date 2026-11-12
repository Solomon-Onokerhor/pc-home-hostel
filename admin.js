(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const LABEL = { pending: 'Pending', confirmed: 'Confirmed', cancelled: 'Cancelled' };

  function stats() {
    const box = $('#stats'), all = PCH.getBookings(), live = all.filter(b => b.status !== 'cancelled'), t = PCH.today(), tm = PCH.addDays(t, 1);
    const add = (label, value, sub) => { const c = el('article', 'card'); c.append(el('p', 'meta', label), el('p', 'big', value)); if (sub) c.append(el('p', 'meta', sub)); box.append(c); };
    box.replaceChildren();
    add('Active bookings', String(live.length), all.length - live.length + ' cancelled');
    add('Pending', String(all.filter(b => b.status === 'pending').length), 'awaiting deposit');
    add('Deposits received', PCH.money(live.filter(b => b.depositPaid).reduce((n, b) => n + b.deposit, 0)));
    PCH.getRooms().forEach(r => {
      const cap = PCH.capacity(r), used = PCH.bedsTaken(r.id, t, tm);
      add(r.name + ' tonight', used + ' / ' + cap + ' beds', cap ? Math.round(100 * used / cap) + '% occupied' : '');
    });
  }

  function rows() {
    const q = $('#f-q').value.trim().toLowerCase(), st = $('#f-status').value, tb = $('#rows');
    const list = PCH.getBookings().filter(b => (!st || b.status === st) &&
      (!q || [b.ref, b.name, b.phone, b.email].some(v => String(v).toLowerCase().includes(q))))
      .sort((a, b) => b.created.localeCompare(a.created));
    tb.replaceChildren();
    $('#empty').hidden = PCH.getBookings().length > 0;
    list.forEach(b => {
      const tr = el('tr');
      const cell = (label, content) => { const td = el('td'); td.dataset.label = label; if (content instanceof Node) td.append(content); else td.textContent = content; tr.append(td); return td; };
      cell('Ref', b.ref);
      const g = el('div'); g.append(el('strong', null, b.name), el('br'), el('span', 'meta', b.phone)); cell('Guest', g);
      cell('Type', b.typeName);
      cell('Room', b.roomNumber ? b.roomNumber + (b.gender ? ' (' + b.gender + ')' : '') : '\u2014');
      cell('Dates', PCH.fmtDate(b.checkIn) + ' to ' + PCH.fmtDate(b.checkOut));
      cell('Beds', String(b.beds));
      cell('Total', PCH.money(b.total));
      cell('Deposit', PCH.money(b.deposit) + (b.depositPaid ? ' (paid)' : ' (unpaid)'));
      cell('Status', el('span', 'badge ' + b.status, LABEL[b.status] || b.status));
      const act = el('div', 'row-actions');
      const btn = (text, cls, fn) => { const x = el('button', 'mini ' + (cls || ''), text); x.type = 'button'; x.addEventListener('click', fn); act.append(x); };
      if (b.status !== 'cancelled' && b.roomId) {
        const cands = PCH.roomStatus(b.typeId, b.gender, b.checkIn, b.checkOut, b.ref).filter(s => s.free >= b.beds && s.room.id !== b.roomId);
        const sel = el('select', 'mini'); sel.setAttribute('aria-label', 'Move ' + b.ref + ' to another room');
        sel.append(new Option(cands.length ? 'Move room...' : 'No other room has space', ''));
        sel.disabled = !cands.length;
        cands.forEach(s => sel.append(new Option(s.room.number + ' (' + s.free + ' free)', s.room.id)));
        sel.addEventListener('change', () => {
          if (!sel.value) return;
          const msg = $('#move-msg');
          try { const m = PCH.moveBooking(b.ref, sel.value); msg.className = 'note'; msg.textContent = 'Moved ' + b.name + ' (' + b.ref + ') to room ' + m.roomNumber + '.'; }
          catch (e) { msg.className = 'error'; msg.textContent = e.message; }
          refresh();
        });
        act.append(sel);
      }
      if (b.status !== 'cancelled' && !b.depositPaid) btn('Mark deposit paid', '', () => { PCH.updateBooking(b.ref, { depositPaid: true, status: 'confirmed', payMethod: 'Recorded by manager' }); refresh(); });
      if (b.status === 'pending') btn('Confirm', '', () => { PCH.updateBooking(b.ref, { status: 'confirmed' }); refresh(); });
      if (b.status !== 'cancelled') btn('Cancel', '', () => { if (confirm('Cancel booking ' + b.ref + '?')) { PCH.updateBooking(b.ref, { status: 'cancelled' }); refresh(); } });
      btn('Delete', 'danger', () => { if (confirm('Delete booking ' + b.ref + ' permanently?')) { PCH.deleteBooking(b.ref); refresh(); } });
      cell('Actions', act);
      tb.append(tr);
    });
  }

  function roomsForm() {
    const f = $('#rooms-form'); f.replaceChildren();
    PCH.getRooms().forEach(r => {
      const n = PCH.getRoomList().filter(x => x.typeId === r.id).length;
      const fs = el('fieldset', 'room-set'); fs.append(el('legend', null, r.name + ' (' + n + ' rooms)'));
      const l = el('label', null, 'Price per bed per month (GH\u20B5)'), i = el('input'); i.type = 'number'; i.min = 1; i.step = 1; i.value = r.monthly; i.dataset.id = r.id; i.dataset.key = 'monthly'; l.append(i);
      const g = el('div', 'grid'); g.append(l); fs.append(g); f.append(fs);
    });
    const s = el('button', 'button', 'Save prices'); s.type = 'submit'; f.append(s);
  }
  $('#rooms-form').addEventListener('submit', e => {
    e.preventDefault();
    const rooms = PCH.getRooms(), msg = $('#r-msg'); let ok = true;
    document.querySelectorAll('#rooms-form input').forEach(i => {
      const v = Number(i.value), r = rooms.find(x => x.id === i.dataset.id);
      if (!Number.isInteger(v) || v < (i.dataset.key === 'monthly' ? 1 : 0)) { ok = false; return; }
      r[i.dataset.key] = v;
    });
    if (!ok) { msg.textContent = 'Please enter whole numbers (price at least 1).'; return; }
    PCH.saveRooms(rooms); msg.textContent = 'Saved.'; refresh();
  });

  function csvCell(v) { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  $('#export').addEventListener('click', () => {
    const cols = ['ref', 'status', 'name', 'phone', 'email', 'typeName', 'roomNumber', 'gender', 'checkIn', 'checkOut', 'nights', 'beds', 'total', 'deposit', 'depositPaid', 'payMethod', 'notes', 'created'];
    const csv = [cols.join(',')].concat(PCH.getBookings().map(b => cols.map(c => csvCell(b[c])).join(','))).join('\r\n');
    const a = el('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'pc-home-hostel-bookings.csv';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#seed').addEventListener('click', () => { PCH.seedSample(); refresh(); });
  $('#reset').addEventListener('click', () => { if (confirm('Erase all bookings, saved prices and the saved room list?')) { PCH.resetAll(); roomsForm(); refresh(); rlRefresh(); } });
  $('#f-q').addEventListener('input', rows); $('#f-status').addEventListener('change', rows);

  // Room list: paste the hostel's real rooms; every line is checked before saving.
  function rlRefresh() {
    $('#room-csv').value = PCH.roomListToCsv();
    const o = PCH.orphanBookings().length;
    $('#rl-status').textContent = (PCH.usingSampleRooms() ? 'Showing the SAMPLE room list. ' : 'Using your saved room list. ') + PCH.getRoomList().length + ' rooms.' +
      (o ? ' ' + o + ' active booking' + (o === 1 ? ' is' : 's are') + ' in a room that is not in this list. Use Move room in the bookings table.' : '');
  }
  $('#rl-apply').addEventListener('click', () => {
    const res = PCH.parseRoomCsv($('#room-csv').value), msg = $('#rl-msg');
    if (res.errors.length) { msg.className = 'error'; msg.textContent = res.errors.slice(0, 5).join(' ') + (res.errors.length > 5 ? ' ...and ' + (res.errors.length - 5) + ' more.' : ''); return; }
    PCH.saveRoomList(res.rooms); msg.className = 'note'; msg.textContent = 'Saved ' + res.rooms.length + ' rooms.';
    roomsForm(); refresh(); rlRefresh();
  });
  $('#rl-reset').addEventListener('click', () => { if (confirm('Go back to the sample rooms?')) { PCH.resetRoomList(); $('#rl-msg').textContent = ''; roomsForm(); refresh(); rlRefresh(); } });

  function refresh() { stats(); rows(); }
  roomsForm(); refresh(); rlRefresh();
})();
