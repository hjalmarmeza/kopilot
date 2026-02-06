const API = "https://script.google.com/macros/s/AKfycbyz4FkiRpBQnYu4jRX4dudEy22TBnE2P0RmwX2vooFa2fIa2QPf0HLuo85bZkuplyNk/exec";

const App = {
    data: [],    // Passengers Configuration
    logs: [],    // The Single Source of Truth for Trips
    deletedThisSession: new Set(), // Ghost prevention

    init: () => {
        console.log("Kopilot 9.9 Universal Fix");
        const cached = localStorage.getItem('k9.2_data');
        if (cached) {
            const d = JSON.parse(cached);
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
        // 1. Calculate Counts
        const counts = {};
        App.logs.forEach(l => {
            counts[l.nombre] = (counts[l.nombre] || 0) + 1;
        });

        // 2. Render Grid
        const g = document.getElementById('grid');
        if (g) {
            g.innerHTML = '';
            const visibleData = App.data.filter(p => !App.deletedThisSession.has(p.nombre.toLowerCase()));

            if (visibleData.length === 0) {
                g.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:white;opacity:0.3;">SIN PASAJEROS</div>`;
            } else {
                visibleData.forEach(p => {
                    const cnt = counts[p.nombre] || 0;
                    const el = document.createElement('div');
                    el.className = 'glass-card';
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
        }

        // 3. Render Logs
        const h = document.getElementById('history-list');
        if (h) {
            h.innerHTML = '';
            const sortedLogs = [...App.logs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            sortedLogs.forEach(x => {
                const r = document.createElement('div');
                r.className = 'log-item';

                let fullStr = x.time || "--:--";
                if (x.date && x.date.includes('-')) {
                    const parts = x.date.split('-');
                    fullStr += ` · ${parts[2]}/${parts[1]}`;
                }

                r.innerHTML = `
                    <div class="log-info">
                        <span style="font-weight:600; color:var(--c-text)">${x.nombre}</span>
                        <span class="log-date" style="color:var(--c-text-sec)">${fullStr}</span>
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
                // Merge logic to keep local fresh trips
                const now = Date.now();
                const localRecent = App.logs.filter(l => {
                    const isLocal = String(l.id).startsWith('temp');
                    const isVeryFresh = (now - (l.timestamp || 0) < 5000);
                    const notInServer = !serverLogs.find(s => String(s.id) == String(l.id));
                    return isLocal && isVeryFresh && notInServer;
                });
                App.logs = [...localRecent, ...serverLogs];
            }
            App.render();
        } catch (e) {
            console.error("Sync error", e);
            App.msg("Offline Sync");
        }
    },

    add: async (n, p) => {
        if (navigator.vibrate) navigator.vibrate(40);
        const now = new Date();
        const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        const tempId = 'temp-' + Date.now();

        const newTrip = {
            nombre: n,
            precio: p,
            time: time,
            id: tempId,
            timestamp: Date.now(),
            date: now.toISOString().split('T')[0]
        };

        App.logs.unshift(newTrip);
        App.render();
        App.msg(`+1 ${n}`);

        try {
            await fetch(`${API}?action=add_trip&nombre=${encodeURIComponent(n)}&precio=${p}`, { method: 'POST' });
            setTimeout(() => App.sync(), 2000);
        } catch (e) {
            App.msg("Guardado Local");
        }
    },

    delLog: async (id, name) => {
        if (!confirm("¿Borrar este viaje?")) return;
        App.logs = App.logs.filter(x => x.id != id);
        App.render();
        App.msg("Borrando...");
        try {
            if (!String(id).startsWith('temp')) {
                await fetch(`${API}?action=delete_trip&id=${id}`, { method: 'POST' });
            }
        } catch (e) { console.error(e); }
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
        setTimeout(() => document.getElementById('name').focus(), 150);
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

    resetHistory: () => {
        if (!confirm("¿Resetear Bitácora?")) return;
        App.logs = [];
        App.render();
        fetch(`${API}?action=reset_history`, { method: 'POST' });
    },

    msg: (t) => {
        const el = document.getElementById('toast');
        if (el) {
            el.innerText = t; el.classList.add('vis');
            setTimeout(() => el.classList.remove('vis'), 2000);
        }
    }
};

window.onload = App.init;
