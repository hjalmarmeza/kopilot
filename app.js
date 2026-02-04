const API_URL = "https://script.google.com/macros/s/AKfycbyz4FkiRpBQnYu4jRX4dudEy22TBnE2P0RmwX2vooFa2fIa2QPf0HLuo85bZkuplyNk/exec";

const App = {
    passengers: [],
    tripCounts: {},
    recentTrips: [],

    init: async () => {
        console.log("Kopilot 3.0 (Premium) Init...");
        App.checkConnection();

        const cachedConfig = localStorage.getItem('kp_passengers');
        if (cachedConfig) {
            App.passengers = JSON.parse(cachedConfig);
            App.renderDashboard();
        }
        await App.refreshData();
    },

    checkConnection: () => {
        const h1 = document.querySelector('h1');
        const updateStatus = () => {
            if (!navigator.onLine && h1) h1.style.opacity = "0.5";
            else if (h1) h1.style.opacity = "1";
        };
        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
        updateStatus();
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

        } catch (e) {
            console.error("Error refreshing data", e);
            App.showToast("Sin conexión", true);
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

            card.onclick = (e) => {
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

            const historyContainer = document.getElementById('history-container');
            if (historyContainer) {
                if (historyContainer.innerText.includes('Sin viajes')) historyContainer.innerHTML = '';
                const row = document.createElement('div');
                row.className = 'history-pill';
                row.innerHTML = `<div style="font-weight:600;">${nombre}</div><div style="font-size:0.8rem; opacity:0.6;">Ahora</div>`;
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

    // --- MODAL LOGIC premium ---
    openAddModal: () => {
        document.getElementById('edit-orig-name').value = "";
        document.getElementById('inp-name').value = "";
        document.getElementById('inp-price').value = "";
        document.getElementById('p-modal').classList.add('active');
        setTimeout(() => document.getElementById('inp-name').focus(), 100);
    },

    openEditModal: (name, price) => {
        document.getElementById('edit-orig-name').value = name;
        document.getElementById('inp-name').value = name;
        document.getElementById('inp-price').value = price;
        document.getElementById('p-modal').classList.add('active');
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
            nombre: name,
            precio: price,
            oldName: originalName,
            newName: name,
            newPrice: price
        });

        try {
            await fetch(`${API_URL}?${params.toString()}`, { method: 'POST' });
            App.showToast("Guardado en la nube ☁️");
            setTimeout(() => App.refreshData(), 1000);
        } catch (err) {
            App.showToast("Error de red", true);
        }
    },

    switchTab: (t) => {
        // Placeholder
    },

    showToast: (msg, isError = false) => {
        const t = document.getElementById('toast');
        const msgEl = document.getElementById('toast-msg');
        if (msgEl) msgEl.innerText = msg;
        else t.innerText = msg;

        t.style.borderColor = isError ? '#ef4444' : 'rgba(255,255,255,0.1)';
        const icon = t.querySelector('.material-icons-round');
        if (icon) {
            icon.style.color = isError ? '#ef4444' : '#4ade80';
            icon.innerText = isError ? 'error' : 'check_circle';
        }
        t.classList.add('visible');
        setTimeout(() => t.classList.remove('visible'), 3000);
    }
};

window.addEventListener('DOMContentLoaded', App.init);
