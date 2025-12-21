/**
 * Estructura del Estado Centralizado
 * Evita depender de inputs ocultos y variables globales dispersas.
 */
export const state = {
    currentEventId: null,
    currentEvent: null,
    participants: [],
    modalPagos: [],
    hotelInfo: {
        name: "Sercotel Guadiana",
        logo: "Img/logo-guadiana.png"
    },
    ui: {
        filter: 'activo', // activo, anulado, todos
        view: 'list', // list, detail
        printMode: null
    }
};

/**
 * Resetear estado al salir o cambiar de evento
 */
export function resetState() {
    state.currentEventId = null;
    state.currentEvent = null;
    state.participants = [];
    state.modalPagos = [];
}
