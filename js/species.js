// species.js
export const SPECIES_CATALOG = {
    "ocellaris": {
        name: "Pez Payaso Ocellaris",
        lengthCm: 4.0, // Tamaño real en el acuario
        maxSpeed: 15,
        maxForce: 1.5,
        // _ = Transparente, O = Naranja, W = Blanco, B = Negro
        sprite: [
            ["_", "_", "O", "O", "W", "O", "O", "O", "_", "_"],
            ["_", "O", "O", "O", "W", "W", "B", "O", "O", "_"],
            ["O", "O", "O", "O", "W", "O", "O", "O", "O", "O"],
            ["_", "O", "W", "O", "W", "O", "O", "_", "_", "_"],
            ["_", "_", "_", "O", "W", "O", "_", "_", "_", "_"]
        ],
        palette: {
            "O": "#ff6b00",
            "W": "#ffffff",
            "B": "#000000"
        }
    },
    "gobio": {
        name: "Gobio de Arena",
        lengthCm: 3.5,
        maxSpeed: 10,
        maxForce: 0.8,
        // Y = Arena, B = Negro, _ = Transparente
        sprite: [
            ["_", "_", "_", "_", "_", "_", "_", "_", "_", "_"],
            ["_", "_", "_", "Y", "Y", "Y", "Y", "_", "_", "_"],
            ["Y", "Y", "B", "Y", "Y", "Y", "Y", "Y", "Y", "_"],
            ["_", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y"],
            ["_", "_", "Y", "_", "Y", "_", "_", "_", "Y", "_"]
        ],
        palette: {
            "Y": "#d2b48c",
            "B": "#000000"
        }
    }
};