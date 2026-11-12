/* PC Home Hostel demo data layer. Bookings live in this browser (localStorage).
   Rooms are SAMPLE data: replace SAMPLE_ROOMS with the hostel's real room list. */
(function (global) {
  'use strict';
  const KEY_B = 'pch.bookings.v1', KEY_R = 'pch.rooms.v1', KEY_RL = 'pch.roomlist.v1';
  const MIN_NIGHTS = 7, MAX_NIGHTS = 366, DEPOSIT_RATE = 0.3;
  const mem = {};
  const store = {
    get(k) { try { const v = localStorage.getItem(k); if (v != null) return v; } catch (e) {} return mem[k] != null ? mem[k] : null; },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) {} }
  };
  const readJSON = (k, fb) => { try { const v = store.get(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } };

  // Room TYPES and prices (editable in the manager page).
  const DEFAULT_TYPES = [
    { id: 'double', name: '2 in a room', occupancy: 2, monthly: 450, blurb: 'Share with one other student. Quieter, with more personal space.' },
    { id: 'quad', name: '4 in a room', occupancy: 4, monthly: 300, blurb: 'Share with three other students. The most affordable way to stay.' }
  ];
  const GENDERS = { male: 'Male', female: 'Female' };

  // SAMPLE rooms: Block A is male, Block B is female; 2 floors each; per floor 3 rooms for 2 and 2 rooms for 4.
  const SAMPLE_ROOMS = (() => {
    const out = [];
    [['male', 'A'], ['female', 'B']].forEach(([gender, block]) => {
      for (let floor = 1; floor <= 2; floor++) {
        for (let n = 1; n <= 5; n++) {
          const typeId = n <= 3 ? 'double' : 'quad';
          const number = block + floor + String(n).padStart(2, '0');
          out.push({ id: number, number, block, floor, gender, typeId, beds: typeId === 'double' ? 2 : 4 });
        }
      }
    });
    return out;
  })();

  // The room list the hostel loads in the manager page replaces the sample.
  const savedRooms = () => { const s = readJSON(KEY_RL, null); return Array.isArray(s) && s.length ? s : null; };
  const rooms = () => savedRooms() || SAMPLE_ROOMS;
  const usingSampleRooms = () => !savedRooms();

  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const utc = s => { const [y, m, d] = String(s).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(utc(s));
  const nightsBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
  const addDays = (s, n) => { const d = new Date(utc(s) + n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  const addMonths = (s, n) => {
    const [y, m, d] = s.split('-').map(Number);
    const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
    const t = new Date(Date.UTC(y, m - 1 + n, Math.min(d, last)));
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  };
  const fmtDate = s => new Date(utc(s)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const money = n => 'GH₵ ' + Number(n).toLocaleString('en-GH');

  function getRooms() {
    const saved = readJSON(KEY_R, null);
    if (!Array.isArray(saved)) return DEFAULT_TYPES.map(r => ({ ...r }));
    return DEFAULT_TYPES.map(d => ({ ...d, monthly: (saved.find(s => s.id === d.id) || {}).monthly || d.monthly }));
  }
  function saveRooms(types) { store.set(KEY_R, JSON.stringify(types.map(t => ({ id: t.id, monthly: t.monthly })))); }
  const getRoomList = () => rooms().map(r => ({ ...r }));
  const getBookings = () => { const b = readJSON(KEY_B, []); return Array.isArray(b) ? b : []; };
  const saveBookings = b => store.set(KEY_B, JSON.stringify(b));
  const capacity = t => rooms().filter(r => r.typeId === t.id).length * t.occupancy;

  const overlaps = (b, checkIn, checkOut) => b.status !== 'cancelled' && b.checkIn < checkOut && b.checkOut > checkIn;

  function bedsTaken(typeId, checkIn, checkOut, excludeRef) {
    return getBookings().filter(b => b.typeId === typeId && b.ref !== excludeRef && overlaps(b, checkIn, checkOut)).reduce((n, b) => n + b.beds, 0);
  }
  function roomFree(room, checkIn, checkOut, excludeRef) {
    const taken = getBookings().filter(b => b.roomId === room.id && b.ref !== excludeRef && overlaps(b, checkIn, checkOut)).reduce((n, b) => n + b.beds, 0);
    return Math.max(0, room.beds - taken);
  }
  // Every room of a type and gender with its free beds for the dates.
  function roomStatus(typeId, gender, checkIn, checkOut, excludeRef) {
    return rooms().filter(r => r.typeId === typeId && (!gender || r.gender === gender))
      .map(room => ({ room: { ...room }, free: roomFree(room, checkIn, checkOut, excludeRef) }));
  }
  // Total free beds for a type (optionally one gender).
  function available(typeId, checkIn, checkOut, excludeRef, gender) {
    return roomStatus(typeId, gender, checkIn, checkOut, excludeRef).reduce((n, s) => n + s.free, 0);
  }
  // Best fit: the fullest room that still fits the party, so rooms fill up before new ones open.
  function autoAssign(typeId, gender, checkIn, checkOut, beds, excludeRef) {
    const fits = roomStatus(typeId, gender, checkIn, checkOut, excludeRef).filter(s => s.free >= beds);
    fits.sort((a, b) => a.free - b.free || a.room.number.localeCompare(b.room.number));
    return fits.length ? fits[0].room : null;
  }
  function price(type, nights, beds) {
    const perBed = Math.ceil(type.monthly * nights / 30);
    const total = perBed * beds;
    return { perBed, total, deposit: Math.ceil(total * DEPOSIT_RATE) };
  }
  // Returns an error message, or '' when the stay is valid.
  function validateStay(type, checkIn, checkOut, beds, excludeRef, gender, roomId, opts) {
    if (!type) return 'Please choose a room type.';
    if (!GENDERS[gender]) return 'Please choose Male or Female.';
    if (!validDate(checkIn) || !validDate(checkOut)) return 'Please choose check-in and check-out dates.';
    if (!(opts && opts.skipDates)) {
      if (checkIn < today()) return 'Check-in cannot be in the past.';
      if (checkOut <= checkIn) return 'Check-out must be after check-in.';
      const n = nightsBetween(checkIn, checkOut);
      if (n < MIN_NIGHTS) return 'Minimum stay is ' + MIN_NIGHTS + ' nights.';
      if (n > MAX_NIGHTS) return 'Maximum stay is ' + MAX_NIGHTS + ' nights.';
    }
    if (!Number.isInteger(beds) || beds < 1 || beds > type.occupancy) return 'Choose between 1 and ' + type.occupancy + ' beds.';
    if (roomId) {
      const room = rooms().find(r => r.id === roomId);
      if (!room || room.typeId !== type.id || room.gender !== gender) return 'That room is not available for this booking.';
      const free = roomFree(room, checkIn, checkOut, excludeRef);
      if (free < beds) return free === 0 ? 'Room ' + room.number + ' is full for those dates.' : 'Room ' + room.number + ' has only ' + free + ' bed' + (free === 1 ? '' : 's') + ' free for those dates.';
      return '';
    }
    const total = available(type.id, checkIn, checkOut, excludeRef, gender);
    if (total === 0) return 'Sorry, no beds are free for those dates.';
    if (!autoAssign(type.id, gender, checkIn, checkOut, beds, excludeRef)) return 'No room has ' + beds + ' beds free together. Try fewer beds.';
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
    const err = validateStay(type, d.checkIn, d.checkOut, d.beds, undefined, d.gender, d.roomId);
    if (err) throw new Error(err);
    const room = d.roomId ? rooms().find(r => r.id === d.roomId) : autoAssign(type.id, d.gender, d.checkIn, d.checkOut, d.beds);
    const nights = nightsBetween(d.checkIn, d.checkOut), q = price(type, nights, d.beds);
    const b = {
      ref: makeRef(), typeId: type.id, typeName: type.name, gender: d.gender, roomId: room.id, roomNumber: room.number,
      checkIn: d.checkIn, checkOut: d.checkOut, nights, beds: d.beds,
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
  // Manager moves a student to another room of the same type and gender, after approval.
  function moveBooking(ref, roomId) {
    const b = getBookings().find(x => x.ref === ref);
    if (!b) throw new Error('Booking not found.');
    if (b.status === 'cancelled') throw new Error('A cancelled booking cannot be moved.');
    const room = rooms().find(r => r.id === roomId);
    if (!room) throw new Error('Room not found.');
    if (room.id === b.roomId) throw new Error('This student is already in room ' + room.number + '.');
    const type = getRooms().find(r => r.id === b.typeId);
    const err = validateStay(type, b.checkIn, b.checkOut, b.beds, ref, b.gender, roomId, { skipDates: true });
    if (err) throw new Error(err);
    return updateBooking(ref, { roomId: room.id, roomNumber: room.number });
  }
  // Room list import: one room per line "number, floor, beds, gender".
  function parseRoomCsv(text) {
    const errors = [], out = [], seen = new Set();
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    lines.forEach((line, i) => {
      const c = line.split(',').map(x => x.trim()), at = 'Line ' + (i + 1) + ': ';
      if (i === 0 && /^number$/i.test(c[0])) return;
      if (c.length < 4) return errors.push(at + 'needs 4 columns: number, floor, beds, gender.');
      const [number, floor, beds, gender] = c;
      if (!/^[A-Za-z0-9-]{1,12}$/.test(number)) return errors.push(at + 'room number "' + number + '" can use letters, digits and dashes, up to 12 characters.');
      if (seen.has(number.toUpperCase())) return errors.push(at + 'room ' + number + ' appears twice.');
      const f = Number(floor); if (floor === '' || !Number.isInteger(f) || f < 0 || f > 50) return errors.push(at + 'floor must be a whole number from 0 to 50.');
      const bd = Number(beds); if (bd !== 2 && bd !== 4) return errors.push(at + 'beds must be 2 or 4.');
      const g = gender.toLowerCase(); if (!GENDERS[g]) return errors.push(at + 'gender must be male or female.');
      seen.add(number.toUpperCase());
      out.push({ id: number.toUpperCase(), number: number.toUpperCase(), block: (number.match(/^[A-Za-z]+/) || [''])[0].toUpperCase(), floor: f, gender: g, typeId: bd === 2 ? 'double' : 'quad', beds: bd });
    });
    if (!out.length && !errors.length) errors.push('The list is empty. Add at least one room.');
    if (out.length > 500) errors.push('Too many rooms (500 maximum).');
    return { rooms: out, errors };
  }
  const roomListToCsv = () => ['number,floor,beds,gender'].concat(rooms().map(r => [r.number, r.floor, r.beds, r.gender].join(','))).join('\n');
  const saveRoomList = list => store.set(KEY_RL, JSON.stringify(list));
  const resetRoomList = () => store.del(KEY_RL);
  // Active bookings sitting in a room that is not in the current list.
  function orphanBookings() { const ids = new Set(rooms().map(r => r.id)); return getBookings().filter(b => b.status !== 'cancelled' && b.roomId && !ids.has(b.roomId)); }

  function seedSample() {
    const t = today(), rows = [
      ['double', 'female', 7, 120, 2, 'Ama Mensah', '0244000001', 'confirmed', true],
      ['double', 'male', 20, 150, 1, 'Kwesi Boateng', '0200000002', 'pending', false],
      ['quad', 'male', 3, 100, 4, 'Engineering Year 2 group', '0270000003', 'confirmed', true],
      ['quad', 'female', 10, 130, 2, 'Efua Darko', '0555000004', 'confirmed', true],
      ['quad', 'male', 30, 160, 1, 'Yaw Owusu', '0245000005', 'pending', false],
      ['double', 'male', 45, 200, 2, 'Kojo Asante', '0501000006', 'cancelled', false]
    ];
    rows.forEach(([typeId, gender, start, len, beds, name, phone, status, paid]) => {
      try {
        const b = addBooking({ typeId, gender, checkIn: addDays(t, start), checkOut: addDays(t, start + len), beds, name, phone,
          email: 'sample@example.com', notes: 'Sample data', depositPaid: paid, payMethod: paid ? 'MTN MoMo (demo)' : '' });
        if (status !== b.status) updateBooking(b.ref, { status });
      } catch (e) { /* skip rows that no longer fit */ }
    });
  }
  function resetAll() { store.del(KEY_B); store.del(KEY_R); store.del(KEY_RL); }

  global.PCH = { MIN_NIGHTS, MAX_NIGHTS, DEPOSIT_RATE, GENDERS, today, addDays, addMonths, nightsBetween, fmtDate, money, getRooms, saveRooms,
    getRoomList, getBookings, capacity, bedsTaken, roomFree, roomStatus, available, autoAssign, price, validateStay, addBooking, updateBooking,
    deleteBooking, findBooking, seedSample, resetAll, digits, moveBooking, parseRoomCsv, roomListToCsv, saveRoomList, resetRoomList,
    orphanBookings, usingSampleRooms };
})(window);
