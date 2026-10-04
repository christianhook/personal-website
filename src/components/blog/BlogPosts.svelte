<script lang="ts">
    import { selectedCategory, sortOrder, searchTerm } from "../../stores/blogState.ts";
    import SearchAndFilterControls from "./SearchAndFilterControls.svelte";
    import FeaturedPost from "./FeaturedPost.svelte";
    import PostGrid from "./PostGrid.svelte";
    import { type GetImageResult } from "astro";

    interface Post {
        id: string;
        collection: "blog";
        data: {
            title: string;
            description: string;
            pubDate: Date;
            category?: string;
            updatedDate?: Date;
            heroImage?: string;
        };
    }

    export let posts: Post[] = [];
    export let slugsToImage: { [slug: string]: GetImageResult } = {};

    $: categories = [
        "all",
        ...new Set(posts.map((p) => p.data.category).filter(Boolean)),
    ] as string[];

    $: filtered = posts
        .filter((p) => {
            const categoryMatch =
                $selectedCategory === "all" || p.data.category === $selectedCategory;

            const searchMatch =
                $searchTerm === "" ||
                p.data.title.toLowerCase().includes($searchTerm.toLowerCase()) ||
                p.data.description.toLowerCase().includes($searchTerm.toLowerCase()) ||
                (p.data.category &&
                    p.data.category.toLowerCase().includes($searchTerm.toLowerCase()));

            return categoryMatch && searchMatch;
        })
        .sort((a, b) => {
            const aDate = new Date(a.data.pubDate).valueOf();
            const bDate = new Date(b.data.pubDate).valueOf();
            return $sortOrder === "oldest" ? aDate - bDate : bDate - aDate;
        });

    $: featuredPost = filtered[0];
</script>

<div class="mb-8">
    <SearchAndFilterControls
        bind:selectedCategory={$selectedCategory}
        bind:sortOrder={$sortOrder}
        bind:searchTerm={$searchTerm}
        {categories}
    />

    {#if filtered.length === 0}
        <p class="text-center text-black dark:text-white py-8">No posts found.</p>
    {:else}
        {#if featuredPost}
            <FeaturedPost post={featuredPost} {slugsToImage} />
        {/if}

        {#if filtered.length > 1}
            <PostGrid posts={filtered.slice(1)} {slugsToImage} />
        {/if}
    {/if}
</div>
