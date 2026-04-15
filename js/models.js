import { TANK_WIDTH_CM, TANK_HEIGHT_CM, SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_MINUTE, VISUAL_SCALE } from "./common.js";
import { formatTime } from "./utils.js";
import { ctx } from "./main.js";

export class LightSource {
    constructor(aquarium, x, widthCm, type = "panel") {
        this.aquarium = aquarium;
        this.x = x;
        this.y = 0;
        this.width = widthCm;
        this.type = type; // "spot" (foco) o "panel" (pantalla)
        this.intensity = 1.0;
        this.basePAR = type === "spot" ? 800 : 500; // Un foco concentra más luz
    }

    getContribution(targetX, targetY, depthLayer, rocks) {
        // Atenuación por profundidad (común a todas)
        const depthFactor = Math.exp(-0.006 * targetY);

        // Lógica de dispersión según tipo
        let distanceFactor = 0;
        if (this.type === "spot") {
            // El foco pierde luz radialmente desde un punto
            const dx = Math.abs(targetX - this.x);
            distanceFactor = Math.max(0, 1 - (dx / 40)); // Se apaga a los 40cm
        } else {
            // El panel emite luz constante en su ancho y luego decae
            const halfW = this.width / 2;
            const dx = Math.abs(targetX - this.x);
            if (dx <= halfW) {
                distanceFactor = 1.0;
            } else {
                distanceFactor = Math.max(0, 1 - ((dx - halfW) / 20)); // Decae tras el borde
            }
        }

        const finalIntensity = this.intensity * depthFactor * distanceFactor;

        // Sombras (Basado en la posición de esta luz específica)
        const isShadow = rocks.some(rock => {
            if (rock.layer <= depthLayer) return false;
            // Si es sombra de foco, la sombra se inclina. Si es panel, es más recta.
            const shadowX = rock.x;
            const wShadow = rock.logicWidth;
            return (targetX > shadowX - wShadow / 2 && targetX < shadowX + wShadow / 2 && targetY > rock.y);
        });

        return {
            intensity: finalIntensity,
            par: this.basePAR * finalIntensity * (isShadow ? 0.1 : 1),
            isShadow: isShadow
        };
    }

    render(mainCtx) {
        mainCtx.save();
        mainCtx.translate(this.x, 0);

        // Dibujamos según el tipo
        if (this.type === "spot") {
            // Estética de Foco (pequeño y potente)
            mainCtx.fillStyle = "#444";
            mainCtx.fillRect(-4, -2, 8, 6);
            if (this.intensity > 0) {
                mainCtx.shadowBlur = 20;
                mainCtx.shadowColor = "white";
                mainCtx.fillStyle = "#fff";
                mainCtx.beginPath();
                mainCtx.arc(0, 2, 3, 0, Math.PI * 2);
                mainCtx.fill();
            }
        } else {
            // Estética de Panel (tu código actual mejorado)
            mainCtx.fillStyle = "#333";
            mainCtx.fillRect(-this.width / 2, -2, this.width, 4);
            if (this.intensity > 0) {
                mainCtx.shadowBlur = 15;
                mainCtx.shadowColor = "white";
                mainCtx.fillStyle = "#fff";
                mainCtx.fillRect((-this.width / 2) + 2, -1, this.width - 4, 2);
            }
        }
        mainCtx.restore();
    }
}

