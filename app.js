const API_URL = "https://script.google.com/macros/s/AKfycbyz4FkiRpBQnYu4jRX4dudEy22TBnE2P0RmwX2vooFa2fIa2QPf0HLuo85bZkuplyNk/exec";

const App = {
    passengers: [],
    tripCounts: {},
    recentTrips: [],

    init: async () => {
        console.log("Kopilot 5.0 Circles");
        const cache = localStorage.getItem('kop_v5_data');
        if (cache) {
            const d = JSON.parse(cache);
            App.passengers = d.p || [];
            App.renderGrid();
        }
        await App.refresh();
    },

    refresh: async () => {
        const icon = document.querySelector('.nav-item:last-child span');
        if (icon) icon.classList.add('spin');

        try {
            const [cRes, sRes] = await Promise.all([
                fetch(`${API_URL}?action=get_config`),
                fetch(`${API_URL}?action=get_summary`)
            ]);
            const conf = await cRes.json();
            const sum = await sRes.json();

            if (conf.status === 'success') App.passengers = conf.passengers;

            App.tripCounts = {};
            App.recentTrips = [];
            const now = new Date();
            const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            if (sum.status === 'success') {
                const rev = [...sum.trips].reverse();
                App.recentTrips = rev; // Full history for log tab
                sum.trips.forEach(t => {
                    if (t.mesId === m) App.tripCounts[t.nombre] = (App.tripCounts[t.nombre] || 0) + 1;
                });
            }

            localStorage.setItem('kop_v5_data', JSON.stringify({ p: App.passengers }));
            App.renderGrid();
            App.renderLogs();

        } catch (e) { console.error(e); App.toast("Offline Mode"); }
        finally { if (icon) icon.classList.remove('spin'); }
    },

    renderGrid: () => {
        const grid = document.getElementById('grid-container');
        grid.innerHTML = '';
        if (App.passengers.length === 0) {
            grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#555;">Sin pilotos</div>`;
            return;
        }

        App.passengers.forEach((p, i) => {
            const count = App.tripCounts[p.nombre] || 0;
            const init = p.nombre.charAt(0).toUpperCase();

            // Random Color seeded by name length + index
            const colorIdx = (p.nombre.length + i) % 12 + 1;
            const colorVar = `var(--c${colorIdx})`;

            const node = document.createElement('div');
            node.className = 'passenger-node';

            node.innerHTML = `
                <div class="edit-badge" onclick="App.openEdit('${p.nombre}', ${p.precio})">
                    <span class="material-icons-round" style="font-size:14px;">edit</span>
                </div>
                <div class="circle-btn" style="background:${colorVar};" onclick="App.addTrip('${p.nombre}', ${p.precio})">
                    <span class="circle-initial">${init}</span>
                    <span class="circle-count">${count}</span>
                </div>
                <div class="p-name">${p.nombre}</div>
            `;
            grid.appendChild(node);
        });
    },

    renderLogs: () => {
        const list = document.getElementById('log-list');
        list.innerHTML = '';
        if (App.recentTrips.length === 0) {
            list.innerHTML = `<div class="empty-state">Bitácora vacía este mes</div>`;
            return;
        }
        App.recentTrips.forEach(t => {
            const row = document.createElement('div');
            row.className = 'log-item';
            row.innerHTML = `<div class="log-name">${t.nombre}</div><div class="log-time">${t.fecha || 'Hoy'}</div>`;
            list.appendChild(row);
        });
    },

    addTrip: async (name, price) => {
        if (navigator.vibrate) navigator.vibrate(50);
        App.toast(`${name} +1`);

        App.tripCounts[name] = (App.tripCounts[name] || 0) + 1;
        // Fake Log
        App.recentTrips.unshift({ nombre: name, fecha: 'Ahora' });

        App.renderGrid();
        App.renderLogs();

        fetch(`${API_URL}?action=add_trip&nombre=${name}&precio=${price}`, { method: 'POST' });
    },

    // UI ACTIONS
    switchTab: (tab) => {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

        document.getElementById(`tab-${tab}`).classList.add('active');
        // Find nav button
        const btns = document.querySelectorAll('.nav-item');
        if (tab === 'pilots') btns[0].classList.add('active');
        if (tab === 'logs') btns[1].classList.add('active');
    },

    // MODAL
    openAddModal: () => {
        document.getElementById('orig-name').value = '';
        document.getElementById('inp-name').value = '';
        document.getElementById('inp-price').value = '';
        document.getElementById('btn-del').style.display = 'none';
        document.getElementById('modal').classList.add('open');
        setTimeout(() => document.getElementById('inp-name').focus(), 100);
    },

    openEdit: (n, p) => {
        document.getElementById('orig-name').value = n;
        document.getElementById('inp-name').value = n;
        document.getElementById('inp-price').value = p;
        document.getElementById('btn-del').style.display = 'flex';
        document.getElementById('modal').classList.add('open');
    },

    closeModal: () => {
        document.getElementById('modal').classList.remove('open');
        document.activeElement?.blur();
    },

    handleForm: async (e) => {
        e.preventDefault();
        const orig = document.getElementById('orig-name').value;
        const name = document.getElementById('inp-name').value;
        const price = document.getElementById('inp-price').value;
        App.closeModal();
        App.toast("Guardando...");

        if (orig) {
            const idx = App.passengers.findIndex(p => p.nombre === orig);
            if (idx > -1) App.passengers[idx] = { nombre: name, precio: price, activo: true };
        }
        App.renderGrid();

        const act = orig ? 'edit_passenger' : 'add_passenger';
        const p = new URLSearchParams({ action: act, nombre: name, precio: price, oldName: orig, newName: name, newPrice: price });
        await fetch(`${API_URL}?${p.toString()}`, { method: 'POST' });
        setTimeout(App.refresh, 500);
    },

    deletePassenger: async () => {
        if (!confirm("¿Eliminar?")) return;
        const n = document.getElementById('orig-name').value;
        App.closeModal();
        App.passengers = App.passengers.filter(p => p.nombre !== n);
        App.renderGrid();
        fetch(`${API_URL}?action=delete_passenger&nombre=${n}`, { method: 'POST' });
    },

    confirmReset: async () => {
        if (!confirm("¿Borrar historial?")) return;
        App.recentTrips = [];
        App.tripCounts = {};
        App.renderGrid();
        App.renderLogs();
        App.toast("Historial Limpio");
        fetch(`${API_URL}?action=reset_history`, { method: 'POST' });
    },

    toast: (msg) => {
        const t = document.getElementById('toast');
        t.innerText = msg;
        t.classList.add('vis');
        setTimeout(() => t.classList.remove('vis'), 2000);
    }
};

window.onload = App.init;
