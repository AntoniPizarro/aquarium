import { TANK_WIDTH_CM, TANK_HEIGHT_CM, SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_MINUTE, VISUAL_SCALE } from "./common.js";
import { formatTime } from "./utils.js";

export class LightSource {
    constructor(aquarium, x, widthCm, type = "panel") {
        this.aquarium = aquarium;
        this.x = x;
        this.y = -6;
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
        // Le decimos que se dibuje en su X y en su Y (la negativa que hemos puesto)
        mainCtx.translate(this.x, this.y);

        if (this.type === "spot") {
            // Foco
            mainCtx.fillStyle = "#222";
            mainCtx.fillRect(-4, 0, 8, 8); // Movido a Y positivo
            if (this.intensity > 0) {
                mainCtx.shadowBlur = 15;
                mainCtx.shadowColor = "white";
                mainCtx.fillStyle = "#fff";
                mainCtx.beginPath();
                mainCtx.arc(0, 8, 4, 0, Math.PI * 2);
                mainCtx.fill();
            }
        } else {
            // Panel LED
            // Efecto "Glow" o destello que baja hacia el agua
            if (this.intensity > 0) {
                const glow = mainCtx.createLinearGradient(0, 0, 0, 25);
                glow.addColorStop(0, `rgba(255, 255, 255, ${this.intensity * 0.7})`);
                glow.addColorStop(1, "rgba(255, 255, 255, 0)");
                mainCtx.fillStyle = glow;
                mainCtx.fillRect(-this.width / 2, 0, this.width, 25);
            }

            // Carcasa de plástico/aluminio de la pantalla
            mainCtx.fillStyle = "#222";
            mainCtx.fillRect(-this.width / 2, 0, this.width, 6);

            // Tira de LEDs encendida (La luz blanca física)
            if (this.intensity > 0) {
                mainCtx.fillStyle = `rgba(200, 240, 255, ${this.intensity})`;
                mainCtx.shadowBlur = 10;
                mainCtx.shadowColor = "white";
                mainCtx.fillRect((-this.width / 2) + 2, 4, this.width - 4, 2);
            }
        }
        mainCtx.restore();
    }
}

export class Aquarium {
    constructor(width, height, depth) {
        // Dimensiones
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.maxCapacity = (width * height * depth) / 1000;

        // Estado
        this.currentLiters = 0;
        this.saltContentKg = 0;
        this.salinity = 1000;

        // Químca
        this.organicMatter = 0;
        this.solidWaste = 0;
        this.ammonia = 0;
        this.nitrite = 0;
        this.nitrate = 0;
        this.phosphate = 0;
        this.kh = 8.0;
        this.ph = 8.2;
        this.co2 = 0.5;
        this.gasExchangeFactor = 0.005;

        // Oxígeno
        this.oxygen = 7.0;
        this.aerationRate = 0.005;

        // Sustrato
        this.sandMass = 0;
        this.sandHeight = 0;
        this.sandSurfaceArea = 0;
        this.maxBacterialLoad = 0.1;

        // Rocas
        this.rocks = [];
        this.rockMass = 0;
        this.rockDensity = 1.4;

        // Bacterias
        this.bacteriaStep1 = 0;
        this.bacteriaStep2 = 0;
        this.bacteriaStep3 = 0;

        // Algas
        this.algaeGrowth = 0;

        // Temperatura
        this.baseEvaporationRate = (this.width * this.depth) * 0.0003;
        this.ambientTemp = 20.0;                // Temperatura de la habitación (por defecto)
        this.temperature = this.ambientTemp;    // Al inicio es igual a la ambiente
        this.targetTemp = 25.0;                 // Temperatura que desea el usuario (para el calentador)
        this.heaterPower = 150;                 // Potencia del calentador en Watts (W)
        this.isHeaterOn = false;                // Estado del termostato

        // Velocidad de simulación
        this.simulationSpeed = SECONDS_PER_MINUTE;
        this.elapsedSimulationTime = 18 * SECONDS_PER_HOUR;
        this.elapsedRealTime = 0;

        // Iluminación y sombras
        this.lights = [];
        this.waterClarity = 1.0;
        this.bloomAlpha = 0;        // Tinte blanco (Amoníaco)
        this.organicTintAlpha = 0;  // Tinte ámbar (Materia orgánica)
        this.particleDensity = 0;   // Suciedad en suspensión
        this.dayDuration = this.simulationSpeed;
        this.lightCycleIntensity = 1.0; // 0 = Noche cerrada, 1 = Mediodía
        this.ambientOverlayAlpha = 0;

        // Corriente
        this.pumps = [];
        this.waterInertiaX = 0;
        this.waterInertiaY = 0;

        // Sistema de horneado de sombras
        this.shadowLayer = document.createElement('canvas');
        this.shadowCtx = this.shadowLayer.getContext('2d');

        // Le damos el mismo tamaño lógico que al acuario
        this.shadowLayer.width = this.width;
        this.shadowLayer.height = this.height;
        this.shadowsDirty = true;

        // Partículas
        this.bubbles = [];
        this.foods = [];

        // UI
        this.lastUIUpdate = 0;
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
            time: document.getElementById("delta-time"),
            ph: document.getElementById("ph-data"),
            kh: document.getElementById("kh-data"),
            co2: document.getElementById("co2-data"),
            po4: document.getElementById("phosphate-data")
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
        let targetVx = 0;
        let targetVy = 0;

        this.pumps.forEach(pump => {
            const flow = pump.getFlowAt(x, y);
            if (flow.isDirect) {
                targetVx += flow.vx;
                targetVy += flow.vy;
            } else {
                targetVx -= Math.cos(pump.angle) * (pump.power * 0.05);
                targetVy -= Math.sin(pump.angle) * (pump.power * 0.05);
            }
        });

        // Aplicamos inercia: la velocidad actual persigue al objetivo lentamente
        // Esto hace que al apagar la bomba, el agua siga moviéndose un rato
        this.waterInertiaX += (targetVx - this.waterInertiaX) * 0.1;
        this.waterInertiaY += (targetVy - this.waterInertiaY) * 0.1;

        return { x: this.waterInertiaX, y: this.waterInertiaY };
    }

