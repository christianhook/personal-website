const NOW_PLAYING_ENDPOINT = "https://api.spotify.com/v1/me/player/currently-playing";
const TOP_TRACKS_ENDPOINT =
    "https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=10";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const NOW_PLAYING_CACHE_KEY = "spotify:now-playing";
const TOP_TRACKS_CACHE_KEY = "spotify:top-tracks";
const INVALID_REFRESH_TOKEN_KEY = "spotify:invalid-refresh-token";
const NOW_PLAYING_TTL_MS = 30_000;
const TOP_TRACKS_TTL_MS = 60 * 60 * 1000;
const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 60_000;

let cachedAccessToken: string | null = null;
let cachedAccessTokenFingerprint: string | null = null;
let tokenExpiryTime: number | null = null;
let cachedNowPlaying: NowPlayingSong | null = null;
let nowPlayingCacheExpiry: number | null = null;
let cachedTopTracks: TopTrack[] | null = null;
let topTracksCacheExpiry: number | null = null;

const rejectedRefreshTokenFingerprints = new Set<string>();
const refreshesInFlight = new Map<string, Promise<string | null>>();

interface SpotifyCredentials {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
}

interface SpotifyKvStore {
    get(key: string, type: "json"): Promise<unknown | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
}

interface InvalidRefreshTokenMarker {
    detectedAt: string;
    fingerprint: string;
}

interface SpotifyTokenResponse {
    access_token?: unknown;
    error?: unknown;
    expires_in?: unknown;
}

const fingerprintRefreshToken = async (refreshToken: string): Promise<string> => {
    const input = new TextEncoder().encode(refreshToken);
    const digest = await crypto.subtle.digest("SHA-256", input);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
        ""
    );
};

const isInvalidRefreshTokenMarker = (value: unknown): value is InvalidRefreshTokenMarker => {
    if (!value || typeof value !== "object") return false;
    const marker = value as Record<string, unknown>;
    return typeof marker.detectedAt === "string" && typeof marker.fingerprint === "string";
};

const parseTokenResponse = async (response: Response): Promise<SpotifyTokenResponse> => {
    try {
        const value: unknown = await response.json();
        return value && typeof value === "object" ? (value as SpotifyTokenResponse) : {};
    } catch {
        return {};
    }
};

const clearSpotifyCaches = (): void => {
    cachedAccessToken = null;
    cachedAccessTokenFingerprint = null;
    tokenExpiryTime = null;
    cachedNowPlaying = null;
    nowPlayingCacheExpiry = null;
    cachedTopTracks = null;
    topTracksCacheExpiry = null;
};

const persistInvalidRefreshToken = async (
    kv: SpotifyKvStore | undefined,
    fingerprint: string
): Promise<void> => {
    rejectedRefreshTokenFingerprints.add(fingerprint);
    clearSpotifyCaches();

    if (!kv) return;

    const marker: InvalidRefreshTokenMarker = {
        detectedAt: new Date().toISOString(),
        fingerprint,
    };

    const results = await Promise.allSettled([
        kv.put(INVALID_REFRESH_TOKEN_KEY, JSON.stringify(marker)),
        kv.delete(NOW_PLAYING_CACHE_KEY),
    ]);

    if (results.some((result) => result.status === "rejected")) {
        console.error({
            event: "spotify_token_invalidation_persistence_failed",
        });
    }
};

const isRefreshTokenRejected = async (
    kv: SpotifyKvStore | undefined,
    fingerprint: string
): Promise<boolean> => {
    if (rejectedRefreshTokenFingerprints.has(fingerprint)) return true;
    if (!kv) return false;

    try {
        const value = await kv.get(INVALID_REFRESH_TOKEN_KEY, "json");
        if (isInvalidRefreshTokenMarker(value) && value.fingerprint === fingerprint) {
            rejectedRefreshTokenFingerprints.add(fingerprint);
            return true;
        }
    } catch {
        console.error({
            event: "spotify_token_invalidation_lookup_failed",
        });
    }

    return false;
};

