const API_URL = "https://script.google.com/macros/s/AKfycbyz4FkiRpBQnYu4jRX4dudEy22TBnE2P0RmwX2vooFa2fIa2QPf0HLuo85bZkuplyNk/exec";

const App = {
    passengers: [],
    tripCounts: {},
    recentTrips: [],

    init: async () => {
        console.log("Kopilot 2.1 Init...");
        App.checkConnection();

        const cachedConfig = localStorage.getItem('kp_passengers');
        if (cachedConfig) {
            App.passengers = JSON.parse(cachedConfig);
            App.renderDashboard();
        }
        await App.refreshData();
    },

    checkConnection: () => {
        const indicator = document.getElementById('connection-status');
        if (!indicator) return;
        const updateStatus = () => {
            indicator.classList.toggle('online', navigator.onLine);
        };
        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
        updateStatus();
    },

    refreshData: async () => {
        try {
            document.getElementById('loader')?.style.removeProperty('display');

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

            // Procesar Conteos
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
            document.getElementById('loader')?.style.setProperty('display', 'none');

        } catch (e) {
            console.error("Error refreshing data", e);
            App.showToast("Maldita sea! Sin conexión.", true);
            document.getElementById('loader')?.style.setProperty('display', 'none');
        }
    },

    renderDashboard: () => {
        const grid = document.getElementById('passengers-grid');
        if (!grid) return;
        grid.innerHTML = '';

        if (App.passengers.length === 0) {
            grid.style.display = 'block';
            grid.innerHTML = `<div style="text-align:center; padding:40px; color: #94a3b8;">
                <span class="material-icons-round" style="font-size:3rem; margin-bottom:10px;">no_accounts</span>
                <p>No tienes pasajeros.<br>Toca el + arriba.</p>
            </div>`;
            return;
        }
        grid.style.display = 'grid';

        App.passengers.forEach(p => {
            const count = App.tripCounts[p.nombre] || 0;
            const initial = p.nombre.charAt(0).toUpperCase();

            const card = document.createElement('div');
            card.className = 'widget-card';

            // Acción principal al tocar la tarjeta: Registrar Viaje
            card.onclick = (e) => {
                // Si tocó el botón de editar, no registrar viaje
                if (e.target.closest('.w-edit-btn')) return;
                App.registerTrip(p.nombre, p.precio);
            };

            card.innerHTML = `
                <div class="w-edit-btn" onclick="App.openEditModal('${p.nombre}', ${p.precio})">
                    <span class="material-icons-round">edit</span>
                </div>
                <div class="w-icon-bg">${initial}</div>
                <div class="w-name">${p.nombre}</div>
                <div class="w-stat">
                    <span class="material-icons-round" style="font-size:1rem;">history</span>
                    ${count}
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
                    row.className = 'history-pill';
                    row.innerHTML = `
                        <div style="font-weight:600;">${t.nombre}</div>
                        <div style="font-size:0.8rem; opacity:0.6;">${t.fecha || 'Reciente'}</div>
                    `;
                    hist.appendChild(row);
                });
            } else {
                hist.innerHTML = '<div style="text-align: center; opacity: 0.4; font-size: 0.9rem;">Sin viajes hoy</div>';
            }
        }
    },

    registerTrip: async (nombre, precio) => {
        App.showToast(`Anotando a ${nombre}...`);
        if (navigator.vibrate) navigator.vibrate(50);

        try {
            const params = new URLSearchParams({ action: 'add_trip', nombre, precio });
            await fetch(`${API_URL}?${params.toString()}`, { method: 'POST' });

            App.showToast(`Viaje guardado! ✅`);

            // Fake update local history
            const historyContainer = document.getElementById('recent-history');
            if (historyContainer) {
                const row = document.createElement('div');
                row.className = 'history-item fade-in';
                row.innerHTML = `<span class="h-name">${nombre}</span><span class="h-date">Ahora</span>`;
                historyContainer.prepend(row);
            }
            // Update counter locally
            App.tripCounts[nombre] = (App.tripCounts[nombre] || 0) + 1;
            App.renderDashboard();

        } catch (e) {
            console.error(e);
            App.showToast("Error. No se guardó.", true);
        }
    },

    // --- MODAL LOGIC ---
    openAddModal: () => {
        document.getElementById('modal-title').innerText = "Nuevo Pasajero";
        document.getElementById('edit-original-name').value = ""; // Empty = New
        document.getElementById('p-name-input').value = "";
        document.getElementById('p-price-input').value = "";
        document.getElementById('passenger-modal').classList.remove('hidden');
    },

    openEditModal: (name, price) => {
        document.getElementById('modal-title').innerText = "Editar Pasajero";
        document.getElementById('edit-original-name').value = name;
        document.getElementById('p-name-input').value = name;
        document.getElementById('p-price-input').value = price;
        document.getElementById('passenger-modal').classList.remove('hidden');
    },

    closeModal: () => {
        document.getElementById('passenger-modal').classList.add('hidden');
    },

    handlePassengerSubmit: async (e) => {
        e.preventDefault();
        const originalName = document.getElementById('edit-original-name').value;
        const name = document.getElementById('p-name-input').value;
        const price = document.getElementById('p-price-input').value;

        App.closeModal();
        App.showToast("Guardando cambios...");

        const action = originalName ? 'edit_passenger' : 'add_passenger';
        const params = new URLSearchParams({
            action: action,
            nombre: name, // For add
            precio: price,
            oldName: originalName, // For edit
            newName: name, // For edit
            newPrice: price
        });

        try {
            await fetch(`${API_URL}?${params.toString()}`, { method: 'POST' });
            App.showToast("Listo! Actualizando...");
            await App.refreshData(); // Reload list
        } catch (err) {
            App.showToast("Error al guardar config.", true);
        }
    },

    showTab: (tabName) => {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.getElementById(tabName).classList.remove('hidden');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.nav-btn[onclick*="${tabName}"]`).classList.add('active');
        if (tabName === 'dashboard') App.refreshData();
    },

    showToast: (msg, isError = false) => {
        const t = document.getElementById('toast');
        t.innerText = msg;
        t.style.background = isError ? 'var(--danger)' : 'var(--success)';
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3000);
    }
};

window.addEventListener('DOMContentLoaded', App.init);