    bakeAllShadows() {
        this.shadowCtx.clearRect(0, 0, this.width, this.height);

        this.lights.forEach(light => {
            if (light.intensity <= 0) return;

            this.rocks.forEach(rock => {
                // No hay sombra si está volando o moviéndose
                if (rock.isFalling || rock.isPivotating || rock.y < 10) return;

                this.shadowCtx.save();

                const dx = rock.x - light.x;
                const dy = rock.y - light.y;
                const skewX = dy !== 0 ? -(dx / dy) * 0.8 : 0;

                // Nos vamos a la base de la roca
                this.shadowCtx.translate(rock.x, rock.y);
                // Aplastamos la imagen hacia abajo y la inclinamos
                this.shadowCtx.transform(1, 0, skewX, -0.3, 0, 0);

                // Alpha dependiente de la capa para dar profundidad y la intensidad de la luz
                this.shadowCtx.globalAlpha = 0.5 * light.intensity;

                // Filtro 100% compatible. Convierte la textura de la roca en negro y la difumina
                this.shadowCtx.filter = "brightness(0) blur(4px)";

                const drawX = -(rock.logicWidth / 2) - rock.padding;
                const drawY = -(rock.logicHeight) - rock.padding;
                const drawW = rock.logicWidth + (rock.padding * 2);
                const drawH = rock.logicHeight + (rock.padding * 2);

                // Dibujamos la sombra
                this.shadowCtx.drawImage(rock.canvas, drawX, drawY, drawW, drawH);

                this.shadowCtx.restore();
            });
        });
    }

