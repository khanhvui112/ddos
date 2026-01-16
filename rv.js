const {connect} = require("puppeteer-real-browser");
const fs = require("fs");

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

    await page.setExtraHTTPHeaders({
        referer: "https://www.google.com/",
    });

    var userAgent = await page.evaluate(() => {
        return navigator.userAgent;
    });
    const iso = '2026-10-03T11:25:10.557Z';
    const expiresInSeconds = Math.floor(new Date(iso).getTime() / 1000);
    userAgent = userAgent.replace("Headless", "");
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36');
    const cookie1 = {
        name: "cf_clearance",
        value: "9heIHw2DEi4twhZXDTDyaOfOHJDBjKqb_nJkj5igoLw-1759411713-1.2.1.1-QuBG79sQHKgVNckyoHSeYhIeaXeKz0Y6wLtyUAWj.jZHTBbbdy1RE0.eivXnQp8L2kxWWPl8aat1kb.h9Yuyv13Tdkit2f0w7SSDfvHVgT08rxbTuY_Ue_jQZBAPesgq171dbC26PUXPAkJRSDDF8OETHiv0hXjOQf.0vlawqqRcj2P.M.XvxwbPzbxt7_Tg_szZcW0_Wip0gE84JDg.bRB5jYTV1GtuGMdpOZ.a8h8",
        domain: ".bavarian-outfitters.de",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "None",
        expires: expiresInSeconds
    };

    await page.setCookie(cookie1);
    // Điều hướng
    await page.goto("https://bavarian-outfitters.de", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
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
        // await browser.close();
        return cookie;
    }
    return null;
}

async function test(proxyOrigin) {
    let proxy = proxyOrigin.split(':')
    const { browser, page } = await connect({
        headless: false,

        args: [],

        customConfig: {},

        turnstile: true,

        connectOption: {},
        disableXvfb: false,
        ignoreAllFlags: false,
        proxy:{
            host:proxy[0],
            port:proxy[1],
            username:proxy[2],
            password:proxy[3]
        }
    });
    /*const iso = '2026-10-03T11:25:10.557Z';
    const expiresInSeconds = Math.floor(new Date(iso).getTime() / 1000);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36');
    const cookie1 = {
        name: "cf_clearance",
        value: "zq9mDFFFaoYLgUF2KLZOAU1tUHtwOZ0dbYNRev9mjAA-1759426639-1.2.1.1-UUEla6Eq1oc2RRfATF6qPrcuZzUdM6PkNGzTfeQwNxvtzdvARm1uHMRtQUozhPxIUA0lDfrcyUrYXjv2rvSVlrooAt7vCKil86ZzBuKUcuXYzWi4pgI0Sp7cdRm38rk9kgwN44Yc_CxrOTatU49t97Rng.HxMzdqA3_C81H_WJoQnVlw4LTjbmbCE_0MH0szGpad_3_Wd_fYPtsFq0Gypo_Wkly1b8pxh6Ghcgjfxfk",
        domain: ".bavarian-outfitters.de",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "None",
        expires: expiresInSeconds
    };

    await page.setCookie(cookie1);*/
    await page.goto("https://bavarian-outfitters.de/");

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
                            host: proxyOrigin,
                            "user-agent": userAgent,
                            cookie: cf.value
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
    await browser.close();
    if (cookie) {
        return cookie;
    }
    return null;
}
function saveResult(newObj) {
    const file = "cookies.json";
    let arr = [];

    if (fs.existsSync(file)) {
        try {
            const data = fs.readFileSync(file, "utf8").trim();
            if (data) {
                arr = JSON.parse(data); // đọc mảng cũ
            }
        } catch (e) {
            console.error("File parse error, reset to []");
            arr = [];
        }
    }

    arr.push(newObj); // thêm object mới

    fs.writeFileSync(file, JSON.stringify(arr, null, 2), "utf8");
}
async function crawlProxy() {
    const pxfine = fs
        .readFileSync('1000_ger.txt', "utf8")
        .replace(/\r/g, "")
        .split("\n");
    for (let i = 0; i < pxfine.length; i++) {
        try {
            const res = await test(pxfine[i]);
            if (res) {
                saveResult(res); // lưu luôn sau khi lấy được
                console.log("Saved:", res.host);
            }
        } catch (err) {
            console.error("Error proxy:", pxfine[i], err.message);
        }
    }
}

crawlProxy()
// test('rp.scrapegw.com:6060:vviu6vbhat33r76-odds-6+100-isp-1014:hu5j45zeu7ezs11');
// getCookieCloudflare('rp.scrapegw.com:6060:vviu6vbhat33r76-odds-5+100-country-us-state-florida-session-s7nv74xhsy:hu5j45zeu7ezs11')