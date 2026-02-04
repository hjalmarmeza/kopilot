const API = "https://script.google.com/macros/s/AKfycbyz4FkiRpBQnYu4jRX4dudEy22TBnE2P0RmwX2vooFa2fIa2QPf0HLuo85bZkuplyNk/exec";

const App = {
    data: [],    // Passengers Configuration
    logs: [],    // The Single Source of Truth for Trips

    init: () => {
        console.log("Kopilot 9.2 Strict Consistency");
        const c = localStorage.getItem('k9.2_data');
        if (c) {
            const d = JSON.parse(c);
            App.data = d.p || [];
            App.logs = d.l || [];
        }
        App.render(); // Render immediately with local data
        App.sync();   // Background sync
    },

    start: () => {
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
        document.getElementById('intro-screen').classList.add('hidden');
        setTimeout(() => {
            document.getElementById('app-content').classList.add('visible');
        }, 300);
    },

    // --- CORE RENDER LOGIC ---
    render: () => {
        // 1. Calculate Counts dynamically from Logs
        // This ensures Card Count ALWAYS equals Logs Count
        const counts = {};

        // Filter logs for current month only, if needed? 
        // User wants "Bitacora" and "Numbers" to match. 
        // Assuming current month reset logic is handled by server "Archive".
        // Use all current logs for counts.

        App.logs.forEach(l => {
            counts[l.nombre] = (counts[l.nombre] || 0) + 1;
        });

        // 2. Render Grid
        const g = document.getElementById('grid');
        g.innerHTML = '';
        if (App.data.length === 0) {
            g.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:white;opacity:0.7;">Sin Pasajeros</div>`;
        } else {
            App.data.forEach(p => {
                const cnt = counts[p.nombre] || 0;
                const init = p.nombre.charAt(0).toUpperCase(); // Fixed: Ensure clean name

                const el = document.createElement('div');
                el.className = 'glass-card';
                el.onclick = (e) => {
                    if (e.target.closest('.c-menu')) return;
                    App.add(p.nombre, p.precio);
                };
                el.innerHTML = `
                    <div class="c-badge">${cnt}</div>
                    <div class="c-menu" onclick="App.edit('${p.nombre}',${p.precio})">
                        <span class="material-icons-round" style="font-size:20px">more_horiz</span>
                    </div>
                    <div class="c-init">${init}</div>
                    <div class="c-name">${p.nombre}</div>
                `;
                g.appendChild(el);
            });
        }

        // 3. Render Logs
        const h = document.getElementById('history-list');
        h.innerHTML = '';

        if (App.logs.length === 0) {
            h.innerHTML = `<div style="text-align:center;padding:30px;color:white;opacity:0.6;">Sin viajes hoy</div>`;
        } else {
            App.logs.forEach(x => {
                const r = document.createElement('div');
                r.className = 'log-item';

                // Visual feedback for pending items
                const isTemp = String(x.id).startsWith('temp');
                if (isTemp) {
                    r.style.opacity = '0.7';
                    r.style.border = '1px dashed rgba(255,255,255,0.3)';
                }

                // Date/Time Parsing
                let fullStr = "--:--";
                if (x.time) {
                    // Try to parse if it's full date string
                    if (x.time.includes && x.time.includes('T')) {
                        const d = new Date(x.time);
                        fullStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
                    } else {
                        fullStr = x.time;
                    }
                }
                if (x.date) {
                    // Extract Date portion DD/MM
                    let day = '', mon = '';
                    if (x.date.includes && x.date.includes('-')) {
                        const parts = x.date.split('-');
                        if (parts.length === 3) { day = parts[2].substr(0, 2); mon = parts[1]; }
                    } else {
                        const d = new Date(x.date);
                        if (!isNaN(d)) { day = d.getDate(); mon = d.getMonth() + 1; }
                    }
                    if (day) fullStr += ` · ${day}/${mon}`;
                }

                r.innerHTML = `
                    <div class="log-info">
                        <span style="font-weight:600">${x.nombre}</span>
                        <span class="log-date">${fullStr}</span>
                    </div>
                    <button class="log-del" onclick="App.delLog('${x.id}', '${x.nombre}')">
                        <span class="material-icons-round" style="font-size:18px">close</span>
                    </button>
                `;
                h.appendChild(r);
            });
        }

        // Save State
        localStorage.setItem('k9.2_data', JSON.stringify({ p: App.data, l: App.logs }));
    },

    // --- ACTIONS ---

    add: async (n, p) => {
        if (navigator.vibrate) navigator.vibrate(50);

        const now = new Date();
        const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const tempId = 'temp-' + Date.now();

        // 1. Add to LOCAL Logs immediately
        const newTrip = {
            nombre: n,
            precio: p,
            time: time,
            date: date,
            id: tempId,
            mesId: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
            timestamp: Date.now() // For lag protection
        };

        App.logs.unshift(newTrip);
        App.render(); // Count updates instantly because counts are derived from logs
        App.msg(`+1 ${n}`);

        try {
            // 2. Send to Server
            const res = await fetch(`${API}?action=add_trip&nombre=${n}&precio=${p}`, { method: 'POST' });
            const json = await res.json();

            // 3. Update ID on success (Server returns real ID)
            if (json.status === 'success' && json.id) {
                const trip = App.logs.find(x => x.id === tempId);
                if (trip) trip.id = json.id; // Switch temp ID to real ID
                App.render();
            }

            // 4. Background Sync to ensure consistency
            // Wait a bit to let server propagate, then sync
            // setTimeout(App.sync, 5000); 

        } catch (e) {
            console.error(e);
            App.msg("Offline - Se guardó local");
        }
    },

    delLog: async (id, name) => {
        if (!confirm("¿Borrar este viaje?")) return;

        // 1. Remove from LOCAL Logs immediately
        App.logs = App.logs.filter(x => x.id != id);
        App.render();
        App.msg("Borrando...");

        // 2. Send Delete to Server
        if (!String(id).startsWith('temp')) {
            await fetch(`${API}?action=delete_trip&id=${id}`, { method: 'POST' });
        }
    },

    resetHistory: () => {
        if (!confirm("¿Borrar Bitácora y Contadores?")) return;
        App.logs = [];
        App.render();
        fetch(`${API}?action=reset_history`, { method: 'POST' });
        App.msg("Bitácora Limpia");
    },

    // --- SYNC ENGINE ---
    sync: async () => {
        const i = document.querySelector('.dock-btn:last-child span');
        if (i) i.classList.add('spin');

        try {
            const [cR, sR] = await Promise.all([
                fetch(`${API}?action=get_config`),
                fetch(`${API}?action=get_summary`)
            ]);

            const conf = await cR.json();
            const sum = await sR.json();

            if (conf.status === 'success') App.data = conf.passengers;

            if (sum.status === 'success') {
                const serverLogs = [...sum.trips].reverse(); // Newest first

                // INTELLIGENT MERGE
                // Goal: Keep local trips that server doesn't have yet (lag protection),
                // but remove trips that were actually deleted on server.

                const now = Date.now();
                const LAG_WINDOW = 60000; // 1 minute protection

                // 1. Keep any local log that is TEMP or VERY RECENT (created < 1 min ago)
                // even if server doesn't have it yet.
                const localProtected = App.logs.filter(l => {
                    const isTemp = String(l.id).startsWith('temp');
                    const isFresh = l.timestamp && (now - l.timestamp < LAG_WINDOW);
                    // Also keep if we just updated its ID but server list is stale
                    const inServer = serverLogs.find(s => s.id == l.id);
                    return (isTemp || isFresh) && !inServer;
                });

                // 2. Combine Server Logs + Local Protected Logs
                // Using a Map to deduplicate by ID just in case
                const finalMap = new Map();

                // Add Server Logs first (Truth)
                serverLogs.forEach(l => finalMap.set(String(l.id), l));

                // Add Protected Logs (Overlay)
                localProtected.forEach(l => finalMap.set(String(l.id), l));

                // Convert back to array and Sort by time/date desc
                // Since date format varies, simple reverse is usually ok if server list was ordered.
                // We'll trust the order we built: Protected usually newest.

                // Construct final array
                const merged = Array.from(finalMap.values());

                // Sort? Generally server returns chronological. Local are newest.
                // Let's just trust that serverLogs are sorted desc, and localProtected are newer.
                // We'll just put localProtected at top if they are not there.

                App.logs = merged; // For simplicity in this version

                // Re-sort to be safe: Pending/Newest at top
                App.logs.sort((a, b) => {
                    const isTempA = String(a.id).startsWith('temp');
                    const isTempB = String(b.id).startsWith('temp');
                    if (isTempA && !isTempB) return -1;
                    if (!isTempA && isTempB) return 1;
                    return 0; // Keep existing order for rest
                });
            }

            App.render();

        } catch (e) { App.msg("Offline Mode"); }
        finally { if (i) i.classList.remove('spin'); }
    },

    // --- UI/MODAL ---
    nav: (tab) => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');
        document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('active'));
        if (tab === 'passengers') document.querySelectorAll('.dock-btn')[0].classList.add('active');
        if (tab === 'history') document.querySelectorAll('.dock-btn')[1].classList.add('active');
    },

    openAdd: () => {
        document.getElementById('eid').value = '';
        document.getElementById('name').value = '';
        document.getElementById('price').value = '';
        document.getElementById('delBtn').style.display = 'none';
        document.getElementById('modal').classList.add('open');
        setTimeout(() => document.getElementById('name').focus(), 100);
    },
    edit: (n, p) => {
        document.getElementById('eid').value = n;
        document.getElementById('name').value = n;
        document.getElementById('price').value = p;
        document.getElementById('delBtn').style.display = 'flex';
        document.getElementById('modal').classList.add('open');
    },
    close: () => document.getElementById('modal').classList.remove('open'),

    saveP: async (e) => {
        e.preventDefault();
        const old = document.getElementById('eid').value;
        const n = document.getElementById('name').value;
        const p = document.getElementById('price').value;
        App.close();
        App.msg("Guardando...");
        if (old) {
            const ix = App.data.findIndex(x => x.nombre === old);
            if (ix >= 0) App.data[ix] = { nombre: n, precio: p, activo: true };
            // Update names in local logs too for consistency
            App.logs.forEach(l => { if (l.nombre === old) l.nombre = n; });
        }
        App.render();
        const act = old ? 'edit_passenger' : 'add_passenger';
        const q = new URLSearchParams({ action: act, nombre: n, precio: p, oldName: old, newName: n, newPrice: p });
        await fetch(`${API}?${q.toString()}`, { method: 'POST' });
        App.sync();
    },
    del: () => {
        if (!confirm("¿Eliminar Pasajero?")) return;
        const n = document.getElementById('eid').value;
        App.close();
        App.data = App.data.filter(x => x.nombre !== n);
        App.render();
        fetch(`${API}?action=delete_passenger&nombre=${n}`, { method: 'POST' });
    },
    msg: (t) => {
        const el = document.getElementById('toast');
        el.innerText = t; el.classList.add('vis');
        setTimeout(() => el.classList.remove('vis'), 2000);
    }
};

window.onload = App.init;
