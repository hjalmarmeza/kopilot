const SHEET_ID = "1TThCjxBPbLsj4WtuNUaf1k4QmWqN81G3IQJ8BOd6NiQ"; 

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const params = e.parameter || {};
    const action = params.action;
    const ss = SpreadsheetApp.openById(SHEET_ID);
    
    // 1. OBTENER CONFIGURACIÓN (Con filtro estricto y limpieza de cache)
    if (action === "get_config") {
      let sheet = ss.getSheetByName("Config") || ss.insertSheet("Config");
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) return response({ status: "success", passengers: [] });
      
      data.shift(); 
      const passengers = data.map(row => ({
        nombre: String(row[0]).trim(),
        precio: row[1],
        activo: String(row[2]).toLowerCase() === "true" || row[2] === true
      })).filter(p => p.activo === true && p.nombre !== "");
      
      return response({ status: "success", passengers: passengers });
    }

    // 2. BORRAR PASAJERO (Garantizado)
    if (action === "delete_passenger") {
      const name = String(params.nombre).trim().toLowerCase();
      let sheet = ss.getSheetByName("Config");
      if (!sheet) return response({ status: "error" });
      
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const sheetName = String(data[i][0]).trim().toLowerCase();
        if (sheetName === name) {
           sheet.getRange(i + 1, 3).setValue(false); 
           SpreadsheetApp.flush(); // Fuerza el guardado físico en Google Sheets
           return response({ status: "success" });
        }
      }
      return response({ status: "not_found" });
    }

    // 3. AGREGAR / EDITAR PASAJERO
    if (action === "add_passenger" || action === "edit_passenger") {
      const isEdit = (action === "edit_passenger");
      const name = params.nombre;
      const price = params.precio;
      const oldName = params.oldName;
      
      let sheet = ss.getSheetByName("Config") || ss.insertSheet("Config");
      const data = sheet.getDataRange().getValues();
      
      let found = false;
      if (isEdit && oldName) {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][0]).trim().toLowerCase() === String(oldName).trim().toLowerCase()) {
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
      SpreadsheetApp.flush();
      return response({ status: "success" });
    }

    // 4. REGISTRAR VIAJE
    if (action === "add_trip") {
      const nombre = params.nombre;
      const precio = params.precio; 
      const fecha = new Date();
      const ts = fecha.getTime();
      
      let sheet = ss.getSheetByName("Viajes") || ss.insertSheet("Viajes");
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(["Fecha", "Hora", "Pasajero", "Precio", "MesID", "Timestamp", "ID"]);
      }
      
      const mesId = Utilities.formatDate(fecha, Session.getScriptTimeZone(), "yyyy-MM");
      const hora = Utilities.formatDate(fecha, Session.getScriptTimeZone(), "HH:mm");
      const dia = Utilities.formatDate(fecha, Session.getScriptTimeZone(), "yyyy-MM-dd");
      
      sheet.appendRow([dia, hora, nombre, precio, mesId, fecha.toString(), ts]);
      SpreadsheetApp.flush();
      return response({ status: "success", id: ts });
    }

    // 5. OBTENER RESUMEN
    if (action === "get_summary") {
       let sheet = ss.getSheetByName("Viajes");
       if (!sheet) return response({ status: "success", trips: [] });
       
       const data = sheet.getDataRange().getValues();
       if (data.length <= 1) return response({ status: "success", trips: [] });
       data.shift(); 
       
       const trips = data.map(row => {
         let dateStr = row[0];
         let timeStr = row[1];
         if (Object.prototype.toString.call(dateStr) === "[object Date]") {
            dateStr = Utilities.formatDate(dateStr, Session.getScriptTimeZone(), "yyyy-MM-dd");
         }
         if (Object.prototype.toString.call(timeStr) === "[object Date]") {
             timeStr = Utilities.formatDate(timeStr, Session.getScriptTimeZone(), "HH:mm");
         }
         return {
            date: dateStr,
            time: timeStr,
            nombre: row[2],
            mesId: row[4],
            id: row[6] 
         };
       }).filter(t => t.mesId);
       
       return response({ status: "success", trips: trips });
    }

    // 6. BORRAR VIAJE
    if (action === "delete_trip") {
       const tripId = params.id;
       let sheet = ss.getSheetByName("Viajes");
       const data = sheet.getDataRange().getValues();
       for (let i = 1; i < data.length; i++) {
         if (data[i][6] == tripId) { 
             sheet.deleteRow(i + 1);
             SpreadsheetApp.flush();
             return response({ status: "success" });
         }
       }
       return response({ status: "not_found" });
    }

    // 7. RESET HISTORY
    if (action === "reset_history") {
      const sheet = ss.getSheetByName("Viajes");
      if (sheet) {
        const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmm");
        sheet.setName("Backup_" + timestamp);
      }
      const newSheet = ss.insertSheet("Viajes");
      newSheet.appendRow(["Fecha", "Hora", "Pasajero", "Precio", "MesID", "Timestamp", "ID"]);
      SpreadsheetApp.flush();
      return response({ status: "success" });
    }

    return response({ status: "error", msg: "Acción desconocida" });
  } catch (err) {
    return response({ status: "error", msg: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function response(d) {
  return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON);
}
