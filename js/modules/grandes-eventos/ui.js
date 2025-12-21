import { state } from './state.js';
import * as Utils from './utils.js';
import * as API from './api.js';
import { generateParticipantsReport } from './print.js'; // And others as needed

// Helper to quickly select elements
const $ = id => document.getElementById(id);

export function initEventListeners() {
    // Navigation & Global Actions
    $('btnSaveEventConfig')?.addEventListener('click', saveConfig);
    $('btnAddParticipant')?.addEventListener('click', () => openParticipantModal());
    $('btnCloseModal')?.addEventListener('click', closeParticipantModal);
    $('formParticipant')?.addEventListener('submit', handleParticipantSubmit);
    $('btnToggleStatus')?.addEventListener('click', toggleStatus);

    // Filters
    $('listStatusFilter')?.addEventListener('change', refreshEventsList);
    $('listDateFilter')?.addEventListener('change', refreshEventsList);
    $('listSearch')?.addEventListener('input', debounce(refreshEventsList, 500));
    $('filterParticipants')?.addEventListener('change', renderParticipantsTable);

    // Modal Financials
    ['pAdults', 'pKids', 'pCollectionDate'].forEach(id => {
        $(id)?.addEventListener('input', recalcModalFinancials);
    });

    $('btnAddPayment')?.addEventListener('click', addPaymentToModal);
    $('paymentsList')?.addEventListener('click', handlePaymentListClick);
    $('btnConfirmCancel')?.addEventListener('click', confirmCancel);
    $('btnShowCancel')?.addEventListener('click', () => window.toggleCancelForm()); // Using the window helper for now or refactor

    // Print
    $('btnPrintMenu')?.addEventListener('click', (e) => {
        e.stopPropagation();
        $('printDropdown').classList.toggle('hidden');
    });

    // New Event Modal
    $('btnNewEventParams')?.addEventListener('click', () => $('modalNewEvent').classList.remove('hidden'));
    $('btnCloseNewEvent')?.addEventListener('click', () => $('modalNewEvent').classList.add('hidden'));
    $('btnCreateNewEvent')?.addEventListener('click', handleCreateNewEvent);
}

// --- List View ---

