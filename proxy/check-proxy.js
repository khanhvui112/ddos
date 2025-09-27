// proxy-checker.js (ESM) — concurrent proxy checking + save cookies to JSON
import fs from "fs";
import fsp from "fs/promises";
import axios from "axios";
import {HttpsProxyAgent} from "https-proxy-agent";
import vm from "vm";
import path from "path";
import {fileURLToPath} from "url";
import FormData from "form-data";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIG
const URL_TARGET = 'https://bavarian-outfitters.de/';
const INPUT_FILE = path.join(__dirname, 'lst-proxy', 'proxies_spy.txt');
const LIVE_OUT_FILE = path.join(__dirname, 'lst-proxy', 'live_proxies_spy.txt');
// const COOKIES_JSON_FILE = path.join(__dirname, 'lst-proxy', 'cookies.json');

const CONCURRENCY = 50;        // số worker đồng thời (tăng giảm tuỳ máy)
const DELAY_BETWEEN = 50;      // ms delay sau mỗi proxy xử lý (giảm rate)
const FLUSH_EVERY = 10;        // mỗi khi có N cookies mới -> flush tạm vào file

// --- helper: atomic write JSON ---
async function atomicWriteJson(filePath, arr) {
    await fsp.mkdir(path.dirname(filePath), {recursive: true});
    const tmp = filePath + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(arr, null, 2), 'utf8');
    await fsp.rename(tmp, filePath);
}

// --- getCookieFromHtml (như trước) ---
function getCookieFromHtml(html) {
    if (!html || typeof html !== 'string') return null;
    const re = /S\s*=\s*'([^']+)'/i;
    const m = html.match(re);
    if (!m) return null;
    const S = m[1];
    let decoded;
    try {
        decoded = Buffer.from(S, 'base64').toString('utf8');
    } catch (err) {
        return null;
    }

    const sandbox = {
        document: {},
        location: {
            reloaded: false, reload: () => {
                sandbox.location.reloaded = true;
            }
        },
        console: {
            log: () => {
            }, warn: () => {
            }, error: () => {
            }
        },
        String: String
    };

    Object.defineProperty(sandbox.document, 'cookie', {
        configurable: true,
        enumerable: true,
        get() {
            return this._cookie || '';
        },
        set(val) {
            this._cookie = this._cookie ? (this._cookie + '; ' + val) : val;
            sandbox.cookieSet = this._cookie;
        }
    });

    try {
        const context = vm.createContext(sandbox);
        const script = new vm.Script(decoded);
        script.runInContext(context, {timeout: 3000});
    } catch (err) {
        // ignore
    }

    if (!sandbox.cookieSet) return null;
    return sandbox.cookieSet.split(';').map(s => s.trim())[0] || null;
}


// --- checkProxy (giữ nguyên logic) ---
async function checkProxy1(proxy, urlTarget = URL_TARGET) {
    // proxy = "209.50.182.11:3129"
    const parts = proxy.split(':');
    if (parts.length < 2) return {ok: false, error: 'invalid-proxy-format'};
    let agentUrl;
    let [host, port, user, pass] = []
    if (parts.length === 2) {
        [host, port] = parts;
        agentUrl = `http://${host}:${port}`;
    } else if (parts.length === 4) {
        [host, port, user, pass] = parts;
        // note: some lists are host:port:user:pass, adjust if your format is different
        agentUrl = `http://${user}:${pass}@${host}:${port}`;
    } else {
        agentUrl = `http://${parts[0]}:${parts[1]}`;
    }
    agentUrl = agentUrl.replace(/\/+$/, '');
    const agent = new HttpsProxyAgent(agentUrl);

    try {
        const resp = await axios.get(urlTarget, {
            httpsAgent: agent,
            timeout: 10000,
            responseType: 'text',
            maxRedirects: 0,
            validateStatus: () => true,
            headers: {
                // "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
                // "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                // "Cookie": "sucuricp_tfca_6e453141ae697f9f78b18427b4c54df1=1; "+c,
                // "accept-language": "ru,q=0.4",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", // Fixed UA
                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "cookie": `sucuricp_tfca_6e453141ae697f9f78b18427b4c54df1=1; ${c}`,
                "accept-language": "ru,q=0.4"
            },
        });
        console.log('CC: ', resp.status)
        if (resp.status === 403) {
            console.log(resp)
        }
        const html = typeof resp.data === 'string' ? resp.data : '';
        if (resp.status === 307 || /sucuri_cloudproxy_js/i.test(html)) {
            const cookie = getCookieFromHtml(html);
            if (cookie) {
                return {ok: true, status: resp.status, cookie};
            } else {
                return {ok: false, status: resp.status, error: 'no-cookie-found'};
            }
        }

        if (resp.status >= 200 && resp.status < 300) {
            return {ok: true, status: resp.status};
        }
        return {ok: false, status: resp.status, error: 'non-200'};
    } catch (err) {
        const code = err && err.code ? err.code : 'UNKNOWN';
        return {ok: false, error: `request-failed:${code}`, detail: err.message};
    }
}

