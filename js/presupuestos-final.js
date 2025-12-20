// js/presupuestos.js
(function () {
    const { getCurrentHotel, toIsoDate, formatDateES } = window.MesaChef;
    const hotelId = getCurrentHotel();

    // State
    const state = {
        presupuestos: [],
        filtroEstado: "activos", // activos, pendientes, confirmados, anulados, todos
        filtroTexto: "",
        editingId: null,
        currentTotal: 0
    };

    // --- DOM Refs ---
    const tituloHotel = document.getElementById("tituloHotel");
    const estadoConexion = document.getElementById("estadoConexion");
    const listContainer = document.getElementById("listContainer");
    const txtBuscar = document.getElementById("txtBuscar");
    const selFiltro = document.getElementById("selFiltro");
    const btnNuevo = document.getElementById("btnNuevo");

    // Modal Refs
    const modalPresupuesto = document.getElementById("modalPresupuesto");
    const formPresupuesto = document.getElementById("formPresupuesto");
    const tituloModal = document.getElementById("tituloModal");
    const btnCerrarModal = document.getElementById("btnCerrarModal");

    // New Actions
    const btnPDF = document.getElementById("btnPDF");
    const btnGuardar = document.getElementById("btnGuardar");
    // btnEmail moved/removed per request
    const btnAddLine = document.getElementById("btnAddLine");
    const linesContainer = document.getElementById("linesContainer");
    const totalDisplay = document.getElementById("totalDisplay");

    // Form Fields (Updated Ficha)
    const labelRef = document.getElementById("labelRef");
    const campoFechaDesde = document.getElementById("campoFechaDesde");
    const campoFechaHasta = document.getElementById("campoFechaHasta");
    const campoCliente = document.getElementById("campoCliente");
    const campoTipoEvento = document.getElementById("evt-montaje");

    const campoSalon = document.getElementById("campoSalon");
    const campoTurno = document.getElementById("evt-jornada");
    const campoPaxAdultos = document.getElementById("evt-pax-a");
    const campoPaxNinos = document.getElementById("evt-pax-n");

    const campoMontaje = document.getElementById("campoMontaje");
    const capacityDisplay = document.getElementById("capacityDisplay");

    const campoHoraInicio = document.getElementById("campoHoraInicio");

    const campoContacto = document.getElementById("campoContacto");
    const campoTelefono = document.getElementById("campoTelefono");
    const campoEmail = document.getElementById("campoEmail");

    const campoEstado = document.getElementById("campoEstado");
    const campoNotas = document.getElementById("campoNotas");
    const campoNotasCliente = document.getElementById("campoNotasCliente");
    const campoNotaComercial = document.getElementById("evt-nota-comercial");

    // --- Capacity Logic ---
    function updateCapacityDisplay() {
        if (!campoSalon || !campoMontaje || !capacityDisplay) return;

        const salonName = campoSalon.value;
        const montajeVal = campoMontaje.value.trim().toLowerCase();

        if (!salonName || !montajeVal) {
            capacityDisplay.textContent = "";
            return;
        }

        const salon = globalConfig.salones.find(s => s.name === salonName);
        if (!salon || !salon.capacities) {
            capacityDisplay.textContent = "";
            return;
        }

        let key = montajeVal; // default
        // Map user input to keys
        if (montajeVal === "escuela") key = "escuela";
        else if (montajeVal === "teatro") key = "teatro";
        else if (montajeVal === "imperial") key = "imperial";
        else if (montajeVal === "banquete") key = "banquete";
        else if (montajeVal === "u" || montajeVal === "forma u") key = "forma_u";
        else if (montajeVal === "cocktail" || montajeVal === "cóctel" || montajeVal === "coctel") key = "coctel";

        const cap = salon.capacities[key];
        if (cap) {
            capacityDisplay.textContent = `Capacidad Máx: ${cap} pax`;
        } else {
            capacityDisplay.textContent = "";
        }
    }

    if (campoSalon) campoSalon.addEventListener("change", updateCapacityDisplay);
    if (campoMontaje) {
        campoMontaje.addEventListener("change", updateCapacityDisplay);
        campoMontaje.addEventListener("input", updateCapacityDisplay);
    }

    // --- CONFIG STATE ---
    let globalConfig = { salones: [], conceptos: [] };

    // --- UI Helpers ---
    function nombreHotelCompleto(id) {
        if (id === "Guadiana") return "Sercotel Guadiana";
        if (id === "Cumbria") return "Cumbria Spa&Hotel";
        return id || "Hotel";
    }

    function formatEuro(n) {
        if (!n || isNaN(n)) return "0,00 €";
        return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
    }

    function actualizarEstadoConexion(status) {
        if (!estadoConexion) return;
        estadoConexion.className = "estado-conexion";
        if (status === "ok") {
            estadoConexion.classList.add("estado-ok");
            estadoConexion.textContent = "Conectado";
        } else if (status === "error") {
            estadoConexion.classList.add("estado-error");
            estadoConexion.textContent = "Sin conexión";
        } else {
            estadoConexion.style.backgroundColor = "#fff3cd";
            estadoConexion.style.color = "#856404";
            estadoConexion.textContent = "Cargando...";
        }
    }

    // --- INIT UI ---
    const headerHotelName = document.getElementById("headerHotelName");
    if (headerHotelName) {
        if (hotelId === "Guadiana") {
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
    }

    // --- FIRESTORE ---
    const colPresupuestos = db.collection("presupuestos");
    const docCounter = db.collection("counters").doc(`presupuestos_${hotelId}`);

    // --- CONFIG LOADING ---
    async function loadConfig() {
        if (globalConfig.salones.length > 0) return; // Already loaded

        try {
            const snap = await db.collection("master_data").doc("CONFIG_SALONES").get();
            if (snap.exists) {
                const data = snap.data();

                // 1. Salones
                const rawSalones = data[hotelId] || [];
                globalConfig.salones = rawSalones;

                if (campoSalon) {
                    const currentVal = campoSalon.value; // preserve if editing
                    campoSalon.innerHTML = '<option value="">-- Seleccionar --</option>';

                    // [NEW] Inject "Restaurante" if not present
                    const hasRestaurante = globalConfig.salones.some(s => s.name === "Restaurante");
                    if (!hasRestaurante) {
                        globalConfig.salones.push({ name: "Restaurante", capacity: 150, priceFull: 0, priceHalf: 0, m2: 0 });
                    }

                    globalConfig.salones.forEach(s => {
                        const opt = document.createElement("option");
                        opt.value = s.name;

                        // Construct label: Name - M2 - Capacity
                        let label = s.name;
                        if (s.m2) label += ` - ${s.m2} m²`;
                        const cap = s.capacidad || s.capacity || s.maxPax;
                        if (cap) label += ` - Max ${cap} pax`;

                        opt.textContent = label;
                        campoSalon.appendChild(opt);
                    });
                    if (currentVal) campoSalon.value = currentVal;
                }

                // 2. Conceptos (for Autocomplete)
                // 2. Conceptos (Extras from Config)
                const conceptos = data.extras || [];
                globalConfig.conceptos = conceptos;
                // Load Legal Text
                if (data.textoLegal) globalConfig.textoLegal = data.textoLegal;

                const dataList = document.getElementById("charge-options");
                if (dataList) {
                    dataList.innerHTML = "";
                    conceptos.forEach(c => {
                        const opt = document.createElement("option");
                        opt.value = c.name || c.concepto;
                        opt.dataset.price = c.price || c.precio || 0;
                        dataList.appendChild(opt);
                    });
                }
            }
        } catch (e) { console.error("Error loading config", e); }
    }

    // --- LOGIC ---
    let currentLines = [];

    // Auto-Add Salon Rental Line
    function updateSalonLine() {
        const salonName = campoSalon.value;
        const existingIdx = currentLines.findIndex(l => l.concepto && l.concepto.startsWith("Alquiler Salón"));

        if (!salonName) return;

        // [NEW] If "Restaurante" is selected, do NOT add rental line. Remove if exists.
        if (salonName === "Restaurante") {
            if (existingIdx >= 0) {
                currentLines.splice(existingIdx, 1);
                renderLines();
            }
            return;
        }

        const salonConfig = globalConfig.salones.find(s => s.name === salonName);
        if (!salonConfig) return;

        const turno = campoTurno.value; // "Día completo", "1/2 Mañana", "1/2 Tarde"

        let price = salonConfig.priceFull || salonConfig.alquiler || 0;

        // Define half-day logic
        const isHalfDay = turno.includes("1/2") || turno.includes("Mañana") || turno.includes("Tarde");
        if (isHalfDay) {
            price = salonConfig.priceHalf || salonConfig.alquiler_media || (price / 2);
        }

        // Check if line exists
        const conceptStr = `Alquiler Salón ${salonName}`;

        if (existingIdx >= 0) {
            // Update existing
            currentLines[existingIdx].concepto = conceptStr;
            currentLines[existingIdx].precio = price;
        } else {
            // Add new
            currentLines.unshift({
                fecha: campoFechaDesde.value || toIsoDate(new Date()),
                concepto: conceptStr,
                uds: 1,
                precio: price
            });
        }
        renderLines();
    }

    // Listeners for Auto-Logic
    if (campoSalon) campoSalon.addEventListener("change", updateSalonLine);
    if (campoTurno) campoTurno.addEventListener("change", updateSalonLine);


    // [NEW] Sync: Header Pax -> Service Lines
    function syncLinesFromPax() {
        const paxA = parseInt(campoPaxAdultos.value) || 0;
        const paxN = parseInt(campoPaxNinos.value) || 0;

        let changed = false;
        currentLines.forEach((line) => {
            const lower = (line.concepto || "").toLowerCase();
            const isMenu = lower.includes("menú") || lower.includes("menu") || lower.includes("barra") || lower.includes("cóctel") || lower.includes("coctel");

            if (isMenu) {
                if (lower.includes("adulto") || lower.includes("adults")) {
                    if (line.uds !== paxA) {
                        line.uds = paxA;
                        changed = true;
                    }
                } else if (lower.includes("niño") || lower.includes("nino") || lower.includes("child") || lower.includes("infantil")) {
                    if (line.uds !== paxN) {
                        line.uds = paxN;
                        changed = true;
                    }
                }
            }
        });

        if (changed) renderLines();
    }

    // Attach Listeners to Header Pax Fields
    if (campoPaxAdultos) {
        campoPaxAdultos.addEventListener("input", syncLinesFromPax);
        // Also sync on change to be sure
        campoPaxAdultos.addEventListener("change", syncLinesFromPax);
    }
    if (campoPaxNinos) {
        campoPaxNinos.addEventListener("input", syncLinesFromPax);
        campoPaxNinos.addEventListener("change", syncLinesFromPax);
    }


    // Lines Logic
    function renderLines() {
        if (!linesContainer) return;

        // AUTO-CALC DATES
        if (currentLines.length > 0) {
            let minDate = currentLines[0].fecha;
            let maxDate = currentLines[0].fecha;
            currentLines.forEach(l => {
                if (l.fecha < minDate) minDate = l.fecha;
                if (l.fecha > maxDate) maxDate = l.fecha;
            });
            if (campoFechaDesde) campoFechaDesde.value = minDate;
            if (campoFechaHasta) campoFechaHasta.value = maxDate;
        }

        linesContainer.innerHTML = "";
        let total = 0;

        currentLines.forEach((line, index) => {
            const isSC = line.sinCargo === true;
            // Ensure uds is a number for calculation
            const units = parseFloat(line.uds) || 0;
            const lineTotal = units * (isSC ? 0 : (line.precio || 0)); // Calculate lineTotal considering sinCargo
            total += lineTotal;

            const priceDisplay = isSC ? 0 : (line.precio || 0);
            const totalDisplay = isSC ? "S/C" : (lineTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €');
            const bgClass = isSC ? "bg-green-50" : "";

            const row = document.createElement("div");
            row.className = `grid grid-cols-[120px_1fr_60px_80px_80px_80px] gap-2 px-4 py-2 items-center text-sm border-b border-slate-50 last:border-0 ${bgClass}`;
            row.innerHTML = `
                <input type="date" class="border border-slate-200 rounded px-1 py-1 text-xs" value="${line.fecha || ''}" onchange="updateLine(${index}, 'fecha', this.value)">
                <input type="text" list="charge-options" class="border border-slate-200 rounded px-2 py-1 flex-1 text-xs font-semibold text-slate-700" value="${line.concepto || ''}" onchange="updateLine(${index}, 'concepto', this.value)" placeholder="Concepto">
                <input type="number" class="border border-slate-200 rounded px-1 py-1 text-center text-xs" value="${line.uds || 1}" onchange="updateLine(${index}, 'uds', this.value)">
                
                <!-- Price Input: Disabled if S/C -->
                <input type="number" step="0.01" class="border border-slate-200 rounded px-1 py-1 text-right text-xs ${isSC ? 'text-green-600 font-bold bg-transparent' : ''}" 
                       value="${priceDisplay}" ${isSC ? 'disabled' : ''} 
                       onchange="updateLine(${index}, 'precio', this.value)">

                <div class="text-right font-bold text-slate-700 text-xs">${totalDisplay}</div>
                
                <div class="flex items-center justify-end gap-1">
                     <button onclick="toggleSinCargo(${index})" class="p-1 rounded hover:bg-slate-100 transition ${isSC ? 'text-green-600 bg-green-100 ring-1 ring-green-200' : 'text-slate-400'}" title="${isSC ? 'Quitar Sin Cargo' : 'Marcar Sin Cargo'}">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                     </button>
                    <button onclick="removeLine(${index})" class="text-red-400 hover:text-red-600 transition p-1 rounded hover:bg-red-50" title="Eliminar">&times;</button>
                </div>
            `;
            linesContainer.appendChild(row);
        });

        // UPDATE UI TOTALS
        if (totalDisplay) totalDisplay.textContent = formatEuro(total); // Original totalDisplay element
        // [FIX] Removed fieldTotal reference


        state.currentTotal = total; // Store for save

        // CHECK "SIN VALORAR" (Warning logic)
        // Explicit logic: If total is 0 AND no lines are marked 'Sin Cargo', assume unvalued.
        // If total is 0 but lines exist and any is Sin Cargo (or just lines exist but we assume conscious 0), logic might differ.
        // User request: "esto tambien indicaria que si esta valorado"
        // So: If Total > 0 OR (Total == 0 AND hasSinCargoLines), it is valued.

        const hasSinCargo = currentLines.some(l => l.sinCargo === true);
        const pNota = document.querySelector(".p-nota"); // Assuming class p-nota for warning
        if (pNota) {
            if (total === 0 && !hasSinCargo && currentLines.length > 0) {
                // Warning
                if (!pNota.querySelector(".flash-warning")) {
                    pNota.innerHTML += ` <span class="flash-warning ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200 animate-pulse">⚠️ PRESUPUESTO SIN VALORAR</span>`;
                }
            } else {
                // Remove warning
                const warn = pNota.querySelector(".flash-warning");
                if (warn) warn.remove();
            }
        }
    }

    window.updateLine = function (index, field, value) {
        if (!currentLines[index]) return;

        if (field === 'uds' || field === 'precio') {
            currentLines[index][field] = parseFloat(value) || 0;

            // [NEW] Sync: Line Units -> Header Pax
            if (field === 'uds') {
                const lower = (currentLines[index].concepto || "").toLowerCase();
                const newUnits = parseInt(value) || 0;

                // Only sync if it allows "Menu", "Barra", "Coctel"
                const isMenu = lower.includes("menú") || lower.includes("menu") || lower.includes("barra") || lower.includes("cóctel") || lower.includes("coctel");

                if (isMenu) {
                    if (lower.includes("adulto") || lower.includes("adults")) {
                        if (campoPaxAdultos) campoPaxAdultos.value = newUnits;
                    } else if (lower.includes("niño") || lower.includes("nino") || lower.includes("child") || lower.includes("infantil")) {
                        if (campoPaxNinos) campoPaxNinos.value = newUnits;
                    }
                }
            }

        } else if (field === 'concepto') {
            currentLines[index][field] = value;

            // [NEW] Auto-Fill Pax based on Keywords
            const lower = value.toLowerCase();
            if (lower.includes("adulto") || lower.includes("adults")) {
                currentLines[index].uds = parseInt(campoPaxAdultos.value) || 0;
            } else if (lower.includes("niño") || lower.includes("nino") || lower.includes("child") || lower.includes("infantil")) {
                currentLines[index].uds = parseInt(campoPaxNinos.value) || 0;
            }

            // Auto-price if not S/C
            if (currentLines[index].sinCargo !== true) {
                const match = globalConfig.conceptos.find(c => c.name === value);
                if (match) {
                    currentLines[index].precio = parseFloat(match.price || match.precio || 0);
                } else {
                    const opt = document.querySelector(`#charge-options option[value="${value}"]`);
                    if (opt && opt.dataset.price) {
                        currentLines[index].precio = parseFloat(opt.dataset.price);
                    }
                }
            }
        } else {
            currentLines[index][field] = value;
        }

        renderLines();
    };

    window.toggleSinCargo = function (index) {
        if (!currentLines[index]) return;
        const current = currentLines[index].sinCargo === true;
        currentLines[index].sinCargo = !current;

        if (!current) {
            // Enabling S/C: Save old price if needed? Or just set to 0. 
            // Usually just effectively 0.
            currentLines[index]._oldPrice = currentLines[index].precio;
            currentLines[index].precio = 0;
        } else {
            // Disabling S/C: Restore price or keep 0?
            currentLines[index].precio = currentLines[index]._oldPrice || 0;
            delete currentLines[index]._oldPrice;
        }
        renderLines();
    };

    window.removeLine = function (index) {
        currentLines.splice(index, 1);
        renderLines();
    };

    if (btnAddLine) {
        btnAddLine.onclick = () => {
            // Default concept logic
            let defaultConcept = "";
            if (!campoSalon.value) {
                defaultConcept = "Alquiler de salón";
            }

            currentLines.push({
                fecha: campoFechaDesde.value || toIsoDate(new Date()),
                concepto: defaultConcept,
                uds: 1,
                precio: 0
            });
            renderLines();
        };
    }

    // 1. Escuchar datos (Read)
    function escucharPresupuestos() {
        actualizarEstadoConexion("pending");
        colPresupuestos
            .where("hotel", "==", hotelId)
            .onSnapshot(
                (snap) => {
                    actualizarEstadoConexion("ok");
                    state.presupuestos = [];
                    snap.forEach((d) => {
                        const data = d.data();
                        // Fallback safe date
                        let fechaJS = new Date();
                        if (data.createdAt && data.createdAt.toDate) fechaJS = data.createdAt.toDate();

                        // Map old fields if needed for sorting
                        const dateSort = data.fechaDesde || data.fechaEvento;

                        state.presupuestos.push({
                            id: d.id,
                            ...data,
                            _createdAtJS: fechaJS,
                            _dateSort: dateSort
                        });

                        // Check Expiration (Auto-Caducidad)
                        // Rule: Expire if > 10 days since creation OR Event Date Passed
                        if (data.estado === 'pendiente') {
                            const now = new Date();
                            // Reset time for date comparison
                            now.setHours(0, 0, 0, 0);

                            let shouldExpire = false;

                            // 1. Check Creation Date (10 days)
                            if (fechaJS) {
                                const diffTime = now - fechaJS;
                                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                if (diffDays > 10) shouldExpire = true;
                            }

                            // 2. Check Event Date (If past)
                            if (data.fechaDesde || data.fechaEvento) {
                                const eventDate = new Date(data.fechaDesde || data.fechaEvento);
                                eventDate.setHours(0, 0, 0, 0); // compare dates only
                                if (eventDate < now) shouldExpire = true;
                            }

                            if (shouldExpire) {
                                // Mark as expired in DB (Async, fire & forget)
                                console.log(`Auto-expiring budget ${d.id}`);
                                db.collection("presupuestos").doc(d.id).update({
                                    estado: 'caducado',
                                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                                }).catch(err => console.error("Error expiring budget", err));
                            }
                        }
                    });
                    // Client-side Sort
                    state.presupuestos.sort((a, b) => (b._createdAtJS || 0) - (a._createdAtJS || 0));

                    renderList();
                },
                (err) => {
                    console.error("Error escuchando presupuestos", err);
                    actualizarEstadoConexion("error");
                }
            );
    }

    // 2. Generar Referencia Única (Transaction)
    async function generarReferenciaUnica() {
        const year = new Date().getFullYear();
        const prefix = `${hotelId.charAt(0).toUpperCase()}${year}-`; // Ej: G2025- or C2025-

        // Transacción para incrementar contador
        try {
            const nuevaRef = await db.runTransaction(async (transaction) => {
                const cDoc = await transaction.get(docCounter);
                let currentSeq = 0;
                let dbYear = year;

                if (cDoc.exists) {
                    const data = cDoc.data();
                    if (data.year === year) {
                        currentSeq = data.seq || 0;
                    } else {
                        currentSeq = 0;
                    }
                }

                const nextSeq = currentSeq + 1;
                const seqStr = String(nextSeq).padStart(4, "0"); // 0001
                transaction.set(docCounter, { year: year, seq: nextSeq });
                return prefix + seqStr;
            });
            return nuevaRef;
        } catch (e) {
            console.error("Error transacción contador:", e);
            throw e;
        }
    }

    // 3. Render List
    function renderList() {
        if (!listContainer) return;

        // Filtrar
        let filtered = state.presupuestos.filter(item => {
            // Filtro Texto
            if (state.filtroTexto) {
                const search = ((item.referencia || "") + " " + (item.cliente || "") + " " + (item.tipoEvento || "")).toLowerCase();
                if (!search.includes(state.filtroTexto)) return false;
            }

            // Filtro Estado
            const st = (item.estado || "pendiente").toLowerCase();

            // 1. ACTIVOS: solo (PENDIENTE or ENVIADA) OR (CONFIRMADA/ACEPTADA con fecha >= Hoy)
            // EXCLUYE: ANULADA, RECHAZADA, ARCHIVADA, CADUCADO
            if (state.filtroEstado === "activos") {
                if (st === "anulada" || st === "rechazada" || st === "archivada" || st === "caducado") return false;

                // Si está confirmada/aceptada, verificar fecha
                if (st === "confirmada" || st === "aceptada") {
                    if (item.fechaDesde || item.fechaEvento) {
                        const evtDate = new Date(item.fechaDesde || item.fechaEvento);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        evtDate.setHours(0, 0, 0, 0);
                        // Si es pasado -> false
                        if (evtDate < today) return false;
                    }
                }
                // Si es pendiente/enviada (y no caducado, que ya lo filtramos arriba), pasa.
                return true;
            }

            // 2. Pendientes: solo pendientes/enviadas (se ve si caducan o no por el badge, pero aqui el user pidio "solo pendientes")
            if (state.filtroEstado === "pendientes") {
                return (st === "pendiente" || st === "enviada");
            }

            // 3. Confirmados: TODOS (cualquier fecha)
            if (state.filtroEstado === "confirmados") {
                return (st === "confirmada" || st === "aceptada");
            }

            // 4. Anulados: TODOS
            if (state.filtroEstado === "anulados") {
                return (st === "anulada" || st === "rechazada" || st === "archivada" || st === "caducado");
            }

            // 5. Ver Todos/Fallback
            if (state.filtroEstado === "todos") return true;

            return st.includes(state.filtroEstado);
        });

        if (filtered.length === 0) {
            listContainer.innerHTML = `<div style="text-align:center; padding:40px; color:#999;">No hay presupuestos con este criterio.</div>`;
            return;
        }

        let html = `
      <div class="presupuestos-grid-header">
         <div>REF</div>
         <div>FECHA</div>
         <div>SALÓN</div>
         <div>CLIENTE / EVENTO</div>
         <div>NOTAS COM.</div>
         <div>PAX</div>
         <div>IMPORTE</div>
         <div>ESTADO / ORIGEN</div>
         <div>ACCIONES</div>
      </div>
      <div class="presupuestos-list-body">
    `;

        filtered.forEach(p => {
            // Display main Date (Fecha Desde or old fechaEvento)
            const mainDate = p.fechaDesde || p.fechaEvento;
            const fechaFmt = mainDate ? formatDateES(new Date(mainDate)) : "-";

            let badgeClass = "badge-gray";
            if (p.estado === "confirmada" || p.estado === "aceptada") badgeClass = "badge-green";
            if (p.estado === "anulada" || p.estado === "rechazada" || p.estado === "cancelada") badgeClass = "badge-red";
            if (p.estado === "pendiente") badgeClass = "badge-orange";
            if (p.estado === "enviada") badgeClass = "badge-blue";

            // Audit Source Badge
            let sourceBadge = "";
            if (p.lastModifiedSource) {
                sourceBadge = `<div class="text-[9px] uppercase font-bold text-gray-400 mt-1 tracking-wider border-t border-gray-100 pt-0.5" title="Modificado desde ${p.lastModifiedSource}">${p.lastModifiedSource}</div>`;
            }

            // Countdown Logic
            let countdownHtml = "";
            if (p.estado === "pendiente") {
                const now = new Date();
                now.setHours(0, 0, 0, 0);

                let daysLeft = 10; // Default max from creation

                // 1. Calc days from creation
                if (p._createdAtJS) {
                    const diffTime = now - p._createdAtJS;
                    const daysPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    daysLeft = 10 - daysPassed;
                }

                // 2. Calc days to Event (if closer)
                if (p.fechaDesde || p.fechaEvento) {
                    const eventDate = new Date(p.fechaDesde || p.fechaEvento);
                    eventDate.setHours(0, 0, 0, 0);
                    const daysToEvent = Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24));
                    if (daysToEvent < daysLeft) {
                        daysLeft = daysToEvent;
                    }
                }

                if (daysLeft >= 0) {
                    countdownHtml = `<div class="text-[10px] text-orange-600 font-bold mt-1">⏳ Quedan ${daysLeft} días</div>`;
                } else {
                    // Should be expired by logic loop above, but if UI renders fast:
                    countdownHtml = `<div class="text-[10px] text-red-600 font-bold mt-1">Caducado</div>`;
                }
            }

            html += `
        <div class="presupuesto-row" data-id="${p.id}">
           <div class="p-ref">
                <strong>${p.referencia || "---"}</strong>
                ${p.updatedAt && p.updatedAt.toDate ? (() => {
                    const d = p.updatedAt.toDate();
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const hours = String(d.getHours()).padStart(2, '0');
                    const mins = String(d.getMinutes()).padStart(2, '0');
                    return `<div style="font-size:9px; color:#999; margin-top:2px;">Edit: ${day}/${month} ${hours}:${mins}</div>`;
                })() : ""}
           </div>
           <div class="p-fecha">${fechaFmt}</div>
           <div class="p-salon" style="font-size:12px; color:#555; text-align:left;">${p.salon || "---"}</div>
           <div class="p-cliente" style="text-align:left;">
              <div class="p-cliente-nombre">${p.cliente || "Cliente"}</div>
              <div class="p-cliente-sub">${p.tipoEvento || ""}</div>
           </div>
           <div class="p-nota" style="font-size:11px; color:#555; overflow:hidden; text-overflow:ellipsis; text-align:left;">
                ${p.notaComercial || ""}
                ${(p.importeTotal == 0 && !(p.lines && p.lines.some(x => x.sinCargo === true))) ? '<span class="flash-warning">SIN VALORAR</span>' : ''}
           </div>
           <div class="p-pax">${p.pax || 0} pax</div>
           <div class="p-importe font-mono">${formatEuro(p.importeTotal)}</div>
           <div class="p-estado flex flex-col items-center justify-center">
                <span class="badge ${badgeClass}">${p.estado?.toUpperCase()}</span>
                ${sourceBadge}
                ${countdownHtml}
           </div>
           <div class="p-acciones">
              <button class="btn-icon btn-edit" title="Ver/Editar">✏️</button>
           </div>
        </div>
        `;
        });

        listContainer.innerHTML = html;
    }

    // --- 4. Modal Logic (Updated) ---
    async function abrirModal(id = null) {
        modalPresupuesto.classList.remove("hidden");
        await loadConfig();

        if (id) {
            state.editingId = id;
            const item = state.presupuestos.find(x => x.id === id);
            if (!item) return;

            tituloModal.textContent = `Editar Presupuesto ${item.referencia || ""} `;
            labelRef.textContent = item.referencia || "REF-???";

            // Populate Fields
            campoFechaDesde.value = item.fechaDesde || item.fechaEvento || "";
            campoFechaHasta.value = item.fechaHasta || item.fechaEvento || "";
            campoSalon.value = item.salon || "";
            campoCliente.value = item.cliente || "";
            campoTipoEvento.value = item.tipoEvento || "Banquete / Celebración";

            campoTurno.value = item.turno || "Día completo";
            campoPaxAdultos.value = item.paxAdultos || "";
            campoPaxNinos.value = item.paxNinos || "";

            campoMontaje.value = item.montaje || "";
            campoHoraInicio.value = item.horaInicio || "";
            // campoHoraFin removed

            campoContacto.value = item.contacto || "";
            campoTelefono.value = item.telefono || "";
            campoEmail.value = item.email || "";

            campoEstado.value = item.estado || "pendiente";
            campoNotas.value = item.notas || "";
            if (campoNotasCliente) campoNotasCliente.value = item.notasCliente || "";
            if (campoNotaComercial) campoNotaComercial.value = item.notaComercial || "";

            // Restore Lines
            // Restore Lines
            currentLines = item.lines || [];
            if (currentLines.length === 0 && item.importeTotal > 0) {
                // Migration logic
                currentLines.push({ fecha: item.fechaDesde || item.fechaEvento, concepto: "Importe Migrado", uds: 1, precio: item.importeTotal });
            }
            updateCapacityDisplay();
            updateStatusUI(); // Sync UI
            renderLines();

        } else {
            state.editingId = null;
            tituloModal.textContent = "Nuevo Presupuesto";
            labelRef.textContent = "(Nueva Ref)";

            // Defaults
            campoFechaDesde.value = toIsoDate(new Date());
            campoFechaHasta.value = toIsoDate(new Date());
            // campoSalon.value = ""; // Don't reset if we want consistent experience, but usually clear for new.
            // Actually, keep whatever default or empty.
            campoSalon.value = "";

            campoCliente.value = "";
            campoTipoEvento.value = "Banquete / Celebración";

            campoTurno.value = "";
            campoPaxAdultos.value = "";
            campoPaxNinos.value = "";

            campoMontaje.value = "";
            campoHoraInicio.value = "";

            campoContacto.value = "";
            campoTelefono.value = "";
            campoEmail.value = "";

            campoEstado.value = "pendiente";
            campoNotas.value = "";
            if (campoNotasCliente) campoNotasCliente.value = "";
            if (campoNotaComercial) campoNotaComercial.value = "";

            currentLines = [];
            updateCapacityDisplay();
            updateStatusUI(); // Sync UI
            renderLines();
        }
    }

    // --- Status UI Logic ---
    const btnAnular = document.getElementById("btnAnular");
    const btnConfirmar = document.getElementById("btnConfirmar");
    const statusTextDisplay = document.getElementById("statusTextDisplay");

    function updateStatusUI() {
        const val = campoEstado.value;
        if (!statusTextDisplay) return;

        // Reset Styles
        statusTextDisplay.className = "text-xs font-bold uppercase mr-2 border px-2 py-1 rounded";

        if (val === "pendiente") {
            statusTextDisplay.textContent = "PENDIENTE";
            statusTextDisplay.classList.add("text-slate-500", "border-slate-200", "bg-slate-50");
            if (btnAnular) btnAnular.classList.remove("hidden");
            if (btnConfirmar) btnConfirmar.classList.remove("hidden");
        } else if (val === "confirmada") {
            statusTextDisplay.textContent = "CONFIRMADA";
            statusTextDisplay.classList.add("text-green-700", "border-green-200", "bg-green-50");
            // Can't confirm again, but can cancel? Or maybe hide actions?
            if (btnAnular) btnAnular.classList.remove("hidden"); // Allow rollback
            if (btnConfirmar) btnConfirmar.classList.add("hidden");
        } else if (val === "rechazada" || val === "anulada") {
            statusTextDisplay.textContent = "RECHAZADA";
            statusTextDisplay.classList.add("text-red-700", "border-red-200", "bg-red-50");
            // Can confirm if changed mind?
            if (btnAnular) btnAnular.classList.add("hidden");
            if (btnConfirmar) btnConfirmar.classList.remove("hidden"); // Allow restore
        } else {
            statusTextDisplay.textContent = val.toUpperCase();
            statusTextDisplay.classList.add("text-gray-500", "border-gray-200", "bg-gray-50");
            if (btnAnular) btnAnular.classList.remove("hidden");
            if (btnConfirmar) btnConfirmar.classList.remove("hidden");
        }
    }

    // Button Listeners
    if (btnAnular) {
        btnAnular.onclick = async (e) => {
            e.preventDefault();
            if (confirm("¿Marcar este presupuesto como RECHAZADO? Se cancelará la reserva del salón y restaurante.")) {
                campoEstado.value = "rechazada";
                updateStatusUI();
                await guardarDatos(); // Save the rejection state

                // Sync: Cancel Salones & Restaurant Reservation
                if (state.editingId) {
                    try {
                        const batch = db.batch();
                        let changesCount = 0;

                        // 1. Salones
                        const snapSalones = await db.collection("reservas_salones").where("presupuestoId", "==", state.editingId).get();
                        snapSalones.docs.forEach(doc => {
                            batch.update(doc.ref, { estado: 'cancelada' });
                            changesCount++;
                        });

                        // 2. Restaurante
                        const snapRest = await db.collection("reservas_restaurante").where("presupuestoId", "==", state.editingId).get();
                        snapRest.docs.forEach(doc => {
                            batch.update(doc.ref, { estado: 'anulada' });
                            changesCount++;
                        });

                        if (changesCount > 0) {
                            await batch.commit();
                            alert("⚠️ Presupuesto rechazado. Reservas de Salón (CANCELADA) y Restaurante (ANULADA).");
                        }
                    } catch (e) {
                        console.error("Error cancelling reservation:", e);
                        alert("Error cancelando reservas vinculadas: " + e.message);
                    }
                }
            }
        };
    }
    if (btnConfirmar) {
        btnConfirmar.onclick = async (e) => {
            e.preventDefault();
            // Validate Salon before confirming
            if (!campoSalon.value) {
                alert("⚠️ Debes seleccionar un SALÓN antes de confirmar.");
                return;
            }

            if (confirm("¿Confirmar este presupuesto y bloquear salón?")) {
                campoEstado.value = "confirmada";
                updateStatusUI();
                await guardarDatos();
            }
        };
    }

    function cerrarModal() {
        modalPresupuesto.classList.add("hidden");
    }

    // --- 5. Save Logic ---
    if (formPresupuesto) {
        formPresupuesto.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!campoCliente.value) { alert("Indica el cliente"); return; }
            guardarDatos();
        });
    }

    // Helper to allow buttons to trigger submit or custom save
    if (btnGuardar) btnGuardar.onclick = (e) => { e.preventDefault(); guardarDatos(); };

    // PDF Generation
    if (btnPDF) btnPDF.onclick = async (e) => {
        e.preventDefault();
        console.log("Generando PDF...");

        try {
            if (!window.jspdf) throw new Error("Librería PDF no cargada");
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            console.log("Instancia PDF creada");

            // --- HOTEL DATA ---
            let hotelName = "Hotel";
            let hotelAddress = [];
            let logoFile = "";

            if (hotelId === "Guadiana") {
                hotelName = "Sercotel Guadiana";
                hotelAddress = [
                    "Calle Guadiana, 36",
                    "13002 Ciudad Real",
                    "Tel: +34 926 223 313",
                    "Email: info@hotelguadiana.es",
                    "Web: www.sercotelhoteles.com"
                ];
                logoFile = LOGO_GUADIANA_BASE64;
            } else {
                hotelName = "Cumbria Spa & Hotel";
                hotelAddress = [
                    "Ctra. de Toledo, 26",
                    "13005 Ciudad Real",
                    "Tel: +34 926 25 04 04",
                    "Email: info@encumbria.es",
                    "Web: www.cumbriahotel.es"
                ];
                logoFile = LOGO_CUMBRIA_BASE64;
            }

            // Helper to load image with timeout (Handles Data URL immediately)
            const loadImage = (url) => {
                return new Promise((resolve) => {
                    if (url.startsWith("data:")) {
                        resolve(url);
                        return;
                    }
                    const img = new Image();
                    let finished = false;

                    const finish = (result) => {
                        if (finished) return;
                        finished = true;
                        resolve(result);
                    };

                    img.src = url;
                    img.onload = () => {
                        const canvas = document.createElement("canvas");
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext("2d");
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(img, 0, 0);
                        try {
                            finish(canvas.toDataURL("image/png"));
                        } catch (e) {
                            console.warn("Canvas tainted", e);
                            finish(url); // Fallback
                        }
                    };
                    img.onerror = () => {
                        console.warn("Image load failed:", url);
                        finish(null);
                    };

                    // Timeout after 2 seconds
                    setTimeout(() => finish(null), 2000);
                });
            };

            // Fallback: Generate Text Logo
            const createTextLogo = (text, color) => {
                const canvas = document.createElement("canvas");
                canvas.width = 300;
                canvas.height = 100;
                const ctx = canvas.getContext("2d");

                // Bg (Transparent or White)
                // ctx.fillStyle = "#ffffff";
                // ctx.fillRect(0,0,300,100);

                ctx.fillStyle = color;
                ctx.font = "bold 24px Helvetica, Arial, sans-serif";
                ctx.fillText(text, 10, 60);

                // Subtitle or Line
                ctx.fillRect(10, 70, 200, 3);

                return canvas.toDataURL("image/png");
            };

            let imgData = await loadImage(logoFile);

            // If image failed, generate professional text logo
            if (!imgData) {
                const brandColor = (hotelId === "Guadiana") ? "#1e3a8a" : "#0f766e"; // Blue vs Teal
                imgData = createTextLogo(hotelName, brandColor);
            }

            // --- HEADER ---
            // Header Bg
            doc.setFillColor(255, 255, 255); // White (User Request)
            doc.rect(0, 0, 210, 35, 'F');

            // Logo (Left)
            if (imgData) {
                try {
                    doc.addImage(imgData, 'PNG', 14, 8, 50, 20); // Widen to 50 for text logo
                } catch (e) {
                    console.warn("Error adding image to PDF", e);
                    // Last resort text
                    doc.setFontSize(16);
                    doc.setTextColor(40, 40, 50);
                    doc.text(hotelName, 14, 25);
                }
            }

            // If we used a generated logo, we don't need the text next to it usually,
            // unless it's the real logo which might be an icon.
            // Let's only show the text to the right if we loaded a Real Image (not generated)
            // OR just rely on the generated logo which contains the name.

            // Actually, if it's the real logo, it might be just an icon.
            // If it's generated, it IS the name.
            // Safer: Always show name to right nicely aligned, unless it overlaps?
            // Let's show Address Block on right.
            // Center text? 
            // Let's stick to: Logo Left, Address Right. Name is inside Logo if generated.
            // If Real Logo loaded, we might want Name text? 
            // Let's assume real logo has text. If not, user will tell us.

            // Address Block (Right Side)
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(80, 80, 80);
            let addrY = 12;
            hotelAddress.forEach(line => {
                doc.text(line, 196, addrY, { align: 'right' });
                addrY += 5;
            });

            // Separator Line (Now here)
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.1);
            doc.line(14, 35, 196, 35);

            // Date & Ref (Below Line)
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            doc.text(`Fecha: ${formatDateES(new Date())}`, 14, 42); // Below line
            doc.text(`Ref: ${labelRef.textContent}`, 14, 47);

            // --- CLIENT INFO ---
            const startY = 60; // Further reduced gap

            doc.setFontSize(14);
            doc.setTextColor(0, 0, 0);
            doc.setFont(undefined, 'bold');
            doc.text("Datos del Cliente / Evento", 14, startY);

            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(60, 60, 60);

            doc.text(`Cliente:`, 14, startY + 8);
            doc.setFont(undefined, 'bold');
            doc.text(`${campoCliente.value || '-'}`, 35, startY + 8);

            doc.setFont(undefined, 'normal');
            doc.text(`Evento:`, 14, startY + 14);
            doc.setFont(undefined, 'bold');
            doc.text(`${campoTipoEvento.value}`, 35, startY + 14);

            doc.setFont(undefined, 'normal');
            doc.text(`Salón:`, 110, startY + 8);
            doc.setFont(undefined, 'bold');
            doc.text(`${campoSalon.value || '-'}`, 125, startY + 8);

            doc.setFont(undefined, 'normal');
            doc.text(`Pax:`, 110, startY + 14);
            doc.setFont(undefined, 'bold');
            doc.text(`${campoPaxAdultos.value} Ad. / ${campoPaxNinos.value} Niñ.`, 125, startY + 14);

            // Commercial Note Row Removed from PDF as per request

            // --- TABLE ---
            const tableBody = currentLines.map(l => [
                l.fecha,
                l.concepto,
                l.uds,
                formatEuro(l.precio),
                formatEuro(l.uds * l.precio)
            ]);

            doc.autoTable({
                startY: startY + 25,
                head: [['Fecha', 'Concepto', 'Uds', 'Precio', 'Total']],
                body: tableBody,
                theme: 'grid',
                headStyles: { fillColor: [67, 56, 202], textColor: 255, fontStyle: 'bold' }, // Indigo Primary
                bodyStyles: { textColor: 50 },
                styles: { fontSize: 10, cellPadding: 3 },
                columnStyles: {
                    0: { cellWidth: 30 },
                    1: { cellWidth: 'auto' },
                    2: { halign: 'center', cellWidth: 15 },
                    3: { halign: 'right', cellWidth: 25 },
                    4: { halign: 'right', cellWidth: 25, fontStyle: 'bold' },
                },
                foot: [['', '', '', 'TOTAL', formatEuro(state.currentTotal)]],
                footStyles: { fillColor: [245, 247, 250], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'right' }
            });

            // Add IVA Included text below Total
            const finalYTable = doc.lastAutoTable.finalY;
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.setFont(undefined, 'normal');
            doc.text("I.V.A. incluido", 196, finalYTable + 5, null, null, 'right');

            const finalY = doc.lastAutoTable.finalY + 15;

            // --- NOTES ---
            let currentY = finalY;

            if (campoNotasCliente.value) {
                doc.setFillColor(255, 250, 240); // Light orange bg for notes
                doc.roundedRect(14, currentY, 182, 25, 2, 2, 'F');

                doc.setFontSize(10);
                doc.setTextColor(180, 83, 9); // Orange 700
                doc.setFont(undefined, 'bold');
                doc.text("Notas:", 18, currentY + 6);

                doc.setFont(undefined, 'normal');
                doc.setTextColor(80, 60, 40);
                const splitNotes = doc.splitTextToSize(campoNotasCliente.value, 170);
                doc.text(splitNotes, 18, currentY + 12);
                currentY += Math.max(30, splitNotes.length * 5 + 20);
            } else {
                currentY += 10;
            }

            // --- LEGAL FOOTER ---
            // Fetch legal text from fullConfig/master_data if available
            let legalText = "Condiciones: Validez de la oferta 15 días. IVA incluido.";
            try {
                // In loadConfig we loaded globalConfig. But globalConfig might miss 'textoLegal' if it wasn't copied.
                // Let's ensure we used the root data or the field exists.
                if (globalConfig.textoLegal) legalText = globalConfig.textoLegal;
            } catch (e) { }

            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);

            // Place at bottom
            const pageHeight = doc.internal.pageSize.height;
            let footerY = pageHeight - 30; // approx

            const splitLegal = doc.splitTextToSize(legalText, 180);

            // If legal text is long, ensure it doesn't overlap
            if (footerY < currentY + 10) footerY = currentY + 10;

            // Draw Separator
            doc.setDrawColor(220);
            doc.line(14, footerY - 5, 196, footerY - 5);

            doc.text(splitLegal, 14, footerY);

            doc.save(`Presupuesto_${labelRef.textContent}.pdf`);
            console.log("PDF Guardado");

        } catch (err) {
            console.error("Error PDF:", err);
            alert("Error generando PDF: " + err.message);
        }
    };

    async function syncWithSalones(presupuestoId, pData) {
        if (pData.estado !== 'confirmada') return;

        try {
            const reservasCol = db.collection("reservas_salones");
            // Check if exists
            const snap = await reservasCol.where("presupuestoId", "==", presupuestoId).get();

            const reservaPayload = {
                hotel: pData.hotel,
                salon: pData.salon,
                cliente: pData.cliente,
                fecha: pData.fechaDesde, // Main date
                estado: 'confirmada',
                revisado: false, // New from budget, likely needs review
                presupuestoId: presupuestoId,
                referenciaPresupuesto: pData.referencia,
                contact: {
                    tel: pData.telefono || "",
                    email: pData.email || ""
                },
                detalles: {
                    jornada: pData.turno || "todo",
                    montaje: pData.montaje || "",
                    hora: pData.horaInicio || "",
                    pax_adultos: pData.paxAdultos || 0,
                    pax_ninos: pData.paxNinos || 0
                },
                notas: {
                    interna: pData.notas || "",
                    cliente: pData.notasCliente || ""
                },
                servicios: (pData.lines || []).map(l => ({
                    fecha: l.fecha,
                    concepto: l.concepto,
                    uds: l.uds,
                    precio: l.precio,
                    total: (l.uds || 0) * (l.precio || 0)
                })),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                esDePresupuesto: true // [NEW] Flag for 2-way sync
            };

            if (!snap.empty) {
                // Update first match
                const resId = snap.docs[0].id;
                await reservasCol.doc(resId).update(reservaPayload);
                console.log("Reserva Sincronizada (Actualizada):", resId);
            } else {
                // Create
                reservaPayload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await reservasCol.add(reservaPayload);
                console.log("Reserva Sincronizada (Creada)");
            }

        } catch (e) {
            console.error("Error syncing with Salones:", e);
            alert("Presupuesto guardado, pero hubo un error sincronizando con Salones: " + e.message);
        }
    }

    async function syncWithRestaurante(presupuestoId, pData) {
        if (pData.estado !== 'confirmada') return;

        try {
            const reservasRestCol = db.collection("reservas_restaurante");

            // 1. Detect intended shifts from Lines
            const lines = pData.lines || [];
            const targets = new Map(); // Use Map to store Shift -> { adults: 0, children: 0, priceAdult: 0, priceChild: 0 }

            // Helper to get or create target
            const getTarget = (key) => {
                if (!targets.has(key)) targets.set(key, { adults: 0, children: 0, priceAdult: 0, priceChild: 0 });
                return targets.get(key);
            };

            lines.forEach(l => {
                const c = (l.concepto || '').toLowerCase();
                const isRte = /\b(rte|restaurante)\b/i.test(c);
                // const isMenu = /\b(menú|menu)\b/i.test(c); // Unused for now
                const linePrice = parseFloat(l.precio) || 0;
                const linePax = parseInt(l.uds) || 0;

                if (isRte) {
                    let key = 'almuerzo'; // default
                    if (/\b(cena|dinner|noche)\b/i.test(c)) key = 'cena';

                    const t = getTarget(key);

                    // Detect Type: Child vs Adult
                    if (c.includes("niño") || c.includes("nino") || c.includes("child") || c.includes("infantil")) {
                        t.children += linePax;
                        t.priceChild = linePrice;
                    } else {
                        // Default to adult
                        t.adults += linePax;
                        t.priceAdult = linePrice;
                    }
                }
            });

            // 3. Sync Logic (Loop through targets)
            for (const [turnoTarget, info] of targets) {
                if (info.adults === 0 && info.children === 0) continue; // Skip if empty

                // Check if reservation exists for this budget AND this shift
                const snap = await reservasRestCol
                    .where("presupuestoId", "==", presupuestoId)
                    .where("turno", "==", turnoTarget)
                    .get();

                const reservaPayload = {
                    hotel: pData.hotel || "Guadiana",
                    espacio: "Restaurante", // Fixed space name for these synced ones
                    fecha: pData.fechaDesde,
                    turno: turnoTarget,
                    pax: info.adults,        // Split Adults
                    ninos: info.children,    // Split Children
                    precio: info.priceAdult,     // Adult Price
                    precioNinos: info.priceChild, // Child Price
                    // Calculate Total (optional here, but good for consistency)
                    total: (info.adults * info.priceAdult) + (info.children * info.priceChild),
                    cliente: pData.cliente,
                    telefono: pData.telefono || "",
                    email: pData.email || "",
                    notas: `[Ref: ${pData.referencia}] ${pData.notas || ""}`,
                    estado: 'confirmada',
                    origen: 'presupuesto',
                    presupuestoId: presupuestoId,
                    referenciaPresupuesto: pData.referencia,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    esDePresupuesto: true // [NEW] Flag for 2-way sync
                };

                // Add createAt only for new
                if (snap.empty) {
                    reservaPayload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                }

                if (!snap.empty) {
                    // Update existing
                    const resId = snap.docs[0].id;
                    await reservasRestCol.doc(resId).update(reservaPayload);
                    console.log(`Reserva Restaurante (${turnoTarget}) Sincronizada (Actualizada):`, resId);
                    // alert remove to avoid spamming
                } else {
                    // Create new
                    await reservasRestCol.add(reservaPayload);
                    console.log(`Reserva Restaurante (${turnoTarget}) Sincronizada (Creada)`);
                }
            }

            // Cleanup obsolete
            const allSnap = await reservasRestCol.where("presupuestoId", "==", presupuestoId).get();
            allSnap.forEach(doc => {
                const data = doc.data();
                if (!targets.has(data.turno)) {
                    console.log(`Eliminando reserva obsoleta (${data.turno}) id: ${doc.id}`);
                    reservasRestCol.doc(doc.id).delete();
                }
            });



        } catch (e) {
            console.error("Error syncing with Restaurante:", e);
        }
    }

    // [NEW] Cleanup Helpers
    async function cleanupSalonesReservation(presupuestoId) {
        try {
            const snap = await db.collection("reservas_salones").where("presupuestoId", "==", presupuestoId).get();
            if (!snap.empty) {
                console.log(`Cleanup: Removing ${snap.size} obsolete Salon reservations for budget ${presupuestoId}`);
                const batch = db.batch();
                snap.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
        } catch (e) { console.error("Error cleaning up Salones:", e); }
    }

    async function cleanupRestaurantReservation(presupuestoId) {
        try {
            const snap = await db.collection("reservas_restaurante").where("presupuestoId", "==", presupuestoId).get();
            if (!snap.empty) {
                console.log(`Cleanup: Removing ${snap.size} obsolete Restaurant reservations for budget ${presupuestoId}`);
                const batch = db.batch();
                snap.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
        } catch (e) { console.error("Error cleaning up Restaurant:", e); }
    }

    async function guardarDatos() {
        if (state.isSaving) return; // Prevent double-submit
        state.isSaving = true;

        // Disable buttons
        if (btnGuardar) btnGuardar.disabled = true;
        if (btnConfirmar) btnConfirmar.disabled = true;
        if (btnAnular) btnAnular.disabled = true;

        try {
            // Validation: Past Date
            if (campoFechaDesde.value) {
                const eventDate = new Date(campoFechaDesde.value);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                eventDate.setHours(0, 0, 0, 0); // Reset time to compare only dates

                if (eventDate < today && !state.editingId) {
                    if (!confirm("⚠️ La fecha es pasada. ¿Seguro que quieres guardar?")) {
                        // Must reset state if aborting
                        throw new Error("Cancelado por el usuario (Fecha pasada)");
                    }
                }
            }

            const pAdultos = parseInt(campoPaxAdultos.value) || 0;
            const pNinos = parseInt(campoPaxNinos.value) || 0;
            const totalPax = pAdultos + pNinos;

            const payload = {
                referencia: state.editingId ? document.getElementById('labelRef').textContent : undefined,
                hotel: hotelId,
                fechaDesde: campoFechaDesde.value,
                fechaHasta: campoFechaHasta.value,
                salon: campoSalon.value,

                cliente: campoCliente.value,
                tipoEvento: campoTipoEvento.value,

                turno: campoTurno.value,
                paxAdultos: pAdultos,
                paxNinos: pNinos,
                pax: totalPax, // Main pax for list view

                montaje: campoMontaje.value,
                horaInicio: campoHoraInicio.value,
                // horaFin removed

                contacto: campoContacto.value,
                telefono: campoTelefono.value,
                email: campoEmail.value,

                estado: campoEstado.value,
                notas: campoNotas.value,
                notasCliente: campoNotasCliente ? campoNotasCliente.value : "",
                notaComercial: campoNotaComercial ? campoNotaComercial.value : "",

                lines: currentLines,
                importeTotal: state.currentTotal,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // --- VALIDATION: Check Salon Availability if Confirming ---
            // If updating existing, exclude self from conflict check
            // --- VALIDATION: Check Salon Availability if Confirming ---
            // If updating existing, exclude self from conflict check
            if (payload.estado === 'confirmada' && campoSalon.value !== 'Restaurante') {
                let excludeResId = null;
                if (state.editingId) {
                    const snapRes = await db.collection("reservas_salones")
                        .where("presupuestoId", "==", state.editingId)
                        .get();
                    if (!snapRes.empty) {
                        excludeResId = snapRes.docs[0].id;
                    }
                }

                // Ensure MesaChef is available
                if (window.MesaChef && window.MesaChef.checkSalonAvailability) {
                    const validation = await window.MesaChef.checkSalonAvailability(
                        db,
                        hotelId,
                        payload.salon,
                        payload.fechaDesde,
                        payload.turno || "todo",
                        excludeResId
                    );

                    if (!validation.available) {
                        alert(`⛔ NO SE PUEDE CONFIRMAR:\nEl salón está ocupado: ${validation.reason}`);
                        throw new Error("Cancelado: Salón ocupado"); // Stop execution
                    }
                }
            }

            let docId = state.editingId;

            if (docId) {
                // UPDATE
                await db.collection("presupuestos").doc(docId).update(payload);
                console.log("Presupuesto Actualizado:", docId);
            } else {
                // CREATE
                payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                // Generate Reference logic is handled by Cloud Function trigger usually, 
                // or we can generate it here if needed. 
                // For this app, let's assume auto-id or reference generator.

                // We need to fetch next Reference if not using Cloud Function
                // But simplifying:
                const ref = "P-" + new Date().getFullYear() + "-" + Math.floor(Math.random() * 10000);
                payload.referencia = ref;

                const docRef = await db.collection("presupuestos").add(payload);
                docId = docRef.id;
                state.editingId = docId;
                if (labelRef) labelRef.textContent = ref;
                console.log("Presupuesto Creado:", docId);
            }

            // --- SYNC WITH MODULES ---
            // Only if confirmed
            if (payload.estado === 'confirmada') {
                if (campoSalon.value === 'Restaurante') {
                    await syncWithRestaurante(docId, payload);
                    await cleanupSalonesReservation(docId); // Clean old Salon reservation if exists
                } else {
                    await syncWithSalones(docId, payload);
                    await cleanupRestaurantReservation(docId); // Clean old Rte reservation if exists
                }
            } else if (payload.estado === 'rechazada') {
                // Already handled in btnAnular, but good generic safety:
                // Cancellation sync handled separately usually
            }

            alert("✅ Presupuesto Guardado Correctamente");
            if (window.loadPresupuestos) window.loadPresupuestos(); // Reload list
            cerrarModal();

        } catch (e) {
            console.error("Error saving budget:", e);
            if (e.message.includes("Cancelado")) {
                // User cancelled, do nothing
            } else {
                alert("Error al guardar: " + e.message);
            }
        } finally {
            state.isSaving = false;
            if (btnGuardar) btnGuardar.disabled = false;
            if (btnConfirmar) btnConfirmar.disabled = false;
            if (btnAnular) btnAnular.disabled = false;
        }
    }



    // Listeners
    if (btnNuevo) btnNuevo.addEventListener("click", () => abrirModal(null));
    if (btnCerrarModal) btnCerrarModal.addEventListener("click", cerrarModal);
    if (modalPresupuesto) modalPresupuesto.addEventListener("click", (e) => {
        if (e.target === modalPresupuesto) cerrarModal();
    });

    // Click edit
    if (listContainer) {
        listContainer.addEventListener("click", (e) => {
            const btn = e.target.closest(".btn-edit");
            if (btn) {
                const row = btn.closest(".presupuesto-row");
                if (row) abrirModal(row.dataset.id);
            }
        });
    }

    // --- SEARCH & FILTERS (Inside IIFE to access state) ---
    if (txtBuscar) {
        txtBuscar.addEventListener("input", () => {
            state.filtroTexto = txtBuscar.value.toLowerCase();
            renderList();
        });
    }

    if (selFiltro) {
        selFiltro.addEventListener("change", () => {
            state.filtroEstado = selFiltro.value;
            renderList();
        });
    }

    // Phone Mask
    if (campoTelefono) {
        campoTelefono.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '').substring(0, 9);
            if (v.length > 6) v = v.slice(0, 3) + " " + v.slice(3, 6) + " " + v.slice(6);
            else if (v.length > 3) v = v.slice(0, 3) + " " + v.slice(3);
            e.target.value = v;
        });
    }


    // [NEW] Sync Pax Header -> Lines
    function syncPaxToLines(type, newVal) {
        const val = parseInt(newVal) || 0;
        let pChanged = false;

        currentLines.forEach((l) => {
            const concept = (l.concepto || "").toLowerCase();
            let shouldUpdate = false;

            if (type === 'adulto') {
                if (concept.includes("adulto") || concept.includes("adults")) shouldUpdate = true;
            } else if (type === 'nino') {
                if (concept.includes("niño") || concept.includes("nino") || concept.includes("child") || concept.includes("infantil")) shouldUpdate = true;
            }

            if (shouldUpdate) {
                l.uds = val;
                pChanged = true;
            }
        });

        if (pChanged) renderLines();
    }

    if (campoPaxAdultos) {
        campoPaxAdultos.addEventListener("input", (e) => syncPaxToLines('adulto', e.target.value));
    }
    if (campoPaxNinos) {
        campoPaxNinos.addEventListener("input", (e) => syncPaxToLines('nino', e.target.value));
    }

    // Global Search Handler (Dropdown)
    let searchDebounce = null;
    window.handleSearch = function (query) {
        clearTimeout(searchDebounce);
        const container = document.getElementById("searchResults");

        if (!query || query.trim().length < 2) {
            if (container) container.classList.add("hidden");
            return;
        }

        searchDebounce = setTimeout(() => {
            doSearch(query);
        }, 300);
    };

    function doSearch(query) {
        const q = query.toLowerCase();
        const container = document.getElementById("searchResults");
        if (!container) return;

        // Use state.presupuestos directly
        const results = state.presupuestos.filter(r => {
            const combined = `${r.cliente || ''} ${r.referencia || ''} ${r.tipoEvento || ''} ${r.estado || ''} `.toLowerCase();
            return combined.includes(q);
        });

        renderSearchResults(results);
    }

    function renderSearchResults(results) {
        const container = document.getElementById("searchResults");
        if (!container) return;

        container.classList.remove("hidden");
        container.innerHTML = "";

        if (results.length === 0) {
            container.innerHTML = '<div class="p-4 text-center text-slate-400 text-xs">No se encontraron resultados</div>';
        } else {
            let html = "";
            results.slice(0, 10).forEach(r => {
                html += `
                    <div class="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0" 
                         onclick="document.getElementById('searchResults').classList.add('hidden'); window.abrirModalPresupuesto('${r.id}')">
                        <div class="flex justify-between items-start">
                            <div>
                                <div class="font-bold text-sm text-slate-700">${r.cliente}</div>
                                <div class="text-xs text-slate-500">${r.tipoEvento || "Evento"} · ${r.referencia || "?"}</div>
                            </div>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                ${r.estado.toUpperCase()}
                            </span>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        }
    }

    // Attach helper to window if needed for the search result click (or use event bubbling)
    // We added onclick handler in HTML above calling window.abrirModal? 
    // Wait, abrirModal is local. We need to expose it or use a closure listener.
    // The HTML onclick cannot call local 'abrirModal'. 
    // Let's expose opening helper globally or handle clicks better?
    // Exposing globally is easier for the HTML string injection.
    // Listeners (Restored) - DUPLICATES REMOVED
    // Helper to expose modal opening for Search Results
    window.abrirModalPresupuesto = abrirModal;

    // Init Logic
    escucharPresupuestos();

})();
