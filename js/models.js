import { TANK_WIDTH_CM, TANK_HEIGHT_CM, SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_MINUTE, VISUAL_SCALE } from "./common.js";
import { formatTime } from "./utils.js";
import { ctx } from "./main.js";

export class Aquarium {
    constructor(width, height, depth) {
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.maxCapacity = (width * height * depth) / 1000;

        this.currentLiters = 0;
        this.saltContentKg = 0;
        this.salinity = 1000;

        // Chemicals (mg/L)
        this.organicMatter = 0;
        this.solidWaste = 0;
        this.ammonia = 0;
        this.nitrite = 0;
        this.nitrate = 0;

        // Oxígeno
        this.oxygen = 7.0; // mg/L (7.0 es un nivel excelente para arrecife)
        this.aerationRate = 0.005;

        // Sustrato
        this.sandMass = 0;
        this.sandHeight = 0;
        this.sandSurfaceArea = 0;
        this.maxBacterialLoad = 0.1;

        // Roca viva y bacterias anaerobias
        this.rocks = [];
        this.rockMass = 0;
        this.rockDensity = 1.4;

        // Bacterial populations (0.0 to 1.0)
        this.bacteriaStep1 = 0;
        this.bacteriaStep2 = 0;
        this.bacteriaStep3 = 0;

        // Termodinámica
        this.temperature = 25.0; // Grados Celsius
        // Guardamos la tasa "base" a 25ºC. Ya no la multiplicamos directamente por el tiempo aquí.
        this.baseEvaporationRate = (this.width * this.depth) * 0.0003;

        // Tiempo
        // Ejemplo: 1.0 = Tiempo real. 
        // 86400 = 1 segundo real equivale a 1 día de simulación (24h * 60m * 60s)
        // 3600 = 1 segundo real equivale a 1 hora de simulación.
        this.simulationSpeed = SECONDS_PER_HOUR; // Ajusta esto para que vaya más rápido o más lento
        this.elapsedSimulationTime = 0;

        // UI Cache to avoid searching DOM every frame
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

        // 1. DESPLAZAMIENTO DE AGUA (Densidad promedio aragonita = ~1.6 Kg/L)
        const addedVolumeLiters = sandMass / 1.6;
        this.maxCapacity -= addedVolumeLiters;

        // Si metes arena y el acuario estaba lleno, el agua rebosa y se pierde
        if (this.currentLiters > this.maxCapacity) {
            this.currentLiters = this.maxCapacity;
        }

        // 2. ALTURA VISUAL Y FÍSICA
        const addedVolume = addedVolumeLiters * 1000;
        const addedHeight = addedVolume / (this.width * this.depth);
        this.sandHeight += addedHeight;

        // 3. CAPACIDAD BIOLÓGICA (Superficie total)
        // Asumiendo granos esféricos y un 60% de espacio sólido (40% de agua entre granos).
        // Fórmula del área total: Área = (3 * Volumen_Solido_m3) / Radio_metros
        const radius = (grainSize / 2) / 1000;
        const solidVolume = (addedVolumeLiters * 0.6) / 1000;
        const addedArea = (3 * solidVolume) / radius;

        this.sandSurfaceArea += addedArea;

        // Actualizamos el límite de bacterias. 
        // Suponemos que ~10 m2 de arena soportan 1 "unidad" de carga biológica (100%)
        this.maxBacterialLoad = 0.1 + (this.sandSurfaceArea / 10);

        // Al cambiar el volumen de agua, la salinidad cambia
        this.updateSalinity();
    }

    addPlacedRock(rockInstance) {
        this.rocks.push(rockInstance);

        // Sumamos su masa al total del acuario para la química
        this.rockMass += rockInstance.mass;

        // 1. DESPLAZAMIENTO DE AGUA
        const addedVolumeLiters = rockInstance.mass / this.rockDensity;
        this.maxCapacity -= addedVolumeLiters;

        if (this.currentLiters > this.maxCapacity) {
            this.currentLiters = this.maxCapacity; // Rebosa
        }

        // 2. AUMENTO MASIVO DE CAPACIDAD BIOLÓGICA
        this.maxBacterialLoad += (rockInstance.mass * 0.5);

        this.updateSalinity();
    }

