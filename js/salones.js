// js/salones.js
(function () {
    const {
        getCurrentHotel,
        getWeekDates,
        toIsoDate,
        formatDayHeader,
        formatDateES
    } = window.MesaChef;

    const hotelId = getCurrentHotel();

    const state = {
        baseDate: new Date(),
        salonesConfig: [], // Se cargará de master_data/CONFIG_SALONES
        eventos: [],
        filtroTexto: "",
        editingId: null
    };

    // --- DOM Elements ---
    const tituloHotel = document.getElementById("tituloHotel");
    const estadoConexion = document.getElementById("estadoConexion");
    const lblSemana = document.getElementById("lblSemana");
    const btnPrev = document.getElementById("btnPrev");
    const btnNext = document.getElementById("btnNext");
    const inputSemana = document.getElementById("inputSemana");
    const txtBuscar = document.getElementById("txtBuscar");
    const grid = document.getElementById("gridSalones");

    // Modal elements
    const btnNuevoEvento = document.getElementById("btnNuevoEvento");
    const modalEvento = document.getElementById("modalEvento");
    const formEvento = document.getElementById("formEvento");
    const tituloModalEvento = document.getElementById("tituloModalEvento");
    const btnCancelarEvento = document.getElementById("btnCancelarEvento");
    const btnCerrarModal = document.getElementById("btnCerrarModal");

    // Form Fields
    const campoSalon = document.getElementById("campoSalon");
    const campoFechaInicio = document.getElementById("campoFechaInicio");
    const campoFechaFin = document.getElementById("campoFechaFin");
    const campoNombre = document.getElementById("campoNombre"); // Nombre del evento/cliente
    const campoTipoMontaje = document.getElementById("campoTipoMontaje");
    const campoPax = document.getElementById("campoPax");
    const campoPrecio = document.getElementById("campoPrecio");
    const campoNotas = document.getElementById("campoNotas");
    const campoEstado = document.getElementById("campoEstado");

    // --- Helpers UI ---
    function nombreHotelCompleto(id) {
        if (id === "Guadiana") return "Sercotel Guadiana";
        if (id === "Cumbria") return "Cumbria Spa&Hotel";
        return id || "Hotel";
    }

    function actualizarEstadoConexion(status) {
        if (!estadoConexion) return;
        estadoConexion.className = "estado-conexion"; // reset
        if (status === "ok") {
            estadoConexion.classList.add("estado-ok");
            estadoConexion.textContent = "Conectado";
        } else if (status === "error") {
            estadoConexion.classList.add("estado-error");
            estadoConexion.textContent = "Sin conexión";
        } else {
            estadoConexion.textContent = "Cargando...";
            estadoConexion.style.backgroundColor = "#fff3cd";
            estadoConexion.style.color = "#856404";
        }
    }

    if (tituloHotel) {
        tituloHotel.textContent = `Salones · ${nombreHotelCompleto(hotelId)}`;
    }

    // --- Firestore References ---
    const docConfig = db.collection("master_data").doc("CONFIG_SALONES");
    const colEventos = db.collection("eventos");

    // --- 1. Cargar Configuración de Salones ---
    function cargarConfiguracion() {
        actualizarEstadoConexion("pending");
        docConfig
            .get()
            .then((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    // data[hotelId] es el array de objetos { name, active, ... }
                    const rawSalones = data[hotelId] || [];
                    // Filtramos solo los activos
                    state.salonesConfig = rawSalones.filter((s) => s.active !== false);

                    // Llenar el select del modal con los salones disponibles
                    llenarSelectSalones();

                    // Ahora que tenemos la config, renderizamos (aunque no haya eventos aún)
                    render();

                    // Iniciamos la escucha de eventos
                    escucharEventos();
                } else {
                    console.warn("No existe CONFIG_SALONES en master_data");
                    actualizarEstadoConexion("error");
                }
            })
            .catch((err) => {
                console.error("Error cargando config salones:", err);
                actualizarEstadoConexion("error");
            });
    }

    function llenarSelectSalones() {
        if (!campoSalon) return;
        campoSalon.innerHTML = "";
        state.salonesConfig.forEach(s => {
            const opt = document.createElement("option");
            opt.value = s.name;
            opt.textContent = s.name;
            campoSalon.appendChild(opt);
        });
    }

    // --- 2. Escuchar Eventos ---
    function escucharEventos() {
        colEventos
            .where("hotel", "==", hotelId)
            .onSnapshot(
                (snap) => {
                    actualizarEstadoConexion("ok");
                    state.eventos = [];
                    snap.forEach((d) => {
                        state.eventos.push({ id: d.id, ...d.data() });
                    });
                    render();
                },
                (err) => {
                    console.error("Error escuchando eventos:", err);
                    actualizarEstadoConexion("error");
                }
            );
    }

    // --- 3. Render Planning ---
    function render() {
        if (!grid) return;

        const days = getWeekDates(state.baseDate);
        // Actualizar input fecha y label
        if (inputSemana) inputSemana.value = toIsoDate(state.baseDate);
        if (lblSemana) {
            lblSemana.textContent = `${formatDateES(days[0])} → ${formatDateES(days[6])}`;
        }

        let html = `<div class="planning-grid">`;

        // HEADER GRID
        html += `<div class="planning-header">
               <div class="planning-header-cell">SALÓN</div>`;
        days.forEach((d) => {
            html += `<div class="planning-header-cell">${formatDayHeader(d)}</div>`;
        });
        html += `</div>`; // fin header

        // FILAS (Salones)
        if (state.salonesConfig.length === 0) {
            html += `<div style="padding:20px; text-align:center; color:#666;">
                 No hay salones configurados para ${hotelId}. 
                 Revisa el panel de Admin.
               </div>`;
        } else {
            state.salonesConfig.forEach((salon) => {
                html += `<div class="planning-row">`;
                // Nombre del salón
                html += `<div class="planning-row-label">${salon.name}</div>`;

                // Celdas por día
                days.forEach((d) => {
                    const isoDate = toIsoDate(d);

                    // Filtrar eventos para este salón y día
                    // Nota: Un evento puede durar varios días. 
                    // Aquí simplificamos: mostramos si fechaInicio <= hoy <= fechaFin
                    // O si el usuario prefiere "fecha" única. El prompt dice "fechaInicio, fechaFin".
                    // Asumiremos que se muestran en el día si hay solapamiento.

                    const eventosDia = state.eventos.filter((ev) => {
                        // Filtrar por salón
                        if (ev.salon !== salon.name) return false;

                        // Checkeo de fechas
                        const start = ev.fechaInicio ? ev.fechaInicio.slice(0, 10) : "";
                        const end = ev.fechaFin ? ev.fechaFin.slice(0, 10) : start;

                        // Si el día actual (isoDate) está dentro del rango [start, end]
                        return (isoDate >= start && isoDate <= end);
                    });

                    // Aplicar filtro de texto si existe
                    const eventosFiltrados = eventosDia.filter(ev => {
                        if (!state.filtroTexto) return true;
                        const haystack = ((ev.nombre || "") + " " + (ev.notas || "")).toLowerCase();
                        return haystack.includes(state.filtroTexto);
                    });

                    html += `<div class="planning-cell cell-dia">`;

                    if (eventosFiltrados.length === 0) {
                        html += `<div class="slot-vacio"></div>`;
                    } else {
                        // Pintar tarjetas
                        eventosFiltrados.forEach(ev => {
                            let estadoClass = "reserva-pendiente";
                            if (ev.estado === "confirmada") estadoClass = "reserva-confirmada";
                            if (ev.estado === "anulada") estadoClass = "reserva-anulada"; // Usa CSS existente

                            // Info a mostrar
                            const pax = ev.pax ? `(${ev.pax} pax)` : "";
                            const montaje = ev.montaje ? `· ${ev.montaje}` : "";

                            html += `
                 <div class="reserva-card ${estadoClass}" data-id="${ev.id}">
                    <div class="reserva-row1">
                       <span class="reserva-hora">${ev.turno || ""}</span>
                       <span class="reserva-pax">${pax}</span>
                    </div>
                    <div class="reserva-nombre">${ev.nombre || "Evento"}</div>
                    <div class="reserva-row3" style="font-size:11px; color:#555;">
                       ${montaje}
                    </div>
                 </div>
                 `;
                        });
                    }

                    html += `</div>`;
                });
                html += `</div>`; // fin row
            });
        }

        html += `</div>`; // planning-grid
        grid.innerHTML = html;
    }

    // --- 4. Event handlers (Click, Modals) ---

    // Navegación Fechas
    if (btnPrev) {
        btnPrev.addEventListener("click", () => {
            const d = new Date(state.baseDate);
            d.setDate(d.getDate() - 7);
            state.baseDate = d;
            render();
        });
    }
    if (btnNext) {
        btnNext.addEventListener("click", () => {
            const d = new Date(state.baseDate);
            d.setDate(d.getDate() + 7);
            state.baseDate = d;
            render();
        });
    }
    if (inputSemana) {
        inputSemana.addEventListener("change", () => {
            const v = inputSemana.value;
            if (v) {
                state.baseDate = new Date(v + "T00:00:00");
                render();
            }
        });
    }

    // Buscador
    if (txtBuscar) {
        txtBuscar.addEventListener("input", () => {
            state.filtroTexto = txtBuscar.value.toLowerCase();
            render();
        });
    }

    // MODAL FUNCIONES
    function abrirModal(evento = null) {
        modalEvento.classList.remove("hidden");

        if (evento) {
            state.editingId = evento.id;
            tituloModalEvento.textContent = "Editar Evento";
            // Rellenar campos
            campoSalon.value = evento.salon || "";
            campoFechaInicio.value = evento.fechaInicio || "";
            campoFechaFin.value = evento.fechaFin || evento.fechaInicio || "";
            campoNombre.value = evento.nombre || "";
            campoTipoMontaje.value = evento.montaje || "Escuela";
            campoPax.value = evento.pax || "";
            campoPrecio.value = evento.precio || "";
            campoNotas.value = evento.notas || "";
            campoEstado.value = evento.estado || "pendiente";
        } else {
            state.editingId = null;
            tituloModalEvento.textContent = "Nuevo Evento";
            // Reset campos
            // Default salón al primero
            if (state.salonesConfig.length > 0) campoSalon.value = state.salonesConfig[0].name;

            // Fecha por defecto: hoy
            const hoy = toIsoDate(new Date());
            campoFechaInicio.value = hoy;
            campoFechaFin.value = hoy;

            campoNombre.value = "";
            campoTipoMontaje.value = "Escuela";
            campoPax.value = "";
            campoPrecio.value = "";
            campoNotas.value = "";
            campoEstado.value = "pendiente";
        }
    }

    function cerrarModal() {
        modalEvento.classList.add("hidden");
    }

    if (btnNuevoEvento) btnNuevoEvento.addEventListener("click", () => abrirModal(null));
    if (btnCancelarEvento) btnCancelarEvento.addEventListener("click", cerrarModal);
    if (btnCerrarModal) btnCerrarModal.addEventListener("click", cerrarModal);
    if (modalEvento) {
        modalEvento.addEventListener("click", (e) => {
            if (e.target === modalEvento) cerrarModal();
        });
    }

    // Click en carta de evento para editar
    if (grid) {
        grid.addEventListener("click", (e) => {
            const card = e.target.closest(".reserva-card");
            if (card) {
                const id = card.dataset.id;
                const ev = state.eventos.find(x => x.id === id);
                if (ev) abrirModal(ev);
            }
        });
    }

    // Guardar (Submit)
    if (formEvento) {
        formEvento.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (!campoFechaInicio.value || !campoNombre.value) {
                alert("Por favor completa Fecha Inicio y Nombre.");
                return;
            }

            const payload = {
                hotel: hotelId,
                salon: campoSalon.value,
                fechaInicio: campoFechaInicio.value,
                fechaFin: campoFechaFin.value || campoFechaInicio.value,
                nombre: campoNombre.value.trim(),
                montaje: campoTipoMontaje.value,
                pax: parseInt(campoPax.value) || 0,
                precio: parseFloat(campoPrecio.value) || 0,
                notas: campoNotas.value.trim(),
                estado: campoEstado.value,
                turno: "", // Opcional, si quieres meter mañana/tarde
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            try {
                if (state.editingId) {
                    await colEventos.doc(state.editingId).update(payload);
                } else {
                    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    await colEventos.add(payload);
                }
                cerrarModal();
            } catch (err) {
                console.error("Error guardando evento:", err);
                alert("Hubo un error al guardar. Revisa la consola o permisos.");
            }
        });
    }

    // INIT
    cargarConfiguracion();

})();
