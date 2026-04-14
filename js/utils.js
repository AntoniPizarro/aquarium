export function formatTime(totalSeconds) {
    // Calculamos las unidades de tiempo
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);

    // Formateamos con ceros a la izquierda (padding)
    // El padStart(2, '0') asegura que siempre haya al menos 2 dígitos
    // pero si d llega a 100 o 1000, el string crecerá naturalmente.
    const days = d.toString().padStart(2, '0');
    const hours = h.toString().padStart(2, '0');
    const minutes = m.toString().padStart(2, '0');
    const seconds = s.toString().padStart(2, '0');

    return `T+ ${days}:${hours}:${minutes}:${seconds}`;
}

export function calculateSalt(waterVolumeLiters, targetSalinity) {
    if (waterVolumeLiters <= 0 || targetSalinity <= 1000) return 0;
    
    // Despejamos la fórmula: gramosPorLitro = (salinidad - 1000) / 0.75
    const saltGramsPerLiter = (targetSalinity - 1000) / 0.75;
    
    // Gramos totales necesarios
    const totalGrams = saltGramsPerLiter * waterVolumeLiters;
    
    // Devolvemos en Kilos
    return totalGrams / 1000;
}