// js/app-common.js
(function () {
    // CORRECTION: Standardize key to match index.html
    const HOTEL_KEY = "mesaChef_hotel";

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

    // Helper fechas
    function getWeekDates(base) {
        const start = startOfWeek(base);
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            days.push(d);
        }
        return days;
    }

    // YYYY-MM-DD para values de inputs
    function toIsoDate(date) {
        if (!date) return "";
        const d = new Date(date);
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
        const y = String(date.getFullYear()).slice(-2); // 2 dígitos
        // Si queremos 4 dígitos cambiar a date.getFullYear()
        return `${d}/${m}/${Math.abs(date.getFullYear())}`;
    }

    window.MesaChef = {
        getCurrentHotel,
        setCurrentHotel,
        getWeekDates,
        toIsoDate,
        formatDayHeader,
        formatDateES,
        checkSalonAvailability: async (db, hotel, salon, dateStr, jornada, excludeId = null) => {
            // 1. Queries Firestore
            // Conflict Rules:
            // - New "TODO" -> Conflicts with ANY existing (Mañana, Tarde, Todo)
            // - New "Mañana" -> Conflicts with Existing "Mañana" OR "Todo"
            // - New "Tarde" -> Conflicts with Existing "Tarde" OR "Todo"

            try {
                const snapshot = await db.collection("reservas_salones")
                    .where("hotel", "==", hotel)
                    .where("salon", "==", salon)
                    .where("fecha", "==", dateStr)
                    .get();

                if (snapshot.empty) return { available: true };

                let conflict = null;
                const normalize = (s) => (s || "todo").toLowerCase().trim();
                const myJornada = normalize(jornada);

                snapshot.forEach(doc => {
                    if (conflict) return; // Already found one
                    if (excludeId && doc.id === excludeId) return; // Ignore self

                    const data = doc.data();
                    const st = (data.estado || "").toLowerCase();
                    if (st === 'cancelada' || st === 'anulada') return;

                    const otherJornada = normalize(data.detalles?.jornada || "todo");

                    // LOGIC
                    if (myJornada === 'todo' || otherJornada === 'todo' || otherJornada.includes('dia') || otherJornada.includes('completo')) {
                        // Full day conflict
                        conflict = data;
                    } else if (myJornada === otherJornada) {
                        // Exact match (mañana vs mañana)
                        conflict = data;
                    }
                });

                if (conflict) {
                    return {
                        available: false,
                        reason: `Ocupado por ${conflict.cliente} (${conflict.detalles?.jornada || 'Todo el día'})`,
                        conflictData: conflict
                    };
                }

                return { available: true };

            } catch (e) {
                console.error("Error checking availability:", e);
                // Fallback to allow if DB fails? Or block? Safety first: Block or Alert? 
                // Let's return error so caller decides.
                throw e;
            }
        },
        // --- SPANISH INPUT FORMATTERS ---
        // 0. Format Number -> "1.234,56"
        formatEuroValue: (num) => {
            if (num === null || num === undefined) return "0,00";
            let val = parseFloat(num);
            if (isNaN(val)) return "0,00";
            return val.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
        },
        parseEuroInput: (val) => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            // Remove dots (thousands), replace comma with dot
            // Example: "1.234,56" -> "1234.56"
            let clean = val.toString().replace(/\./g, 'TEMP').replace(/,/g, '.').replace(/TEMP/g, '');
            // Also safer: remove any non-digit/minus/dot
            clean = clean.replace(/[^\d.-]/g, '');
            return parseFloat(clean) || 0;
        },
        formatEuroInput: (input) => {
            let val = input.value;
            let num = window.MesaChef.parseEuroInput(val);
            if (isNaN(num)) num = 0;
            input.value = num.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },
        unformatEuroInput: (input) => {
            let val = input.value;
            let num = window.MesaChef.parseEuroInput(val);
            if (num === 0 && val === "") return;
            // Editing format: Use Comma for decimal, No dots
            input.value = num.toString().replace('.', ',');
        }
    };
})();