export class Aquarium {
    constructor(width, height, depth) {
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.maxCapacity = (width * height * depth) / 1000;

        this.currentLiters = 0;
        this.saltContentKg = 0;
        this.salinity = 1000;

        this.organicMatter = 0;
        this.solidWaste = 0;
        this.ammonia = 0;
        this.nitrite = 0;
        this.nitrate = 0;

        this.oxygen = 7.0;
        this.aerationRate = 0.005;

        this.sandMass = 0;
        this.sandHeight = 0;
        this.sandSurfaceArea = 0;
        this.maxBacterialLoad = 0.1;

        this.rocks = [];
        this.rockMass = 0;
        this.rockDensity = 1.4;

        this.bacteriaStep1 = 0;
        this.bacteriaStep2 = 0;
        this.bacteriaStep3 = 0;

        this.temperature = 25.0;
        this.baseEvaporationRate = (this.width * this.depth) * 0.0003;

        this.simulationSpeed = SECONDS_PER_HOUR;
        this.elapsedSimulationTime = 0;
        this.elapsedRealTime = 0;

        // Iluminación y sombras
        this.lights = [];
        this.waterClarity = 1.0;

        // Corriente
        this.pumps = [];

        // Sistema de horneado de sombras
        this.shadowLayer = document.createElement('canvas');
        this.shadowCtx = this.shadowLayer.getContext('2d');

        // Le damos el mismo tamaño lógico que al acuario
        this.shadowLayer.width = this.width;
        this.shadowLayer.height = this.height;
        this.shadowsDirty = true;

        // Partículas
        this.bubbles = [];

        this.ui = {
            width: document.getElementById("width-data"),
            height: document.getElementById("height-data"),
            deep: document.getElementById("deep-data"),
            liters: document.getElementById("currentLiters-data"),
            level: document.getElementById("waterLevel-data"),
            temperature: document.getElementById("temperature-data"),
            maxLiters: document.getElementById("maxLiters-data"),
            salinity: document.getElementById("salinity-data"),
            salt: document.getElementById("salt-data"),
            organic: document.getElementById("organicMatter-data"),
            ammonia: document.getElementById("ammonia-data"),
            nitrite: document.getElementById("nitrite-data"),
            nitrate: document.getElementById("nitrate-data"),
            oxygen: document.getElementById("oxygen-data"),
            time: document.getElementById("delta-time")
        };
    }

    addWater(amount) {
        this.currentLiters = Math.min(this.maxCapacity, this.currentLiters + amount);
        this.updateSalinity();
    }

    addSalt(weightKg) {
        this.saltContentKg += weightKg;
        this.updateSalinity();
    }

    addOrganicMatter(amount) {
        this.solidWaste += amount;
    }

    updateSalinity() {
        if (this.currentLiters > 0) {
            const saltGramsPerLiter = (this.saltContentKg * 1000) / this.currentLiters;
            this.salinity = 1000 + (saltGramsPerLiter * 0.75);
        }
    }

    addSubstrate(sandMass, grainSize) {
        this.sandMass += sandMass;
        const addedVolumeLiters = sandMass / 1.6;
        this.maxCapacity -= addedVolumeLiters;
        if (this.currentLiters > this.maxCapacity) this.currentLiters = this.maxCapacity;
        const addedVolume = addedVolumeLiters * 1000;
        const addedHeight = addedVolume / (this.width * this.depth);
        this.sandHeight += addedHeight;
        const radius = (grainSize / 2) / 1000;
        const solidVolume = (addedVolumeLiters * 0.6) / 1000;
        const addedArea = (3 * solidVolume) / radius;
        this.sandSurfaceArea += addedArea;
        this.maxBacterialLoad = 0.1 + (this.sandSurfaceArea / 10);
        this.updateSalinity();
    }

    addPlacedRock(rockInstance) {
        this.rocks.push(rockInstance);
        this.rockMass += rockInstance.mass;
        const addedVolumeLiters = rockInstance.mass / this.rockDensity;
        this.maxCapacity -= addedVolumeLiters;
        if (this.currentLiters > this.maxCapacity) this.currentLiters = this.maxCapacity;
        this.maxBacterialLoad += (rockInstance.mass * 0.5);
        this.updateSalinity();
        this.shadowsDirty = true;
    }

    getTotalRockVolume() {
        return this.rocks.reduce((total, rock) => total + (rock.mass / this.rockDensity), 0);
    }

