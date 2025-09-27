const axios = require('axios');

async function testProxy(proxy) {
    try {
        const response = await axios.get("http://httpbin.org/ip", {
            proxy,
            timeout: 5000
        });
        if (response.status === 200) {
            console.log(`Proxy %O is working. Your IP: ${response.data.origin}`, proxy);
        } else {
            console.log(`Proxy %O returned status code ${response.status}`, proxy);
        }
    } catch (error) {
        console.log(`Error occurred while testing proxy %O: ${error.message}`, proxy);
    }
}

async function main() {
    const proxy = {
        host: 'proxy.oculus-proxy.com',
        port: '31112',
        auth: {username: 'oc-90483babe0a6fe0e2001110d756b048986b715c4a21f35d51ed477b5f457baed-country-XX-session-###', password: 'gtnrco6st7xh'},
    };
    await testProxy(proxy);
}

main();
