const express = require("express");
const cors = require("cors");
const path = require("path");
const mqtt = require("mqtt");

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración MQTT
const MQTT_CONFIG = {
  broker: "mqtts://l46d1e5e.ala.us-east-1.emqxsl.com:8883",
  topic: "/class/idgs09/2022371134",
  username: "big-data-001",
  password: "1Q2W3E4R5T6Y",
};

// Cliente MQTT
let mqttClient = null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Rutas OTA
const otaRoutes = require("./routes/ota");
app.use("/api/ota", otaRoutes);

// Almacenamiento en memoria para los datos del sensor
let sensorData = {
  temperature: null,
  humidity: null,
  led_amarillo: 0,
  led_verde: 0,
  led_rojo: 0,
  state: "IDLE",
  timestamp: null,
  version: "1.0",
  uuid: "2020171026",
};

// Historial de datos (últimos 100 registros)
let dataHistory = [];

// NOTA: Este endpoint ya no se usa porque los datos ahora vienen por MQTT
// Mantenemos el endpoint por compatibilidad pero los datos reales vienen de MQTT
app.post("/api/sensor-data", (req, res) => {
  console.log(
    "⚠️  Endpoint POST /api/sensor-data llamado, pero los datos ahora vienen por MQTT"
  );
  console.log("Datos recibidos (ignorados):", req.body);

  res.json({
    success: true,
    message: "Endpoint disponible pero los datos se obtienen vía MQTT",
    note: "Los datos del dashboard se actualizan automáticamente desde el broker MQTT",
  });
});

// Endpoint para obtener los datos actuales del sensor
app.get("/api/sensor-data", (req, res) => {
  res.json({
    success: true,
    data: sensorData,
    lastUpdate: new Date(sensorData.timestamp * 1000).toISOString(),
  });
});

// Endpoint para obtener el historial de datos
app.get("/api/sensor-history", (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const history = dataHistory.slice(-limit);

  res.json({
    success: true,
    data: history,
    count: history.length,
  });
});

// Endpoint para obtener estadísticas
app.get("/api/sensor-stats", (req, res) => {
  if (dataHistory.length === 0) {
    return res.json({
      success: true,
      data: {
        minTemp: null,
        maxTemp: null,
        avgTemp: null,
        avgHumidity: null,
        totalReadings: 0,
      },
    });
  }

  const temperatures = dataHistory
    .map((d) => d.temperature)
    .filter((t) => t !== null);
  const humidities = dataHistory
    .map((d) => d.humidity)
    .filter((h) => h !== null);

  const stats = {
    minTemp: temperatures.length > 0 ? Math.min(...temperatures) : null,
    maxTemp: temperatures.length > 0 ? Math.max(...temperatures) : null,
    avgTemp:
      temperatures.length > 0
        ? Math.round(
            (temperatures.reduce((a, b) => a + b, 0) / temperatures.length) * 10
          ) / 10
        : null,
    avgHumidity:
      humidities.length > 0
        ? Math.round(
            (humidities.reduce((a, b) => a + b, 0) / humidities.length) * 10
          ) / 10
        : null,
    totalReadings: dataHistory.length,
  };

  res.json({
    success: true,
    data: stats,
  });
});

// Endpoint de estado del servidor
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    server: "Climate Dashboard Node.js HTTPS Server",
    version: "1.0.0",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    dataPoints: dataHistory.length,
    ssl: true,
  });
});

