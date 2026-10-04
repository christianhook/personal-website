<script lang="ts">
    import { onMount } from "svelte";
    import "../../styles/global.css";
    import { classNames, getSocialHover } from "../../lib/utils.js";

    export let link = "";
    export let colour = "";

    let isPopoverOpen = false;

    const { className: hoverBgClass, style: hoverStyle } = getSocialHover(colour);

    // Function to toggle popover
    function togglePopover() {
        isPopoverOpen = !isPopoverOpen;
    }

    // Function to close popover when clicking outside
    function handleClickOutside(event) {
        if (isPopoverOpen && !event.target.closest(".popover-container")) {
            isPopoverOpen = false;
        }
    }

    onMount(() => {
        document.addEventListener("click", handleClickOutside);
        return () => {
            document.removeEventListener("click", handleClickOutside);
        };
    });
</script>

<div class="popover-container relative">
    <button
        on:click={togglePopover}
        aria-label={colour}
        style={hoverStyle}
        class={classNames(
            "group bg-zinc-50 border-zinc-900 text-black hover:text-white",
            "dark:bg-zinc-900 dark:border-zinc-50 dark:text-white dark:hover:text-white",
            hoverBgClass,
            "transition-all ease-in-out duration-300",
            "m-2 text-center inline-block place-items-center p-5 w-32 h-32 border-2 rounded-social cursor-pointer",
            "focus:outline-none tap-highlight-transparent"
        )}
    >
        <span class="inline-block w-full h-full">
            <slot />
        </span>
    </button>

    {#if isPopoverOpen}
        <div
            class="absolute z-10 mt-2 w-32 md:w-64 rounded-md shadow-lg bg-white dark:bg-zinc-800 focus:outline-none"
        >
            <div class="py-1">
                <p class="block px-4 py-2 text-sm text-black dark:text-white">
                    {#if colour === "Discord"}
                        My Discord username is <code class="font-bold">{link}</code>
                    {:else}
                        {link}
                    {/if}
                </p>
            </div>
        </div>
    {/if}
</div>
