const {connect} = require("puppeteer-real-browser");
const {FingerprintInjector} = require("fingerprint-injector");
const {FingerprintGenerator} = require("fingerprint-generator");
const fs = require("fs");
const path = require("path");
const fsp = require("fs/promises");
const INPUT_FILE = path.join(__dirname, "1000_ger.txt");
const LIVE_OUT_FILE = path.join(__dirname, "live_1000_ger.txt");


function random_int(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function getCookieCloudflare(proxy) {
    let options = {
        headless: false,
        turnstile: true,
        args: [],
        customConfig: {},
        connectOption: {},
        ignoreAllFlags: false,
    };

    if (proxy) {
        const proxyParts = proxy.split(":");
        if (proxyParts.length === 2) {
            // dạng host:port
            const [proxyHost, proxyPort] = proxyParts;
            options.proxy = {
                host: proxyHost,
                port: parseInt(proxyPort, 10),
            };
        } else if (proxyParts.length === 4) {
            // dạng host:port:user:pass
            const [proxyHost, proxyPort, proxyUser, proxyPass] = proxyParts;
            options.proxy = {
                host: proxyHost,
                port: parseInt(proxyPort, 10),
                username: proxyUser,
                password: proxyPass,
            };
        }
    }

    const {browser, page} = await connect(options);

    // Fingerprint
    const fingerprintInjector = new FingerprintInjector();
    const fingerprintGenerator = new FingerprintGenerator({
        devices: ["desktop"],
        browsers: [{name: "chrome", minVersion: random_int(122, 126)}],
        operatingSystems: ["windows"],
    });

    const fingerprint = fingerprintGenerator.getFingerprint();
    await fingerprintInjector.attachFingerprintToPuppeteer(page, fingerprint);

    await page.setExtraHTTPHeaders({
        referer: "https://www.google.com/",
    });

    var userAgent = await page.evaluate(() => {
        return navigator.userAgent;
    });
    // cookie: 'ftnYJon93BPs9l0sQBU2Sy5tgw9KqQNogYNp61Y9ZW0-1759402808-1.2.1.1-y_BFOg_RHgMgf.nHT.KzUQEPHLQso1IPP5EGbJJujfoaSY32EYzDlCvm19ek_Bg3j3A1vRgv4TB7GDIdqFF7_kY92UACUu1.Vv.f19G9cutPk3_RaLNaE8Y9WHDu1qXJpp6VDYEjcdFq2TxcN4tlFdqUqWjNyO6x0FWnQ1A2vSqZE3TUgwuN58x8UDlk9X_dv.XDktSGlsNzbTs7uv..m2cRuoj2uVcbwlXNCxNOZCc',
    //     userAgent: ''
    const iso = '2026-10-02T11:25:10.557Z';
    const expiresInSeconds = Math.floor(new Date(iso).getTime() / 1000);
    userAgent = userAgent.replace("Headless", "");
    const cookie1 = {
        name: "cf_clearance",
        value: "cZ_4086OXWPEahgbcHZO_dQETeXqm9CNoQOTAmGvAcc-1759404310-1.2.1.1-KLP5aS5MIwS8EMjItgKuAth13Rg4HrLnvv9b.ttvX_4ivxYoUpvf9823mI670XtnlQGgtuiHAV5qGv2IYaqXPMi6nVgzM1fhotg64pbS_qJUcI_VsGu8MwHtVXDJJg2x0lJD9YH9BQ.zW8BP5f0vKGu4pgOyEDrZiNKcEWGRwtZXUgd_CRq5gxtA8p1TqfhIWYhHYqHjuctYbeAVOIf.OruCkm._mZxE5QQmqumivlk",
        domain: ".bavarian-outfitters.de",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "None",
        expires: expiresInSeconds
    };

    await page.setCookie(cookie1);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36');

    // Điều hướng
    await page.goto("https://bavarian-outfitters.de/", {
        waitUntil: "domcontentloaded",
        timeout: 2000000,
    });

    // Lấy cookie + userAgent
    async function getCookies(page) {
        return new Promise((resolve, reject) => {
            let inl = setInterval(async () => {
                try {
                    const cookies = await page.cookies();
                    const userAgent = await page.browser().userAgent();
                    const cf = cookies.find(c => c.name === "cf_clearance");
                    if (cf) {
                        clearInterval(inl);
                        resolve({
                            cookie: cf.value,
                            userAgent,
                        });
                    }
                } catch (err) {
                    clearInterval(inl);
                    reject(err);
                }
            }, 200);
        });
    }

    // const cookie = await getCookies(page);
    // console.log("Result:", cookie);
    //
    // if (cookie) {
    //     await browser.close();
    //     return cookie;
    // }
    return null;
}

// ví dụ proxy thường
// getCookieCloudflare("65.111.30.248:3129");

// đọc proxy từ file txt
function readProxies() {
    return fs.readFileSync(proxyFile, "utf8")
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0);
}

// hàm lưu cookie vào file json (append từng dòng)
function saveCookie(proxy, cookie) {
    let data = [];
    if (fs.existsSync(outputFile)) {
        try {
            data = JSON.parse(fs.readFileSync(outputFile, "utf8"));
        } catch (e) {
            console.error("Lỗi đọc cookies.json:", e);
        }
    }

    // tách host (trường hợp có user/pass thì chỉ lấy host)
    const host = proxy.split(":")[0];

    data.push({
        host: host,
        cookie: cookie.cookie,
        "user-agent": cookie.userAgent,
    });

    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2), "utf8");
    console.log("✅ Lưu thành công cookie cho proxy:", host);
}

// chạy toàn bộ proxy
async function run() {
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

    for (const proxy of proxies) {
        try {
            console.log("🔎 Đang xử lý proxy:", proxy);
            const cookie = await getCookieCloudflare(proxy);
            if (cookie) {
                saveCookie(proxy, cookie);
            } else {
                console.log("⚠️ Không lấy được cookie:", proxy);
            }
        } catch (err) {
            console.error("❌ Lỗi với proxy", proxy, err.message);
        }
    }
}

// run();
getCookieCloudflare('rp.scrapegw.com:6060:vviu6vbhat33r76-session-2zqtmkv95x-lifetime-120:hu5j45zeu7ezs11')