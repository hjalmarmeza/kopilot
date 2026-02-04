const API = "https://script.google.com/macros/s/AKfycbyz4FkiRpBQnYu4jRX4dudEy22TBnE2P0RmwX2vooFa2fIa2QPf0HLuo85bZkuplyNk/exec";

const App = {
    data: [],
    counts: {},
    logs: [],

    init: () => {
        console.log("Kopilot 7.0 Sunset Flow");
        const c = localStorage.getItem('k7_data');
        if (c) {
            const d = JSON.parse(c);
            App.data = d.p || [];
            App.counts = d.c || {};
            App.render();
        }
        // Auto-load in bg
        App.sync();
    },

    start: () => {
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
        document.getElementById('intro-screen').classList.add('hidden');
        setTimeout(() => {
            document.getElementById('app-content').classList.add('visible');
        }, 300);
    },

    sync: async () => {
        const i = document.querySelector('.dock-btn:last-child span');
        if (i) i.classList.add('spin'); // Add CSS spin if needed or change icon

        try {
            const [cR, sR] = await Promise.all([
                fetch(`${API}?action=get_config`),
                fetch(`${API}?action=get_summary`)
            ]);
            const conf = await cR.json();
            const sum = await sR.json();

            if (conf.status === 'success') App.data = conf.passengers;

            App.counts = {};
            App.logs = [];
            const now = new Date();
            const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            if (sum.status === 'success') {
                App.logs = [...sum.trips].reverse();
                sum.trips.forEach(t => {
                    if (t.mesId === m) App.counts[t.nombre] = (App.counts[t.nombre] || 0) + 1;
                });
            }

            localStorage.setItem('k7_data', JSON.stringify({ p: App.data, c: App.counts }));
            App.render();

        } catch (e) { App.msg("Offline Mode"); }
        finally { if (i) i.classList.remove('spin'); }
    },

    render: () => {
        // Grid
        const g = document.getElementById('grid');
        g.innerHTML = '';
        if (App.data.length === 0) {
            g.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:white;opacity:0.7;">Sin Pilotos</div>`;
        } else {
            App.data.forEach(p => {
                const cnt = App.counts[p.nombre] || 0;
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

        // History
        const h = document.getElementById('history-list');
        h.innerHTML = '';
        if (App.logs.length === 0) {
            h.innerHTML = `<div style="text-align:center;padding:30px;color:white;opacity:0.6;">Sin viajes hoy</div>`;
        } else {
            App.logs.forEach(x => {
                const r = document.createElement('div');
                r.className = 'log-item';
                r.innerHTML = `<span>${x.nombre}</span><span style="opacity:0.7;font-size:0.9rem;">${x.fecha || 'Hoy'}</span>`;
                h.appendChild(r);
            });
        }
    },

    add: (n, p) => {
        if (navigator.vibrate) navigator.vibrate(50);
        App.msg(`+1 ${n}`);
        App.counts[n] = (App.counts[n] || 0) + 1;
        App.logs.unshift({ nombre: n, fecha: 'Ahora' });
        App.render();
        fetch(`${API}?action=add_trip&nombre=${n}&precio=${p}`, { method: 'POST' });
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
        App.logs = []; App.counts = {}; App.render();
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
