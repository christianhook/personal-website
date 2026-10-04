# My personal website

A personal website meant for showcasing my projects, info, and interests.

- **Framework:** [Astro](https://astro.build/) with [Svelte](https://svelte.dev/) components.
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)

Credits to [Lee Robinson](https://github.com/leerob/leerob.io) for design inspiration.

## How to set up and run this locally

1. Create a `.env` with the following elements seen in the [.env.example](https://github.com/christianhook/personal-website/blob/master/.env.example) file
2. `npm install`
3. `npm run dev`

## Spotify authorization

The footer reads the site owner's currently playing track with Spotify's Authorization Code
flow. Add this exact redirect URI to the app in the Spotify Developer Dashboard:

```text
http://127.0.0.1:8888/callback
```

Spotify refresh tokens expire six months after authorization. To authorize the account and
replace both the local token and the production Cloudflare secret, run:

```bash
npm run spotify:authorize
```

The command opens Spotify sign-in, saves the resulting refresh token to the ignored `.env`, and
publishes it to Cloudflare through Wrangler. It never prints the token. Use `--local-only` to skip
Cloudflare publication, or `--publish-only` to retry publishing the token already stored in
`.env`.

If production receives Spotify's `invalid_grant` response, it stops retrying that token, renders
the normal “Not Playing” footer state, and writes a `spotify_reauthorization_required` event to
the Worker logs. Run the command above to restore the integration.

## Contributing

If you want to contribute, feel free to open an issue or a pull request. I am always open to suggestions and improvements.

## License

This project is licensed under the [AGPL-3.0 License](./LICENSE).