    update(deltaTime) {
        if (this.currentLiters <= 0) return;

        // --- 1. GESTIÓN DE TIEMPOS ---
        const realDt = deltaTime || 0;
        this.elapsedRealTime += realDt;
        const dt = (deltaTime || 0) * this.simulationSpeed;
        this.elapsedSimulationTime += dt;

        // --- 2. TERMODINÁMICA Y CALEFACCIÓN ---
        const waterMass = this.currentLiters;

        if (waterMass > 0) {
            if (this.temperature < this.targetTemp - 0.5) {
                this.isHeaterOn = true;
            } else if (this.temperature > this.targetTemp + 0.5) {
                this.isHeaterOn = false;
            }

            if (this.isHeaterOn) {
                const specificHeatWater = 4186;
                const energyJoules = this.heaterPower * dt;
                const tempIncrease = energyJoules / (waterMass * specificHeatWater);
                this.temperature += tempIncrease;
            }

            const thermalLossConstant = 0.0001;
            this.temperature += (this.ambientTemp - this.temperature) * thermalLossConstant * dt;
        }

        // --- 3. CICLO DÍA/NOCHE ---
        const secondOfDay = this.elapsedSimulationTime % SECONDS_PER_DAY;
        const hourOfDay = secondOfDay / SECONDS_PER_HOUR;
        const sunriseStart = 8; const sunriseEnd = 10;
        const sunsetStart = 18; const sunsetEnd = 20;

        if (hourOfDay >= sunriseStart && hourOfDay < sunriseEnd) {
            this.lightCycleIntensity = (hourOfDay - sunriseStart) / (sunriseEnd - sunriseStart);
            this.ambientOverlayAlpha = (1.0 - this.lightCycleIntensity) * 0.7;
        } else if (hourOfDay >= sunriseEnd && hourOfDay < sunsetStart) {
            this.lightCycleIntensity = 1.0;
            this.ambientOverlayAlpha = 0.0;
        } else if (hourOfDay >= sunsetStart && hourOfDay < sunsetEnd) {
            this.lightCycleIntensity = 1.0 - ((hourOfDay - sunsetStart) / (sunsetEnd - sunsetStart));
            this.ambientOverlayAlpha = (1.0 - this.lightCycleIntensity) * 0.7;
        } else {
            this.lightCycleIntensity = 0.0;
            this.ambientOverlayAlpha = 0.7;
        }

        // Aplicamos la intensidad a todas las mini-lámparas
        this.lights.forEach(l => l.intensity = this.lightCycleIntensity);

        // --- LA MAGIA DEL REGISTRO DE SOMBRAS ---
        // Si es la primera vez que se ejecuta, iniciamos el registro
        if (this.lastBakedIntensity === undefined) this.lastBakedIntensity = -1;

        // Comparamos la intensidad actual con la ÚLTIMA VEZ que horneamos las sombras.
        // Si ha cambiado más de un 2% (0.02) desde la última vez, redibujamos.
        if (Math.abs(this.lastBakedIntensity - this.lightCycleIntensity) >= 0.02 ||
            (this.lastBakedIntensity !== 0 && this.lightCycleIntensity === 0) ||
            (this.lastBakedIntensity !== 1 && this.lightCycleIntensity === 1)) {

            this.shadowsDirty = true;
            // Guardamos esta intensidad como la "última vez horneada"
            this.lastBakedIntensity = this.lightCycleIntensity;
        }

        // --- 4. FACTORES AMBIENTALES Y QUÍMICA BÁSICA ---
        let isBoiling = false;
        if (this.temperature >= 100) { this.temperature = 100; isBoiling = true; }

        let bioTempFactor = 0;
        if (this.temperature <= 40) bioTempFactor = Math.pow(2, (this.temperature - 25) / 10);
        else bioTempFactor = -10;

        let evapTempFactor = Math.max(0.1, 1 + (this.temperature - 25) * 0.05);
        if (isBoiling) evapTempFactor = 5000;

        const surfaceAgitation = Math.abs(this.waterInertiaX) * 0.15;
        // Blindaje contra explosión matemática en frames muy largos
        const effectiveExchange = Math.min(1.0, (this.aerationRate + surfaceAgitation) * dt);

        // Saturación de Oxígeno (Benson & Krause)
        let maxOxygenSaturation = 14.6 - (0.33 * this.temperature);
        if (this.salinity > 1000) maxOxygenSaturation -= (this.salinity - 1000) * 0.0008;
        maxOxygenSaturation = Math.max(0, Math.min(15, maxOxygenSaturation));

        this.oxygen += (maxOxygenSaturation - this.oxygen) * effectiveExchange;

        // --- FOTOSÍNTESIS Y RESPIRACIÓN DE ALGAS ---
        if (this.lightCycleIntensity > 0 && this.nitrate > 0.01 && this.phosphate > 0.001) {
            // DÍA: Las algas crecen, comen nutrientes y producen Oxígeno
            const algaeGrowthRate = this.lightCycleIntensity * Math.min(this.nitrate, this.phosphate * 10) * 0.0005 * dt;
            this.algaeGrowth += algaeGrowthRate;

            this.nitrate = Math.max(0, this.nitrate - algaeGrowthRate * 0.1);
            this.phosphate = Math.max(0, this.phosphate - algaeGrowthRate * 0.01);

            this.oxygen = Math.min(15, this.oxygen + algaeGrowthRate * 5); // Tope de O2
            this.co2 = Math.max(0.01, this.co2 - algaeGrowthRate * 2);
        } else if (this.algaeGrowth > 0) {
            // NOCHE: Las algas respiran (consumen O2, producen CO2)
            const algaeRespiration = this.algaeGrowth * 0.0001 * dt;
            this.oxygen = Math.max(0, this.oxygen - algaeRespiration);
            this.co2 += algaeRespiration;
        }

        // CO2 y pH (con protección matemática si KH se acerca a 0)
        const co2Production = (this.bacteriaStep1 + this.bacteriaStep2) * 0.1 * dt;
        this.co2 += co2Production;
        this.co2 -= (this.co2 - 0.5) * effectiveExchange;
        this.co2 = Math.max(0.01, this.co2);

        const safeKh = Math.max(0.01, this.kh); // Evitamos logaritmo de 0
        const targetPh = 6.3 + Math.log10((safeKh * 2.8) / Math.max(0.1, this.co2));
        const phLerpFactor = Math.min(1.0, 0.01 * dt);
        this.ph += (targetPh - this.ph) * phLerpFactor;

        // --- 5. BIOLOGÍA AERÓBICA (Y CONSUMO DE KH) ---
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
        }

