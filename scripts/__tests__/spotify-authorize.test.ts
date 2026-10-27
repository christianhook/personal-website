import { describe, expect, it, vi } from "vitest";
import {
    buildAuthorizationUrl,
    exchangeAuthorizationCode,
    publishRefreshToken,
    upsertEnvValue,
    validateCallbackParameters,
    verifyAccessToken,
} from "../spotify-authorize.mjs";

describe("Spotify authorization helper", () => {
    it("builds a forced authorization-code flow with the required scope and state", () => {
        const url = buildAuthorizationUrl({ clientId: "client-id", state: "secure-state" });

        expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
        expect(Object.fromEntries(url.searchParams)).toEqual({
            client_id: "client-id",
            redirect_uri: "http://127.0.0.1:8888/callback",
            response_type: "code",
            scope: "user-read-currently-playing user-top-read",
            show_dialog: "true",
            state: "secure-state",
        });
    });

    it("accepts a callback only when state and authorization code are present", () => {
        const url = new URL(
            "http://127.0.0.1:8888/callback?code=authorization-code&state=expected-state"
        );

        expect(validateCallbackParameters(url, "expected-state")).toBe("authorization-code");
    });

    it.each([
        ["?code=authorization-code&state=wrong", "OAuth state mismatch"],
        ["?error=access_denied&state=expected", "access_denied"],
        ["?state=expected", "did not include a code"],
    ])("rejects an invalid callback %s", (query, expectedMessage) => {
        const url = new URL(`http://127.0.0.1:8888/callback${query}`);

        expect(() => validateCallbackParameters(url, "expected")).toThrow(expectedMessage);
    });

    it("exchanges the code using Basic authentication and the exact callback URI", async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
            new Response(
                JSON.stringify({
                    access_token: "access-token",
                    refresh_token: "refresh-token",
                }),
                { headers: { "Content-Type": "application/json" }, status: 200 }
            )
        );

        await expect(
            exchangeAuthorizationCode({
                clientId: "client-id",
                clientSecret: "client-secret",
                code: "authorization-code",
                fetchImpl: fetchMock,
            })
        ).resolves.toEqual({ accessToken: "access-token", refreshToken: "refresh-token" });

        const firstCall = fetchMock.mock.calls.at(0);
        if (!firstCall) throw new Error("Expected Spotify token request");
        const [, request] = firstCall;
        expect(request?.headers).toMatchObject({
            Authorization: `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
        });
        expect(request?.body?.toString()).toBe(
            "code=authorization-code&grant_type=authorization_code&redirect_uri=http%3A%2F%2F127.0.0.1%3A8888%2Fcallback"
        );
    });

    it("rejects a failed or malformed token exchange", async () => {
        const failedFetch = vi.fn<typeof fetch>().mockResolvedValue(
            new Response(JSON.stringify({ error: "invalid_grant" }), {
                headers: { "Content-Type": "application/json" },
                status: 400,
            })
        );
        const malformedFetch = vi.fn<typeof fetch>().mockResolvedValue(
            new Response(JSON.stringify({ access_token: "access-token" }), {
                headers: { "Content-Type": "application/json" },
                status: 200,
            })
        );

        await expect(
            exchangeAuthorizationCode({
                clientId: "client-id",
                clientSecret: "client-secret",
                code: "code",
                fetchImpl: failedFetch,
            })
        ).rejects.toThrow("invalid_grant");
        await expect(
            exchangeAuthorizationCode({
                clientId: "client-id",
                clientSecret: "client-secret",
                code: "code",
                fetchImpl: malformedFetch,
            })
        ).rejects.toThrow("invalid response");
    });

    it.each([200, 204])("accepts Spotify playback verification status %i", async (status) => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));

        await expect(verifyAccessToken("access-token", fetchMock)).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.spotify.com/v1/me/player/currently-playing",
            { headers: { Authorization: "Bearer access-token" } }
        );
    });

    it("upserts the refresh token without changing other environment values", () => {
        expect(
            upsertEnvValue(
                'SPOTIFY_CLIENT_ID="client-id"\nSPOTIFY_REFRESH_TOKEN="old"\nOTHER="value"\n',
                "SPOTIFY_REFRESH_TOKEN",
                "new-token"
            )
        ).toBe('SPOTIFY_CLIENT_ID="client-id"\nSPOTIFY_REFRESH_TOKEN="new-token"\nOTHER="value"\n');
        expect(
            upsertEnvValue('SPOTIFY_CLIENT_ID="client-id"', "SPOTIFY_REFRESH_TOKEN", "new")
        ).toBe('SPOTIFY_CLIENT_ID="client-id"\nSPOTIFY_REFRESH_TOKEN="new"\n');
    });

    it("publishes the refresh token through stdin instead of command arguments", async () => {
        const runCommand = vi.fn().mockResolvedValue(undefined);

        await publishRefreshToken("sensitive-refresh-token", runCommand);

        expect(runCommand).toHaveBeenCalledWith(
            ["secret", "put", "SPOTIFY_REFRESH_TOKEN"],
            "sensitive-refresh-token"
        );
        const firstCall = runCommand.mock.calls.at(0);
        if (!firstCall) throw new Error("Expected Wrangler invocation");
        expect(JSON.stringify(firstCall[0])).not.toContain("sensitive-refresh-token");
    });
});
