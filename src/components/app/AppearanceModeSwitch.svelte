<script lang="ts">
    import { onMount } from "svelte";

    type Theme = "system" | "light" | "dark";

    let theme: Theme = "system";
    const nextTheme: Record<Theme, Theme> = {
        system: "light",
        light: "dark",
        dark: "system",
    };

    const syncTheme = () => {
        const saved = localStorage.getItem("theme");
        theme = saved === "light" || saved === "dark" ? saved : "system";
    };

    const cycleTheme = () => {
        const selected = nextTheme[theme];
        theme = selected;
        if (selected === "system") {
            localStorage.removeItem("theme");
        } else {
            localStorage.setItem("theme", selected);
        }

        const isDark =
            selected === "dark" ||
            (selected === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        document.documentElement.classList.toggle("dark", isDark);
        document.documentElement.style.colorScheme = isDark ? "dark" : "light";
        document
            .querySelector('meta[name="theme-color"]')
            ?.setAttribute("content", isDark ? "#000000" : "#ffffff");
        window.dispatchEvent(new Event("themechange"));
    };

    onMount(() => {
        syncTheme();
        window.addEventListener("themechange", syncTheme);
        window.addEventListener("storage", syncTheme);
        return () => {
            window.removeEventListener("themechange", syncTheme);
            window.removeEventListener("storage", syncTheme);
        };
    });
</script>

<button
    type="button"
    aria-label={`Appearance: ${theme}. Switch to ${nextTheme[theme]} mode`}
    title={`Appearance: ${theme}. Switch to ${nextTheme[theme]} mode`}
    class="flex h-11 w-11 items-center justify-center rounded-lg text-black transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-700 dark:text-white dark:hover:bg-zinc-800 dark:focus-visible:outline-zinc-300 cursor-pointer"
    on:click={cycleTheme}
>
    {#if theme === "light"}
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-5 w-5"
            aria-hidden="true"
            ><circle cx="12" cy="12" r="4" /><path
                d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
            /></svg
        >
    {:else if theme === "dark"}
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-5 w-5"
            aria-hidden="true"
            ><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" /></svg
        >
    {:else}
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-5 w-5"
            aria-hidden="true"
            ><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 21h8m-4-3v3" /></svg
        >
    {/if}
</button>
