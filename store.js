/* PC Home Hostel demo data layer. Bookings live in this browser (localStorage). */
(function (global) {
  'use strict';
  const KEY_B = 'pch.bookings.v1', KEY_R = 'pch.rooms.v1';
  const MIN_NIGHTS = 7, MAX_NIGHTS = 366, DEPOSIT_RATE = 0.3;
  const mem = {};
  const store = {
    get(k) { try { const v = localStorage.getItem(k); if (v != null) return v; } catch (e) {} return mem[k] != null ? mem[k] : null; },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) {} }
  };
  const readJSON = (k, fb) => { try { const v = store.get(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } };

  // DEMO values: the client replaces these in the admin page.
  const DEFAULT_ROOMS = [
    { id: 'double', name: '2 in a room', occupancy: 2, rooms: 10, monthly: 450,
      blurb: 'Share with one other student. Quieter, with more personal space.' },
    { id: 'quad', name: '4 in a room', occupancy: 4, rooms: 8, monthly: 300,
      blurb: 'Share with three other students. The most affordable way to stay.' }
  ];

  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const utc = s => { const [y, m, d] = String(s).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(utc(s));
  const nightsBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
  const addDays = (s, n) => { const d = new Date(utc(s) + n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  const fmtDate = s => new Date(utc(s)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const money = n => 'GH₵ ' + Number(n).toLocaleString('en-GH');

  function getRooms() {
    const saved = readJSON(KEY_R, null);
    if (!Array.isArray(saved)) return DEFAULT_ROOMS.map(r => ({ ...r }));
    return DEFAULT_ROOMS.map(d => ({ ...d, ...(saved.find(s => s.id === d.id) || {}) }));
  }
  function saveRooms(rooms) { store.set(KEY_R, JSON.stringify(rooms)); }
  const getBookings = () => { const b = readJSON(KEY_B, []); return Array.isArray(b) ? b : []; };
  const saveBookings = b => store.set(KEY_B, JSON.stringify(b));
  const capacity = t => t.rooms * t.occupancy;

  function bedsTaken(typeId, checkIn, checkOut, excludeRef) {
    return getBookings()
      .filter(b => b.typeId === typeId && b.status !== 'cancelled' && b.ref !== excludeRef &&
                   b.checkIn < checkOut && b.checkOut > checkIn)
      .reduce((n, b) => n + b.beds, 0);
  }
  function available(typeId, checkIn, checkOut, excludeRef) {
    const t = getRooms().find(r => r.id === typeId);
    return t ? Math.max(0, capacity(t) - bedsTaken(typeId, checkIn, checkOut, excludeRef)) : 0;
  }
  function price(type, nights, beds) {
    const perBed = Math.ceil(type.monthly * nights / 30);
    const total = perBed * beds;
    return { perBed, total, deposit: Math.ceil(total * DEPOSIT_RATE) };
  }
  // Returns an error message, or '' when the stay is valid.
  function validateStay(type, checkIn, checkOut, beds, excludeRef) {
    if (!type) return 'Please choose a room type.';
    if (!validDate(checkIn) || !validDate(checkOut)) return 'Please choose check-in and check-out dates.';
    if (checkIn < today()) return 'Check-in cannot be in the past.';
    if (checkOut <= checkIn) return 'Check-out must be after check-in.';
    const n = nightsBetween(checkIn, checkOut);
    if (n < MIN_NIGHTS) return 'Minimum stay is ' + MIN_NIGHTS + ' nights.';
    if (n > MAX_NIGHTS) return 'Maximum stay is ' + MAX_NIGHTS + ' nights.';
    if (!Number.isInteger(beds) || beds < 1 || beds > type.occupancy) return 'Choose between 1 and ' + type.occupancy + ' beds.';
    const free = available(type.id, checkIn, checkOut, excludeRef);
    if (free < beds) return free === 0 ? 'Sorry, no beds are free for those dates.' : 'Only ' + free + ' bed' + (free === 1 ? '' : 's') + ' free for those dates.';
    return '';
  }
  function makeRef() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', used = new Set(getBookings().map(b => b.ref));
    let ref;
    do {
      const a = new Uint32Array(6); (global.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => a[i] = Math.random() * 4294967296);
      ref = 'PCH-' + Array.from(a, v => chars[v % chars.length]).join('');
    } while (used.has(ref));
    return ref;
  }
  function addBooking(d) {
    const type = getRooms().find(r => r.id === d.typeId);
    const err = validateStay(type, d.checkIn, d.checkOut, d.beds);
    if (err) throw new Error(err);
    const nights = nightsBetween(d.checkIn, d.checkOut), q = price(type, nights, d.beds);
    const b = {
      ref: makeRef(), typeId: type.id, typeName: type.name, checkIn: d.checkIn, checkOut: d.checkOut, nights, beds: d.beds,
      name: d.name, phone: d.phone, email: d.email, notes: d.notes || '', total: q.total, deposit: q.deposit,
      depositPaid: !!d.depositPaid, payMethod: d.payMethod || '', status: d.depositPaid ? 'confirmed' : 'pending',
      created: new Date().toISOString()
    };
    const all = getBookings(); all.push(b); saveBookings(all);
    return b;
  }
  function updateBooking(ref, patch) {
    const all = getBookings(), i = all.findIndex(b => b.ref === ref);
    if (i < 0) return null;
    all[i] = { ...all[i], ...patch }; saveBookings(all); return all[i];
  }
  function deleteBooking(ref) { saveBookings(getBookings().filter(b => b.ref !== ref)); }
  const digits = s => String(s || '').replace(/\D/g, '');
  function findBooking(ref, phone) {
    const r = String(ref || '').trim().toUpperCase(), p = digits(phone).slice(-9);
    if (!r || p.length < 9) return null;
    return getBookings().find(b => b.ref === r && digits(b.phone).slice(-9) === p) || null;
  }
  function seedSample() {
    const t = today(), rows = [
      ['double', 7, 120, 2, 'Ama Mensah', '0244000001', 'confirmed', true],
      ['double', 20, 150, 1, 'Kwesi Boateng', '0200000002', 'pending', false],
      ['quad', 3, 100, 4, 'Engineering Year 2 group', '0270000003', 'confirmed', true],
      ['quad', 10, 130, 2, 'Yaw Owusu', '0555000004', 'confirmed', true],
      ['quad', 30, 160, 1, 'Efua Darko', '0245000005', 'pending', false],
      ['double', 45, 200, 2, 'Kojo Asante', '0501000006', 'cancelled', false]
    ];
    rows.forEach(([typeId, start, len, beds, name, phone, status, paid]) => {
      try {
        const b = addBooking({ typeId, checkIn: addDays(t, start), checkOut: addDays(t, start + len), beds, name, phone,
          email: 'sample@example.com', notes: 'Sample data', depositPaid: paid, payMethod: paid ? 'MTN MoMo (demo)' : '' });
        if (status !== b.status) updateBooking(b.ref, { status });
      } catch (e) { /* skip rows that no longer fit */ }
    });
  }
  function resetAll() { store.del(KEY_B); store.del(KEY_R); }

  global.PCH = { MIN_NIGHTS, MAX_NIGHTS, DEPOSIT_RATE, today, addDays, nightsBetween, fmtDate, money, getRooms, saveRooms,
    getBookings, capacity, bedsTaken, available, price, validateStay, addBooking, updateBooking, deleteBooking, findBooking,
    seedSample, resetAll, digits };
})(window);
