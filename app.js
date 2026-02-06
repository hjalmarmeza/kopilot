const API = "https://script.google.com/macros/s/AKfycbyz4FkiRpBQnYu4jRX4dudEy22TBnE2P0RmwX2vooFa2fIa2QPf0HLuo85bZkuplyNk/exec";

const App = {
    data: [],
    logs: [],
    deletedThisSession: new Set(),

    init: () => {
        console.log("Kopilot 10.6 Premium Engine Initialized");
        const cache = localStorage.getItem('k10_data');
        if (cache) {
            const d = JSON.parse(cache);
            App.data = d.p || [];
            App.logs = d.l || [];
        }
        App.render();
        App.sync();
    },

    start: () => {
        if (navigator.vibrate) navigator.vibrate(50);
        document.getElementById('intro-screen').classList.add('hidden');
        document.getElementById('app-content').classList.add('visible');
    },

    nav: (target) => {
        if (navigator.vibrate) navigator.vibrate(20);
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.getElementById('tab-' + target).classList.add('active');

        document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('active'));
        const btns = document.querySelectorAll('.dock-btn');
        if (target === 'passengers') btns[0].classList.add('active');
        if (target === 'history') btns[1].classList.add('active');
    },

    render: () => {
        const counts = {};
        App.logs.forEach(l => { counts[l.nombre] = (counts[l.nombre] || 0) + 1; });

        // 1. GRID RENDER
        const grid = document.getElementById('grid');
        if (grid) {
            grid.innerHTML = '';
            const visible = App.data.filter(p => !App.deletedThisSession.has(p.nombre.toLowerCase()));

            if (visible.length === 0) {
                grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:100px;opacity:0.3;font-weight:700;">AGREGAR PASAJERO</div>`;
            } else {
                visible.forEach(p => {
                    const cnt = counts[p.nombre] || 0;
                    const card = document.createElement('div');
                    card.className = 'glass-card';

                    // Lógica para achicar fuente y asegurar que el nombre quepa SIEMPRE
                    let fontSize = '1.1rem';
                    if (p.nombre.length > 7) fontSize = '0.9rem';
                    if (p.nombre.length > 10) fontSize = '0.8rem';
                    if (p.nombre.length > 13) fontSize = '0.7rem';
                    if (p.nombre.length > 16) fontSize = '0.6rem';
                    if (p.nombre.length > 20) fontSize = '0.5rem';

                    card.onclick = (e) => {
                        if (e.target.closest('.c-menu')) return;
                        App.add(p.nombre, p.precio);
                    };
                    card.innerHTML = `
                        <div class="c-bg-number">${cnt}</div>
                        <div class="c-name" style="font-size: ${fontSize}">${p.nombre}</div>
                        <div class="c-menu" onclick="App.edit('${p.nombre}',${p.precio})">
                            <span class="material-icons-round">more_horiz</span>
                        </div>
                    `;
                    grid.appendChild(card);
                });
            }
        }

        // 2. HISTORY RENDER
        const list = document.getElementById('history-list');
        if (list) {
            list.innerHTML = '';
            if (App.logs.length === 0) {
                list.innerHTML = `<div style="text-align:center;padding:50px;opacity:0.3;">LISTA VACÍA</div>`;
            } else {
                [...App.logs].forEach(x => {
                    const row = document.createElement('div');
                    row.className = 'log-item';

                    let dateLabel = x.time || '--:--';
                    if (x.date) {
                        const parts = x.date.split('-');
                        if (parts.length === 3) dateLabel += ` • ${parts[2]}/${parts[1]}`;
                    }

                    row.innerHTML = `
                        <div class="log-info">
                            <span class="log-name">${x.nombre}</span>
                            <span class="log-date">${dateLabel}</span>
                        </div>
                        <button class="log-del" onclick="App.delLog('${x.id}')">
                            <span class="material-icons-round">close</span>
                        </button>
                    `;
                    list.appendChild(row);
                });
            }
        }

        localStorage.setItem('k10_data', JSON.stringify({ p: App.data, l: App.logs }));
    },

    sync: async () => {
        try {
            const t = Date.now();
            const [rConf, rSum] = await Promise.all([
                fetch(`${API}?action=get_config&t=${t}`),
                fetch(`${API}?action=get_summary&t=${t}`)
            ]);
            const conf = await rConf.json();
            const sum = await rSum.json();

            if (conf.status === 'success') {
                App.data = conf.passengers.filter(p => !App.deletedThisSession.has(p.nombre.toLowerCase()));
            }
            if (sum.status === 'success') {
                const sLogs = [...sum.trips].reverse();
                const now = Date.now();
                // 1. Filtrar registros temporales frescos (menos de 7 seg)
                const fresh = App.logs.filter(l => String(l.id).startsWith('temp') && (now - l.timestamp < 7000));

                // 2. Filtrar logs del servidor que YA están representados por los locales frescos
                // Buscamos coincidencia por nombre y cercanía de tiempo
                const sFiltered = sLogs.filter(s => {
                    const isAlreadyInFresh = fresh.some(f => f.nombre === s.nombre && Math.abs(f.timestamp - s.id) < 8000);
                    return !isAlreadyInFresh;
                });

                App.logs = [...fresh, ...sFiltered];

                // 3. Limpieza final: si hay duplicados literales por ID
                const seen = new Set();
                App.logs = App.logs.filter(l => {
                    const k = l.id;
                    if (seen.has(k)) return false;
                    seen.add(k);
                    return true;
                });
            }
            App.render();
        } catch (e) {
            console.error(e);
            App.msg("Sincronización Offline");
        }
    },

    add: async (n, p) => {
        if (navigator.vibrate) navigator.vibrate(40);
        const now = new Date();
        const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        const tempId = 'temp-' + Date.now();

        const newTrip = {
            nombre: n, precio: p, time: time, id: tempId,
            timestamp: Date.now(), date: now.toISOString().split('T')[0]
        };

        App.logs.unshift(newTrip);
        App.render();
        App.msg(`REGISTRADO: ${n}`);

        try {
            await fetch(`${API}?action=add_trip&nombre=${encodeURIComponent(n)}&precio=${p}`, { method: 'POST' });
            setTimeout(() => App.sync(), 2000);
        } catch (e) { App.msg("Guardado en Memoria"); }
    },

    delLog: async (id) => {
        if (!confirm("¿Eliminar registro?")) return;
        App.logs = App.logs.filter(x => x.id != id);
        App.render();
        try {
            if (!String(id).startsWith('temp')) {
                await fetch(`${API}?action=delete_trip&id=${id}`, { method: 'POST' });
            }
        } catch (e) { console.error(e); }
    },

    openAdd: () => {
        document.getElementById('eid').value = '';
        document.getElementById('name').value = '';
        document.getElementById('price').value = '';
        document.getElementById('delBtn').style.display = 'none';
        document.getElementById('modal').classList.add('open');
        setTimeout(() => document.getElementById('name').focus(), 200);
    },

    edit: (n, p) => {
        document.getElementById('eid').value = n;
        document.getElementById('name').value = n;
        document.getElementById('price').value = p;
        document.getElementById('delBtn').style.display = 'flex';
        document.getElementById('modal').classList.add('open');
    },

    close: () => {
        document.getElementById('modal').classList.remove('open');
    },

    saveP: async (e) => {
        e.preventDefault();
        const old = document.getElementById('eid').value;
        const n = document.getElementById('name').value;
        const p = document.getElementById('price').value;
        App.close();
        const act = old ? 'edit_passenger' : 'add_passenger';
        try {
            await fetch(`${API}?action=${act}&nombre=${n}&precio=${p}&oldName=${old}`, { method: 'POST' });
            App.sync();
        } catch (e) { App.msg("Error"); }
    },

    del: async () => {
        if (!confirm("¿Eliminar Pasajero permanentemente?")) return;
        const n = document.getElementById('eid').value;
        App.close();
        App.deletedThisSession.add(n.toLowerCase());
        App.data = App.data.filter(x => x.nombre.toLowerCase() !== n.toLowerCase());
        App.render();
        try {
            await fetch(`${API}?action=delete_passenger&nombre=${encodeURIComponent(n)}`, { method: 'POST' });
            setTimeout(() => App.sync(), 2500);
        } catch (e) { App.msg("Error de red"); }
    },

    resetHistory: () => {
        if (!confirm("¿Limpiar toda la bitácora?")) return;
        App.logs = [];
        App.render();
        fetch(`${API}?action=reset_history`, { method: 'POST' });
        App.msg("BITÁCORA REINICIADA");
    },

    msg: (t) => {
        const el = document.getElementById('toast');
        if (el) {
            el.innerText = t;
            el.classList.add('vis');
            setTimeout(() => el.classList.remove('vis'), 2500);
        }
    }
};

window.App = App;
window.onload = App.init;