// Servir el dashboard (index.html) en la ruta raíz
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Función para conectar al broker MQTT
function connectMQTT() {
  console.log(`🔌 Conectando al broker MQTT: ${MQTT_CONFIG.broker}`);
  console.log(`🔌 Usuario: ${MQTT_CONFIG.username}`);
  console.log(`🔌 Tópico objetivo: ${MQTT_CONFIG.topic}`);

  const options = {
    username: MQTT_CONFIG.username,
    password: MQTT_CONFIG.password,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
    clean: true,
    rejectUnauthorized: false,
  };

  mqttClient = mqtt.connect(MQTT_CONFIG.broker, options);

  // Evento: Conexión exitosa
  mqttClient.on("connect", () => {
    console.log(`✅ Conectado al broker MQTT`);
    console.log(`📡 Suscribiéndose al tópico: ${MQTT_CONFIG.topic}`);

    mqttClient.subscribe(MQTT_CONFIG.topic, (err) => {
      if (err) {
        console.error(
          `❌ Error al suscribirse al tópico ${MQTT_CONFIG.topic}:`,
          err
        );
      } else {
        console.log(`✅ Suscrito exitosamente al tópico: ${MQTT_CONFIG.topic}`);
        console.log(`⏳ Esperando mensajes en tiempo real...`);
        console.log(`🔍 Según MQTT Explorer hay mensajes en este tópico`);
      }
    });

    // También suscribirse a un tópico comodín para ver si llegan mensajes
    mqttClient.subscribe("/class/idgs09/+", (err) => {
      if (!err) {
        console.log(`🔍 También escuchando tópicos comodín: /class/idgs09/+`);
      }
    });
  });

  // Evento: Mensaje recibido (CON LOGS DETALLADOS)
  mqttClient.on("message", (topic, message) => {
    try {
      console.log(
        `📨 Mensaje recibido del tópico ${topic}: ${message.toString()}`
      );

      // LOGS ADICIONALES:
      console.log("📋 Raw message buffer:", message);
      console.log("📋 Message length:", message.length);
      console.log("📋 Message as string:", message.toString());
      console.log("📋 Topic received:", topic);
      console.log("📋 Expected topic:", MQTT_CONFIG.topic);
      console.log("📋 Topic matches:", topic === MQTT_CONFIG.topic);

      const data = JSON.parse(message.toString());

      // LOG DEL OBJETO PARSEADO:
      console.log("📊 Parsed data object:", JSON.stringify(data, null, 2));
      console.log("📊 Data keys:", Object.keys(data));
      console.log("📊 Data values:", Object.values(data));

      // Actualizar datos actuales con los LEDs
      sensorData = {
        temperature: data.temperatura || data.temperature || null,
        humidity: data.humedad || data.humidity || null,
        led_amarillo: data.led_amarillo || 0,
        led_verde: data.led_verde || 0,
        led_rojo: data.led_rojo || 0,
        state: data.estado || data.state || "IDLE",
        timestamp: data.timestamp || Math.floor(Date.now() / 1000),
        version: data.version || "1.0",
        uuid: data.uuid || "2020171026",
      };

      // LOG DEL OBJETO SENSORDATA FINAL:
      console.log("📈 Final sensorData:", JSON.stringify(sensorData, null, 2));

      // Agregar al historial
      dataHistory.push({ ...sensorData });

      // Mantener solo los últimos 100 registros
      if (dataHistory.length > 100) dataHistory.shift();

      console.log(
        `📊 Datos actualizados desde MQTT. Historial: ${dataHistory.length} registros`
      );

      // LOG ADICIONAL DEL HISTORIAL:
      console.log(
        "📚 Last 3 history entries:",
        JSON.stringify(dataHistory.slice(-3), null, 2)
      );
    } catch (error) {
      console.error("❌ Error procesando mensaje MQTT:", error);
      console.error("❌ Message that caused error:", message.toString());
      console.error("❌ Error stack:", error.stack);
    }
  });

  // Evento: Error de conexión
  mqttClient.on("error", (error) => {
    console.error("❌ Error de conexión MQTT:", error);
  });

  // Evento: Conexión cerrada
  mqttClient.on("close", () => {
    console.warn("⚠️ Conexión MQTT cerrada");
  });

  // Evento: Reintento de conexión
  mqttClient.on("reconnect", () => {
    console.log("🔄 Reintentando conexión MQTT...");
  });
}

// Crear servidor HTTPS
app.listen(PORT, () => {
  connectMQTT();
  startHeartbeat();
  console.log(`Servidor en Render escuchando en puerto ${PORT}`);
  console.log(`🔗 Tópico configurado: ${MQTT_CONFIG.topic}`);
  console.log(`🔗 Broker: ${MQTT_CONFIG.broker}`);
});

// Manejo de errores
process.on("uncaughtException", (error) => {
  console.error("Error no capturado:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Promesa rechazada no manejada:", reason);
});

// Agregar este endpoint temporal para pruebas
app.post("/api/test-data", (req, res) => {
  console.log("🧪 Simulando datos de prueba...");

  const testData = {
    temperatura: "25.5",
    humedad: "60.0",
    led_amarillo: "1",
    led_verde: "0",
    led_rojo: "0",
    estado: "TEST",
    timestamp: Math.floor(Date.now() / 1000).toString(),
    version: "1.0",
    uuid: "2020171026",
  };

  // Simular el procesamiento como si viniera por MQTT
  sensorData = {
    temperature: parseFloat(testData.temperatura),
    humidity: parseFloat(testData.humedad),
    led_amarillo: parseInt(testData.led_amarillo),
    led_verde: parseInt(testData.led_verde),
    led_rojo: parseInt(testData.led_rojo),
    state: testData.estado,
    timestamp: parseInt(testData.timestamp),
    version: testData.version,
    uuid: testData.uuid,
  };

  dataHistory.push({ ...sensorData });
  if (dataHistory.length > 100) dataHistory.shift();

  console.log(
    "🧪 Datos de prueba agregados:",
    JSON.stringify(sensorData, null, 2)
  );

  res.json({
    success: true,
    message: "Datos de prueba agregados",
    data: sensorData,
  });
});

