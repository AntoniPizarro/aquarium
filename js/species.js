export const SPECIES_CATALOG = {
    /**
     * PEZ PAYASO OCELLARIS (Clownfish)
     * - Tamaño: 8-10 cm (PEQUEÑO)
     * - Comportamiento: Nada cerca de anémonas (zona media-baja)
     * - Carácter: Territorial, errático, cambios rápidos de dirección
     * - Movimiento: Natación rápida y ágil con pausas
     */
    "ocellaris": {
        name: "Pez Payaso Ocellaris",
        lengthCm: 1.2,  // Mucho más pequeño (realista)
        maxSpeed: 22,    // Rápido para su tamaño
        maxForce: 2.0,   // Muy ágil
        preferredDepth: 0.6,  // Prefiere estar bajo
        behaviorIntensity: 1.3, // Muy activo
        turnSpeed: 0.15, // Giros muy rápidos
        restChance: 0.05, // Descansa poco
        facing: "right",
        sprite: [
            ["_", "_", "_", "O", "W", "O", "_"],
            ["_", "O", "O", "W", "O", "O", "_"],
            ["O", "O", "W", "W", "W", "O", "O"],
            ["O", "O", "W", "B", "W", "O", "O"],
            ["_", "O", "O", "W", "O", "O", "_"],
            ["_", "_", "_", "O", "W", "O", "_"]
        ],
        palette: {
            "O": "#ff8800",
            "W": "#ffffff",
            "B": "#000000"
        }
    },

    /**
     * CIRUJANO AZUL (Blue Tang)
     * - Tamaño: 15-25 cm (MEDIANO-GRANDE)
     * - Comportamiento: Nada en la zona media, come algas
     * - Carácter: Territorial pero menos frenético que payaso
     * - Movimiento: Nado constante y fluido, cambios suaves
     */
    "tang_blue": {
        name: "Cirujano Azul",
        lengthCm: 2.8,   // Más grande
        maxSpeed: 16,    // Nada a velocidad constante
        maxForce: 0.8,   // Menos ágil, más pesado
        preferredDepth: 0.45,  // Zona media
        behaviorIntensity: 0.7, // Más calmo
        turnSpeed: 0.04, // Giros lentos y suaves
        restChance: 0.15, // Descansa más
        facing: "right",
        sprite: [
            ["_", "_", "_", "B", "B", "B", "_", "_"],
            ["_", "B", "B", "B", "B", "B", "B", "_"],
            ["B", "B", "B", "B", "B", "B", "B", "B"],
            ["B", "B", "Y", "Y", "B", "B", "Y", "B"],
            ["B", "B", "B", "B", "B", "B", "B", "B"],
            ["_", "B", "B", "B", "B", "B", "B", "_"],
            ["_", "_", "_", "B", "B", "B", "_", "_"]
        ],
        palette: {
            "B": "#0077ff",
            "Y": "#ffdd00",
            "_": "transparent"
        }
    },

    /**
     * DAMISELA AMARILLA (Yellow Damselfish)
     * - Tamaño: 7-8 cm (MUY PEQUEÑO)
     * - Comportamiento: Muy territorial, nada rápido entre rocas
     * - Carácter: Agresivo, impredecible, siempre en movimiento
     * - Movimiento: Acelerones bruscos, movimientos nerviosos
     */
    "damsel_yellow": {
        name: "Damisela Amarilla",
        lengthCm: 1.0,   // La más pequeña
        maxSpeed: 28,    // La más rápida
        maxForce: 2.5,   // La más ágil
        preferredDepth: 0.5,   // Zona media pero explorador
        behaviorIntensity: 1.8, // Hiperactive
        turnSpeed: 0.25, // Giros muy rápidos y bruscos
        restChance: 0.02, // Casi nunca descansa
        facing: "right",
        sprite: [
            ["_", "Y", "Y", "Y", "_"],
            ["Y", "Y", "Y", "Y", "Y"],
            ["Y", "Y", "B", "Y", "Y"],
            ["Y", "Y", "Y", "Y", "Y"],
            ["_", "Y", "Y", "Y", "_"]
        ],
        palette: {
            "Y": "#ffee00",
            "B": "#000000"
        }
    },

    /**
     * ANTHIAS ROJO (Squarespot Anthias)
     * - Tamaño: 10 cm (PEQUEÑO)
     * - Comportamiento: Forma escuelas, nada en grupo
     * - Carácter: Tímido, huye de depredadores
     * - Movimiento: Nado suave, cambios coordenados
     */
    "anthias_red": {
        name: "Anthias Rojo",
        lengthCm: 1.1,
        maxSpeed: 18,
        maxForce: 1.2,
        preferredDepth: 0.35,  // Zona alta-media
        behaviorIntensity: 0.9,
        turnSpeed: 0.08,
        restChance: 0.08,
        facing: "right",
        sprite: [
            ["_", "_", "R", "R", "R", "_"],
            ["_", "R", "R", "R", "R", "R"],
            ["R", "R", "R", "R", "R", "R"],
            ["R", "R", "W", "R", "W", "R"],
            ["R", "R", "R", "R", "R", "R"],
            ["_", "R", "R", "R", "R", "R"],
            ["_", "_", "R", "R", "R", "_"]
        ],
        palette: {
            "R": "#dd2211",
            "W": "#ffcccc",
            "B": "#000000"
        }
    },

    /**
     * GOBIO PISTOLA (Pistol Shrimp Goby)
     * - Tamaño: 10-12 cm (PEQUEÑO)
     * - Comportamiento: Excava, permanece cerca del fondo
     * - Carácter: Tímido, explorador
     * - Movimiento: Movimientos pequeños y deliberados, pausas largas
     */
    "goby_pistol": {
        name: "Gobio Pistola",
        lengthCm: 0.9,
        maxSpeed: 12,    // Más lento
        maxForce: 1.0,   // Menos potencia
        preferredDepth: 0.75,  // Prefiere estar en el fondo
        behaviorIntensity: 0.5, // Muy calmo
        turnSpeed: 0.03,
        restChance: 0.3,  // Descansa mucho
        facing: "right",
        sprite: [
            ["_", "_", "G", "G", "_"],
            ["_", "G", "G", "G", "G"],
            ["G", "G", "B", "G", "G"],
            ["G", "G", "G", "G", "G"],
            ["_", "G", "G", "G", "G"],
            ["_", "_", "G", "G", "_"]
        ],
        palette: {
            "G": "#aa8844",
            "B": "#000000"
        }
    },

    /**
     * PECES LORO (Parrotfish)
     * - Tamaño: 20-25 cm (GRANDE)
     * - Comportamiento: Nada lentamente, come algas
     * - Carácter: Tranquilo, herbívoro
     * - Movimiento: Nado lento y majestuoso
     */
    "parrotfish": {
        name: "Pez Loro",
        lengthCm: 2.5,
        maxSpeed: 10,    // Muy lento
        maxForce: 0.5,   // Poco ágil
        preferredDepth: 0.55,
        behaviorIntensity: 0.4, // Extremadamente calmo
        turnSpeed: 0.02,
        restChance: 0.4,  // Descansa mucho
        facing: "right",
        sprite: [
            ["_", "_", "_", "P", "P", "P", "_", "_", "_"],
            ["_", "_", "P", "P", "P", "P", "P", "_", "_"],
            ["_", "P", "P", "P", "P", "P", "P", "P", "_"],
            ["P", "P", "P", "B", "P", "B", "P", "P", "P"],
            ["_", "P", "P", "P", "P", "P", "P", "P", "_"],
            ["_", "_", "P", "P", "P", "P", "P", "_", "_"],
            ["_", "_", "_", "P", "P", "P", "_", "_", "_"]
        ],
        palette: {
            "P": "#ff6644",
            "B": "#000000"
        }
    }
};