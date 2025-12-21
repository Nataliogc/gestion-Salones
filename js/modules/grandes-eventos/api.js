import { state } from './state.js';
import { calculateStats } from './utils.js';

// Access global db instance (from firebase-init.js)
const db = window.db;
const eventosRef = db.collection("grandes_eventos");
const participantesRef = db.collection("participantes_eventos");
const masterRef = db.collection("master_data");

export async function fetchSalonConfig() {
    try {
        const doc = await masterRef.doc("CONFIG_SALONES").get();
        return doc.exists ? doc.data() : { Guadiana: [], Cumbria: [] };
    } catch (e) {
        console.error("Error fetching salon config:", e);
        return { Guadiana: [], Cumbria: [] };
    }
}

export async function fetchEvents(filters = {}) {
    let query = eventosRef.orderBy("fecha", "desc");
    const snapshot = await query.get();
    let events = [];
    snapshot.forEach(doc => events.push({ id: doc.id, ...doc.data() }));
    return events;
}

export async function fetchEventDetails(eventId) {
    const doc = await eventosRef.doc(eventId).get();
    if (!doc.exists) throw new Error("Evento no encontrado");
    return { id: doc.id, ...doc.data() };
}

export async function fetchParticipants(eventId) {
    const snapshot = await participantesRef.where("eventoId", "==", eventId).get();
    let participants = [];
    snapshot.forEach(doc => participants.push({ id: doc.id, ...doc.data() }));
    return participants;
}

export async function createEvent(eventData) {
    // Generate simple ref
    const prefix = eventData.nombre.substring(0, 3).toUpperCase();
    const cleanDate = eventData.fecha.replace(/-/g, '');
    const ref = `${prefix}${cleanDate}-GE${Math.floor(Math.random() * 1000)}`;

    const newEvent = {
        ...eventData,
        referencia: ref,
        estado: 'abierto',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await eventosRef.add(newEvent);
    return docRef.id;
}

export async function updateEvent(eventId, updates) {
    await eventosRef.doc(eventId).update({
        ...updates,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

export async function saveParticipant(participantData) {
    if (participantData.id) {
        // Update
        const ref = participantesRef.doc(participantData.id);
        const { id, ...data } = participantData;
        await ref.update({
            ...data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } else {
        // Create
        // Need to calculate sequence first? 
        // For simplicity, letting the backend or next step handle sequence numbers
        // ideally logic should be here or strict transaction.
        // Assuming sequence passed in or handled.
        await participantesRef.add({
            ...participantData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}

export async function cancelParticipant(pId, reason, action, modalPagos) {
    let updates = {
        estado: 'anulado',
        motivoAnulacion: reason,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (action === "refund") {
        // If refunding, we effectively remove payments from the record? 
        // Or keep them but mark as refunded? 
        // User legacy logic was: just empty the payments array or let user edit it manually?
        // The code showed conditional logic.
        // For now, mirroring user's "Delete" intent if they chose Refund(Borrar)
        // Wait, the prompt said "Devolver (Borrar)" vs "Retener (Gastos)".
        // If "refund", we assume money is returned, so balance is 0. 
        // We can clear the payments array to reflect mapped reality.
        updates.pagos = [];
        updates.pagado = 0;
    } else {
        // Keep payments as "Retained"
        // No change to payments array
    }

    await participantesRef.doc(pId).update(updates);
}

export async function recoverParticipant(pId) {
    await participantesRef.doc(pId).update({
        estado: 'activo',
        motivoAnulacion: firebase.firestore.FieldValue.delete(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

export async function batchUpdateReferences(updates) {
    const batch = db.batch();
    updates.forEach(u => {
        const ref = participantesRef.doc(u.id);
        batch.update(ref, { referencia: u.referencia, secuencia: u.secuencia });
    });
    await batch.commit();
}