    getLightAt(x, y, depthLayer) {
        let totalIntensity = 0;
        let totalPAR = 0;
        let isShadow = false;

        if (this.lights.length === 0) return { intensity: 0, par: 0, isShadow: false };

        this.lights.forEach(light => {
            const lightData = light.getContribution(x, y, depthLayer, this.rocks);
            totalIntensity += lightData.intensity;
            totalPAR += lightData.par;
            if (lightData.isShadow) isShadow = true;
        });

        return {
            intensity: Math.min(1.5, totalIntensity),
            par: totalPAR,
            isShadow: isShadow
        };
    }

    getWaterFlowAt(x, y) {
        let totalVx = 0;
        let totalVy = 0;

        this.pumps.forEach(pump => {
            const flow = pump.getFlowAt(x, y);

            if (flow.isDirect) {
                // Si la burbuja está en el chorro, es empujada violentamente
                totalVx += flow.vx;
                totalVy += flow.vy;
            } else {
                // TRUCO DE FLUIDOS: Si está fuera del chorro, aplicamos una corriente 
                // de retorno inversa suave para simular el remolino que vuelve a la bomba.
                totalVx -= Math.cos(pump.angle) * (pump.power * 0.05);
                totalVy -= Math.sin(pump.angle) * (pump.power * 0.05);
            }
        });

        return { x: totalVx, y: totalVy };
    }

    bakeAllShadows() {
        // Limpiamos el lienzo de sombras entero
        this.shadowCtx.clearRect(0, 0, this.width, this.height);

        // Calculamos las sombras para todas las luces y todas las rocas
        this.lights.forEach(light => {
            if (light.intensity <= 0) return;

            this.rocks.forEach(rock => {
                // Si la roca está cayendo, no horneamos su sombra fija aún
                if (rock.isFalling || rock.isPivotating || rock.y < 10) return;

                this.shadowCtx.save();

                const dx = rock.x - light.x;
                const dy = rock.y - light.y;
                const distanceToBottom = this.height - rock.y;
                const slopeX = dy !== 0 ? dx / dy : 0;

                const maxOffsetX = slopeX * distanceToBottom * 1.5;
                const steps = 30;
                const baseAlpha = 0.6 * (rock.layer / 3);

                const drawX = -(rock.logicWidth / 2) - rock.padding;
                const drawY = -(rock.logicHeight) - rock.padding;
                const drawW = rock.logicWidth + (rock.padding * 2);
                const drawH = rock.logicHeight + (rock.padding * 2);

                for (let i = 0; i <= steps; i++) {
                    const progress = i / steps;
                    const currentX = rock.x + (maxOffsetX * progress);
                    const currentY = rock.y + (distanceToBottom * progress);
                    const currentAlpha = baseAlpha * Math.pow(1 - progress, 2);
                    const scaleX = 1 + (progress * 0.3);

                    this.shadowCtx.save();
                    this.shadowCtx.translate(currentX, currentY);
                    this.shadowCtx.scale(scaleX, 1);
                    this.shadowCtx.rotate(rock.angle);

                    this.shadowCtx.filter = `brightness(0) opacity(${currentAlpha})`;
                    // Dibujamos en el shadowCtx invisible
                    this.shadowCtx.drawImage(rock.canvas, drawX, drawY, drawW, drawH);

                    this.shadowCtx.restore();
                }
                this.shadowCtx.restore();
            });
        });
    }