    getTotalRockVolume() {
        // Sumamos el volumen de cada roca individual (Masa / Densidad)
        return this.rocks.reduce((total, rock) => total + (rock.mass / this.rockDensity), 0);
    }

    update(deltaTime) {
        if (this.currentLiters <= 0) return;

        const dt = (deltaTime || 0) * this.simulationSpeed;
        this.elapsedSimulationTime += dt;

        // --- 1. FÍSICA TÉRMICA Y EBULLICIÓN ---
        // Si el agua llega a 100ºC, se bloquea la temperatura (física real)
        let isBoiling = false;
        if (this.temperature >= 100) {
            this.temperature = 100;
            isBoiling = true;
        }

        // Biología: Regla Q10 para temperaturas seguras. 
        // Si pasamos de 40ºC, las bacterias mueren masivamente (factor negativo)
        let bioTempFactor = 0;
        if (this.temperature <= 40) {
            bioTempFactor = Math.pow(2, (this.temperature - 25) / 10);
        } else {
            // Factor de muerte por calor extremo
            bioTempFactor = -10;
        }

        // Evaporación: Normal hasta 99.9ºC. Si hierve, evaporación masiva.
        let evapTempFactor = Math.max(0.1, 1 + (this.temperature - 25) * 0.05);
        if (isBoiling) {
            evapTempFactor = 5000; // Se vacía a borbotones
        }

        // --- 2. FÍSICA DEL OXÍGENO (Aeración) ---
        // Fórmula simplificada: El agua dulce a 0ºC retiene ~14.6 mg/L.
        // La temperatura y la salinidad reducen drásticamente esta capacidad.
        let maxOxygenSaturation = 14.6 - (0.3 * this.temperature) - (this.salinity > 1000 ? 1.5 : 0);
        maxOxygenSaturation = Math.max(0, maxOxygenSaturation); // Nunca menor a 0

        // El agua absorbe oxígeno del aire hasta llegar a su límite de saturación
        if (this.oxygen < maxOxygenSaturation) {
            const oxygenIngress = (maxOxygenSaturation - this.oxygen) * this.aerationRate * dt;
            this.oxygen += oxygenIngress;
        }

        // --- 3. POPULATION DYNAMICS (Bacterias y Asfixia) ---
        // Las bacterias aerobias necesitan al menos 2.0 mg/L de O2 para trabajar bien.
        // Si el O2 baja de 2.0, su eficiencia cae en picado (Factor de asfixia de 0 a 1).
        const oxygenFactor = Math.max(0, Math.min(1, (this.oxygen - 1.0) / 2.0));

        if (this.temperature > 40) {
            this.bacteriaStep1 = Math.max(0, this.bacteriaStep1 - (0.001 * dt));
            this.bacteriaStep2 = Math.max(0, this.bacteriaStep2 - (0.001 * dt));
        } else {
            // Aplicamos el factor de oxígeno al crecimiento. ¡Si se ahogan, no crecen!
            if (this.ammonia > 0.01 && oxygenFactor > 0) {
                this.bacteriaStep1 += 0.0000005 * (this.maxBacterialLoad - this.bacteriaStep1) * dt * bioTempFactor * oxygenFactor;
            } else {
                this.bacteriaStep1 *= Math.pow(0.99999, dt);
            }

            if (this.nitrite > 0.01 && oxygenFactor > 0) {
                this.bacteriaStep2 += 0.0000003 * (this.maxBacterialLoad - this.bacteriaStep2) * dt * bioTempFactor * oxygenFactor;
            } else {
                this.bacteriaStep2 *= Math.pow(0.99999, dt);
            }

            if (this.nitrate > 0.01 && this.rockMass > 1.0) {
                this.bacteriaStep3 += 0.00000005 * (this.maxBacterialLoad - this.bacteriaStep3) * dt * bioTempFactor;
            } else {
                this.bacteriaStep3 *= Math.pow(0.99999, dt);
            }
        }

        // --- 4. CHEMICAL TRANSFORMATIONS Y CONSUMO DE O2 ---

        // A. Disolución (Consume un poco de oxígeno)
        if (this.solidWaste > 0.001) {
            const dissolveRate = 0.0005 * dt * bioTempFactor;
            const dissolved = this.solidWaste * Math.min(dissolveRate, 1);
            this.solidWaste -= dissolved;
            this.organicMatter += dissolved;
            this.oxygen = Math.max(0, this.oxygen - (dissolved * 0.1));
        }

        // B. Descomposición a Amoníaco (Consume O2)
        if (this.organicMatter > 0.001) {
            // ELIMINAMOS el * oxygenFactor de aquí:
            const decayRate = 0.00005 * dt * bioTempFactor;
            const producedAmmonia = this.organicMatter * Math.min(decayRate, 1);
            this.organicMatter -= producedAmmonia;
            this.ammonia += producedAmmonia;

            // Sigue consumiendo O2 si hay, pero si no hay (llega a 0), sigue produciendo amoníaco
            this.oxygen = Math.max(0, this.oxygen - (producedAmmonia * 0.5));
        }

        // C. Paso 1: NH3 -> NO2 (El mayor consumidor de O2. Estequiometría real: ~3.4 mg O2 por mg NH3)
        if (this.ammonia > 0.001) {
            const conversionRate = 0.00002 * this.bacteriaStep1 * dt * bioTempFactor * oxygenFactor;
            const consumedAmmonia = this.ammonia * Math.min(conversionRate, 1);
            this.ammonia -= consumedAmmonia;
            this.nitrite += (consumedAmmonia * 2.7) * 0.95;
            this.oxygen = Math.max(0, this.oxygen - (consumedAmmonia * 3.4));
        }

        // D. Paso 2: NO2 -> NO3 (Consume O2. Estequiometría real: ~1.1 mg O2 por mg NO2)
        if (this.nitrite > 0.001) {
            const conversionRate = 0.000015 * this.bacteriaStep2 * dt * bioTempFactor * oxygenFactor;
            const consumedNitrite = this.nitrite * Math.min(conversionRate, 1);
            this.nitrite -= consumedNitrite;
            this.nitrate += (consumedNitrite * 1.35) * 0.95;
            this.oxygen = Math.max(0, this.oxygen - (consumedNitrite * 1.1));
        }

        // E. Paso 3 (La magia de la Roca): NO3 -> N2 Gas (Desnitrificación)
        // Esto elimina los nitratos del acuario porque se evaporan al aire. NO consume oxígeno.
        if (this.nitrate > 0.01 && this.rockMass > 0) {
            // La conversión anaeróbica es muy lenta
            const conversionRate = 0.000005 * this.bacteriaStep3 * dt * bioTempFactor;
            const consumedNitrate = this.nitrate * Math.min(conversionRate, 1);
            this.nitrate -= consumedNitrate;
            // Al ser gas, abandona el acuario. No sumamos nada a ninguna otra variable.
        }

        // --- 4. EVAPORACIÓN PROPORCIONAL Y TÉRMICA ---
        const simulatedDaysPassed = dt / SECONDS_PER_DAY;
        const evaporatedAmount = this.baseEvaporationRate * evapTempFactor * simulatedDaysPassed;

        this.currentLiters = Math.max(0, this.currentLiters - evaporatedAmount);

        this.updateSalinity();
        this.updateUI();
    }