async function checkProxy(proxy) {
    const parts = proxy.split(':');
    if (parts.length < 2) return {ok: false, error: 'invalid-proxy-format'};
    let agentUrl;
    let [host, port, user, pass] = []
    if (parts.length === 2) {
        [host, port] = parts;
        agentUrl = `http://${host}:${port}`;
    } else if (parts.length === 4) {
        [host, port, user, pass] = parts;
        // note: some lists are host:port:user:pass, adjust if your format is different
        agentUrl = `http://${user}:${pass}@${host}:${port}`;
    } else {
        agentUrl = `http://${parts[0]}:${parts[1]}`;
    }
    agentUrl = agentUrl.replace(/\/+$/, '');
    const agent = new HttpsProxyAgent(agentUrl);
    let response = null;
    try {
        response = await axios.get('https://api.ipify.org?format=json', {
            timeout: 5000,
            httpAgent: agent,   // axios vẫn chấp nhận; for https request agent is used
            httpsAgent: agent,
            proxy: false,       // bắt buộc: disable axios built-in proxy handling
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; proxy-checker/1.0)',
                'Accept': 'application/json,text/plain,*/*'
            },
            validateStatus: null // để không tự throw theo status
        });
        console.log(`\x1b[32m[LIVE] ${proxy}\x1b[0m`);
        return proxy;
    } catch (e) {
        if (e.response && e.response.status === 407) {
            console.log('\x1b[33mPhai xac thuc.\x1b[0m');
            return proxy;
        }
        console.error(`\x1b[31m[DEAD] ${proxy}\x1b[0m`);
        return null;
    }
}

// --- pool runner ---
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
                results[i] = {ok: false, error: e && e.message ? e.message : String(e)};
            }
        }
    };

    const workers = Array.from({length: Math.min(concurrency, items.length)}, () => worker());
    await Promise.all(workers);
    return results;
}

