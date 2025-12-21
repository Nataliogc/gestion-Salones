// js/salones.js - v11 (Restored & Fixed)


(function () {
    // --- ROBUST FIREBASE INIT ---
    let appStarted = false;

    function ensureFirebase(callback) {
        if (!document.querySelector('script[src*="firebase-app-compat"]')) {
            const s1 = document.createElement("script");
            s1.src = "https://www.gstatic.com/firebasejs/9.6.7/firebase-app-compat.js";
            s1.onload = function () {
                const s2 = document.createElement("script");
                s2.src = "https://www.gstatic.com/firebasejs/9.6.7/firebase-auth-compat.js";
                s2.onload = function () {
                    const s3 = document.createElement("script");
                    s3.src = "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore-compat.js";
                    s3.onload = function () { initFirebase(callback); };
                    document.head.appendChild(s3);
                };
                document.head.appendChild(s2);
            };
            document.head.appendChild(s1);
        } else {
            const checkInterval = setInterval(() => {
                if (window.firebase && window.firebase.auth && window.firebase.firestore) {
                    clearInterval(checkInterval);
                    initFirebase(callback);
                }
            }, 100);
        }
    }

    function initFirebase(callback) {
        try {
            const firebaseConfig = {
                apiKey: "AIzaSyAXv_wKD48EFDe8FBQ-6m0XGUNoxSRiTJY",
                authDomain: "mesa-chef-prod.firebaseapp.com",
                projectId: "mesa-chef-prod",
                storageBucket: "mesa-chef-prod.firebasestorage.app",
                messagingSenderId: "43170330072",
                appId: "1:43170330072:web:bcdd09e39930ad08bf2ead"
            };

            if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

            // AUTH LISTENER
            firebase.auth().onAuthStateChanged((user) => {
                if (user && !appStarted) {
                    console.log("Salones: Auth Ready", user.uid);
                    appStarted = true;
                    callback();
                }
            });

            // TRIGGER SIGN IN
            if (!firebase.auth().currentUser) {
                firebase.auth().signInAnonymously().catch((error) => {
                    console.error("Auth Error", error);
                });
            }
        } catch (e) { console.error("Firebase Init Error:", e); }
    }

    let db;
    let globalConfig = null;
    let currentWeekStart = new Date();
    // Key used by index.html
    const STORAGE_KEY = "mesaChef_hotel";

    const utils = window.MesaChef || {
        getWeekDates: (d) => {
            const start = new Date(d);
            const day = start.getDay();
            const diff = start.getDate() - day + (day === 0 ? -6 : 1);
            start.setDate(diff);
            let dates = [];
            for (let i = 0; i < 7; i++) {
                let temp = new Date(start);
                temp.setDate(temp.getDate() + i);
                dates.push(temp);
            }
            return dates;
        },
        toIsoDate: (d) => d.toISOString().split('T')[0],
        formatDateES: (d) => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
    };

    function startApp() {
        console.log("Salones: Iniciando aplicación...");
        db = firebase.firestore();

        // 1. HOTEL IDENTITY & LOGO
        const currentHotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
        const headerName = document.getElementById("headerHotelName");

        if (headerName) {
            const logoSrc = currentHotel === "Guadiana" ? "Img/logo-guadiana.svg" : "Img/logo-cumbria.svg";
            const displayName = currentHotel === "Guadiana" ? "Sercotel Guadiana" : "Cumbria Spa & Hotel";
            headerName.innerHTML = `<div class="flex items-center"><img src="${logoSrc}" class="h-8 mr-2"> ${displayName}</div>`;
        }

        // 2. LOAD CONFIG
        db.collection("master_data").doc("CONFIG_SALONES").get().then(doc => {
            if (doc.exists) {
                globalConfig = doc.data();
            } else {
                globalConfig = { montajes: ["Banquete"], Guadiana: [], Cumbria: [] };
            }
            populateDatalist();
            renderGrid();
        }).catch(err => {
            console.error("Salones: Error config", err);
            globalConfig = { montajes: ["Banquete"], Guadiana: [], Cumbria: [] };
            renderGrid();
        });
    }

    function populateDatalist(salonFilter = null) {
        const dl = document.getElementById("charge-options");
        if (!dl || !globalConfig) return;

        const hotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
        let html = "";

        // 1. Add Salon Rental Options (Filtered)
        if (globalConfig[hotel]) {
            globalConfig[hotel].forEach(s => {
                if (s.active !== false) {
                    // Filter: Show only if no filter is set OR matches selected salon
                    if (!salonFilter || s.name === salonFilter) {
                        html += `<option value="Alquiler Salón ${s.name} - todo">`;
                        html += `<option value="Alquiler Salón ${s.name} - mañana">`;
                        html += `<option value="Alquiler Salón ${s.name} - tarde">`;
                    }
                }
            });
        }

        // 2. Add Extras (Always show)
        if (globalConfig.extras) {
            globalConfig.extras.forEach(e => {
                html += `<option value="${e.name}">`;
            });
        }

        dl.innerHTML = html;
    }

    window.updateRowPrice = function (input) {
        const val = input.value.trim();
        if (!val || !globalConfig) return;

        // Check Extras
        if (globalConfig.extras) {
            const ext = globalConfig.extras.find(e => e.name === val);
            if (ext) {
                // Find row price input
                const row = input.closest("tr");
                if (row) {
                    row.querySelector(".row-price").value = ext.price;
                    calcTotal();
                }
                return;
            }
        }
    };

    function getCellId(hotel, salonName, dateStr) {
        // ID SAFE GENERATION: Lowercase, underscores only
        const h = (hotel || "").toLowerCase().replace(/[^a-z0-9]/g, '_');
        const s = (salonName || "").toLowerCase().replace(/[^a-z0-9]/g, '_');
        return `cell_${h}_${s}_${dateStr}`;
    }

    window.renderGrid = function () {
        const hotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
        const container = document.getElementById("calendarGrid");
        if (!container) return;

        // Ensure reservations are loaded
        loadReservations();

        const salons = (globalConfig[hotel] || []).filter(s => s.active !== false);
        const dates = utils.getWeekDates(currentWeekStart);

        const rangeEl = document.getElementById("currentWeekRange");
        if (rangeEl) rangeEl.innerText = `${dates[0].toLocaleDateString()} - ${dates[6].toLocaleDateString()}`;

        // Update Custom Date Label (Toolbar)
        const dateLabel = document.getElementById("currentDateLabel");
        const datePicker = document.getElementById("currentDate");
        if (dateLabel && datePicker && datePicker.value) {
            const d = new Date(datePicker.value);
            const dayName = d.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "");
            const dayNum = d.getDate();
            const monthName = d.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
            dateLabel.innerText = `${dayName} ${dayNum} ${monthName}`;
        }

        // TABLE LAYOUT
        let html = `
        <div style="display: flex; flex-direction: column; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <div style="display: grid; grid-template-columns: 200px repeat(7, 1fr); background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                <div class="py-2 px-2 font-bold text-slate-500 text-xs tracking-wide uppercase flex items-center justify-center border-r border-slate-200">SALA</div>
                ${dates.map(d => {
            const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '').toUpperCase();
            const dayNum = d.getDate().toString().padStart(2, '0');
            const monthName = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '').charAt(0).toUpperCase() + d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '').slice(1);
            return `
                    <div class="py-1 px-1 font-bold text-center text-xs text-slate-500 border-r border-slate-100 last:border-r-0 flex items-center justify-center bg-[#f8fafc]">
                        ${dayName} ${dayNum} ${monthName}
                    </div>
                `}).join('')}
            </div>
        `;

        if (salons.length === 0) {
            html += `
            <div class="p-10 text-center text-slate-400">
                <span class="text-4xl block mb-2">🏨</span>
                <span class="font-bold">No hay salones activos para ${hotel}.</span>
            </div>`;
        } else {
            const bloqueos = globalConfig.bloqueos || [];

            salons.forEach((salon, index) => {
                const isLast = index === salons.length - 1;
                html += `<div style="display: grid; grid-template-columns: 200px repeat(7, 1fr); ${isLast ? '' : 'border-bottom: 1px solid #f1f5f9;'}">
                    <div class="bg-white p-2 font-bold text-slate-700 flex flex-col justify-center border-r border-slate-100 relative group">
                        <span class="text-xs text-slate-800">${salon.name}</span>
                        <span class="text-slate-400 font-normal mt-0.5 uppercase tracking-wider text-[9px]">Cap: ${salon.pax}</span>
                        <div class="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 opacity-0 group-hover:opacity-100 transition"></div>
                    </div>`;

                dates.forEach(d => {
                    const dateStr = utils.toIsoDate(d);
                    const safeName = salon.name.replace(/'/g, "\\'");

                    // Check Block
                    let isBlocked = false;
                    let blockReason = "";
                    bloqueos.forEach(b => {
                        if (b.salon === "TODOS" || b.salon === salon.name) {
                            if (dateStr >= b.start && dateStr <= b.end) {
                                isBlocked = true;
                                blockReason = b.note || "Bloqueado";
                            }
                        }
                    });

                    if (isBlocked) {
                        html += `<div id="${getCellId(hotel, salon.name, dateStr)}"
                                    class="bg-red-50 hover:bg-red-100 border-r border-slate-100 last:border-r-0 transition p-1 relative flex flex-col items-center justify-center group cursor-not-allowed" title="${blockReason}">
                                    <span class="text-lg">🔒</span>
                                    <span class="text-[9px] text-red-600 font-bold uppercase mt-1 text-center leading-tight">${blockReason}</span>
                               </div>`;
                    } else {
                        // Past check
                        const isPast = dateStr < utils.toIsoDate(new Date());
                        const cellBg = isPast ? "bg-slate-100" : "bg-white";

                        // Interaction Classes
                        const interactionClass = isPast
                            ? "cursor-default text-slate-300"
                            : "cursor-pointer hover:bg-slate-50 text-slate-200 hover:text-slate-400";

                        const maOnClick = isPast ? "" : `onclick="window.openBooking('${safeName}', '${dateStr}', null, 'mañana')"`;
                        const taOnClick = isPast ? "" : `onclick="window.openBooking('${safeName}', '${dateStr}', null, 'tarde')"`;
                        const addButton = isPast ? "" : `
                                    <button onclick="window.openBooking('${safeName}', '${dateStr}')" 
                                        class="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-blue-50 text-blue-600 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition z-30 hover:bg-blue-600 hover:text-white font-bold pb-0.5"
                                        title="Añadir evento">
                                        +
                                    </button>`;

                        // DATA ATTRIBUTES for easy reset
                        html += `<div id="${getCellId(hotel, salon.name, dateStr)}"
                                    data-salon="${safeName}" data-date="${dateStr}"
                                    class="${cellBg} min-h-[120px] border-r border-slate-100 last:border-r-0 relative group grid grid-rows-2 gap-[1px]">
                                    
                                    <!-- Slot Mañana -->
                                    <div ${maOnClick}
                                         class="relative flex items-center justify-center text-[10px] font-bold uppercase tracking-widest transition border-b border-transparent hover:border-slate-100 ${interactionClass}">
                                         ${isPast ? '-' : 'LIBRE'}
                                    </div>

                                    <!-- Slot Tarde -->
                                    <div ${taOnClick}
                                         class="relative flex items-center justify-center text-[10px] font-bold uppercase tracking-widest transition ${interactionClass}">
                                         ${isPast ? '-' : 'LIBRE'}
                                    </div>
                                    
                                    <!-- Floating Add Button (Universal) -->
                                    ${addButton}
                                  </div>`;
                    }
                });
                html += `</div>`;
            });
        }

        html += `</div>`;
        container.innerHTML = html;
        paintReservations(hotel);
    };

    // --- LOGIC: FETCHING ---
    let unsubscribe = null;
    let loadedReservations = [];

    function loadReservations() {
        if (unsubscribe) unsubscribe();

        const hotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
        const dates = utils.getWeekDates(currentWeekStart);
        const start = utils.toIsoDate(dates[0]);
        const end = utils.toIsoDate(dates[6]);

        console.log(`Loading reservations for ${hotel} from ${start} to ${end}`);

        unsubscribe = db.collection("reservas_salones")
            .where("fecha", ">=", start)
            .where("fecha", "<=", end)
            .onSnapshot(snapshot => {
                loadedReservations = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.hotel === hotel) {
                        loadedReservations.push({ id: doc.id, ...data });
                    }
                });
                paintReservations(hotel);
            }, error => {
                console.error("Error loading reservations:", error);
            });
    }

    function paintReservations(hotel) {
        // RESET ALL CELLS to "Libre" state first (Handles deletions/updates cleanliness)
        document.querySelectorAll(`[id^="cell_"]`).forEach(cell => {
            if (cell.getAttribute("data-salon")) {
                const s = cell.getAttribute("data-salon");
                const d = cell.getAttribute("data-date");
                // Use raw string for onclick to match renderGrid exactly
                cell.innerHTML = `
                    <div onclick="window.openBooking('${s}', '${d}', null, 'mañana')" class="relative flex items-center justify-center text-[10px] text-slate-200 hover:text-slate-400 font-bold uppercase tracking-widest cursor-pointer hover:bg-slate-50 transition border-b border-transparent hover:border-slate-100">LIBRE</div>
                    <div onclick="window.openBooking('${s}', '${d}', null, 'tarde')" class="relative flex items-center justify-center text-[10px] text-slate-200 hover:text-slate-400 font-bold uppercase tracking-widest cursor-pointer hover:bg-slate-50 transition">LIBRE</div>
                    <button onclick="window.openBooking('${s}', '${d}')" class="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-blue-50 text-blue-600 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition z-30 hover:bg-blue-600 hover:text-white font-bold pb-0.5" title="Añadir evento">+</button>
                 `;
            }
        });

        const filterEl = document.getElementById("filterStatus");
        const filterVal = filterEl ? filterEl.value : "todos";

        console.log("Painting Reservations. Hotel:", hotel, "Filter:", filterVal, "Total Loaded:", loadedReservations.length, loadedReservations);

        // Group by cell
        const salonMap = {};
        if (globalConfig[hotel]) {
            globalConfig[hotel].forEach(s => {
                salonMap[s.name.replace(/\s/g, '').toLowerCase()] = s.name;
            });
        }

        const cellGroups = {};
        loadedReservations.forEach(res => {
            const st = (res.estado || "").toLowerCase();
            const isConfirmed = st === 'confirmada' || st === 'confirmed';
            const isPending = st === 'provisional' || st === 'pendiente' || st === 'pending' || st === 'presupuesto';
            const isCancelled = st === 'cancelada' || st === 'cancelled' || st === 'anulada';

            if (filterVal === 'activos') { if (!isConfirmed && !isPending) return; }
            else if (filterVal === 'confirmada') { if (!isConfirmed) return; }
            else if (filterVal === 'provisional') { if (!isPending) return; }
            else if (filterVal === 'cancelada') { if (!isCancelled) return; }
            else if (filterVal !== 'todos') { if (st !== filterVal.toLowerCase()) return; }

            let relevantDates = new Set();
            if (res.servicios && res.servicios.length > 0) {
                res.servicios.forEach(s => { if (s.fecha) relevantDates.add(s.fecha); });
            }
            if (relevantDates.size === 0) relevantDates.add(res.fecha);

            const rawName = (res.salon || "").replace(/\s/g, '').toLowerCase();
            const canonicalName = salonMap[rawName];

            if (!canonicalName) return;

            relevantDates.forEach(date => {
                const key = `${res.hotel}_${canonicalName}_${date}`;
                if (!cellGroups[key]) cellGroups[key] = [];

                let dailyJornada = res.detalles?.jornada || "todo";
                if (res.servicios) {
                    const rentalService = res.servicios.find(s =>
                        s.fecha === date && s.concepto && s.concepto.toLowerCase().startsWith("alquiler salón")
                    );
                    if (rentalService) {
                        const c = rentalService.concepto.toLowerCase();
                        if (c.includes("- mañana") || c.includes(" mañana")) dailyJornada = "mañana";
                        else if (c.includes("- tarde") || c.includes(" tarde")) dailyJornada = "tarde";
                        else if (c.includes("- todo") || c.includes(" todo")) dailyJornada = "todo";
                    }
                }

                cellGroups[key].push({ ...res, fecha: date, _displayJornada: dailyJornada, _canonicalSalon: canonicalName });
            });
        });

        // Register clicks
        window._resRegistry = {};

        Object.keys(cellGroups).forEach(key => {
            const group = cellGroups[key];
            if (group.length === 0) return;

            const sample = group[0];
            const cellId = getCellId(hotel, sample._canonicalSalon, sample.fecha);
            const cell = document.getElementById(cellId);
            if (!cell) {
                // If cell is not found, just skip (legacy data or date outside range)
                return;
            }

            const safeName = sample._canonicalSalon.replace(/'/g, "\\'");
            const dateStr = sample.fecha;

            // Re-generate "Libre" slots with Past Logic
            const isPast = dateStr < utils.toIsoDate(new Date());

            const interactionClass = isPast
                ? "cursor-default text-slate-300"
                : "cursor-pointer hover:bg-slate-50 text-slate-200 hover:text-slate-400";

            const maOnClick = isPast ? "" : `onclick="window.openBooking('${safeName}', '${dateStr}', null, 'mañana')"`;
            const taOnClick = isPast ? "" : `onclick="window.openBooking('${safeName}', '${dateStr}', null, 'tarde')"`;

            const slotMañana = `<div ${maOnClick} class="relative flex items-center justify-center text-[10px] font-bold uppercase tracking-widest transition border-b border-transparent hover:border-slate-100 ${interactionClass}">${isPast ? '-' : 'LIBRE'}</div>`;
            const slotTarde = `<div ${taOnClick} class="relative flex items-center justify-center text-[10px] font-bold uppercase tracking-widest transition ${interactionClass}">${isPast ? '-' : 'LIBRE'}</div>`;

            const staticAddBtn = isPast ? "" : `<button onclick="window.openBooking('${safeName}', '${dateStr}')" class="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-blue-50 text-blue-600 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition z-30 hover:bg-blue-600 hover:text-white font-bold pb-0.5" title="Añadir evento">+</button>`;

            let htmlFinal = "";

            // Relaxed 'Todo' check: matches 'todo', 'dia', 'completo' or if it's not half-day
            const evTodo = group.find(r => {
                const j = (r._displayJornada || 'todo').toLowerCase();
                return j === 'todo' || j.includes('todo') || j.includes('dia') || j.includes('completo');
            });

            if (evTodo) {
                htmlFinal += createCardHTML(evTodo, "row-span-2 h-full");
            } else {
                const evMañana = group.find(r => (r._displayJornada || '').toLowerCase().includes('mañana'));
                if (evMañana) htmlFinal += createCardHTML(evMañana, "h-full");
                else htmlFinal += slotMañana;

                const evTarde = group.find(r => (r._displayJornada || '').toLowerCase().includes('tarde'));
                if (evTarde) htmlFinal += createCardHTML(evTarde, "h-full");
                else htmlFinal += slotTarde;
            }

            htmlFinal += staticAddBtn;
            cell.innerHTML = htmlFinal;
        });
    }

    // Helper for Card HTML
    function createCardHTML(res, extraClasses = "") {
        window._resRegistry[res.id] = res; // Register for click

        const jornada = res._displayJornada || res.detalles?.jornada || "todo";
        let colorClass = 'bg-blue-100 border-blue-500 text-blue-800';

        if (res.estado === 'confirmada') {
            colorClass = 'bg-green-100 border-green-500 text-green-800';
            const jLower = (jornada || "").toLowerCase();
            if (jLower.includes('mañana')) colorClass = 'bg-teal-100 border-green-500 text-green-800';
            else if (jLower.includes('tarde')) colorClass = 'bg-lime-100 border-green-500 text-green-800';
        }
        else if (res.estado === 'provisional') colorClass = 'bg-yellow-100 border-yellow-500 text-yellow-800';
        else if (res.estado === 'presupuesto') colorClass = 'bg-orange-100 border-orange-500 text-orange-800';
        else if (res.estado === 'cancelada') colorClass = 'bg-red-100 border-red-500 text-red-800 opacity-60';

        const timeStr = res.detalles?.hora ? `<span class="opacity-75"> ${res.detalles.hora}</span>` : '';
        const paxTotal = (res.detalles?.pax_adultos || 0) + (res.detalles?.pax_ninos || 0);
        const paxStr = paxTotal > 0 ? `<span class="text-[11px] bg-white/50 px-1 rounded ml-1">👤${paxTotal}</span>` : '';

        const redDot = (!res.revisado && res.estado !== 'cancelada') ? `<div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-red-500 shadow-md animate-pulse z-20" title="Sin Revisar"></div>` : '';
        const hasNote = res.notas && res.notas.interna && res.notas.interna.trim().length > 0;
        const noteStr = hasNote ? `<span title="Nota Interna: ${res.notas.interna.replace(/"/g, '&quot;')}" class="cursor-help ml-1">📝</span>` : '';

        let jText = (jornada || "").toUpperCase();
        let jClass = "text-slate-600";
        if (jText.includes("MAÑANA")) { jText = "1/2 MAÑ"; jClass = "text-sky-700 bg-sky-100/50"; }
        else if (jText.includes("TARDE")) { jText = "1/2 TARD"; jClass = "text-orange-700 bg-orange-100/50"; }
        else if (jText.includes("TODO")) { jText = "COMP"; jClass = "text-indigo-700 bg-indigo-100/50"; }

        return `
        <div onclick="window.handleCardClick('${res.id}', event)" 
             class="booking-card w-full rounded border-l-4 ${colorClass} shadow-sm px-1 py-1 text-xs flex flex-col justify-between relative box-border hover:z-20 hover:shadow-md transition cursor-pointer overflow-hidden ${extraClasses}">
            ${redDot}
            <div class="flex items-center justify-between">
                <div class="font-bold truncate leading-tight flex-1" title="${res.cliente}">${res.cliente}</div>
                <div class="text-[11px]">${noteStr}</div>
            </div>
            <div class="flex justify-between items-end mt-1 text-[11px]">
                <div class="flex flex-col min-w-0 pr-1">
                     <span class="text-[10px] font-extrabold uppercase tracking-tight leading-none mb-0.5 px-1 rounded w-fit ${jClass}">${jText}</span>
                     <span class="truncate opacity-90">${res.detalles?.montaje || '-'}</span>
                </div>
                 <div class="flex items-center space-x-1 shrink-0">
                    ${timeStr}
                    ${paxStr}
                </div>
            </div>
        </div>
        `;
    }

    window.handleCardClick = function (id, e) {
        if (e) e.stopPropagation();
        const res = window._resRegistry[id];
        if (res) window.openBooking(res.salon, res.fecha, res);
    };

    // --- GLOBAL SEARCH LOGIC ---
    let allReservations = [];
    let hasLoadedAll = false;
    let fetchPromise = null;
    let searchDebounce = null;

    window.handleSearch = function (query) {
        clearTimeout(searchDebounce);
        const container = document.getElementById("searchResults");

        if (!query || query.trim().length < 2) {
            if (container) container.classList.add("hidden");
            return;
        }

        searchDebounce = setTimeout(() => {
            if (!hasLoadedAll) {
                fetchAllReservations().then(() => doSearch(query));
            } else {
                doSearch(query);
            }
        }, 500);
    };

    function fetchAllReservations() {
        if (hasLoadedAll) return Promise.resolve();
        if (fetchPromise) return fetchPromise;

        const hotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
        const container = document.getElementById("searchResults");

        if (container) {
            container.innerHTML = '<div class="p-4 text-center text-slate-400 text-xs">⏳ Cargando histórico...</div>';
            container.classList.remove("hidden");
        }

        fetchPromise = db.collection("reservas_salones")
            .where("hotel", "==", hotel)
            .get()
            .then(snapshot => {
                allReservations = [];
                snapshot.forEach(doc => {
                    allReservations.push({ id: doc.id, ...doc.data() });
                });
                hasLoadedAll = true;
                console.log(`Global Search: Loaded ${allReservations.length} records.`);
                fetchPromise = null;
            })
            .catch(err => {
                console.error("Search Error", err);
                hasLoadedAll = false;
                fetchPromise = null;
                if (container) container.innerHTML = `<div class="p-2 text-red-500 text-xs text-center">Error al cargar: ${err.message}</div>`;
                throw err;
            });

        return fetchPromise;
    }

    function doSearch(query) {
        try {
            if (!query) return;
            const q = query.toLowerCase();

            if (!allReservations) allReservations = [];

            const results = allReservations.filter(r => {
                const name = (r.cliente || "").toLowerCase();
                const tel = (r.contact?.tel || "").toLowerCase();
                const email = (r.contact?.email || "").toLowerCase();
                const salon = (r.salon || "").toLowerCase();
                const dateStr = (r.fecha || "");

                return name.includes(q) || tel.includes(q) || email.includes(q) || salon.includes(q) || dateStr.includes(q);
            });

            renderSearchResults(results);
        } catch (e) {
            console.error("Filtering Error", e);
            const container = document.getElementById("searchResults");
            if (container) container.innerHTML = `<div class="p-2 text-red-500 text-xs text-center">Error de filtrado: ${e.message}</div>`;
        }
    }

    function renderSearchResults(results) {
        const container = document.getElementById("searchResults");
        if (!container) return;

        container.innerHTML = "";

        if (results.length === 0) {
            container.innerHTML = '<div class="p-4 text-center text-slate-400 text-xs">No se encontraron resultados</div>';
        } else {
            // Sort by date desc (recent first)
            results.sort((a, b) => b.fecha.localeCompare(a.fecha));

            results.slice(0, 50).forEach(r => { // Limit to 50
                const datePretty = new Date(r.fecha).toLocaleDateString();
                const item = document.createElement("div");
                item.className = "p-3 border-b border-slate-50 hover:bg-blue-50 cursor-pointer flex justify-between items-center transition";

                // Prevent blurring when clicking
                item.onmousedown = (e) => e.preventDefault();
                item.onclick = () => selectSearchResult(r);

                const statusColor = r.estado === 'confirmada' ? 'bg-green-100 text-green-700 border border-green-200' :
                    r.estado === 'cancelada' ? 'bg-red-100 text-red-700 border border-red-200' :
                        r.estado === 'presupuesto' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                            'bg-yellow-100 text-yellow-700 border border-yellow-200';

                item.innerHTML = `
                    <div class="flex flex-col">
                        <span class="font-bold text-slate-800 text-sm leading-tight">${r.cliente}</span>
                        <span class="text-[10px] text-slate-500 uppercase tracking-wide mt-1">📅 ${datePretty} &bull; ${r.salon}</span>
                    </div>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor} uppercase shadow-sm">${r.estado}</span>
                `;
                container.appendChild(item);
            });
        }
        container.classList.remove("hidden");
    }

    window.selectSearchResult = function (r) {
        document.getElementById("searchResults").classList.add("hidden");
        // Navigate to date
        window.goToDate(r.fecha);
        // Open Modal Directly
        // window.openBooking(salonName, dateStr, existing, defaultJornada)
        window.openBooking(r.salon, r.fecha, r);
    };

    // --- FORM LOGIC ---
    let currentBookingId = null;

    window.openBooking = function (salonName, dateStr, existing = null, defaultJornada = 'todo') {
        const currentHotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";

        // [NEW] Redirect Grand Events
        if (existing && (existing.origen === 'grandes_eventos' || existing.tipoEvento === 'Gran Evento')) {
            if (existing.eventoId) {
                window.location.href = `grandes-eventos.html?id=${existing.eventoId}`;
                return;
            }
        }

        // Check for existing reservations in this slot (if new)
        if (!existing && salonName && dateStr) {
            const salonRaw = salonName.replace(/\s/g, '').toLowerCase();

            // Find existing for this salon/date
            // --- CONFIRMATION FOR LINKED BUDGETS ---
            if (window.currentEventBudgetID && payload.estado !== 'cancelada') {
                if (!confirm(`⚠️ ATENCIÓN:\nEste evento está vinculado a un Presupuesto.\n\nCualquier cambio que guardes aquí se sincronizará automáticamente con el presupuesto, modificando sus líneas y totales.\n\n¿Estás seguro de que quieres continuar?`)) {
                    btn.innerText = originalText;
                    btn.disabled = false;
                    return;
                }
            }

            const conflictCandidates = loadedReservations.filter(r => {
                if (r.hotel !== currentHotel) return false;
                // Check status
                if (['cancelada', 'anulada'].includes((r.estado || '').toLowerCase())) return false;

                // Check Date
                let rDate = "";
                if (r.fecha && r.fecha.toDate) rDate = utils.toIsoDate(r.fecha.toDate());
                else if (typeof r.fecha === 'string') rDate = r.fecha;
                if (rDate !== dateStr) return false;

                // Check Salon (Normalize name)
                const rSalonRaw = (r.salon || "").replace(/\s/g, '').toLowerCase();
                return rSalonRaw === salonRaw;
            });

            // Analyze conflicts
            const hasTodo = conflictCandidates.some(r => (r.detalles?.jornada || 'todo') === 'todo');
            const hasMorning = conflictCandidates.some(r => (r.detalles?.jornada || 'todo') === 'mañana');
            const hasAfternoon = conflictCandidates.some(r => (r.detalles?.jornada || 'todo') === 'tarde');

            if (hasTodo) {
                alert("⛔ SALÓN OCUPADO: Ya existe un evento de día completo.");
                return; // Block opening
            }

            if (hasMorning && hasAfternoon) {
                alert("⛔ SALÓN OCUPADO: Mañana y Tarde ya están reservadas.");
                return; // Block opening
            }

            if (hasMorning) {
                defaultJornada = 'tarde';
                // Ideally we could warn the user: "Mañana ocupada, seleccionando Tarde"
            } else if (hasAfternoon) {
                defaultJornada = 'mañana';
            }
        }


        const sSel = document.getElementById("evt-salon");
        const mSel = document.getElementById("evt-montaje");

        sSel.innerHTML = "";
        mSel.innerHTML = "";

        // Filter Autocomplete on Salon Change
        sSel.onchange = function () {
            populateDatalist(this.value);
            updateRentalPrice(); // Update rental row if present
        };


        const salons = globalConfig[currentHotel] || [];

        salons.forEach(s => {
            const op = document.createElement("option");
            op.value = s.name;
            op.text = s.name;
            sSel.appendChild(op);
        });

        if (globalConfig.montajes) {
            globalConfig.montajes.forEach(m => {
                const op = document.createElement("option");
                op.value = m;
                op.text = m;
                mSel.appendChild(op);
            });
        }

        // RESET

        // RESET
        currentBookingId = null;
        window.currentFullServices = []; // Store full services list for multi-day events
        window.currentViewDate = null;   // Store the date we are viewing/editing

        document.getElementById("evt-nombre").value = "";
        document.getElementById("evt-telefono").value = "";
        document.getElementById("evt-email").value = "";

        // Reset Budget Label
        const budgetLabel = document.getElementById("evt-budget-label");
        if (budgetLabel) budgetLabel.innerText = "";

        // Phone Mask Listener
        const telInput = document.getElementById("evt-telefono");
        if (telInput && !telInput.dataset.masked) {
            telInput.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, '').substring(0, 9);
                if (v.length > 6) v = v.slice(0, 3) + " " + v.slice(3, 6) + " " + v.slice(6);
                else if (v.length > 3) v = v.slice(0, 3) + " " + v.slice(3);
                e.target.value = v;
            });
            telInput.dataset.masked = "true"; // Prevent duplicate listeners
        }

        document.getElementById("services-list").innerHTML = "";
        document.getElementById("evt-total").innerText = "0.00 €";
        document.getElementById("evt-nota-interna").value = "";
        document.getElementById("evt-nota-cliente").value = "";
        document.getElementById("evt-pax-a").value = "";
        document.getElementById("evt-pax-n").value = "";
        document.getElementById("evt-hora").value = "";
        document.getElementById("evt-revisado").checked = false; // Default unreviewed

        // Default Jornada
        document.getElementById("evt-jornada").value = defaultJornada;

        window.currentEventBudgetID = null; // [RESET] Ensure we don't carry over IDs from previous opens

        // POPULATE
        if (existing) {
            currentBookingId = existing.id;
            window.currentEventBudgetID = existing.presupuestoId || null; // [NEW] Store Budget ID for sync
            document.getElementById("evt-fecha").value = existing.fecha;
            window.currentViewDate = dateStr || existing.fecha; // Store view date

            sSel.value = existing.salon;
            populateDatalist(existing.salon); // Filter for this salon
            document.getElementById("evt-nombre").value = existing.cliente;

            // Show Budget Ref if exists
            if (existing.referenciaPresupuesto) {
                const bl = document.getElementById("evt-budget-label");
                if (bl) bl.innerHTML = `<span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold">Presupuesto: ${existing.referenciaPresupuesto}</span>`;
            }
            if (existing.contact) {
                document.getElementById("evt-telefono").value = existing.contact.tel || "";
                document.getElementById("evt-email").value = existing.contact.email || "";
            }
            document.getElementById("evt-estado").value = existing.estado || "pendiente";
            document.getElementById("evt-revisado").checked = existing.revisado === true; // Load Status

            if (existing.detalles) {
                document.getElementById("evt-jornada").value = existing.detalles.jornada || "todo";
                mSel.value = existing.detalles.montaje || "";
                document.getElementById("evt-hora").value = existing.detalles.hora || "";
                document.getElementById("evt-pax-a").value = existing.detalles.pax_adultos || "";
                document.getElementById("evt-pax-n").value = existing.detalles.pax_ninos || "";
            }

            if (existing.notas) {
                document.getElementById("evt-nota-interna").value = existing.notas.interna || "";
                document.getElementById("evt-nota-cliente").value = existing.notas.cliente || "";
            }

            // READ ONLY CHECK (Salones)
            const isPast = (dateStr || existing.fecha) < utils.toIsoDate(new Date());
            if (isPast) {
                const mt = document.getElementById("modalTitle");
                if (mt) mt.innerText = "Reserva Pasada (Solo Lectura)";

                // Disable Inputs
                const inputs = document.querySelectorAll("#modalReserva input, #modalReserva select, #modalReserva textarea");
                inputs.forEach(inp => inp.disabled = true);

                // Hide Buttons
                const btnGuardar = document.getElementById("btnGuardar"); // Assuming ID, check HTML if needed or use querySelector
                const btnAnular = document.getElementById("btnAnular");

                // We can just hide the footer buttons or specific ones
                if (btnGuardar) btnGuardar.style.display = 'none';
                if (btnAnular) btnAnular.style.display = 'none';

                // But ensure "Close" works (it's usually X or separate button)
            } else {
                const mt = document.getElementById("modalTitle");
                if (mt) mt.innerText = "Editar Reserva";
                // Ensure enabled if reused
                const inputs = document.querySelectorAll("#modalReserva input, #modalReserva select, #modalReserva textarea");
                inputs.forEach(inp => inp.disabled = false);

                const btnGuardar = document.getElementById("btnGuardar"); // Re-show
                const btnAnular = document.getElementById("btnAnular");
                if (btnGuardar) btnGuardar.style.display = 'inline-block'; // Or block/flex
                if (btnAnular) btnAnular.style.display = 'block';
            }



            if (existing.servicios) {
                window.currentFullServices = existing.servicios; // Keep full copy

                // Filter: Show only services for the clicked date (or all if no date provided)
                const viewDate = window.currentViewDate;
                const visibleServices = viewDate ? existing.servicios.filter(s => s.fecha === viewDate) : existing.servicios;

                visibleServices.forEach(s => {
                    const row = document.createElement("tr");
                    row.innerHTML = `
                    <td class="p-2 border-b"><input type="date" value="${s.fecha}" class="text-xs bg-gray-50 w-24 rounded border-gray-200"></td>
                        <td class="p-2 border-b"><input type="text" value="${s.concepto}" list="charge-options" onchange="updateRowPrice(this)" class="text-xs font-bold w-full rounded border-gray-200"></td>
                        <td class="p-2 border-b"><input type="number" onchange="calcTotal()" value="${s.uds}" class="text-xs text-center row-uds w-full rounded border-gray-200"></td>
                        <td class="p-2 border-b">
                            <div class="relative w-full">
                                <input type="text" onchange="calcTotal()" value="${window.MesaChef.formatEuroValue(s.precio)}" 
                                       onfocus="window.MesaChef.unformatEuroInput(this)" onblur="window.MesaChef.formatEuroInput(this)"
                                       class="text-xs text-right row-price w-full rounded border-gray-200 pr-6">
                                <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">€</span>
                            </div>
                        </td>
                        <td class="p-2 border-b text-right font-bold text-xs row-total text-slate-600">${s.total.toFixed(2)} €</td>
                        <td class="p-2 border-b text-center"><button onclick="this.closest('tr').remove(); calcTotal()" class="text-red-400 hover:text-red-600 font-bold">&times;</button></td>
                `;
                    document.getElementById("services-list").appendChild(row);
                });
                calcTotal();
            }
        } else {
            // NEW BOOKING: Check Past Date
            const isPast = dateStr < utils.toIsoDate(new Date());
            if (isPast) {
                alert("No se pueden crear eventos en fechas pasadas.");
                window.closeModal();
                return;
            }

            document.getElementById("evt-fecha").value = dateStr || new Date().toISOString().split('T')[0];
            if (salonName) {
                sSel.value = salonName;
                populateDatalist(salonName);
            } else {
                populateDatalist(); // No filter if new and no salon pre-set
            }
            // Auto-add rental price for new events
            setTimeout(updateRentalPrice, 100);
        }

        document.getElementById("modal-evt").classList.remove("hidden");
    };

    window.closeModal = function () {
        document.getElementById("modal-evt").classList.add("hidden");
    };

    window.addServiceRow = function () {
        const row = document.createElement("tr");
        const defaultDate = window.currentViewDate || document.getElementById("evt-fecha").value;
        row.innerHTML = `
            <td class="p-2 border-b"><input type="date" value="${defaultDate}" class="text-xs bg-gray-50 w-24 rounded border-gray-200"></td>
            <td class="p-2 border-b"><input type="text" placeholder="Concepto" list="charge-options" onchange="updateRowPrice(this)" class="text-xs font-bold w-full rounded border-gray-200"></td>
            <td class="p-2 border-b"><input type="number" onchange="calcTotal()" value="1" class="text-xs text-center row-uds w-full rounded border-gray-200"></td>
            <td class="p-2 border-b">
                <div class="relative w-full">
                    <input type="text" onchange="calcTotal()" value="0,00" 
                           onfocus="window.MesaChef.unformatEuroInput(this)" onblur="window.MesaChef.formatEuroInput(this)"
                           class="text-xs text-right row-price w-full rounded border-gray-200 pr-6">
                    <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">€</span>
                </div>
            </td>
            <td class="p-2 border-b text-right font-bold text-xs row-total text-slate-600">0,00 €</td>
            <td class="p-2 border-b text-center"><button onclick="this.closest('tr').remove(); calcTotal()" class="text-red-400 hover:text-red-600 font-bold">&times;</button></td>
                `;
        document.getElementById("services-list").appendChild(row);
    };

    window.calcTotal = function () {
        let total = 0;
        let calcPaxA = 0;
        let calcPaxN = 0;

        document.querySelectorAll("#services-list tr").forEach(row => {
            const inputs = row.querySelectorAll("input");
            // inputs[0]=date, [1]=desc, [2]=uds, [3]=price
            const concept = (inputs[1].value || "").toLowerCase();
            const uds = parseFloat(inputs[2].value) || 0;
            // [MODIFIED] Helper for Spanish Inputs
            const price = window.MesaChef.parseEuroInput(inputs[3].value);
            const sub = uds * price;

            // Update row total
            row.querySelector(".row-total").innerText = window.MesaChef.formatEuroValue(sub) + " €";
            total += sub;

            // Auto-Calc Pax Logic
            // Ignore Rental or Extras
            if (concept.includes("alquiler") || concept.includes("barra libre") || concept.includes("extra")) return;

            // Simple heuristic
            if (concept.includes("niño") || concept.includes("nino") || concept.includes("infantil")) {
                calcPaxN += uds;
            } else if (concept.includes("adulto") || concept.includes("menú") || concept.includes("menu")) {
                calcPaxA += uds;
            }
        });

        document.getElementById("evt-total").innerText = window.MesaChef.formatEuroValue(total) + " €";

        // Update Headers if calculated > 0 (Optional: could force 0)
        // Only update if lines have meaningful pax data to avoid clearing manual entry for simple events?
        // Let's trust the lines if they exist.
        if (calcPaxA > 0 || calcPaxN > 0) {
            // Avoid circular update loop -> check existing values?
            // Actually, if we type in header, we don't want calcTotal to overwrite us back immediately
            // But calcTotal scans lines.
            // If we type "7" in header -> syncPaxFromHeaderToLines -> updates lines -> calcTotal.
            // This is fine.
        }
    };

    // [NEW] Sync Pax form Header to Lines (Uni-directional on input)
    window.syncPaxFromHeaderToLines = function () {
        const paxA = parseFloat(document.getElementById("evt-pax-a").value) || 0;
        const paxN = parseFloat(document.getElementById("evt-pax-n").value) || 0;

        document.querySelectorAll("#services-list tr").forEach(row => {
            const inputs = row.querySelectorAll("input");
            const concept = (inputs[1].value || "").toLowerCase();

            // Only update "Menu" lines to match Pax
            // Heuristic must be safe
            if ((concept.includes("menú") || concept.includes("menu")) && concept.includes("adulto")) {
                inputs[2].value = paxA;
            }
            else if ((concept.includes("menú") || concept.includes("menu")) && (concept.includes("niño") || concept.includes("infantil"))) {
                inputs[2].value = paxN;
            }
        });
        // Recalculate totals after update
        calcTotal();
    };

    window.updateRentalPrice = function () {
        const hotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
        const salonName = document.getElementById("evt-salon").value;
        const jornada = document.getElementById("evt-jornada").value;

        // Debug scope
        console.log("updateRentalPrice Triggered:", { hotel, salonName, jornada, configLoaded: !!globalConfig });

        if (!globalConfig || !globalConfig[hotel]) {
            console.warn("Global Config not ready or hotel missing");
            return;
        }

        const sObj = globalConfig[hotel].find(s => s.name === salonName);
        if (!sObj) {
            console.warn("Salon not found in config:", salonName);
            return;
        }

        let price = (jornada === 'todo') ? (sObj.priceFull || 0) : (sObj.priceHalf || 0);
        console.log("Price Calculated:", price);

        // Find existing 'Alquiler Salón' row
        let found = false;
        document.querySelectorAll("#services-list tr").forEach(row => {
            const inp = row.querySelector("input[type='text']");
            // Check if it looks like a rental line (starts with Alquiler Salón)
            if (inp && inp.value.startsWith("Alquiler Salón")) {
                found = true;
                row.querySelector(".row-price").value = window.MesaChef.formatEuroValue(price);
                inp.value = `Alquiler Salón ${salonName} - ${jornada}`;
                calcTotal(); // Update totals
            }
        });

        if (!found) {
            console.log("Creating new rental row...");
            const row = document.createElement("tr");
            const dateStr = window.currentViewDate || document.getElementById("evt-fecha").value;
            row.innerHTML = `
                <td class="p-2 border-b"><input type="date" value="${dateStr}" class="text-xs bg-gray-50 w-24 rounded border-gray-200"></td>
                <td class="p-2 border-b"><input type="text" value="Alquiler Salón ${salonName} - ${jornada}" list="charge-options" onchange="updateRowPrice(this)" class="text-xs font-bold w-full rounded border-gray-200"></td>
                <td class="p-2 border-b"><input type="number" onchange="calcTotal()" value="1" class="text-xs text-center row-uds w-full rounded border-gray-200"></td>
                <td class="p-2 border-b">
                    <div class="relative w-full">
                        <input type="text" onchange="calcTotal()" value="${window.MesaChef.formatEuroValue(price)}" 
                               onfocus="window.MesaChef.unformatEuroInput(this)" onblur="window.MesaChef.formatEuroInput(this)"
                               class="text-xs text-right row-price w-full rounded border-gray-200 pr-6">
                        <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">€</span>
                    </div>
                </td>
                <td class="p-2 border-b text-right font-bold text-xs row-total text-slate-600">${window.MesaChef.formatEuroValue(price)} €</td>
                <td class="p-2 border-b text-center"><button onclick="this.closest('tr').remove(); calcTotal()" class="text-red-400 hover:text-red-600 font-bold">&times;</button></td>
            `;
            document.getElementById("services-list").prepend(row);
            calcTotal();
        }
    };

    window.saveBooking = async function () {
        const btn = document.querySelector("button[onclick='saveBooking()']");
        const originalText = btn.innerText;
        btn.innerText = "Guardando...";
        btn.disabled = true;

        const payload = {
            hotel: localStorage.getItem(STORAGE_KEY) || "Guadiana",
            created_at: new Date().toISOString(),
            fecha: document.getElementById("evt-fecha").value,
            salon: document.getElementById("evt-salon").value,
            cliente: document.getElementById("evt-nombre").value,
            contact: {
                tel: document.getElementById("evt-telefono").value,
                email: document.getElementById("evt-email").value
            },
            estado: document.getElementById("evt-estado").value,
            revisado: document.getElementById("evt-revisado").checked, // Save Status
            detalles: {
                jornada: document.getElementById("evt-jornada").value,
                montaje: document.getElementById("evt-montaje").value,
                hora: document.getElementById("evt-hora").value,
                pax_adultos: parseInt(document.getElementById("evt-pax-a").value) || 0,
                pax_ninos: parseInt(document.getElementById("evt-pax-n").value) || 0
            },
            notas: {
                interna: document.getElementById("evt-nota-interna").value,
                cliente: document.getElementById("evt-nota-cliente").value
            },
            presupuestoId: window.currentEventBudgetID || (currentBookingId ? window._resRegistry[currentBookingId]?.presupuestoId : null),
            servicios: []
        };

        const visibleServicios = [];
        document.querySelectorAll("#services-list tr").forEach(row => {
            const inputs = row.querySelectorAll("input");
            visibleServicios.push({
                fecha: inputs[0].value,
                concepto: inputs[1].value,
                uds: parseFloat(inputs[2].value) || 0,
                precio: window.MesaChef.parseEuroInput(inputs[3].value),
                total: parseFloat(row.querySelector(".row-total").innerText)
            });
        });

        // MERGE: Keep invisible services from other dates, replace visible ones
        const viewDate = window.currentViewDate;
        if (viewDate && window.currentFullServices.length > 0) {
            // Keep all services NOT for this date
            const otherServices = window.currentFullServices.filter(s => s.fecha !== viewDate);
            // Add the current visible ones (which are for this date, or edited to be)
            payload.servicios = [...otherServices, ...visibleServicios];
        } else {
            payload.servicios = visibleServicios;
        }

        console.log("Validating Event:", payload);

        // --- PAST DATE VALIDATION ---
        const eventDate = new Date(payload.fecha);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        eventDate.setHours(0, 0, 0, 0);

        if (eventDate < today) {
            alert("⛔ FECHA INVÁLIDA: No se pueden crear eventos en fechas pasadas.");
            btn.innerText = originalText;
            btn.disabled = false;
            return;
        }

        // --- BLOCK VALIDATION ---
        if (globalConfig.bloqueos) {
            const isBlocked = globalConfig.bloqueos.some(b => {
                return (b.salon === "TODOS" || b.salon === payload.salon) &&
                    (payload.fecha >= b.start && payload.fecha <= b.end);
            });
            if (isBlocked) {
                alert("⛔ FECHA BLOQUEADA: El salón seleccionado no está disponible en esta fecha (Reparación/Bloqueo).");
                btn.innerText = originalText;
                btn.disabled = false;
                return;
            }
        }

        try {
            // --- CONFLICT VALIDATION ---
            // If I am cancelling, I don't care about conflicts
            let conflict = false;
            let conflictReason = "";

            if (payload.estado !== 'cancelada') {
                // Use Shared Validation
                try {
                    const validation = await window.MesaChef.checkSalonAvailability(
                        db,
                        payload.hotel,
                        payload.salon,
                        payload.fecha,
                        payload.detalles.jornada || "todo",
                        currentBookingId // exclude self
                    );

                    if (!validation.available) {
                        conflict = true;
                        conflictReason = validation.reason;
                    }
                } catch (err) {
                    console.error("Validation error", err);
                    alert("Error validando disponibilidad: " + err.message);
                    return;
                }
            }

            if (conflict) {
                alert("⛔ CONFLICTO DE RESERVA:\n" + conflictReason);
                btn.innerText = originalText;
                btn.disabled = false;
                return; // ABORT SAVE
            }

            // --- CONFIRMATION FOR LINKED BUDGETS ---
            if (currentBookingId && (payload.presupuestoId || window.currentEventBudgetID)) {
                if (payload.estado !== 'cancelada' && payload.estado !== 'anulada') {
                    if (!confirm(`⚠️ ATENCIÓN: EVENTO VINCULADO\n\nEste evento está vinculado a un presupuesto.\nCualquier cambio se sincronizará automáticamente.\n\n¿Seguro que deseas guardar los cambios?`)) {
                        btn.innerText = originalText;
                        btn.disabled = false;
                        return;
                    }
                }
            }

            if (currentBookingId) {
                // Update existing
                await db.collection("reservas_salones").doc(currentBookingId).set(payload, { merge: true });
            } else {
                // Create new
                // Create new
                // We typically don't create new reservations from Salones that LINK to budgets manually yet?
                // But if they did (e.g. manually set budget ID), logic applies.
                const ref = await db.collection("reservas_salones").add(payload);
                currentBookingId = ref.id; // Update for sync
            }

            // [NEW] 2-Way Sync: Update Budget if this is linked
            if (payload.presupuestoId) {
                await syncPresupuestoFromSalon(payload);
            }

            closeModal();
            // alert("Evento guardado exitosamente."); // Removed to be less intrusive, UI updates automatically via snapshot
        } catch (e) {
            console.error(e);
            alert("Error: " + e.message);
        } finally {
            if (btn) {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        }
    };

    window.deleteBooking = async function () {
        if (!currentBookingId) return;

        if (!confirm("⚠️ ¿Estás seguro de que quieres ANULAR este evento?\nSe marcará como CANCELADO pero no se borrará del historial.")) {
            return;
        }

        try {
            // SOFT DELETE (Update status to 'cancelada')
            // This allows it to appear in filters as "Cancelados"
            await db.collection("reservas_salones").doc(currentBookingId).update({
                estado: 'cancelada',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Sync Cancellation to Linked Budget
            if (window.currentEventBudgetID) {
                try {
                    console.log("Syncing Cancellation to Budget:", window.currentEventBudgetID);
                    await db.collection("presupuestos").doc(window.currentEventBudgetID).update({
                        estado: 'anulada', // Updated to 'anulada' per user preference
                        lastModifiedSource: 'Salones 🏛️', // Audit Trail
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } catch (errSync) {
                    console.error("Error cancelling linked budget:", errSync);
                }
            }

            closeModal();
            // Trigger grid refresh if needed
            if (window.renderGrid) window.renderGrid();
        } catch (e) {
            console.error("Error deleting:", e);
            alert("Error al anular: " + e.message);
        }
    };

    window.printReport = function (mode) {
        const hotel = localStorage.getItem(STORAGE_KEY) || "Guadiana";
        const dates = utils.getWeekDates(currentWeekStart);
        let title = "";
        let filterFn;

        if (mode === 'dia') {
            const todayStr = utils.toIsoDate(new Date());
            const startStr = utils.toIsoDate(dates[0]);
            const endStr = utils.toIsoDate(dates[6]);
            // If today is in view, use today. Else use start of view.
            let targetDateStr = todayStr;
            if (todayStr < startStr || todayStr > endStr) targetDateStr = startStr;

            const prettyDate = new Date(targetDateStr).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            title = `Informe Diario - ${prettyDate}`;
            filterFn = (r) => r.fecha === targetDateStr && r.estado !== 'cancelada';
        } else {
            const d1 = dates[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            const d2 = dates[6].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            title = `Informe Semanal(${d1} - ${d2})`;
            // Filter is within range
            const s = utils.toIsoDate(dates[0]);
            const e = utils.toIsoDate(dates[6]);
            filterFn = (r) => r.fecha >= s && r.fecha <= e && r.estado !== 'cancelada';
        }

        const logoUrl = (hotel === "Guadiana") ? "Img/logo-guadiana.svg" : "Img/logo-cumbria.svg";

        let html = `
        <div style="font-family: sans-serif; padding: 20px;">
            <div style="display:flex; align-items:center; gap:20px; margin-bottom:20px; border-bottom:2px solid #eee; padding-bottom:15px;">
                <img src="${logoUrl}" style="height:60px; width:auto;">
                <div>
                   <h1 style="font-size: 24px; font-weight: bold; margin:0; color:#333;">${hotel}</h1>
                   <h2 style="font-size: 16px; color: #666; margin:5px 0 0 0;">${title}</h2>
               </div>
            </div>
        `;

        // 0. Collect Rows
        // 0. Collect Rows
        let rows = [];
        loadedReservations.forEach(r => {
            // 1. Hotel Check (Critical for multi-hotel data)
            if (r.hotel && r.hotel !== hotel) return;

            // 2. Status Check (Case Insensitive)
            const st = (r.estado || 'pendiente').toLowerCase();
            const validStatuses = ['pendiente', 'confirmada', 'pending', 'confirmed'];

            if (filterFn(r) && validStatuses.includes(st)) {
                rows.push({ ...r, ts: new Date(r.fecha + 'T' + (r.detalles?.hora || '00:00')) });
            }
        });
        rows.sort((a, b) => a.ts - b.ts);

        // 1. Group records by Date
        const groups = {};
        rows.forEach(r => {
            if (!groups[r.fecha]) groups[r.fecha] = [];
            groups[r.fecha].push(r);
        });

        const sortedDates = Object.keys(groups).sort();

        // 2. Build HTML per Date
        sortedDates.forEach(dateStr => {
            const dateObj = new Date(dateStr);
            const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
            const dayNameCap = dayName.charAt(0).toUpperCase() + dayName.slice(1);

            html += `<h3 style="font-size: 16px; font-weight: bold; margin-top: 20px; margin-bottom: 5px; color: #2c3e50; border-bottom: 2px solid #ddd; padding-bottom: 5px;">📅 ${dayNameCap}</h3>`;

            // Table Header
            html += `<table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px;">
                        <thead>
                            <tr style="background: #f1f5f9; color: #475569; text-align: left;">
                                <th style="padding: 6px; width: 45px; border-bottom: 2px solid #ddd;">Hora</th>
                                <th style="padding: 6px; width: 90px; border-bottom: 2px solid #ddd;">Salón</th>
                                <th style="padding: 6px; width: 130px; border-bottom: 2px solid #ddd;">Cliente</th>
                                <th style="padding: 6px; width: 80px; border-bottom: 2px solid #ddd;">Montaje</th>
                                <th style="padding: 6px; width: 60px; border-bottom: 2px solid #ddd;">Jornada</th>
                                <th style="padding: 6px; width: 30px; border-bottom: 2px solid #ddd; text-align:center;">Pax</th>
                                <th style="padding: 6px; width: 40px; border-bottom: 2px solid #ddd;">Est.</th>
                            </tr>
                        </thead>
                        <tbody>`;

            let dailyPax = 0;
            let eventCount = 0;

            groups[dateStr].forEach((r, index) => {
                const pax = (parseInt(r.detalles?.pax_adultos) || 0) + (parseInt(r.detalles?.pax_ninos) || 0);
                dailyPax += pax;
                eventCount++;

                const time = r.detalles?.hora || "--:--";
                const space = r.salon || "Salon";
                const spaceAbbr = space.substring(0, 15) + (space.length > 15 ? '.' : '');
                const clientName = r.cliente || "Sin Nombre";
                const montaje = r.detalles?.montaje || "-";
                const jornada = r.detalles?.jornada || "-";

                let statusFull = r.estado || "";
                let statusAbbr = (statusFull === 'confirmada' || statusFull === 'confirmed') ? 'Conf' : 'Pend';
                let notesText = r.notas?.interna || "";

                // Add a top border only if it's not the first item, to separate groups
                const borderStyle = index > 0 ? "border-top: 1px solid #ddd;" : "";

                // Main Row
                html += `<tr style="${borderStyle}">
                            <td style="padding: 6px; font-weight:bold;">${time}</td>
                            <td style="padding: 6px; color:#555;">${spaceAbbr}</td>
                            <td style="padding: 6px; font-weight:600; color:#333;">${clientName.substring(0, 20)}</td>
                            <td style="padding: 6px;">${montaje.substring(0, 10)}</td>
                            <td style="padding: 6px;">${jornada}</td>
                            <td style="padding: 6px; text-align:center;">${pax}</td>
                            <td style="padding: 6px;">${statusAbbr}</td>
                        </tr>`;

                // Notes Row
                if (notesText) {
                    html += `<tr>
                                <td colspan="7" style="padding: 2px 6px 8px 6px; color:#666; font-style:italic; font-size:10px;">
                                    📝 ${notesText}
                                </td>
                             </tr>`;
                } else {
                    // Empty row to keep spacing consistent if no notes? Or just omit.
                    // Omitting assumes the top border of next row handles separation.
                }
            });

            html += `</tbody></table>`;

            html += `<div style="font-size: 13px; font-weight: bold; color: #333; margin-bottom: 30px; background: #fafafa; padding: 10px; border-left: 4px solid #666;">
                Resumen día ${dateObj.getDate()}: Total ${dailyPax} personas (${eventCount} eventos)
            </div>`;
        });

        html += `
            <div style="margin-top: 20px; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 5px;">
                Impreso el ${new Date().toLocaleString()}
            </div>
        </div>`;

        const printArea = document.getElementById("printArea");
        if (printArea) {
            printArea.innerHTML = html;
            window.print();
        }
    };

    window.changeWeek = function (delta) {
        currentWeekStart.setDate(currentWeekStart.getDate() + (delta * 7));
        renderGrid();
        updateDatePicker();
    }

    window.resetToday = function () {
        currentWeekStart = new Date();
        renderGrid();
        updateDatePicker();
    }

    window.goToDate = function (val) {
        if (!val) return;
        currentWeekStart = new Date(val);
        renderGrid();
        // The input is already set by the user, but we sync state
    };

    // Helper to update the input
    function updateDatePicker() {
        const picker = document.getElementById("currentDate");
        if (picker && currentWeekStart) {
            picker.value = utils.toIsoDate(currentWeekStart);
        }
    }

    // Helper for 2-Way Sync
    async function syncPresupuestoFromSalon(reserva) {
        if (!reserva.presupuestoId) return;
        try {
            console.log("Syncing Budget from Salon update...", reserva.presupuestoId);
            const pRef = db.collection("presupuestos").doc(reserva.presupuestoId);

            // Map Salon Services to Budget Lines
            // We assume Salon Services are the master when editing from Salon
            const budgetLines = (reserva.servicios || []).map(s => ({
                fecha: s.fecha,
                concepto: s.concepto,
                uds: s.uds,
                precio: s.precio,
                total: (s.uds || 0) * (s.precio || 0)
            }));

            // Calc Totals
            const newTotal = budgetLines.reduce((acc, curr) => acc + (curr.total || 0), 0);

            // Heuristic for Pax: Sum of Uds for items that look like Menus/OpenBar, ignored for Rental
            let newPax = 0;
            budgetLines.forEach(l => {
                const c = (l.concepto || "").toLowerCase();
                if (!c.includes("alquiler") && !c.includes("montaje")) {
                    newPax += (l.uds || 0);
                }
            });
            // Validation: if newPax is 0 but we have valid pax in form details, maybe use that?
            // But let's stick to lines to be consistent with Budget logic.

            await pRef.update({
                lines: budgetLines,
                pax: newPax,
                paxAdultos: reserva.detalles.pax_adultos || 0,
                paxNinos: reserva.detalles.pax_ninos || 0,
                importeTotal: newTotal,
                fecha: reserva.fecha, // Sync Date
                cliente: reserva.cliente, // Sync Client Name
                montaje: reserva.detalles.montaje || "", // Sync Montaje
                turno: reserva.detalles.jornada || "", // Sync Turno/Jornada
                horaInicio: reserva.detalles.hora || "", // Sync Time
                lastModifiedSource: 'Salones 🏛️', // Audit Trail
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log("✅ Budget Synced from Salon!");

        } catch (e) {
            console.error("Error syncing Budget from Salon:", e);
        }
    }

    window.createGrandEvent = function () {
        // Redirect to Grandes Eventos with current Salon and Date
        const salon = document.getElementById("evt-salon").value;
        // Use currentViewDate if set (from openBooking), otherwise from input
        const date = window.currentViewDate || document.getElementById("evt-fecha").value;

        if (!salon || !date) {
            alert("Por favor selecciona Salón y Fecha primero.");
            return;
        }

        // Confirmation?
        if (!confirm(`¿Quieres crear un Gran Evento en ${salon} para el ${date}?\nEsto te llevará al módulo de gestión de Grandes Eventos.`)) return;

        window.location.href = `grandes-eventos.html?salonId=${encodeURIComponent(salon)}&date=${encodeURIComponent(date)}`;
    };

    // Initialize
    ensureFirebase(() => {
        startApp();
        // Set default date in picker after app start
        setTimeout(updateDatePicker, 500);
    });
})();

