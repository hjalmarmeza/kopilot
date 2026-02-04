const API_URL = "https://script.google.com/macros/s/AKfycbyz4FkiRpBQnYu4jRX4dudEy22TBnE2P0RmwX2vooFa2fIa2QPf0HLuo85bZkuplyNk/exec";

const App = {
    passengers: [],

    init: async () => {
        console.log("RideTally Init...");
        App.checkConnection();

        // Cargar config local si existe para inicio rápido
        const cachedConfig = localStorage.getItem('rt_passengers');
        if (cachedConfig) {
            App.passengers = JSON.parse(cachedConfig);
            App.renderDashboard();
        }

        // Refrescar desde la nube
        await App.refreshConfig();
    },

    checkConnection: () => {
        const indicator = document.getElementById('connection-status');
        if (navigator.onLine) indicator.classList.add('online');

        window.addEventListener('online', () => indicator.classList.add('online'));
        window.addEventListener('offline', () => indicator.classList.remove('online'));
    },

    refreshConfig: async () => {
        try {
            document.querySelector('.loader')?.style.setProperty('display', 'block');
            const res = await fetch(`${API_URL}?action=get_config`);
            const json = await res.json();

            if (json.status === 'success') {
                App.passengers = json.passengers;
                localStorage.setItem('rt_passengers', JSON.stringify(App.passengers));
                App.renderDashboard();
                App.showToast("Configuración actualizada");
            }
        } catch (e) {
            console.error("Error fetching config", e);
            App.showToast("Sin conexión: Usando datos locales", true);
        }
    },

    renderDashboard: () => {
        const grid = document.getElementById('dashboard');
        grid.innerHTML = '';

        if (App.passengers.length === 0) {
            grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; opacity: 0.7;">No hay pasajeros configurados en el Sheet.</p>`;
            return;
        }

        App.passengers.forEach(p => {
            const card = document.createElement('div');
            card.className = 'passenger-card';
            card.onclick = () => App.registerTrip(p);

            // Inicial o Emoji
            const avatar = p.nombre.charAt(0).toUpperCase();

            card.innerHTML = `
                <div class="p-avatar">👤</div>
                <div class="p-name">${p.nombre}</div>
                <div class="p-price">$${p.precio}</div>
            `;
            grid.appendChild(card);
        });
    },

    registerTrip: async (passenger) => {
        // Feedback Inmediato (Optimistic UI)
        App.showToast(`Registrando viaje de ${passenger.nombre}...`);

        if (navigator.vibrate) navigator.vibrate(50); // Vibración táctil

        try {
            // Enviar a Google Sheets
            // Usamos mode: 'no-cors' si hay problemas, pero el script devuelve JSONP/CORS headers usualmente.
            // Google Apps Script a veces requiere redirección, fetch la sigue por defecto.

            const params = new URLSearchParams({
                action: 'add_trip',
                nombre: passenger.nombre,
                precio: passenger.precio
            });

            await fetch(`${API_URL}?${params.toString()}`, { method: 'POST' });

            App.showToast(`¡Viaje de ${passenger.nombre} guardado! ✅`);
            if (navigator.vibrate) navigator.vibrate([50, 50, 50]);

        } catch (e) {
            console.error(e);
            App.showToast("Error de conexión. Intenta luego.", true);
            // TODO: Podríamos guardar en localstorage y reintentar luego (Queue)
        }
    },

    showTab: (tabName) => {
        // Simple navegación SPA
        const dash = document.getElementById('dashboard');

        // Actualizar botones
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        if (tabName === 'dashboard') {
            dash.innerHTML = ''; // Limpiar para SPA simple o re-render
            App.renderDashboard();
            document.querySelector('.nav-btn[onclick*="dashboard"]').classList.add('active');
        } else if (tabName === 'summary') {
            dash.innerHTML = '<div class="loader"><span class="material-icons-round spin">sync</span><p>Calculando totales...</p></div>';
            App.loadSummary(dash);
            document.querySelector('.nav-btn[onclick*="summary"]').classList.add('active');
        }
    },

    loadSummary: async (container) => {
        try {
            const res = await fetch(`${API_URL}?action=get_summary`);
            const json = await res.json();

            if (json.status === 'success') {
                container.innerHTML = `<h2 style="grid-column:1/-1; margin-bottom:10px;">Resumen Mes Actual</h2>`;

                // Agrupar por persona
                const totals = {};
                const now = new Date();
                const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

                json.trips.forEach(t => {
                    // Filtrar solo mes actual (opcional, aquí lo hacemos simple)
                    // El servidor devuelve mesId "YYYY-MM"
                    if (t.mesId === currentMonth) {
                        if (!totals[t.nombre]) totals[t.nombre] = { count: 0, amount: 0 };
                        totals[t.nombre].count++;
                        totals[t.nombre].amount += parseFloat(t.precio);
                    }
                });

                if (Object.keys(totals).length === 0) {
                    container.innerHTML += `<p style="grid-column:1/-1; opacity:0.6;">Sin viajes este mes.</p>`;
                    return;
                }

                Object.keys(totals).forEach(name => {
                    const data = totals[name];
                    const div = document.createElement('div');
                    div.style.gridColumn = "1 / -1";
                    div.className = 'summary-card';
                    div.innerHTML = `
                        <div>
                            <strong>${name}</strong>
                            <div style="font-size:0.9rem; opacity:0.7;">${data.count} viajes</div>
                        </div>
                        <div class="total-amount">$${data.amount.toFixed(2)}</div>
                    `;

                    // Botón de WhatsApp
                    const msg = `Hola ${name}, este mes de ${currentMonth} realizaste ${data.count} viajes. El total es $${data.amount.toFixed(2)}. ¡Gracias! 🚕`;
                    const waLink = `https://wa.me/?text=${encodeURIComponent(msg)}`;

                    const btn = document.createElement('a');
                    btn.href = waLink;
                    btn.target = "_blank";
                    btn.innerHTML = '💬 Cobrar';
                    btn.style.cssText = "display:block; padding:8px; margin-left:10px; background:#25D366; color:white; border-radius:10px; text-decoration:none; font-size:0.8rem; font-weight:bold;";

                    div.appendChild(btn);
                    container.appendChild(div);
                });

            }
        } catch (e) {
            console.error(e);
            container.innerHTML = `<p style="color:red;">Error cargando resumen.</p>`;
        }
    },

    showToast: (msg, isError = false) => {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.style.backgroundColor = isError ? 'var(--danger)' : 'var(--success)';
        t.classList.remove('hidden');
        setTimeout(() => t.classList.add('hidden'), 3000);
    }
};

window.addEventListener('DOMContentLoaded', App.init);
