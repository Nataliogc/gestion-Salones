/**
 * Grandes Eventos Module
 * Handles large events (e.g., New Year's Eve), participant management, and payments.
 */

(function () {

    // Firestore References
    // Use local variable to avoid collision with global 'db' from firebase-init.js
    const db = firebase.firestore();
    const eventosRef = db.collection("grandes_eventos");
    const participantesRef = db.collection("participantes_eventos");

    // Global State
    let currentEventId = null;
    let currentEvent = null;
    let currentParticipants = []; // Global store for filtering
    let parkingInventory = [];


    let salonConfig = null;


    document.addEventListener("DOMContentLoaded", async () => {
        // Load Salon Config first
        await loadSalonConfig();

        // 1. Check URL params for (Event ID) OR (New Event Context from Salones)
        const params = new URLSearchParams(window.location.search);
        currentEventId = params.get("id");
        const salonId = params.get("salonId");
        const date = params.get("date");
        const name = params.get("name");

        initUI();

        if (currentEventId) {
            showView("detail");
            await loadEvent(currentEventId);
        } else if (salonId && date) {
            // Preparing new event
            showView("detail");
            prepareNewEvent(salonId, date, name);
        } else {
            // Default: List Mode
            showView("list");
            await loadEventsList();
        }
    });

    async function loadSalonConfig() {
        try {
            const doc = await db.collection("master_data").doc("CONFIG_SALONES").get();
            if (doc.exists) {
                salonConfig = doc.data();
            } else {
                console.warn("CONFIG_SALONES not found");
                salonConfig = { Guadiana: [], Cumbria: [] };
            }
        } catch (e) {
            console.error("Error loading salon config:", e);
        }
    }

    function initUI() {
        // Populate Header
        const curHotel = MesaChef.getCurrentHotel() || "Guadiana";
        const hotelNameMap = { "Guadiana": "Sercotel Guadiana", "Cumbria": "Cumbria Spa&Hotel" };
        const hotelLogoMap = { "Guadiana": "Img/logo-guadiana.png", "Cumbria": "Img/logo-cumbria.jpg" };

        const elHotelName = document.getElementById("headerHotelName");
        if (elHotelName) elHotelName.textContent = hotelNameMap[curHotel] || curHotel;

        const elHotelLogo = document.getElementById("headerHotelLogo");
        if (elHotelLogo) elHotelLogo.src = hotelLogoMap[curHotel] || "Img/logo_mesa_chef.png";

        // Save Config Button
        document.getElementById("btnSaveEventConfig")?.addEventListener("click", saveEventConfig);

        // Add Participant Button
        document.getElementById("btnAddParticipant")?.addEventListener("click", () => openParticipantModal());

        // Modal Close
        document.getElementById("btnCloseModal")?.addEventListener("click", closeParticipantModal);

        // Form Submit
        document.getElementById("formParticipant")?.addEventListener("submit", handleParticipantSubmit);

        // Toggle Status
        document.getElementById("btnToggleStatus")?.addEventListener("click", toggleEventStatus);

        // List View Actions
        document.getElementById("btnBackToList")?.addEventListener("click", () => {
            window.location.href = "grandes-eventos.html"; // Simple reload to clear params
        });

        document.getElementById("btnNewEventParams")?.addEventListener("click", openNewEventModal);
        document.getElementById("btnCloseNewEvent")?.addEventListener("click", () => {
            document.getElementById("modalNewEvent").classList.add("hidden");
        });
        document.getElementById("btnCreateNewEvent")?.addEventListener("click", () => {
            const d = document.getElementById("newEvtDate").value;
            const s = document.getElementById("newEvtSalon").value;
            const n = document.getElementById("newEvtName").value.trim();
            if (d && s) {
                const url = `grandes-eventos.html?salonId=${encodeURIComponent(s)}&date=${encodeURIComponent(d)}&name=${encodeURIComponent(n)}`;
                window.location.href = url;
            } else {
                alert("Por favor indica fecha y salÃ³n.");
            }
        });

        // Filters
        document.getElementById("listStatusFilter")?.addEventListener("change", loadEventsList);
        document.getElementById("listDateFilter")?.addEventListener("change", loadEventsList);
        document.getElementById("listSearch")?.addEventListener("input", debounce(loadEventsList, 500));

        document.getElementById("listSearch")?.addEventListener("input", debounce(loadEventsList, 500));

        // Open Map Window
        document.getElementById("btnOpenMapWindow")?.addEventListener("click", () => {
            if (currentEventId) {
                window.open(`plano-evento.html?id=${currentEventId}`, '_blank', 'width=1200,height=800');
            }
        });

        // Callback for when map is saved
        window.onMapSaved = function () {
            if (currentEventId) {
                loadParticipants(currentEventId);
            }
        };

        // --- MODAL FINANCIAL LISTENERS ---

        // --- MODAL FINANCIAL LISTENERS ---
        ['pAdults', 'pKids', 'pCollectionDate'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', recalcModalFinancials);
        });

        document.getElementById("btnAddPayment")?.addEventListener("click", addPayment);

        // Delegation for Payments List
        document.getElementById("paymentsList")?.addEventListener("click", e => {
            if (e.target.closest(".btn-remove-pay")) {
                const idx = parseInt(e.target.closest(".btn-remove-pay").dataset.idx);
                removePayment(idx);
            }
        });

        // CANCEL PARTICIPANT
        document.getElementById("btnConfirmCancel")?.addEventListener("click", confirmCancellation);

        // FILTER
        document.getElementById("filterParticipants")?.addEventListener("change", filterParticipants);

        // PHONE MASK (Match Presupuestos Logic)
        const pPhone = document.getElementById("pPhone");
        if (pPhone) {
            pPhone.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, '').substring(0, 9);
                if (v.length > 6) v = v.slice(0, 3) + " " + v.slice(3, 6) + " " + v.slice(6);
                else if (v.length > 3) v = v.slice(0, 3) + " " + v.slice(3);
                e.target.value = v;
            });
        }

        // PRINT MENU DROPDOWN
        const btnPrintMenu = document.getElementById("btnPrintMenu");
        const printDropdown = document.getElementById("printDropdown");

        btnPrintMenu?.addEventListener("click", (e) => {
            e.stopPropagation();
            printDropdown.classList.toggle("hidden");
        });

        // Close dropdown when clicking outside
        document.addEventListener("click", (e) => {
            if (printDropdown && !printDropdown.classList.contains("hidden")) {
                if (!e.target.closest("#btnPrintMenu") && !e.target.closest("#printDropdown")) {
                    printDropdown.classList.add("hidden");
                }
            }
        });

        // Print option selection
        document.querySelectorAll(".print-option").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const printType = e.currentTarget.getAttribute("data-print-type");
                printDropdown.classList.add("hidden");
                handlePrint(printType);
            });
        });
    }

    function showView(viewName) {
        const vList = document.getElementById("view-list");
        const vDetail = document.getElementById("view-detail");
        const linkBack = document.getElementById("linkHeaderBack");

        if (viewName === "list") {
            vList.classList.remove("hidden");
            vDetail.classList.add("hidden");
            // Set Header Back to Home
            if (linkBack) {
                linkBack.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Volver al Inicio`;
                linkBack.href = "index.html";
            }
        } else {
            vList.classList.add("hidden");
            vDetail.classList.remove("hidden");
            // Set Header Back to List
            if (linkBack) {
                linkBack.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Volver a Lista`;
                linkBack.href = "grandes-eventos.html";
            }
        }
    }

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    async function loadEventsList() {
        const tbody = document.getElementById("eventsListBody");
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Cargando...</td></tr>';

        try {
            let query = eventosRef; // Base Query

            // Apply Status Filter? (If Firestore index exists, else filter in client)
            // For simplicity with small data, let's fetch all and filter in JS or simple constraints
            // Order by Date Desc
            query = query.orderBy("fecha", "desc");

            const snapshot = await query.get();
            let events = [];
            snapshot.forEach(doc => events.push({ id: doc.id, ...doc.data() }));

            // Client-side Filtering
            const statusFilter = document.getElementById("listStatusFilter").value;
            const dateFilter = document.getElementById("listDateFilter").value;
            const searchVal = document.getElementById("listSearch").value.toLowerCase();

            // Hotel Filter
            const curHotel = MesaChef.getCurrentHotel() || "Guadiana";
            const hotelSalons = (salonConfig && salonConfig[curHotel]) ? salonConfig[curHotel].map(s => s.name) : [];

            // Filter
            events = events.filter(e => {
                // Filter by Hotel
                if (hotelSalons.length > 0) {
                    if (!hotelSalons.includes(e.salonId)) return false;
                }
                if (statusFilter !== "todos" && (e.estado || 'abierto') !== statusFilter) return false;
                if (dateFilter && e.fecha !== dateFilter) return false;
                if (searchVal) {
                    const n = (e.nombre || "").toLowerCase();
                    if (!n.includes(searchVal)) return false;
                }
                return true;
            });

            renderEventsTable(events);

        } catch (e) {
            console.error("Error loading list:", e);
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Error al cargar eventos</td></tr>';
        }
    }

    function renderEventsTable(events) {
        const tbody = document.getElementById("eventsListBody");
        tbody.innerHTML = "";

        if (events.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">No se encontraron eventos.</td></tr>`;
            return;
        }

        events.forEach(e => {
            const tr = document.createElement("tr");

            // Format Date
            const d = new Date(e.fecha);
            const dateStr = d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });

            // Status Badge
            const isOpen = e.estado !== 'completo';
            const statusBadge = isOpen
                ? `<span class="status-badge status-open">Abierto</span>`
                : `<span class="status-badge status-closed">Completo</span>`;

            tr.innerHTML = `
            <td><span style="font-family:monospace; font-weight:600; color:#64748b;">${e.referencia || '-'}</span></td>
            <td><span style="font-weight:600; font-variant-numeric: tabular-nums;">${dateStr}</span></td>
            <td><div style="font-weight:600; color:#0f172a;">${e.nombre}</div></td>
                <td>${e.salonId}</td>
                <td>${e.aforoMax || 0}</td>
                <td>PENDING</td> <!-- Need to fetch/calc pax? for now placeholder or 0 -->
                <td>${statusBadge}</td>
                <td>
                    <a href="?id=${e.id}" class="btn-action">Gestionar</a>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function openNewEventModal() {
        document.getElementById("modalNewEvent").classList.remove("hidden");

        // 1. Set Date to Today
        document.getElementById("newEvtDate").value = new Date().toISOString().split('T')[0];

        // 2. Populate Salons based on Hotel
        const select = document.getElementById("newEvtSalon");
        select.innerHTML = '<option value="">-- Selecciona SalÃ³n --</option>';

        const currentHotel = MesaChef.getCurrentHotel() || "Guadiana";
        if (salonConfig && salonConfig[currentHotel]) {
            salonConfig[currentHotel].forEach(s => {
                const opt = document.createElement("option");
                opt.value = s.name;
                opt.textContent = s.name;
                select.appendChild(opt);
            });
        }
    }

    async function loadEvent(id) {
        try {
            const doc = await eventosRef.doc(id).get();
            if (!doc.exists) {
                alert("El evento no existe.");
                return;
            }
            currentEvent = { id: doc.id, ...doc.data() };
            renderEventHeader(currentEvent);
            loadParticipants(id); // Load participants sub-list

        } catch (error) {
            console.error("Error loading event:", error);
            alert("Error al cargar el evento.");
        }
    }

    function prepareNewEvent(salonId, date, name) {
        console.log("Preparing new event for", salonId, date);
        document.getElementById("inputSalon").value = salonId || "";
        document.getElementById("inputDate").value = date || "";
        // Default Name
        document.getElementById("inputName").value = name || `Evento en ${salonId || 'SalÃ³n'}`;
        document.getElementById("eventStatusBadge").className = "status-badge status-open";
        document.getElementById("eventStatusBadge").textContent = "Nuevo (Sin Guardar)";
    }

    function renderEventHeader(evt) {
        document.getElementById("inputName").value = evt.nombre || "";
        document.getElementById("inputRef").value = evt.referencia || "";
        document.getElementById("inputDate").value = evt.fecha || "";
        document.getElementById("inputSalon").value = evt.salonId || "";
        document.getElementById("inputCapacity").value = evt.aforoMax || 0;

        document.getElementById("inputPriceAdult").value = evt.precioAdulto || 0;
        document.getElementById("inputPriceChild").value = evt.precioNino || 0;

        updateStatusBadge(evt.estado);
    }

    function updateStatusBadge(status) {
        const badge = document.getElementById("eventStatusBadge");
        if (status === 'completo') {
            badge.className = "status-badge status-closed";
            badge.textContent = "Completo";
            document.getElementById("btnToggleStatus").textContent = "Reabrir Evento";
        } else {
            badge.className = "status-badge status-open";
            badge.textContent = "Abierto";
            document.getElementById("btnToggleStatus").textContent = "Marcar Completo";
        }
    }

    async function toggleEventStatus() {
        if (!currentEventId) return;
        const newStatus = (currentEvent.estado === 'completo') ? 'abierto' : 'completo';
        try {
            await eventosRef.doc(currentEventId).update({ estado: newStatus });
            currentEvent.estado = newStatus;
            updateStatusBadge(newStatus);
        } catch (e) {
            console.error("Error toggling status", e);
            alert("Error al cambiar estado");
        }
    }

    async function generarReferenciaEvento() {
        const year = new Date().getFullYear();
        const currentHotel = (window.MesaChef && window.MesaChef.getCurrentHotel()) || "Guadiana";
        const prefix = `${currentHotel.charAt(0)}E${year}-`; // e.g. GE2025-
        const counterRef = db.collection("counters").doc(`grandes_eventos_${currentHotel}_${year}`);

        try {
            return await db.runTransaction(async (t) => {
                const doc = await t.get(counterRef);
                let seq = 0;
                if (doc.exists) {
                    seq = doc.data().seq || 0;
                }
                seq++;
                t.set(counterRef, { seq }, { merge: true });

                // Convert seq to letters (1->A, 2->B... 27->AA)
                let letters = '';
                let n = seq;
                while (n > 0) {
                    let r = (n - 1) % 26;
                    letters = String.fromCharCode(65 + r) + letters;
                    n = Math.floor((n - 1) / 26);
                }

                return `${prefix}${letters}`; // GE2025-A
            });
        } catch (e) {
            console.error("Error creating ref:", e);
            return `REF-${Date.now().toString().slice(-6)}`;
        }
    }

    async function saveEventConfig() {
        const nombre = document.getElementById("inputName").value.trim();
        let referencia = document.getElementById("inputRef").value.trim();
        const fecha = document.getElementById("inputDate").value;
        const salonId = document.getElementById("inputSalon").value;
        const aforoMax = parseInt(document.getElementById("inputCapacity").value) || 0;
        const precioAdulto = parseFloat(document.getElementById("inputPriceAdult").value) || 0;
        const precioNino = parseFloat(document.getElementById("inputPriceChild").value) || 0;

        if (!nombre || !fecha || !salonId) {
            alert("Por favor rellena Nombre, Fecha y SalÃ³n.");
            return;
        }

        // Auto-generate ref if missing
        if (!referencia) {
            try {
                referencia = await generarReferenciaEvento();
                document.getElementById("inputRef").value = referencia; // Show it
            } catch (e) {
                console.error(e);
            }
        }

        const payload = {
            nombre,
            referencia,
            fecha,
            salonId,
            aforoMax,
            precioAdulto,
            precioNino,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            if (!currentEventId) {
                // Create New
                payload.estado = "abierto";
                payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();

                const docRef = await eventosRef.add(payload);
                currentEventId = docRef.id;
                currentEvent = { id: currentEventId, ...payload };

                alert("Evento creado correctamente.");
                // Update URL so reload doesn't lose it
                const newUrl = `${window.location.pathname}?id=${currentEventId}`;
                window.history.pushState({ path: newUrl }, '', newUrl);
                updateStatusBadge("abierto");

                // TODO: Ensure Salon is Blocked in 'reservas_salones' if not already
                // This might best be done by checking/creating a block now.
                blockSalonForEvent(salonId, fecha, nombre);

            } else {
                // Update
                const oldRef = currentEvent.referencia;
                await eventosRef.doc(currentEventId).update(payload);
                currentEvent = { ...currentEvent, ...payload };

                // Check propagation
                if (referencia && oldRef !== referencia) {
                    await propagateRefChanges(currentEventId, referencia);
                }

                alert("ConfiguraciÃ³n guardada.");
            }
        } catch (error) {
            console.error("Error saving event:", error);
            alert("Error al guardar: " + error.message);
        }
    }

    // Helper to block salon (placeholder for now)
    async function blockSalonForEvent(salon, date, eventName) {
        console.log("Blocking salon:", salon, "on", date);
    }

    // --- PARTICIPANTS LOGIC ---

    async function loadParticipants(evtId) {
        try {
            const snapshot = await participantesRef.where("eventoId", "==", evtId).get();
            currentParticipants = [];
            snapshot.forEach(doc => {
                currentParticipants.push({ id: doc.id, ...doc.data() });
            });

            filterParticipants(); // Apply default filter
            updateDashboardStats();

        } catch (error) {
            console.error("Error loading participants:", error);
        }
    }

    function filterParticipants() {
        const filter = document.getElementById("filterParticipants")?.value || "activo";
        let filtered = [];
        if (filter === "todos") {
            filtered = currentParticipants;
        } else if (filter === "anulado") {
            filtered = currentParticipants.filter(p => p.estado && p.estado.startsWith("anulado"));
        } else {
            // activo
            filtered = currentParticipants.filter(p => !p.estado || p.estado === "activo");
        }
        renderParticipantsTable(filtered);
    }

    function renderParticipantsTable(participants) {
        const tbody = document.getElementById("participantsTableBody");
        tbody.innerHTML = "";

        if (participants.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#94a3b8;">No hay participantes registrados.</td></tr>`;
            return;
        }

        participants.forEach(p => {
            const tr = document.createElement("tr");
            const total = p.total || 0;
            const paid = p.pagado || 0;
            const pending = total - paid;

            const isAnulado = p.estado && p.estado.startsWith("anulado");
            if (isAnulado) {
                tr.style.backgroundColor = "#fff1f2";
            }

            // Status color for pending
            const pendingStyle = pending > 0.01 ? 'color:#c2410c; font-weight:bold;' : 'color:#166534;';

            let titularHtml = `<div style="font-weight:600; color:#0f172a;">${p.titular}</div>`;
            if (isAnulado) {
                if (p.motivoAnulacion) {
                    titularHtml += `<div style="font-size:11px; color:#b91c1c; margin-top:4px; font-style:italic;">"${p.motivoAnulacion}"</div>`;
                }
                titularHtml += `<span style="font-size:10px; background:#fee2e2; color:#ef4444; padding:2px 6px; border-radius:4px; margin-top:4px; display:inline-block;">ANULADO</span>`;
            }

            tr.innerHTML = `
                <td style="text-align:center; font-weight:600; color:#0f172a; font-size:16px;">${p.mesa || '-'}</td>
                <td>
                    ${titularHtml}
                    <div style="font-size:11px; color:#64748b; margin-top:2px; font-family:monospace;">${p.referencia || '-'}</div>
                </td>
                <td>
                    <div style="font-size:13px;">${p.telefono || '-'}</div>
                    <div style="font-size:12px; color:#64748b;">${p.email || ''}</div>
                </td>
                <td>
                    <span style="font-weight:600;">${p.adultos}</span> Ad / 
                    <span style="font-weight:600;">${p.ninos}</span> Ni
                </td>
                <td>${window.MesaChef.formatEuroValue(total)} €</td>
                <td>${window.MesaChef.formatEuroValue(paid)} €</td>
                <td style="${pendingStyle}">${window.MesaChef.formatEuroValue(pending)} €</td>
                <td>
                    <button class="btn-action edit-btn" data-id="${p.id}">Editar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Attach Edit Listeners
        tbody.querySelectorAll(".edit-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const pId = e.target.getAttribute("data-id");
                const p = participants.find(x => x.id === pId);
                if (p) openParticipantModal(p);
            });
        });
    }

    function updateDashboardStats() {
        const active = currentParticipants.filter(p => !p.estado || p.estado === 'activo');
        const cancelled = currentParticipants.filter(p => p.estado && p.estado.startsWith('anulado'));

        // Active Stats
        let totalAd = 0;
        let totalNi = 0;
        let totalPaidActive = 0;
        let totalPending = 0;

        active.forEach(p => {
            totalAd += (p.adultos || 0);
            totalNi += (p.ninos || 0);
            totalPaidActive += (p.pagado || 0);
            totalPending += ((p.total || 0) - (p.pagado || 0));
        });

        // Cancelled Stats
        const totalRetained = cancelled.reduce((acc, p) => acc + (p.pagado || 0), 0);

        const totalPax = totalAd + totalNi;

        document.getElementById("statTotalPax").innerHTML = `${totalPax} <span style="font-size:14px; font-weight:400; color:#64748b;">(${totalAd} Ad / ${totalNi} Ni)</span>`;

        const capacity = parseInt(document.getElementById("inputCapacity").value) || 0;
        document.getElementById("lblCapacity").textContent = capacity;

        const available = capacity - totalPax;
        const elAvailable = document.getElementById("lblAvailableSeats");
        if (elAvailable) {
            elAvailable.textContent = available;
            if (available < 0) elAvailable.style.color = "#ef4444"; // Red if negative
            else elAvailable.style.color = "#0f172a";
        }

        const occupancy = capacity > 0 ? ((totalPax / capacity) * 100).toFixed(0) : 0;
        document.getElementById("statOccupancy").textContent = `${occupancy}%`;

        // Visual Alert
        const cardOcc = document.getElementById("statCardOccupancy");
        if (cardOcc) {
            if (occupancy > 100) {
                cardOcc.classList.remove("bg-white", "border-slate-200");
                cardOcc.classList.add("bg-red-50", "border-red-200");
                // Text color update for emphasis
                document.getElementById("statOccupancy").classList.add("text-red-700");
                document.getElementById("statOccupancy").classList.remove("text-slate-800");
            } else {
                cardOcc.classList.add("bg-white", "border-slate-200");
                cardOcc.classList.remove("bg-red-50", "border-red-200");
                document.getElementById("statOccupancy").classList.add("text-slate-800");
                document.getElementById("statOccupancy").classList.remove("text-red-700");
            }
        }

        document.getElementById("statCollected").textContent = `${window.MesaChef.formatEuroValue(totalPaidActive)} €`;
        document.getElementById("statPending").textContent = `${window.MesaChef.formatEuroValue(totalPending)} €`;

        // New Cancelled Stat
        const elCancelled = document.getElementById("statCancelledAmount");
        if (elCancelled) elCancelled.textContent = `${window.MesaChef.formatEuroValue(totalRetained)} €`;
    }

    // --- PAYMENTS LOGIC ---
    let modalPagos = [];

    function addPayment() {
        const dateInput = document.getElementById("newPayDate");
        const amtInput = document.getElementById("newPayAmount");

        const dateVal = dateInput.value;
        const amtVal = parseFloat(amtInput.value);

        if (!dateVal || isNaN(amtVal) || amtVal <= 0) {
            alert("Introduce fecha e importe vÃ¡lido.");
            return;
        }

        modalPagos.push({
            date: dateVal,
            amount: amtVal
        });

        // Clear inputs
        changeDate(dateInput, new Date().toISOString().split('T')[0]);
        amtInput.value = "";

        renderPaymentsList();
        recalcModalFinancials();
    }

    function changeDate(input, val) { input.value = val; }

    function removePayment(index) {
        if (confirm("Â¿Eliminar este pago?")) {
            modalPagos.splice(index, 1);
            renderPaymentsList();
            recalcModalFinancials();
        }
    }

    function renderPaymentsList() {
        const container = document.getElementById("paymentsList");
        if (!container) return;
        container.innerHTML = "";

        // Header
        const header = document.createElement("div");
        header.style.cssText = "display:grid; grid-template-columns: 1fr 1fr 40px; border-bottom:1px solid #e2e8f0; padding-bottom:4px; margin-bottom:8px; font-size:11px; color:#64748b; font-weight:600;";
        header.innerHTML = `<div>FECHA</div><div style="text-align:right">IMPORTE</div><div></div>`;
        container.appendChild(header);

        // Sort by date
        modalPagos.sort((a, b) => new Date(a.date) - new Date(b.date));

        modalPagos.forEach((p, idx) => {
            const row = document.createElement("div");
            row.style.cssText = "display:grid; grid-template-columns: 1fr 1fr 40px; align-items:center; padding:6px 0; border-bottom:1px solid #f1f5f9; font-size:13px; color:#334155;";

            row.innerHTML = `
             <div>${formatDateES(p.date)}</div>
             <div style="text-align:right; font-weight:600; color:#1e293b;">${window.MesaChef.formatEuroValue(parseFloat(p.amount))}€</div>
             <div style="text-align:right;">
                <button type="button" class="btn-remove-pay" data-idx="${idx}" style="color:#ef4444; background:none; border:none; cursor:pointer; font-weight:bold; padding:0 4px;" title="Eliminar">âœ•</button>
             </div>
           `;
            container.appendChild(row);
        });

        // PENDING ROW (Dynamic Visualization with Inline Date)
        const totalPaid = modalPagos.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
        const priceAd = parseFloat(document.getElementById("inputPriceAdult").value) || 0;
        const priceNi = parseFloat(document.getElementById("inputPriceChild").value) || 0;
        const adults = parseInt(document.getElementById("pAdults").value) || 0;
        const kids = parseInt(document.getElementById("pKids").value) || 0;
        const total = (adults * priceAd) + (kids * priceNi);
        const pending = total - totalPaid;

        if (pending > 0.01) {
            const pendingDate = document.getElementById("pCollectionDate").value || "";
            const row = document.createElement("div");
            row.style.cssText = "display:grid; grid-template-columns: 1fr 1fr 40px; align-items:center; padding:8px 0; font-size:13px; background-color:#fff7ed; padding:8px; border-radius:4px; margin-top:4px;";

            row.innerHTML = `
               <div style="color:#c2410c; font-weight:600;">PENDIENTE</div>
               <div style="text-align:right; font-weight:bold; color:#c2410c;">${window.MesaChef.formatEuroValue(pending)}€</div>
               <div></div>
             `;
            container.appendChild(row);
        }
    }

    function formatDateES(IsoDate) {
        if (!IsoDate) return "";
        const [y, m, d] = IsoDate.split("-");
        return `${d}/${m}/${y}`;
    }

    function recalcModalFinancials() {
        const adults = parseInt(document.getElementById("pAdults").value) || 0;
        const kids = parseInt(document.getElementById("pKids").value) || 0;

        // --- CAPACITY CHECK ---
        const pId = document.getElementById("pId").value;
        const currentPaxInModal = adults + kids;
        let othersPax = 0;
        if (typeof currentParticipants !== 'undefined' && currentParticipants) {
            currentParticipants.forEach(p => {
                if ((!p.estado || p.estado === 'activo') && p.id !== pId) {
                    othersPax += (p.adultos || 0) + (p.ninos || 0);
                }
            });
        }
        const totalPotential = othersPax + currentPaxInModal;
        const capacity = parseInt(document.getElementById("inputCapacity").value) || 0;
        const warnEl = document.getElementById("pWarningCapacity");

        if (warnEl) {
            if (capacity > 0 && totalPotential > capacity) {
                warnEl.classList.remove("hidden");
                warnEl.style.display = "flex";
            } else {
                warnEl.classList.add("hidden");
                warnEl.style.display = "none";
            }
        }

        // Sum Payments
        const paid = modalPagos.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);

        const priceAd = parseFloat(document.getElementById("inputPriceAdult").value) || 0;
        const priceNi = parseFloat(document.getElementById("inputPriceChild").value) || 0;

        const total = (adults * priceAd) + (kids * priceNi);
        const pending = total - paid;

        document.getElementById("pTotalCalc").value = window.MesaChef.formatEuroValue(total);

        const elPaidSummary = document.getElementById("pPaidSummary");
        if (elPaidSummary) elPaidSummary.value = window.MesaChef.formatEuroValue(paid);

        document.getElementById("pPendingCalc").value = window.MesaChef.formatEuroValue(pending);

        // Sync List
        renderPaymentsList();
    }

    function openParticipantModal(participant = null) {
        const modal = document.getElementById("modalParticipant");
        modal.classList.remove("hidden");
        document.getElementById("divCancelForm")?.classList.add("hidden");
        const btnCancel = document.getElementById("btnShowCancel");

        const today = new Date().toISOString().split('T')[0];
        document.getElementById("newPayDate").value = today;

        if (!participant) {
            // Create Mode
            document.getElementById("pId").value = "";
            document.getElementById("pName").value = "";
            document.getElementById("pPhone").value = "";
            document.getElementById("pEmail").value = "";
            document.getElementById("pAdults").value = 1;
            document.getElementById("pKids").value = 0;

            modalPagos = [];

            document.getElementById("pCollectionDate").value = "";
            if (btnCancel) btnCancel.style.display = "none";
        } else {
            // Edit Mode
            document.getElementById("pId").value = participant.id;
            document.getElementById("pName").value = participant.titular;
            document.getElementById("pPhone").value = participant.telefono;
            document.getElementById("pEmail").value = participant.email;
            document.getElementById("pAdults").value = participant.adultos;
            document.getElementById("pKids").value = participant.ninos;

            // PAYMENTS LOAD
            if (participant.pagos && Array.isArray(participant.pagos)) {
                modalPagos = [...participant.pagos]; // copy
            } else if (participant.pagado > 0) {
                // Migration
                modalPagos = [{
                    date: participant.fechaCobro || today,
                    amount: participant.pagado
                }];
            } else {
                modalPagos = [];
            }

            document.getElementById("pCollectionDate").value = participant.fechaCobro || "";

            if (btnCancel) {
                btnCancel.style.display = "block";

                const isAnulado = participant.estado && participant.estado.startsWith("anulado");
                if (isAnulado) {
                    btnCancel.textContent = "Recuperar Reserva";
                    btnCancel.style.color = "#15803d"; // Green 700
                    btnCancel.style.borderColor = "#bbf7d0";
                    btnCancel.onclick = recoverParticipant;
                } else {
                    btnCancel.textContent = "Anular Participación";
                    btnCancel.style.color = "#ef4444";
                    btnCancel.style.borderColor = "#fee2e2";
                    btnCancel.onclick = window.toggleCancelForm;
                }
            }
        }
        recalcModalFinancials();
    }

    function closeParticipantModal() {
        document.getElementById("modalParticipant").classList.add("hidden");
    }

    // Exposed to Window for onclick access
    window.toggleCancelForm = function () {
        const form = document.getElementById("divCancelForm");
        form.classList.toggle("hidden");
        // Reset inputs if showing
        if (!form.classList.contains("hidden")) {
            document.getElementById("txtCancelReason").value = "";
            document.getElementById("selCancelAction").value = "refund";

            // Conditional Logic for Payments
            const containerPayAction = document.getElementById("divCancelPaymentAction");
            const totalPaid = modalPagos.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);

            if (containerPayAction) {
                if (totalPaid > 0) {
                    containerPayAction.style.display = "block";
                } else {
                    containerPayAction.style.display = "none";
                }
            }
        }
    };

    async function recoverParticipant() {
        const pId = document.getElementById("pId").value;
        if (!pId) return;

        if (!confirm("¿Recuperar esta participación? Volverá a estado ACTIVO.")) return;

        try {
            await participantesRef.doc(pId).update({
                estado: 'activo',
                motivoAnulacion: firebase.firestore.FieldValue.delete(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert("Recuperado correctamente.");
            closeParticipantModal();
            loadParticipants(currentEventId);
        } catch (e) {
            console.error(e);
            alert("Error al recuperar.");
        }
    }

    async function propagateRefChanges(evtId, newRef) {
        if (!currentParticipants || currentParticipants.length === 0) return;

        try {
            // Sort by creation to ensure stable ordering if assigning new sequences
            const sorted = [...currentParticipants].sort((a, b) => {
                const ta = a.createdAt ? a.createdAt.seconds : 0;
                const tb = b.createdAt ? b.createdAt.seconds : 0;
                return ta - tb;
            });

            const batch = db.batch();
            let maxSeq = 0;
            // Find existing max sequence
            sorted.forEach(p => { if ((p.secuencia || 0) > maxSeq) maxSeq = p.secuencia; });

            let updatesCount = 0;

            sorted.forEach(p => {
                let seq = p.secuencia;
                let needsUpdate = false;

                // Assign Sequence if missing
                if (!seq) {
                    maxSeq++;
                    seq = maxSeq;
                    needsUpdate = true;
                }

                // Construct Expected Ref
                const expectedRef = `${newRef}-${String(seq).padStart(3, '0')}`;

                if (p.referencia !== expectedRef) {
                    needsUpdate = true;
                }

                if (needsUpdate) {
                    const ref = participantesRef.doc(p.id);
                    batch.update(ref, {
                        referencia: expectedRef,
                        secuencia: seq
                    });
                    updatesCount++;
                }
            });

            if (updatesCount > 0) {
                await batch.commit();
                console.log(`Propagated reference to ${updatesCount} participants.`);
                loadParticipants(evtId);
            }
        } catch (e) {
            console.error("Error propagating ref:", e);
        }
    }

    async function confirmCancellation() {
        const pId = document.getElementById("pId").value;
        const reason = document.getElementById("txtCancelReason").value.trim();
        const action = document.getElementById("selCancelAction").value;

        if (!pId) return;
        if (!reason) {
            alert("Es necesario indicar un motivo de anulación.");
            return;
        }

        if (!confirm("¿Estás seguro de ANULAR esta participación? Esta acción es irreversible.")) return;

        let finalStatus = "anulado";
        let finalPagos = [...modalPagos];

        // If refund, clear payments or mark as refund? 
        if (action === "refund") {
            finalPagos = [];
            finalStatus = "anulado_devuelto";
        } else {
            finalStatus = "anulado_gastos";
        }

        try {
            const newTotalPaid = finalPagos.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);

            await participantesRef.doc(pId).update({
                estado: finalStatus,
                motivoAnulacion: reason,
                pagos: finalPagos,
                pagado: newTotalPaid,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            alert("Participación anulada correctamente.");
            closeParticipantModal();
            loadParticipants(currentEventId);
        } catch (e) {
            console.error("Error cancelling:", e);
            alert("Error al anular: " + e.message);
        }
    }

    async function handleParticipantSubmit(e) {
        e.preventDefault();
        if (!currentEventId) {
            alert("Guarda la configuración del evento antes.");
            return;
        }

        const pId = document.getElementById("pId").value;
        const titular = document.getElementById("pName").value.trim();
        const telefono = document.getElementById("pPhone").value.trim();
        const email = document.getElementById("pEmail").value.trim();
        const adultos = parseInt(document.getElementById("pAdults").value) || 0;
        const ninos = parseInt(document.getElementById("pKids").value) || 0;

        // Payment Logic
        const totalPaid = modalPagos.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
        const fechaCobro = document.getElementById("pCollectionDate").value;

        // Calculate Total
        const priceAd = parseFloat(document.getElementById("inputPriceAdult").value) || 0;
        const priceNi = parseFloat(document.getElementById("inputPriceChild").value) || 0;
        const total = (adultos * priceAd) + (ninos * priceNi);

        const payload = {
            eventoId: currentEventId,
            titular,
            telefono,
            email,
            adultos,
            ninos,
            total,
            pagado: totalPaid,
            pagos: modalPagos,
            fechaCobro,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            if (!pId) {
                // Generate Reference
                const evtRef = document.getElementById("inputRef").value.trim() || "REF";
                const maxSeq = currentParticipants.reduce((max, p) => Math.max(max, (p.secuencia || 0)), 0);
                const newSeq = maxSeq + 1;
                const refString = `${evtRef}-${String(newSeq).padStart(3, '0')}`;

                payload.secuencia = newSeq;
                payload.referencia = refString;

                payload.estado = 'activo';
                payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await participantesRef.add(payload);
            } else {
                await participantesRef.doc(pId).update(payload);
            }
            closeParticipantModal();
            loadParticipants(currentEventId);
        } catch (error) {
            console.error(error);
            alert("Error al guardar.");
        }
    }


    // === PRINT FUNCTIONS ===

    function handlePrint(printType) {
        if (!currentEvent || !currentEventId) {
            alert("No hay evento cargado");
            return;
        }

        const active = currentParticipants.filter(p => !p.estado || p.estado === 'activo');

        switch (printType) {
            case 'participants':
                printParticipantsList(active);
                break;
            case 'tables':
                printTableAssignments(active);
                break;
            case 'financial':
                printFinancialSummary(active);
                break;
            case 'complete':
                printCompleteReport(active);
                break;
        }
    }

    function getHotelLogo() {
        const curHotel = window.MesaChef?.getCurrentHotel() || "Guadiana";
        const logoMap = {
            "Guadiana": "Img/logo-guadiana.png",
            "Cumbria": "Img/logo-cumbria.jpg"
        };
        const nameMap = {
            "Guadiana": "Sercotel Guadiana",
            "Cumbria": "Cumbria Spa&Hotel"
        };
        return {
            url: logoMap[curHotel] || "Img/logo_mesa_chef.png",
            name: nameMap[curHotel] || curHotel
        };
    }

    function printParticipantsList(participants) {
        const hotel = getHotelLogo();
        const totalPax = participants.reduce((sum, p) => sum + (p.adultos || 0) + (p.ninos || 0), 0);
        const html = `
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Lista de Reservas - ${currentEvent.nombre}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
                    h1 { font-size: 18px; margin-bottom: 5px; }
                    h2 { font-size: 14px; color: #666; margin-bottom: 15px; font-weight: normal; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { background: #f0f0f0; padding: 10px 12px; text-align: left; font-weight: bold; border-bottom: 2px solid #333; font-size: 11px; }
                    td { padding: 8px 12px; border-bottom: 1px solid #ddd; vertical-align: middle; }
                    .header { display: flex; justify-content: space-between; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #333; }
                    .ref { font-family: monospace; font-size: 14px; color: #666; }
                    @media print { body { padding: 10px; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <img src="${hotel.url}" alt="Logo" style="height: 50px; object-fit: contain;" onerror="this.style.display='none'">
                        <div>
                            <h1>${currentEvent.nombre}</h1>
                            <h2>${formatDateES(currentEvent.fecha)} | ${currentEvent.salonId}</h2>
                        </div>
                    </div>
                    <div class="ref">Ref: ${currentEvent.referencia || '-'}</div>
                </div>
                <h3 style="margin-bottom: 10px;">LISTA DE RESERVAS (${totalPax} PAX)</h3>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 60px;">Mesa</th>
                            <th>Titular</th>
                            <th>Contacto</th>
                            <th style="width: 60px; text-align: center;">Pax</th>
                            <th style="width: 70px; text-align: right;">Total</th>
                            <th style="width: 70px; text-align: right;">Pagado</th>
                            <th style="width: 70px; text-align: right;">Pendiente</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${participants.map(p => {
            const total = p.total || 0;
            const paid = p.pagado || 0;
            const pending = total - paid;
            const pax = (p.adultos || 0) + (p.ninos || 0);
            return `
                                <tr>
                                    <td style="text-align: center; font-weight: bold;">${p.mesa || '-'}</td>
                                    <td><strong>${p.titular}</strong><br><span style="font-size: 10px; color: #666;">${p.referencia || ''}</span></td>
                                    <td><span style="font-size: 11px;">${p.telefono || '-'}</span></td>
                                    <td style="text-align: center;">${pax}</td>
                                    <td style="text-align: right; white-space: nowrap;">${window.MesaChef.formatEuroValue(total)} €</td>
                                    <td style="text-align: right; color: #166534; white-space: nowrap;">${window.MesaChef.formatEuroValue(paid)} €</td>
                                    <td style="text-align: right; white-space: nowrap; ${pending > 0 ? 'color: #c2410c; font-weight: bold;' : ''}">${window.MesaChef.formatEuroValue(pending)} €</td>
                                </tr>
                            `;
        }).join('')}
                    </tbody>
                </table>
                <script>window.print();</script>
            </body>
            </html>
        `;
        openPrintWindow(html);
    }

    function printTableAssignments(participants) {
        const hotel = getHotelLogo();
        const byTable = {};
        participants.forEach(p => {
            const mesa = p.mesa || 'Sin asignar';
            if (!byTable[mesa]) byTable[mesa] = [];
            byTable[mesa].push(p);
        });

        const tables = Object.keys(byTable).sort((a, b) => {
            if (a === 'Sin asignar') return 1;
            if (b === 'Sin asignar') return -1;
            return parseInt(a) - parseInt(b);
        });

        const html = `
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Asignaci&oacute;n de Mesas - ${currentEvent.nombre}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
                    h1 { font-size: 18px; margin-bottom: 5px; }
                    h2 { font-size: 14px; color: #666; margin-bottom: 15px; font-weight: normal; }
                    .header { display: flex; justify-content: space-between; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #333; }
                    .ref { font-family: monospace; font-size: 14px; color: #666; }
                    .table-group { margin-bottom: 20px; page-break-inside: avoid; }
                    .table-header { background: #333; color: white; padding: 8px 12px; font-weight: bold; font-size: 14px; margin-bottom: 5px; }
                    .participant { padding: 6px 12px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; }
                    .name { font-weight: bold; }
                    .ref-small { font-size: 10px; color: #666; font-family: monospace; }
                    .pax { color: #666; font-size: 11px; }
                    @media print { body { padding: 10px; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <img src="${hotel.url}" alt="Logo" style="height: 50px; object-fit: contain;" onerror="this.style.display='none'">
                        <div>
                            <h1>${currentEvent.nombre}</h1>
                            <h2>${formatDateES(currentEvent.fecha)} | ${currentEvent.salonId}</h2>
                        </div>
                    </div>
                    <div class="ref">Ref: ${currentEvent.referencia || '-'}</div>
                </div>
                <h3 style="margin-bottom: 15px;">ASIGNACI&Oacute;N DE MESAS</h3>
                ${tables.map(mesa => {
            const mesaPax = byTable[mesa].reduce((sum, p) => sum + (p.adultos || 0) + (p.ninos || 0), 0);
            return `
                    <div class="table-group">
                        <div class="table-header">MESA ${mesa} (${mesaPax} PAX)</div>
                        ${byTable[mesa].map(p => {
                const pax = (p.adultos || 0) + (p.ninos || 0);
                return `
                                <div class="participant">
                                    <div>
                                        <span class="name">${p.titular}</span><br>
                                        <span class="ref-small">${p.referencia || ''}</span>
                                    </div>
                                    <span class="pax">${pax} PAX (${p.adultos || 0}Ad / ${p.ninos || 0}Ni)</span>
                                </div>
                            `;
            }).join('')}
                    </div>
                `;
        }).join('')}
                <script>window.print();</script>
            </body>
            </html>
        `;
        openPrintWindow(html);
    }

    function printFinancialSummary(participants) {
        const hotel = getHotelLogo();
        const totalPax = participants.reduce((sum, p) => sum + (p.adultos || 0) + (p.ninos || 0), 0);
        const totalAmount = participants.reduce((sum, p) => sum + (p.total || 0), 0);
        const totalPaid = participants.reduce((sum, p) => sum + (p.pagado || 0), 0);
        const totalPending = totalAmount - totalPaid;

        const html = `
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Resumen Financiero - ${currentEvent.nombre}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
                    h1 { font-size: 18px; margin-bottom: 5px; }
                    h2 { font-size: 14px; color: #666; margin-bottom: 15px; font-weight: normal; }
                    .header { display: flex; justify-content: space-between; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #333; }
                    .ref { font-family: monospace; font-size: 14px; color: #666; }
                    .summary-box { background: #f9f9f9; border: 1px solid #ddd; padding: 15px; margin-bottom: 20px; }
                    .summary-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ddd; }
                    .summary-row:last-child { border-bottom: none; }
                    .summary-row.total { font-weight: bold; font-size: 14px; background: #e9ecef; margin: 10px -15px 0; padding: 12px 15px; }
                    .label { font-weight: 600; }
                    .value { text-align: right; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { background: #f0f0f0; padding: 10px 12px; text-align: left; font-weight: bold; border-bottom: 2px solid #333; font-size: 11px; }
                    td { padding: 8px 12px; border-bottom: 1px solid #ddd; }
                    @media print { body { padding: 10px; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <img src="${hotel.url}" alt="Logo" style="height: 50px; object-fit: contain;" onerror="this.style.display='none'">
                        <div>
                            <h1>${currentEvent.nombre}</h1>
                            <h2>${formatDateES(currentEvent.fecha)} | ${currentEvent.salonId}</h2>
                        </div>
                    </div>
                    <div class="ref">Ref: ${currentEvent.referencia || '-'}</div>
                </div>
                <h3 style="margin-bottom: 15px;">RESUMEN FINANCIERO</h3>
                
                <div class="summary-box">
                    <div class="summary-row">
                        <span class="label">Total Reservas:</span>
                        <span class="value">${participants.length}</span>
                    </div>
                    <div class="summary-row">
                        <span class="label">Total PAX:</span>
                        <span class="value">${totalPax}</span>
                    </div>
                    <div class="summary-row">
                        <span class="label">Importe Total:</span>
                        <span class="value">${window.MesaChef.formatEuroValue(totalAmount)} €</span>
                    </div>
                    <div class="summary-row">
                        <span class="label">Total Cobrado:</span>
                        <span class="value" style="color: #166534;">${window.MesaChef.formatEuroValue(totalPaid)} €</span>
                    </div>
                    <div class="summary-row total" style="${totalPending > 0 ? 'color: #c2410c;' : 'color: #166534;'}">
                        <span class="label">Total Pendiente:</span>
                        <span class="value">${window.MesaChef.formatEuroValue(totalPending)} €</span>
                    </div>
                </div>

                <h4 style="margin-top: 20px; margin-bottom: 10px;">DESGLOSE POR RESERVA</h4>
                <table>
                    <thead>
                        <tr>
                            <th>Titular</th>
                            <th style="width: 60px; text-align: center;">Pax</th>
                            <th style="width: 80px; text-align: right;">Total</th>
                            <th style="width: 80px; text-align: right;">Pagado</th>
                            <th style="width: 80px; text-align: right;">Pendiente</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${participants.map(p => {
            const total = p.total || 0;
            const paid = p.pagado || 0;
            const pending = total - paid;
            const pax = (p.adultos || 0) + (p.ninos || 0);
            return `
                                <tr>
                                    <td>${p.titular}</td>
                                    <td style="text-align: center;">${pax}</td>
                                    <td style="text-align: right; white-space: nowrap;">${window.MesaChef.formatEuroValue(total)} €</td>
                                    <td style="text-align: right; color: #166534; white-space: nowrap;">${window.MesaChef.formatEuroValue(paid)} €</td>
                                    <td style="text-align: right; white-space: nowrap; ${pending > 0 ? 'color: #c2410c; font-weight: bold;' : ''}">${window.MesaChef.formatEuroValue(pending)} €</td>
                                </tr>
                            `;
        }).join('')}
                    </tbody>
                </table>
                <script>window.print();</script>
            </body >
            </html >
            `;
        openPrintWindow(html);
    }

    function printCompleteReport(participants) {
        const hotel = getHotelLogo();
        const totalPax = participants.reduce((sum, p) => sum + (p.adultos || 0) + (p.ninos || 0), 0);
        const totalAmount = participants.reduce((sum, p) => sum + (p.total || 0), 0);
        const totalPaid = participants.reduce((sum, p) => sum + (p.pagado || 0), 0);
        const totalPending = totalAmount - totalPaid;

        const byTable = {};
        participants.forEach(p => {
            const mesa = p.mesa || 'Sin asignar';
            if (!byTable[mesa]) byTable[mesa] = [];
            byTable[mesa].push(p);
        });

        const tables = Object.keys(byTable).sort((a, b) => {
            if (a === 'Sin asignar') return 1;
            if (b === 'Sin asignar') return -1;
            return parseInt(a) - parseInt(b);
        });

        const html = `
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Reporte Completo - ${currentEvent.nombre}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; padding: 20px; font-size: 11px; }
                    h1 { font-size: 18px; margin-bottom: 5px; }
                    h2 { font-size: 14px; color: #666; margin-bottom: 15px; font-weight: normal; }
                    h3 { font-size: 13px; margin: 15px 0 8px; }
                    .header { display: flex; justify-content: space-between; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #333; }
                    .ref { font-family: monospace; font-size: 14px; color: #666; }
                    .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
                    .info-box { background: #f9f9f9; padding: 10px; border: 1px solid #ddd; }
                    .info-label { font-size: 10px; color: #666; text-transform: uppercase; }
                    .info-value { font-size: 14px; font-weight: bold; margin-top: 3px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 25px; page-break-inside: avoid; }
                    th { background: #333; color: white; padding: 8px 12px; text-align: left; font-size: 10px; }
                    td { padding: 8px 12px; border-bottom: 1px solid #ddd; }
                    @media print { body { padding: 10px; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <img src="${hotel.url}" alt="Logo" style="height: 50px; object-fit: contain;" onerror="this.style.display='none'">
                        <div>
                            <h1>${currentEvent.nombre}</h1>
                            <h2>${formatDateES(currentEvent.fecha)} | ${currentEvent.salonId} | Aforo: ${currentEvent.aforoMax || 0}</h2>
                        </div>
                    </div>
                    <div class="ref">Ref: ${currentEvent.referencia || '-'}</div>
                </div>

                <div class="info-grid">
                    <div class="info-box">
                        <div class="info-label">Reservas</div>
                        <div class="info-value">${participants.length}</div>
                    </div>
                    <div class="info-box">
                        <div class="info-label">Total Pax</div>
                        <div class="info-value">${totalPax}</div>
                    </div>
                    <div class="info-box" style="${totalPaid > 0 ? 'background: #d1fae5;' : ''}">
                        <div class="info-label">Recaudado</div>
                        <div class="info-value" style="color: #166534;">${window.MesaChef.formatEuroValue(totalPaid)} €</div>
                    </div>
                    <div class="info-box" style="${totalPending > 0 ? 'background: #fee2e2;' : ''}">
                        <div class="info-label">Pendiente</div>
                        <div class="info-value" style="color: #c2410c;">${window.MesaChef.formatEuroValue(totalPending)} €</div>
                    </div>
                </div>

                <h3>ASIGNACI&Oacute;N DE MESAS</h3>
                ${tables.map(mesa => {
            const mesaPax = byTable[mesa].reduce((sum, p) => sum + (p.adultos || 0) + (p.ninos || 0), 0);
            return `
                    <table>
                        <thead>
                            <tr>
                                <th colspan="5">MESA ${mesa} (${byTable[mesa].length} reservas)</th>
                            </tr>
                            <tr>
                                <th>Titular</th>
                                <th style="width: 100px;">Contacto</th>
                                <th style="width: 50px; text-align: center;">Pax</th>
                                <th style="width: 70px; text-align: right;">Total</th>
                                <th style="width: 70px; text-align: right;">Pendiente</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${byTable[mesa].map(p => {
                const total = p.total || 0;
                const paid = p.pagado || 0;
                const pending = total - paid;
                const pax = (p.adultos || 0) + (p.ninos || 0);
                return `
                                    <tr>
                                        <td><strong>${p.titular}</strong><br><span style="font-size: 9px; color: #666;">${p.referencia || ''}</span></td>
                                        <td style="font-size: 10px;">${p.telefono || '-'}</td>
                                        <td style="text-align: center;">${pax}</td>
                                        <td style="text-align: right; white-space: nowrap;">${window.MesaChef.formatEuroValue(total)} €</td>
                                        <td style="text-align: right; white-space: nowrap; ${pending > 0 ? 'color: #c2410c;' : 'color: #166534;'}">${window.MesaChef.formatEuroValue(pending)} €</td>
                                    </tr>
                                `;
            }).join('')}
                        </tbody>
                    </table>
                `;
        }).join('')}
                <script>window.print();</script>
            </body>
            </html >
            `;
        openPrintWindow(html);
    }

    function formatDateES(isoDate) {
        if (!isoDate) return "";
        const [y, m, d] = isoDate.split("-");
        return `${d} /${m}/${y} `;
    }

    function openPrintWindow(html) {
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(html);
        printWindow.document.close();
    }

})();
