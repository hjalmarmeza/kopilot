const API = "https://script.google.com/macros/s/AKfycbyz4FkiRpBQnYu4jRX4dudEy22TBnE2P0RmwX2vooFa2fIa2QPf0HLuo85bZkuplyNk/exec";

const App = {
    data: [],    // Config Pasajeros
    counts: {},  // Server Counts
    localCounts: {}, // Local Truth (Persistent)
    logs: [],    // Server Logs
    pending: [], // Queue

    init: () => {
        console.log("Kopilot 9.1 Bulletproof");
        const c = localStorage.getItem('k9.1_data');
        if (c) {
            const d = JSON.parse(c);
            App.data = d.p || [];
            App.counts = d.c || {};
            App.localCounts = d.lc || {};
        }
        App.render();
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
        if (i) i.classList.add('spin');

        try {
            const [cR, sR] = await Promise.all([
                fetch(`${API}?action=get_config`),
                fetch(`${API}?action=get_summary`)
            ]);
            const conf = await cR.json();
            const sum = await sR.json();

            if (conf.status === 'success') App.data = conf.passengers;

            // Server truth
            const sCounts = {};
            const sLogs = [];
            const now = new Date();
            const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            if (sum.status === 'success') {
                sLogs.push(...[...sum.trips].reverse());
                sum.trips.forEach(t => {
                    if (t.mesId === m) sCounts[t.nombre] = (sCounts[t.nombre] || 0) + 1;
                });
            }

            App.counts = sCounts;
            App.logs = sLogs;

            // HEALING: If server count > local count, server wins (we missed something elsewhere).
            // If local > server, local wins (we are ahead).
            for (let p of App.data) {
                const sVal = App.counts[p.nombre] || 0;
                const lVal = App.localCounts[p.nombre] || 0;
                if (sVal > lVal) App.localCounts[p.nombre] = sVal;
            }

            App.save();
            App.render();

        } catch (e) { App.msg("Offline mode"); }
        finally { if (i) i.classList.remove('spin'); }
    },

    render: () => {
        // Grid uses LOCAL COUNTS primarily
        const g = document.getElementById('grid');
        g.innerHTML = '';
        if (App.data.length === 0) {
            g.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:white;opacity:0.7;">Sin Pasajeros</div>`;
        } else {
            App.data.forEach(p => {
                // The Logic: Use LocalCount (which includes pending implicitly)
                const cnt = App.localCounts[p.nombre] || 0;
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

        // Show pending on top of server logs
        const displayLogs = [...App.pending, ...App.logs];

        if (displayLogs.length === 0) {
            h.innerHTML = `<div style="text-align:center;padding:30px;color:white;opacity:0.6;">Sin viajes hoy</div>`;
        } else {
            displayLogs.forEach(x => {
                const r = document.createElement('div');
                r.className = 'log-item';
                if (x.isPending) {
                    r.style.opacity = '0.6';
                    r.style.border = '1px dashed rgba(255,255,255,0.3)';
                }

                let displayTime = "";
                let displayDate = "";

                if (x.isPending) {
                    displayTime = "Enviando...";
                } else {
                    if (x.time) {
                        const t = new Date(x.time); function isDate(d) { return !isNaN(d.getTime()) }
                        displayTime = isDate(t) ? `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}` : x.time;
                    }
                    if (x.date) {
                        const d = new Date(x.date);
                        if (!isNaN(d.getTime())) {
                            displayDate = `${d.getDate()}/${d.getMonth() + 1}`;
                            if (!displayTime && d.getHours()) displayTime = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
                        } else {
                            displayDate = String(x.date).substring(0, 10);
                        }
                    }
                }

                let fullStr = displayTime || '--:--';
                if (displayDate) fullStr += ` · ${displayDate}`;

                let delBtn = !x.isPending ?
                    `<button class="log-del" onclick="App.delLog('${x.id}', '${x.nombre}')"><span class="material-icons-round" style="font-size:18px">close</span></button>` :
                    ``;

                r.innerHTML = `
                    <div class="log-info">
                        <span style="font-weight:600">${x.nombre}</span>
                        <span class="log-date">${fullStr}</span>
                    </div>
                    ${delBtn}
                `;
                h.appendChild(r);
            });
        }
    },

    add: async (n, p) => {
        if (navigator.vibrate) navigator.vibrate(50);

        // 1. Update LOCAL count instantly
        App.localCounts[n] = (App.localCounts[n] || 0) + 1;
        App.save();

        // 2. Add to Pending Queue
        const tempId = 'pending-' + Date.now();
        App.pending.unshift({ nombre: n, id: tempId, isPending: true });

        App.render();

        try {
            await fetch(`${API}?action=add_trip&nombre=${n}&precio=${p}`, { method: 'POST' });
            // Remove from pending
            App.pending = App.pending.filter(x => x.id !== tempId);
            // We do NOT sync immediately to avoid race condition where server hasn't updated yet.
            // We rely on background sync or manual sync for confirmation.
            // But we can trigger a sync with delay.
            setTimeout(App.sync, 2000);

        } catch (e) {
            console.error(e);
            App.msg("Error red - Se reintentará");
        }
    },

    delLog: async (id, name) => {
        if (!confirm("¿Borrar?")) return;
        App.logs = App.logs.filter(x => x.id != id);

        // Decrement local count if safe
        if (App.localCounts[name] > 0) App.localCounts[name]--;
        App.save();
        App.render();

        await fetch(`${API}?action=delete_trip&id=${id}`, { method: 'POST' });
    },

    resetHistory: () => {
        if (!confirm("¿Borrar Historial?")) return;
        App.logs = []; App.counts = {}; App.localCounts = {}; App.pending = [];
        App.save();
        App.render();
        fetch(`${API}?action=reset_history`, { method: 'POST' });
        App.msg("Bitácora Limpia");
    },

    save: () => {
        localStorage.setItem('k9.1_data', JSON.stringify({
            p: App.data,
            c: App.counts,
            lc: App.localCounts
        }));
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

    saveP: async (e) => {
        e.preventDefault();
        const old = document.getElementById('eid').value;
        const n = document.getElementById('name').value;
        const p = document.getElementById('price').value;
        App.close();
        App.msg("Guardando...");
        if (old) {
            const ix = App.data.findIndex(x => x.nombre === old);
            if (ix >= 0) App.data[ix] = { nombre: n, precio: p, activo: true };
            // Move local count to new name
            if (old !== n) {
                App.localCounts[n] = App.localCounts[old] || 0;
                delete App.localCounts[old];
            }
        }
        App.render();
        const act = old ? 'edit_passenger' : 'add_passenger';
        const q = new URLSearchParams({ action: act, nombre: n, precio: p, oldName: old, newName: n, newPrice: p });
        await fetch(`${API}?${q.toString()}`, { method: 'POST' });
        App.save(); App.sync();
    },
    del: () => {
        if (!confirm("¿Eliminar?")) return;
        const n = document.getElementById('eid').value;
        App.close();
        App.data = App.data.filter(x => x.nombre !== n);
        delete App.localCounts[n];
        App.render();
        fetch(`${API}?action=delete_passenger&nombre=${n}`, { method: 'POST' });
    },
    msg: (t) => {
        const el = document.getElementById('toast');
        el.innerText = t; el.classList.add('vis');
        setTimeout(() => el.classList.remove('vis'), 2000);
    }
};

window.onload = App.init;