    update(deltaTime) {
        if (this.currentLiters <= 0) return;

        // Tiempo real (para burbujas y animaciones visuales)
        const realDt = deltaTime || 0;
        this.elapsedRealTime += realDt;

        const dt = (deltaTime || 0) * this.simulationSpeed;
        this.elapsedSimulationTime += dt;

        let isBoiling = false;
        if (this.temperature >= 100) { this.temperature = 100; isBoiling = true; }

        let bioTempFactor = 0;
        if (this.temperature <= 40) bioTempFactor = Math.pow(2, (this.temperature - 25) / 10);
        else bioTempFactor = -10;

        let evapTempFactor = Math.max(0.1, 1 + (this.temperature - 25) * 0.05);
        if (isBoiling) evapTempFactor = 5000;

        let maxOxygenSaturation = 14.6 - (0.3 * this.temperature) - (this.salinity > 1000 ? 1.5 : 0);
        maxOxygenSaturation = Math.max(0, maxOxygenSaturation);

        if (this.oxygen < maxOxygenSaturation) {
            const oxygenIngress = (maxOxygenSaturation - this.oxygen) * this.aerationRate * dt;
            this.oxygen += oxygenIngress;
        }

        const oxygenFactor = Math.max(0, Math.min(1, (this.oxygen - 1.0) / 2.0));

        if (this.temperature > 40) {
            this.bacteriaStep1 = Math.max(0, this.bacteriaStep1 - (0.001 * dt));
            this.bacteriaStep2 = Math.max(0, this.bacteriaStep2 - (0.001 * dt));
        } else {
            if (this.ammonia > 0.01 && oxygenFactor > 0) {
                this.bacteriaStep1 += 0.0000005 * (this.maxBacterialLoad - this.bacteriaStep1) * dt * bioTempFactor * oxygenFactor;
            } else { this.bacteriaStep1 *= Math.pow(0.99999, dt); }

            if (this.nitrite > 0.01 && oxygenFactor > 0) {
                this.bacteriaStep2 += 0.0000003 * (this.maxBacterialLoad - this.bacteriaStep2) * dt * bioTempFactor * oxygenFactor;
            } else { this.bacteriaStep2 *= Math.pow(0.99999, dt); }

            // Funciona tanto si hay rocas como si hay arena
            if (this.nitrate > 0.01 && (this.rockMass > 1.0 || this.sandMass > 1.0)) {
                this.bacteriaStep3 += 0.00000005 * (this.maxBacterialLoad - this.bacteriaStep3) * dt * bioTempFactor;

                // Consumo de nitratos
                const conversionRate = 0.000005 * this.bacteriaStep3 * dt * bioTempFactor;
                const consumedNitrate = this.nitrate * Math.min(conversionRate, 1);
                this.nitrate -= consumedNitrate;

                // Generación de burbuja visual de Gas Nitrógeno (N2)
                const bubbleProbability = consumedNitrate * 1500; // Recuerda ajustar esto o usar tu hack para testear

                if (Math.random() < bubbleProbability) {

                    let startX, startY;
                    let spawnSource = "none";

                    // Decidir si sale de la roca o de la arena (50/50 si existen ambas)
                    if (this.rocks.length > 0 && this.sandHeight > 0) {
                        spawnSource = Math.random() > 0.5 ? "rock" : "sand";
                    } else if (this.rocks.length > 0) {
                        spawnSource = "rock";
                    } else if (this.sandHeight > 0) {
                        spawnSource = "sand";
                    }

                    // Calcular las coordenadas según el origen
                    if (spawnSource === "rock") {
                        const sourceRock = this.rocks[Math.floor(Math.random() * this.rocks.length)];
                        startX = sourceRock.x + (Math.random() * sourceRock.logicWidth - sourceRock.logicWidth / 2);
                        startY = sourceRock.y - (Math.random() * sourceRock.logicHeight);
                    } else if (spawnSource === "sand") {
                        startX = Math.random() * this.width; // Cualquier punto a lo ancho del acuario
                        // Las bacterias anaeróbicas viven en la zona profunda de la arena
                        // Hacemos que nazca en la mitad inferior del sustrato
                        const sandDeepZone = this.sandHeight * 0.5;
                        startY = this.height - (Math.random() * sandDeepZone);
                    }

                    // Crear la burbuja
                    if (spawnSource !== "none") {
                        this.bubbles.push({
                            x: startX,
                            y: startY,
                            size: Math.random() * 0.01 + 0.1, // Tu tamaño hiperrealista
                            speed: Math.random() * 15 + 10,
                            wobbleSpeed: Math.random() * 2 + 1,
                            wobbleSize: Math.random() * 1.5 + 0.5,
                            seed: Math.random() * 100
                        });
                    }
                }
            } else {
                this.bacteriaStep3 *= Math.pow(0.99999, dt);
            }
        }

        if (this.solidWaste > 0.001) {
            const dissolveRate = 0.0005 * dt * bioTempFactor;
            const dissolved = this.solidWaste * Math.min(dissolveRate, 1);
            this.solidWaste -= dissolved;
            this.organicMatter += dissolved;
            this.oxygen = Math.max(0, this.oxygen - (dissolved * 0.1));
        }

        if (this.organicMatter > 0.001) {
            const decayRate = 0.00005 * dt * bioTempFactor;
            const producedAmmonia = this.organicMatter * Math.min(decayRate, 1);
            this.organicMatter -= producedAmmonia;
            this.ammonia += producedAmmonia;
            this.oxygen = Math.max(0, this.oxygen - (producedAmmonia * 0.5));
        }

        if (this.ammonia > 0.001) {
            const conversionRate = 0.00002 * this.bacteriaStep1 * dt * bioTempFactor * oxygenFactor;
            const consumedAmmonia = this.ammonia * Math.min(conversionRate, 1);
            this.ammonia -= consumedAmmonia;
            this.nitrite += (consumedAmmonia * 2.7) * 0.95;
            this.oxygen = Math.max(0, this.oxygen - (consumedAmmonia * 3.4));
        }

        if (this.nitrite > 0.001) {
            const conversionRate = 0.000015 * this.bacteriaStep2 * dt * bioTempFactor * oxygenFactor;
            const consumedNitrite = this.nitrite * Math.min(conversionRate, 1);
            this.nitrite -= consumedNitrite;
            this.nitrate += (consumedNitrite * 1.35) * 0.95;
            this.oxygen = Math.max(0, this.oxygen - (consumedNitrite * 1.1));
        }

        const simulatedDaysPassed = dt / SECONDS_PER_DAY;
        const evaporatedAmount = this.baseEvaporationRate * evapTempFactor * simulatedDaysPassed;
        this.currentLiters = Math.max(0, this.currentLiters - evaporatedAmount);

        // --- ACTUALIZAR POSICIÓN DE BURBUJAS FÍSICAS ---
        const totalVolumeLiters = this.currentLiters + (this.sandMass / 1.6) + this.getTotalRockVolume();
        const totalHeightCm = (totalVolumeLiters * 1000) / (this.width * this.depth);
        const waterYStart = this.height - totalHeightCm;

        for (let i = this.bubbles.length - 1; i >= 0; i--) {
            let b = this.bubbles[i];

            // 1. Obtener la corriente del agua en ese pixel exacto
            const flow = this.getWaterFlowAt(b.x, b.y);

            // 2. Aplicar la corriente (eje X e Y)
            b.x += flow.x * realDt;
            b.y += flow.y * realDt;

            // 3. Aplicar flotabilidad natural (sube hacia arriba siempre)
            b.y -= b.speed * realDt;

            // Rebote en los cristales laterales (evita que las burbujas se salgan de la pantalla)
            if (b.x < 0) { b.x = 0; }
            if (b.x > this.width) { b.x = this.width; }

            // Explota al llegar arriba
            if (b.y < waterYStart) {
                this.bubbles.splice(i, 1);
            }
        }

        this.updateSalinity();
        this.updateUI();
    }

