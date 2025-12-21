export function formatCurrency(amount) {
    if (amount === undefined || amount === null) return "0,00 €";
    // Asegurar formato español y símbolo Euro
    return parseFloat(amount).toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + " €";
}

export function formatDate(dateString) {
    if (!dateString) return "";
    const [y, m, d] = dateString.split('-');
    return `${d}/${m}/${y}`;
}

export function getHotelLogo(salonName) {
    // Lógica simplificada basada en el nombre del salón o defecto
    if (salonName === 'Cumbria') return "Img/logo-cumbria.png";
    return "Img/logo-guadiana.png";
}

export function calculateStats(participants, capacity) {
    let totalPax = 0;
    let totalAdults = 0;
    let totalKids = 0;
    let totalCollected = 0;
    let totalPending = 0;
    let totalCancelledAmount = 0; // Dinero retenido en anulaciones

    participants.forEach(p => {
        const isAnulado = p.estado && p.estado.startsWith("anulado");
        const pagos = p.pagos || [];
        // Si es migrado antiguo puede tener p.pagado
        const paidAmount = pagos.reduce((acc, pay) => acc + (parseFloat(pay.amount) || 0), 0) + (p.pagado && !p.pagos ? parseFloat(p.pagado) : 0);

        if (isAnulado) {
            // En anulados, lo pagado cuenta como "retenido/anulación" si no se ha devuelto (se asume que si el pago sigue ahí es que se retuvo)
            totalCancelledAmount += paidAmount;
        } else {
            // Activos
            totalAdults += parseInt(p.adultos) || 0;
            totalKids += parseInt(p.ninos) || 0;
            totalCollected += paidAmount;

            // Calcular pendiente
            const priceAd = parseFloat(document.getElementById("inputPriceAdult").value) || 0;
            const priceCh = parseFloat(document.getElementById("inputPriceChild").value) || 0;
            const totalCost = ((parseInt(p.adultos) || 0) * priceAd) + ((parseInt(p.ninos) || 0) * priceCh);

            // Pendiente nunca negativo
            const pending = Math.max(0, totalCost - paidAmount);
            totalPending += pending;
        }
    });

    totalPax = totalAdults + totalKids;
    const occupancy = capacity > 0 ? ((totalPax / capacity) * 100).toFixed(0) : 0;
    const available = capacity - totalPax;

    return {
        totalPax,
        totalAdults,
        totalKids,
        occupancy,
        available,
        totalCollected,
        totalPending,
        totalCancelledAmount
    };
}
