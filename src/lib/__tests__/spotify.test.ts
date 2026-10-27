import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const credentials = {
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
};

const emptyResponse = {
    album: "",
    albumImageUrl: "",
    artist: "",
    isPlaying: false,
    songUrl: "",
    title: "",
};

class MemoryKv {
    readonly values = new Map<string, string>();
    readonly puts: Array<{ key: string; value: string }> = [];
    readonly deletes: string[] = [];

    async get(key: string, type: "json"): Promise<unknown | null> {
        expect(type).toBe("json");
        const value = this.values.get(key);
        return value ? JSON.parse(value) : null;
    }

    async put(key: string, value: string): Promise<void> {
        this.puts.push({ key, value });
        this.values.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this.deletes.push(key);
        this.values.delete(key);
    }
}

const tokenResponse = (accessToken = "access-token") =>
    new Response(JSON.stringify({ access_token: accessToken, expires_in: 3600 }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
    });

const noPlaybackResponse = () => new Response(null, { status: 204 });

const loadSpotify = async () => import("../spotify");

describe("Spotify token refresh", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("refreshes once and reuses the cached access token", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(tokenResponse())
            .mockResolvedValueOnce(noPlaybackResponse())
            .mockResolvedValueOnce(noPlaybackResponse());
        vi.stubGlobal("fetch", fetchMock);
        const { getNowPlaying } = await loadSpotify();

        expect(await getNowPlaying(credentials)).toEqual(emptyResponse);
        expect(await getNowPlaying(credentials)).toEqual(emptyResponse);

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(
            fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/token"))
        ).toHaveLength(1);
    });

    it("deduplicates concurrent access-token refreshes", async () => {
        let resolveTokenResponse: ((response: Response) => void) | undefined;
        const pendingTokenResponse = new Promise<Response>((resolve) => {
            resolveTokenResponse = resolve;
        });
        const fetchMock = vi.fn<typeof fetch>((url) => {
            if (String(url).includes("/api/token")) return pendingTokenResponse;
            return Promise.resolve(noPlaybackResponse());
        });
        vi.stubGlobal("fetch", fetchMock);
        const { getNowPlaying } = await loadSpotify();

        const firstRequest = getNowPlaying(credentials);
        const secondRequest = getNowPlaying(credentials);
        await vi.waitFor(() => {
            expect(
                fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/token"))
            ).toHaveLength(1);
        });
        resolveTokenResponse?.(tokenResponse());

        expect(await Promise.all([firstRequest, secondRequest])).toEqual([
            emptyResponse,
            emptyResponse,
        ]);
        expect(
            fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/token"))
        ).toHaveLength(1);
    });

    it("persists invalid_grant without the token and never retries it", async () => {
        const kv = new MemoryKv();
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
            new Response(JSON.stringify({ error: "invalid_grant" }), {
                headers: { "Content-Type": "application/json" },
                status: 400,
            })
        );
        vi.stubGlobal("fetch", fetchMock);
        let spotify = await loadSpotify();

        expect(await spotify.getNowPlaying(credentials, kv)).toEqual(emptyResponse);
        expect(await spotify.getNowPlaying(credentials, kv)).toEqual(emptyResponse);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const marker = kv.values.get("spotify:invalid-refresh-token");
        expect(marker).toBeDefined();
        expect(marker).not.toContain(credentials.refreshToken);
        expect(JSON.parse(marker ?? "{}")).toMatchObject({
            fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        });
        expect(console.error).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "npm run spotify:authorize",
                event: "spotify_reauthorization_required",
            })
        );

        vi.resetModules();
        spotify = await loadSpotify();
        expect(await spotify.getNowPlaying(credentials, kv)).toEqual(emptyResponse);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("allows a replacement refresh token and removes the stale marker", async () => {
        const kv = new MemoryKv();
        const invalidGrant = new Response(JSON.stringify({ error: "invalid_grant" }), {
            headers: { "Content-Type": "application/json" },
            status: 400,
        });
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(invalidGrant)
            .mockResolvedValueOnce(tokenResponse("replacement-access-token"))
            .mockResolvedValueOnce(noPlaybackResponse());
        vi.stubGlobal("fetch", fetchMock);
        const { getNowPlaying } = await loadSpotify();

        await getNowPlaying(credentials, kv);
        const replacementCredentials = { ...credentials, refreshToken: "replacement-token" };
        expect(await getNowPlaying(replacementCredentials, kv)).toEqual(emptyResponse);

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(kv.deletes).toContain("spotify:invalid-refresh-token");
        expect(kv.values.has("spotify:invalid-refresh-token")).toBe(false);
    });

    it("keeps transient refresh failures retryable", async () => {
        const kv = new MemoryKv();
        const fetchMock = vi.fn<typeof fetch>().mockImplementation(() =>
            Promise.resolve(
                new Response(JSON.stringify({ error: "temporarily_unavailable" }), {
                    headers: { "Content-Type": "application/json" },
                    status: 503,
                })
            )
        );
        vi.stubGlobal("fetch", fetchMock);
        const { getNowPlaying } = await loadSpotify();

        expect(await getNowPlaying(credentials, kv)).toEqual(emptyResponse);
        expect(await getNowPlaying(credentials, kv)).toEqual(emptyResponse);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(kv.values.has("spotify:invalid-refresh-token")).toBe(false);
        expect(console.error).toHaveBeenCalledWith(
            expect.objectContaining({
                error: "temporarily_unavailable",
                event: "spotify_token_refresh_failed",
            })
        );
    });

    it("returns the empty state for a malformed successful token response", async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
            new Response(JSON.stringify({ expires_in: 3600 }), {
                headers: { "Content-Type": "application/json" },
                status: 200,
            })
        );
        vi.stubGlobal("fetch", fetchMock);
        const { getNowPlaying } = await loadSpotify();

        expect(await getNowPlaying(credentials)).toEqual(emptyResponse);
        expect(console.error).toHaveBeenCalledWith(
            expect.objectContaining({ event: "spotify_token_response_invalid" })
        );
    });

    it("maps top tracks and caches them in KV", async () => {
        const kv = new MemoryKv();
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(tokenResponse())
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        items: [
                            {
                                album: {
                                    images: [
                                        {
                                            url: "https://i.scdn.co/image/small.jpg",
                                            width: 64,
                                        },
                                        {
                                            url: "https://i.scdn.co/image/medium.jpg",
                                            width: 300,
                                        },
                                        {
                                            url: "https://i.scdn.co/image/large.jpg",
                                            width: 640,
                                        },
                                    ],
                                    name: "First Album",
                                },
                                artists: [{ name: "First Artist" }],
                                external_urls: {
                                    spotify: "https://open.spotify.com/track/first",
                                },
                                name: "First Song",
                            },
                            {
                                album: {
                                    images: [
                                        {
                                            url: "https://i.scdn.co/image/second.jpg",
                                            width: 640,
                                        },
                                    ],
                                    name: "Second Album",
                                },
                                artists: [{ name: "Second Artist" }, { name: "Guest" }],
                                external_urls: {
                                    spotify: "https://open.spotify.com/track/second",
                                },
                                name: "Second Song",
                            },
                        ],
                    }),
                    { headers: { "Content-Type": "application/json" }, status: 200 }
                )
            );
        vi.stubGlobal("fetch", fetchMock);
        const { getTopTracks } = await loadSpotify();

        expect(await getTopTracks(credentials, kv)).toEqual([
            {
                album: "First Album",
                albumImageUrl: "https://i.scdn.co/image/medium.jpg",
                artist: "First Artist",
                songUrl: "https://open.spotify.com/track/first",
                title: "First Song",
            },
            {
                album: "Second Album",
                albumImageUrl: "https://i.scdn.co/image/second.jpg",
                artist: "Second Artist, Guest",
                songUrl: "https://open.spotify.com/track/second",
                title: "Second Song",
            },
        ]);
        expect(JSON.parse(kv.values.get("spotify:top-tracks") ?? "[]")).toHaveLength(2);

        await getTopTracks(credentials, kv);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("returns an empty list when Spotify rejects the top-tracks request", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(tokenResponse())
            .mockResolvedValueOnce(new Response(null, { status: 403 }));
        vi.stubGlobal("fetch", fetchMock);
        const { getTopTracks } = await loadSpotify();

        expect(await getTopTracks(credentials)).toEqual([]);
        expect(console.error).toHaveBeenCalledWith(
            expect.objectContaining({
                event: "spotify_top_tracks_failed",
                status: 403,
            })
        );
    });

    it("maps a currently playing track and caches it in KV", async () => {
        const kv = new MemoryKv();
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(tokenResponse())
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        is_playing: true,
                        item: {
                            album: {
                                images: [{ url: "https://image.example/cover.jpg" }],
                                name: "Album",
                            },
                            artists: [{ name: "First" }, { name: "Second" }],
                            external_urls: { spotify: "https://open.spotify.com/track/123" },
                            name: "Song",
                        },
                    }),
                    { headers: { "Content-Type": "application/json" }, status: 200 }
                )
            );
        vi.stubGlobal("fetch", fetchMock);
        const { getNowPlaying } = await loadSpotify();

        expect(await getNowPlaying(credentials, kv)).toEqual({
            album: "Album",
            albumImageUrl: "https://image.example/cover.jpg",
            artist: "First, Second",
            isPlaying: true,
            songUrl: "https://open.spotify.com/track/123",
            title: "Song",
        });
        expect(JSON.parse(kv.values.get("spotify:now-playing") ?? "{}")).toMatchObject({
            isPlaying: true,
            title: "Song",
        });
    });
});
