const API = "https://script.google.com/macros/s/AKfycbyz4FkiRpBQnYu4jRX4dudEy22TBnE2P0RmwX2vooFa2fIa2QPf0HLuo85bZkuplyNk/exec";

const App = {
    data: [],    // Pasajeros
    logs: [],    // Viajes
    deletedThisSession: new Set(), // Bloqueo de fantasmas

    init: () => {
        console.log("Kopilot 9.7 Ghost-Free UI");
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
        document.getElementById('intro-screen').classList.add('hidden');
        setTimeout(() => document.getElementById('app-content').classList.add('visible'), 300);
    },

    render: () => {
        const counts = {};
        App.logs.forEach(l => { counts[l.nombre] = (counts[l.nombre] || 0) + 1; });

        const g = document.getElementById('grid');
        if (!g) return;
        g.innerHTML = '';

        // Filtramos para asegurar que ningun borrado aparezca
        const visibleData = App.data.filter(p => !App.deletedThisSession.has(p.nombre.toLowerCase()));

        if (visibleData.length === 0) {
            g.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:white;opacity:0.7;">Sin Pasajeros</div>`;
        } else {
            visibleData.forEach(p => {
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
        if (h) {
            h.innerHTML = '';
            App.logs.forEach(x => {
                const r = document.createElement('div');
                r.className = 'log-item';
                r.innerHTML = `
                    <div class="log-info">
                        <span style="font-weight:600; color:#333">${x.nombre}</span>
                        <span class="log-date" style="color:#666">${x.time || '--:--'}</span>
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
        try {
            const res = await fetch(`${API}?action=add_trip&nombre=${encodeURIComponent(n)}&precio=${p}`, { method: 'POST' });
        } catch (e) { App.msg("Offline"); }
    },

    sync: async () => {
        try {
            const t = Date.now(); // Cache busting
            const [cR, sR] = await Promise.all([
                fetch(`${API}?action=get_config&t=${t}`),
                fetch(`${API}?action=get_summary&t=${t}`)
            ]);
            const conf = await cR.json();
            const sum = await sR.json();
            if (conf.status === 'success') {
                // Filtro anti-fantasmas: ignoramos lo que acabamos de borrar
                App.data = conf.passengers.filter(p => !App.deletedThisSession.has(p.nombre.toLowerCase()));
            }
            if (sum.status === 'success') App.logs = [...sum.trips].reverse();
            App.render();
        } catch (e) { console.log("Sync error"); }
    },

    edit: (n, p) => {
        document.getElementById('eid').value = n;
        document.getElementById('name').value = n;
        document.getElementById('price').value = p;
        document.getElementById('delBtn').style.display = 'flex';
        document.getElementById('modal').classList.add('open');
    },

    close: () => document.getElementById('modal').classList.remove('open'),

    del: async () => {
        if (!confirm("¿Eliminar definitivamente?")) return;
        const n = document.getElementById('eid').value;
        App.close();

        // 1. Bloqueo local inmediato (Anti-fantasmas)
        App.deletedThisSession.add(n.toLowerCase());
        App.data = App.data.filter(x => x.nombre.toLowerCase() !== n.toLowerCase());
        App.render();
        App.msg("Eliminando...");

        try {
            const res = await fetch(`${API}?action=delete_passenger&nombre=${encodeURIComponent(n)}`, { method: 'POST' });
            const json = await res.json();
            if (json.status === 'success') {
                App.msg("Eliminado de la nube");
                setTimeout(() => App.sync(), 2000); // Sincronizamos despues de 2 seg para dar tiempo al Sheet
            }
        } catch (e) { App.msg("Error de red"); }
    },

    msg: (t) => {
        const el = document.getElementById('toast');
        if (!el) return;
        el.innerText = t; el.classList.add('vis');
        setTimeout(() => el.classList.remove('vis'), 2000);
    }
};

window.onload = App.init;
