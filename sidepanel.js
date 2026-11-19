let code = null;
let es = null;
let running = false;
let pending = {}, done = {}, failed = {};
let lastReady = null;

const $ = id => document.getElementById(id);
const setStatus = t => ($("status").textContent = t);

// ---- Firebase REST helper ----
async function api(path, method = "GET", body) {
    const res = await fetch(`${DB_URL}/lists/${code}/${path}.json`, {
        method,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
}

// ---- Setup / secret code ----
async function init() {
    const saved = await chrome.storage.local.get("code");
    if (saved.code) start(saved.code);
    else { $("setup").hidden = false; $("main").hidden = true; }
}

function start(c) {
    code = c;
    lastReady = null;      // force a fresh write
    $("setup").hidden = true;
    $("main").hidden = false;
    connect();
    updateStatus();
}

$("saveBtn").onclick = async () => {
    const c = $("codeInput").value.trim();
    if (!c) return;
    await chrome.storage.local.set({ code: c });
    start(c);
};

$("codeInput").addEventListener("keydown", e => {
    if (e.key === "Enter") $("saveBtn").click();
});

$("changeBtn").onclick = async () => {
    if (es) es.close();
    await api("status", "PUT", { ready: false }).catch(() => { });
    await chrome.storage.local.remove("code");
    code = null;
    lastReady = null;
    $("setup").hidden = false;
    $("main").hidden = true;
};

$("clearBtn").onclick = async () => {
    if (!confirm("Clear pending, done and failed lists?")) return;
    try {
        await api("pending", "DELETE");
        await api("done", "DELETE");
        await api("failed", "DELETE");
        pending = {}; done = {}; failed = {};
        render();
        setStatus("Cleared");
    } catch (e) {
        setStatus("Error: " + e.message);
    }
};

// ---- Live connection ----
function connect() {
    if (es) es.close();
    es = new EventSource(`${DB_URL}/lists/${code}/pending.json`);
    // Any change: just reload the three lists (simple and reliable)
    es.addEventListener("put", refresh);
    es.addEventListener("patch", refresh);
    es.onerror = () => setStatus("Reconnecting…");
}

async function refresh() {
    try {
        pending = (await api("pending")) || {};
        done = (await api("done")) || {};
        failed = (await api("failed")) || {};
        render();
        processQueue();
    } catch (e) {
        setStatus("Error: " + e.message);
    }
}

function fillList(id, countId, items) {
    const ul = $(id);
    ul.innerHTML = "";
    items.forEach(([text, cls]) => {
        const li = document.createElement("li");
        li.textContent = text;
        if (cls) li.className = cls;
        ul.appendChild(li);
    });
    $(countId).textContent = items.length;
}

function render() {
    fillList("pList", "pCount", Object.keys(pending).sort().map(k => [pending[k]]));
    fillList("dList", "dCount", Object.keys(done).sort().reverse().slice(0, 20).map(k => [done[k]]));
    fillList("fList", "fCount", Object.keys(failed).sort().map(k => [`${failed[k].number} (${failed[k].reason})`, "fail"]));
    $("dCount").textContent = Object.keys(done).length;
}

// ---- Processing: one at a time, oldest first ----
async function findTab() {
    const tabs = await chrome.tabs.query({ url: TARGET_URL });
    return tabs.find(t => t.active) || tabs[0] || null;
}

async function processQueue() {
    if (running || !code) return;
    running = true;
    try {
        while (true) {
            const keys = Object.keys(pending).sort();
            if (!keys.length) { setStatus("Waiting for scans…"); break; }

            const key = keys[0];
            const number = String(pending[key]);

            // Already processed before: skip it
            if (Object.values(done).includes(number)) {
                await api(`pending/${key}`, "DELETE");
                delete pending[key];
                render();
                continue;
            }

            const tab = await findTab();
            if (!tab) {
                setStatus("Open the DO page to continue…");
                setTimeout(processQueue, 3000);
                break;
            }

            setStatus("Processing " + number + "…");
            let res;
            try {
                res = await chrome.tabs.sendMessage(tab.id, { type: "fill", number });
            } catch (e) {
                setStatus("Can't reach the page. Reload the DO page.");
                setTimeout(processQueue, 3000);
                break;
            }

            if (res && res.ok) {
                await api(`done/${key}`, "PUT", number);
                done[key] = number;
            } else {
                const reason = (res && res.reason) || "unknown";
                await api(`failed/${key}`, "PUT", { number, reason });
                failed[key] = { number, reason };
            }
            await api(`pending/${key}`, "DELETE");
            delete pending[key];
            render();
        }
    } catch (e) {
        setStatus("Error: " + e.message);
    } finally {
        running = false;
    }
}

// ---- Check if DO page is ready ----
async function updateStatus() {
    if (!code) return;
    let ready = false;
    try {
        const tab = await findTab();
        if (tab) {
            const r = await chrome.tabs.sendMessage(tab.id, { type: "ping" });
            ready = !!(r && r.ok);
        }
    } catch (e) { /* page not reachable */ }

    if (ready === lastReady) return;   // only write when it changes
    lastReady = ready;
    try {
        await api("status", "PUT", { ready });
    } catch (e) {
        lastReady = null;              // retry next time
    }
}

// Page opened, reloaded, navigated away, or closed
chrome.tabs.onUpdated.addListener((_id, info) => {
    if (info.status === "complete" || info.url) setTimeout(updateStatus, 500);
});
chrome.tabs.onRemoved.addListener(() => setTimeout(updateStatus, 200));
chrome.tabs.onActivated.addListener(updateStatus);

// Side panel closing: best-effort write of false
window.addEventListener("pagehide", () => {
    if (!code) return;
    fetch(`${DB_URL}/lists/${code}/status.json`, {
        method: "PUT",
        body: JSON.stringify({ ready: false }),
        keepalive: true                // lets the request finish while the page closes
    });
});

init();