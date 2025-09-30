const {connect} = require("puppeteer-real-browser");
const {FingerprintInjector} = require("fingerprint-injector");
const {FingerprintGenerator} = require("fingerprint-generator");

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

    userAgent = userAgent.replace("Headless", "");
    await page.setUserAgent(userAgent);

    // Điều hướng
    await page.goto("https://taphoammo.net/", {
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

    const cookie = await getCookies(page);
    console.log("Result:", cookie);

    if (cookie) {
        await browser.close();
        return cookie;
    }
    return null;
}

// ví dụ proxy thường
getCookieCloudflare("209.50.184.106:3129");

// ví dụ proxy có auth
// getCookieCloudflare("host:port:user:pass");
let t = {
    "method": "turnstile",
    "key": "YOUR API KEY",
    "sitekey": "0x4AAAAAAADnPIDROrmt1Wwj",
    "pageurl": "https://taphoammo.net/",
    "data": "9872ebaa0b96f890",
    "pagedata": "fjjNGP9uCyglBiPTAe3sxZSac6N2R6BDA24mGprhEpA-1759226924-1.3.1.1-Bwqgq4YWsSu2wsulCauRH20tQYxF37eNXtixqYPsVSK77NWsqaH.0NDA6yIwzePYYqgDz5jX1dIDyc4Aphs8kkawiJUWTnnD2kRosUNtNiFte10n2_6dswRNo.gcqM72ACRq5Cr9DtaL5g3Ub8alrBgH_7ujkXJVdnR6b8B_mHcQqpg2YnSB1UU0jfBlEe4YXzT31P_dH2vHbtYGwvet4GZ5KDIGFqlV4Jka9_xSSLMgRRdD5KV56A9DTQEEwAgoW1fwyPjsjo3TvPcWFc7Lx53aZKVhuOQEqWPBHq.kz1yRbdXwWUP3CJXcUxW3cnY9CKiN1TmG47ai99ba97tt1jrPTFtRx0N4PG4nZucTQ8WPw2oIQPMG4G.ku8RHfQ4A",
    "action": "managed",
    "json": 1
}