// proxy-checker-immediate-save-fixed.js (ESM)
import fs from "fs";
import fsp from "fs/promises";
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import path from "path";
import { fileURLToPath } from "url";
import { once } from "events";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIG
const URL_TARGET = "https://bavarian-outfitters.de/";
const INPUT_FILE = path.join(__dirname, "proxies_spy.txt");
const LIVE_OUT_FILE = path.join(__dirname, "live_proxies_spy.txt");
const COOKIES_JSON_FILE = path.join(__dirname, "lst-proxy", "cookies.json");

const CONCURRENCY = 50;
const DELAY_BETWEEN = 50;
const FLUSH_EVERY = 10;

// helper: atomic write JSON
async function atomicWriteJson(filePath, obj) {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = filePath + ".tmp";
    await fsp.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
    await fsp.rename(tmp, filePath);
}

async function flushCookiesToFile(cookiesMap) {
    const arr = Array.from(cookiesMap.values());
    await atomicWriteJson(COOKIES_JSON_FILE, arr);
    console.log(`Flushed ${arr.length} cookies to ${COOKIES_JSON_FILE}`);
}

function proxyToAgentUrl(proxy) {
    proxy = proxy.trim();
    if (/^[a-z]+:\/\//i.test(proxy)) return proxy;
    const parts = proxy.split(":");
    if (parts.length === 2) {
        return `http://${parts[0]}:${parts[1]}`;
    }
    if (parts.length === 4) {
        const [host, port, user, pass] = parts;
        return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
    }
    return `http://${parts[0]}:${parts[1] || ""}`.replace(/\/+$/, "");
}

// robust checkProxy with AbortController + safety destroy
async function checkProxy(proxy) {
    const agentUrl = proxyToAgentUrl(proxy);

    // create agent from string (safer)
    let agent;
    try {
        agent = new HttpsProxyAgent(agentUrl);
    } catch (e) {
        return {
            ok: false,
            proxy,
            status: null,
            latency: null,
            ipDetected: null,
            cookie: null,
            error: `agent_create_error:${e && e.message}`,
        };
    }

    const controller = new AbortController();
    const signal = controller.signal;

    const AXIOS_TIMEOUT = 20000;    // axios timeout
    const SAFETY_TIMEOUT = 32000;  // maximum time before forced destroy

    let timeoutHandle = null;
    try {
        // safety timer
        timeoutHandle = setTimeout(() => {
            try { controller.abort(); } catch(e) {}
            try { if (agent && typeof agent.destroy === "function") agent.destroy(); } catch(e) {}
        }, SAFETY_TIMEOUT);

        const start = Date.now();
        const res = await axios.get("https://api.ipify.org?format=json", {
            timeout: AXIOS_TIMEOUT,
            httpAgent: agent,
            httpsAgent: agent,
            proxy: false,
            signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; proxy-checker/1.0)",
                Accept: "application/json,text/plain,*/*",
            },
            validateStatus: null,
        });

        clearTimeout(timeoutHandle);
        const latency = Date.now() - start;

        const ok = res && res.status >= 200 && res.status < 300;
        let ipDetected = null;
        try {
            if (res && res.data) ipDetected = typeof res.data === "string" ? JSON.parse(res.data).ip : res.data.ip;
        } catch (e) { ipDetected = null; }

        return {
            ok,
            proxy,
            status: res ? res.status : null,
            latency,
            ipDetected,
            cookie: null,
            error: ok ? null : `status_${res ? res.status : "no_response"}`,
        };
    } catch (err) {
        clearTimeout(timeoutHandle);
        try { if (agent && typeof agent.destroy === "function") agent.destroy(); } catch(e) {}
        const isAbort = err && (err.name === "CanceledError" || err.code === "ERR_CANCELED" || err.message === "canceled");
        return {
            ok: false,
            proxy,
            status: null,
            latency: null,
            ipDetected: null,
            cookie: null,
            error: isAbort ? "timeout_or_abort" : (err.code || err.message || String(err)),
        };
    }
}

// concurrency runner
async function runWithConcurrency(items, workerFn, concurrency = 50) {
    const results = [];
    let idx = 0;

    const worker = async () => {
        while (true) {
            const i = idx++;
            if (i >= items.length) break;
            try {
                results[i] = await workerFn(items[i], i);
            } catch (e) {
                results[i] = { ok: false, proxy: items[i], error: e && e.message ? e.message : String(e) };
            }
        }
    };

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
}

// MAIN
async function main() {
    // read proxies
    const exists = await fsp.stat(INPUT_FILE).then(() => true).catch(() => false);
    if (!exists) {
        console.error(`Input file not found: ${INPUT_FILE}`);
        return;
    }

    const raw = await fsp.readFile(INPUT_FILE, "utf8");
    const proxiesRaw = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (proxiesRaw.length === 0) {
        console.error("No proxies in input file.");
        return;
    }

    const proxies = Array.from(new Set(proxiesRaw));
    console.log(`Loaded ${proxies.length} unique proxies. Concurrency=${CONCURRENCY}`);

    // prepare output stream (append mode)
    await fsp.mkdir(path.dirname(LIVE_OUT_FILE), { recursive: true });
    const liveStream = fs.createWriteStream(LIVE_OUT_FILE, { flags: "a" });

    const cookiesMap = new Map();
    let cookiesSinceLastFlush = 0;

    const workerFn = async (proxy, i) => {
        console.log(`→ [#${i+1}/${proxies.length}] Checking ${proxy}`);
        const res = await checkProxy(proxy);

        // small delay
        await new Promise(r => setTimeout(r, DELAY_BETWEEN));

        if (res.ok) {
            const line = proxy + "\n";
            // write and respect backpressure
            if (!liveStream.write(line)) {
                // wait for drain to avoid memory blow
                await once(liveStream, "drain");
            }

            // handle cookie storing (if any)
            if (res.cookie) {
                const parts = proxy.split(":");
                const proxyKey = parts[0] + (parts[1] ? `:${parts[1]}` : "");
                const now = new Date().toISOString();
                const existing = cookiesMap.get(proxyKey);
                if (existing) {
                    existing.cookie = res.cookie;
                    existing.updated = now;
                } else {
                    cookiesMap.set(proxyKey, { host: proxyKey, cookie: res.cookie, created: now });
                }
                cookiesSinceLastFlush++;
                if (cookiesSinceLastFlush >= FLUSH_EVERY) {
                    await flushCookiesToFile(cookiesMap);
                    cookiesSinceLastFlush = 0;
                }
            }

            console.log(`\x1b[32m[LIVE]\x1b[0m ${proxy} status=${res.status} latency=${res.latency || "-"}ms`);
        } else {
            console.log(`\x1b[31m[DEAD]\x1b[0m ${proxy} -> ${res.error}`);
        }

        return res;
    };

    const results = await runWithConcurrency(proxies, workerFn, CONCURRENCY);

    // close stream
    liveStream.end();
    if (cookiesMap.size > 0) {
        await flushCookiesToFile(cookiesMap);
    }

    const okCount = results.filter(r => r && r.ok).length;
    const failCount = results.length - okCount;
    console.log(`✅ Done. OK=${okCount}, FAIL=${failCount}`);
}

main().catch(e => {
    console.error("Fatal error", e);
    process.exit(1);
});