    updateUI() {
        // Dimensiones
        if (this.ui.width) {
            this.ui.width.innerText = this.width.toString();
        }
        if (this.ui.height) {
            this.ui.height.innerText = this.height.toString();
        }
        if (this.ui.deep) {
            this.ui.deep.innerText = this.depth.toString();
        }

        // Tiempo
        if (this.ui.time) {
            this.ui.time.innerText = formatTime(this.elapsedSimulationTime);
        }

        // Rounding to 1 decimal for display as requested

        // Calculamos la altura total (Agua + Arena) para mostrar el nivel real desde el fondo
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

        if (this.temperature == 0) {
            this.ui.temperature.innerText = "·" + this.temperature.toFixed(1).toString();
        } else {
            this.ui.temperature.innerText = this.temperature.toFixed(1);
        }

        if (this.maxCapacity == 0) {
            this.ui.maxLiters.innerText = "·" + this.maxCapacity.toFixed(1).toString();
        } else {
            this.ui.maxLiters.innerText = this.maxCapacity.toFixed(1);
        }

        if (this.salinity == 0) {
            this.ui.salinity.innerText = "·" + this.salinity.toFixed(1).toString();
        } else {
            this.ui.salinity.innerText = this.salinity.toFixed(1);
        }

        if (this.salt == 0) {
            this.ui.salt.innerText = "·" + this.saltContentKg.toFixed(2).toString();
        } else {
            this.ui.salt.innerText = this.saltContentKg.toFixed(2);
        }

        if (this.organicMatter == 0) {
            this.ui.organic.innerText = "·" + this.organicMatter.toFixed(1).toString();
        } else {
            this.ui.organic.innerText = this.organicMatter.toFixed(1);
        }

        if (this.ammonia == 0) {
            this.ui.ammonia.innerText = "·" + this.ammonia.toFixed(1).toString();
        } else {
            this.ui.ammonia.innerText = this.ammonia.toFixed(1);
        }

        if (this.nitrite == 0) {
            this.ui.nitrite.innerText = "·" + this.nitrite.toFixed(1).toString();
        } else {
            this.ui.nitrite.innerText = this.nitrite.toFixed(1);
        }

        if (this.nitrate == 0) {
            this.ui.nitrate.innerText = "·" + this.nitrate.toFixed(1).toString();
        } else {
            this.ui.nitrate.innerText = this.nitrate.toFixed(1);
        }

        if (this.oxygen == 0) {
            this.ui.oxygen.innerText = "·" + this.oxygen.toFixed(1).toString();
        } else {
            this.ui.oxygen.innerText = this.oxygen.toFixed(1);
        }

        // Bacterias
        if (this.bacteriaStep1 == 0) {
            document.getElementById("bacteria1-data").innerText = "·" + (this.bacteriaStep1 * 100).toFixed(1).toString();
        } else {
            document.getElementById("bacteria1-data").innerText = (this.bacteriaStep1 * 100).toFixed(1);
        }

        if (this.bacteriaStep2 == 0) {
            document.getElementById("bacteria2-data").innerText = "·" + (this.bacteriaStep2 * 100).toFixed(1).toString();
        } else {
            document.getElementById("bacteria2-data").innerText = (this.bacteriaStep2 * 100).toFixed(1);
        }

        if (this.bacteriaStep3 == 0) {
            document.getElementById("bacteria3-data").innerText = "·" + (this.bacteriaStep3 * 100).toFixed(1).toString();
        } else {
            document.getElementById("bacteria3-data").innerText = (this.bacteriaStep3 * 100).toFixed(1);
        }
    }

