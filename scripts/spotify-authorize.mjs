import { randomBytes } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const NOW_PLAYING_ENDPOINT = "https://api.spotify.com/v1/me/player/currently-playing";
const REDIRECT_URI = "http://127.0.0.1:8888/callback";
const CALLBACK_TIMEOUT_MS = 10 * 60 * 1000;
const ENV_KEY = "SPOTIFY_REFRESH_TOKEN";
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = join(SCRIPT_DIRECTORY, "..");

export const buildAuthorizationUrl = ({ clientId, state }) => {
    const url = new URL(AUTHORIZE_ENDPOINT);
    url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: "user-read-currently-playing user-top-read",
        show_dialog: "true",
        state,
    }).toString();
    return url;
};

export const validateCallbackParameters = (url, expectedState) => {
    const error = url.searchParams.get("error");
    if (error) throw new Error(`Spotify authorization failed: ${error}`);

    const state = url.searchParams.get("state");
    if (!state || state !== expectedState) {
        throw new Error("Spotify authorization failed: OAuth state mismatch");
    }

    const code = url.searchParams.get("code");
    if (!code) throw new Error("Spotify authorization failed: callback did not include a code");
    return code;
};

export const exchangeAuthorizationCode = async ({
    clientId,
    clientSecret,
    code,
    fetchImpl = fetch,
}) => {
    const authorization = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetchImpl(TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: `Basic ${authorization}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            code,
            grant_type: "authorization_code",
            redirect_uri: REDIRECT_URI,
        }),
    });

    let body = {};
    try {
        body = await response.json();
    } catch {
        // The validation below produces the actionable error.
    }

    if (!response.ok) {
        const error = typeof body.error === "string" ? body.error : "unknown_error";
        throw new Error(`Spotify token exchange failed (${response.status}): ${error}`);
    }
    if (typeof body.access_token !== "string" || typeof body.refresh_token !== "string") {
        throw new Error("Spotify token exchange returned an invalid response");
    }

    return {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
    };
};

export const verifyAccessToken = async (accessToken, fetchImpl = fetch) => {
    const response = await fetchImpl(NOW_PLAYING_ENDPOINT, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status !== 200 && response.status !== 204) {
        throw new Error(`Spotify access-token verification failed (${response.status})`);
    }
};

export const upsertEnvValue = (contents, key, value) => {
    const line = `${key}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(contents)) return contents.replace(pattern, line);
    return `${contents}${contents && !contents.endsWith("\n") ? "\n" : ""}${line}\n`;
};

export const publishRefreshToken = async (refreshToken, runCommand) => {
    const execute = runCommand ?? runWranglerSecretPut;
    await execute(["secret", "put", ENV_KEY], refreshToken);
};

const runWranglerSecretPut = (args, input) =>
    new Promise((resolve, reject) => {
        const executable = join(
            REPOSITORY_ROOT,
            "node_modules",
            ".bin",
            process.platform === "win32" ? "wrangler.cmd" : "wrangler"
        );
        const child = spawn(executable, args, {
            cwd: REPOSITORY_ROOT,
            shell: false,
            stdio: ["pipe", "inherit", "inherit"],
        });
        child.once("error", reject);
        child.once("exit", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Wrangler exited with code ${code ?? "unknown"}`));
        });
        child.stdin.end(input);
    });

const writeLocalRefreshToken = async (refreshToken) => {
    const envPath = join(REPOSITORY_ROOT, ".env");
    let contents = "";
    try {
        contents = await readFile(envPath, "utf8");
    } catch (error) {
        if (error?.code !== "ENOENT") throw error;
    }

    const temporaryPath = `${envPath}.tmp-${process.pid}`;
    await writeFile(temporaryPath, upsertEnvValue(contents, ENV_KEY, refreshToken), {
        encoding: "utf8",
        mode: 0o600,
    });
    await rename(temporaryPath, envPath);
};

const openBrowser = (url) => {
    const commands = {
        darwin: ["open", [url]],
        linux: ["xdg-open", [url]],
        win32: ["cmd", ["/c", "start", "", url]],
    };
    const command = commands[process.platform];
    if (!command) return;

    try {
        const child = spawn(command[0], command[1], {
            detached: true,
            stdio: "ignore",
        });
        child.once("error", () => undefined);
        child.unref();
    } catch {
        // The URL is always printed, so browser launch is only a convenience.
    }
};

const waitForAuthorizationCode = (expectedState) =>
    new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            server.close();
            callback();
        };
        const server = createServer((request, response) => {
            const url = new URL(request.url ?? "/", REDIRECT_URI);
            if (url.pathname !== "/callback") {
                response.writeHead(404).end("Not found");
                return;
            }

            try {
                const code = validateCallbackParameters(url, expectedState);
                response.writeHead(200, {
                    "Cache-Control": "no-store",
                    "Content-Type": "text/plain; charset=utf-8",
                });
                response.end("Spotify authorization received. You can return to the terminal.");
                finish(() => resolve(code));
            } catch (error) {
                response.writeHead(400, {
                    "Cache-Control": "no-store",
                    "Content-Type": "text/plain; charset=utf-8",
                });
                response.end("Spotify authorization failed. Return to the terminal for details.");
                finish(() => reject(error));
            }
        });
        const timeout = setTimeout(() => {
            finish(() => reject(new Error("Spotify authorization timed out after 10 minutes")));
        }, CALLBACK_TIMEOUT_MS);
        server.once("error", (error) => finish(() => reject(error)));
        server.listen(8888, "127.0.0.1");
    });

const parseArguments = (arguments_) => {
    const localOnly = arguments_.includes("--local-only");
    const publishOnly = arguments_.includes("--publish-only");
    const unknown = arguments_.filter(
        (argument) => argument !== "--local-only" && argument !== "--publish-only"
    );
    if (unknown.length > 0 || (localOnly && publishOnly)) {
        throw new Error("Usage: npm run spotify:authorize -- [--local-only | --publish-only]");
    }
    return { localOnly, publishOnly };
};

export const main = async () => {
    const { localOnly, publishOnly } = parseArguments(process.argv.slice(2));

    if (publishOnly) {
        if (!process.env.SPOTIFY_REFRESH_TOKEN) {
            throw new Error("SPOTIFY_REFRESH_TOKEN is missing from .env");
        }
        await publishRefreshToken(process.env.SPOTIFY_REFRESH_TOKEN);
        console.log("Published the local Spotify refresh token to Cloudflare.");
        return;
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required in .env");
    }

    const state = randomBytes(32).toString("hex");
    const authorizationCode = waitForAuthorizationCode(state);
    const authorizationUrl = buildAuthorizationUrl({ clientId, state }).toString();
    console.log(`Open this URL to authorize Spotify:\n${authorizationUrl}`);
    openBrowser(authorizationUrl);

    const code = await authorizationCode;
    const tokens = await exchangeAuthorizationCode({ clientId, clientSecret, code });
    await verifyAccessToken(tokens.accessToken);
    await writeLocalRefreshToken(tokens.refreshToken);
    console.log("Saved the new Spotify refresh token to .env.");

    if (!localOnly) {
        try {
            await publishRefreshToken(tokens.refreshToken);
            console.log("Published the new Spotify refresh token to Cloudflare.");
        } catch (error) {
            console.error("Cloudflare publication failed; the new token is safe in .env.");
            console.error("Retry with: npm run spotify:authorize -- --publish-only");
            throw error;
        }
    }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : "Spotify authorization failed");
        process.exitCode = 1;
    });
}
