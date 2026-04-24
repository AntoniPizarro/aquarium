export const SPECIES_CATALOG = {
    "ocellaris": {
        name: "Pez Payaso Ocellaris",
        lengthCm: 3.0, // Tamaño real en el acuario
        maxSpeed: 15,
        maxForce: 1.5,
        facing: "right",
        sprite: [
            ["_", "_", "_", "_", "O", "W", "O", "_", "_", "_"],
            ["O", "_", "O", "W", "O", "W", "O", "O", "O", "_"],
            ["O", "O", "O", "W", "O", "W", "W", "B", "O", "O"],
            ["O", "_", "O", "W", "O", "W", "O", "O", "O", "_"],
            ["_", "_", "_", "_", "O", "W", "O", "_", "_", "_"]
        ],
        palette: {
            "O": "#ff6b00",
            "W": "#ffffff",
            "B": "#000000"
        }
    }
};