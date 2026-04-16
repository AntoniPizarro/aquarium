import { calculateSalt } from "./utils.js";
import { Aquarium, Rock, LightSource, WaterPump, PelletFood, FlakeFood } from './models.js';
import { TANK_WIDTH_CM, TANK_HEIGHT_CM, TANK_DEPTH_CM, VISUAL_SCALE } from "./common.js";

const canvas = document.getElementById("aquarium-canvas");
const ctx = canvas.getContext("2d");

const topCanvas = document.getElementById("top-canvas");
const topCtx = topCanvas.getContext("2d");

const EXTRA_HEIGHT = 12; // Unidades extra de aire por encima del cristal

canvas.width = TANK_WIDTH_CM * VISUAL_SCALE;
// Sumamos la altura extra al canvas
canvas.height = (TANK_HEIGHT_CM + EXTRA_HEIGHT) * VISUAL_SCALE;

topCanvas.width = canvas.width;
topCanvas.height = canvas.height;

// Escalamos todo el HTML
document.getElementById("pixel-scale-data").innerText = VISUAL_SCALE;
const pixelWidth = canvas.width + 'px';
const pixelHeight = canvas.height + 'px';

canvas.style.width = pixelWidth;
canvas.style.height = pixelHeight;
topCanvas.style.width = pixelWidth;
topCanvas.style.height = pixelHeight;

const container = document.getElementById("aquarium-container");
container.style.width = pixelWidth;
container.style.height = pixelHeight;

ctx.scale(VISUAL_SCALE, VISUAL_SCALE);
topCtx.scale(VISUAL_SCALE, VISUAL_SCALE);