    render() {
        ctx.clearRect(0, 0, this.width, this.height);

        // 1. Calculamos el volumen total ocupado (Agua + Arena + ROCAS)
        const sandVolumeLiters = this.sandMass / 1.6;
        const rockVolumeLiters = this.getTotalRockVolume(); // <--- NUEVO
        const totalVolumeLiters = this.currentLiters + sandVolumeLiters + rockVolumeLiters;

        const totalHeightCm = (totalVolumeLiters * 1000) / (this.width * this.depth);
        const waterYStart = this.height - totalHeightCm;

        // 2. Dibujar Agua y Filtros
        if (this.currentLiters > 0) {
            // El agua llena todo el hueco (incluso entre la arena), así que pintamos hasta el fondo
            const gradient = ctx.createLinearGradient(0, waterYStart, 0, this.height);
            gradient.addColorStop(0, "#4fa8ff");
            gradient.addColorStop(1, "#1e6db2ff");

            ctx.fillStyle = gradient;
            ctx.fillRect(0, waterYStart, this.width, totalHeightCm);

            // Reflejo de superficie
            ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
            ctx.fillRect(0, waterYStart, this.width, 1);

            // --- FILTROS VISUALES ---

            // 1. Efecto de Materia Orgánica (Tinte Amarillo)
            let yellowTint = Math.min(0.4, (this.organicMatter / 50));
            if (yellowTint > 0.01) {
                ctx.fillStyle = `rgba(180, 150, 50, ${yellowTint})`; // Amarillo sucio
                ctx.fillRect(0, waterYStart, this.width, totalHeightCm);
            }

            // 2. Efecto de Bloom Bacteriano (Turbidez Blanca)
            let milkyTint = Math.min(0.5, this.ammonia * 0.1);
            if (milkyTint > 0.01) {
                ctx.fillStyle = `rgba(255, 255, 255, ${milkyTint})`;
                ctx.fillRect(0, waterYStart, this.width, totalHeightCm);
            }

            // 3. Efecto de Microalgas (Agua Verde)
            let greenTint = Math.min(0.6, (this.nitrate / 100));
            if (greenTint > 0.01) {
                ctx.fillStyle = `rgba(50, 200, 50, ${greenTint})`;
                ctx.fillRect(0, waterYStart, this.width, totalHeightCm);
            }
        }

        // 3. Dibujar Arena (Se pinta por encima del fondo, ocultando el agua de abajo)
        if (this.sandHeight > 0) {
            const sandYStart = this.height - this.sandHeight;

            const sandGradient = ctx.createLinearGradient(0, sandYStart, 0, this.height);
            sandGradient.addColorStop(0, "#d4c5a3");
            sandGradient.addColorStop(1, "#8a7e63");

            ctx.fillStyle = sandGradient;
            ctx.fillRect(0, sandYStart, this.width, this.sandHeight);
        }

        // 4. Dibujar Roca Viva (Ahora iteramos sobre los objetos reales)
        // Más adelante, aquí ordenaremos por `rock.layer` para dibujar el fondo primero
        this.rocks.forEach(rock => rock.render(ctx));
    }
}