        // --- BIOLOGÍA ANAERÓBICA (Desnitrificación) ---
        // Buscamos zonas profundas sin oxígeno en la arena o núcleo de las rocas
        const anaerobicZones = (this.sandHeight > 4 ? this.sandHeight * 0.5 : 0) + (this.rockMass * 0.1);

        // Cuanto menos oxígeno en la columna de agua, mejor trabajan estas bacterias
        const denitrificationPotential = anaerobicZones * Math.max(0, (1.0 - (this.oxygen / 10.0)));

        if (this.nitrate > 0.01 && denitrificationPotential > 0 && this.temperature <= 40) {
            this.bacteriaStep3 += 0.00000005 * (this.maxBacterialLoad - this.bacteriaStep3) * dt * bioTempFactor;
            const conversionRate = 0.000005 * this.bacteriaStep3 * dt * bioTempFactor * denitrificationPotential;
            const consumedNitrate = this.nitrate * Math.min(conversionRate, 1);
            this.nitrate -= consumedNitrate;

            if (Math.random() < consumedNitrate * 1500) {
                this.spawnNitrogenBubble();
            }
        } else {
            this.bacteriaStep3 *= Math.pow(0.99999, dt);
        }

        // --- 6. CONSUMOS, DESCOMPOSICIÓN Y CAÍDA DE KH ---
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

