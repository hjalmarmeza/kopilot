const API = "https://script.google.com/macros/s/AKfycbyz4FkiRpBQnYu4jRX4dudEy22TBnE2P0RmwX2vooFa2fIa2QPf0HLuo85bZkuplyNk/exec";

const App = {
    data: [],    // Pasajeros
    logs: [],    // Viajes

    init: () => {
        console.log("Kopilot 9.5 Fixed UI");
        const c = localStorage.getItem('k9.2_data');
        if (c) {
            const d = JSON.parse(c);
            App.data = d.p || [];
            App.logs = d.l || [];
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

    render: () => {
        const counts = {};
        App.logs.forEach(l => {
            counts[l.nombre] = (counts[l.nombre] || 0) + 1;
        });

        const g = document.getElementById('grid');
        g.innerHTML = '';
        if (App.data.length === 0) {
            g.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:white;opacity:0.7;">Sin Pasajeros</div>`;
        } else {
            App.data.forEach(p => {
                const cnt = counts[p.nombre] || 0;
                const el = document.createElement('div');
                el.className = 'glass-card';
                el.onclick = (e) => {
                    if (e.target.closest('.c-menu')) return;
                    App.add(p.nombre, p.precio);
                };
                el.innerHTML = `
                    <div class="c-bg-number">${cnt}</div>
                    <div class="c-menu" onclick="App.edit('${p.nombre}',${p.precio})">
                        <span class="material-icons-round" style="font-size:24px">more_horiz</span>
                    </div>
                    <div class="c-name">${p.nombre}</div>
                `;
                g.appendChild(el);
            });
        }

        const h = document.getElementById('history-list');
        h.innerHTML = '';
        if (App.logs.length === 0) {
            h.innerHTML = `<div style="text-align:center;padding:30px;color:white;opacity:0.6;">Sin viajes hoy</div>`;
        } else {
            App.logs.forEach(x => {
                const r = document.createElement('div');
                r.className = 'log-item';
                r.innerHTML = `
                    <div class="log-info">
                        <span style="font-weight:600">${x.nombre}</span>
                        <span class="log-date">${x.time || '--:--'}</span>
                    </div>
                    <button class="log-del" onclick="App.delLog('${x.id}', '${x.nombre}')">
                        <span class="material-icons-round" style="font-size:18px">close</span>
                    </button>
                `;
                h.appendChild(r);
            });
        }
        localStorage.setItem('k9.2_data', JSON.stringify({ p: App.data, l: App.logs }));
    },

    add: async (n, p) => {
        if (navigator.vibrate) navigator.vibrate(50);
        const now = new Date();
        const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        const tempId = 'temp-' + Date.now();
        const newTrip = { nombre: n, precio: p, time: time, id: tempId, timestamp: Date.now() };
        App.logs.unshift(newTrip);
        App.render();
        App.msg(`+1 ${n}`);
        try {
            const res = await fetch(`${API}?action=add_trip&nombre=${n}&precio=${p}`, { method: 'POST' });
            const json = await res.json();
            if (json.status === 'success' && json.id) {
                const trip = App.logs.find(x => x.id === tempId);
                if (trip) trip.id = json.id;
                App.render();
            }
        } catch (e) { App.msg("Modo Offline"); }
    },

    sync: async () => {
        try {
            const [cR, sR] = await Promise.all([
                fetch(`${API}?action=get_config`),
                fetch(`${API}?action=get_summary`)
            ]);
            const conf = await cR.json();
            const sum = await sR.json();
            if (conf.status === 'success') App.data = conf.passengers;
            if (sum.status === 'success') App.logs = [...sum.trips].reverse();
            App.render();
        } catch (e) { App.msg("Error de conexión"); }
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

    saveP: async (e) => {
        e.preventDefault();
        const old = document.getElementById('eid').value;
        const n = document.getElementById('name').value;
        const p = document.getElementById('price').value;
        App.close();
        App.msg("Guardando...");
        const act = old ? 'edit_passenger' : 'add_passenger';
        const q = new URLSearchParams({ action: act, nombre: n, precio: p, oldName: old });
        await fetch(`${API}?${q.toString()}`, { method: 'POST' });
        App.sync();
    },

    del: async () => {
        if (!confirm("¿Eliminar Pasajero?")) return;
        const n = document.getElementById('eid').value;
        App.close();
        App.msg("Eliminando...");
        try {
            // Esperamos que el servidor confirme el borrado
            const res = await fetch(`${API}?action=delete_passenger&nombre=${encodeURIComponent(n)}`, { method: 'POST' });
            const json = await res.json();
            if (json.status === 'success') {
                App.msg("Eliminado");
                App.sync(); // Refrescar datos reales
            } else {
                App.msg("Error al borrar");
            }
        } catch (e) {
            App.msg("Error de red");
        }
    },
    msg: (t) => {
        const el = document.getElementById('toast');
        el.innerText = t; el.classList.add('vis');
        setTimeout(() => el.classList.remove('vis'), 2000);
    }
};

window.onload = App.init;
