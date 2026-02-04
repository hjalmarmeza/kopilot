const API = "https://script.google.com/macros/s/AKfycbyz4FkiRpBQnYu4jRX4dudEy22TBnE2P0RmwX2vooFa2fIa2QPf0HLuo85bZkuplyNk/exec";

const App = {
    data: [],    // Passenger Config
    counts: {},  // Server Confirmed Counts
    logs: [],    // Server Logs
    pending: [], // Local unsynced trips

    init: () => {
        console.log("Kopilot 9.0 Optimistic Merge");
        const c = localStorage.getItem('k9_data');
        if (c) {
            const d = JSON.parse(c);
            App.data = d.p || [];
            App.counts = d.c || {};
            // If we had pending trips from previous session try to resend? 
            // For simplicity in v1, we start clean pending, but keep counts high
        }
        App.render();
        App.sync();
    },

    start: () => {
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
        document.getElementById('intro-screen').classList.add('hidden');
        setTimeout(() => {
            document.getElementById('app-content').classList.add('visible');
        }, 300);
    },

    // --- SMART SYNC ---
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

            // Recalculate Base Server Counts
            const serverCounts = {};
            const serverLogs = [];

            const now = new Date();
            const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            if (sum.status === 'success') {
                // Reverse to have newest first
                serverLogs.push(...[...sum.trips].reverse());

                sum.trips.forEach(t => {
                    if (t.mesId === m) serverCounts[t.nombre] = (serverCounts[t.nombre] || 0) + 1;
                });
            }

            // Update App State
            App.counts = serverCounts;
            App.logs = serverLogs;

            // Save to Cache
            localStorage.setItem('k9_data', JSON.stringify({ p: App.data, c: App.counts }));

            // Re-render (This will merge pending on top)
            App.render();

        } catch (e) {
            console.error(e);
            App.msg("Offline - Mostrando local");
        } finally {
            if (i) i.classList.remove('spin');
        }
    },

    // --- RENDER WITH MERGE ---
    render: () => {
        // 1. Calculate Display Counts (Server + Pending)
        const displayCounts = { ...App.counts };
        App.pending.forEach(p => {
            displayCounts[p.nombre] = (displayCounts[p.nombre] || 0) + 1;
        });

        // 2. Render Grid
        const g = document.getElementById('grid');
        g.innerHTML = '';
        if (App.data.length === 0) {
            g.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:white;opacity:0.7;">Sin Pasajeros</div>`;
        } else {
            App.data.forEach(p => {
                const cnt = displayCounts[p.nombre] || 0;
                const init = p.nombre.charAt(0).toUpperCase();

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

        // 3. Render Logs (Merge Pending Logs at top)
        const h = document.getElementById('history-list');
        h.innerHTML = '';

        // Merge real logs + pending logs
        const displayLogs = [...App.pending, ...App.logs];

        if (displayLogs.length === 0) {
            h.innerHTML = `<div style="text-align:center;padding:30px;color:white;opacity:0.6;">Sin viajes hoy</div>`;
        } else {
            displayLogs.forEach(x => {
                const r = document.createElement('div');
                r.className = 'log-item';
                if (x.isPending) r.style.opacity = '0.7'; // Visual hint it's pending

                let displayTime = "";
                let displayDate = "";

                // Logic to display date/time
                if (x.isPending) {
                    displayTime = "Enviando...";
                } else {
                    if (x.time) {
                        const t = new Date(x.time); function isDate(d) { return !isNaN(d.getTime()) }
                        displayTime = isDate(t) ? `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}` : x.time;
                    }
                    if (x.date) {
                        const d = new Date(x.date);
                        if (!isNaN(d.getTime())) {
                            displayDate = `${d.getDate()}/${d.getMonth() + 1}`;
                            if (!displayTime && d.getHours()) displayTime = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
                        } else {
                            displayDate = String(x.date).substring(0, 10);
                        }
                    }
                }

                let fullStr = displayTime || '--:--';
                if (displayDate) fullStr += ` · ${displayDate}`;

                // Only allow deleting confirmed logs with ID
                let delBtn = '';
                if (!x.isPending) {
                    delBtn = `<button class="log-del" onclick="App.delLog('${x.id}', '${x.nombre}')">
                        <span class="material-icons-round" style="font-size:18px">close</span>
                    </button>`;
                } else {
                    delBtn = `<span class="material-icons-round spin" style="font-size:18px; opacity:0.5;">sync</span>`;
                }

                r.innerHTML = `
                    <div class="log-info">
                        <span style="font-weight:600">${x.nombre}</span>
                        <span class="log-date">${fullStr}</span>
                    </div>
                    ${delBtn}
                `;
                h.appendChild(r);
            });
        }
    },

    // --- ADD WITH QUEUE ---
    add: async (n, p) => {
        if (navigator.vibrate) navigator.vibrate(50);

        // Create Temp Pending Trip
        const tempId = 'pending-' + Date.now();
        const tempTrip = {
            nombre: n,
            id: tempId,
            isPending: true,
            timestamp: Date.now()
        };

        // Add to Queue
        App.pending.unshift(tempTrip);

        // Update UI Immediately
        App.render();

        try {
            // Send to Server
            await fetch(`${API}?action=add_trip&nombre=${n}&precio=${p}`, { method: 'POST' });

            // On Success: Remove from pending. 
            // The next sync() will bring it back as a real confirmed trip.
            // But to avoid flicker, we can wait for next sync.
            // A simple strategy: Clean pending only after a purposeful sync
            // For now, let's remove this specific pending item, assuming server has it.

            App.pending = App.pending.filter(x => x.id !== tempId);

            // NOW trigger sync to fetch the "Real" version of this trip
            App.sync(); // This will fill App.counts and App.logs correctly

        } catch (e) {
            console.error("Failed to send", e);
            App.msg("Error de red - Reintentando...");
            // Keep in pending? For now just UI feedback
        }
    },

    delLog: async (id, name) => {
        if (!confirm("¿Borrar este viaje?")) return;
        App.logs = App.logs.filter(x => x.id != id);
        if (App.counts[name] > 0) App.counts[name]--;
        App.render(); // Optimistic update
        App.msg("Borrando...");
        await fetch(`${API}?action=delete_trip&id=${id}`, { method: 'POST' });
    },

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

    save: async (e) => {
        e.preventDefault();
        const old = document.getElementById('eid').value;
        const n = document.getElementById('name').value;
        const p = document.getElementById('price').value;
        App.close();
        App.msg("Guardando...");

        if (old) {
            const ix = App.data.findIndex(x => x.nombre === old);
            if (ix >= 0) App.data[ix] = { nombre: n, precio: p, activo: true };
        }
        App.render();
        const act = old ? 'edit_passenger' : 'add_passenger';
        const q = new URLSearchParams({ action: act, nombre: n, precio: p, oldName: old, newName: n, newPrice: p });
        await fetch(`${API}?${q.toString()}`, { method: 'POST' });
        App.sync();
    },

    del: () => {
        if (!confirm("¿Eliminar?")) return;
        const n = document.getElementById('eid').value;
        App.close();
        App.data = App.data.filter(x => x.nombre !== n);
        App.render();
        fetch(`${API}?action=delete_passenger&nombre=${n}`, { method: 'POST' });
    },

    resetHistory: () => {
        if (!confirm("¿Borrar Historial?")) return;
        App.logs = []; App.counts = {}; App.pending = [];
        App.render();
        fetch(`${API}?action=reset_history`, { method: 'POST' });
        App.msg("Bitácora Limpia");
    },

    msg: (t) => {
        const el = document.getElementById('toast');
        el.innerText = t; el.classList.add('vis');
        setTimeout(() => el.classList.remove('vis'), 2000);
    }
};

window.onload = App.init;
