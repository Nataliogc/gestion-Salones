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
  // [MODIFIED] Do not force to Monday on init, so we keep "Today" as selected
  // const cleanDay = currentWeekStart.getDay();
  // const diff = currentWeekStart.getDate() - cleanDay + (cleanDay === 0 ? -6 : 1);
  // currentWeekStart.setDate(diff);

  let loadedReservations = [];
  const STORAGE_KEY = "mesaChef_hotel";
  const SPACES = ["Restaurante", "Cafeteria"];

  const utils = {
    getWeekDates: (d) => {
      const start = new Date(d);
      // [NEW] Calculate Monday dynamically
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);

      const dates = [];
      for (let i = 0; i < 7; i++) {
        let temp = new Date(start);
        temp.setDate(temp.getDate() + i);
        dates.push(temp);
      }
      return dates;
    },
    toIsoDate: (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    },
    formatDateES: (d) => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    formatDateShort: (d) => d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
    formatDateTime: (ts) => {
      if (!ts) return "-";
      let d;
      if (ts.toDate) d = ts.toDate();
      else if (ts instanceof Date) d = ts;
      else d = new Date(ts);
      if (isNaN(d.getTime())) return "-";
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    }
  };

  let restaurantConfig = {}; // Global Config
  let specialDatesConfig = []; // [NEW] Special Capacity Dates
  let whatsappTemplate = ''; // WhatsApp message template

  async function loadRestaurantConfig() {
    try {
      const doc = await db.collection("master_data").doc("CONFIG_SALONES").get();
      if (doc.exists) {
        const data = doc.data();
        restaurantConfig = data.horarios || {};
        // Load hotel-specific configs
        const hotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
        const specialKey = 'restauranteEspecial' + hotel;
        const whatsappKey = 'whatsappTemplate' + hotel;
        specialDatesConfig = data[specialKey] || [];
        whatsappTemplate = data[whatsappKey] || '';
        console.log("DEBUG: Restaurant Config Loaded", restaurantConfig, "Special Dates (" + hotel + "):", specialDatesConfig, "WhatsApp Template:", whatsappTemplate ? "✓" : "✗");
      }
    } catch (e) { console.error("Config Load Error", e); }
  }

  // Auto-fill time based on Turn and Config
  function autoSetTime(turno) {
    const t = (turno || 'almuerzo').toLowerCase();
    const field = document.getElementById("campoHora");
    if (!field) return;

    let time = "13:00"; // Fallback
    if (t === 'almuerzo') time = restaurantConfig.almIni || "13:00";
    if (t === 'cena') time = restaurantConfig.cenaIni || "20:30";

    field.value = time;
  }

  async function startApp() {
    console.log("Restaurante v7: Starting...");
    db = firebase.firestore();

    await loadRestaurantConfig(); // <--- Load Config

    // Event Listener for Auto-Time
    const turnoSelect = document.getElementById("campoTurno");
    if (turnoSelect) {
      turnoSelect.addEventListener("change", (e) => {
        autoSetTime(e.target.value);
      });
    }

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
    const calcInputs = ["campoPrecio", "campoPax", "campoNinos", "campoPrecioNinos"];
    calcInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", updateTotalDisplay);
    });

    // SERVICE INCLUDED TOGGLE
    document.getElementById("checkServicioIncluido").addEventListener("change", function () {
      if (this.checked) {
        document.getElementById("campoPrecio").value = "0,00"; // [MODIFIED] ES Format
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
      // [FIX] Show current SELECTED date in input, not just Monday
      if (inputSemana) inputSemana.value = utils.toIsoDate(currentWeekStart);

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

            const p = (parseInt(r.pax) || 0) + (parseInt(r.ninos) || 0);
            if (t === 'almuerzo') lunchPax += p;
            if (t === 'cena') dinnerPax += p;
          });

          const renderHeader = (isLocked, turno, paxCount, icon) => {
            const tName = (turno || 'almuerzo').toLowerCase();
            const special = specialDatesConfig.find(sd => sd.date === dateStr);
            let maxCap = 0;
            if (special) {
              if (space === 'Restaurante') {
                maxCap = tName === 'almuerzo' ? (special.lunchMax || 0) : (special.dinnerMax || 0);
              } else if (space === 'Cafeteria') {
                maxCap = tName === 'almuerzo' ? (special.cafLunchMax || 0) : (special.cafDinnerMax || 0);
              }
            }

            let paxDisplay = paxCount > 0 ? `<span class="ml-1 font-bold text-slate-600">${paxCount} 👥</span>` : '';
            if (maxCap > 0) {
              const remaining = maxCap - paxCount;
              const capColor = remaining <= 0 ? 'text-red-600' : (remaining <= maxCap * 0.2 ? 'text-amber-600' : 'text-blue-600');

              const remainingText = remaining <= 0 ? 'AFORO COMPLETO' : `Quedan ${remaining} pers.`;
              paxDisplay = `
                <div class="flex flex-col items-start ml-1 leading-[1.1] py-0.5">
                  <span class="text-[10px] font-bold ${capColor}">${paxCount} Van / ${maxCap} Máx.</span>
                  <span class="text-[9px] font-semibold opacity-90 ${capColor}">${remainingText}</span>
                </div>`;
            }

            const lockIcon = isLocked
              ? `<button onclick="toggleLock('${space}', '${dateStr}', '${turno}')" class="text-red-500 hover:text-red-700 p-0.5" title="Desbloquear"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"></path></svg></button>`
              : `<button onclick="toggleLock('${space}', '${dateStr}', '${turno}')" class="text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition p-0.5" title="Bloquear (Completo)"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 016 0v2h-1V7a2 2 0 00-2-2z"></path></svg></button>`;

            // [MODIFIED] Logic for Past/Blocked
            // Check if it is "Lunch" today and time is past 18:00
            const now = new Date();
            const todayIso = utils.toIsoDate(now);
            const currentHour = now.getHours();

            let istimeBlocked = false;
            // Rule: Block "Almuerzo" if it is today and past 18:00
            if (dateStr === todayIso && turno === 'almuerzo' && currentHour >= 18) {
              istimeBlocked = true;
            }

            const isPast = dateStr < todayIso || istimeBlocked;
            const shadeClass = isPast && !isLocked ? "bg-slate-100 text-slate-400" : ""; // Added text-slate-400 for better "disabled" look
            const bgClass = isLocked ? "bg-slate-50 border-red-100" : shadeClass;

            const addBtn = isLocked || isPast
              ? (isLocked ? `<span class="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 rounded border border-red-100">COMPLETO</span>` : ``)
              : `<button onclick="openBooking('${space}', '${dateStr}', '${turno}')" class="opacity-0 group-hover:opacity-100 text-blue-600 font-bold bg-blue-50 px-1.5 rounded text-[10px] transition">+</button>`;

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
                                <div id="zone_${space}_${dateStr}_${turno}" class="flex flex-col gap-2 ${isLocked ? 'opacity-75 blur-[0.5px]' : ''}"></div>
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

    // Sort by time (HH:mm string comparison)
    // We use a copy to avoid mutating the original array if it's used elsewhere
    const sortedReservations = [...reservations].sort((a, b) => {
      const timeA = a.hora || "99:99";
      const timeB = b.hora || "99:99";
      return timeA.localeCompare(timeB);
    });

    console.log("DEBUG: paintReservations called with", sortedReservations.length);

    const zones = document.querySelectorAll("[id^='zone_']");
    zones.forEach(z => z.innerHTML = '');

    const hotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
    const filterStatus = document.getElementById("filtroEstado").value;
    const searchText = (document.getElementById("txtBuscar").value || "").toLowerCase();

    // Date range for filtering
    const dates = utils.getWeekDates(currentWeekStart);
    const startStr = utils.toIsoDate(dates[0]);
    const endStr = utils.toIsoDate(dates[6]);

    sortedReservations.forEach(r => {
      // 1. Filter Hotel & Locks
      if (r.hotel && r.hotel !== hotel) return;
      if (r.type === 'lock') return; // Do not paint locks as cards

      // 2. Date
      let rDateStr = "";
      if (r.fecha && r.fecha.toDate) rDateStr = utils.toIsoDate(r.fecha.toDate());
      else if (typeof r.fecha === 'string') rDateStr = r.fecha;

      if (rDateStr < startStr || rDateStr > endStr) return;

      // 3. Status Filter
      const rStatus = (r.estado || "pendiente").toLowerCase();
      if (filterStatus === 'activos') {
        if (rStatus === 'anulada' || rStatus === 'no-presentado') return;
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
      const totalPax = (parseInt(r.pax) || 0) + (parseInt(r.ninos) || 0);
      const pax = totalPax || r.pax || "?";
      const precio = r.precio || "";

      const zoneId = `zone_${space}_${rDateStr}_${turno}`;
      const zone = document.getElementById(zoneId);

      if (zone) {
        const div = document.createElement("div");
        let border = 'border-l-[3px] border-amber-300';
        if (rStatus === 'confirmada') border = 'border-l-[3px] border-green-500';
        if (rStatus === 'anulada') border = 'border-l-[3px] border-red-500';
        if (rStatus === 'no-presentado') border = 'border-l-[3px] border-slate-400';

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

        // CHECK NOTES
        let notesIcon = "";
        const notasStr = (typeof r.notas === 'string') ? r.notas : "";
        if (notasStr.trim().length > 0) {
          notesIcon = `<span title="${notasStr}" class="ml-1 text-[10px] cursor-help">📝</span>`;
        }

        div.className = `bg-white border border-gray-100 shadow-sm rounded p-1.5 cursor-pointer hover:shadow-md transition text-[10px] ${border} mb-1`;
        div.className = `bg-white border border-gray-100 shadow-sm rounded p-1.5 cursor-pointer hover:shadow-md transition text-[10px] ${border} mb-1`;
        div.innerHTML = `
                    <div class="flex justify-between font-bold text-gray-700 pointer-events-none items-center mb-1">
                        <div class="flex items-center gap-1">
                            ${badgeHTML}
                            <span>${time}</span>
                        </div>
                        <span class="bg-gray-100 px-1 rounded text-gray-600">${pax}p</span>
                    </div>
                    
                    <div class="truncate font-bold text-slate-800 text-xs mb-1 pointer-events-none w-full" title="${name}">
                        ${name}
                    </div>

                    <div class="flex justify-between items-end mt-1">
                        <div class="pointer-events-auto">${notesIcon}</div>
                        <div class="flex flex-col items-end">
                             ${r.mesa ? `<span class="text-[10px] font-bold text-slate-500 bg-slate-50 px-1 rounded border border-slate-100 mb-0.5" title="Mesa">M.${r.mesa}</span>` : ''}
                             <div class="text-right text-gray-400 font-mono pointer-events-none">${priceDisplay}</div>
                        </div>
                    </div>
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
    let title; // Declare title here

    if (mode === 'dia') {
      // [FIX] Use the exact selected date (currentWeekStart now holds the specific date)
      let targetDateStr = utils.toIsoDate(currentWeekStart);
      const prettyDate = utils.formatDateES(new Date(targetDateStr));
      title = `Informe Diario - ${prettyDate}`;
      filterFn = (r, dateStr) => dateStr === targetDateStr;
    } else {
      const d1 = utils.formatDateES(dates[0]);
      const d2 = utils.formatDateES(dates[6]);
      title = `Informe Semanal (${d1} - ${d2})`;
      filterFn = (r, dateStr) => dateStr >= utils.toIsoDate(dates[0]) && dateStr <= utils.toIsoDate(dates[6]);
    }

    const logoPath = (hotel === "Guadiana") ? "Img/logo-guadiana.png" : "Img/logo-cumbria.png";
    // Get base path from current document (works with file:// protocol)
    const basePath = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    const logoUrl = `${basePath}/${logoPath}`;

    let html = `
            <div style="font-family: sans-serif; padding: 20px;">
                <div style="display:flex; align-items:center; gap:20px; margin-bottom:20px; border-bottom:2px solid #eee; padding-bottom:15px;">
                   <img src="${logoUrl}" style="height:60px; width:auto;" onerror="this.style.display='none'">
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
                            <th style="padding: 6px; width: 40px; border-bottom: 2px solid #ddd;">Mesa</th>
                            <th style="padding: 6px; width: 45px; border-bottom: 2px solid #ddd;">Hora</th>
                            <th style="padding: 6px; width: 140px; border-bottom: 2px solid #ddd;">Cliente</th>
                            <th style="padding: 6px; width: 30px; border-bottom: 2px solid #ddd; text-align:center;">Pax</th>
                            <th style="padding: 6px; border-bottom: 2px solid #ddd;">Notas / Observaciones</th>
                            <th style="padding: 6px; width: 40px; border-bottom: 2px solid #ddd;">Est.</th>
                            <th style="padding: 6px; width: 50px; border-bottom: 2px solid #ddd;">Serv.</th>
                        </tr>
                    </thead>
                    <tbody>`;

        groups[dateStr].forEach(r => {
          const pax = (parseInt(r.pax) || 0) + (parseInt(r.ninos) || 0);
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
          const mesa = r.mesa || "-"; // [NEW] Get mesa
          const hour = parseInt(time.split(':')[0]);
          if (hour >= 12 && hour <= 15) { type = "Alm."; typeFull = "Almuerzo"; }
          else if (hour >= 20) { type = "Cena"; typeFull = "Cena"; }
          if (typeFull === "Almuerzo") countLunch += pax;
          else if (typeFull === "Cena") countDinner += pax;
          else countSpecial += pax;

          html += `<tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 6px; font-weight:bold; color: #000;">${mesa}</td>
                    <td style="padding: 6px; font-weight:bold;">${time}</td>
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
    const price = window.MesaChef.parseEuroInput(document.getElementById("campoPrecio")?.value);
    const pax = parseInt(document.getElementById("campoPax").value) || 0;
    const priceKids = window.MesaChef.parseEuroInput(document.getElementById("campoPrecioNinos")?.value);
    const kids = parseInt(document.getElementById("campoNinos").value) || 0;

    const total = (price * pax) + (priceKids * kids);
    const el = document.getElementById("displayTotal");
    if (el) el.innerText = total.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }

  // WhatsApp Confirmation Message
  window.sendWhatsApp = function () {
    if (!whatsappTemplate) {
      alert("⚠️ No hay plantilla de WhatsApp configurada para este hotel. Configúrala en Admin → [Hotel] → Plantilla WhatsApp.");
      return;
    }

    // Get data from modal fields
    const nombre = document.getElementById("campoNombre")?.value || '';
    const telefono = document.getElementById("campoTelefono")?.value || '';
    const fecha = document.getElementById("campoFecha")?.value || '';
    const hora = document.getElementById("campoHora")?.value || '';
    const paxAdultos = parseInt(document.getElementById("campoPax")?.value) || 0;
    const paxNinos = parseInt(document.getElementById("campoNinos")?.value) || 0;
    const pax = paxAdultos + paxNinos;
    const turno = document.getElementById("campoTurno")?.value || '';
    const espacio = document.getElementById("campoEspacio")?.value || '';

    // Get hotel name
    const hotelId = localStorage.getItem(STORAGE_KEY) || "Guadiana";
    const hotel = hotelId === "Guadiana" ? "Sercotel Guadiana" : "Cumbria Spa&Hotel";

    // Format date for display (dd/mm/yyyy)
    let fechaFormatted = fecha;
    if (fecha) {
      const parts = fecha.split('-');
      if (parts.length === 3) {
        fechaFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }

    // Format turno for display
    const turnoFormatted = turno === 'almuerzo' ? 'Almuerzo' : (turno === 'cena' ? 'Cena' : turno);

    // Build message by replacing placeholders
    let message = whatsappTemplate
      .replace(/{nombre}/gi, nombre)
      .replace(/{fecha}/gi, fechaFormatted)
      .replace(/{hora}/gi, hora)
      .replace(/{pax}/gi, pax.toString())
      .replace(/{turno}/gi, turnoFormatted)
      .replace(/{espacio}/gi, espacio)
      .replace(/{hotel}/gi, hotel);

    // Format phone number (remove spaces, ensure country code)
    let phone = telefono.replace(/\s+/g, '').replace(/[^\d]/g, '');
    if (phone.length === 9 && !phone.startsWith('34')) {
      phone = '34' + phone; // Add Spain country code
    }

    if (!phone) {
      alert("⚠️ No hay teléfono válido para enviar el mensaje.");
      return;
    }

    // Open WhatsApp (app:// format opens the app directly instead of web)
    const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }


  window.openBooking = function (space, dateStr, turno, data) {
    // [NEW] Initialize Global State for Sync Context
    window.state = {
      currentReserva: data || null
    };

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

    // --- PAST DATE CHECK (NEW & EDIT) ---
    const checkDate = data ? (data.fecha && data.fecha.toDate ? utils.toIsoDate(data.fecha.toDate()) : data.fecha) : dateStr;
    const isPast = checkDate < utils.toIsoDate(new Date());

    if (!data && isPast) {
      alert("⚠️ No se pueden crear reservas en fechas pasadas.");
      return;
    }
    // ------------------------------------

    modal.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const checkServicio = document.getElementById("checkServicioIncluido");
    if (checkServicio) checkServicio.checked = false;

    document.getElementById("campoEstado").value = "confirmada";
    const btnAnular = document.getElementById("btnAnular");
    const btnWhatsApp = document.getElementById("btnWhatsApp");
    const btnGuardar = document.getElementById("btnGuardar"); // Assuming ID 'btnGuardar' exists for Save button

    // Reset visibility first
    if (btnAnular) btnAnular.style.display = data ? 'block' : 'none';
    // Show WhatsApp button only for existing reservations with template configured
    if (btnWhatsApp) {
      const hasTemplate = whatsappTemplate && whatsappTemplate.length > 0;
      btnWhatsApp.classList.toggle('hidden', !(data && hasTemplate));
    }
    if (btnGuardar) btnGuardar.style.display = 'block';

    // Inputs to disable/enable
    const inputs = document.querySelectorAll("#modalReserva input, #modalReserva select, #modalReserva textarea");

    if (data) {
      // ... population logic ...
      document.getElementById("campoReferencia").value = data.referencia || data.id || "SIN REF";
      document.getElementById("campoNombre").value = data.nombre || data.cliente || "";
      document.getElementById("campoTelefono").value = data.telefono || "";
      document.getElementById("campoHora").value = data.hora || "";
      document.getElementById("campoMesa").value = data.mesa || ""; // [NEW] Populate Mesa
      document.getElementById("campoPrecio").value = window.MesaChef.formatEuroValue(data.precio || 0); // [MODIFIED]
      document.getElementById("campoPax").value = data.pax || "";
      document.getElementById("campoNinos").value = data.ninos || 0;
      if (document.getElementById("campoPrecioNinos")) document.getElementById("campoPrecioNinos").value = window.MesaChef.formatEuroValue(data.precioNinos || 0); // [MODIFIED]
      document.getElementById("campoNotas").value = typeof data.notas === 'object' ? Object.values(data.notas).join(". ") : (data.notas || "");
      document.getElementById("campoNotaCliente").value = data.notaCliente || "";
      if (data.espacio) document.getElementById("campoEspacio").value = data.espacio;
      if (data.turno) document.getElementById("campoTurno").value = data.turno;
      if (data.estado) document.getElementById("campoEstado").value = data.estado;

      // [FIX] Restore servicioIncluido checkbox state
      if (data.servicioIncluido) {
        checkServicio.checked = true;
        document.getElementById("campoPrecio").disabled = true;
      } else {
        checkServicio.checked = false;
        document.getElementById("campoPrecio").disabled = false;
      }

      let dVal = dateStr;
      if (!dVal && data.fecha) dVal = data.fecha && data.fecha.toDate ? utils.toIsoDate(data.fecha.toDate()) : data.fecha;
      document.getElementById("campoFecha").value = dVal;
      document.getElementById("campoId").value = data.id;

      const historySection = document.getElementById("sectionHistorial");
      if (historySection) {
        historySection.classList.remove("hidden");
        document.getElementById("valCreada").innerText = utils.formatDateTime(data.createdAt);
        document.getElementById("valModificada").innerText = utils.formatDateTime(data.updatedAt);
        document.getElementById("valAnulada").innerText = utils.formatDateTime(data.cancelledAt);

        // Styling for Anulada
        const labelAnulada = document.getElementById("valAnulada").parentElement;
        if (!data.cancelledAt) {
          labelAnulada.classList.add("opacity-30");
        } else {
          labelAnulada.classList.remove("opacity-30");
        }
      }
    } else {
      // NEW
      const historySection = document.getElementById("sectionHistorial");
      if (historySection) historySection.classList.add("hidden");
    }

    const now = new Date();
    const todayIso = utils.toIsoDate(now);

    // Logic: Read-Only if:
    // 1. Date is strictly in the past (< Today)
    // 2. Date is Today AND Now >= 18:00 AND Reservation Time < 18:00 (Lunch passed)

    let isReadOnly = dateStr < todayIso;

    if (dateStr === todayIso && now.getHours() >= 18) {
      // Check reservation time
      if (data && data.hora) {
        const [h, m] = data.hora.split(':').map(Number);
        if (h < 18) isReadOnly = true;
      } else if (turno === 'almuerzo') {
        // For new/empty data, if turn is lunch, it's effectively < 18:00 default
        isReadOnly = true;
      }
    }

    const readOnlyElements = [
      "campoNombre", "campoTelefono", "campoHora", "campoPrecio",
      "campoPax", "campoNinos", "campoPrecioNinos", "campoNotas",
      "campoNotaCliente", "campoEstado", "campoEspacio", "campoTurno", "campoMesa",
      "btnAnular", "btnGuardar", "checkServicioIncluido"
    ];

    readOnlyElements.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.disabled = isReadOnly;
        if (isReadOnly) el.classList.add("opacity-50", "cursor-not-allowed");
        else el.classList.remove("opacity-50", "cursor-not-allowed");
      }
    });

    const modalTitle = document.getElementById("modalTitle");
    if (modalTitle) {
      if (isReadOnly) {
        modalTitle.innerHTML = `Visualizar Reserva <span class="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded border border-amber-200">HISTÓRICO (Solo Lectura)</span>`;
      } else {
        modalTitle.innerText = data ? "Editar Reserva" : "Nueva Reserva";
      }
    }

    // --- POPULATE FORM ---
    document.getElementById("modalReserva").classList.remove("hidden");
    document.getElementById("campoEspacio").value = space;
    document.getElementById("campoFecha").value = dateStr;
    document.getElementById("campoTurno").value = turno;
    // Date is always locked in modal
    document.getElementById("campoFecha").disabled = true;

    if (btnGuardar && isReadOnly) btnGuardar.style.display = 'none';
    else if (btnGuardar) btnGuardar.style.display = 'block';

    if (data) {
      document.getElementById("campoId").value = data.id || "";
    } else {
      // NEW
      document.getElementById("campoId").value = "";
      inputs.forEach(inp => inp.disabled = false); // Ensure enabled

      // Defaults from arguments (Restored)
      if (space) document.getElementById("campoEspacio").value = space;
      document.getElementById("campoFecha").value = dateStr || utils.toIsoDate(new Date());
      if (turno) document.getElementById("campoTurno").value = turno;

      document.getElementById("campoReferencia").value = "RES-" + Date.now().toString().slice(-6);

      document.getElementById("campoNombre").value = "";
      document.getElementById("campoTelefono").value = "";
      document.getElementById("campoHora").value = "";
      document.getElementById("campoMesa").value = ""; // [NEW] Clear Mesa
      document.getElementById("campoPrecio").value = "";
      document.getElementById("campoPax").value = "";
      document.getElementById("campoNinos").value = "";
      document.getElementById("campoPrecioNinos").value = "";
      document.getElementById("campoNotas").value = "";
      document.getElementById("campoNotaCliente").value = "";

      // Auto-set time based on turn (After clearing)
      autoSetTime(turno);

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

    // --- CHECK KITCHEN HOURS ---
    const valHora = document.getElementById("campoHora").value;
    const valTurno = document.getElementById("campoTurno").value;
    if (restaurantConfig && valHora && valTurno) {
      const t = valTurno.toLowerCase();
      let ini = "", fin = "";
      // Default fallbacks if config missing
      if (t === 'almuerzo') {
        ini = restaurantConfig.almIni || "13:00";
        fin = restaurantConfig.almFin || "16:00";
      } else if (t === 'cena') {
        ini = restaurantConfig.cenaIni || "20:30";
        fin = restaurantConfig.cenaFin || "23:00";
      }

      if (ini && fin && (valHora < ini || valHora > fin)) {
        if (!confirm(`⚠️ FUERA DE HORARIO DE COCINA\n\nLa hora seleccionada (${valHora}) está fuera del horario establecido para ${valTurno} (${ini} - ${fin}).\n\n¿Deseas continuar con la reserva?`)) {
          return;
        }
      }
    }
    // ---------------------------

    // Past Date Validation
    const eventDate = new Date(fecha);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDateMidnight = new Date(eventDate);
    eventDateMidnight.setHours(0, 0, 0, 0);

    if (eventDateMidnight < today) {
      alert("⚠️ No se puede crear una reserva en fecha pasada.");
      return;
    }

    // Strict Time Check for Today
    if (eventDateMidnight.getTime() === today.getTime()) {
      const now = new Date();
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();

      const [selH, selM] = document.getElementById("campoHora").value.split(':').map(Number);

      if (selH < currentHours || (selH === currentHours && selM < currentMinutes)) {
        alert("⚠️ No se puede reservar en una hora pasada.");
        return;
      }

      // [NEW] Rule: Block Lunch after 18:00
      const turno = document.getElementById("campoTurno").value;
      if (turno === 'almuerzo' && currentHours >= 18) {
        alert("⚠️ El servicio de almuerzo ha finalizado (Hora límite 18:00).");
        return;
      }
    }

    // --- CHECK LOCK (COMPLETO) ---
    // Rule: New Reservations cannot be created on blocked shifts.
    // Rule: Existing reservations CAN be edited (Editor check).
    const valId = document.getElementById("campoId").value;
    const isEdit = valId && valId.trim() !== "";

    if (!isEdit) {
      const currentHotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
      const targetSpace = document.getElementById("campoEspacio").value;
      const targetTurn = document.getElementById("campoTurno").value;

      // [NEW] Special Capacity Check
      const tName = targetTurn.toLowerCase();
      const special = specialDatesConfig.find(sd => sd.date === fecha);
      if (special) {
        let maxCap = 0;
        if (targetSpace === 'Restaurante') {
          maxCap = tName === 'almuerzo' ? (special.lunchMax || 0) : (special.dinnerMax || 0);
        } else if (targetSpace === 'Cafeteria') {
          maxCap = tName === 'almuerzo' ? (special.cafLunchMax || 0) : (special.cafDinnerMax || 0);
        }

        if (maxCap > 0) {
          const currentPax = loadedReservations.reduce((sum, r) => {
            if (r.type === 'lock' || (r.estado || '').toLowerCase() === 'anulada') return sum;
            const rDate = (r.fecha && r.fecha.toDate ? utils.toIsoDate(r.fecha.toDate()) : r.fecha);
            if (rDate !== fecha) return sum;
            if ((r.espacio || 'Restaurante') !== targetSpace) return sum;
            if ((r.turno || 'almuerzo').toLowerCase() !== tName) return sum;
            return sum + (parseInt(r.pax) || 0) + (parseInt(r.ninos) || 0);
          }, 0);

          const newPax = (parseInt(document.getElementById("campoPax").value) || 0) + (parseInt(document.getElementById("campoNinos").value) || 0);
          if (currentPax + newPax > maxCap) {
            alert(`⛔ VENTA CERRADA: AFORO COMPLETO\n\nEl aforo máximo para ${targetSpace} (${tName}) es de ${maxCap} personas.\nActualmente hay ${currentPax} reservadas.\nNo se pueden añadir ${newPax} personas más.`);
            return;
          }
        }
      }

      // 1. Client-Side Check (Fast & Matches UI)
      // Uses same defaults as Grid Render to ensure consistency
      console.log(`Checking Lock Client-Side: Date=${fecha} Space=${targetSpace} Turn=${targetTurn}`);

      const localLock = loadedReservations.find(r => {
        if (r.type !== 'lock') return false;

        const rDate = (r.fecha && r.fecha.toDate ? utils.toIsoDate(r.fecha.toDate()) : r.fecha);
        const rSpace = r.espacio || 'Restaurante';
        const rTurno = (r.turno || 'almuerzo').toLowerCase();

        return rSpace === targetSpace &&
          rTurno === targetTurn.toLowerCase() &&
          rDate === fecha;
      });

      if (localLock) {
        alert(`⛔ EL TURNO ESTÁ CERRADO (COMPLETO).\nNo se admiten nuevas reservas.`);
        return;
      }

      // 2. Robust Async Date Check (Server Side - Simplified to avoid Index Error)
      try {
        const lockSnap = await db.collection("reservas_restaurante")
          .where("hotel", "==", currentHotel)
          .where("espacio", "==", targetSpace)
          .where("turno", "==", targetTurn)
          .where("type", "==", "lock")
          // Removed date inequality filter to avoid composite index requirement
          // .where("fecha", ">=", startRange) 
          // .where("fecha", "<=", endRange)
          .get();

        let isLocked = false;
        lockSnap.forEach(doc => {
          const data = doc.data();
          let dateStr = "";
          if (data.fecha && data.fecha.toDate) dateStr = utils.toIsoDate(data.fecha.toDate());
          else if (typeof data.fecha === 'string') dateStr = data.fecha;

          // Manual Date Check
          if (dateStr === fecha) isLocked = true;
        });


        if (isLocked) {
          alert(`⛔ EL TURNO ESTÁ CERRADO (COMPLETO).\nNo se permiten nuevas reservas en este turno.`);
          return;
        }
      } catch (err) {
        console.error("Error checking lock:", err);
        // Optionally alert user or fail open. Failing open allows work to continue if DB hiccup.
      }
    }
    // -----------------------------

    const isServiceIncluded = document.getElementById("checkServicioIncluido").checked;
    let precio = window.MesaChef.parseEuroInput(document.getElementById("campoPrecio").value); // [MODIFIED]
    if (isServiceIncluded) precio = 0;

    const payload = {
      hotel: localStorage.getItem(STORAGE_KEY) || "Guadiana",
      referencia: document.getElementById("campoReferencia").value,
      fecha: firebase.firestore.Timestamp.fromDate(new Date(fecha)),
      espacio: document.getElementById("campoEspacio").value,
      nombre: nombre,
      telefono: telefono,
      hora: document.getElementById("campoHora").value,
      mesa: document.getElementById("campoMesa").value.trim(), // [NEW] Save Mesa
      pax: parseInt(document.getElementById("campoPax").value) || 0,
      ninos: parseInt(document.getElementById("campoNinos").value) || 0,
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

    // --- CONFIRMATION FOR LINKED BUDGETS ---
    // --- CONFIRMATION FOR LINKED BUDGETS ---
    if (window.state && window.state.currentReserva && window.state.currentReserva.presupuestoId) {
      // Skip if cancelling (handled by anularReservation) - though usually save is not used for cancel here
      if (payload.estado !== 'cancelada' && payload.estado !== 'anulada') {
        if (!confirm(`⚠️ ATENCIÓN:\nEsta reserva está vinculada al presupuesto ${window.state.currentReserva.referenciaPresupuesto || "Linked"}.\n\nCualquier cambio que guardes aquí se sincronizará automáticamente con el presupuesto.\n\n¿Estás seguro de que quieres continuar?`)) {
          return;
        }
      }
    }
    // Fallback: verify if we have budget ID from somewhere else if state is empty? 
    // No, state should be populated on edit.

    try {
      const id = document.getElementById("campoId").value;
      if (id) {
        await db.collection("reservas_restaurante").doc(id).update(payload);
        // [NEW] 2-Way Sync
        // [NEW] 2-Way Sync
        if (window.state && window.state.currentReserva && window.state.currentReserva.presupuestoId) {
          // We need to pass the full object with ID
          // But payload doesn't have ID or budget ID.
          // We should merge or use window.state.currentReserva.presupuestoId
          payload.presupuestoId = window.state.currentReserva.presupuestoId;
          await syncPresupuestoFromRestaurante(payload);
        }
      } else {
        const ref = await db.collection("reservas_restaurante").add(payload);
        // If we want to sync NEW reservations that came from nowhere??
        // Usually creation comes FROM budget.
        // But if manually linked (future feature), we'd need budget ID in form.
      }
      closeModal();
    } catch (err) {
      console.error(err);
      alert("Error al guardar: " + err.message);
    }
  };

  // [NEW] 2-Way Sync Helper
  async function syncPresupuestoFromRestaurante(reserva) {
    if (!reserva.presupuestoId) return;
    // console.log("Syncing Budget from Rte...", reserva.presupuestoId);

    try {
      const pRef = db.collection("presupuestos").doc(reserva.presupuestoId);
      const pSnap = await pRef.get();
      if (!pSnap.exists) return;

      const pData = pSnap.data();
      let lines = pData.lines || [];

      // In Restaurante, we don't have "Lines" in the reservation object exactly like Salones.
      // We have "pax" (Adults) and "ninos".
      // We must update the CORRESPONDING lines in the budget.
      // Strategy: Find lines that look like "Menú Rte..." or match the shift/concepts.

      // Update Pax Headers
      let newPaxA = reserva.pax || 0;
      let newPaxN = reserva.ninos || 0;

      // We need to update lines intelligently.
      // If we have "Menú Adulto", set uds = newPaxA.
      // If we have "Menú Niño", set uds = newPaxN.

      lines = lines.map(l => {
        const c = l.concepto.toLowerCase();
        if (c.includes("adulto") && (c.includes("menú") || c.includes("menu"))) {
          l.uds = newPaxA;
          l.total = l.uds * l.precio;
        }
        else if (c.includes("niño") || c.includes("infantil")) {
          l.uds = newPaxN;
          l.total = l.uds * l.precio;
        }

        return l;
      });

      const newTotal = lines.reduce((sum, l) => sum + (l.total || 0), 0);

      await pRef.update({
        paxAdultos: newPaxA,
        paxNinos: newPaxN,
        pax: newPaxA + newPaxN,
        lines: lines,
        importeTotal: newTotal,
        fecha: reserva.fecha, // Sync Date
        cliente: reserva.nombre, // Sync Client Name
        lastModifiedSource: 'Restaurante 🍽️', // Audit Trail
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      console.log("✅ Budget Synced from Restaurante!");

    } catch (e) {
      console.error("Error syncing Budget from Rte:", e);
    }
  }

  async function anularReservation() {
    const id = document.getElementById("campoId").value;
    if (!id) return;
    if (!confirm("⚠️ ¿Estás seguro de que quieres ANULAR esta reserva?")) return;

    try {
      // 1. Fetch the reservation first to see if it has a linked budget
      // We need to do this BEFORE updating because we need the presupuestoId
      const resDoc = await db.collection("reservas_restaurante").doc(id).get();
      const resData = resDoc.exists ? resDoc.data() : null;

      // 2. Update Reservation Status
      await db.collection("reservas_restaurante").doc(id).update({
        estado: 'anulada',
        cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // 3. Sync to Linked Budget (if exists)
      if (resData && resData.presupuestoId) {
        try {
          // console.log("Syncing Cancellation to Budget from Rte:", resData.presupuestoId);
          await db.collection("presupuestos").doc(resData.presupuestoId).update({
            estado: 'rechazada',
            lastModifiedSource: 'Restaurante 🍽️', // Audit Trail
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } catch (e) {
          console.error("Error syncing Rte Cancellation to Budget:", e);
        }
      }

      closeModal();
    } catch (err) {
      console.error(err);
      alert("Error al anular: " + err.message);
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
    // [FIX] Just set the date, don't force Monday. getWeekDates handles the view.
    currentWeekStart = new Date(dateObj);
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
