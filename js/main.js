import { calculateSalt } from "./utils.js";
import { Aquarium, Rock, LightSource, WaterPump } from './models.js';
import { TANK_WIDTH_CM, TANK_HEIGHT_CM, TANK_DEPTH_CM, VISUAL_SCALE } from "./common.js";

const canvas = document.getElementById('aquariumCanvas');
export const ctx = canvas.getContext('2d');

canvas.width = TANK_WIDTH_CM * VISUAL_SCALE;
canvas.height = TANK_HEIGHT_CM * VISUAL_SCALE;

// Escalamos el canvas
document.getElementById("pixel-scale-data").innerText = VISUAL_SCALE;
canvas.style.width = (TANK_WIDTH_CM * VISUAL_SCALE) + 'px';
canvas.style.height = (TANK_HEIGHT_CM * VISUAL_SCALE) + 'px';

// Escalamos el contexto
ctx.scale(VISUAL_SCALE, VISUAL_SCALE);

// Acciones TEST
document.getElementById("test-btn-1").addEventListener("click", () => {
    // Añade 5 mg/L de materia orgánica
    myAquarium.addOrganicMatter(5000);
});

document.getElementById("test-btn-2").addEventListener("click", () => {
    // Muestra por consola todos los parámetros exactos sin redondear del acuario
    console.table({
        currentLiters: myAquarium.currentLiters,
        saltContentKg: myAquarium.saltContentKg,
        salinity: myAquarium.salinity,
        organicMatter: myAquarium.organicMatter,
        solidWaste: myAquarium.solidWaste,
        ammonia: myAquarium.ammonia,
        nitrite: myAquarium.nitrite,
        nitrate: myAquarium.nitrate,
        oxygen: myAquarium.oxygen,
        bacteriaStep1: myAquarium.bacteriaStep1,
        bacteriaStep2: myAquarium.bacteriaStep2,
        temperature: myAquarium.temperature,
        elapsedSimulationTime: myAquarium.elapsedSimulationTime
    });

});

document.getElementById("test-btn-3").addEventListener("click", () => {
    // Añade 5 Kg de sal
    myAquarium.addSalt(0.01);
});

document.getElementById("test-btn-4").addEventListener("click", () => {
    // Añade 5 L de agua de osmosis
    myAquarium.addWater(5);
});

document.getElementById("test-btn-5").addEventListener("click", () => {
    // Evitar que coja otra roca si ya tiene una
    if (currentGameState === STATE_PLACING_ROCK) return;

    activeRock = new Rock(5, 1);

    // Cambiamos el estado
    currentGameState = STATE_PLACING_ROCK;
    canvas.style.cursor = "none"; // Ocultamos el cursor del ratón para mayor inmersión
});

// Eventos del ratón
// Mover el ratón: Inmune a la escala visual y redimensionamientos
window.addEventListener('mousemove', (event) => {
    if (currentGameState !== STATE_PLACING_ROCK || !activeRock) return;

    const rect = canvas.getBoundingClientRect();

    // Posición del ratón en centímetros lógicos
    const xRel = event.clientX - rect.left;
    const yRel = event.clientY - rect.top;

    const logicalX = (xRel / rect.width) * myAquarium.width;
    const logicalY = (yRel / rect.height) * myAquarium.height;

    // Límites de los Cristales (X)
    // El centro (x) no puede estar a menos de medio ancho del borde
    const minX = activeRock.logicWidth / 2;
    const maxX = myAquarium.width - (activeRock.logicWidth / 2);

    activeRock.x = Math.max(minX, Math.min(logicalX, maxX));

    // Límite del Suelo y Techo (Y)
    // El punto 'activeRock.y' es la BASE de la roca.
    // El techo es 0, pero como la roca se dibuja hacia arriba, 
    // la base mínima para que no se salga por arriba es su propia altura.
    const minY = activeRock.logicHeight;

    // El suelo es el fondo menos la altura de la arena
    const maxY = myAquarium.height - myAquarium.sandHeight;

    // Intentamos que el ratón esté en el centro de la roca (logicalY + altura/2)
    let targetBaseY = logicalY + (activeRock.logicHeight / 2);

    // Aplicamos el límite: la base nunca subirá del techo ni bajará de la arena
    activeRock.y = Math.max(minY, Math.min(targetBaseY, maxY));
});

// Hacer click: También escuchamos a la ventana por si haces click estando fuera
window.addEventListener('click', (event) => {
    if (currentGameState === STATE_PLACING_ROCK && activeRock && event.target.id !== "test-btn-5") {
        // Activamos la física
        activeRock.isFalling = true;

        currentGameState = STATE_PLAYING;
        canvas.style.cursor = "default";
    }
});

const myAquarium = new Aquarium(TANK_WIDTH_CM, TANK_HEIGHT_CM, TANK_DEPTH_CM);

// Estados de simulación
const STATE_PLAYING = "playing";
const STATE_PLACING_ROCK = "placing_rock";

let currentGameState = STATE_PLAYING;
let activeRock = null;

let lastTime = performance.now();
function gameLoop(currentTime) {
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    if (currentGameState === STATE_PLAYING) {
        myAquarium.update(deltaTime);

        // Procesamos la física si está cayendo o si está pivotando
        if (activeRock && (activeRock.isFalling || activeRock.isPivotating)) {
            activeRock.updatePhysics(deltaTime, myAquarium);

            // Solo la eliminamos de la "mano" cuando ambos procesos terminen
            if (!activeRock.isFalling && !activeRock.isPivotating) {
                activeRock = null;
            }
        }
    }

    myAquarium.render();

    if (activeRock) {
        activeRock.render(ctx);
    }

    requestAnimationFrame(gameLoop);
}

// Iniciar el bucle pasándole el tiempo actual
requestAnimationFrame(gameLoop);

var startWaterVolume = 300;
myAquarium.addWater(startWaterVolume);
myAquarium.addSalt(calculateSalt(startWaterVolume, 1023));
myAquarium.addSubstrate(90, 2);
myAquarium.lights.push(new LightSource(myAquarium, TANK_WIDTH_CM / 2, TANK_WIDTH_CM * 0.4, "panel"));
myAquarium.pumps.push(new WaterPump(myAquarium, 0, TANK_HEIGHT_CM * 0.4, 80, 0));