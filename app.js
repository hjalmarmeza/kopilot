const API = "https://script.google.com/macros/s/AKfycbyz4FkiRpBQnYu4jRX4dudEy22TBnE2P0RmwX2vooFa2fIa2QPf0HLuo85bZkuplyNk/exec";

const App = {
    data: [],
    counts: {},
    logs: [],

    init: async () => {
        console.log("Kopilot 6.0 Sunset");
        const loc = localStorage.getItem('k6_data');
        if (loc) {
            const d = JSON.parse(loc);
            App.data = d.p || [];
            App.counts = d.c || {};
            App.render();
        }
        await App.sync();
    },

    sync: async () => {
        const icon = document.querySelector('.nav-btn:last-child span');
        if (icon) icon.innerText = 'cached';

        try {
            const [cR, sR] = await Promise.all([
                fetch(`${API}?action=get_config`),
                fetch(`${API}?action=get_summary`)
            ]);
            const c = await cR.json();
            const s = await sR.json();

            if (c.status === 'success') App.data = c.passengers;

            // Recalc Counts using fresh logs
            App.counts = {};
            App.logs = [];
            const now = new Date();
            const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            if (s.status === 'success') {
                App.logs = [...s.trips].reverse();
                s.trips.forEach(t => {
                    if (t.mesId === m) App.counts[t.nombre] = (App.counts[t.nombre] || 0) + 1;
                });
            }

            localStorage.setItem('k6_data', JSON.stringify({ p: App.data, c: App.counts }));
            App.render();

        } catch (e) { App.msg("Offline"); }
        finally { if (icon) icon.innerText = 'sync'; }
    },

    render: () => {
        // GRID
        const g = document.getElementById('grid');
        g.innerHTML = '';
        if (App.data.length === 0) {
            g.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;">Usa el botón + para añadir</div>`;
        } else {
            App.data.forEach(p => {
                const cnt = App.counts[p.nombre] || 0;
                const init = p.nombre.charAt(0).toUpperCase();

                const el = document.createElement('div');
                el.className = 'glass-card';
                el.onclick = (e) => {
                    if (e.target.closest('.card-edit')) return;
                    App.add(p.nombre, p.precio);
                };
                el.innerHTML = `
                    <div class="card-count">${cnt}</div>
                    <div class="card-edit" onclick="App.edit('${p.nombre}',${p.precio})">
                        <span class="material-icons-round" style="font-size:18px">more_horiz</span>
                    </div>
                    <div class="card-initial">${init}</div>
                    <div class="card-name">${p.nombre}</div>
                `;
                g.appendChild(el);
            });
        }

        // LOGS
        const l = document.getElementById('hist-list');
        l.innerHTML = '';
        if (App.logs.length === 0) {
            l.innerHTML = `<div style="text-align:center;padding:20px;opacity:0.7">Nada por hoy</div>`;
        } else {
            App.logs.forEach(x => {
                const i = document.createElement('div');
                i.className = 'log-row';
                i.innerHTML = `<span>${x.nombre}</span><span class="log-time">${x.fecha || 'Hoy'}</span>`;
                l.appendChild(i);
            });
        }
    },

    add: (n, p) => {
        if (navigator.vibrate) navigator.vibrate(50);
        App.msg(`+1 ${n}`);

        // Optimistic
        App.counts[n] = (App.counts[n] || 0) + 1;
        App.logs.unshift({ nombre: n, fecha: 'Ahora' });
        App.render();

        fetch(`${API}?action=add_trip&nombre=${n}&precio=${p}`, { method: 'POST' });
    },

    // NAV
    nav: (tab) => {
        document.querySelectorAll('.tab-view').forEach(e => e.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');

        document.querySelectorAll('.nav-btn').forEach(e => e.classList.remove('active'));
        if (tab === 'dash') document.querySelectorAll('.nav-btn')[0].classList.add('active');
        if (tab === 'hist') document.querySelectorAll('.nav-btn')[1].classList.add('active');
    },

    // MODAL
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
    close: () => {
        document.getElementById('modal').classList.remove('open');
    },

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

    del: async () => {
        if (!confirm("¿Eliminar?")) return;
        const n = document.getElementById('eid').value;
        App.close();

        App.data = App.data.filter(x => x.nombre !== n);
        App.render();

        fetch(`${API}?action=delete_passenger&nombre=${n}`, { method: 'POST' });
    },

    confirmReset: () => {
        if (!confirm("¿Reiniciar Bitácora?")) return;
        App.logs = []; App.counts = {};
        App.render();
        fetch(`${API}?action=reset_history`, { method: 'POST' });
        App.msg("Reiniciado");
    },

    msg: (t) => {
        const el = document.getElementById('toast');
        el.innerText = t; el.classList.add('vis');
        setTimeout(() => el.classList.remove('vis'), 2000);
    }
};

window.onload = App.init;
