<script lang="ts">
    import { classNames } from "../../lib/utils";
    import SortNewestIcon from "../../components/icons/SortNewestIcon.svelte";
    import SortOldestIcon from "../../components/icons/SortOldestIcon.svelte";
    import SearchIcon from "../../components/icons/SearchIcon.svelte";
    import ChevronDownIcon from "../../components/icons/ChevronDownIcon.svelte";

    export let selectedCategory: string;
    export let sortOrder: string;
    export let searchTerm: string;
    export let categories: string[];

    const toggleSortOrder = () => {
        sortOrder = sortOrder === "newest" ? "oldest" : "newest";
    };
</script>

<div class="flex flex-wrap items-center justify-between gap-4 mb-8">
    <div class="flex-1 min-w-[200px]">
        <div class="relative h-10">
            <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <SearchIcon />
            </div>
            <input
                type="text"
                id="search"
                bind:value={searchTerm}
                placeholder="Search"
                title="Search by title, description, category"
                class={classNames(
                    "w-full h-full pl-10",
                    "focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:focus:ring-zinc-400",
                    "border border-zinc-300 dark:border-zinc-700 rounded-md",
                    "bg-white dark:bg-zinc-800 text-black dark:text-white",
                    "h-10 p-2",
                    "hover:bg-zinc-100 dark:hover:bg-zinc-700"
                )}
            />
        </div>
    </div>

    <div class="flex items-center gap-3 ml-auto">
        <div class="w-[150px] relative">
            <label for="category" class="sr-only">Filter by category</label>
            <select
                id="category"
                bind:value={selectedCategory}
                class={classNames(
                    "w-full pr-8 text-sm",
                    "focus:ring-0 focus:outline-none",
                    "overflow-hidden text-ellipsis cursor-pointer appearance-none",
                    "border border-zinc-300 dark:border-zinc-700 rounded-md",
                    selectedCategory !== "all"
                        ? "bg-zinc-100 dark:bg-zinc-600 text-black dark:text-white"
                        : "bg-white dark:bg-zinc-800 text-black dark:text-white",
                    "h-10 p-2",
                    "hover:bg-zinc-100 dark:hover:bg-zinc-700"
                )}
            >
                {#each categories as category (category)}
                    <option
                        value={category}
                        class="truncate"
                        title={category === "all" ? "All Categories" : category}
                    >
                        {category === "all" ? "All Categories" : category}
                    </option>
                {/each}
            </select>
            <div class="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <ChevronDownIcon />
            </div>
        </div>

        <button
            on:click={toggleSortOrder}
            class={classNames(
                "cursor-pointer",
                "border border-zinc-300 dark:border-zinc-700 rounded-md",
                sortOrder !== "newest"
                    ? "bg-zinc-100 dark:bg-zinc-600 text-black dark:text-white"
                    : "bg-white dark:bg-zinc-800 text-black dark:text-white",
                "h-10 p-2",
                "hover:bg-zinc-100 dark:hover:bg-zinc-700"
            )}
            aria-label={sortOrder === "newest"
                ? "Sorted by newest first"
                : "Sorted by oldest first"}
            title={sortOrder === "newest" ? "Sort by newest" : "Sort by oldest"}
        >
            {#if sortOrder === "newest"}
                <SortNewestIcon />
            {:else}
                <SortOldestIcon />
            {/if}
        </button>
    </div>
</div>