// --- MAIN: read proxies, check concurrently, save live proxies & cookies.json ---
async function main() {
    // read proxies
    const raw = await fsp.readFile(INPUT_FILE, 'utf8');
    const proxies = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    console.log(`Loaded ${proxies.length} proxies. Running concurrency=${CONCURRENCY}`);

    // ensure out dir
    await fsp.mkdir(path.dirname(LIVE_OUT_FILE), {recursive: true});

    // clear live output file
    await fsp.writeFile(LIVE_OUT_FILE, '', 'utf8');

    // in-memory map for cookies (keyed by host)
    const cookiesMap = new Map();
    let cookiesSinceLastFlush = 0;

    // worker function
    const workerFn = async (proxy) => {
        const res = await checkProxy(proxy);
        // small delay to avoid flooding
        await new Promise(r => setTimeout(r, DELAY_BETWEEN));

        if (res.ok) {
            // append live proxy
            fs.appendFileSync(LIVE_OUT_FILE, proxy + '\n', 'utf8');

            // if we obtained a cookie, store it
            if (res.cookie) {
                // Lấy host:port từ chuỗi proxy.
                // Các định dạng proxy phổ biến: "ip:port" hoặc "ip:port:user:pass"
                const parts = proxy.split(':');
                const proxyHost = parts[0];
                const proxyPort = parts[1] || '';
                const proxyKey = proxyPort ? `${proxyHost}` : proxyHost; // dùng ip:port làm key

                const now = new Date().toISOString();

                const existing = cookiesMap.get(proxyKey);
                if (existing) {
                    existing.cookie = res.cookie;
                    existing.updated = now;
                } else {
                    cookiesMap.set(proxyKey, {host: proxyKey, cookie: res.cookie, created: now});
                }

                cookiesSinceLastFlush++;

                // flush periodically
                if (cookiesSinceLastFlush >= FLUSH_EVERY) {
                    await flushCookiesToFile(cookiesMap);
                    cookiesSinceLastFlush = 0;
                }
            }
            console.log(`[LIVE] ${proxy} status=${res.status || 'ok'} cookie=${res.cookie || ''}`);
        } else {
            console.log(`[DEAD] ${proxy} => ${res.error || res.status}`);
        }

        // return res for debugging
        return res;
    };

    // run pool
    await runWithConcurrency(proxies, workerFn, CONCURRENCY);

    // final flush
    await flushCookiesToFile(cookiesMap);

    console.log('✅ All done.');
}

// helper to flush cookiesMap to COOKIES_JSON_FILE (atomically)
async function flushCookiesToFile(cookiesMap) {
    // read existing array from file (if any) and merge/update with cookiesMap
    let arr = [];
    try {
        const raw = await fsp.readFile(COOKIES_JSON_FILE, 'utf8');
        arr = JSON.parse(raw);
        if (!Array.isArray(arr)) arr = [];
    } catch (e) {
        if (e.code === 'ENOENT') arr = [];
        else {
            console.warn('Warning reading cookies file:', e.message);
            arr = [];
        }
    }

    // convert arr to map by host
    const diskMap = new Map(arr.map(it => [it.host, it]));

    // merge from cookiesMap (update or insert)
    for (const [host, obj] of cookiesMap.entries()) {
        const now = new Date().toISOString();
        if (diskMap.has(host)) {
            const existing = diskMap.get(host);
            existing.cookie = obj.cookie;
            existing.updated = now;
        } else {
            diskMap.set(host, {host, cookie: obj.cookie, created: obj.created || now});
        }
    }

    // write back array
    const outArr = Array.from(diskMap.values());
    await atomicWriteJson(COOKIES_JSON_FILE, outArr);
    console.log(`Flushed ${cookiesMap.size} cookie(s) to ${COOKIES_JSON_FILE}`);
}


