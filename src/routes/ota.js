const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const router = express.Router();

// Configurar multer para subida de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../../uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Guardar como firmware.bin
    cb(null, "firmware.bin");
  },
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Solo aceptar archivos .bin
    if (path.extname(file.originalname).toLowerCase() === ".bin") {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten archivos .bin"), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
  },
});

// Información del firmware actual
let firmwareInfo = {
  version: "1.1.0",
  size: 0,
  md5: "",
  uploadDate: null,
  available: false,
};

// Función para calcular MD5 de un archivo
function calculateMD5(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

// Endpoint para subir nuevo firmware
router.post("/upload", upload.single("firmware"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionó archivo de firmware",
      });
    }

    const filePath = req.file.path;
    const stats = fs.statSync(filePath);
    const md5Hash = await calculateMD5(filePath);

    // Actualizar información del firmware
    firmwareInfo = {
      version: req.body.version || "1.1.0",
      size: stats.size,
      md5: md5Hash,
      uploadDate: new Date().toISOString(),
      available: true,
    };

    console.log("Nuevo firmware subido:", firmwareInfo);

    res.json({
      success: true,
      message: "Firmware subido exitosamente",
      firmware: firmwareInfo,
    });
  } catch (error) {
    console.error("Error subiendo firmware:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
});

// Endpoint para descargar firmware (usado por ESP32)
router.get("/firmware", (req, res) => {
  const firmwarePath = path.join(__dirname, "../../uploads/firmware.bin");

  if (!fs.existsSync(firmwarePath) || !firmwareInfo.available) {
    return res.status(404).json({
      success: false,
      message: "No hay firmware disponible",
    });
  }

  try {
    const stats = fs.statSync(firmwarePath);

    // Configurar headers para descarga
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", stats.size);
    res.setHeader("Content-Disposition", "attachment; filename=firmware.bin");
    res.setHeader("X-Firmware-Version", firmwareInfo.version);
    res.setHeader("X-Firmware-MD5", firmwareInfo.md5);

    // Enviar archivo
    const fileStream = fs.createReadStream(firmwarePath);
    fileStream.pipe(res);

    console.log("Firmware descargado por ESP32");
  } catch (error) {
    console.error("Error sirviendo firmware:", error);
    res.status(500).json({
      success: false,
      message: "Error sirviendo firmware",
    });
  }
});

// Endpoint para verificar actualizaciones (HEAD request)
router.head("/firmware", (req, res) => {
  const firmwarePath = path.join(__dirname, "../../uploads/firmware.bin");

  if (!fs.existsSync(firmwarePath) || !firmwareInfo.available) {
    return res.status(404).end();
  }

  try {
    const stats = fs.statSync(firmwarePath);

    // Configurar headers para verificación
    res.setHeader("Content-Length", stats.size);
    res.setHeader("X-Firmware-Version", firmwareInfo.version);
    res.setHeader("X-Firmware-MD5", firmwareInfo.md5);
    res.setHeader(
      "Last-Modified",
      new Date(firmwareInfo.uploadDate).toUTCString()
    );

    res.status(200).end();

    console.log("Verificación OTA realizada por ESP32");
  } catch (error) {
    console.error("Error en verificación OTA:", error);
    res.status(500).end();
  }
});

// Endpoint para obtener información del firmware (para dashboard)
router.get("/info", (req, res) => {
  res.json({
    success: true,
    firmware: firmwareInfo,
    currentVersion: "1.0.0", // Versión actual del ESP32
    changelog: [
      {
        version: "1.1.0",
        date: "2025-01-15",
        changes: [
          "Mejoras en la estabilidad de conexión Wi-Fi",
          "Optimización del consumo de energía",
          "Corrección de errores en lectura de sensores",
          "Nuevas funcionalidades de diagnóstico",
        ],
      },
      {
        version: "1.0.0",
        date: "2025-01-01",
        changes: [
          "Versión inicial del sistema",
          "Control de 3 LEDs por temperatura",
          "Conectividad MQTT y HTTPS",
          "Dashboard web integrado",
        ],
      },
    ],
  });
});

// Endpoint para forzar actualización (para dashboard)
router.post("/force-update", (req, res) => {
  if (!firmwareInfo.available) {
    return res.status(400).json({
      success: false,
      message: "No hay firmware disponible para actualizar",
    });
  }

  // En una implementación real, aquí se podría notificar al ESP32
  // Por ahora, solo confirmamos que la actualización está disponible
  res.json({
    success: true,
    message: "Actualización forzada iniciada",
    firmware: firmwareInfo,
  });

  console.log("Actualización forzada solicitada desde dashboard");
});

// Endpoint para eliminar firmware
router.delete("/firmware", (req, res) => {
  const firmwarePath = path.join(__dirname, "../../uploads/firmware.bin");

  try {
    if (fs.existsSync(firmwarePath)) {
      fs.unlinkSync(firmwarePath);
    }

    firmwareInfo = {
      version: "1.0.0",
      size: 0,
      md5: "",
      uploadDate: null,
      available: false,
    };

    res.json({
      success: true,
      message: "Firmware eliminado exitosamente",
    });

    console.log("Firmware eliminado");
  } catch (error) {
    console.error("Error eliminando firmware:", error);
    res.status(500).json({
      success: false,
      message: "Error eliminando firmware",
    });
  }
});

