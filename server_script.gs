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

    // --- 4. AGREGAR / EDITAR PASAJERO ---
    if (action === "add_passenger" || action === "edit_passenger") {
      const isEdit = (action === "edit_passenger");
      const name = params.nombre;
      const price = params.precio;
      const oldName = params.oldName;
      
      let sheet = ss.getSheetByName("Config");
      if (!sheet) {
        sheet = ss.insertSheet("Config");
        sheet.appendRow(["Nombre", "Precio", "Activo"]);
      }
      const data = sheet.getDataRange().getValues();
      
      let found = false;
      if (isEdit && oldName) {
        for (let i = 1; i < data.length; i++) {
          if (data[i][0] == oldName) {
             sheet.getRange(i + 1, 1).setValue(name);
             sheet.getRange(i + 1, 2).setValue(price);
             sheet.getRange(i + 1, 3).setValue(true);
             found = true; 
             break;
          }
        }
      } else {
        sheet.appendRow([name, price, true]);
        found = true;
      }
      return response({ status: "success" });
    }

    // --- 5. BORRAR PASAJERO (Desactivar) ---
    if (action === "delete_passenger") {
      const name = params.nombre;
      let sheet = ss.getSheetByName("Config");
      if (!sheet) return response({ status: "error", message: "No hay hoja Config" });
      
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] == name) {
           // Marcamos como Activo = false en la columna C
           sheet.getRange(i + 1, 3).setValue(false); 
           return response({ status: "success", message: "Pasajero desactivado" });
        }
      }
      return response({ status: "error", message: "Pasajero no encontrado" });
    }

    // --- 6. BORRAR UN SOLO VIAJE ---
    if (action === "delete_trip") {
       const tripId = params.id;
       let sheet = ss.getSheetByName("Viajes");
       if (!sheet) return response({ status: "error" });
       
       const data = sheet.getDataRange().getValues();
       for (let i = 1; i < data.length; i++) {
         if (data[i][6] == tripId) { // Asumiendo que el ID está en la columna G
             sheet.deleteRow(i + 1);
             return response({ status: "success" });
         }
       }
       return response({ status: "not_found" });
    }

    // --- 7. RESETEAR HISTORIAL ---
    if (action === "reset_history") {
      const sheet = ss.getSheetByName("Viajes");
      if (sheet) {
        const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmm");
        sheet.setName("Backup_" + timestamp);
      }
      const newSheet = ss.insertSheet("Viajes");
      newSheet.appendRow(["Fecha", "Hora", "Pasajero", "Precio", "MesID", "Timestamp", "ID"]);
      return response({ status: "success" });
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