    updateUI() {
        if (this.ui.width) this.ui.width.innerText = this.width.toString();
        if (this.ui.height) this.ui.height.innerText = this.height.toString();
        if (this.ui.deep) this.ui.deep.innerText = this.depth.toString();
        if (this.ui.time) this.ui.time.innerText = formatTime(this.elapsedSimulationTime);

        const sandVolume = this.sandMass / 1.6;
        const rockVolume = this.getTotalRockVolume();
        const totalVolume = this.currentLiters + sandVolume + rockVolume;
        const totalHeight = (totalVolume * 1000) / (this.width * this.depth);

        if (this.currentLiters == 0) {
            this.ui.liters.innerText = "·" + this.currentLiters.toFixed(1).toString();
            this.ui.level.innerText = "·0";
        } else {
            this.ui.liters.innerText = this.currentLiters.toFixed(1);
            this.ui.level.innerText = -(this.height - totalHeight).toFixed(1);
        }

        if (this.ui.temperature) this.ui.temperature.innerText = this.temperature.toFixed(1);
        if (this.ui.maxLiters) this.ui.maxLiters.innerText = this.maxCapacity.toFixed(1);
        if (this.ui.salinity) this.ui.salinity.innerText = this.salinity.toFixed(1);
        if (this.ui.salt) this.ui.salt.innerText = this.saltContentKg.toFixed(2);
        if (this.ui.organic) this.ui.organic.innerText = this.organicMatter.toFixed(1);
        if (this.ui.ammonia) this.ui.ammonia.innerText = this.ammonia.toFixed(1);
        if (this.ui.nitrite) this.ui.nitrite.innerText = this.nitrite.toFixed(1);
        if (this.ui.nitrate) this.ui.nitrate.innerText = this.nitrate.toFixed(1);
        if (this.ui.oxygen) this.ui.oxygen.innerText = this.oxygen.toFixed(1);

        document.getElementById("bacteria1-data").innerText = (this.bacteriaStep1 * 100).toFixed(1);
        document.getElementById("bacteria2-data").innerText = (this.bacteriaStep2 * 100).toFixed(1);
        document.getElementById("bacteria3-data").innerText = (this.bacteriaStep3 * 100).toFixed(1);
    }

