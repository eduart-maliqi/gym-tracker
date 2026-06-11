// Helper: call Google APIs using the firebase-tools refresh token.
// Usage: node scripts/gapi.mjs <command> [...args]
//   token                         -> print access token
//   enable <api>                  -> enable a service API on the project
//   get <url>                     -> GET a URL
//   post <url> <jsonFile|->       -> POST JSON body
//   patch <url> <jsonFile> [mask] -> PATCH JSON body (optional updateMask query)
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT = "gym-tracker-eduard";
// Public OAuth client of the firebase-tools CLI
const CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

const store = JSON.parse(
  readFileSync(join(homedir(), ".config", "configstore", "firebase-tools.json"), "utf8")
);
const refreshToken = store.tokens?.refresh_token;
if (!refreshToken) {
  console.error("No refresh token found in firebase-tools configstore");
  process.exit(1);
}

async function accessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    console.error("Token exchange failed:", JSON.stringify(data));
    process.exit(1);
  }
  return data.access_token;
}

async function call(method, url, body) {
  const token = await accessToken();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text);
  if (!res.ok) process.exit(1);
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "token") {
  console.log(await accessToken());
} else if (cmd === "enable") {
  await call(
    "POST",
    `https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services/${args[0]}:enable`,
    {}
  );
} else if (cmd === "get") {
  await call("GET", args[0]);
} else if (cmd === "post") {
  const body = args[1] === "-" ? {} : readJson(args[1]);
  await call("POST", args[0], body);
} else if (cmd === "patch") {
  const body = readJson(args[1]);
  const url = args[2] ? `${args[0]}?updateMask=${encodeURIComponent(args[2])}` : args[0];
  await call("PATCH", url, body);
} else {
  console.error("Unknown command");
  process.exit(1);
}
