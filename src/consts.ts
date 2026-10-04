// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.
export const SITE_TITLE = "Christian Krogh Nielsen";
export const SITE_DESCRIPTION =
    "Personal website of Christian Krogh Nielsen, Software Engineer and creator of the Discord bot Bento";
export const SITE_URL = "https://chrkn.dev";

// Author information
export const AUTHOR = {
    name: "Christian Krogh Nielsen",
    url: "https://chrkn.dev",
    email: "contact@chrkn.dev",
};

interface SocialMediaButton {
    colour: string;
    link: string;
    icon: string;
    js: boolean | undefined; // Optional property for JavaScript-based links
}

export const SOCIAL_MEDIA: SocialMediaButton[] = [
    {
        colour: "GitHub",
        link: "https://github.com/christianhook",
        icon: "GitHubIcon",
        js: false,
    },
    {
        colour: "LinkedIn",
        link: "https://www.linkedin.com/in/christian-krogh-nielsen/",
        icon: "LinkedInIcon",
        js: false,
    },
    {
        colour: "Discogs",
        link: "https://www.discogs.com/user/christiankn",
        icon: "DiscogsIcon",
        js: false,
    },
    {
        colour: "Instagram",
        link: "https://www.instagram.com/kraellle/",
        icon: "InstagramIcon",
        js: false,
    },
    {
        colour: "Spotify",
        link: "https://open.spotify.com/user/ataz1v90gnmq442fjrxpcpfj6?si=d6e8d944ca2142d3",
        icon: "SpotifyIcon",
        js: false,
    },
    {
        colour: "LastFm",
        link: "https://www.last.fm/user/christiankn",
        icon: "LastfmIcon",
        js: false,
    },
];

// SEO keywords
export const KEYWORDS = [
    "Christian Krogh Nielsen",
    "Software Engineer",
    "Web Development",
    "Copenhagen",
    "Denmark",
    "Bento",
    "Discord Bot",
    "TypeScript",
    "React",
    "Svelte",
    "Astro",
];
