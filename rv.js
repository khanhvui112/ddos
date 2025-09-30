import vm from "vm";

const {HttpsProxyAgent} = require("https-proxy-agent");
const axios = require("axios");
if (url.host.includes("bavarian-outfitters.de")) {
    let linkAll = [
        "/en/",
        "/produkt/dirndl-inkl-bluse/",
        "/produkt/lederhose/",
        "/produkt/lederhose-set/",
        "/produkt/haferlschuhe/",
        "/lederhosenverleih-preise/",
        "/lederhosenverleih-fuer-firmenkunden/",
        "/kollektion/",
        "/blog/",
        "/kontakt/",
        "/shop",
        "/warenkorb-2/",
        "/oeffnungszeiten",
        "/lederhosenverleih-fuer-firmenkunden",
        "/shop/",
        "/lederhosenverleih-preise",
        "/fruehlingsfest-2025-muenchen/",
        "/2025/02/",
        "/produkt/lederhose",
        "/produkt/lederhose-set",
        "/impressum/",
        "/datenschutzerklaerung/",
        "/en/pricing/",
        "/dirndl-mieten",
        "/produkt/haferlschuhe",
        "/en/gallery/",
        "/en/blog/",
        "/category/unkategorisiert/",
        "/author/constantin/",
        "/fruehlingsfest-2024-uebernachtungstipps/",
        "/2024/02/",
        "/author/volker_quirling/",
        "/lederhose-leihen/",
        "/wann-beginnt-das-fruehlingsfest-2024-in-muenchen/",
        "/2024/01/",
        "/trachtenverleih-und-wirtshauswiesn-2020/",
        "/2020/09/",
        "/2016-die-wiesn-ist-vorbei/",
        "/2016/10/",
        "/tracht-und-kultur-in-muenchen/",
        "/2016/05/",
        "/go-kart-fahren-auf-dem-fruhlingsfest/",
        "/2016/02/",
        "/7-fakten-zur-auer-dult/",
        "/oktoberfest-countdown/",
        "/2016/01/",
        "/blog/page/2/"
    ];
    function getRandomPath(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }
    patch = getRandomPath(linkAll);
}
async function getCookieByProxy(proxy, cookie = '') {
    try {
        // console.log(proxy)
        const [host, port, user, pass] = proxy.split(':');
        let agent;
        if (user && pass) {
            agent = new HttpsProxyAgent(`http://${user}:${pass}@${host}:${port}`);
        } else {
            agent = new HttpsProxyAgent(`http://${host}:${port}`);
        }

        const resp = await axios.get('https://bavarian-outfitters.de/', {
            httpsAgent: agent,
            timeout: 10000,
            responseType: 'text',
            maxRedirects: 0,               // IMPORTANT: không follow redirect
            validateStatus: () => true,    // nhận tất cả status, không throw tự động
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Cookie": "sucuricp_tfca_6e453141ae697f9f78b18427b4c54df1=1; " + cookie
            }
        });
        const html = typeof resp.data === 'string' ? resp.data : '';

        function getCookie(html) {
            // 1. Trích xuất giá trị S='...'
            const re = /S\s*=\s*'([^']+)'/i;
            const m = html.match(re);
            if (!m) {
                console.error('Không tìm thấy chuỗi S trong HTML');
                process.exit(1);
            }
            const S = m[1];

            let decoded;
            try {
                decoded = Buffer.from(S, 'base64').toString('utf8');
            } catch (err) {
                console.error('Lỗi khi decode Base64:', err.message);
                process.exit(1);
            }


            const sandbox = {
                // document: có getter/setter cookie để bắt mọi gán document.cookie = '...'
                document: {},
                location: {
                    reloaded: false,
                    reload: () => {
                        // chặn reload thật và chỉ ghi lại là có yêu cầu reload
                        sandbox.location.reloaded = true;
                        // console.warn('[sandbox] location.reload() called (blocked)');
                    }
                },
                console: console,
                // Cấp một vài global cần thiết (String, etc.)
                String: String,
                // Để an toàn hơn, không cung cấp eval/file system, network, process, require...
            };

            Object.defineProperty(sandbox.document, 'cookie', {
                configurable: true,
                enumerable: true,
                get: function () {
                    return this._cookie || '';
                },
                set: function (val) {
                    // lưu cookie vào trường _cookie và cũng ghi vào sandbox.cookieSet
                    this._cookie = (this._cookie ? (this._cookie + '; ' + val) : val);
                    sandbox.cookieSet = this._cookie;
                    // console.log('[sandbox] document.cookie set to ->', val);
                }
            });

// 4. Tạo context và thực thi decoded script trong VM có timeout
            const context = vm.createContext(sandbox, {name: 'sucuri-sandbox'});

            try {
                const script = new vm.Script(decoded, {filename: 'decoded.js'});
                script.runInContext(context, {timeout: 2000}); // timeout ms
            } catch (err) {
                console.error('Lỗi khi chạy script trong sandbox:', err && err.stack ? err.stack : err);
            }

            return sandbox.cookieSet.split(';')[0];
        }

        if (resp.status === 307 || /sucuri_cloudproxy_js/i.test(html)) {
            // console.log('Get ccookie')
            return getCookie(html);
        }
        return 'sucess';
    } catch (err) {
        // console.log(err.statusCode)
        return 'error';
    }
}
let cookieOfProxy = await getCookieByProxy(selectedProxy, '');