// js/restaurante.js
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
    reservas: [],
    filtroTexto: "",
    filtroEstado: "activos", // "activos", "confirmada", "pendiente", "anulada", "todas"
    editingId: null
  };

  // --- DOM ---
  const tituloHotel = document.getElementById("tituloHotel");
  const estadoConexion = document.getElementById("estadoConexion");
  const lblSemana = document.getElementById("lblSemana");
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const inputSemana = document.getElementById("inputSemana");
  const txtBuscar = document.getElementById("txtBuscar");
  const filtroEstado = document.getElementById("filtroEstado");
  const grid = document.getElementById("gridRestaurante");

  const btnNuevaReserva = document.getElementById("btnNuevaReserva");
  const modalReserva = document.getElementById("modalReserva");
  const formReserva = document.getElementById("formReserva");
  const tituloModalReserva = document.getElementById("tituloModalReserva");

  // Campos Modal
  const campoEspacio = document.getElementById("campoEspacio");
  const campoFecha = document.getElementById("campoFecha");
  const campoHora = document.getElementById("campoHora");
  const campoNombre = document.getElementById("campoNombre");
  const campoTelefono = document.getElementById("campoTelefono");
  const campoPax = document.getElementById("campoPax");
  const campoTurno = document.getElementById("campoTurno");
  const campoPrecio = document.getElementById("campoPrecio");
  const campoNotas = document.getElementById("campoNotas");
  const campoNotaCliente = document.getElementById("campoNotaCliente");
  const campoEstado = document.getElementById("campoEstado");

  const btnCancelarReserva = document.getElementById("btnCancelarReserva");
  const btnCerrarModal = document.getElementById("btnCerrarModal");

  // --- Utils ---

  function getLogoPath(id) {
    if (id === "Guadiana") return "Img/logo-guadiana.svg";
    if (id === "Cumbria") return "Img/logo-cumbria.svg";
    return "";
  }

  function nombreHotelCompleto(id) {
    if (id === "Guadiana") return "Sercotel Guadiana";
    if (id === "Cumbria") return "Cumbria Spa&Hotel";
    return id || "Hotel";
  }

  function actualizarEstadoConexion(estado) {
    if (!estadoConexion) return;
    estadoConexion.className = "estado-conexion";
    // Reset classes
    estadoConexion.classList.remove("estado-ok", "estado-error");

    if (estado === "ok") {
      estadoConexion.classList.add("estado-ok");
      estadoConexion.textContent = "Conectado";
    } else if (estado === "error") {
      estadoConexion.classList.add("estado-error");
      estadoConexion.textContent = "Sin conexión";
    } else {
      estadoConexion.textContent = "Cargando...";
    }
  }

  // Header Logic (Logo + Title)
  if (tituloHotel) {
    const logo = getLogoPath(hotelId);
    // Usamos innerHTML para meter imagen
    tituloHotel.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
           ${logo ? `<img src="${logo}" style="height:24px; width:auto;" alt="Logo" />` : ''}
           <span>Restaurante · ${nombreHotelCompleto(hotelId)}</span>
        </div>
      `;
  }

  // --- Normalización ---
  function normalizarTurno(v) {
    const s = String(v || "").toLowerCase();
    if (s.includes("cena")) return "cena";
    return "almuerzo";
  }

  function normalizarEstado(v) {
    const s = String(v || "").toLowerCase();
    if (s.includes("anul")) return "anulada";
    if (s.includes("conf")) return "confirmada";
    return "pendiente";
  }

  // --- Firestore ---
  const colReservas = db.collection("reservas_restaurante");

  function initListener() {
    actualizarEstadoConexion("pending");
    colReservas.where("hotelId", "==", hotelId).onSnapshot(
      (snap) => {
        state.reservas = [];
        snap.forEach((d) => {
          state.reservas.push({ id: d.id, ...d.data() });
        });
        actualizarEstadoConexion("ok");
        render();
      },
      (err) => {
        console.error("Error reserva:", err);
        actualizarEstadoConexion("error");
      }
    );
  }

  initListener();

  // --- Render ---
  function render() {
    if (!grid) return;

    // 1. Setup fechas
    const days = getWeekDates(state.baseDate);
    if (lblSemana) lblSemana.textContent = `${formatDateES(days[0])} → ${formatDateES(days[6])}`;
    if (inputSemana) inputSemana.value = toIsoDate(state.baseDate);

    // 2. Filtrado global (texto, estado)
    const filteredGlobal = state.reservas.filter((r) => {
      // Filtro Texto
      if (state.filtroTexto) {
        const text = ((r.nombre || "") + " " + (r.notas || "")).toLowerCase();
        if (!text.includes(state.filtroTexto)) return false;
      }
      // Filtro Estado
      const est = normalizarEstado(r.estado);
      if (state.filtroEstado === "activos" && est === "anulada") return false;
      if (state.filtroEstado === "confirmada" && est !== "confirmada") return false;
      if (state.filtroEstado === "pendiente" && est !== "pendiente") return false;
      if (state.filtroEstado === "anulada" && est !== "anulada") return false;
      return true;
    });

    let html = `<div class="planning-grid">`;

    // Header Layout: [Espacio] [D1] [D2] ...
    html += `<div class="planning-header">
               <div class="planning-header-cell">ESPACIO</div>`;
    days.forEach((d) => {
      html += `<div class="planning-header-cell">${formatDayHeader(d)}</div>`;
    });
    html += `</div>`;

    // Rows (Restaurante, Cafeteria)
    const espacios = [
      { id: "restaurante", label: "Restaurante" },
      { id: "cafeteria", label: "Cafetería" }
    ];

    espacios.forEach((esp) => {
      html += `<div class="planning-row">`;
      html += `<div class="planning-row-label">${esp.label}</div>`; // Columna 1

      days.forEach((d) => {
        const isoDate = toIsoDate(d);

        // Reservas de este espacio y día
        const dayRes = filteredGlobal.filter((r) => {
          if ((r.espacioId || "restaurante") !== esp.id) return false;
          // Manejo de fecha string vs timestamp
          let fDoc = "";
          if (r.fecha && r.fecha.toDate) fDoc = toIsoDate(r.fecha.toDate());
          else fDoc = (r.fecha || "").slice(0, 10);
          return fDoc === isoDate;
        });

        html += `<div class="planning-cell cell-dia">
                   <div class="planning-cell-inner">`;

        // Turnos: Almuerzo y Cena
        ["almuerzo", "cena"].forEach(turno => {
          // Filtrar por turno
          const turnRes = dayRes.filter(r => normalizarTurno(r.turno) === turno);

          // Ordenar por hora
          turnRes.sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));

          // Totales
          const totalPax = turnRes.filter(r => normalizarEstado(r.estado) !== "anulada")
            .reduce((acc, curr) => acc + (parseInt(curr.pax) || 0), 0);

          const icon = turno === "almuerzo" ? "☀️" : "🌙"; // Sol / Luna

          const hasClass = turnRes.length > 0 ? "has-items" : "";

          html += `<div class="turn-slot ${hasClass}">
                      <div class="turn-slot-header">
                          <span class="turn-slot-icon" title="${turno}">${icon}</span>
                          ${totalPax > 0 ? `<span class="turn-slot-pax">${totalPax} pax</span>` : ''}
                      </div>`;

          // Render cartas
          turnRes.forEach(r => {
            const st = normalizarEstado(r.estado);
            const stClass = `status-${st}`;
            const hasNotes = r.notas && r.notas.trim().length > 0;

            html += `
               <div class="reserva-card ${stClass}" data-id="${r.id}">
                  <div class="reserva-top">
                     <span class="reserva-time">${r.hora || "--:--"}</span>
                     <div style="display:flex; align-items:center; gap:4px; overflow:hidden;">
                        ${hasNotes ? '<span title="Tiene notas internas">📝</span>' : ''}
                        <span class="reserva-name">${r.nombre || "Sin Nombre"}</span>
                     </div>
                  </div>
                  <div class="reserva-meta">
                     <span>${r.pax || 0} pax</span>
                     <span>${r.precioPorPersona ? r.precioPorPersona + ' €' : ''}</span>
                  </div>
               </div>
               `;
          });

          html += `</div>`; // fin turn-slot
        });

        html += `   </div>
                 </div>`; // fin cell
      });

      html += `</div>`; // fin row
    });

    html += `</div>`;
    grid.innerHTML = html;
  }

  // --- Handlers ---
  if (btnPrev) btnPrev.addEventListener("click", () => {
    const d = new Date(state.baseDate);
    d.setDate(d.getDate() - 7);
    state.baseDate = d;
    render();
  });
  if (btnNext) btnNext.addEventListener("click", () => {
    const d = new Date(state.baseDate);
    d.setDate(d.getDate() + 7);
    state.baseDate = d;
    render();
  });
  if (inputSemana) inputSemana.addEventListener("change", () => {
    if (inputSemana.value) {
      state.baseDate = new Date(inputSemana.value + "T00:00:00");
      render();
    }
  });

  if (txtBuscar) txtBuscar.addEventListener("input", () => {
    state.filtroTexto = txtBuscar.value.toLowerCase();
    render();
  });

  if (filtroEstado) filtroEstado.addEventListener("change", () => {
    state.filtroEstado = filtroEstado.value;
    render();
  });

  // --- Modal Logic ---
  function abrirModal(r = null) {
    modalReserva.classList.remove("hidden");
    if (r) {
      state.editingId = r.id;
      tituloModalReserva.textContent = r.nombre || "Editar Reserva";
      campoEspacio.value = r.espacioId || "restaurante";
      campoFecha.value = r.fecha || "";
      campoHora.value = r.hora || "";
      campoNombre.value = r.nombre || "";
      campoTelefono.value = r.telefono || "";
      campoPax.value = r.pax || "";
      campoTurno.value = normalizarTurno(r.turno);
      campoPrecio.value = r.precioPorPersona || "";
      campoNotas.value = r.notas || "";
      campoEstado.value = normalizarEstado(r.estado);
      if (campoNotaCliente) campoNotaCliente.value = "";
    } else {
      state.editingId = null;
      tituloModalReserva.textContent = "Nueva Reserva";
      campoEspacio.value = "restaurante";
      campoFecha.value = inputSemana.value || toIsoDate(new Date());
      campoHora.value = "";
      campoNombre.value = "";
      campoTelefono.value = "";
      campoPax.value = "";
      campoTurno.value = "almuerzo";
      campoPrecio.value = "";
      campoNotas.value = "";
      campoEstado.value = "pendiente";
      if (campoNotaCliente) campoNotaCliente.value = "";
    }
  }

  function cerrarModal() {
    modalReserva.classList.add("hidden");
  }

  if (btnNuevaReserva) btnNuevaReserva.addEventListener("click", () => abrirModal(null));
  if (btnCerrarModal) btnCerrarModal.addEventListener("click", cerrarModal);
  if (btnCancelarReserva) btnCancelarReserva.addEventListener("click", cerrarModal);
  if (modalReserva) modalReserva.addEventListener("click", e => { if (e.target === modalReserva) cerrarModal(); });

  // Click Grid
  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".reserva-card");
    if (card && card.dataset.id) {
      const r = state.reservas.find(x => x.id === card.dataset.id);
      if (r) abrirModal(r);
    }
  });

  // Submit
  formReserva.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!campoNombre.value || !campoFecha.value) return;

    const payload = {
      hotelId,
      espacioId: campoEspacio.value,
      fecha: campoFecha.value,
      hora: campoHora.value,
      nombre: campoNombre.value.trim(),
      telefono: campoTelefono.value.trim(),
      pax: parseInt(campoPax.value) || 0,
      turno: campoTurno.value,
      precioPorPersona: parseFloat(campoPrecio.value) || 0,
      importeTotal: (parseInt(campoPax.value) || 0) * (parseFloat(campoPrecio.value) || 0),
      notas: campoNotas.value.trim(),
      estado: campoEstado.value,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      if (state.editingId) {
        await colReservas.doc(state.editingId).update(payload);
      } else {
        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await colReservas.add(payload);
      }
      cerrarModal();
    } catch (err) {
      console.error("Error save", err);
      alert("Error al guardar reserva");
    }
  });

})();