async function postAction() {
    const formdata = new FormData();
    const textContent = fs.readFileSync("./proxy/txt-examp.txt", "utf8");
    // console.log(textContent)
    formdata.append("note", textContent);
    formdata.append("action", "set_dates");
    formdata.append("from", "2025-09-30");
    formdata.append("to", "2025-10-02");
    formdata.append("curlang", "de");
    let proxy = "103.30.10.92:39469:nefx0k5o:nEFX0k5O"
    const parts = proxy.split(':');
    if (parts.length < 2) return {ok: false, error: 'invalid-proxy-format'};
    let agentUrl;
    let [host, port, user, pass] = []
    if (parts.length === 2) {
        [host, port] = parts;
        agentUrl = `http://${host}:${port}`;
    } else if (parts.length === 4) {
        [host, port, user, pass] = parts;
        // note: some lists are host:port:user:pass, adjust if your format is different
        agentUrl = `http://${user}:${pass}@${host}:${port}`;
    } else {
        agentUrl = `http://${parts[0]}:${parts[1]}`;
    }
    agentUrl = agentUrl.replace(/\/+$/, '');
    const agent = new HttpsProxyAgent(agentUrl);

    const headers = {
        "accept": "application/json, text/javascript, */*; q=0.01",
        "accept-language": "vi,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7,zh;q=0.6",
        "cache-control": "no-cache",
        "origin": "https://bavarian-outfitters.de",
        "pragma": "no-cache",
        "priority": "u=1, i",
        "referer": "https://bavarian-outfitters.de/produkt/dirndl-inkl-bluse/",
        "sec-ch-ua": "\"Chromium\";v=\"140\", \"Not=A?Brand\";v=\"24\", \"Google Chrome\";v=\"140\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        "x-requested-with": "XMLHttpRequest",
        "Cookie": "sucuricp_tfca_6e453141ae697f9f78b18427b4c54df1=1; " // rút gọn cookie cho dễ nhìn
    };

// gộp thêm headers do form-data tạo ra (boundary)
    const finalHeaders = {
        ...headers,
        ...formdata.getHeaders()
    };

    try {
        const response = await axios.post(
            "https://bavarian-outfitters.de/wp-admin/admin-ajax.php",
            formdata,
            {
                headers: finalHeaders,
                httpsAgent: agent,
            }
        );
        console.log(response.data);
    } catch (error) {
        console.error(error);
    }
}
// postAction();
// run
main().catch(e => {
    console.error('Fatal error', e);
    process.exit(1);
});
// checkProxy('104.207.54.16:3129', 'https://bavarian-outfitters.de/dasdasdsad/%C4%91asad').catch(e => {
//     console.error('Fatal error', e);
//     process.exit(1);
// });

// function aaa() {
//     let html = `<html><title>You are being redirected...</title>
// <noscript>Javascript is required. Please enable javascript before you are allowed to see this page.</noscript>
//
// <script>var s={},u,c,U,r,i,l=0,a,e=eval,w=String.fromCharCode,sucuri_cloudproxy_js='',S='az0iMCIgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKDUwKSArICI4IiArICJkIiArICJjIiArIFN0cmluZy5mcm9tQ2hhckNvZGUoOTcpICsgU3RyaW5nLmZyb21DaGFyQ29kZSg1NSkgKyAnZScgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKDU2KSArICIwIiArIFN0cmluZy5mcm9tQ2hhckNvZGUoMTAxKSArICc4JyArICcwJyArICIwIiArICJkIiArICI1IiArICdmJyArICc3JyArICc0JyArICdhJyArICc4JyArIFN0cmluZy5mcm9tQ2hhckNvZGUoNDkpICsgJzgnICsgImIiICsgU3RyaW5nLmZyb21DaGFyQ29kZSg1MikgKyAiYyIgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKDU1KSArICJiIiArICJmIiArICJkIiArIFN0cmluZy5mcm9tQ2hhckNvZGUoNTQpICsgU3RyaW5nLmZyb21DaGFyQ29kZSgxMDIpICsgJyc7ZG9jdW1lbnQuY29va2llPSdzJysndScrJ2MnKyd1JysncicrJ2knKydfJysnYycrJ2wnKydvJysndScrJ2QnKydwJysncicrJ28nKyd4JysneScrJ18nKyd1JysndScrJ2knKydkJysnXycrJzcnKycwJysnYycrJzQnKyczJysnYicrJzgnKycwJysnOScrIj0iICsgayArICc7cGF0aD0vO21heC1hZ2U9ODY0MDAnOyBsb2NhdGlvbi5yZWxvYWQoKTs=';L=S.length;U=0;r='';var A='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';for(u=0;u<64;u++){s[A.charAt(u)]=u;}for(i=0;i<L;i++){c=s[S.charAt(i)];U=(U<<6)+c;l+=6;while(l>=8){((a=(U>>>(l-=8))&0xff)||(i<(L-2)))&&(r+=w(a));}}e(r);</script></html>`
//
//     let c = getCookieFromHtml(html);
//     console.log(c)
// }