app.get("/api/ota/firmware", (req, res) => {
  const fs = require("fs");
  const path = require("path");
  const crypto = require("crypto");

  try {
    const uploadsPath = path.join(__dirname, "../uploads");

    // Buscar el archivo .bin más reciente
    const files = fs.readdirSync(uploadsPath);
    const binFiles = files.filter((file) => file.endsWith(".bin"));

    if (binFiles.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No firmware files available",
      });
    }

    // Ordenar por fecha de modificación (más reciente primero)
    const firmwareFiles = binFiles
      .map((file) => {
        const filePath = path.join(uploadsPath, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          path: filePath,
          mtime: stats.mtime,
          size: stats.size,
        };
      })
      .sort((a, b) => b.mtime - a.mtime);

    const latestFirmware = firmwareFiles[0];

    console.log(
      `📦 Sirviendo firmware: ${latestFirmware.filename} (${latestFirmware.size} bytes)`
    );

    // Extraer versión del nombre del archivo
    const version = extractVersionFromFilename(latestFirmware.filename);

    // Calcular MD5
    const fileBuffer = fs.readFileSync(latestFirmware.path);
    const md5Hash = crypto.createHash("md5").update(fileBuffer).digest("hex");

    console.log(`📋 Versión: ${version}, MD5: ${md5Hash}`);

    // Configurar headers
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", latestFirmware.size);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${latestFirmware.filename}"`
    );

    // Headers importantes para OTA
    res.setHeader("X-Firmware-Version", version);
    res.setHeader("X-Firmware-MD5", md5Hash);
    res.setHeader("X-Firmware-Size", latestFirmware.size.toString());
    res.setHeader("X-Firmware-Filename", latestFirmware.filename);

    // Para debug
    console.log(`🔍 Headers enviados:`);
    console.log(`   X-Firmware-Version: ${version}`);
    console.log(`   X-Firmware-MD5: ${md5Hash}`);
    console.log(`   X-Firmware-Size: ${latestFirmware.size}`);

    // Enviar archivo
    const fileStream = fs.createReadStream(latestFirmware.path);
    fileStream.pipe(res);

    fileStream.on("end", () => {
      console.log(
        `✅ Firmware enviado completamente: ${latestFirmware.filename}`
      );
    });

    fileStream.on("error", (error) => {
      console.error(`❌ Error enviando firmware:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error reading firmware file" });
      }
    });
  } catch (error) {
    console.error("❌ Error sirviendo firmware:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

// Función mejorada para extraer versión
function extractVersionFromFilename(filename) {
  console.log(`🔍 Extrayendo versión de: ${filename}`);

  const patterns = [
    /v?(\d+\.\d+(?:\.\d+)?)/i, // v1.0, v2.1.0, 1.0, 2.1.0
    /version[_-]?(\d+\.\d+)/i, // version_1.0, version-2.1
    /firmware[_-]?(\d+\.\d+)/i, // firmware_1.0, firmware-2.1
    /climate[_-]?(\d+\.\d+)/i, // climate_1.0, climate-2.1
    /esp32[_-]?(\d+\.\d+)/i, // esp32_1.0, esp32-2.1
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      console.log(`✅ Versión encontrada: ${match[1]} (patrón: ${pattern})`);
      return match[1];
    }
  }

  // Si no encuentra patrón, usar timestamp como versión
  const timestamp = Math.floor(Date.now() / 1000);
  const fallbackVersion = `1.${timestamp.toString().slice(-3)}`;
  console.log(`⚠️ No se encontró versión, usando fallback: ${fallbackVersion}`);
  return fallbackVersion;
}

// Endpoint para verificar versión (HEAD request)
app.head("/api/ota/firmware", (req, res) => {
  const fs = require("fs");
  const path = require("path");
  const crypto = require("crypto");

  try {
    const uploadsPath = path.join(__dirname, "../uploads");
    const files = fs.readdirSync(uploadsPath);
    const binFiles = files.filter((file) => file.endsWith(".bin"));

    if (binFiles.length === 0) {
      return res.status(404).end();
    }

    const firmwareFiles = binFiles
      .map((file) => {
        const filePath = path.join(uploadsPath, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          path: filePath,
          mtime: stats.mtime,
          size: stats.size,
        };
      })
      .sort((a, b) => b.mtime - a.mtime);

    const latestFirmware = firmwareFiles[0];
    const version = extractVersionFromFilename(latestFirmware.filename);
    const fileBuffer = fs.readFileSync(latestFirmware.path);
    const md5Hash = crypto.createHash("md5").update(fileBuffer).digest("hex");

    res.setHeader("X-Firmware-Version", version);
    res.setHeader("X-Firmware-MD5", md5Hash);
    res.setHeader("X-Firmware-Size", latestFirmware.size.toString());
    res.setHeader("Content-Length", latestFirmware.size);

    console.log(`🔍 HEAD request - Versión: ${version}, MD5: ${md5Hash}`);

    res.status(200).end();
  } catch (error) {
    console.error("❌ Error en HEAD request:", error);
    res.status(500).end();
  }
});

module.exports = router;
