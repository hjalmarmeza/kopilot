const API = "https://script.google.com/macros/s/AKfycbyz4FkiRpBQnYu4jRX4dudEy22TBnE2P0RmwX2vooFa2fIa2QPf0HLuo85bZkuplyNk/exec";

const App = {
    data: [],    // Pasajeros
    logs: [],    // Viajes
    deletedThisSession: new Set(), // Bloqueo de fantasmas

    init: () => {
        console.log("Kopilot 9.8 Premium Sync");
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
        const intro = document.getElementById('intro-screen');
        const content = document.getElementById('app-content');
        if (intro) intro.classList.add('hidden');
        if (content) setTimeout(() => content.classList.add('visible'), 300);
    },

    render: () => {
        const counts = {};
        App.logs.forEach(l => { counts[l.nombre] = (counts[l.nombre] || 0) + 1; });

        const g = document.getElementById('grid');
        if (!g) return;
        g.innerHTML = '';

        const visibleData = App.data.filter(p => !App.deletedThisSession.has(p.nombre.toLowerCase()));

        if (visibleData.length === 0) {
            g.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:white;opacity:0.3;">SIN PASAJEROS</div>`;
        } else {
            visibleData.forEach(p => {
                const cnt = counts[p.nombre] || 0;
                const el = document.createElement('div');
                el.className = 'glass-card';
                el.onmousedown = () => el.style.transform = 'scale(0.95)';
                el.onmouseup = () => el.style.transform = '';
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
                        <span style="font-weight:600; color:var(--c-text)">${x.nombre}</span>
                        <span class="log-date" style="color:var(--c-text-sec)">${x.time || '--:--'}</span>
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
        if (navigator.vibrate) navigator.vibrate(40);

        const now = new Date();
        const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        const tempId = 'temp-' + Date.now();

        // Proteccion local: Evitamos que el Sync inmediato nos borre el recien agregado
        const newTrip = {
            nombre: n,
            precio: p,
            time: time,
            id: tempId,
            timestamp: Date.now(),
            mesId: 'local' // Marca temporal
        };

        App.logs.unshift(newTrip);
        App.render();

        try {
            await fetch(`${API}?action=add_trip&nombre=${encodeURIComponent(n)}&precio=${p}`, { method: 'POST' });
            // Forzamos un sync leve despues de 1 segundo para asegurar que el ID real llegue
            setTimeout(() => App.sync(), 1500);
        } catch (e) { App.msg("Modo Offline"); }
    },

    sync: async () => {
        try {
            const t = Date.now();
            const [cR, sR] = await Promise.all([
                fetch(`${API}?action=get_config&t=${t}`),
                fetch(`${API}?action=get_summary&t=${t}`)
            ]);
            const conf = await cR.json();
            const sum = await sR.json();

            if (conf.status === 'success') {
                App.data = conf.passengers.filter(p => !App.deletedThisSession.has(p.nombre.toLowerCase()));
            }

            if (sum.status === 'success') {
                const serverLogs = [...sum.trips].reverse();
                const now = Date.now();
                const PROTECTION_TIME = 5000; // 5 segundos de proteccion para viajes locales

                // Mantenemos los viajes locales que todavia no aparecen en el servidor y son muy recientes
                const localRecent = App.logs.filter(l => {
                    const isLocal = String(l.id).startsWith('temp');
                    const isVeryFresh = (now - l.timestamp < PROTECTION_TIME);
                    const notInServer = !serverLogs.find(s => String(s.id) == String(l.id));
                    return isLocal && isVeryFresh && notInServer;
                });

                // Mezclamos: Servidor + Locales Recientes
                App.logs = [...localRecent, ...serverLogs];
            }
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

    saveP: async (e) => {
        e.preventDefault();
        const old = document.getElementById('eid').value;
        const n = document.getElementById('name').value;
        const p = document.getElementById('price').value;
        App.close();
        App.msg("Guardando...");
        const act = old ? 'edit_passenger' : 'add_passenger';
        try {
            await fetch(`${API}?action=${act}&nombre=${n}&precio=${p}&oldName=${old}`, { method: 'POST' });
            App.sync();
        } catch (e) { App.msg("Error"); }
    },

    del: async () => {
        if (!confirm("¿Eliminar Pasajero?")) return;
        const n = document.getElementById('eid').value;
        App.close();
        App.deletedThisSession.add(n.toLowerCase());
        App.data = App.data.filter(x => x.nombre.toLowerCase() !== n.toLowerCase());
        App.render();
        try {
            await fetch(`${API}?action=delete_passenger&nombre=${encodeURIComponent(n)}`, { method: 'POST' });
            setTimeout(() => App.sync(), 2000);
        } catch (e) { App.msg("Error"); }
    },

    msg: (t) => {
        const el = document.getElementById('toast');
        if (!el) return;
        el.innerText = t; el.classList.add('vis');
        setTimeout(() => el.classList.remove('vis'), 2000);
    },

    resetHistory: () => {
        if (!confirm("¿Resetear?")) return;
        App.logs = [];
        App.render();
        fetch(`${API}?action=reset_history`, { method: 'POST' });
    }
};

window.onload = App.init;
