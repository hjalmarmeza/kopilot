// CONFIGURACIÓN (¡PON TU ID AQUÍ!)
const SHEET_ID = "1S2d3F4g5H6j7K8l9"; // REEMPLAZAR CON ID REAL

/*
  RIDETALLY SERVER v1.0
  Backend para gestión de viajes compartidos.
*/

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  // Lock para evitar colisiones si tocas botones muy rápido
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const params = e.parameter || {};
    const action = params.action;
    
    // Abrir Hoja
    const ss = SpreadsheetApp.openById(SHEET_ID);
    
    // --- 1. OBTENER CONFIGURACIÓN (Pasajeros) ---
    if (action === "get_config") {
      let sheet = ss.getSheetByName("Config");
      if (!sheet) {
        // Crear hoja y datos demo si no existe
        sheet = ss.insertSheet("Config");
        sheet.appendRow(["Nombre", "Precio", "Activo", "Telefono"]);
        sheet.appendRow(["Pasajero 1", 5.00, true, "51999999999"]);
      }
      
      const data = sheet.getDataRange().getValues();
      const headers = data.shift(); // Quitar cabecera
      
      const passengers = data.map(row => ({
        nombre: row[0],
        precio: row[1],
        activo: row[2],
        telefono: row[3]
      })).filter(p => p.activo === true);
      
      return response({ status: "success", passengers: passengers });
    }

    // --- 2. REGISTRAR VIAJE (Pim Pam Pum) ---
    if (action === "add_trip") {
      const nombre = params.nombre;
      const precio = params.precio; // El precio se envía desde la app (que lo leyó de config)
      const fecha = new Date();
      
      let sheet = ss.getSheetByName("Viajes");
      if (!sheet) {
        sheet = ss.insertSheet("Viajes");
        sheet.appendRow(["Fecha", "Hora", "Pasajero", "Precio", "MesID", "Timestamp"]);
      }
      
      // Formato Mes (ej: "2024-02") para agrupar
      const mesId = Utilities.formatDate(fecha, Session.getScriptTimeZone(), "yyyy-MM");
      const hora = Utilities.formatDate(fecha, Session.getScriptTimeZone(), "HH:mm:ss");
      const dia = Utilities.formatDate(fecha, Session.getScriptTimeZone(), "yyyy-MM-dd");
      
      sheet.appendRow([dia, hora, nombre, precio, mesId, new Date()]);
      
      return response({ status: "success", message: "Viaje registrado", passenger: nombre });
    }

     // --- 3. OBTENER RESUMEN (Para cobrar) ---
    if (action === "get_summary") {
       let sheet = ss.getSheetByName("Viajes");
       if (!sheet) return response({ status: "success", trips: [] });
       
       const data = sheet.getDataRange().getValues();
       data.shift(); // Quitar header
       
       // Devolvemos la data cruda y el frontend calcula los totales
       // Optimizamos enviando solo lo necesario
       const trips = data.map(row => ({
         fecha: row[0],
         nombre: row[2],
         precio: row[3],
         mesId: row[4]
       }));
       
       return response({ status: "success", trips: trips });
    }
    
    return response({ status: "error", message: "Acción desconocida" });

  } catch (err) {
    return response({ status: "error", message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// Helper para respuesta JSON estándar
function response(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
