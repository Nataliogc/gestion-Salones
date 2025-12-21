import * as UI from './ui.js';
import * as API from './api.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for global firebase if needed, usually available if script loaded before
    if (!window.db) {
        console.error("Firebase DB not initialized!");
        return;
    }

    console.log("Grandes Eventos Module (v2.0) Init");

    UI.initEventListeners();

    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('id');

    if (eventId) {
        await UI.loadEventDetail(eventId);
    } else {
        // Load List
        const events = await API.fetchEvents();
        UI.renderEventsList(events);
    }
});
