<script lang="ts">
    import { onMount, onDestroy } from "svelte";

    const formatter = new Intl.DateTimeFormat("en-DK", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Copenhagen",
    });

    let time = formatter.format(new Date());
    let revealed = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const updateTime = () => {
        time = formatter.format(new Date());
    };

    const scheduleNextUpdate = () => {
        const now = new Date();
        const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
        timeoutId = setTimeout(() => {
            updateTime();
            scheduleNextUpdate();
        }, msUntilNextMinute);
    };

    const reveal = () => {
        revealed = true;
        scheduleNextUpdate();
    };

    onMount(() => {
        updateTime();
    });

    onDestroy(() => {
        clearTimeout(timeoutId);
    });
</script>

{#if revealed}
    <span class="time-display time-revealed text-black dark:text-white">{time}</span>
{:else}
    <button
        class="time-display time-blurred text-black dark:text-white"
        onclick={reveal}
        onkeydown={(e) => e.key === "Enter" && reveal()}
        title="Click to reveal the time">{time}</button
    >
{/if}

<style>
    .time-blurred {
        filter: blur(8px);
        cursor: pointer;
        user-select: none;
        transition: filter 0.4s ease;
        background: none;
        border: none;
        padding: 0;
        font: inherit;
        color: inherit;
    }

    .time-blurred:hover {
        filter: blur(4px);
    }

    .time-revealed {
        filter: blur(0);
        transition: filter 0.6s ease-out;
    }
</style>