            // El ciclo del nitrógeno consume alcalinidad (KH)
            this.kh = Math.max(0, this.kh - (consumedAmmonia * 0.15));
        }

        if (this.nitrite > 0.001) {
            const conversionRate = 0.000015 * this.bacteriaStep2 * dt * bioTempFactor * oxygenFactor;
            const consumedNitrite = this.nitrite * Math.min(conversionRate, 1);
            this.nitrite -= consumedNitrite;
            this.nitrate += (consumedNitrite * 1.35) * 0.95;
            this.oxygen = Math.max(0, this.oxygen - (consumedNitrite * 1.1));
        }

        this.oxygen = Math.max(0, this.oxygen);

        // --- 7. EVAPORACIÓN Y ENFRIAMIENTO EVAPORATIVO ---
        const simulatedDaysPassed = dt / SECONDS_PER_DAY;
        const evaporatedAmount = this.baseEvaporationRate * evapTempFactor * simulatedDaysPassed;
        this.currentLiters = Math.max(0, this.currentLiters - evaporatedAmount);
        this.temperature -= (evaporatedAmount * 0.05);

        const totalVolumeLiters = this.currentLiters + (this.sandMass / 1.6) + this.getTotalRockVolume();
        const waterYStart = this.height - ((totalVolumeLiters * 1000) / (this.width * this.depth));

        // --- 8. ACTUALIZACIÓN FINAL ---
        this.updateBubbles(realDt, waterYStart);
        this.updateFood(realDt, dt, bioTempFactor);

        this.bloomAlpha = Math.min(0.3, this.ammonia * 0.5);
        this.organicTintAlpha = Math.min(0.4, this.organicMatter / 100);

        // El agua también pierde claridad por las algas en suspensión
        const algaeTint = Math.min(0.3, this.algaeGrowth * 0.1);
        this.waterClarity = Math.max(0.1, 1.0 - (this.bloomAlpha + this.organicTintAlpha + algaeTint));

        this.updateSalinity();

        this.lastUIUpdate += realDt;
        if (this.lastUIUpdate >= 0.15) {
            this.updateUI();
            this.lastUIUpdate = 0;
        }
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
        if (this.ui.ph)
            this.ui.ph.innerText = this.ph.toFixed(2);
        if (this.ui.kh)
            this.ui.kh.innerText = this.kh.toFixed(1);
        if (this.ui.co2)
            this.ui.co2.innerText = this.co2.toFixed(2);
        if (this.ui.po4)
            this.ui.po4.innerText = this.phosphate.toFixed(3);

        // Calculamos el porcentaje real: (Actual / Máximo) * 100
        const perc1 = (this.bacteriaStep1 / this.maxBacterialLoad) * 100;
        const perc2 = (this.bacteriaStep2 / this.maxBacterialLoad) * 100;
        const perc3 = (this.bacteriaStep3 / this.maxBacterialLoad) * 100;

        document.getElementById("bacteria1-data").innerText = perc1.toFixed(1);
        document.getElementById("bacteria2-data").innerText = perc2.toFixed(1);
        document.getElementById("bacteria3-data").innerText = perc3.toFixed(1);
    }

    updateBubbles(realDt, waterYStart) {
        for (let i = this.bubbles.length - 1; i >= 0; i--) {
            let b = this.bubbles[i];
            const flow = this.getWaterFlowAt(b.x, b.y);

            b.x += flow.x * realDt;
            b.y += flow.y * realDt;
            b.y -= b.speed * realDt;

            if (b.x < 0) b.x = 0;
            if (b.x > this.width) b.x = this.width;

            // Explota al llegar a la superficie
            if (b.y < waterYStart) {
                this.bubbles.splice(i, 1);
            }
        }
    }

    updateFood(realDt, dt, bioTempFactor) {
        for (let i = this.foods.length - 1; i >= 0; i--) {
            let f = this.foods[i];
            f.updatePhysics(realDt);

            let decayedMass = 0;
            if (!f.isSettled) {
                const leachRate = 0.0005 * realDt;
                decayedMass = f.mass * Math.min(leachRate, 1);
            } else {
                const decayRate = 0.00002 * dt * bioTempFactor;
                decayedMass = f.mass * Math.min(decayRate, 1);
            }

            f.mass -= decayedMass;
            this.solidWaste += decayedMass;
            this.phosphate += decayedMass * 0.01;

            if (f.mass <= 0.001) {
                this.foods.splice(i, 1);
            }
        }
    }

    spawnNitrogenBubble() {
        let startX, startY;
        let spawnSource = "none";

        if (this.rocks.length > 0 && this.sandHeight > 0) {
            spawnSource = Math.random() > 0.5 ? "rock" : "sand";
        } else if (this.rocks.length > 0) {
            spawnSource = "rock";
        } else if (this.sandHeight > 0) {
            spawnSource = "sand";
        }

        if (spawnSource === "rock") {
            const sourceRock = this.rocks[Math.floor(Math.random() * this.rocks.length)];
            startX = sourceRock.x + (Math.random() * sourceRock.logicWidth - sourceRock.logicWidth / 2);
            startY = sourceRock.y - (Math.random() * sourceRock.logicHeight);
        } else if (spawnSource === "sand") {
            startX = Math.random() * this.width;
            const sandDeepZone = this.sandHeight * 0.5;
            startY = this.height - (Math.random() * sandDeepZone);
        }

        if (spawnSource !== "none") {
            this.bubbles.push({
                x: startX,
                y: startY,
                size: Math.random() * 0.01 + 0.1,
                speed: Math.random() * 15 + 10,
                wobbleSpeed: Math.random() * 2 + 1,
                wobbleSize: Math.random() * 1.5 + 0.5,
                seed: Math.random() * 100
            });
        }
    }

    render(ctx, topCtx) {
        ctx.save();
        topCtx.save();

        // Empujamos el pincel 12 unidades hacia abajo.
        // Ahora el techo del cristal (Y=0) estará más abajo visualmente.
        ctx.translate(0, 12);
        topCtx.translate(0, 12);

        // Limpiamos teniendo en cuenta el hueco aéreo (-12)
        ctx.clearRect(0, -12, this.width, this.height + 12);
        topCtx.clearRect(0, -12, this.width, this.height + 12);

        const sandVolumeLiters = this.sandMass / 1.6;
        const rockVolumeLiters = this.getTotalRockVolume();
        const totalVolumeLiters = this.currentLiters + sandVolumeLiters + rockVolumeLiters;
        const totalHeightCm = (totalVolumeLiters * 1000) / (this.width * this.depth);

        // FÓRMULA CORREGIDA (Sin el Math.max)
        const waterYStart = this.height - totalHeightCm;

        // --- CAPA 1: AGUA Y QUÍMICA ---
        if (this.currentLiters > 0) {
            const gradient = ctx.createLinearGradient(0, waterYStart, 0, this.height);
            gradient.addColorStop(0, "#4fa8ff");
            gradient.addColorStop(1, "#1e6db2");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, waterYStart, this.width, totalHeightCm);

            if (this.bloomAlpha > 0.01) {
                ctx.fillStyle = `rgba(255, 255, 255, ${this.bloomAlpha})`;
                ctx.fillRect(0, waterYStart, this.width, totalHeightCm);
            }
            if (this.organicTintAlpha > 0.01) {
                ctx.fillStyle = `rgba(180, 140, 30, ${this.organicTintAlpha})`;
                ctx.fillRect(0, waterYStart, this.width, totalHeightCm);
            }

            this.renderCaustics(ctx, waterYStart, totalHeightCm);
        }

        // --- CAPA 2: RAYOS DE LUZ VOLUMÉTRICOS ---
        if (this.currentLiters > 0) {
            this.lights.forEach(light => {
                if (light.intensity > 0) {
                    ctx.save();
                    ctx.globalCompositeOperation = "screen";

                    // El gradiente nace en la posición real de la lámpara (light.y es -6)
                    const lightGrad = ctx.createRadialGradient(
                        light.x, light.y, 0,
                        light.x, light.y, this.height
                    );

                    lightGrad.addColorStop(0, `rgba(255, 255, 255, ${0.15 * light.intensity})`);
                    lightGrad.addColorStop(0.8, "rgba(255, 255, 255, 0)");
                    ctx.fillStyle = lightGrad;

                    // ¡LA CLAVE! Dibujamos el rectángulo desde el techo real del aire (-12)
                    // y le sumamos esos 12 al total para que llegue hasta abajo.
                    ctx.fillRect(0, -12, this.width, this.height + 12);
                    ctx.restore();
                }
            });
        }

        // --- CAPA 3: ARENA ---
        if (this.sandHeight > 0) {
            const sandYStart = this.height - this.sandHeight;
            const sandGradient = ctx.createLinearGradient(0, sandYStart, 0, this.height);
            sandGradient.addColorStop(0, "#d4c5a3");
            sandGradient.addColorStop(1, "#8a7e63");
            ctx.fillStyle = sandGradient;
            ctx.fillRect(0, sandYStart, this.width, this.sandHeight);
        }

        // --- CAPA 4: SOMBRAS HORNEADAS ---
        if (this.shadowsDirty) {
            this.bakeAllShadows();
            this.shadowsDirty = false;
        }
        ctx.drawImage(this.shadowLayer, 0, 0, this.width, this.height);

        // --- CAPA 5: OBJETOS FÍSICOS (Sólidos) ---
        const sortedRocks = [...this.rocks].sort((a, b) => b.layer - a.layer);
        sortedRocks.forEach(rock => rock.render(ctx));

        this.foods.forEach(food => food.render(ctx));
        this.pumps.forEach(pump => pump.render(ctx));

        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        this.bubbles.forEach(b => {
            ctx.beginPath();
            const currentX = b.x + Math.sin(this.elapsedRealTime * b.wobbleSpeed + b.seed) * b.wobbleSize;
            ctx.arc(currentX, b.y, b.size, 0, Math.PI * 2);
            ctx.fill();
        });

        // --- CAPA 6: LA OSCURIDAD AMBIENTAL (Noche) ---
        if (this.ambientOverlayAlpha > 0) {
            ctx.fillStyle = `rgba(0, 8, 28, ${this.ambientOverlayAlpha})`;
            ctx.fillRect(0, 0, this.width, this.height);
        }

        // --- CAPA 7: CARCASAS DE LAS LÁMPARAS ---
        this.lights.forEach(light => light.render(topCtx));

        ctx.restore();
        topCtx.restore();
    }

    renderCaustics(ctx, yStart, height) {
        ctx.save();
        ctx.globalCompositeOperation = "overlay";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; // Más tenue aún
        ctx.lineWidth = 1;

        const waveLength = 50;
        const time = this.elapsedRealTime * 0.5; // Movimiento más lento y relajado

        // Eliminamos la dependencia de 'this.waterInertiaX' para que no se inclinen
        for (let i = -waveLength; i < this.width + waveLength; i += waveLength) {
            ctx.beginPath();

            // El movimiento ahora es puramente cíclico (senoidal)
            const xPos = i + Math.sin(time + i * 0.05) * 10;

            // Dibujamos líneas verticales puras (el mismo xPos arriba y abajo)
            ctx.moveTo(xPos, yStart);
            ctx.lineTo(xPos, yStart + height);

            ctx.stroke();
        }
        ctx.restore();
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

            // Cuando la roca termina de asentarse en la arena...
            if (this.checkPointCollision(footX, footY, aquarium) || this.pivotingTimer > 0.6) {
                this.isPivotating = false;
                aquarium.addPlacedRock(this); // ¡Devolvemos la roca al acuario!
                aquarium.shadowsDirty = true; // Y actualizamos la sombra
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

export class Food {
    constructor(x, y, mass, aquarium) {
        this.aquarium = aquarium;
        this.x = x;
        this.y = y;

        const variation = (Math.random() * 0.4) - 0.2;
        this.mass = mass * (1 + variation);

        this.vx = (Math.random() - 0.5) * 5;
        this.vy = 0;

        this.isSettled = false;
        this.isTrappedOnSurface = true; // Empiezan atrapadas en la superficie
        this.drag = 0.95;
    }

    updatePhysics(realDt) {
        if (this.isSettled) return;

        const totalVolumeLiters = this.aquarium.currentLiters + (this.aquarium.sandMass / 1.6) + this.aquarium.getTotalRockVolume();
        const waterYStart = this.aquarium.height - ((totalVolumeLiters * 1000) / (this.aquarium.width * this.aquarium.depth));

        // Obtener corriente
        const flow = this.aquarium.getWaterFlowAt(this.x, this.y);

        if (this.isTrappedOnSurface) {
            // En superficie solo les afecta la corriente horizontal (X)
            this.vx += flow.x * realDt;
            this.y = waterYStart; // Forzamos que se queden en la línea de flotación

            // Rompemos la tensión superficial si:
            // - Hay mucha corriente vertical (la bomba las empuja abajo)
            // - O aleatoriamente por el peso acumulado de agua
            if (Math.abs(flow.y) > 10 || Math.random() < 0.01) {
                this.isTrappedOnSurface = false;
            }
        } else {
            // Física normal de caída
            this.vx += flow.x * realDt;
            this.vy += flow.y * realDt;
            this.vy += (this.mass * 50) * realDt;
        }

        this.vx *= this.drag;
        this.vy *= this.drag;

        this.x += this.vx * realDt;
        this.y += this.vy * realDt;

        this.checkCollisions(waterYStart);
    }

    checkCollisions(waterYStart) {
        if (this.x < 0) { this.x = 0; this.vx *= -0.5; }
        if (this.x > this.aquarium.width) { this.x = this.aquarium.width; this.vx *= -0.5; }

        const groundY = this.aquarium.height - this.aquarium.sandHeight;
        if (this.y >= groundY) {
            this.y = groundY;
            this.settle();
        }

        for (let rock of this.aquarium.rocks) {
            if (this.x > rock.x - rock.logicWidth / 2 &&
                this.x < rock.x + rock.logicWidth / 2 &&
                this.y > rock.y - rock.logicHeight &&
                this.y < rock.y) {
                this.y = rock.y - rock.logicHeight;
                this.settle();
            }
        }
    }

    settle() {
        this.isSettled = true;
        this.isTrappedOnSurface = false;
        this.vx = 0;
        this.vy = 0;
    }
}

export class PelletFood extends Food {
    constructor(x, y, aquarium) {
        super(x, y, 0.05, aquarium); // Cada grano pesa 0.05g
        this.drag = 0.98; // Corta bien el agua, cae rápido

        // El radio estará entre 0.15 y 0.25 (lo que equivale a 3 - 5 milímetros de diámetro)
        this.radius = Math.min(0.25, Math.max(0.15, this.mass * 4));

        this.color = Math.random() > 0.5 ? "#8b4513" : "#a0522d"; // Tonos marrones
    }

    render(ctx) {
        // Calculamos cuánto se ha podrido de 0 a 1 (0 = fresco, 1 = casi desaparecido)
        const rotFactor = Math.max(0, 1 - (this.mass / 0.05));

        ctx.save(); // Guardamos el universo limpio

        // A medida que rotFactor sube a 1, pierde color (grayscale) y se oscurece (brightness)
        ctx.filter = `grayscale(${rotFactor * 100}%) brightness(${1 - rotFactor * 0.6})`;

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore(); // Restauramos el universo para no romper el resto de dibujos
    }
}

export class FlakeFood extends Food {
    constructor(x, y, aquarium) {
        super(x, y, 0.02, aquarium);
        this.size = Math.min(0.3, Math.max(0.15, this.mass * 10));
        this.color = this.getRandomFlakeColor();
        this.angle = Math.random() * Math.PI;
        this.wobbleSpeed = Math.random() * 3 + 2;
        this.wobbleAmplitude = Math.random() * 3 + 2;

        this.vertices = [];
        const numVertices = Math.floor(Math.random() * 3) + 5;
        for (let i = 0; i < numVertices; i++) {
            const vertexAngle = (i / numVertices) * Math.PI * 2;
            const radius = this.size * (0.5 + Math.random() * 0.7);
            this.vertices.push({ x: Math.cos(vertexAngle) * radius, y: Math.sin(vertexAngle) * radius });
        }
    }

    getRandomFlakeColor() {
        const colors = ["#d9381e", "#e6c229", "#4ca64c"];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    updatePhysics(realDt) {
        // --- DRAG DINÁMICO SEGÚN ÁNGULO ---
        // Si la escama está horizontal (seno del ángulo cerca de 0), el drag es alto (cae lento)
        // Si está vertical, el drag es bajo (cae rápido)
        const orientationEffect = Math.abs(Math.cos(this.angle));
        this.drag = 0.8 + (orientationEffect * 0.15); // Fluctúa entre 0.8 y 0.95

        super.updatePhysics(realDt);

        if (!this.isSettled && !this.isTrappedOnSurface) {
            const lateralVelocity = Math.sin(this.aquarium.elapsedRealTime * this.wobbleSpeed) * this.wobbleAmplitude;
            this.x += lateralVelocity * realDt;
            // La rotación también se ve frenada por el agua
            this.angle += (2.0 - orientationEffect) * realDt;
        }
    }

    render(ctx) {
        const rotFactor = Math.max(0, 1 - (this.mass / 0.02));
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.filter = `grayscale(${rotFactor * 100}%) brightness(${1 - rotFactor * 0.6})`;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
        for (let i = 1; i < this.vertices.length; i++) {
            ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}