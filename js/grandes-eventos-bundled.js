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
            let participants = [];
            snapshot.forEach(doc => participants.push({ id: doc.id, ...doc.data() }));
            return participants;
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
            if (participantData.id) {
                const ref = participantesRef.doc(participantData.id);
                const { id, ...data } = participantData;
                await ref.update({
                    ...data,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                await participantesRef.add({
                    ...participantData,
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
    function printGeneric(title, content) {
        const w = window.open('', '_blank');
        w.document.write(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>${title}</title>
                <style>
                    body { font-family: 'Segoe UI', sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
                    th { background: #f1f5f9; text-align: left; padding: 8px; border-bottom: 2px solid #e2e8f0; text-transform:uppercase; font-size:10px; color:#64748b; }
                    td { padding: 8px; border-bottom: 1px solid #f1f5f9; color:#334155; }
                    .text-right { text-align: right; }
                    .font-bold { font-weight: bold; }
                    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 2px solid #0f172a; padding-bottom: 20px; }
                </style>
            </head>
            <body>${content}</body>
            </html>
        `);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 500);
    }

    // --- UI.JS ---
    const $ = id => document.getElementById(id);

    function initEventListeners() {
        $('btnSaveEventConfig')?.addEventListener('click', saveConfig);
        $('btnAddParticipant')?.addEventListener('click', () => openParticipantModal());
        $('btnCloseModal')?.addEventListener('click', closeParticipantModal);
        $('formParticipant')?.addEventListener('submit', handleParticipantSubmit);
        $('btnToggleStatus')?.addEventListener('click', toggleStatus);

        $('listStatusFilter')?.addEventListener('change', refreshEventsList);
        $('listDateFilter')?.addEventListener('change', refreshEventsList);
        // $('listSearch')?.addEventListener('input', debounce(refreshEventsList, 500)); // Debounce manually implemented if needed

        ['pAdults', 'pKids', 'pCollectionDate'].forEach(id => {
            $(id)?.addEventListener('input', recalcModalFinancials);
        });

        $('btnAddPayment')?.addEventListener('click', addPaymentToModal);
        $('paymentsList')?.addEventListener('click', handlePaymentListClick);
        $('btnConfirmCancel')?.addEventListener('click', confirmCancel);
        $('btnShowCancel')?.addEventListener('click', () => window.toggleCancelForm());

        $('btnPrintMenu')?.addEventListener('click', (e) => {
            e.stopPropagation();
            $('printDropdown').classList.toggle('hidden');
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
                <td><span class="font-mono text-xs bg-slate-100 px-2 py-1 rounded">${e.referencia}</span></td>
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

            tr.innerHTML = `
                <td class="font-mono text-xs">${p.mesa || '-'}</td>
                <td class="font-medium ${isAnulado ? 'text-red-700 line-through' : 'text-slate-800'}">
                    ${p.titular} <br> <span class="text-[10px] text-slate-500">${p.referencia}</span>
                </td>
                <td class="text-xs text-slate-500">${p.telefono || '-'}</td>
                <td><span class="font-bold">${p.adultos}</span> / ${p.ninos}</td>
                <td class="font-mono text-xs">-</td>
                <td class="font-mono text-xs text-green-700">${formatCurrency(paid)}</td>
                <td class="font-mono text-xs text-orange-600">-</td>
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

            const btnCancel = $('btnShowCancel');
            if (participant.estado === 'anulado') {
                btnCancel.textContent = "Recuperar Reserva";
                btnCancel.onclick = () => handleRecover(participant.id);
            } else {
                btnCancel.textContent = "Anular Participación";
                btnCancel.onclick = () => window.toggleCancelForm();
            }
            btnCancel.style.display = 'block';
        } else {
            state.modalPagos = [];
            $('pId').value = '';
            $('formParticipant').reset();
            $('btnShowCancel').style.display = 'none';
            $('pCollectionDate').value = new Date().toISOString().split('T')[0];
            $('pAdults').value = 1;
        }
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
        const data = {
            id: $('pId').value || null,
            eventoId: state.currentEventId,
            titular: $('pName').value,
            telefono: $('pPhone').value,
            email: $('pEmail').value,
            adultos: parseInt($('pAdults').value) || 0,
            ninos: parseInt($('pKids').value) || 0,
            pagos: state.modalPagos,
        };
        try {
            await API.saveParticipant(data);
            closeParticipantModal();
            loadParticipants(state.currentEventId);
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
            $('newPayDate').value = '';
            $('newPayAmount').value = '';
            renderModalPayments();
            recalcModalFinancials();
        }
    }

    function handlePaymentListClick(e) {
        if (e.target.closest(".btn-remove-pay")) {
            const idx = parseInt(e.target.closest(".btn-remove-pay").dataset.idx);
            state.modalPagos.splice(idx, 1);
            renderModalPayments();
            recalcModalFinancials();
        }
    }

    async function confirmCancel() {
        const pId = $('pId').value;
        const reason = $('txtCancelReason').value;
        const action = $('selCancelAction').value;
        if (!pId || !reason) { alert("Indica el motivo"); return; }
        if (!confirm("¿Confirmar anulación?")) return;
        try {
            await API.cancelParticipant(pId, reason, action, state.modalPagos);
            closeParticipantModal();
            loadParticipants(state.currentEventId);
        } catch (e) { console.error(e); alert("Error al anular"); }
    }

    async function handleRecover(id) {
        if (!confirm("¿Recuperar?")) return;
        await API.recoverParticipant(id);
        closeParticipantModal();
        loadParticipants(state.currentEventId);
    }

    function closeParticipantModal() { $('modalParticipant').classList.add('hidden'); }
    function toggleStatus() { /* Implement logic */ }

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
        const data = {
            nombre: $('newEvtName').value,
            fecha: $('newEvtDate').value,
            salonId: $('newEvtSalon').value,
            // defaults
            capacidad: 0, precioAdulto: 0, precioNino: 0
        };
        if (!data.nombre || !data.fecha) return alert("Faltan datos");
        try {
            const id = await API.createEvent(data);
            $('modalNewEvent').classList.add('hidden');
            loadEventDetail(id);
        } catch (e) { console.error(e); alert("Error creando evento"); }
    }

    // Logic to open New Event Modal and Populate Salons
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
                salons = config[hotelKey];
            } else {
                // Fallback
                if (hotelKey === "Cumbria") {
                    salons = [{ name: "Salón A" }, { name: "Salón B" }, { name: "Terraza" }];
                } else {
                    salons = [{ name: "Gran Salón" }, { name: "Salón Venus" }, { name: "Salón Marte" }, { name: "Salón Júpiter" }];
                }
            }

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

    function refreshEventsList() {
        init(); // quick reload list
    }

})();
