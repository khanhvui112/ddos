import fs from "fs";
import axios from "axios";
import pLimit from "p-limit";

async function checkProxy(proxy) {
    let response = null;
    try {
        response = await axios.get("https://bavarian-outfitters.de/", {
            proxy: {
                host: proxy.split(":")[0],
                port: parseInt(proxy.split(":")[1])
            },
            timeout: 5000
        });
        console.log(`\x1b[32m[LIVE] ${proxy}\x1b[0m`);
        return proxy;
    } catch (e) {
        if (e.response && e.response.status === 407) {
            console.log('\x1b[33mPhai xac thuc.\x1b[0m');
            return proxy;
        }
        console.error(`\x1b[31m[DEAD] ${proxy}\x1b[0m`);
        return null;
    }
}

async function main() {
    const inputFile = "./proxies_un.txt";
    const outputFile = "./live_proxies_un.txt";

    const proxies = fs.readFileSync(inputFile, "utf8")
        .split("\n")
        .map(p => p.trim())
        .filter(Boolean);

    const limit = pLimit(1); // max 20 proxy cùng lúc
    const tasks = proxies.map(proxy => limit(() => checkProxy(proxy)));

    const results = await Promise.all(tasks);
    const liveProxies = results.filter(Boolean);

    fs.writeFileSync(outputFile, liveProxies.join("\n"));
    console.log(`✅ Done. Live proxies saved to ${outputFile}`);
}

main();