const refreshAccessToken = async (
    credentials: SpotifyCredentials,
    kv: SpotifyKvStore | undefined,
    fingerprint: string
): Promise<string | null> => {
    if (await isRefreshTokenRejected(kv, fingerprint)) return null;

    const basic = btoa(`${credentials.clientId}:${credentials.clientSecret}`);
    const response = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: credentials.refreshToken,
        }),
    });
    const data = await parseTokenResponse(response);

    if (!response.ok) {
        if (data.error === "invalid_grant") {
            await persistInvalidRefreshToken(kv, fingerprint);
            console.error({
                action: "npm run spotify:authorize",
                event: "spotify_reauthorization_required",
                status: response.status,
            });
            return null;
        }

        console.error({
            error: typeof data.error === "string" ? data.error : "unknown_error",
            event: "spotify_token_refresh_failed",
            status: response.status,
        });
        return null;
    }

    if (
        typeof data.access_token !== "string" ||
        typeof data.expires_in !== "number" ||
        !Number.isFinite(data.expires_in) ||
        data.expires_in <= 0
    ) {
        console.error({
            event: "spotify_token_response_invalid",
            status: response.status,
        });
        return null;
    }

    cachedAccessToken = data.access_token;
    cachedAccessTokenFingerprint = fingerprint;
    tokenExpiryTime =
        Date.now() + Math.max(0, data.expires_in * 1000 - ACCESS_TOKEN_EXPIRY_BUFFER_MS);

    if (kv) {
        try {
            const marker = await kv.get(INVALID_REFRESH_TOKEN_KEY, "json");
            if (isInvalidRefreshTokenMarker(marker) && marker.fingerprint !== fingerprint) {
                await kv.delete(INVALID_REFRESH_TOKEN_KEY);
            }
        } catch {
            console.error({
                event: "spotify_stale_invalidation_cleanup_failed",
            });
        }
    }

    return cachedAccessToken;
};

const getAccessToken = async (
    credentials: SpotifyCredentials,
    kv?: SpotifyKvStore
): Promise<string | null> => {
    const fingerprint = await fingerprintRefreshToken(credentials.refreshToken);
    const currentTime = Date.now();

    if (
        cachedAccessToken &&
        cachedAccessTokenFingerprint === fingerprint &&
        tokenExpiryTime &&
        currentTime < tokenExpiryTime
    ) {
        return cachedAccessToken;
    }

    const existingRefresh = refreshesInFlight.get(fingerprint);
    if (existingRefresh) return existingRefresh;

    const refresh = refreshAccessToken(credentials, kv, fingerprint).finally(() => {
        refreshesInFlight.delete(fingerprint);
    });
    refreshesInFlight.set(fingerprint, refresh);
    return refresh;
};

export interface NowPlayingSong {
    album: string;
    albumImageUrl: string;
    artist: string;
    isPlaying: boolean;
    songUrl: string;
    title: string;
}

const EMPTY_RESPONSE: NowPlayingSong = {
    album: "",
    albumImageUrl: "",
    artist: "",
    isPlaying: false,
    songUrl: "",
    title: "",
};

const isNowPlayingSong = (value: unknown): value is NowPlayingSong => {
    if (!value || typeof value !== "object") return false;
    const song = value as Record<string, unknown>;
    return (
        typeof song.album === "string" &&
        typeof song.albumImageUrl === "string" &&
        typeof song.artist === "string" &&
        typeof song.isPlaying === "boolean" &&
        typeof song.songUrl === "string" &&
        typeof song.title === "string"
    );
};

export const getNowPlaying = async (
    credentials: SpotifyCredentials,
    kv?: SpotifyKvStore
): Promise<NowPlayingSong> => {
    const currentTime = Date.now();

    if (cachedNowPlaying && nowPlayingCacheExpiry && currentTime < nowPlayingCacheExpiry) {
        return cachedNowPlaying;
    }

    if (kv) {
        try {
            const kvCached = await kv.get(NOW_PLAYING_CACHE_KEY, "json");
            if (isNowPlayingSong(kvCached)) {
                cachedNowPlaying = kvCached;
                nowPlayingCacheExpiry = currentTime + NOW_PLAYING_TTL_MS;
                return kvCached;
            }
        } catch {
            // KV read failed, fall through to Spotify.
        }
    }

    try {
        const accessToken = await getAccessToken(credentials, kv);
        if (!accessToken) return EMPTY_RESPONSE;

        const response = await fetch(NOW_PLAYING_ENDPOINT, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            cache: "no-store",
        });

        if (response.status === 204 || response.status >= 400) return EMPTY_RESPONSE;

        const song: unknown = await response.json();
        if (!song || typeof song !== "object" || !("item" in song) || !song.item) {
            return EMPTY_RESPONSE;
        }

        const spotifySong = song as {
            is_playing?: boolean;
            item: {
                album?: { images?: Array<{ url?: string }>; name?: string };
                artists?: Array<{ name: string }>;
                external_urls?: { spotify?: string };
                name?: string;
            };
        };
        const result: NowPlayingSong = {
            album: spotifySong.item.album?.name ?? "",
            albumImageUrl: spotifySong.item.album?.images?.[0]?.url ?? "",
            artist: spotifySong.item.artists?.map((artist) => artist.name).join(", ") ?? "",
            isPlaying: spotifySong.is_playing ?? false,
            songUrl: spotifySong.item.external_urls?.spotify ?? "",
            title: spotifySong.item.name ?? "",
        };

        cachedNowPlaying = result;
        nowPlayingCacheExpiry = currentTime + NOW_PLAYING_TTL_MS;

        if (kv) {
            try {
                await kv.put(NOW_PLAYING_CACHE_KEY, JSON.stringify(result), { expirationTtl: 30 });
            } catch {
                // KV caching is best effort.
            }
        }

        return result;
    } catch (error) {
        console.error({
            error: error instanceof Error ? error.message : "unknown_error",
            event: "spotify_now_playing_failed",
        });
        return EMPTY_RESPONSE;
    }
};