    render() {
        ctx.clearRect(0, 0, this.width, this.height);

        const sandVolumeLiters = this.sandMass / 1.6;
        const rockVolumeLiters = this.getTotalRockVolume();
        const totalVolumeLiters = this.currentLiters + sandVolumeLiters + rockVolumeLiters;
        const totalHeightCm = (totalVolumeLiters * 1000) / (this.width * this.depth);
        const waterYStart = this.height - totalHeightCm;

        // Dibujar agua
        if (this.currentLiters > 0) {
            const gradient = ctx.createLinearGradient(0, waterYStart, 0, this.height);
            gradient.addColorStop(0, "#4fa8ff");
            gradient.addColorStop(1, "#1e6db2ff");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, waterYStart, this.width, totalHeightCm);

            this.lights.forEach(light => {
                if (light.intensity > 0) {
                    const lightGrad = ctx.createRadialGradient(
                        light.x, waterYStart, 0,
                        light.x, waterYStart, this.height
                    );
                    lightGrad.addColorStop(0, `rgba(255, 255, 255, ${0.2 * light.intensity})`);
                    lightGrad.addColorStop(0.6, "rgba(255, 255, 255, 0)");

                    ctx.fillStyle = lightGrad;
                    ctx.fillRect(0, waterYStart, this.width, totalHeightCm);
                }
            });

            let yellowTint = Math.min(0.3, (this.organicMatter / 100));
            if (yellowTint > 0.01) {
                ctx.fillStyle = `rgba(180, 150, 50, ${yellowTint})`;
                ctx.fillRect(0, waterYStart, this.width, totalHeightCm);
            }
        }

        // Dibujar arena (antes que las sombras)
        if (this.sandHeight > 0) {
            const sandYStart = this.height - this.sandHeight;
            const sandGradient = ctx.createLinearGradient(0, sandYStart, 0, this.height);
            sandGradient.addColorStop(0, "#d4c5a3");
            sandGradient.addColorStop(1, "#8a7e63");
            ctx.fillStyle = sandGradient;
            ctx.fillRect(0, sandYStart, this.width, this.sandHeight);
        }

        // Dibujar sombras horneadas (sobre la arena)
        if (this.shadowsDirty) {
            this.bakeAllShadows();
            this.shadowsDirty = false;
        }
        ctx.drawImage(this.shadowLayer, 0, 0, this.width, this.height);