// Endpoint para ver versiones de firmware disponibles y comparar con ESP32
app.get("/api/firmware-versions", (req, res) => {
  const fs = require("fs");
  const uploadsPath = path.join(__dirname, "../uploads");

  try {
    // Leer archivos .bin en la carpeta uploads
    const files = fs.readdirSync(uploadsPath);
    const binFiles = files.filter((file) => file.endsWith(".bin"));

    const firmwareInfo = binFiles.map((file) => {
      const filePath = path.join(uploadsPath, file);
      const stats = fs.statSync(filePath);

      return {
        filename: file,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
        downloadUrl: `/api/ota/download/${file}`,
        // Extraer versión del nombre del archivo si sigue un patrón
        version: extractVersionFromFilename(file),
      };
    });

    // Información del ESP32 actual (si hay datos)
    const esp32Info = {
      currentVersion: sensorData.version || "Desconocida",
      uuid: sensorData.uuid || "Desconocido",
      lastSeen: sensorData.timestamp
        ? new Date(sensorData.timestamp * 1000).toISOString()
        : null,
      isOnline: sensorData.timestamp
        ? Math.floor(Date.now() / 1000) - sensorData.timestamp < 300
        : false, // 5 minutos
    };

    console.log(
      `🔍 Consultando versiones de firmware - ESP32: ${esp32Info.currentVersion}, Archivos disponibles: ${binFiles.length}`
    );

    res.json({
      success: true,
      esp32: esp32Info,
      availableFirmware: firmwareInfo,
      comparison: {
        needsUpdate: checkIfUpdateNeeded(
          esp32Info.currentVersion,
          firmwareInfo
        ),
        latestVersion: getLatestVersion(firmwareInfo),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error obteniendo versiones de firmware:", error);
    res.status(500).json({
      success: false,
      error: "Error obteniendo información de firmware",
      message: error.message,
    });
  }
});

// Función para extraer versión del nombre del archivo
function extractVersionFromFilename(filename) {
  // Buscar patrones como v1.0, version_1.2, firmware-2.1.bin, etc.
  const patterns = [
    /v(\d+\.\d+)/i, // v1.0, v2.1
    /version[_-](\d+\.\d+)/i, // version_1.0, version-2.1
    /firmware[_-](\d+\.\d+)/i, // firmware_1.0, firmware-2.1
    /(\d+\.\d+)/, // cualquier número con punto (1.0, 2.1)
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      return match[1];
    }
  }

  // Si no encuentra patrón, usar fecha del archivo o "desconocida"
  return "desconocida";
}

// Función para verificar si necesita actualización
function checkIfUpdateNeeded(currentVersion, firmwareList) {
  if (
    !currentVersion ||
    currentVersion === "Desconocida" ||
    firmwareList.length === 0
  ) {
    return { needed: false, reason: "Información insuficiente" };
  }

  const latestFirmware = getLatestVersion(firmwareList);
  if (!latestFirmware) {
    return { needed: false, reason: "No hay versiones disponibles" };
  }

  const current = parseVersion(currentVersion);
  const latest = parseVersion(latestFirmware.version);

  if (
    latest.major > current.major ||
    (latest.major === current.major && latest.minor > current.minor)
  ) {
    return {
      needed: true,
      reason: `Versión ${latestFirmware.version} disponible (actual: ${currentVersion})`,
      recommendedFile: latestFirmware.filename,
    };
  }

  return { needed: false, reason: "Firmware actualizado" };
}

// Función para obtener la versión más reciente
function getLatestVersion(firmwareList) {
  if (firmwareList.length === 0) return null;

  let latest = firmwareList[0];

  for (const firmware of firmwareList) {
    if (firmware.version === "desconocida") continue;

    const currentLatest = parseVersion(latest.version);
    const candidate = parseVersion(firmware.version);

    if (
      candidate.major > currentLatest.major ||
      (candidate.major === currentLatest.major &&
        candidate.minor > currentLatest.minor)
    ) {
      latest = firmware;
    }
  }

  return latest;
}

// Función para parsear versiones
function parseVersion(versionString) {
  if (!versionString || versionString === "desconocida") {
    return { major: 0, minor: 0 };
  }

  const parts = versionString.split(".");
  return {
    major: parseInt(parts[0]) || 0,
    minor: parseInt(parts[1]) || 0,
  };
}

// Función heartbeat para verificar que el servidor sigue funcionando
function startHeartbeat() {
  setInterval(() => {
    const now = new Date().toLocaleTimeString("es-ES");
    console.log(
      `💓 [${now}] Servidor activo - Datos en historial: ${dataHistory.length}`
    );

    if (mqttClient && mqttClient.connected) {
      console.log(
        `📡 [${now}] MQTT conectado - Último mensaje hace: ${
          sensorData.timestamp
            ? Math.floor(Date.now() / 1000) - sensorData.timestamp
            : "N/A"
        } segundos`
      );
    } else {
      console.log(`❌ [${now}] MQTT desconectado`);
    }
  }, 30000); // Cada 30 segundos
}
