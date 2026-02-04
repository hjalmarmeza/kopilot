const API_URL = "https://script.google.com/macros/s/AKfycbyz4FkiRpBQnYu4jRX4dudEy22TBnE2P0RmwX2vooFa2fIa2QPf0HLuo85bZkuplyNk/exec";

const App = {
    passengers: [],
    tripCounts: {},
    recentTrips: [],

    init: async () => {
        console.log("Kopilot 3.1 Ultra Init...");
        App.checkConnection();

        const cachedConfig = localStorage.getItem('kp_passengers');
        if (cachedConfig) {
            App.passengers = JSON.parse(cachedConfig);
            App.renderDashboard();
        }
        await App.refreshData();
    },

    checkConnection: () => {
        // Optional connection check logic
    },

    refreshData: async () => {
        try {
            const [configRes, summaryRes] = await Promise.all([
                fetch(`${API_URL}?action=get_config`),
                fetch(`${API_URL}?action=get_summary`)
            ]);

            const config = await configRes.json();
            const summary = await summaryRes.json();

            if (config.status === 'success') {
                App.passengers = config.passengers;
                localStorage.setItem('kp_passengers', JSON.stringify(App.passengers));
            }

            App.tripCounts = {};
            App.recentTrips = [];

            if (summary.status === 'success') {
                const now = new Date();
                const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                const tripsReversed = [...summary.trips].reverse();
                App.recentTrips = tripsReversed.slice(0, 5);

                summary.trips.forEach(t => {
                    if (t.mesId === currentMonth) {
                        App.tripCounts[t.nombre] = (App.tripCounts[t.nombre] || 0) + 1;
                    }
                });
            }

            App.renderDashboard();

        } catch (e) {
            console.error(e);
            App.showToast("Mode Offline", true);
        }
    },

    renderDashboard: () => {
        const grid = document.getElementById('passengers-grid');
        if (!grid) return;
        grid.innerHTML = '';

        if (App.passengers.length === 0) {
            grid.style.display = 'block';
            grid.innerHTML = `<div style="text-align:center; padding:50px; color: rgba(255,255,255,0.4);">
                <span class="material-icons-round" style="font-size:3rem; margin-bottom:10px;">bolt</span>
                <p>Agrega tu primer copiloto</p>
            </div>`;
            return;
        }
        grid.style.display = 'grid';

        App.passengers.forEach(p => {
            const count = App.tripCounts[p.nombre] || 0;
            const initial = p.nombre.charAt(0).toUpperCase();

            const card = document.createElement('div');
            card.className = 'widget-card';

            // Touch handlers
            card.onclick = (e) => {
                if (e.target.closest('.w-edit')) return;
                App.registerTrip(p.nombre, p.precio);
            };

            card.innerHTML = `
                <div class="w-edit" onclick="App.openEditModal('${p.nombre}', ${p.precio})">
                    <span class="material-icons-round">more_vert</span>
                </div>
                <div class="w-glow">${initial}</div>
                <div class="w-name">${p.nombre}</div>
                <div class="w-stat">
                    ${count} viajes
                </div>
            `;
            grid.appendChild(card);
        });

        // Render History
        const hist = document.getElementById('history-container');
        if (hist) {
            hist.innerHTML = '';
            if (App.recentTrips.length > 0) {
                App.recentTrips.forEach(t => {
                    const row = document.createElement('div');
                    row.className = 'history-item';
                    row.innerHTML = `
                        <div style="font-weight:600; color:white;">${t.nombre}</div>
                        <div style="font-size:0.75rem; color:rgba(255,255,255,0.5);">${t.fecha || 'Reciente'}</div>
                    `;
                    hist.appendChild(row);
                });
            } else {
                hist.innerHTML = '<div style="text-align: center; opacity: 0.3; font-size: 0.8rem;">Bitácora vacía</div>';
            }
        }
    },

    registerTrip: async (nombre, precio) => {
        App.showToast(`Procesando...`);
        if (navigator.vibrate) navigator.vibrate(50);

        try {
            const params = new URLSearchParams({ action: 'add_trip', nombre, precio });
            await fetch(`${API_URL}?${params.toString()}`, { method: 'POST' });

            App.showToast(`Registrado!`);

            const historyContainer = document.getElementById('history-container');
            if (historyContainer) {
                if (historyContainer.innerText.includes('vacía')) historyContainer.innerHTML = '';

                const row = document.createElement('div');
                row.className = 'history-item';
                row.innerHTML = `<div style="font-weight:600; color:white;">${nombre}</div><div style="font-size:0.75rem; color:rgba(255,255,255,0.5);">Ahora</div>`;
                historyContainer.prepend(row);
            }

            App.tripCounts[nombre] = (App.tripCounts[nombre] || 0) + 1;
            App.renderDashboard();

        } catch (e) {
            App.showToast("Error de red", true);
        }
    },

    // --- MODAL LOGIC ---
    openAddModal: () => {
        document.getElementById('edit-orig-name').value = "";
        document.getElementById('inp-name').value = "";
        document.getElementById('inp-price').value = "";
        const delBtn = document.getElementById('btn-delete');
        if (delBtn) delBtn.style.display = 'none';

        document.getElementById('p-modal').classList.add('active');
        setTimeout(() => document.getElementById('inp-name').focus(), 100);
    },

    openEditModal: (name, price) => {
        document.getElementById('edit-orig-name').value = name;
        document.getElementById('inp-name').value = name;
        document.getElementById('inp-price').value = price;
        const delBtn = document.getElementById('btn-delete');
        if (delBtn) {
            delBtn.style.display = 'block';
            delBtn.style.justifyContent = 'center'; // Fix alignment if needed
        }
        document.getElementById('p-modal').classList.add('active');
    },

    deletePassenger: async () => {
        const name = document.getElementById('edit-orig-name').value;
        if (!confirm(`¿Eliminar a ${name}?`)) return;

        App.closeModal();
        App.showToast("Eliminando...", true);

        // Optimistic delete
        App.passengers = App.passengers.filter(p => p.nombre !== name);
        App.renderDashboard();

        try {
            const params = new URLSearchParams({ action: 'delete_passenger', nombre: name });
            await fetch(`${API_URL}?${params.toString()}`, { method: 'POST' });
            App.showToast("Eliminado");
        } catch (e) {
            App.showToast("Error al eliminar", true);
        }
    },

    confirmReset: async () => {
        if (!confirm("⚠️ ¿REINICIAR BITÁCORA?\n\nSe archivará el historial actual y se empezará de cero.")) return;

        App.showToast("Reiniciando...", true);

        try {
            const params = new URLSearchParams({ action: 'reset_history' });
            await fetch(`${API_URL}?${params.toString()}`, { method: 'POST' });

            App.recentTrips = [];
            App.tripCounts = {};
            App.renderDashboard();

            App.showToast("Bitácora nueva lista ✨");
            App.refreshData();
        } catch (e) {
            App.showToast("Error reset", true);
        }
    },

    closeModal: () => {
        document.getElementById('p-modal').classList.remove('active');
        document.activeElement?.blur();
    },

    handleForm: async (e) => {
        e.preventDefault();
        const originalName = document.getElementById('edit-orig-name').value;
        const name = document.getElementById('inp-name').value;
        const price = document.getElementById('inp-price').value;

        App.closeModal();
        App.showToast("Guardando...");

        if (originalName) {
            const idx = App.passengers.findIndex(p => p.nombre === originalName);
            if (idx >= 0) {
                App.passengers[idx] = { nombre: name, precio: price, activo: true };
                App.renderDashboard();
            }
        }

        const action = originalName ? 'edit_passenger' : 'add_passenger';
        const params = new URLSearchParams({
            action: action,
            nombre: name, precio: price, oldName: originalName, newName: name, newPrice: price
        });

        try {
            await fetch(`${API_URL}?${params.toString()}`, { method: 'POST' });
            App.showToast("Sincronizado ☁️");
            setTimeout(() => App.refreshData(), 500);
        } catch (err) {
            App.showToast("Error", true);
        }
    },

    switchTab: (t) => { },

    showToast: (msg, isError = false) => {
        const t = document.getElementById('toast');
        const msgEl = document.getElementById('toast-msg');
        if (msgEl) msgEl.innerText = msg;

        const icon = t.querySelector('.t-icon');
        if (icon) {
            icon.style.color = isError ? '#ef4444' : '#10b981';
            icon.innerText = isError ? 'error' : 'check_circle';
        }
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3000);
    }
};

window.addEventListener('DOMContentLoaded', App.init);