        // Dibujar rocas
        const sortedRocks = [...this.rocks].sort((a, b) => b.layer - a.layer);
        sortedRocks.forEach(rock => rock.render(ctx));

        // Dibujar burbujas
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        this.bubbles.forEach(b => {
            ctx.beginPath();
            const currentX = b.x + Math.sin(this.elapsedRealTime * b.wobbleSpeed + b.seed) * b.wobbleSize;
            ctx.arc(currentX, b.y, b.size, 0, Math.PI * 2);
            ctx.fill();
        });

        this.lights.forEach(light => light.render(ctx));
        this.pumps.forEach(pump => pump.render(ctx));
    }
}

export class Rock {
    constructor(massKg, targetLayer) {
        this.mass = massKg;
        this.layer = targetLayer;
        this.corallineCoverage = 0.0;

        this.x = 0;
        this.y = 0;
        this.angle = 0;
        this.isFalling = false;
        this.velocityY = 0;
        this.gravity = 98;

        this.isPivotating = false;
        this.pivotingDirection = 0;
        this.pivotingSpeed = 0.4;
        this.pivotingDescendSpeed = 5;
        this.pivotingTimer = 0;

        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');

        this.logicWidth = Math.cbrt(this.mass) * 12.5;
        this.logicHeight = this.logicWidth * 0.85;
        this.padding = 10;

        const totalWidth = this.logicWidth + (this.padding * 2);
        const totalHeight = this.logicHeight + (this.padding * 2);

        this.canvas.width = totalWidth * VISUAL_SCALE;
        this.canvas.height = totalHeight * VISUAL_SCALE;
        this.ctx.scale(VISUAL_SCALE, VISUAL_SCALE);

        this.generateProceduralTexture(totalWidth, totalHeight);
    }