export async function renderEventsList(events) {
    const tbody = $('eventsListBody');
    tbody.innerHTML = '';

    if (events.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-slate-500">No se encontraron eventos.</td></tr>`;
        return;
    }

    events.forEach(e => {
        // Render logic similar to original but using Utils.formatDate
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="font-mono text-xs bg-slate-100 px-2 py-1 rounded">${e.referencia}</span></td>
            <td>${Utils.formatDate(e.fecha)}</td>
            <td class="font-semibold text-slate-700">${e.nombre}</td>
            <td>${e.salonId}</td>
            <td>${e.capacidad || 0}</td>
            <td>${e.stats?.totalPax || '-'}</td>
            <td>${renderStatusBadge(e.estado)}</td>
            <td>
                <button class="btn-action open-event" data-id="${e.id}">Gestionar</button>
            </td>
        `;
        tr.querySelector('.open-event').addEventListener('click', () => loadEventDetail(e.id));
        tbody.appendChild(tr);
    });
}

function renderStatusBadge(status) {
    const isClosed = status === 'completo' || status === 'cerrado';
    return `<span class="status-badge ${isClosed ? 'status-closed' : 'status-open'}">
        ${isClosed ? 'Completo' : 'Abierto'}
    </span>`;
}

// --- Detail View ---

export async function loadEventDetail(eventId) {
    // Switch view
    $('view-list').classList.add('hidden');
    $('view-detail').classList.remove('hidden');

    // Load Data
    const event = await API.fetchEventDetails(eventId);
    state.currentEvent = event;
    state.currentEventId = eventId;

    // Fill Form
    $('inputRef').value = event.referencia;
    $('inputName').value = event.nombre;
    $('inputDate').value = event.fecha;
    $('inputSalon').value = event.salonId;
    $('inputCapacity').value = event.capacidad || 0;
    $('inputPriceAdult').value = event.precioAdulto || 0;
    $('inputPriceChild').value = event.precioNino || 0;

    // Load Participants
    await loadParticipants(eventId);
}

export async function loadParticipants(eventId) {
    const participants = await API.fetchParticipants(eventId);
    state.participants = participants;
    renderParticipantsTable();
    updateDashboard();
}

export function renderParticipantsTable() {
    const tbody = $('participantsTableBody');
    tbody.innerHTML = '';

    const filter = $('filterParticipants').value;
    const filtered = state.participants.filter(p => {
        if (filter === 'todos') return true;
        if (filter === 'anulado') return p.estado && p.estado.startsWith('anulado');
        return !p.estado || p.estado === 'activo';
    });

    // Sort by Sequence
    filtered.sort((a, b) => (a.secuencia || 0) - (b.secuencia || 0));

    filtered.forEach(p => {
        const isAnulado = p.estado && p.estado.startsWith('anulado');
        const tr = document.createElement('tr');
        if (isAnulado) tr.classList.add('bg-red-50');

        // Calcs
        const paid = (p.pagos || []).reduce((acc, pay) => acc + (parseFloat(pay.amount) || 0), 0) + (parseFloat(p.pagado) || 0); // Legacy compat

        tr.innerHTML = `
            <td class="font-mono text-xs">${p.mesa || '-'}</td>
            <td class="font-medium ${isAnulado ? 'text-red-700 line-through' : 'text-slate-800'}">
                ${p.titular} <br> <span class="text-[10px] text-slate-500">${p.referencia}</span>
            </td>
            <td class="text-xs text-slate-500">${p.telefono || '-'}</td>
            <td><span class="font-bold">${p.adultos}</span> / ${p.ninos}</td>
            <td class="font-mono text-xs">-</td>
            <td class="font-mono text-xs text-green-700">${Utils.formatCurrency(paid)}</td>
            <td class="font-mono text-xs text-orange-600">-</td>
            <td>
                <button class="btn-action edit-p" data-id="${p.id}">Editar</button>
            </td>
        `;
        tr.querySelector('.edit-p').addEventListener('click', () => openParticipantModal(p));
        tbody.appendChild(tr);
    });
}

export function updateDashboard() {
    const capacity = parseInt($('inputCapacity').value) || 0;
    const stats = Utils.calculateStats(state.participants, capacity);

    $('statTotalPax').textContent = stats.totalPax;
    $('statOccupancy').textContent = stats.occupancy + '%';
    $('statCollected').textContent = Utils.formatCurrency(stats.totalCollected);
    $('statPending').textContent = Utils.formatCurrency(stats.totalPending);
    $('statCancelledAmount').textContent = Utils.formatCurrency(stats.totalCancelledAmount);

    // Available Seats Logic
    $('lblAvailableSeats').textContent = stats.available;
    $('lblAvailableSeats').style.color = stats.available < 0 ? '#ef4444' : '#0f172a';
}

// --- Participant Modal ---

export function openParticipantModal(participant = null) {
    const modal = $('modalParticipant');
    modal.classList.remove('hidden');

    if (participant) {
        state.modalPagos = participant.pagos ? [...participant.pagos] : [];
        $('pId').value = participant.id;
        $('pName').value = participant.titular;
        $('pAdults').value = participant.adultos;
        $('pKids').value = participant.ninos;
        // ... fill other fields

        // Show Cancel Button logic
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
        // New
        state.modalPagos = [];
        $('pId').value = '';
        $('formParticipant').reset();
        $('btnShowCancel').style.display = 'none';
        $('pCollectionDate').value = new Date().toISOString().split('T')[0];
    }

    renderModalPayments();
    recalcModalFinancials();
}

function recalcModalFinancials() {
    // ... Implement logic similar to original, checking capacity
    // Updating 'pWarningCapacity' visibility
    const adults = parseInt($('pAdults').value) || 0;
    const kids = parseInt($('pKids').value) || 0;
    const currentTotal = adults + kids;

    // Check availability using Utils or State
    // ...
}

// --- Helpers ---

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Placeholders for undefined functions in this snippet to allow compilation/saving
// --- Placeholders Implemented ---

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
        alert('Configuración guardada correctamente.');
        state.currentEvent = { ...state.currentEvent, ...updates };
        updateDashboard();
    } catch (e) {
        console.error(e);
        alert('Error al guardar.');
    }
}

async function refreshEventsList() {
    // Basic refresh logic
    // Filters should be read from DOM
    const events = await API.fetchEvents();
    // Filter logic omitted for brevity, would act on 'state.events' if cached or re-fetch
    renderEventsList(events);
}

function renderModalPayments() {
    const container = $('paymentsList');
    if (!container) return;
    container.innerHTML = '';
    state.modalPagos.forEach((p, idx) => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center bg-white p-2 border border-slate-200 rounded text-xs";
        div.innerHTML = `
            <span>${Utils.formatDate(p.date)}</span>
            <span class="font-bold text-slate-700">${Utils.formatCurrency(p.amount)}</span>
            <button type="button" class="text-red-500 hover:text-red-700 btn-remove-pay" data-idx="${idx}">&times;</button>
        `;
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
    } catch (e) {
        console.error(e);
        alert("Error al anular");
    }
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
    } catch (err) {
        console.error(err);
        alert("Error al guardar");
    }
}

async function handleRecover(id) {
    if (!confirm("¿Recuperar?")) return;
    await API.recoverParticipant(id);
    closeParticipantModal();
    loadParticipants(state.currentEventId);
}

function closeParticipantModal() {
    $('modalParticipant').classList.add('hidden');
}

function toggleStatus() {
    // Implementation for toggling status (open/complete)
}

function handleCreateNewEvent() {
    // Implementation for creating new event
}
