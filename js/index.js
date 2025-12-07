// js/index.js – Portada MesaChef
document.addEventListener("DOMContentLoaded", () => {
  const mesaChef = window.MesaChef || {};
  const getCurrentHotel = mesaChef.getCurrentHotel || (() => "Guadiana");
  const setCurrentHotel = mesaChef.setCurrentHotel || (() => {});

  const selHotel = document.getElementById("selHotel");
  const btnRestaurante = document.getElementById("btnRestaurante");
  const hotelActualSpan = document.getElementById("mcHotelActual");
  const moduleButtons = document.querySelectorAll(".mc-module-card[data-module]");

  const rutas = {
    restaurante: "restaurante.html",
    salones: "salones.html",
    presupuestos: "presupuestos.html",
    "grandes-eventos": "grandes-eventos.html",
  };

  function actualizarEtiquetaHotel() {
    if (!selHotel || !hotelActualSpan) return;
    const texto = selHotel.options[selHotel.selectedIndex]?.text || selHotel.value;
    hotelActualSpan.textContent = texto;
  }

  function cargarHotelInicial() {
    if (!selHotel) return;
    const actual = getCurrentHotel();
    const opciones = Array.from(selHotel.options);
    const encontrada = opciones.find((o) => o.value === actual);
    if (encontrada) {
      selHotel.value = actual;
    }
    actualizarEtiquetaHotel();
  }

  function abrirModulo(nombre) {
    if (!selHotel) return;
    const hotel = selHotel.value || "Guadiana";
    setCurrentHotel(hotel);

    const destino = rutas[nombre] || rutas.restaurante;
    window.location.href = destino;
  }

  // Eventos
  if (selHotel) {
    selHotel.addEventListener("change", () => {
      setCurrentHotel(selHotel.value);
      actualizarEtiquetaHotel();
    });
  }

  if (btnRestaurante) {
    btnRestaurante.addEventListener("click", () => abrirModulo("restaurante"));
  }

  moduleButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mod = btn.dataset.module;
      abrirModulo(mod);
    });
  });

  // Inicial
  cargarHotelInicial();
});
