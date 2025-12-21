/**
 * Logic for Seating Plan Window (v2 + Smart AI + Split Logic)
 */
(function () {
    const db = firebase.firestore();
    const eventosRef = db.collection("grandes_eventos");
    const participantesRef = db.collection("participantes_eventos");

    let currentEventId = null;
    let currentEvent = null;
    let currentParticipants = [];
    let mapTables = [];
    let salonConfigData = null; // Store fetched config

    // Drag State
    let dragTarget = null;
    let dragOffset = { x: 0, y: 0 };
    let isDraggingTable = false;

    // Search filter
    let unassignedFilter = "";

    document.addEventListener("DOMContentLoaded", async () => {
        const params = new URLSearchParams(window.location.search);
        currentEventId = params.get("id");

        if (!currentEventId) {
            document.body.innerHTML = "<h1>Error: No se especificó el evento.</h1>";
            return;
        }

        initUI();
        await loadData();
    });

    async function loadData() {
        try {
            // Load Event
            const doc = await eventosRef.doc(currentEventId).get();
            if (!doc.exists) {
                alert("Evento no encontrado");
                window.close();
                return;
            }
            currentEvent = { id: doc.id, ...doc.data() };

            const dateStr = currentEvent.fecha || "";
            document.getElementById("evtTitle").textContent = currentEvent.nombre || "Sin nombre";
            document.getElementById("evtSubtitle").textContent = dateStr;

            // Load Existing Map
            mapTables = currentEvent.layout || [];
            mapTables.forEach(t => { if (t.assignment === undefined) delete t.assignment; });

            // Load Participants
            const snap = await participantesRef.where("eventoId", "==", currentEventId).get();
            currentParticipants = [];
            snap.forEach(d => {
                const p = d.data();
                p.id = d.id;
                currentParticipants.push(p);
            });

            // Load Salon Dimensions
            await loadSalonDimensions(currentEvent.salonId);

            // Initial Render
            refreshAll();

        } catch (e) {
            console.error(e);
            alert("Error cargando datos: " + e.message);
        }
    }

    async function loadSalonDimensions(salonId) {
        if (!salonId) return;
        try {
            const configDoc = await db.collection("master_data").doc("CONFIG_SALONES").get();
            if (configDoc.exists) {
                salonConfigData = configDoc.data();
                // Find visible salon match
                let found = null;
                let hotelName = "";
                // Normalize search
                const search = (salonId || "").trim();

                // salonConfigData structure: { HotelName: [ { nombre: "X", m2: 123 }, ... ] }
                Object.keys(salonConfigData).forEach(hotel => {
                    const salons = salonConfigData[hotel] || [];
                    // Match by name exact or included? Often salonId IS the name.
                    const match = salons.find(s => s.nombre === search);
                    if (match) {
                        found = match;
                        hotelName = hotel;
                    }
                });

                if (found) {
                    const m2 = found.m2 || found.metros || "N/A";
                    const paxCap = found.pax || found.capacidad || "N/A";
                    document.getElementById("evtSubtitle").textContent += ` | ${hotelName} - ${found.nombre} [${m2} m² | Max ${paxCap} pax]`;
                }
            }
        } catch (e) {
            console.warn("Failed to load salon config", e);
        }
    }

    function initUI() {
        document.getElementById("btnAddRound")?.addEventListener("click", () => addTable("round"));
        document.getElementById("btnAddSquare")?.addEventListener("click", () => addTable("square"));
        document.getElementById("btnAddRect")?.addEventListener("click", () => addTable("rect"));
        document.getElementById("btnAutoLayout")?.addEventListener("click", autoGenerateLayout);
        document.getElementById("btnSaveMap")?.addEventListener("click", saveMap);

        document.getElementById("searchUnassigned")?.addEventListener("input", (e) => {
            unassignedFilter = e.target.value.toLowerCase();
            renderSidebar();
        });

        const canvas = document.getElementById("mapCanvas");
        if (canvas) {
            canvas.addEventListener("mousedown", mapDragStart);
            canvas.addEventListener("mousemove", mapDragMove);
            canvas.addEventListener("mouseup", mapDragEnd);
            canvas.addEventListener("mouseleave", mapDragEnd);
            canvas.addEventListener("dragover", e => e.preventDefault());
        }
    }

    function refreshAll() {
        renderMap();
        renderSidebar();
    }

    // --- Sidebar Logic ---
    function renderSidebar() {
        const container = document.getElementById("unassignedList");
        if (!container) return;
        container.innerHTML = "";

        // Find Unassigned (Participant Logic needs to account for SPLIT assignments)
        // If p.id is assigned to ANY table, they are considered assigned?
        // Yes, even if split. If a participant ID is in mapTables, they are placed.
        const assignedIds = mapTables.map(t => t.assignment).filter(x => x);
        const unassigned = currentParticipants.filter(p => !assignedIds.includes(p.id));

        const filtered = unassigned.filter(p =>
            (p.titular || "").toLowerCase().includes(unassignedFilter) ||
            (p.referencia || "").toLowerCase().includes(unassignedFilter)
        );

        if (filtered.length === 0) {
            container.innerHTML = `<div style="text-align:center; color:#94a3b8; font-size:12px; margin-top:20px;">No hay participantes sin mesa.</div>`;
            return;
        }

        filtered.forEach(p => {
            const el = document.createElement("div");
            el.className = "booking-card";
            el.draggable = true;
            el.style.cssText = `
                background: white; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; cursor: grab;
                box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: transform 0.1s;
            `;

            const totalPax = (p.adultos || 0) + (p.ninos || 0);

            el.innerHTML = `
                <div style="font-weight:600; font-size:13px; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${p.titular}
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:4px; font-size:11px; color:#64748b;">
                    <span>Ref: ${p.referencia}</span>
                    <span style="background:#e0f2fe; color:#0369a1; padding:1px 4px; border-radius:4px; font-weight:bold;">${totalPax} pax</span>
                </div>
            `;

            el.addEventListener("dragstart", (e) => {
                e.dataTransfer.setData("application/json", JSON.stringify(p));
                e.dataTransfer.effectAllowed = "copy";
                el.style.opacity = "0.5";
            });
            el.addEventListener("dragend", () => { el.style.opacity = "1"; });

            container.appendChild(el);
        });
    }

    // --- Map Logic ---
    function renderMap() {
        const canvas = document.getElementById("mapCanvas");
        canvas.innerHTML = "";
        mapTables.forEach(t => renderTableElement(t));
    }

    function addTable(type) {
        const id = "tbl_" + Date.now();
        const t = {
            id,
            type,
            x: 50,
            y: 50,
            label: (mapTables.length + 1).toString(),
            seats: type === 'rect' ? 12 : (type === 'round' ? 10 : 4),
            assignment: null
        };
        mapTables.push(t);
        renderTableElement(t);
    }

    function renderTableElement(t) {
        const canvas = document.getElementById("mapCanvas");
        const el = document.createElement("div");
        el.id = t.id;
        el.className = `map-table ${t.type}`;

        const p = t.assignment ? currentParticipants.find(x => x.id === t.assignment) : null;
        const currentPax = p ? ((p.adultos || 0) + (p.ninos || 0)) : 0;

        // Use t.seats as capacity.
        // For visual validation:
        // If SPLIT table, we should check if this specific table is overloaded?
        // But we don't track pax-per-split-table in DB, only link to Participant.
        // Simplified Logic: If split (calculated by size > capacity), assume evenly distributed?
        // Or just show total vs capacity? 
        // If 447 pax assigned to 45 tables (seats 450), each table shows "447/10"? That is confusing.
        // Needs "Smart Labeling" for split tables.

        const isSplit = t.label.includes("."); // Hacky detection or use property?
        let labelText = t.label;
        let paxText = p ? `${currentPax}/${t.seats}` : `${t.seats} pax`;
        let statusColor = p ? "#dbeafe" : "#f0fdf4"; // Blue vs Green
        let borderColor = p ? "#3b82f6" : "#22c55e"; // Blue vs Green

        if (p && isSplit) {
            // It's a split table.
            paxText = "Part. " + t.seats;
            statusColor = "#e0e7ff"; // Indigo tint
            borderColor = "#6366f1";
        } else if (p) {
            // Normal single table
            if (currentPax > t.seats) {
                statusColor = "#fee2e2"; // Red
                borderColor = "#ef4444";
            } else if (currentPax === t.seats) {
                statusColor = "#dbeafe";
                borderColor = "#3b82f6";
            } else {
                statusColor = "#ffedd5"; // Orange
                borderColor = "#f97316";
            }
        }

        // Dimensions
        let w = 80, h = 80;
        if (t.type === 'rect') { w = 120; h = 60; }
        else if (t.type === 'square') { w = 70; h = 70; }
        else { w = 80; h = 80; }
        if (t.customWidth) { w = t.customWidth; }

        el.style.width = w + "px";
        el.style.height = h + "px";
        el.style.left = t.x + "px";
        el.style.top = t.y + "px";
        el.dataset.id = t.id;

        el.style.backgroundColor = statusColor;
        el.style.border = `2px solid ${borderColor}`;

        if (p) {
            el.innerHTML = `
                <div style="font-size:14px; font-weight:bold; color:#0f172a;">${labelText}</div>
                <div style="font-size:10px; color:#334155; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:95%;">
                    ${p.titular}
                </div>
                <div style="font-size:11px; font-weight:bold;">
                    ${paxText}
                </div>
            `;
            el.title = `${p.titular} (${p.adultos}+${p.ninos})`;
        } else {
            el.innerHTML = `
                <div style="font-size:16px; font-weight:bold; color:#64748b;">${labelText}</div>
                <div style="font-size:10px; color:#94a3b8;">${t.seats} pax</div>
            `;
        }

        // Handlers
        el.addEventListener("dragover", (e) => { e.preventDefault(); el.style.transform = "scale(1.05)"; });
        el.addEventListener("dragleave", (e) => { el.style.transform = "scale(1)"; });
        el.addEventListener("drop", (e) => {
            e.preventDefault();
            el.style.transform = "scale(1)";
            const data = e.dataTransfer.getData("application/json");
            try {
                const droppedP = JSON.parse(data);
                if (droppedP && droppedP.id) assignParticipant(t.id, droppedP.id);
            } catch (err) { }
        });
        el.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            const action = prompt(`Mesa ${t.label}\n\n1. Editar Nombre\n2. Editar Capacidad\n3. Desasignar`, "1");
            if (action === "1") {
                const newName = prompt("Nuevo nombre:", t.label);
                if (newName) { t.label = newName; refreshAll(); }
            } else if (action === "2") {
                const newSeats = prompt("Capacidad:", t.seats);
                const n = parseInt(newSeats);
                if (!isNaN(n) && n > 0) { t.seats = n; refreshAll(); }
            } else if (action === "3") {
                // Remove logic
                if (t.assignment) {
                    if (confirm("¿Desasignar?")) { t.assignment = null; refreshAll(); }
                } else {
                    if (confirm("¿Borrar mesa?")) { mapTables = mapTables.filter(x => x.id !== t.id); refreshAll(); }
                }
            }
        });

        canvas.appendChild(el);
    }

    function assignParticipant(tableId, pId) {
        // If manual drop, assume single table assignment for now
        // Clear previous single table assignment
        const existing = mapTables.find(mt => mt.assignment === pId && !mt.label.includes("."));
        if (existing) existing.assignment = null;

        const table = mapTables.find(t => t.id === tableId);
        if (table) {
            table.assignment = pId;
            refreshAll();
        }
    }

    function mapDragStart(e) {
        const target = e.target.closest(".map-table");
        if (target) {
            isDraggingTable = true;
            dragTarget = target;
            const rect = dragTarget.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            dragTarget.classList.add("selected");
            e.preventDefault();
        }
    }

    function mapDragMove(e) {
        if (!isDraggingTable || !dragTarget) return;
        const canvas = document.getElementById("mapCanvas");
        const canvasRect = canvas.getBoundingClientRect();
        let x = e.clientX - canvasRect.left - dragOffset.x;
        let y = e.clientY - canvasRect.top - dragOffset.y;
        x = Math.max(0, x);
        y = Math.max(0, y);
        dragTarget.style.left = x + "px";
        dragTarget.style.top = y + "px";
        const t = mapTables.find(m => m.id === dragTarget.dataset.id);
        if (t) { t.x = x; t.y = y; }
    }

    function mapDragEnd(e) {
        if (isDraggingTable && dragTarget) {
            dragTarget.classList.remove("selected");
            isDraggingTable = false;
            dragTarget = null;
        }
    }

    async function saveMap() {
        if (!currentEventId) return;
        try {
            const cleanLayout = JSON.parse(JSON.stringify(mapTables));
            await eventosRef.doc(currentEventId).update({ layout: cleanLayout });

            // Sync mesa assignments to participants
            const batch = db.batch();

            // First, clear all mesa assignments
            currentParticipants.forEach(p => {
                const ref = participantesRef.doc(p.id);
                batch.update(ref, { mesa: "" });
            });

            // Then assign mesa based on layout
            mapTables.forEach(table => {
                if (table.assignment) {
                    const ref = participantesRef.doc(table.assignment);
                    batch.update(ref, { mesa: table.label });
                }
            });

            await batch.commit();

            alert("Plano guardado correctamente.");
            try {
                if (window.opener && !window.opener.closed && window.opener.onMapSaved) {
                    window.opener.onMapSaved();
                }
            } catch (ex) { console.warn(ex); }
        } catch (e) {
            console.error(e);
            alert("Error al guardar plano: " + e.message);
        }
    }

    // --- SMART AI WITH SPLITTING ---
    function autoGenerateLayout() {
        if (!confirm("⚠️ Esto borrará el plano actual y generará uno nuevo. ¿Continuar?")) return;

        const paxList = currentParticipants.filter(p => ((p.adultos || 0) + (p.ninos || 0)) > 0);
        // Sort: Large groups first to prioritize their placement (since they take space)
        paxList.sort((a, b) => ((b.adultos || 0) + (b.ninos || 0)) - ((a.adultos || 0) + (a.ninos || 0)));

        if (paxList.length === 0) {
            alert("No hay participantes.");
            return;
        }

        mapTables = [];
        const canvas = document.getElementById("mapCanvas");
        const availableWidth = (canvas.offsetWidth || 800) - 40;
        const padding = 60;
        let currentX = padding;
        let currentY = padding;
        const rowHeight = 140;
        const gapX = 40;

        let tableCounter = 1;

        paxList.forEach((p, index) => {
            let totalPax = (p.adultos || 0) + (p.ninos || 0);

            // SPLITTING LOGIC
            // If > 12 -> Split into clusters of Round(10) or Rect(12)
            // User complained about 447 pax. Split into 10s.

            if (totalPax > 12) {
                // Split Mode
                const unitSize = 10;
                let subIndex = 1;

                while (totalPax > 0) {
                    const capacity = 10;
                    // Current allocation for this table: just fill it
                    const allocated = Math.min(totalPax, capacity);

                    let type = "round";
                    let width = 80;

                    // Layout Check
                    if (currentX + width + padding > availableWidth) {
                        currentX = padding;
                        currentY += rowHeight;
                    }

                    const t = {
                        id: "gen_" + tableCounter + "_" + subIndex + "_" + Date.now(),
                        type: type,
                        x: currentX,
                        y: currentY,
                        label: `${tableCounter}.${subIndex}`,
                        seats: capacity, // Max capacity
                        assignment: p.id, // Linked to same participant
                        // No custom width, standard tables
                    };

                    mapTables.push(t);

                    currentX += width + gapX;
                    totalPax -= allocated;
                    subIndex++;
                }
                tableCounter++;

            } else {
                // Standard Single Table
                let type = "round";
                let seats = totalPax;
                let width = 80;

                if (totalPax <= 4) { type = "square"; width = 60; seats = Math.max(4, seats); }
                else if (totalPax <= 10) { type = "round"; width = 80; seats = Math.max(10, seats); }
                else { type = "rect"; width = 120; seats = 12; } // 11-12 pax

                if (currentX + width + padding > availableWidth) {
                    currentX = padding;
                    currentY += rowHeight;
                }

                const t = {
                    id: "gen_" + tableCounter + "_" + Date.now(),
                    type: type,
                    x: currentX,
                    y: currentY,
                    label: tableCounter.toString(),
                    seats: seats,
                    assignment: p.id
                };
                mapTables.push(t);
                currentX += width + gapX;
                tableCounter++;
            }
        });

        refreshAll();
    }

})();
