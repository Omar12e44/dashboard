const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const router = express.Router();

// Configurar multer para subida de archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Guardar como firmware.bin
        cb(null, 'firmware.bin');
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        // Solo aceptar archivos .bin
        if (path.extname(file.originalname).toLowerCase() === '.bin') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos .bin'), false);
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB máximo
    }
});

// Información del firmware actual
let firmwareInfo = {
    version: '1.1.0',
    size: 0,
    md5: '',
    uploadDate: null,
    available: false
};

// Función para calcular MD5 de un archivo
function calculateMD5(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5');
        const stream = fs.createReadStream(filePath);
        
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

// Endpoint para subir nuevo firmware
router.post('/upload', upload.single('firmware'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No se proporcionó archivo de firmware'
            });
        }

        const filePath = req.file.path;
        const stats = fs.statSync(filePath);
        const md5Hash = await calculateMD5(filePath);

        // Actualizar información del firmware
        firmwareInfo = {
            version: req.body.version || '1.1.0',
            size: stats.size,
            md5: md5Hash,
            uploadDate: new Date().toISOString(),
            available: true
        };

        console.log('Nuevo firmware subido:', firmwareInfo);

        res.json({
            success: true,
            message: 'Firmware subido exitosamente',
            firmware: firmwareInfo
        });

    } catch (error) {
        console.error('Error subiendo firmware:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Endpoint para descargar firmware (usado por ESP32)
router.get('/firmware', (req, res) => {
    const firmwarePath = path.join(__dirname, '../../uploads/firmware.bin');
    
    if (!fs.existsSync(firmwarePath) || !firmwareInfo.available) {
        return res.status(404).json({
            success: false,
            message: 'No hay firmware disponible'
        });
    }

    try {
        const stats = fs.statSync(firmwarePath);
        
        // Configurar headers para descarga
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Content-Disposition', 'attachment; filename=firmware.bin');
        res.setHeader('X-Firmware-Version', firmwareInfo.version);
        res.setHeader('X-Firmware-MD5', firmwareInfo.md5);
        
        // Enviar archivo
        const fileStream = fs.createReadStream(firmwarePath);
        fileStream.pipe(res);
        
        console.log('Firmware descargado por ESP32');
        
    } catch (error) {
        console.error('Error sirviendo firmware:', error);
        res.status(500).json({
            success: false,
            message: 'Error sirviendo firmware'
        });
    }
});

// Endpoint para verificar actualizaciones (HEAD request)
router.head('/firmware', (req, res) => {
    const firmwarePath = path.join(__dirname, '../../uploads/firmware.bin');
    
    if (!fs.existsSync(firmwarePath) || !firmwareInfo.available) {
        return res.status(404).end();
    }

    try {
        const stats = fs.statSync(firmwarePath);
        
        // Configurar headers para verificación
        res.setHeader('Content-Length', stats.size);
        res.setHeader('X-Firmware-Version', firmwareInfo.version);
        res.setHeader('X-Firmware-MD5', firmwareInfo.md5);
        res.setHeader('Last-Modified', new Date(firmwareInfo.uploadDate).toUTCString());
        
        res.status(200).end();
        
        console.log('Verificación OTA realizada por ESP32');
        
    } catch (error) {
        console.error('Error en verificación OTA:', error);
        res.status(500).end();
    }
});

// Endpoint para obtener información del firmware (para dashboard)
router.get('/info', (req, res) => {
    res.json({
        success: true,
        firmware: firmwareInfo,
        currentVersion: '1.0.0', // Versión actual del ESP32
        changelog: [
            {
                version: '1.1.0',
                date: '2025-01-15',
                changes: [
                    'Mejoras en la estabilidad de conexión Wi-Fi',
                    'Optimización del consumo de energía',
                    'Corrección de errores en lectura de sensores',
                    'Nuevas funcionalidades de diagnóstico'
                ]
            },
            {
                version: '1.0.0',
                date: '2025-01-01',
                changes: [
                    'Versión inicial del sistema',
                    'Control de 3 LEDs por temperatura',
                    'Conectividad MQTT y HTTPS',
                    'Dashboard web integrado'
                ]
            }
        ]
    });
});

// Endpoint para forzar actualización (para dashboard)
router.post('/force-update', (req, res) => {
    if (!firmwareInfo.available) {
        return res.status(400).json({
            success: false,
            message: 'No hay firmware disponible para actualizar'
        });
    }

    // En una implementación real, aquí se podría notificar al ESP32
    // Por ahora, solo confirmamos que la actualización está disponible
    res.json({
        success: true,
        message: 'Actualización forzada iniciada',
        firmware: firmwareInfo
    });

    console.log('Actualización forzada solicitada desde dashboard');
});

// Endpoint para eliminar firmware
router.delete('/firmware', (req, res) => {
    const firmwarePath = path.join(__dirname, '../../uploads/firmware.bin');
    
    try {
        if (fs.existsSync(firmwarePath)) {
            fs.unlinkSync(firmwarePath);
        }
        
        firmwareInfo = {
            version: '1.0.0',
            size: 0,
            md5: '',
            uploadDate: null,
            available: false
        };
        
        res.json({
            success: true,
            message: 'Firmware eliminado exitosamente'
        });
        
        console.log('Firmware eliminado');
        
    } catch (error) {
        console.error('Error eliminando firmware:', error);
        res.status(500).json({
            success: false,
            message: 'Error eliminando firmware'
        });
    }
});

module.exports = router;

