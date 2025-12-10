// js/restaurante.js - v7 (Fixed & Clean)

(function () {
  // --- FIREBASE INIT ---
  function ensureFirebase(callback) {
    if (window.firebase && window.firebase.apps.length) { callback(); return; }
    const s1 = document.createElement("script");
    s1.src = "https://www.gstatic.com/firebasejs/9.6.7/firebase-app-compat.js";
    s1.onload = function () {
      const s2 = document.createElement("script");
      s2.src = "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore-compat.js";
      s2.onload = function () { initFirebase(callback); };
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  }

  function initFirebase(callback) {
    const firebaseConfig = {
      apiKey: "AIzaSyAXv_wKD48EFDe8FBQ-6m0XGUNoxSRiTJY",
      authDomain: "mesa-chef-prod.firebaseapp.com",
      projectId: "mesa-chef-prod",
      storageBucket: "mesa-chef-prod.firebasestorage.app",
      messagingSenderId: "43170330072",
      appId: "1:43170330072:web:bcdd09e39930ad08bf2ead"
    };
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    callback();
  }

  let db;
  let currentWeekStart = new Date();
  const cleanDay = currentWeekStart.getDay();
  const diff = currentWeekStart.getDate() - cleanDay + (cleanDay === 0 ? -6 : 1);
  currentWeekStart.setDate(diff);

  let loadedReservations = [];
  const STORAGE_KEY = "mesaChef_hotel";
  const SPACES = ["Restaurante", "Cafeteria"];

  const utils = {
    getWeekDates: (d) => {
      const start = new Date(d);
      const dates = [];
      for (let i = 0; i < 7; i++) {
        let temp = new Date(start);
        temp.setDate(temp.getDate() + i);
        dates.push(temp);
      }
      return dates;
    },
    toIsoDate: (d) => d.toISOString().split('T')[0],
    formatDateES: (d) => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    formatDateShort: (d) => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })
  };

  function startApp() {
    console.log("Restaurante v7: Starting...");
    db = firebase.firestore();

    // 1. HOTEL
    let currentHotel = localStorage.getItem(STORAGE_KEY);
    if (!currentHotel) currentHotel = "Guadiana";

    const headerHotelName = document.getElementById("headerHotelName");
    console.log("DEBUG: looking for headerHotelName", headerHotelName);
    if (headerHotelName) {
      console.log("DEBUG: injection hotel", currentHotel);
      if (currentHotel === "Guadiana") {
        headerHotelName.innerHTML = `
              <img src="Img/logo-guadiana.svg" class="h-8 w-auto object-contain mr-3" alt="Sercotel Guadiana">
              <span class="text-slate-700 font-bold tracking-tight">Sercotel Guadiana</span>
          `;
      } else {
        headerHotelName.innerHTML = `
              <img src="Img/logo-cumbria.svg" class="h-8 w-auto object-contain mr-3" alt="Cumbria Spa">
              <span class="text-slate-700 font-bold tracking-tight">Cumbria Spa&Hotel</span>
          `;
      }
    } else {
      console.error("DEBUG: headerHotelName NOT FOUND");
    }
    const connStatus = document.getElementById("connStatus");
    if (connStatus) connStatus.classList.remove("opacity-50"); // Example logic, or generally just leave it be as style is static mainly.
    // Actually, in salones.js we didn't specifically toggle a class to show it, it's always there. 
    // But the loading logic handles the 'Online' text. Let's match existing logic if possible or ignore if visual only.
    // In startApp, line 69 was showing a label. The new UI has it always visible.
    // We can just remove the old line 69.

    // 2. LISTENERS
    document.getElementById("btnNuevaReserva").addEventListener("click", () => openBooking());
    document.getElementById("btnCerrarModal").addEventListener("click", closeModal);
    document.getElementById("btnAnular").addEventListener("click", anularReservation);
    document.getElementById("formReserva").addEventListener("submit", saveReservation);

    document.getElementById("btnPrev").addEventListener("click", () => changeWeek(-1));
    document.getElementById("btnNext").addEventListener("click", () => changeWeek(1));

    // DYNAMIC TOTALS LISTENERS
    const calcInputs = ["campoPrecio", "campoPax"];
    calcInputs.forEach(id => {
      document.getElementById(id).addEventListener("input", updateTotalDisplay);
    });

    // SERVICE INCLUDED TOGGLE
    document.getElementById("checkServicioIncluido").addEventListener("change", function () {
      if (this.checked) {
        document.getElementById("campoPrecio").value = 0;
        document.getElementById("campoPrecio").disabled = true;
      } else {
        document.getElementById("campoPrecio").disabled = false;
      }
      updateTotalDisplay();
    });

    // PHONE MASK
    if (document.getElementById("campoTelefono")) {
      document.getElementById("campoTelefono").addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '').substring(0, 9);
        if (v.length > 6) v = v.slice(0, 3) + " " + v.slice(3, 6) + " " + v.slice(6);
        else if (v.length > 3) v = v.slice(0, 3) + " " + v.slice(3);
        e.target.value = v;
      });
    }

    // PRINT
    document.getElementById("btnPrintWeek").addEventListener("click", () => printReport('semana'));
    document.getElementById("btnPrintDay").addEventListener("click", () => printReport('dia'));

    // FILTERS
    document.getElementById("filtroEstado").addEventListener("change", () => paintReservations(loadedReservations));
    document.getElementById("txtBuscar").addEventListener("input", function (e) {
      paintReservations(loadedReservations);
      if (typeof doSearch === 'function') doSearch(e.target.value);
    });

    renderGridStructure();
    loadReservations();
  }

  function renderGridStructure() {
    console.log("DEBUG: renderGridStructure started");
    try {
      const grid = document.getElementById("gridRestaurante");
      if (!grid) {
        console.error("DEBUG: gridRestaurante NOT FOUND");
        return;
      }

      const dates = utils.getWeekDates(currentWeekStart);
      const inputSemana = document.getElementById("inputSemana");
      if (inputSemana) inputSemana.value = utils.toIsoDate(dates[0]);

      console.log("DEBUG: Building HTML...");

      let html = ``;
      html += `<div class="grid-header-cell">ESPACIO</div>`;
      dates.forEach(d => {
        html += `<div class="grid-header-cell">${utils.formatDateShort(d)}</div>`;
      });

      SPACES.forEach(space => {
        html += `<div class="space-label pl-4">${space}</div>`;
        dates.forEach(d => {
          const dateStr = utils.toIsoDate(d);

          let lunchPax = 0, dinnerPax = 0;
          let lockLunch = null, lockDinner = null;
          const currentHotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";

          loadedReservations.forEach(r => {
            if (r.hotel && r.hotel !== currentHotel) return;
            const st = (r.estado || 'pendiente').toLowerCase();
            if (st === 'anulada') return;

            let rDate = "";
            if (r.fecha && r.fecha.toDate) rDate = utils.toIsoDate(r.fecha.toDate());
            else if (typeof r.fecha === 'string') rDate = r.fecha;

            if (rDate !== dateStr) return;
            if ((r.espacio || 'Restaurante') !== space) return;

            const t = (r.turno || 'almuerzo').toLowerCase();

            if (r.type === 'lock') {
              if (t === 'almuerzo') lockLunch = r;
              if (t === 'cena') lockDinner = r;
              return;
            }

            const p = parseInt(r.pax) || 0;
            if (t === 'almuerzo') lunchPax += p;
            if (t === 'cena') dinnerPax += p;
          });

          const renderHeader = (isLocked, turno, paxCount, icon) => {
            const paxDisplay = paxCount > 0 ? `<span class="ml-1 font-bold text-slate-600">${paxCount} 👥</span>` : '';
            const lockIcon = isLocked
              ? `<button onclick="toggleLock('${space}', '${dateStr}', '${turno}')" class="text-red-500 hover:text-red-700 p-0.5" title="Desbloquear"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"></path></svg></button>`
              : `<button onclick="toggleLock('${space}', '${dateStr}', '${turno}')" class="text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition p-0.5" title="Bloquear (Completo)"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 016 0v2h-1V7a2 2 0 00-2-2z"></path></svg></button>`;

            const addBtn = isLocked
              ? `<span class="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 rounded border border-red-100">COMPLETO</span>`
              : `<button onclick="openBooking('${space}', '${dateStr}', '${turno}')" class="opacity-0 group-hover:opacity-100 text-blue-600 font-bold bg-blue-50 px-1.5 rounded text-[10px] transition">+</button>`;

            const bgClass = isLocked ? "bg-slate-50 border-red-100" : "";

            return `
                            <div class="turn-cell group ${bgClass} relative">
                                <div class="flex justify-between items-center mb-1">
                                    <div class="flex items-center gap-1">
                                        ${lockIcon}
                                        <span class="text-xs ${turno === 'almuerzo' ? 'text-amber-500' : 'text-slate-400'}">${icon}</span>
                                        ${paxDisplay}
                                    </div>
                                    ${addBtn}
                                </div>
                                <div id="zone_${space}_${dateStr}_${turno}" class="flex flex-col gap-2 ${isLocked ? 'opacity-75 blur-[0.5px] pointer-events-none select-none' : ''}"></div>
                            </div>`;
          };

          html += `<div class="day-column">
                            ${renderHeader(!!lockLunch, 'almuerzo', lunchPax, '☀️')}
                            ${renderHeader(!!lockDinner, 'cena', dinnerPax, '🌙')}
                        </div>`;
        });
      });

      console.log("DEBUG: Setting grid innerHTML. Length:", html.length);
      grid.innerHTML = html;

      if (loadedReservations.length > 0) {
        console.log("DEBUG: Calling paintReservations");
        paintReservations(loadedReservations);
      }
      console.log("DEBUG: renderGridStructure finished");
    } catch (err) {
      console.error("DEBUG: renderGridStructure CRASHED:", err);
      logUI("Render Error: " + err.message);
    }
  }

  // Helper to log to UI
  function logUI(msg) {
    console.log("[Restaurante]", msg);
    const el = document.getElementById("connStatus");
    if (el) {
      const textSpan = el.querySelector("span");
      const indicator = el.querySelector("div");
      if (textSpan) textSpan.innerText = msg;

      // Visual cues
      if (msg.toLowerCase().includes("error") || msg.toLowerCase().includes("fatal")) {
        el.className = "flex items-center gap-2 px-3 py-0.5 bg-red-50 rounded-full border border-red-100";
        if (indicator) indicator.className = "w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse";
        if (textSpan) textSpan.className = "text-[10px] font-bold text-red-700 uppercase tracking-wide";
      } else if (msg.toLowerCase().includes("conectado")) {
        el.className = "flex items-center gap-2 px-3 py-0.5 bg-green-50 rounded-full border border-green-100";
        if (indicator) indicator.className = "w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(34,197,94,0.6)]";
        if (textSpan) textSpan.className = "text-[10px] font-bold text-green-700 uppercase tracking-wide";
      }
    }
  }

  let unsubscribe = null;

  function loadReservations() {
    if (unsubscribe) unsubscribe();
    console.log("DEBUG: loadReservations started");

    // Calculate start/end of current week view
    const dates = utils.getWeekDates(currentWeekStart);
    const start = utils.toIsoDate(dates[0]);
    const end = utils.toIsoDate(dates[6]);
    const hotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";

    console.log(`DEBUG: Querying ${hotel} from ${start} to ${end}`);

    unsubscribe = db.collection("reservas_restaurante")
      .where("hotel", "==", hotel)
      // Removed date filter to avoid 'Requires Index' error. 
      // Filtering is done client-side in paintReservations.
      .onSnapshot(snapshot => {
        loadedReservations = [];
        snapshot.forEach(doc => {
          loadedReservations.push({ id: doc.id, ...doc.data() });
        });
        console.log("DEBUG: Loaded", loadedReservations.length, "reservations");

        // Re-render grid structure (totals) AND paint cards
        renderGridStructure();
        // renderGridStructure calls paintReservations if we fix the logic there,
        // OR we just call paintReservations here.
        // renderGridStructure calculates totals based on loadedReservations.
        // So calling it IS necessary to update headers.
      }, err => {
        console.error("DEBUG: Load Error", err);
        logUI("Error cargando reservas: " + err.message);
      });
  }

  function paintReservations(reservations) {
    if (!reservations) reservations = loadedReservations;
    console.log("DEBUG: paintReservations called with", reservations.length);

    const zones = document.querySelectorAll("[id^='zone_']");
    zones.forEach(z => z.innerHTML = '');

    const hotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
    const filterStatus = document.getElementById("filtroEstado").value;
    const searchText = (document.getElementById("txtBuscar").value || "").toLowerCase();

    // Date range for filtering
    const dates = utils.getWeekDates(currentWeekStart);
    const startStr = utils.toIsoDate(dates[0]);
    const endStr = utils.toIsoDate(dates[6]);

    reservations.forEach(r => {
      // 1. Filter Hotel
      if (r.hotel && r.hotel !== hotel) return;

      // 2. Date
      let rDateStr = "";
      if (r.fecha && r.fecha.toDate) rDateStr = utils.toIsoDate(r.fecha.toDate());
      else if (typeof r.fecha === 'string') rDateStr = r.fecha;

      if (rDateStr < startStr || rDateStr > endStr) return;

      // 3. Status Filter
      const rStatus = (r.estado || "pendiente").toLowerCase();
      if (filterStatus === 'activos') {
        if (rStatus === 'anulada') return;
      } else if (filterStatus !== 'todas') {
        if (rStatus !== filterStatus) return;
      }

      // 4. Search Filter
      if (searchText) {
        const combined = `${r.nombre || ''} ${r.telefono || ''} ${r.id || ''}`.toLowerCase();
        if (!combined.includes(searchText)) return;
      }

      // 5. Paint
      const space = r.espacio || "Restaurante";
      const turno = r.turno || "almuerzo";
      const time = r.hora || "--:--";
      const name = r.nombre || r.cliente || "Sin nombre";
      const pax = r.pax || "?";
      const precio = r.precio || "";

      const zoneId = `zone_${space}_${rDateStr}_${turno}`;
      const zone = document.getElementById(zoneId);

      if (zone) {
        const div = document.createElement("div");
        let border = 'border-l-[3px] border-amber-300';
        if (rStatus === 'confirmada') border = 'border-l-[3px] border-green-500';
        if (rStatus === 'anulada') border = 'border-l-[3px] border-red-500';

        // NEW: Check for recent creation (15 mins) -> Flashing Badge
        let badgeHTML = "";
        if (r.createdAt) {
          const created = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
          const now = new Date();
          const diffMins = (now - created) / 1000 / 60;
          if (diffMins <= 15) {
            badgeHTML = `<span class="badge-nuevo">NUEVO</span>`;
          }
        }

        let priceDisplay = "";
        if (r.servicioIncluido) {
          priceDisplay = '<span class="text-xs font-bold text-blue-600 bg-blue-50 px-1 rounded">Incluido</span>';
        } else if (precio) {
          priceDisplay = precio + '€';
        }

        div.className = `bg-white border border-gray-100 shadow-sm rounded p-1.5 cursor-pointer hover:shadow-md transition text-[10px] ${border} mb-1`;
        div.innerHTML = `
                    <div class="flex justify-between font-bold text-gray-700 pointer-events-none items-center">
                        <div class="flex items-center gap-1">
                            ${badgeHTML}
                            <span>${time}</span>
                        </div>
                        <span>${pax}p</span>
                    </div>
                    <div class="truncate text-gray-500 my-0.5 pointer-events-none" title="${name}">${name}</div>
                    <div class="text-right text-gray-400 font-mono pointer-events-none">${priceDisplay}</div>
                `;
        div.onclick = (e) => { e.stopPropagation(); openBooking(space, rDateStr, turno, r); };
        zone.appendChild(div);
      }
    });
  }

  window.printReport = function (mode) {
    const hotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
    const dates = utils.getWeekDates(currentWeekStart);
    let filterFn;

    if (mode === 'dia') {
      const todayStr = utils.toIsoDate(new Date());
      const startStr = utils.toIsoDate(dates[0]);
      const endStr = utils.toIsoDate(dates[6]);
      let targetDateStr = todayStr;
      if (todayStr < startStr || todayStr > endStr) targetDateStr = startStr;
      const prettyDate = utils.formatDateES(new Date(targetDateStr));
      title = `Informe Diario - ${prettyDate}`;
      filterFn = (r, dateStr) => dateStr === targetDateStr;
    } else {
      const d1 = utils.formatDateES(dates[0]);
      const d2 = utils.formatDateES(dates[6]);
      title = `Informe Semanal (${d1} - ${d2})`;
      filterFn = (r, dateStr) => dateStr >= utils.toIsoDate(dates[0]) && dateStr <= utils.toIsoDate(dates[6]);
    }

    const logoUrl = (hotel === "Guadiana") ? "Img/logo-guadiana.svg" : "Img/logo-cumbria.svg";

    let html = `
            <div style="font-family: sans-serif; padding: 20px;">
                <div style="display:flex; align-items:center; gap:20px; margin-bottom:20px; border-bottom:2px solid #eee; padding-bottom:15px;">
                   <img src="${logoUrl}" style="height:60px; width:auto;">
                   <div>
                        <h1 style="font-size: 24px; font-weight: bold; margin:0; color:#333;">${hotel === "Guadiana" ? "Sercotel Guadiana" : "Cumbria Spa&Hotel"}</h1>
                        <h2 style="font-size: 16px; color: #666; margin:5px 0 0 0;">${title}</h2>
                   </div>
                </div>
    `;

    let rows = [];
    loadedReservations.forEach(r => {
      if (r.hotel && r.hotel !== hotel) return;
      let rDateStr = "";
      if (r.fecha && r.fecha.toDate) rDateStr = utils.toIsoDate(r.fecha.toDate());
      else if (typeof r.fecha === 'string') rDateStr = r.fecha;

      if (filterFn(r, rDateStr) && ['pendiente', 'confirmada'].includes(r.estado)) {
        rows.push({ ...r, dateStr: rDateStr, ts: new Date(rDateStr + 'T' + (r.hora || '00:00')) });
      }
    });
    rows.sort((a, b) => a.ts - b.ts);

    const groups = {};
    rows.forEach(r => {
      if (!groups[r.dateStr]) groups[r.dateStr] = [];
      groups[r.dateStr].push(r);
    });

    const sortedDates = Object.keys(groups).sort();

    if (sortedDates.length === 0) {
      html += `<p style="color:#666; font-style:italic;">No hay reservas para este periodo.</p>`;
    } else {
      sortedDates.forEach(dateStr => {
        const dateObj = new Date(dateStr);
        const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        const dayNameCap = dayName.charAt(0).toUpperCase() + dayName.slice(1);

        html += `<h3 style="font-size: 16px; font-weight: bold; margin-top: 20px; margin-bottom: 10px; color: #2c3e50; border-bottom: 1px solid #ddd; padding-bottom: 5px;">📅 ${dayNameCap}</h3>`;
        html += `<ul style="list-style-type: none; padding-left: 0; margin-bottom: 15px;">`;

        let dailyPax = 0;
        let countLunch = 0;
        let countDinner = 0;
        let countSpecial = 0;

        html += `<table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px;">
                    <thead>
                        <tr style="background: #f1f5f9; color: #475569; text-align: left;">
                            <th style="padding: 6px; width: 45px; border-bottom: 2px solid #ddd;">Hora</th>
                            <th style="padding: 6px; width: 70px; border-bottom: 2px solid #ddd;">Esp.</th>
                            <th style="padding: 6px; width: 130px; border-bottom: 2px solid #ddd;">Cliente</th>
                            <th style="padding: 6px; width: 30px; border-bottom: 2px solid #ddd; text-align:center;">Pax</th>
                            <th style="padding: 6px; border-bottom: 2px solid #ddd;">Notas / Observaciones</th>
                            <th style="padding: 6px; width: 40px; border-bottom: 2px solid #ddd;">Est.</th>
                            <th style="padding: 6px; width: 50px; border-bottom: 2px solid #ddd;">Serv.</th>
                        </tr>
                    </thead>
                    <tbody>`;

        groups[dateStr].forEach(r => {
          const pax = parseInt(r.pax) || 0;
          dailyPax += pax;
          const clientName = r.nombre || r.cliente || "Sin Nombre";
          const time = r.hora || "00:00";
          const space = r.espacio || "Restaurante";
          let statusFull = r.estado || "confirmada";
          let statusAbbr = (statusFull === 'confirmada' || statusFull === 'confirmed') ? 'Conf' : 'Pend';
          const spaceAbbr = space.substring(0, 8) + (space.length > 8 ? '.' : '');
          let notesText = "";
          if (r.notas) {
            if (typeof r.notas === 'string') notesText = r.notas;
            else if (typeof r.notas === 'object') {
              notesText = Object.values(r.notas).filter(v => v && typeof v === 'string').join(". ");
            }
          }
          let type = "Esp.";
          let typeFull = "Especial";
          const hour = parseInt(time.split(':')[0]);
          if (hour >= 12 && hour <= 15) { type = "Alm."; typeFull = "Almuerzo"; }
          else if (hour >= 20) { type = "Cena"; typeFull = "Cena"; }
          if (typeFull === "Almuerzo") countLunch += pax;
          else if (typeFull === "Cena") countDinner += pax;
          else countSpecial += pax;

          html += `<tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 6px; font-weight:bold;">${time}</td>
                    <td style="padding: 6px; color:#555;">${spaceAbbr}</td>
                    <td style="padding: 6px; font-weight:600; color:#333;">${clientName.substring(0, 20)}</td>
                    <td style="padding: 6px; text-align:center;">${pax}</td>
                    <td style="padding: 6px; font-style:italic; color:#444;">${notesText}</td>
                    <td style="padding: 6px;">${statusAbbr}</td>
                    <td style="padding: 6px;">${type}</td>
                   </tr>`;
        });

        html += `</tbody></table>`;

        let parts = [];
        if (countLunch > 0) parts.push(`${countLunch} almuerzo${countLunch > 1 ? 's' : ''}`);
        if (countDinner > 0) parts.push(`${countDinner} cena${countDinner > 1 ? 's' : ''}`);
        if (countSpecial > 0) parts.push(`${countSpecial} especial${countSpecial > 1 ? 'es' : ''}`);
        const breakdown = parts.length > 0 ? `(${parts.join(', ')})` : "";

        html += `<div style="font-size: 13px; font-weight: bold; color: #333; margin-bottom: 30px; background: #fafafa; padding: 10px; border-left: 4px solid #666;">
                    Resumen día ${dateObj.getDate()}: Total ${dailyPax} personas ${breakdown}
                 </div>`;
      });
    }

    html += `
              <div style="margin-top: 20px; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 5px;">
                  Impreso el ${new Date().toLocaleString()}
              </div>
          </div>`;

    const printWindow = window.open('', '', 'height=600,width=800');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Imprimir</title></head><body>');
      printWindow.document.write(html);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.print();
    }
  }

  // RESTORED FUNCTIONS

  function updateTotalDisplay() {
    const price = parseFloat(document.getElementById("campoPrecio").value) || 0;
    const pax = parseInt(document.getElementById("campoPax").value) || 0;
    const total = price * pax;
    const el = document.getElementById("displayTotal");
    if (el) el.innerText = total.toFixed(2) + " €";
  }

  window.openBooking = function (space, dateStr, turno, data) {
    if (!data) {
      const isLocked = loadedReservations.some(r =>
        r.type === 'lock' &&
        r.espacio === space &&
        r.turno === turno &&
        (r.fecha && (r.fecha.toDate ? utils.toIsoDate(r.fecha.toDate()) : r.fecha) === dateStr)
      );
      if (isLocked) {
        alert("⛔ Este turno está BLOQUEADO (Completo). No se pueden añadir más reservas.");
        return;
      }
    }

    const modal = document.getElementById("modalReserva");
    if (!modal) return;
    modal.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const checkServicio = document.getElementById("checkServicioIncluido");
    if (checkServicio) checkServicio.checked = false;

    document.getElementById("campoEstado").value = "confirmada";
    const btnAnular = document.getElementById("btnAnular");
    if (btnAnular) btnAnular.style.display = data ? 'block' : 'none';

    if (data) {
      document.getElementById("campoReferencia").value = data.referencia || data.id || "SIN REF";
      document.getElementById("campoNombre").value = data.nombre || data.cliente || "";
      document.getElementById("campoTelefono").value = data.telefono || "";
      document.getElementById("campoHora").value = data.hora || "";
      document.getElementById("campoPrecio").value = data.precio || "";
      document.getElementById("campoPax").value = data.pax || "";
      document.getElementById("campoNotas").value = typeof data.notas === 'object' ? Object.values(data.notas).join(". ") : (data.notas || "");
      document.getElementById("campoNotaCliente").value = data.notaCliente || "";
      if (data.espacio) document.getElementById("campoEspacio").value = data.espacio;
      if (data.turno) document.getElementById("campoTurno").value = data.turno;
      if (data.estado) document.getElementById("campoEstado").value = data.estado;

      let dVal = dateStr;
      if (!dVal && data.fecha) dVal = data.fecha && data.fecha.toDate ? utils.toIsoDate(data.fecha.toDate()) : data.fecha;
      document.getElementById("campoFecha").value = dVal;
      document.getElementById("campoId").value = data.id;

      const title = document.getElementById("modalTitle");
      if (title) title.innerText = "Editar Reserva";
    } else {
      document.getElementById("campoId").value = "";
      document.getElementById("campoEspacio").value = space || "Restaurante";
      document.getElementById("campoFecha").value = dateStr || utils.toIsoDate(new Date());
      if (turno) document.getElementById("campoTurno").value = turno;
      document.getElementById("campoReferencia").value = "RES-" + Date.now().toString().slice(-6);

      document.getElementById("campoNombre").value = "";
      document.getElementById("campoTelefono").value = "";
      document.getElementById("campoHora").value = "";
      document.getElementById("campoPrecio").value = "";
      document.getElementById("campoPax").value = "";
      document.getElementById("campoNotas").value = "";
      document.getElementById("campoNotaCliente").value = "";

      const title = document.getElementById("modalTitle");
      if (title) title.innerText = "Nueva Reserva";
    }
    updateTotalDisplay();
  };

  window.closeModal = function () {
    document.getElementById("modalReserva").classList.add("hidden");
  };

  window.saveReservation = async function (e) {
    e.preventDefault();
    const nombre = document.getElementById("campoNombre").value.trim();
    const telefono = document.getElementById("campoTelefono").value.trim();
    const fecha = document.getElementById("campoFecha").value;
    if (!nombre || !telefono || !fecha) {
      alert("⚠️ Por favor, completa los campos obligatorios:\n- Nombre\n- Teléfono\n- Fecha");
      return;
    }

    // Past Date Validation
    const eventDate = new Date(fecha);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    eventDate.setHours(0, 0, 0, 0);

    if (eventDate < today) {
      alert("⚠️ No se puede crear una reserva en fecha pasada.");
      return;
    }
    const isServiceIncluded = document.getElementById("checkServicioIncluido").checked;
    let precio = parseFloat(document.getElementById("campoPrecio").value) || 0;
    if (isServiceIncluded) precio = 0;

    const payload = {
      hotel: localStorage.getItem(STORAGE_KEY) || "Guadiana",
      referencia: document.getElementById("campoReferencia").value,
      fecha: firebase.firestore.Timestamp.fromDate(new Date(fecha)),
      espacio: document.getElementById("campoEspacio").value,
      nombre: nombre,
      telefono: telefono,
      hora: document.getElementById("campoHora").value,
      pax: parseInt(document.getElementById("campoPax").value) || 0,
      precio: precio,
      turno: document.getElementById("campoTurno").value,
      estado: document.getElementById("campoEstado").value,
      notas: document.getElementById("campoNotas").value,
      notaCliente: document.getElementById("campoNotaCliente").value,
      servicioIncluido: isServiceIncluded,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!document.getElementById("campoId").value) {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    }

    try {
      const id = document.getElementById("campoId").value;
      if (id) {
        await db.collection("reservas_restaurante").doc(id).update(payload);
      } else {
        await db.collection("reservas_restaurante").add(payload);
      }
      closeModal();
    } catch (err) {
      console.error(err);
      alert("Error al guardar: " + err.message);
    }
  };

  async function anularReservation() {
    const id = document.getElementById("campoId").value;
    if (!id) return;
    if (!confirm("¿Estás seguro de querer ANULAR esta reserva?")) return;
    try {
      await db.collection("reservas_restaurante").doc(id).update({
        estado: 'anulada',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      closeModal();
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  function doSearch(query) {
    const container = document.getElementById("searchResults");
    if (!container) return;

    if (!query) {
      container.classList.add("hidden");
      return;
    }

    const q = query.toLowerCase();
    const results = loadedReservations.filter(r => {
      const combined = `${r.nombre || ''} ${r.cliente || ''} ${r.telefono || ''} ${r.email || ''} ${r.id || ''} ${r.espacio || ''} `.toLowerCase();
      const dateStr = r.fecha && r.fecha.toDate ? utils.toIsoDate(r.fecha.toDate()) : (r.fecha || "");
      return combined.includes(q) || dateStr.includes(q);
    });
    renderSearchResults(results);
  }

  window.toggleLock = async function (space, dateStr, turno) {
    if (!confirm(`¿Cambiar estado de BLOQUEO para ${space} - ${dateStr} - ${turno}?`)) return;
    const currentHotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";

    let existingLockId = null;
    loadedReservations.forEach(r => {
      if (r.type !== 'lock') return;
      if (r.espacio !== space) return;
      if (r.turno !== turno) return;
      let rDate = "";
      if (r.fecha && r.fecha.toDate) rDate = utils.toIsoDate(r.fecha.toDate());
      else if (typeof r.fecha === 'string') rDate = r.fecha;
      if (rDate === dateStr) existingLockId = r.id;
    });

    try {
      if (existingLockId) {
        await db.collection("reservas_restaurante").doc(existingLockId).delete();
      } else {
        await db.collection("reservas_restaurante").add({
          hotel: currentHotel,
          espacio: space,
          fecha: firebase.firestore.Timestamp.fromDate(new Date(dateStr)),
          turno: turno,
          type: 'lock',
          estado: 'COMPLETO',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (err) {
      console.error(err);
      alert("Error al cambiar bloqueo: " + err.message);
    }
  };

  function renderSearchResults(results) {
    const container = document.getElementById("searchResults");
    if (!container) return;
    container.innerHTML = "";

    if (results.length === 0) {
      container.innerHTML = '<div class="p-4 text-center text-slate-400 text-xs">No se encontraron resultados</div>';
    } else {
      // Sort by Date Desc
      results.sort((a, b) => {
        const da = a.fecha && a.fecha.toDate ? a.fecha.toDate() : new Date(a.fecha);
        const db = b.fecha && b.fecha.toDate ? b.fecha.toDate() : new Date(b.fecha);
        return db - da; // Descending
      });

      results.slice(0, 50).forEach(r => {
        const rDate = r.fecha && r.fecha.toDate ? r.fecha.toDate() : new Date(r.fecha);
        const datePretty = utils.formatDateShort(rDate);
        const name = r.nombre || r.cliente || "Sin Nombre";

        const item = document.createElement("div");
        item.className = "p-3 hover:bg-blue-50 cursor-pointer flex justify-between items-center transition border-b border-gray-50 last:border-0";
        item.innerHTML = `
      <div class="flex flex-col">
                      <span class="font-bold text-slate-800 text-sm">${name}</span>
                      <span class="text-[10px] text-slate-500 uppercase">📅 ${datePretty} &bull; ${r.espacio || 'Restaurante'} &bull; ${r.turno}</span>
                  </div>
      <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">${r.estado || 'pendiente'}</span>
    `;
        item.onclick = () => selectSearchResult(r);
        container.appendChild(item);
      });
    }
    container.classList.remove("hidden");
  }

  window.selectSearchResult = function (r) {
    document.getElementById("searchResults").classList.add("hidden");
    const rDate = r.fecha && r.fecha.toDate ? r.fecha.toDate() : new Date(r.fecha);
    const dateStr = utils.toIsoDate(rDate);

    // Navigate (optional, but good for context)
    goToDate(rDate);

    // Open Modal Directly
    // openBooking(space, dateStr, turno, data)
    openBooking(r.espacio || "Restaurante", dateStr, r.turno, r);
  };

  window.goToDate = function (dateObj) {
    const d = new Date(dateObj);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    d.setDate(diff);

    currentWeekStart = d;
    renderGridStructure();
  };

  window.changeWeek = function (offset) {
    currentWeekStart.setDate(currentWeekStart.getDate() + (offset * 7));
    loadReservations(); // Reloads creates the grid structure and fetches data
  };

  // Listen for manual date change
  const inputSemana = document.getElementById("inputSemana");
  if (inputSemana) {
    inputSemana.addEventListener("change", (e) => {
      if (e.target.value) {
        const d = new Date(e.target.value);
        goToDate(d);
      }
    });
  }

  ensureFirebase(startApp);
})();
