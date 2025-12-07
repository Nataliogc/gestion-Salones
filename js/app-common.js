// js/app-common.js
(function () {
  const HOTEL_KEY = "mesaChefHotel";

  function getCurrentHotel() {
    return localStorage.getItem(HOTEL_KEY) || "Guadiana";
  }

  function setCurrentHotel(id) {
    localStorage.setItem(HOTEL_KEY, id);
  }

  // Lunes como inicio de semana
  function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0=Dom, 1=Lun, ...
    const diff = day === 0 ? -6 : 1 - day; // mover al lunes
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getWeekDates(baseDate) {
    const start = startOfWeek(baseDate);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }

  function toIsoDate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // 💡 Este es el texto que sale en las cabeceras del planning
  // Ejemplo: "Lun 8 Dic"
  function formatDayHeader(date) {
    const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const meses = [
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
      "Dic"
    ];
    const diaNombre = dias[date.getDay()];
    const diaNum = date.getDate(); // sin 0 delante
    const mesTxt = meses[date.getMonth()];
    return `${diaNombre} ${diaNum} ${mesTxt}`;
  }

  // Para rangos tipo 01/12/25 → 07/12/25
  function formatDateES(date) {
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const y = String(date.getFullYear()).slice(-2);
    return `${d}/${m}/${y}`;
  }

  window.MesaChef = {
    getCurrentHotel,
    setCurrentHotel,
    getWeekDates,
    toIsoDate,
    formatDayHeader,
    formatDateES
  };
})();