export class Rock {
    constructor(massKg, targetLayer) {
        this.mass = massKg;
        this.layer = targetLayer;
        this.corallineCoverage = 0.0;

        // Físicas
        this.x = 0;
        this.y = 0;
        this.angle = 0; // En radianes
        this.isFalling = false;
        this.velocityY = 0;
        this.gravity = 98; // cm/s² (ajustable para caída más lenta/rápica)

        // Pivotaje
        this.isPivotating = false;
        this.pivotingDirection = 0; // -1 para izquierda, 1 para derecha
        this.pivotingSpeed = 0.5; // Radianes por segundo (velocidad de giro)
        this.pivotingDescendSpeed = 5; // cm/s (velocidad de bajada mientras gira)

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
            // Posicionamiento de los focos restringido estrictamente al tamaño lógico
            const focusX = (w / 2) + (Math.random() * (this.logicWidth * 0.4) - (this.logicWidth * 0.2));
            const focusY = (h / 2) + (Math.random() * (this.logicHeight * 0.4) - (this.logicHeight * 0.2));

            // ELIMINADO EL + 5 ESTÁTICO. Ahora el radio es estrictamente proporcional (35% del ancho lógico)
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

        // Pintar la base
        this.ctx.fillStyle = '#6b665f';
        this.ctx.fill();

        this.ctx.globalCompositeOperation = 'source-atop';

        // --- 3. SOLUCIÓN TEXTURA ORGÁNICA ---
        // A. Poros oscuros (agujeros)
        for (let j = 0; j < 600; j++) {
            this.ctx.beginPath();
            const poreRadius = Math.random() * 0.5 + 0.2; // Radio pequeño y proporcionado
            this.ctx.arc(Math.random() * w, Math.random() * h, poreRadius, 0, Math.PI * 2);
            this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
            this.ctx.fill();
        }

        // B. Veta natural (Curva de Bezier)
        this.ctx.beginPath();
        this.ctx.moveTo(Math.random() * w, 0);
        this.ctx.bezierCurveTo(
            Math.random() * w, h / 3,
            Math.random() * w, h / 1.5,
            Math.random() * w, h
        );
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; // Línea blanca suave
        this.ctx.lineWidth = Math.random() * 4 + 1;
        this.ctx.stroke();

        this.ctx.globalCompositeOperation = 'source-over';
    }

