/**
 * Grandes Eventos Bundled Script (No Modules)
 * Combines: state.js, utils.js, api.js, print.js, ui.js, main.js
 * To support file:// protocol usage without CORS errors.
 */
(function () {
    'use strict';

    // --- STATE.JS ---
    const state = {
        currentEventId: null,
        currentEvent: null,
        participants: [],
        modalPagos: [],
        hotelInfo: {
            name: "Sercotel Guadiana", // Default
            logo: "Img/logo-guadiana.png",
            id: "Guadiana"
        },
        ui: {
            filter: 'activo',
            view: 'list',
            printMode: null
        }
    };



    // Load initial state from LocalStorage
    const storedHotel = localStorage.getItem("mesaChef_hotel") || "Guadiana";
    state.hotelInfo.id = storedHotel;
    if (storedHotel === "Cumbria") {
        state.hotelInfo.name = "Cumbria Spa&Hotel";
        state.hotelInfo.logo = "Img/logo-cumbria.svg"; // [FIX] Use SVG
    } else {
        state.hotelInfo.name = "Sercotel Guadiana";
        state.hotelInfo.logo = "Img/logo-guadiana.svg"; // [FIX] Use SVG
    }

    function resetState() {
        state.currentEventId = null;
        state.currentEvent = null;
        state.participants = [];
        state.modalPagos = [];
    }

    // --- UTILS.JS ---
    function formatCurrency(amount) {
        if (amount === undefined || amount === null) return "0,00 €";
        return parseFloat(amount).toLocaleString('es-ES', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + " €";
    }

    function formatDate(dateString) {
        if (!dateString) return "";
        const [y, m, d] = dateString.split('-');
        return `${d}/${m}/${y}`;
    }

    // [FIX] Get hotel logo path
    function getHotelLogo() {
        const hotelId = state.hotelInfo?.id || 'Guadiana';
        return hotelId === 'Cumbria' ? 'Img/logo-cumbria.png' : 'Img/logo-guadiana.png';
    }

    function getHotelLogo(salonName) {
        if (salonName === 'Cumbria') return "Img/logo-cumbria.png";
        return "Img/logo-guadiana.png";
    }

    function calculateStats(participants, capacity) {
        let totalPax = 0;
        let totalAdults = 0;
        let totalKids = 0;
        let totalCollected = 0;
        let totalPending = 0;
        let totalCancelledAmount = 0;

        participants.forEach(p => {
            const isAnulado = p.estado && p.estado.startsWith("anulado");
            const pagos = p.pagos || [];
            const paidAmount = pagos.reduce((acc, pay) => acc + (parseFloat(pay.amount) || 0), 0) + (p.pagado && !p.pagos ? parseFloat(p.pagado) : 0);

            if (isAnulado) {
                totalCancelledAmount += paidAmount;
            } else {
                totalAdults += parseInt(p.adultos) || 0;
                totalKids += parseInt(p.ninos) || 0;
                totalCollected += paidAmount;

                const priceAd = parseFloat(document.getElementById("inputPriceAdult").value) || 0;
                const priceCh = parseFloat(document.getElementById("inputPriceChild").value) || 0;
                const totalCost = ((parseInt(p.adultos) || 0) * priceAd) + ((parseInt(p.ninos) || 0) * priceCh);

                const pending = Math.max(0, totalCost - paidAmount);
                totalPending += pending;
            }
        });

        totalPax = totalAdults + totalKids;
        const occupancy = capacity > 0 ? ((totalPax / capacity) * 100).toFixed(0) : 0;
        const available = capacity - totalPax;

        return {
            totalPax, totalAdults, totalKids, occupancy, available, totalCollected, totalPending, totalCancelledAmount
        };
    }

    // --- API.JS ---
    const API = (() => {
        // Access global db instance
        // Assuming firebase-init.js runs before this script
        let db, eventosRef, participantesRef, masterRef;

        function initAPI() {
            db = window.db;
            if (!db) return false;
            eventosRef = db.collection("grandes_eventos");
            participantesRef = db.collection("participantes_eventos");
            masterRef = db.collection("master_data");
            return true;
        }

        async function fetchEvents() {
            if (!initAPI()) return [];

            // [FIX] Client-side filtering to handle Legacy Data (no hotel field = Guadiana)
            const currentHotel = state.hotelInfo.id || "Guadiana";
            // Fetch ALL (sorted) then filter in memory to catch legacy docs
            let query = eventosRef.orderBy("fecha", "desc");

            try {
                const snapshot = await query.get();
                let events = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const evtHotel = data.hotel || "Guadiana"; // Legacy fallback
                    if (evtHotel === currentHotel) {
                        events.push({ id: doc.id, ...data });
                    }
                });
                return events;
            } catch (e) {
                console.error("Error fetching events", e);
                return [];
            }
        }

        async function fetchEventDetails(eventId) {
            if (!initAPI()) throw new Error("DB not ready");
            const doc = await eventosRef.doc(eventId).get();
            if (!doc.exists) throw new Error("Evento no encontrado");
            return { id: doc.id, ...doc.data() };
        }

        async function fetchParticipants(eventId) {
            if (!initAPI()) return [];
            const snapshot = await participantesRef.where("eventoId", "==", eventId).get();
            // [FIX] Extract ID from doc.id, not from data()
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        async function fetchSalonConfig() {
            if (!initAPI()) return null;
            try {
                const doc = await masterRef.doc("CONFIG_SALONES").get();
                if (doc.exists) return doc.data();
                return null;
            } catch (e) {
                console.warn("Error fetching salon config", e);
                return null;
            }
        }

        async function createEvent(eventData) {
            if (!initAPI()) return;
            const prefix = eventData.nombre.substring(0, 3).toUpperCase();
            const cleanDate = eventData.fecha.replace(/-/g, '');
            const ref = `${prefix}${cleanDate}-GE${Math.floor(Math.random() * 1000)}`;

            const newEvent = {
                ...eventData,
                referencia: ref,
                estado: 'abierto',
                // [FIX] Assign current hotel
                hotel: state.hotelInfo.id || "Guadiana",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await eventosRef.add(newEvent);
            return docRef.id;
        }

        async function updateEvent(eventId, updates) {
            if (!initAPI()) return;
            await eventosRef.doc(eventId).update({
                ...updates,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        async function saveParticipant(participantData) {
            if (!initAPI()) return;

            // [FIX] Remove 'id' from data to prevent overwriting doc.id when fetching
            const { id, ...dataToSave } = participantData;

            if (id) {
                // Update existing
                const ref = participantesRef.doc(id);
                await ref.update({
                    ...dataToSave,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                // Create new
                await participantesRef.add({
                    ...dataToSave,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        async function cancelParticipant(pId, reason, action, modalPagos) {
            if (!initAPI()) return;
            let updates = {
                estado: 'anulado',
                motivoAnulacion: reason,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (action === "refund") {
                updates.pagos = [];
                updates.pagado = 0;
            }
            await participantesRef.doc(pId).update(updates);
        }

        async function recoverParticipant(pId) {
            if (!initAPI()) return;
            await participantesRef.doc(pId).update({
                estado: 'activo',
                motivoAnulacion: firebase.firestore.FieldValue.delete(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        return {
            fetchEvents, fetchEventDetails, fetchParticipants, createEvent, updateEvent, saveParticipant, cancelParticipant, recoverParticipant, fetchSalonConfig
        };
    })();

    // --- PRINT.JS ---
    // --- PRINT.JS RECOVERY ---
    function printGeneric(title, content) {
        const w = window.open('', '_blank');
        w.document.write(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>${title}</title>
                <link rel="stylesheet" href="css/print.css">
                <style>
                    body { font-family: 'Segoe UI', system-ui, sans-serif; -webkit-print-color-adjust: exact; padding: 20px; }
                     /* Fallback styles if CSS file fails to load */
                    .print-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 30px; }
                    .print-title { font-size: 24px; font-weight: 800; color: #0f172a; text-transform: uppercase; margin: 0; }
                    .print-subtitle { font-size: 14px; color: #64748b; margin-top: 5px; }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 20px; }
                    th { background-color: #f8fafc !important; color: #475569; font-weight: 700; text-transform: uppercase; padding: 8px 12px; text-align: left; border-bottom: 2px solid #e2e8f0; }
                    td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                    .font-bold { font-weight: 700; }
                    .section-break { page-break-before: always; }
                    .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; margin-top: 20px; page-break-inside: avoid; }
                </style>
            </head>
            <body>
                ${content}
                <script>
                    window.onload = function() { setTimeout(() => window.print(), 500); };
                </script>
            </body>
            </html>
        `);
        w.document.close();
    }

    function getPrintHeader(title) {
        const evt = state.currentEvent;
        return `
            <div class="print-header">
                <div>
                    <h1 class="print-title">${title}</h1>
                    <div class="print-subtitle">${evt.nombre} · ${formatDate(evt.fecha)}</div>
                </div>
                <img src="${state.hotelInfo.logo}" style="height: 60px;">
            </div>
         `;
    }

    function generateParticipantsPdf() {
        const parts = [...state.participants].sort((a, b) => (a.secuencia || 0) - (b.secuencia || 0));
        const rows = parts.map(p => {
            const paid = (p.pagos || []).reduce((a, c) => a + (parseFloat(c.amount) || 0), 0) + (parseFloat(p.pagado) || 0);
            const pending = (((parseInt(p.adultos) || 0) * state.currentEvent.precioAdulto + (parseInt(p.ninos) || 0) * state.currentEvent.precioNino) - paid);
            return `<tr>
                <td>${p.mesa || '-'}</td>
                <td><span class="font-bold">${p.titular}</span><br><span style="font-size:10px;color:#64748b">${p.referencia || '-'}</span></td>
                <td>${p.telefono || '-'}</td>
                <td class="text-center">${p.adultos}</td>
                <td class="text-center">${p.ninos}</td>
                <td class="text-right">${formatCurrency(paid)}</td>
                <td class="text-right ${pending > 0 ? 'text-red-600' : ''}">${pending > 0 ? formatCurrency(pending) : '-'}</td>
             </tr>`;
        }).join('');

        return `
            ${getPrintHeader("Listado de Participantes")}
            <table>
                <thead>
                    <tr>
                        <th width="10%">Mesa</th>
                        <th>Titular</th>
                        <th>Teléfono</th>
                        <th class="text-center" width="5%">Ad</th>
                        <th class="text-center" width="5%">Ni</th>
                        <th class="text-right" width="12%">Pagado</th>
                        <th class="text-right" width="12%">Pendiente</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    function generateTablesPdf() {
        // Group by Table
        const tables = {};
        state.participants.forEach(p => {
            const m = p.mesa || "Sin Asignar";
            if (!tables[m]) tables[m] = [];
            tables[m].push(p);
        });

        // Sort keys (Sin Asignar last)
        const keys = Object.keys(tables).sort((a, b) => {
            if (a === "Sin Asignar") return 1;
            if (b === "Sin Asignar") return -1;
            // Numeric sort if possible
            const nA = parseInt(a), nB = parseInt(b);
            if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
            return a.localeCompare(b);
        });

        let content = getPrintHeader("Distribución de Mesas");
        content += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">`;

        keys.forEach(k => {
            const group = tables[k];
            const totalAd = group.reduce((a, c) => a + (parseInt(c.adultos) || 0), 0);
            const totalCh = group.reduce((a, c) => a + (parseInt(c.ninos) || 0), 0);

            let tableContent = `
                <div class="summary-box">
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #e2e8f0; padding-bottom:5px; margin-bottom:10px;">
                        <span class="font-bold" style="font-size:16px; color:#0f172a;">Mesa ${k}</span>
                        <span style="font-size:12px; color:#64748b;">${totalAd + totalCh} Pax (${totalAd} Ad / ${totalCh} Ni)</span>
                    </div>
                    <table style="margin-top:0;">
                        <tbody>
                            ${group.map(p => `
                                <tr>
                                    <td style="padding:4px 0; border:none;">${p.titular}</td>
                                    <td style="padding:4px 0; border:none; text-align:right;">${(parseInt(p.adultos) || 0) + (parseInt(p.ninos) || 0)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
             `;
            content += tableContent;
        });

        content += `</div>`;
        return content;
    }

    function generateFinancialPdf() {
        const stats = calculateStats(state.participants, 0); // Re-calculate

        return `
            ${getPrintHeader("Informe Económico")}
            
            <div class="summary-box" style="margin-bottom:30px;">
                <h3 style="margin-top:0;">Resumen Global</h3>
                <table style="width: auto; min-width: 50%;">
                    <tr><td style="border:none; padding:4px 0;">Total Participantes:</td><td style="border:none; padding:4px 0; font-weight:bold;">${stats.totalPax} (${stats.totalAdults} Ad / ${stats.totalKids} Ni)</td></tr>
                    <tr><td style="border:none; padding:4px 0;">Recaudado:</td><td style="border:none; padding:4px 0; font-weight:bold; color:#15803d;">${formatCurrency(stats.totalCollected)}</td></tr>
                    <tr><td style="border:none; padding:4px 0;">Pendiente:</td><td style="border:none; padding:4px 0; font-weight:bold; color:#b91c1c;">${formatCurrency(stats.totalPending)}</td></tr>
                    <tr><td style="border:none; padding:4px 0;">Cancelado/Devuelto:</td><td style="border:none; padding:4px 0; font-weight:bold; color:#64748b;">${formatCurrency(stats.totalCancelledAmount)}</td></tr>
                </table>
            </div>

            <h3>Desglose por Reserva</h3>
            <table>
                <thead>
                    <tr>
                        <th>Ref</th>
                        <th>Titular</th>
                        <th class="text-center">Pax</th>
                        <th class="text-right">Total</th>
                        <th class="text-right">Pagado</th>
                        <th class="text-right">Pendiente</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.participants.filter(p => !p.estado?.startsWith('anulado')).map(p => {
            const paid = (p.pagos || []).reduce((a, c) => a + (parseFloat(c.amount) || 0), 0) + (parseFloat(p.pagado) || 0);
            const cost = ((parseInt(p.adultos) || 0) * parseFloat($('inputPriceAdult').value) + (parseInt(p.ninos) || 0) * parseFloat($('inputPriceChild').value));
            return `<tr>
                            <td>${p.referencia || '-'}</td>
                            <td>${p.titular}</td>
                            <td class="text-center">${(parseInt(p.adultos) || 0) + (parseInt(p.ninos) || 0)}</td>
                            <td class="text-right font-bold">${formatCurrency(cost)}</td>
                            <td class="text-right text-green-700">${formatCurrency(paid)}</td>
                            <td class="text-right ${cost - paid > 0 ? 'text-red-600' : ''}">${cost - paid > 0 ? formatCurrency(cost - paid) : '-'}</td>
                        </tr>`;
        }).join('')}
                </tbody>
            </table>
        `;
    }

    // --- UI.JS ---
    const $ = id => document.getElementById(id);

    let eventsListenersInitialized = false;

    function initEventListeners() {
        if (eventsListenersInitialized) return;
        eventsListenersInitialized = true;

        $('btnSaveEventConfig')?.addEventListener('click', saveConfig);
        $('btnAddParticipant')?.addEventListener('click', () => openParticipantModal());
        $('btnCloseModal')?.addEventListener('click', closeParticipantModal);
        $('formParticipant')?.addEventListener('submit', handleParticipantSubmit);
        $('btnToggleStatus')?.addEventListener('click', toggleStatus);

        $('listStatusFilter')?.addEventListener('change', refreshEventsList);
        $('listDateFilter')?.addEventListener('change', refreshEventsList);
        $('filterParticipants')?.addEventListener('change', renderParticipantsTable);
        // $('listSearch')?.addEventListener('input', debounce(refreshEventsList, 500)); // Debounce manually implemented if needed

        ['pAdults', 'pKids', 'pCollectionDate'].forEach(id => {
            $(id)?.addEventListener('input', recalcModalFinancials);
        });

        // [FIX] Real-time Dashboard Updates
        ['inputCapacity', 'inputPriceAdult', 'inputPriceChild'].forEach(id => {
            $(id)?.addEventListener('input', updateDashboard);
        });

        $('btnCloseCancelForm')?.addEventListener('click', () => window.toggleCancelForm());
        $('btnAddPayment')?.addEventListener('click', addPaymentToModal);
        $('paymentsList')?.addEventListener('click', handlePaymentListClick);
        $('btnConfirmCancel')?.addEventListener('click', confirmCancel);
        $('btnShowCancel')?.addEventListener('click', () => {
            const btn = $('btnShowCancel');
            if (btn.dataset.action === 'recover') {
                const id = $('pId').value;
                handleRecover(id);
            } else {
                if (typeof window.toggleCancelForm === 'function') {
                    window.toggleCancelForm();
                } else {
                    console.error("toggleCancelForm not found");
                    // Fallback implementation
                    const form = $('divCancelForm');
                    form.classList.toggle('hidden');
                    if (!form.classList.contains('hidden')) {
                        $('txtCancelReason').value = '';
                        const containerAction = $('divCancelPaymentAction');
                        if (containerAction && state.modalPagos) {
                            const totalPaid = state.modalPagos.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
                            containerAction.style.display = totalPaid > 0 ? 'block' : 'none';
                        }
                    }
                }
            }
        });

        $('btnPrintMenu')?.addEventListener('click', (e) => {
            e.stopPropagation();
            $('printDropdown').classList.toggle('hidden');
        });

        // [FIX] Print Options Listeners
        document.querySelectorAll('.print-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = btn.dataset.printType;
                const eventId = state.currentEventId;
                if (!eventId) return;

                // Hide dropdown
                $('printDropdown').classList.add('hidden');

                // Logic to print
                if (type === 'participants') {
                    printGeneric(`Participantes - ${state.currentEvent.nombre}`, generateParticipantsPdf());
                } else if (type === 'tables') {
                    printGeneric(`Mesas - ${state.currentEvent.nombre}`, generateTablesPdf());
                } else if (type === 'financial') {
                    printGeneric(`Financiero - ${state.currentEvent.nombre}`, generateFinancialPdf());
                } else if (type === 'complete') {
                    const combined = generateParticipantsPdf() +
                        `<div class="section-break"></div>` +
                        generateTablesPdf() +
                        `<div class="section-break"></div>` +
                        generateFinancialPdf();
                    printGeneric(`Reporte Completo - ${state.currentEvent.nombre}`, combined);
                } else {
                    alert("Opción desconocida");
                }
            });
        });

        // [FIX] Map Button
        $('btnOpenMapWindow')?.addEventListener('click', () => {
            if (state.currentEventId) {
                window.open(`plano-evento.html?id=${state.currentEventId}`, '_blank');
            } else {
                alert("Primero debes guardar el evento o seleccionar uno.");
            }
        });

        $('btnNewEventParams')?.addEventListener('click', () => $('modalNewEvent').classList.remove('hidden'));
        $('btnCloseNewEvent')?.addEventListener('click', () => $('modalNewEvent').classList.add('hidden'));
        $('btnCreateNewEvent')?.addEventListener('click', handleCreateNewEvent);

        // Setup global cancel toggler
        window.toggleCancelForm = function () {
            const form = $('divCancelForm');
            form.classList.toggle('hidden');
            if (!form.classList.contains('hidden')) {
                $('txtCancelReason').value = '';
                const totalPaid = state.modalPagos.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
                const containerAction = $('divCancelPaymentAction');
                if (containerAction) {
                    containerAction.style.display = totalPaid > 0 ? 'block' : 'none';
                }
            }
        };

        // [FIX] Smart Back Button
        const backLink = $('linkHeaderBack');
        if (backLink) {
            backLink.addEventListener('click', (e) => {
                // If we are in Detail View, go back to List instead of Home
                if (!$('view-detail').classList.contains('hidden')) {
                    e.preventDefault();
                    showListView();
                }
            });
        }
    }

    function showListView() {
        $('view-detail').classList.add('hidden');
        $('view-list').classList.remove('hidden');

        // Update Back Button Text
        const backLink = $('linkHeaderBack');
        if (backLink) backLink.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg> Volver al Inicio`;

        // Clear URL param
        try {
            window.history.pushState({}, document.title, window.location.pathname);
        } catch (e) { console.warn("History API restricted on file://"); }
    }

    async function renderEventsList(events) {
        const tbody = $('eventsListBody');
        tbody.innerHTML = '';
        if (events.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-slate-500">No se encontraron eventos.</td></tr>`;
            return;
        }
        events.forEach(e => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="font-mono text-xs bg-slate-100 px-2 py-1 rounded">${e.referencia || 'Auto'}</span></td>
                <td>${formatDate(e.fecha)}</td>
                <td class="font-semibold text-slate-700">${e.nombre}</td>
                <td>${e.salonId}</td>
                <td>${e.capacidad || 0}</td>
                <td>${e.stats?.totalPax || '-'}</td>
                <td>${renderStatusBadge(e.estado)}</td>
                <td><button class="btn-action open-event" data-id="${e.id}">Gestionar</button></td>
            `;
            tr.querySelector('.open-event').addEventListener('click', () => loadEventDetail(e.id));
            tbody.appendChild(tr);
        });
    }

    function renderStatusBadge(status) {
        const isClosed = status === 'completo' || status === 'cerrado';
        return `<span class="status-badge ${isClosed ? 'status-closed' : 'status-open'}">${isClosed ? 'Completo' : 'Abierto'}</span>`;
    }

    async function loadEventDetail(eventId) {
        $('view-list').classList.add('hidden');
        $('view-detail').classList.remove('hidden');

        // [FIX] Update Back Button Text
        const backLink = $('linkHeaderBack');
        if (backLink) backLink.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg> Volver a la Lista`;

        try {
            const event = await API.fetchEventDetails(eventId);
            state.currentEvent = event;
            state.currentEventId = eventId;

            $('inputRef').value = event.referencia;
            $('inputName').value = event.nombre;
            $('inputDate').value = event.fecha;
            $('inputSalon').value = event.salonId;
            $('inputCapacity').value = event.capacidad || 0;
            $('inputPriceAdult').value = event.precioAdulto || 0;
            $('inputPriceChild').value = event.precioNino || 0;

            await loadParticipants(eventId);
        } catch (e) { console.error(e); }
    }

    async function loadParticipants(eventId) {
        state.participants = await API.fetchParticipants(eventId);
        renderParticipantsTable();
        updateDashboard();
    }

    function renderParticipantsTable() {
        const tbody = $('participantsTableBody');
        tbody.innerHTML = '';
        const filter = $('filterParticipants').value;
        const filtered = state.participants.filter(p => {
            if (filter === 'todos') return true;
            if (filter === 'anulado') return p.estado && p.estado.startsWith('anulado');
            return !p.estado || p.estado === 'activo';
        });
        filtered.sort((a, b) => (a.secuencia || 0) - (b.secuencia || 0));

        filtered.forEach(p => {
            const isAnulado = p.estado && p.estado.startsWith('anulado');
            const tr = document.createElement('tr');
            if (isAnulado) tr.classList.add('bg-red-50');

            const paid = (p.pagos || []).reduce((acc, pay) => acc + (parseFloat(pay.amount) || 0), 0) + (parseFloat(p.pagado) || 0);

            // [FIX] Calculate total and pending
            const priceAdult = parseFloat($('inputPriceAdult')?.value) || 0;
            const priceChild = parseFloat($('inputPriceChild')?.value) || 0;
            const total = ((parseInt(p.adultos) || 0) * priceAdult) + ((parseInt(p.ninos) || 0) * priceChild);
            const pending = Math.max(0, total - paid);

            tr.innerHTML = `
                <td class="font-mono text-xs">${p.mesa || '-'}</td>
                <td class="font-medium ${isAnulado ? 'text-red-700 line-through' : 'text-slate-800'}">
                    ${p.titular} <br> <span class="text-[10px] text-slate-500">${p.referencia || (p.id ? 'P-' + p.id.slice(-6) : '-')}</span>
                </td>
                <td class="text-xs text-slate-500">${p.telefono || '-'}</td>
                <td><span class="font-bold">${p.adultos}</span> / ${p.ninos}</td>
                <td class="font-mono text-xs font-semibold">${total > 0 ? formatCurrency(total) : '-'}</td>
                <td class="font-mono text-xs text-green-700">${formatCurrency(paid)}</td>
                <td class="font-mono text-xs ${pending > 0 ? 'text-orange-600 font-semibold' : 'text-slate-400'}">${pending > 0 ? formatCurrency(pending) : '-'}</td>
                <td><button class="btn-action edit-p" data-id="${p.id}">Editar</button></td>
            `;
            tr.querySelector('.edit-p').addEventListener('click', () => openParticipantModal(p));
            tbody.appendChild(tr);
        });
    }

    function updateDashboard() {
        const capacity = parseInt($('inputCapacity').value) || 0;
        const stats = calculateStats(state.participants, capacity);

        $('statTotalPax').textContent = stats.totalPax;
        $('statOccupancy').textContent = stats.occupancy + '%';

        // [FIX] Update Context Label
        const lblCap = $('lblCapacity');
        if (lblCap) lblCap.textContent = capacity;

        // [FIX] Color Logic (> 100% Red Background)
        const occVal = parseFloat(stats.occupancy);
        const occElem = $('statOccupancy');
        const cardElem = $('statCardOccupancy');

        if (occElem && cardElem) {
            if (occVal > 100) {
                // Warning State
                occElem.classList.remove('text-slate-800');
                occElem.classList.add('text-red-700');

                cardElem.classList.remove('bg-white', 'border-slate-200');
                cardElem.classList.add('bg-red-100', 'border-red-400', 'animate-pulse'); // Dramatic effect
            } else {
                // Normal State
                occElem.classList.remove('text-red-700', 'text-red-600'); // Clean cleanup
                occElem.classList.add('text-slate-800');

                cardElem.classList.remove('bg-red-100', 'border-red-400', 'animate-pulse');
                cardElem.classList.add('bg-white', 'border-slate-200');
            }
        }

        $('statCollected').textContent = formatCurrency(stats.totalCollected);
        $('statPending').textContent = formatCurrency(stats.totalPending);
        $('statCancelledAmount').textContent = formatCurrency(stats.totalCancelledAmount);
        $('lblAvailableSeats').textContent = stats.available;
        $('lblAvailableSeats').style.color = stats.available < 0 ? '#ef4444' : '#0f172a';
    }

    function openParticipantModal(participant = null) {
        const modal = $('modalParticipant');
        modal.classList.remove('hidden');
        if (participant) {
            state.modalPagos = participant.pagos ? [...participant.pagos] : [];
            $('pId').value = participant.id;
            $('pName').value = participant.titular;
            $('pPhone').value = participant.telefono || '';
            $('pEmail').value = participant.email || '';
            $('pAdults').value = participant.adultos;
            $('pKids').value = participant.ninos;
            $('pObservaciones').value = participant.observaciones || '';

            // [FIX] Store Old Pax to avoid calculation errors on save
            const oldTotal = (parseInt(participant.adultos) || 0) + (parseInt(participant.ninos) || 0);
            $('pOldPax').value = oldTotal;

            const btnCancel = $('btnShowCancel');
            if (participant.estado && participant.estado.startsWith('anulado')) {
                btnCancel.textContent = "Recuperar Reserva";
                // Check if listener already exists? No, just clone to strip old ones if necessary or handle state
                // Simplest: just set usage in listener via state check or unique buttons.
                // But here we're swapping behavior.
                // Let's rely on a global state or class to switch logic in the event listener.
                btnCancel.dataset.action = "recover";
            } else {
                btnCancel.textContent = "Anular Participación";
                btnCancel.dataset.action = "cancel";
            }
            btnCancel.style.display = 'block';
        } else {
            state.modalPagos = [];
            $('pId').value = '';
            $('formParticipant').reset();
            $('btnShowCancel').style.display = 'none';
            $('pCollectionDate').value = new Date().toISOString().split('T')[0];
            $('pAdults').value = 1;
            $('pAdults').value = 1;
            $('pOldPax').value = 0;
        }

        // [FIX] Set Default Date to Today
        $('newPayDate').value = new Date().toISOString().split('T')[0];

        renderModalPayments();
        recalcModalFinancials();
    }

    function recalcModalFinancials() {
        // Simple recalc visual logic if needed
        const adults = parseInt($('pAdults').value) || 0;
        const kids = parseInt($('pKids').value) || 0;
        const priceAd = parseFloat($('inputPriceAdult').value) || 0;
        const priceCh = parseFloat($('inputPriceChild').value) || 0;

        const total = (adults * priceAd) + (kids * priceCh);
        const paid = state.modalPagos.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);

        $('pTotalCalc').value = total.toFixed(2);
        $('pPaidSummary').value = paid.toFixed(2);
        $('pPendingCalc').value = Math.max(0, total - paid).toFixed(2);
    }

    async function handleParticipantSubmit(e) {
        e.preventDefault();
        const newAdults = parseInt($('pAdults').value) || 0;
        const newKids = parseInt($('pKids').value) || 0;
        const newTotal = newAdults + newKids;

        // [FIX] Capacity Check
        const currentCap = parseInt($('inputCapacity').value) || 0;
        if (currentCap > 0) {
            const pId = $('pId').value;

            // DEBUG: Log current state
            console.log('=== CAPACITY CHECK DEBUG ===');
            console.log('pId from input:', pId, 'Type:', typeof pId);
            console.log('Total participants in state:', state.participants.length);
            console.log('Participant IDs:', state.participants.map(p => ({ id: p.id, type: typeof p.id, titular: p.titular })));

            // Calculate usage of ALL OTHER participants (excluding this one if editing)
            const otherParticipants = state.participants.filter(p => {
                const match = p.id !== pId;
                console.log(`Comparing p.id="${p.id}" (${typeof p.id}) !== pId="${pId}" (${typeof pId}): ${match}`);
                return match;
            });

            console.log('Filtered to', otherParticipants.length, 'other participants');

            const statsOthers = calculateStats(otherParticipants, currentCap);

            const currentOccupiedOther = statsOthers.totalPax;
            const futureOccupied = currentOccupiedOther + newTotal;

            console.log(`Capacity Check: Cap=${currentCap}, Others=${currentOccupiedOther}, New=${newTotal}, Future=${futureOccupied}`);
            console.log('=== END DEBUG ===');

            if (futureOccupied > currentCap) {
                const overflow = futureOccupied - currentCap;
                if (!confirm(`⚠️ AFORO EXCEDIDO\n\nEl evento tiene un aforo de ${currentCap} personas.\nCon estos cambios, se alcanzarán ${futureOccupied} personas (Exceso: ${overflow}).\n\n¿Deseas continuar de todas formas?`)) {
                    return; // Abort
                }
            }
        }

        const data = {
            id: $('pId').value || null,
            eventoId: state.currentEventId,
            titular: $('pName').value,
            telefono: $('pPhone').value,
            email: $('pEmail').value,
            adultos: newAdults,
            ninos: newKids,
            observaciones: $('pObservaciones').value || '',
            pagos: state.modalPagos,
        };
        try {
            await API.saveParticipant(data);
            closeParticipantModal();
            // [FIX] Reload participants immediately to get fresh IDs from Firebase
            await loadParticipants(state.currentEventId);
        } catch (err) { console.error(err); alert("Error al guardar"); }
    }

    function renderModalPayments() {
        const container = $('paymentsList');
        if (!container) return;
        container.innerHTML = '';
        state.modalPagos.forEach((p, idx) => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-white p-2 border border-slate-200 rounded text-xs";
            div.innerHTML = `<span>${formatDate(p.date)}</span><span class="font-bold text-slate-700">${formatCurrency(p.amount)}</span><button type="button" class="text-red-500 hover:text-red-700 btn-remove-pay" data-idx="${idx}">&times;</button>`;
            container.appendChild(div);
        });
    }

    function addPaymentToModal() {
        const date = $('newPayDate').value;
        const amount = parseFloat($('newPayAmount').value);
        if (date && amount) {
            state.modalPagos.push({ date, amount });

            // [FIX] Reset key fields but keep date as today for convenience
            $('newPayDate').value = new Date().toISOString().split('T')[0];
            $('newPayAmount').value = '';
            renderModalPayments();
            recalcModalFinancials();
        }
    }

    // [FIX] Cancellation Logic
    $('btnConfirmCancel')?.addEventListener('click', confirmCancel);

    async function confirmCancel() {
        const id = $('pId').value;
        const reason = $('txtCancelReason').value;
        const action = $('selCancelAction').value; // refund | keep

        if (!id) return alert("No se puede identificar al participante.");
        if (!reason) return alert("Indica un motivo.");
        if (!confirm("¿Confirmar anulación del participante?")) return;

        const newState = action === 'keep' ? 'anulado-con-cargos' : 'anulado-sin-cargos';

        try {
            // [FIX] Use saveParticipant instead of non-existent updateParticipant
            // Get current participant data first
            const currentP = state.participants.find(p => p.id === id);
            if (!currentP) throw new Error("Participante no encontrado en el estado");

            await API.saveParticipant({
                ...currentP,
                id: id,
                estado: newState,
                observaciones: (currentP.observaciones || '') + ` [ANULADO: ${reason}]`
            });

            alert("Participante anulado correctamente.");
            toggleCancelForm(); // Hide mini-form
            closeParticipantModal(); // Hide main modal

            // Refresh
            if (state.currentEventId) {
                state.participants = await API.fetchParticipants(state.currentEventId);
                renderParticipantsTable();
                updateDashboard();
            }

        } catch (e) {
            console.error(e);
            alert("Error al anular: " + e.message);
        }
    }

    function handlePaymentListClick(e) {
        // [FIX] Robuster Event Delegation
        const btn = e.target.closest(".btn-remove-pay");
        if (btn) {
            e.preventDefault();
            e.stopPropagation(); // Stop bubbling
            const idx = parseInt(btn.dataset.idx);
            console.log("Deleting payment at index:", idx);

            if (state.modalPagos[idx]) {
                state.modalPagos.splice(idx, 1);
                renderModalPayments();
                recalcModalFinancials();
            }
        }
    }



    async function handleRecover(id) {
        if (!confirm("¿Recuperar?")) return;
        await API.recoverParticipant(id);
        closeParticipantModal();
        loadParticipants(state.currentEventId);
    }

    function closeParticipantModal() { $('modalParticipant').classList.add('hidden'); }
    function closeParticipantModal() { $('modalParticipant').classList.add('hidden'); }

    // [FIX] Toggle Status Implementation
    async function toggleStatus() {
        if (!state.currentEventId) return;
        const current = state.currentEvent.estado;
        const newState = (current === 'completo' || current === 'cerrado') ? 'abierto' : 'completo';

        if (!confirm(`¿Cambiar estado a ${newState.toUpperCase()}?`)) return;

        try {
            await API.updateEvent(state.currentEventId, { estado: newState });
            state.currentEvent.estado = newState;
            await API.updateEvent(state.currentEventId, { estado: newState });
            state.currentEvent.estado = newState;
            // Refresh UI
            // [FIX] Correct ID: eventStatusBadge
            $('eventStatusBadge').textContent = newState === 'completo' ? 'Completo' : 'Abierto';
            $('eventStatusBadge').className = `px-3 py-1 rounded-full text-xs font-bold ${newState === 'completo' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`;
            alert(`Estado actualizado a ${newState}`);
        } catch (e) { console.error(e); alert("Error actualizando estado"); }
    }

    // --- MAIN.JS ---
    async function init() {
        console.log("Grandes Eventos Module (Bundled) Init");
        initEventListeners();

        // [FIX] Update Header UI
        const headerName = $('headerHotelName');
        const headerLogo = $('headerHotelLogo');
        if (headerName) headerName.textContent = state.hotelInfo.name;
        if (headerLogo) headerLogo.src = state.hotelInfo.logo;

        // Ensure defaults
        const viewList = $('view-list');
        const viewDetail = $('view-detail');
        if (viewList) viewList.classList.remove('hidden');
        if (viewDetail) viewDetail.classList.add('hidden');

        try {
            const events = await API.fetchEvents();
            renderEventsList(events);
        } catch (e) { console.warn("Error fetching events or DB not ready", e); }
    }

    // Initialize when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Placeholders for creating event
    async function handleCreateNewEvent() {
        const sName = $('newEvtSalon').value;
        const salonObj = cachedSalonsForNewEvent.find(s => s.name === sName);
        const defaultCap = salonObj ? (parseInt(salonObj.pax) || 0) : 0;

        const data = {
            nombre: $('newEvtName').value,
            fecha: $('newEvtDate').value,
            hotel: state.hotelInfo.id || "Guadiana", // [FIX] Store Hotel
            salonId: sName,
            // [FIX] Auto-fill capacity
            capacidad: defaultCap,
            precioAdulto: 0,
            precioNino: 0
        };
        if (!data.nombre || !data.fecha) return alert("Faltan datos");
        try {
            const id = await API.createEvent(data);

            // [FIX] Create Blocking Reservation in Salones
            if (window.db) {
                console.log("Creando bloqueo de salón para Gran Evento...");
                await window.db.collection("reservas_salones").add({
                    hotel: state.hotelInfo.id || "Guadiana",
                    salon: sName,
                    cliente: data.nombre,
                    fecha: data.fecha,
                    estado: 'confirmada', // Blocked
                    revisado: true,
                    tipoEvento: "Gran Evento",
                    eventoId: id,
                    origen: 'grandes_eventos',
                    referenciaPresupuesto: 'GE-' + id.substring(0, 4),
                    contact: { tel: "", email: "" },
                    detalles: {
                        jornada: "todo", // Block full day
                        montaje: "banquete",
                        hora: "12:00",
                        pax_adultos: 0,
                        pax_ninos: 0
                    },
                    notas: {
                        interna: "Bloqueo automático por Gran Evento",
                        cliente: ""
                    },
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            $('modalNewEvent').classList.add('hidden');
            loadEventDetail(id);
        } catch (e) { console.error(e); alert("Error creando evento"); }
    }

    // Logic to open New Event Modal and Populate Salons
    let cachedSalonsForNewEvent = []; // Store for lookup

    $('btnNewEventParams')?.addEventListener('click', async () => {
        $('modalNewEvent').classList.remove('hidden');
        // Populate Salons
        const sel = $('newEvtSalon');
        if (sel) {
            sel.innerHTML = '<option>Cargando...</option>';
            const config = await API.fetchSalonConfig();
            sel.innerHTML = ''; // Clear

            // Determine key based on hotel ID
            // ID = "Guadiana" or "Cumbria" usually.
            // fallback if ID is not matching exact keys
            let hotelKey = "Guadiana";
            if (state.hotelInfo.id === "Cumbria" || (state.hotelInfo.name && state.hotelInfo.name.includes("Cumbria"))) {
                hotelKey = "Cumbria";
            }

            let salons = [];
            if (config && config[hotelKey]) {
                // [FIX] Filter inactive and store logic
                salons = config[hotelKey].filter(s => s.active !== false);
            } else {
                // Fallback
                if (hotelKey === "Cumbria") {
                    salons = [{ name: "Salón A", pax: 100 }, { name: "Salón B", pax: 100 }, { name: "Terraza", pax: 50 }];
                } else {
                    salons = [{ name: "Gran Salón", pax: 300 }, { name: "Salón Venus", pax: 150 }, { name: "Salón Marte", pax: 80 }, { name: "Salón Júpiter", pax: 80 }];
                }
            }

            cachedSalonsForNewEvent = salons; // Save for capacity lookup

            salons.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.name;
                opt.textContent = s.name;
                sel.appendChild(opt);
            });
        }
    });

    $('btnCloseNewEvent')?.addEventListener('click', () => {
        $('modalNewEvent').classList.add('hidden');
    });

    $('btnCreateNewEvent')?.addEventListener('click', handleCreateNewEvent);

    async function saveConfig() {
        const id = state.currentEventId;
        if (!id) return;
        const updates = {
            nombre: $('inputName').value,
            fecha: $('inputDate').value,
            capacidad: parseInt($('inputCapacity').value) || 0,
            precioAdulto: parseFloat($('inputPriceAdult').value) || 0,
            precioNino: parseFloat($('inputPriceChild').value) || 0,
        };
        try {
            await API.updateEvent(id, updates);
            alert('Guardado.');
            state.currentEvent = { ...state.currentEvent, ...updates };
            updateDashboard();
        } catch (e) { console.error(e); alert('Error al guardar.'); }
    }

    async function refreshEventsList() {
        try {
            const events = await API.fetchEvents();

            // Simple Client Filter based on UI State
            const statusFilter = $('listStatusFilter')?.value || 'todos';

            const filtered = events.filter(e => {
                if (statusFilter === 'abierto') return e.estado !== 'completo' && e.estado !== 'cerrado';
                if (statusFilter === 'completo') return e.estado === 'completo' || e.estado === 'cerrado';
                return true;
            });

            renderEventsList(filtered);

        } catch (e) { console.warn("Error refreshing events", e); }
    }

    // [FIX] Ensure init is called
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