    generateProceduralTexture(w, h) {
        const numFoci = Math.floor(Math.random() * 3) + Math.max(1, Math.floor(this.mass / 2));
        this.ctx.beginPath();
        for (let i = 0; i < numFoci; i++) {
            const focusX = (w / 2) + (Math.random() * (this.logicWidth * 0.4) - (this.logicWidth * 0.2));
            const focusY = (h / 2) + (Math.random() * (this.logicHeight * 0.4) - (this.logicHeight * 0.2));
            const baseRadius = this.logicWidth * 0.42;
            for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
                const deformation = Math.random() * 0.3 + 0.85;
                const r = baseRadius * deformation;
                const px = focusX + Math.cos(angle) * r;
                const py = focusY + Math.sin(angle) * r;
                if (angle === 0 && i === 0) this.ctx.moveTo(px, py);
                else this.ctx.lineTo(px, py);
            }
        }
        this.ctx.fillStyle = '#6b665f';
        this.ctx.fill();
        this.ctx.globalCompositeOperation = 'source-atop';
        for (let j = 0; j < 600; j++) {
            this.ctx.beginPath();
            const poreRadius = Math.random() * 0.5 + 0.2;
            this.ctx.arc(Math.random() * w, Math.random() * h, poreRadius, 0, Math.PI * 2);
            this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
            this.ctx.fill();
        }
        this.ctx.globalCompositeOperation = 'source-over';
    }

    checkPointCollision(px, py, aquarium) {
        const groundY = aquarium.height - aquarium.sandHeight;
        if (py >= groundY) return true;
        for (let other of aquarium.rocks) {
            if (other === this || other.layer !== this.layer) continue;
            if (px > other.x - other.logicWidth / 2 && px < other.x + other.logicWidth / 2 &&
                py > other.y - other.logicHeight && py < other.y) return true;
        }
        return false;
    }

    checkCollisionWithRocks(aquarium) {
        for (let other of aquarium.rocks) {
            if (other === this || other.layer !== this.layer) continue;
            const dx = this.x - other.x;
            const overlapX = (this.logicWidth + other.logicWidth) / 2 - 10;
            if (Math.abs(dx) < overlapX && this.y > other.y - other.logicHeight && this.y < other.y) {
                return { rock: other, side: dx > 0 ? "right" : "left" };
            }
        }
        return null;
    }

    updatePhysics(deltaTime, aquarium) {
        if (!this.isFalling && !this.isPivotating) return;
        const groundY = aquarium.height - aquarium.sandHeight;

        if (this.isFalling) {
            this.velocityY += this.gravity * deltaTime;
            this.y += this.velocityY * deltaTime;
            const collision = this.checkCollisionWithRocks(aquarium);
            if (collision) {
                this.y = collision.rock.y - collision.rock.logicHeight + 5;
                this.finalizeFall(collision.side === "left" ? -1 : 1);
            } else if (this.y >= groundY) {
                this.y = groundY;
                this.finalizeFall((this.x > aquarium.width / 2) ? -1 : 1);
            }
        }

        if (this.isPivotating) {
            this.pivotingTimer += deltaTime;
            this.angle += this.pivotingDirection * this.pivotingSpeed * deltaTime;
            const targetY = this.yBeforePivot + 2;
            if (this.y < targetY) this.y += this.pivotingDescendSpeed * deltaTime;
            const footOffsetX = (this.logicWidth * 0.4) * (this.pivotingDirection * -1);
            const footX = this.x + footOffsetX * Math.cos(this.angle);
            const footY = this.y + footOffsetX * Math.sin(this.angle);
            if (this.checkPointCollision(footX, footY, aquarium) || this.pivotingTimer > 0.6) {
                this.isPivotating = false;
                aquarium.addPlacedRock(this);
            }
        }
    }

    finalizeFall(direction) {
        this.isFalling = false;
        this.velocityY = 0;
        this.isPivotating = true;
        this.pivotingTimer = 0;
        this.yBeforePivot = this.y;
        this.pivotingDirection = direction;
        this.x += direction * 0.5;
    }

    render(mainCtx) {
        mainCtx.save();
        mainCtx.translate(this.x, this.y);
        mainCtx.rotate(this.angle);
        const drawX = -(this.logicWidth / 2) - this.padding;
        const drawY = -(this.logicHeight) - this.padding;
        mainCtx.drawImage(this.canvas, drawX, drawY, this.logicWidth + this.padding * 2, this.logicHeight + this.padding * 2);
        mainCtx.restore();
    }
}

export class WaterPump {
    constructor(aquarium, x, y, power = 50, angle = 0) {
        this.aquarium = aquarium;
        this.x = x;
        this.y = y;
        this.power = power;
        this.angle = angle;
        this.coneAngle = Math.PI / 4;
        this.maxDistance = aquarium.width * 0.8;
    }

    getFlowAt(targetX, targetY) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > this.maxDistance || dist < 1) return { vx: 0, vy: 0, isDirect: false };

        const targetAngle = Math.atan2(dy, dx);
        let angleDiff = targetAngle - this.angle;

        while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

        if (Math.abs(angleDiff) > this.coneAngle) return { vx: 0, vy: 0, isDirect: false };

        const distFactor = Math.pow(1 - (dist / this.maxDistance), 2);
        const angleFactor = 1 - (Math.abs(angleDiff) / this.coneAngle);

        const strength = this.power * distFactor * angleFactor;

        return {
            vx: Math.cos(this.angle) * strength,
            vy: Math.sin(this.angle) * strength,
            isDirect: true
        };
    }

    render(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Imán externo (reducido de 30 a 18 de alto)
        ctx.fillStyle = "#111";
        ctx.fillRect(-8, -9, 5, 18);

        // Cuerpo de la bomba (reducido de 20 a 12 de ancho/alto)
        ctx.fillStyle = "#333";
        ctx.beginPath();
        // x, y, ancho, alto, radio_borde
        ctx.roundRect(-2, -6, 12, 12, 3);
        ctx.fill();

        // Boquilla de salida (radio reducido de 8 a 5)
        ctx.fillStyle = "#1a5b8c";
        ctx.beginPath();
        ctx.arc(10, 0, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}