    checkCollisionWithRocks(aquarium) {
        for (let other of aquarium.rocks) {
            // Solo chocamos si están en la misma capa de profundidad
            if (other.layer !== this.layer) continue;

            // Calculamos la distancia entre centros
            const dx = Math.abs(this.x - other.x);
            const dy = Math.abs(this.y - other.y);

            // Margen de colisión: (AnchoA + AnchoB) / 2
            // Restamos 5px para permitir el solapamiento visual que pediste
            const overlapX = (this.logicWidth + other.logicWidth) / 2 - 5;
            const overlapY = (this.logicHeight + other.logicHeight) / 2 - 5;

            if (dx < overlapX && dy < overlapY) {
                // Si estamos cayendo y estamos por encima de la otra roca
                if (this.y < other.y) {
                    return other;
                }
            }
        }
        return null;
    }

    updatePhysics(deltaTime, aquarium) {
        // Si no está cayendo ni pivotando, no hacemos nada
        if (!this.isFalling && !this.isPivotating) return;

        // --- ESTADO 1: CAYENDO RECTO ---
        if (this.isFalling) {
            this.velocityY += this.gravity * deltaTime;
            this.y += this.velocityY * deltaTime;

            // Detección de Colisión (simplificada al suelo por ahora)
            const groundY = aquarium.height - aquarium.sandHeight;
            const bottomEdge = this.y; // 'y' es la base en este nuevo planteamiento

            if (bottomEdge >= groundY) {
                this.y = groundY;
                this.isFalling = false;

                // --- INICIAMOS EL PIVOTAJE ---
                this.isPivotating = true;
                this.velocityY = 0;

                // Decidimos hacia dónde pivotar (aleatorio por ahora, 
                // luego lo calcularemos según el punto de impacto exacto)
                this.pivotingDirection = (Math.random() < 0.5) ? -1 : 1;
            }
        }

        // --- ESTADO 2: PIVOTANDO ---
        if (this.isPivotating) {
            // 1. Rotar la roca
            this.angle += this.pivotingDirection * this.pivotingSpeed * deltaTime;

            // 2. Descender un poco para simular el asentamiento
            this.y += this.pivotingDescendSpeed * deltaTime;

            // 3. Comprobar ESTABILIZACIÓN
            // (Esta es la parte difícil. Necesitamos calcular si el OTRO extremo 
            // de la base irregular también ha chocado).

            // Lógica simplificada: paramos tras x grados de rotación
            if (Math.abs(this.angle) > 0.2) { // aprox 11 grados
                this.stopPivoting(aquarium);
            }
        }
    }

    stopPivoting(aquarium) {
        this.isPivotating = false;
        aquarium.addPlacedRock(this);
    }

    stopFalling(aquarium) {
        this.isFalling = false;
        this.velocityY = 0;

        // Simulación de "asentamiento": rotación ligera aleatoria (-5 a 5 grados)
        this.angle += (Math.random() - 0.5) * 0.1;

        aquarium.addPlacedRock(this);
    }

    render(mainCtx) {
        mainCtx.save(); // Guardamos el estado del canvas

        // 1. Mover el centro del canvas al punto de anclaje de la roca (su base central)
        mainCtx.translate(this.x, this.y);

        // 2. Aplicar rotación sobre ese punto
        mainCtx.rotate(this.angle);

        // 3. Dibujar la imagen. Como el translate ya nos ha puesto en la base central, 
        // dibujamos la imagen desplazada hacia arriba (negativo en Y) y centrada en X.
        const drawX = -(this.logicWidth / 2) - this.padding;
        const drawY = -(this.logicHeight) - this.padding; // La base está en Y=0
        const drawW = this.logicWidth + (this.padding * 2);
        const drawH = this.logicHeight + (this.padding * 2);

        mainCtx.drawImage(this.canvas, drawX, drawY, drawW, drawH);

        mainCtx.restore(); // Restauramos el estado
    }
}