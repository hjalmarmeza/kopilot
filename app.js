const API_URL = "https://script.google.com/macros/s/AKfycbyz4FkiRpBQnYu4jRX4dudEy22TBnE2P0RmwX2vooFa2fIa2QPf0HLuo85bZkuplyNk/exec";

const App = {
    passengers: [],
    tripCounts: {},
    recentTrips: [],

    init: async () => {
        console.log("Kopilot 4.0 Bento Init");
        // Load cache instantly
        const cache = localStorage.getItem('kop_cache');
        if (cache) {
            const data = JSON.parse(cache);
            App.passengers = data.p || [];
            App.renderGrid();
        }
        await App.refresh();
    },

    refresh: async () => {
        const btn = document.querySelector('.dock-btn .material-icons-round');
        if (btn) btn.classList.add('spin');

        try {
            const [cRes, sRes] = await Promise.all([
                fetch(`${API_URL}?action=get_config`),
                fetch(`${API_URL}?action=get_summary`)
            ]);

            const config = await cRes.json();
            const summary = await sRes.json();

            if (config.status === 'success') App.passengers = config.passengers;

            // Calc Counts
            App.tripCounts = {};
            App.recentTrips = [];
            const now = new Date();
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            if (summary.status === 'success') {
                // Reverse for history
                const reversed = [...summary.trips].reverse();
                App.recentTrips = reversed.slice(0, 5);

                summary.trips.forEach(t => {
                    if (t.mesId === month) App.tripCounts[t.nombre] = (App.tripCounts[t.nombre] || 0) + 1;
                });
            }

            // Save Cache
            localStorage.setItem('kop_cache', JSON.stringify({ p: App.passengers }));

            App.renderGrid();
            App.renderHistory();

        } catch (e) {
            App.notify("Modo Offline");
        } finally {
            if (btn) btn.classList.remove('spin');
        }
    },

    renderGrid: () => {
        const grid = document.getElementById('grid');
        grid.innerHTML = '';

        if (App.passengers.length === 0) {
            grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#3a3a3c;padding:40px;">Sin Pilotos</div>`;
            return;
        }

        App.passengers.forEach(p => {
            const count = App.tripCounts[p.nombre] || 0;
            const init = p.nombre.charAt(0).toUpperCase();

            const card = document.createElement('div');
            card.className = 'card';

            // Logic: Click card = Add Trip. Click Edit Icon = Edit.
            card.onclick = (e) => {
                if (e.target.closest('.edit-trigger')) return;
                App.addTrip(p.nombre, p.precio);
            };

            card.innerHTML = `
                <div class="edit-trigger" onclick="App.openSheet('${p.nombre}', ${p.precio})">
                    <span class="material-icons-round">more_horiz</span>
                </div>
                <div class="initial">${init}</div>
                <div style="margin-top:auto;">
                    <div class="name">${p.nombre}</div>
                    <div class="trips-num">${count}</div>
                    <div class="trips-lbl">viajes</div>
                </div>
            `;
            grid.appendChild(card);
        });
    },

    renderHistory: () => {
        const list = document.getElementById('history-list');
        list.innerHTML = '';
        if (App.recentTrips.length === 0) {
            list.innerHTML = `<div style="text-align:center;color:#3a3a3c;padding:20px;font-size:14px;">Nada hoy</div>`;
            return;
        }
        App.recentTrips.forEach(t => {
            const row = document.createElement('div');
            row.className = 'history-row';
            row.innerHTML = `
                <span class="history-name">${t.nombre}</span>
                <span class="history-time">${t.fecha || 'Ahora'}</span>
            `;
            list.appendChild(row);
        });
    },

    addTrip: async (name, price) => {
        if (navigator.vibrate) navigator.vibrate(50);
        App.notify(`Registrando ${name}...`);

        // Optimistic UI
        App.tripCounts[name] = (App.tripCounts[name] || 0) + 1;

        // Add Fake History
        const list = document.getElementById('history-list');
        const row = document.createElement('div');
        row.className = 'history-row';
        row.innerHTML = `<span class="history-name">${name}</span><span class="history-time">Ahora</span>`;
        if (list.querySelector('div')?.innerText.includes('Nada')) list.innerHTML = '';
        list.prepend(row);

        App.renderGrid(); // Update count display

        try {
            await fetch(`${API_URL}?action=add_trip&nombre=${name}&precio=${price}`, { method: 'POST' });
            App.notify("Guardado ✅");
        } catch (e) {
            App.notify("Error de red");
        }
    },

    // SHEET LOGIC
    openAddModal: () => {
        document.getElementById('edit-orig-name').value = '';
        document.getElementById('inp-name').value = '';
        document.getElementById('inp-price').value = '';
        document.getElementById('btn-del').style.display = 'none';

        document.getElementById('sheet').classList.add('active');
        setTimeout(() => document.getElementById('inp-name').focus(), 100);
    },

    openSheet: (name, price) => {
        document.getElementById('edit-orig-name').value = name;
        document.getElementById('inp-name').value = name;
        document.getElementById('inp-price').value = price;
        document.getElementById('btn-del').style.display = 'flex';

        document.getElementById('sheet').classList.add('active');
    },

    closeSheet: () => {
        document.getElementById('sheet').classList.remove('active');
        document.activeElement?.blur();
    },

    handleForm: async (e) => {
        e.preventDefault();
        const orig = document.getElementById('edit-orig-name').value;
        const name = document.getElementById('inp-name').value;
        const price = document.getElementById('inp-price').value;

        App.closeSheet();
        App.notify("Guardando...");

        // Optimistic
        if (orig) {
            const idx = App.passengers.findIndex(p => p.nombre === orig);
            if (idx >= 0) App.passengers[idx] = { nombre: name, precio: price, activo: true };
        }
        App.renderGrid();

        const action = orig ? 'edit_passenger' : 'add_passenger';
        try {
            const p = new URLSearchParams({ action, nombre: name, precio: price, oldName: orig, newName: name, newPrice: price });
            await fetch(`${API_URL}?${p.toString()}`, { method: 'POST' });
            setTimeout(App.refresh, 500);
        } catch (e) { App.notify("Error"); }
    },

    deletePassenger: async () => {
        const name = document.getElementById('edit-orig-name').value;
        if (!confirm("¿Eliminar?")) return;
        App.closeSheet();

        App.passengers = App.passengers.filter(p => p.nombre !== name);
        App.renderGrid();

        fetch(`${API_URL}?action=delete_passenger&nombre=${name}`, { method: 'POST' });
    },

    confirmReset: async () => {
        if (!confirm("¿Reiniciar Mes? Se borrará el historial visual.")) return;
        App.notify("Limpiando...");
        App.recentTrips = [];
        App.tripCounts = {};
        App.renderGrid();
        App.renderHistory();

        fetch(`${API_URL}?action=reset_history`, { method: 'POST' });
    },

    notify: (msg) => {
        const el = document.getElementById('feedback');
        el.innerText = msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 2500);
    }
};

window.onload = App.init;
