// app.js – Planning MesaChef (común a TODOS los módulos)
//
// Cada HTML debe definir ANTES:
//
//   window.colReservas          -> colección Firestore de ese módulo
//   window.hotelId              -> id de hotel para el where("hotelId", "==", hotelId)
//   window.mesaChefEspacio      -> texto 1ª columna (Restaurante / Salón / Terraza...)
//   window.mesaChefModuloNombre -> nombre del módulo (Restaurante / Salones / Presupuestos...)
//   window.mesaChefHotelNombre  -> nombre del hotel (Sercotel Guadiana / Cumbria Spa&Hotel...)

(function () {
  "use strict";

  const ESPACIO_LABEL = window.mesaChefEspacio || "Restaurante";
  const MODULO_NOMBRE = window.mesaChefModuloNombre || "Restaurante";
  const HOTEL_NOMBRE = window.mesaChefHotelNombre || "Sercotel Guadiana";

  const state = {
    reservas: [],
    fechaBase: hoySinHora(),
  };

  let unsubscribeReservas = null;
  let toastTimeout = null;

  const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const MESES = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];

  document.addEventListener("DOMContentLoaded", init);

  // ====================== INIT ==================================

  function init() {
    initTopbarLabels();
    initFechaToolbar();
    initInteraccionesPlanning();
    initModalReserva();
    escucharReservas();
    render();
  }

  function initTopbarLabels() {
    const spanModulo = document.getElementById("topbarModulo");
    if (spanModulo) {
      spanModulo.textContent = `${MODULO_NOMBRE} · ${HOTEL_NOMBRE}`;
    }
  }

  // ====================== UTILIDADES ============================

  function hoySinHora() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function formatIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatShortDate(date) {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  }

  function parseISODate(str) {
    if (!str) return null;
    const d = new Date(str + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }

  function formatCabeceraDia(date) {
    return `${DIAS[date.getDay()]} ${date.getDate()} ${
      MESES[date.getMonth()]
    }`;
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function mostrarToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) {
      alert(msg);
      return;
    }
    toast.textContent = msg;
    toast.classList.remove("hidden");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.add("hidden"), 2200);
  }

  function toNumber(value) {
    if (value == null || value === "") return NaN;
    return Number(String(value).replace(",", "."));
  }

  // ====================== CONEXIÓN ==============================

  if (typeof window.actualizarEstadoConexion !== "function") {
    window.actualizarEstadoConexion = function (estado) {
      const badge = document.getElementById("estadoConexion");
      if (!badge) return;
      badge.classList.remove("estado-ok", "estado-error", "estado-pendiente");

      switch (estado) {
        case "ok":
          badge.textContent = "Conectado";
          badge.classList.add("estado-ok");
          break;
        case "error":
          badge.textContent = "Error de conexión";
          badge.classList.add("estado-error");
          break;
        default:
          badge.textContent = "Conectando…";
          badge.classList.add("estado-pendiente");
      }
    };
  }

  function escucharReservas() {
    if (unsubscribeReservas) {
      unsubscribeReservas();
      unsubscribeReservas = null;
    }

    if (!window.colReservas) {
      console.warn(
        "[MesaChef] colReservas no está definido. Inicializa Firestore antes de app.js"
      );
      window.actualizarEstadoConexion("error");
      return;
    }

    if (!window.hotelId) {
      console.warn(
        "[MesaChef] hotelId no está definido. Asigna window.hotelId antes de app.js"
      );
      window.actualizarEstadoConexion("error");
      return;
    }

    unsubscribeReservas = window.colReservas
      .where("hotelId", "==", window.hotelId)
      .onSnapshot(
        (snap) => {
          state.reservas = [];
          snap.forEach((d) => state.reservas.push({ id: d.id, ...d.data() }));
          window.actualizarEstadoConexion("ok");
          render();
        },
        (err) => {
          console.error("Error al escuchar reservas", err);
          window.actualizarEstadoConexion("error");
        }
      );
  }

  // ====================== FECHA TOOLBAR =========================

  function initFechaToolbar() {
    const inputFecha = document.getElementById("inputFechaBase");
    const btnPrev = document.getElementById("btnSemanaPrev");
    const btnNext = document.getElementById("btnSemanaNext");
    const labelSemana = document.getElementById("labelRangoSemana");

    if (inputFecha) {
      inputFecha.value = formatIsoDate(state.fechaBase);
      inputFecha.addEventListener("change", (ev) => {
        const d = parseISODate(ev.target.value);
        if (!d) return;
        state.fechaBase = d;
        actualizarLabelSemana(labelSemana);
        render();
      });
    }

    if (btnPrev) {
      btnPrev.addEventListener("click", () => {
        state.fechaBase = addDays(state.fechaBase, -7);
        if (inputFecha) inputFecha.value = formatIsoDate(state.fechaBase);
        actualizarLabelSemana(labelSemana);
        render();
      });
    }

    if (btnNext) {
      btnNext.addEventListener("click", () => {
        state.fechaBase = addDays(state.fechaBase, 7);
        if (inputFecha) inputFecha.value = formatIsoDate(state.fechaBase);
        actualizarLabelSemana(labelSemana);
        render();
      });
    }

    actualizarLabelSemana(labelSemana);
  }

  function actualizarLabelSemana(labelSemana) {
    if (!labelSemana) return;
    const monday = getMonday(state.fechaBase);
    const sunday = addDays(monday, 6);
    labelSemana.textContent = `${formatIsoDate(monday)} → ${formatIsoDate(
      sunday
    )}`;
  }

  // ====================== RENDER GLOBAL ========================

  function render() {
    const monday = getMonday(state.fechaBase);
    const diasSemana = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      diasSemana.push({
        date: d,
        key: formatIsoDate(d),
        label: formatCabeceraDia(d),
      });
    }

    const sunday = addDays(monday, 6);
    const reservasPorDia = {};
    diasSemana.forEach((d) => (reservasPorDia[d.key] = []));
    state.reservas.forEach((r) => {
      const key = r.fecha || r.dia || r.fechaISO;
      if (key && reservasPorDia[key]) reservasPorDia[key].push(r);
    });

    renderResumenDiario(diasSemana, reservasPorDia, monday, sunday);
    renderPlanning(diasSemana, reservasPorDia);
  }

  // ====================== RESUMEN DIARIO =======================

  function normalizarServicio(raw) {
    const s = String(raw || "").toLowerCase();
    if (s.includes("alm")) return "Almuerzo";
    if (s.includes("cen")) return "Cena";
    return "Otro";
  }

  function calcularTotalesDia(lista) {
    const totales = {
      Almuerzo: { pax: 0, importe: 0 },
      Cena: { pax: 0, importe: 0 },
      Otro: { pax: 0, importe: 0 },
    };

    lista.forEach((r) => {
      const key = normalizarServicio(r.servicio || r.turno);
      const bucket = totales[key];

      const pax = toNumber(
        r.pax != null ? r.pax : r.personas != null ? r.personas : null
      );
      if (!isNaN(pax)) bucket.pax += pax;

      const importe = toNumber(
        r.importe != null ? r.importe : r.total != null ? r.total : null
      );
      if (!isNaN(importe)) bucket.importe += importe;
    });

    return totales;
  }

  function chipResumenHtml(label, icono, data) {
    const pax = data.pax || 0;
    const importe = data.importe || 0;
    return `
      <div class="resumen-chip">
        <span class="resumen-chip-label">${icono} ${escapeHtml(label)}:</span>
        <span class="resumen-chip-data">${pax} pax · ${importe.toFixed(
          2
        )} €</span>
      </div>
    `;
  }

  function renderResumenDiario(diasSemana, reservasPorDia, monday, sunday) {
    const wrapper = document.getElementById("resumenDiarioWrapper");
    const labelRango = document.getElementById("labelTotalesSemana");
    if (!wrapper) return;

    if (labelRango) {
      labelRango.textContent = `(${formatShortDate(
        monday
      )} – ${formatShortDate(sunday)})`;
    }

    let html = "";
    diasSemana.forEach((d) => {
      const lista = reservasPorDia[d.key] || [];
      const tot = calcularTotalesDia(lista);

      html += `
        <article class="resumen-dia-card">
          <div class="resumen-dia-fecha">${escapeHtml(
            formatShortDate(d.date)
          )}</div>
          <div class="resumen-dia-servicios">
            ${chipResumenHtml("Almuerzo", "☀️", tot.Almuerzo)}
            ${chipResumenHtml("Cena", "🌙", tot.Cena)}
            ${
              tot.Otro.pax || tot.Otro.importe
                ? chipResumenHtml("Otros", "•", tot.Otro)
                : ""
            }
          </div>
        </article>
      `;
    });

    wrapper.innerHTML = html;
  }

  // ====================== PLANNING (GRID) ======================

  function renderPlanning(diasSemana, reservasPorDia) {
    const grid = document.getElementById("gridPlanning");
    if (!grid) return;

    let html = "";

    // Fila cabecera
    html += '<div class="planning-row planning-row-header">';
    html += `<div class="planning-header-cell planning-col-espacio">${escapeHtml(
      ESPACIO_LABEL
    )}</div>`;
    for (const d of diasSemana) {
      html += `<div class="planning-header-cell planning-dia-header">${escapeHtml(
        d.label
      )}</div>`;
    }
    html += "</div>";

    // Fila única
    html += '<div class="planning-row">';
    html += `<div class="planning-cell planning-col-espacio">${escapeHtml(
      ESPACIO_LABEL
    )}</div>`;

    for (const d of diasSemana) {
      const lista = reservasPorDia[d.key] || [];
      html += `<div class="planning-cell planning-dia" data-action="nueva-en-celda" data-fecha="${d.key}">`;

      if (!lista.length) {
        html += '<div class="planning-dia-empty">—</div>';
      } else {
        lista
          .slice()
          .sort((a, b) => (a.hora || "").localeCompare(b.hora || ""))
          .forEach((r) => {
            html += tarjetaReservaHtml(r);
          });
      }

      html += "</div>";
    }

    html += "</div>"; // fin fila

    grid.innerHTML = html;
  }

  function tarjetaReservaHtml(reserva) {
    const id = reserva.id || "";
    const hora = reserva.hora || "";
    const nombre = reserva.nombre || reserva.titulo || "";
    const servicio = reserva.servicio || reserva.turno || "";
    const pax =
      reserva.pax != null
        ? `${reserva.pax} pax`
        : reserva.personas != null
        ? `${reserva.personas} pax`
        : "";
    const importe =
      reserva.importe != null
        ? `${Number(reserva.importe).toFixed(2)} €`
        : reserva.total != null
        ? `${Number(reserva.total).toFixed(2)} €`
        : "";
    const estado = reserva.estado || reserva.status || "";

    return `
      <article class="reserva-card" data-action="abrir-reserva" data-id-reserva="${id}">
        <header class="reserva-card-top">
          <span class="reserva-hora">${escapeHtml(hora)}</span>
          ${
            pax
              ? `<span class="reserva-pax">${escapeHtml(pax)}</span>`
              : ""
          }
        </header>
        <div class="reserva-card-body">
          <div class="reserva-nombre">${escapeHtml(nombre)}</div>
        </div>
        <footer class="reserva-card-footer">
          ${
            servicio
              ? `<span class="badge badge-servicio">${escapeHtml(
                  servicio
                )}</span>`
              : ""
          }
          ${
            estado
              ? `<span class="badge badge-estado">${escapeHtml(
                  estado
                )}</span>`
              : ""
          }
          ${
            importe
              ? `<span class="reserva-importe">${escapeHtml(
                  importe
                )}</span>`
              : ""
          }
        </footer>
      </article>
    `;
  }

  // ====================== INTERACCIÓN GRID ======================

  function initInteraccionesPlanning() {
    const grid = document.getElementById("gridPlanning");
    const btnNueva = document.getElementById("btnNuevaReserva");

    if (btnNueva) {
      btnNueva.addEventListener("click", () => {
        abrirModalReserva({ modo: "alta" });
      });
    }

    if (!grid) return;

    grid.addEventListener("click", (ev) => {
      const card = ev.target.closest("[data-action='abrir-reserva']");
      if (card) {
        const id = card.dataset.idReserva;
        const reserva = state.reservas.find((r) => r.id === id);
        if (reserva) abrirModalReserva({ modo: "editar", reserva });
        return;
      }

      const celda = ev.target.closest("[data-action='nueva-en-celda']");
      if (celda) {
        const fecha = celda.dataset.fecha;
        abrirModalReserva({ modo: "alta", fecha });
      }
    });
  }

  // ====================== MODAL RESERVA =========================

  function initModalReserva() {
    const overlay = document.getElementById("modalReserva");
    if (!overlay) return;

    const btnCerrar = document.getElementById("btnCerrarModal");
    const btnCancelar = document.getElementById("btnCancelarModal");
    const form = document.getElementById("formReserva");

    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) cerrarModalReserva();
    });

    if (btnCerrar) btnCerrar.addEventListener("click", cerrarModalReserva);
    if (btnCancelar) btnCancelar.addEventListener("click", cerrarModalReserva);

    if (form) {
      form.addEventListener("submit", onSubmitFormReserva);
    }
  }

  function abrirModalReserva(opts) {
    const { modo = "alta", reserva, fecha } = opts || {};

    const overlay = document.getElementById("modalReserva");
    if (!overlay) return;

    const titulo = document.getElementById("tituloModalReserva");
    const inpId = document.getElementById("inpIdReserva");
    const inpNombre = document.getElementById("inpNombre");
    const inpFecha = document.getElementById("inpFecha");
    const inpHora = document.getElementById("inpHora");
    const selServicio = document.getElementById("selServicio");
    const inpPax = document.getElementById("inpPax");
    const inpImporte = document.getElementById("inpImporte");

    if (modo === "editar" && reserva) {
      if (titulo) titulo.textContent = "Editar reserva";
      if (inpId) inpId.value = reserva.id || "";
      if (inpNombre) inpNombre.value = reserva.nombre || reserva.titulo || "";
      if (inpFecha) inpFecha.value = reserva.fecha || reserva.dia || "";
      if (inpHora) inpHora.value = reserva.hora || "";
      if (selServicio)
        selServicio.value = reserva.servicio || reserva.turno || "Almuerzo";
      if (inpPax)
        inpPax.value =
          reserva.pax != null
            ? reserva.pax
            : reserva.personas != null
            ? reserva.personas
            : "";
      if (inpImporte)
        inpImporte.value =
          reserva.importe != null
            ? reserva.importe
            : reserva.total != null
            ? reserva.total
            : "";
    } else {
      if (titulo) titulo.textContent = "Nueva reserva";
      if (inpId) inpId.value = "";
      const baseFecha = fecha || formatIsoDate(state.fechaBase);
      if (inpFecha) inpFecha.value = baseFecha;
      if (inpHora) inpHora.value = "";
      if (selServicio) selServicio.value = "Almuerzo";
      if (inpPax) inpPax.value = "";
      if (inpImporte) inpImporte.value = "";
    }

    overlay.classList.remove("hidden");
    document.body.classList.add("modal-open");

    if (inpNombre) {
      setTimeout(() => inpNombre.focus(), 30);
    }
  }

  function cerrarModalReserva() {
    const overlay = document.getElementById("modalReserva");
    if (!overlay) return;
    overlay.classList.add("hidden");
    document.body.classList.remove("modal-open");
  }

  function onSubmitFormReserva(ev) {
    ev.preventDefault();

    const inpId = document.getElementById("inpIdReserva");
    const inpNombre = document.getElementById("inpNombre");
    const inpFecha = document.getElementById("inpFecha");
    const inpHora = document.getElementById("inpHora");
    const selServicio = document.getElementById("selServicio");
    const inpPax = document.getElementById("inpPax");
    const inpImporte = document.getElementById("inpImporte");

    const id = inpId ? inpId.value.trim() : "";
    const nombre = inpNombre ? inpNombre.value.trim() : "";
    const fecha = inpFecha ? inpFecha.value : "";
    const hora = inpHora ? inpHora.value : "";
    const servicio = selServicio ? selServicio.value : "";
    const pax = toNumber(inpPax && inpPax.value ? inpPax.value : null);
    const importe = toNumber(
      inpImporte && inpImporte.value ? inpImporte.value : null
    );

    if (!nombre) {
      mostrarToast("Escribe un nombre");
      return;
    }
    if (!fecha) {
      mostrarToast("Selecciona una fecha");
      return;
    }

    if (!window.colReservas) {
      console.error("colReservas no está definido");
      mostrarToast("No se ha podido guardar (sin conexión)");
      return;
    }
    if (!window.hotelId) {
      console.error("hotelId no está definido");
      mostrarToast("No se ha podido guardar (hotel sin definir)");
      return;
    }

    const datos = {
      hotelId: window.hotelId,
      nombre,
      fecha,
      hora,
      servicio,
      pax: isNaN(pax) ? null : pax,
      importe: isNaN(importe) ? null : importe,
      modulo: MODULO_NOMBRE,
      actualizadoEn: new Date(),
    };

    const prom = id
      ? window.colReservas.doc(id).set(datos, { merge: true })
      : window.colReservas.add(datos);

    prom
      .then(() => {
        mostrarToast("Guardado");
        cerrarModalReserva();
      })
      .catch((err) => {
        console.error("Error al guardar", err);
        mostrarToast("Error al guardar");
      });
  }
})();