// Acciones TEST
document.getElementById("test-btn-1").addEventListener("click", () => {
    // Añade 5 mg/L de materia orgánica
    myAquarium.addOrganicMatter(5);
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

document.getElementById("test-btn-6").addEventListener("click", () => {
    currentGameState = STATE_FEEDING;
    canvas.style.cursor = "crosshair";
    currentFood = "pellet";
});

document.getElementById("test-btn-7").addEventListener("click", () => {
    currentGameState = STATE_FEEDING;
    canvas.style.cursor = "crosshair";
    currentFood = "flake";
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
    // Calculamos en qué punto del canvas total estamos (Acuario + 12cm de aire)
    const totalLogicalHeight = myAquarium.height + EXTRA_HEIGHT;
    const logicalYTotal = (yRel / rect.height) * totalLogicalHeight;
    // La Y real dentro del ecosistema del acuario es restando ese aire
    const logicalY = logicalYTotal - EXTRA_HEIGHT;

    // Límites de los Cristales (X)
    // El centro (x) no puede estar a menos de medio ancho del borde
    const minX = activeRock.logicWidth / 2;
    const maxX = myAquarium.width - (activeRock.logicWidth / 2);

    activeRock.x = Math.max(minX, Math.min(logicalX, maxX));

    // Límite del Suelo y Techo (Y)
    const minY = activeRock.logicHeight;
    const maxY = myAquarium.height - myAquarium.sandHeight;
    let targetBaseY = logicalY + (activeRock.logicHeight / 2);

    activeRock.y = Math.max(minY, Math.min(targetBaseY, maxY));
});

// Hacer click: También escuchamos a la ventana por si se hace click estando fuera
window.addEventListener('click', (event) => {
    if (event.target !== canvas && event.target !== topCanvas) return;

    // --- SOLTAR ROCAS ---
    if (currentGameState === STATE_PLACING_ROCK && activeRock) {
        activeRock.isFalling = true;
        fallingRocks.push(activeRock); // ¡La pasamos a la lista de rocas cayendo!

        if (event.shiftKey) {
            // Si mantiene Shift, le ponemos otra roca nueva en la mano
            activeRock = new Rock(5, 1);
        } else {
            // Si no, volvemos a jugar normalmente
            activeRock = null;
            currentGameState = STATE_PLAYING;
            canvas.style.cursor = "default";
        }
    }

    // --- ECHAR COMIDA ---
    else if (currentGameState === STATE_FEEDING) {
        const rect = canvas.getBoundingClientRect();
        const xRel = event.clientX - rect.left;
        const logicalX = (xRel / rect.width) * myAquarium.width;
        const logicalY = myAquarium.height * 0.1; // 10% desde arriba

        const targetDoseGrams = 2.0;
        const particlesCount = currentFood === "flake" ? 4 : 8;
        const massPerParticle = targetDoseGrams / particlesCount;

        for (let i = 0; i < particlesCount; i++) {
            const spawnX = logicalX + (Math.random() * 10 - 5);
            let particle;
            if (currentFood === "flake") {
                particle = new FlakeFood(spawnX, logicalY, myAquarium);
                particle.mass = massPerParticle;
                particle.size *= 1.5;
            } else {
                particle = new PelletFood(spawnX, logicalY, myAquarium);
                particle.mass = massPerParticle;
            }
            myAquarium.foods.push(particle);
        }

        // Si no se pulsa Shift, quitamos la herramienta. Si se pulsa, no hacemos nada y sigue activa.
        if (!event.shiftKey) {
            currentGameState = STATE_PLAYING;
            canvas.style.cursor = "default";
        }
    }
});

// Confirmación al salir
window.addEventListener('beforeunload', (event) => {
    event.preventDefault();
    event.returnValue = '';
});

const myAquarium = new Aquarium(TANK_WIDTH_CM, TANK_HEIGHT_CM, TANK_DEPTH_CM);

// Estados de simulación
const STATE_PLAYING = "playing";
const STATE_PLACING_ROCK = "placing_rock";
const STATE_FEEDING = "feeding";

let currentGameState = STATE_PLAYING;
let activeRock = null;
let currentFood = null;
let fallingRocks = [];

let lastTime = performance.now();
function gameLoop(currentTime) {
    let deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    if (deltaTime > 0.1) {
        deltaTime = 0.016; // Equivalente a un frame a 60 FPS
    }

    // Siempre actualizamos el acuario. Así el agua y las partículas
    // no se quedan "congeladas" cuando se tiene una roca o comida en la mano.
    myAquarium.update(deltaTime);

    // Actualizamos la física de TODAS las rocas que estén cayendo a la vez
    for (let i = fallingRocks.length - 1; i >= 0; i--) {
        let rock = fallingRocks[i];
        rock.updatePhysics(deltaTime, myAquarium);

        // Si la roca ya se ha asentado en el fondo, la borramos de la lista de caída libre
        if (!rock.isFalling && !rock.isPivotating) {
            fallingRocks.splice(i, 1);
        }
    }

    myAquarium.render(ctx, topCtx);

    // Dibujamos las rocas que están cayendo (con el mismo truco de cámara de 12px)
    fallingRocks.forEach(rock => {
        ctx.save();
        ctx.translate(0, EXTRA_HEIGHT);
        rock.render(ctx);
        ctx.restore();
    });

    // Dibujamos la roca que tenemos actualmente "en la mano"
    if (activeRock && currentGameState === STATE_PLACING_ROCK) {
        ctx.save();
        ctx.translate(0, EXTRA_HEIGHT);
        activeRock.render(ctx);
        ctx.restore();
    }

    requestAnimationFrame(gameLoop);
}

// Iniciar el bucle pasándole el tiempo actual
requestAnimationFrame(gameLoop);

var startWaterVolume = 380;
myAquarium.addWater(startWaterVolume);
myAquarium.addSalt(calculateSalt(startWaterVolume, 1023));
myAquarium.addSubstrate(90, 2);
myAquarium.pumps.push(new WaterPump(myAquarium, 0, TANK_HEIGHT_CM * 0.4, 80, 0));

// Luces
const numLights = 3;
const spacing = TANK_WIDTH_CM / (numLights + 1);
for (let i = 1; i <= numLights; i++) {
    // Colocamos cada lámpara en una posición equidistante
    const posX = i * spacing;
    // Creamos una lámpara pequeña (p.ej. de 10cm de ancho)
    const miniLamp = new LightSource(myAquarium, posX, 10, "panel");
    myAquarium.lights.push(miniLamp);
}