export interface TopTrack {
    album: string;
    albumImageUrl: string;
    artist: string;
    songUrl: string;
    title: string;
}

const isTopTrack = (value: unknown): value is TopTrack => {
    if (!value || typeof value !== "object") return false;
    const track = value as Record<string, unknown>;
    return (
        typeof track.album === "string" &&
        typeof track.albumImageUrl === "string" &&
        typeof track.artist === "string" &&
        typeof track.songUrl === "string" &&
        typeof track.title === "string"
    );
};

const isTopTracks = (value: unknown): value is TopTrack[] =>
    Array.isArray(value) && value.every(isTopTrack);

const mapTopTrack = (value: unknown): TopTrack | null => {
    if (!value || typeof value !== "object") return null;

    const item = value as {
        album?: { images?: Array<{ url?: string; width?: number }>; name?: string };
        artists?: Array<{ name?: string }>;
        external_urls?: { spotify?: string };
        name?: string;
    };

    if (typeof item.name !== "string") return null;

    // Prefer the smallest artwork that is still sharp at the size we render it.
    const image =
        [...(item.album?.images ?? [])]
            .filter((candidate) => typeof candidate.url === "string")
            .sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
            .find((candidate) => (candidate.width ?? 0) >= 300) ?? item.album?.images?.[0];

    return {
        album: item.album?.name ?? "",
        albumImageUrl: typeof image?.url === "string" ? image.url : "",
        artist:
            item.artists
                ?.map((artist) => artist.name)
                .filter((name): name is string => typeof name === "string")
                .join(", ") ?? "",
        songUrl: item.external_urls?.spotify ?? "",
        title: item.name,
    };
};

/**
 * Returns the user's most-played tracks from Spotify's "short term" window,
 * which currently covers roughly the last four weeks.
 */
export const getTopTracks = async (
    credentials: SpotifyCredentials,
    kv?: SpotifyKvStore
): Promise<TopTrack[]> => {
    const currentTime = Date.now();

    if (cachedTopTracks && topTracksCacheExpiry && currentTime < topTracksCacheExpiry) {
        return cachedTopTracks;
    }

    if (kv) {
        try {
            const kvCached = await kv.get(TOP_TRACKS_CACHE_KEY, "json");
            if (isTopTracks(kvCached)) {
                cachedTopTracks = kvCached;
                topTracksCacheExpiry = currentTime + TOP_TRACKS_TTL_MS;
                return kvCached;
            }
        } catch {
            // KV read failed, fall through to Spotify.
        }
    }

    try {
        const accessToken = await getAccessToken(credentials, kv);
        if (!accessToken) return [];

        const response = await fetch(TOP_TRACKS_ENDPOINT, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            cache: "no-store",
        });

        if (!response.ok) {
            console.error({
                event: "spotify_top_tracks_failed",
                status: response.status,
            });
            return [];
        }

        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || !("items" in data) || !Array.isArray(data.items)) {
            return [];
        }

        const tracks = data.items
            .map(mapTopTrack)
            .filter((track): track is TopTrack => track !== null);

        if (tracks.length === 0) return [];

        cachedTopTracks = tracks;
        topTracksCacheExpiry = currentTime + TOP_TRACKS_TTL_MS;

        if (kv) {
            try {
                await kv.put(TOP_TRACKS_CACHE_KEY, JSON.stringify(tracks), {
                    expirationTtl: TOP_TRACKS_TTL_MS / 1000,
                });
            } catch {
                // KV caching is best effort.
            }
        }

        return tracks;
    } catch (error) {
        console.error({
            error: error instanceof Error ? error.message : "unknown_error",
            event: "spotify_top_tracks_failed",
        });
        return [];
    }
};
