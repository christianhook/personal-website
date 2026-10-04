<script lang="ts">
    import { formatArticleDate } from "../../lib/utils";
    import { type GetImageResult } from "astro";

    export let post;
    export let slugsToImage: { [slug: string]: GetImageResult } = {};
</script>

<div class="mb-12">
    <a
        href={`/blog/${post.id}/`}
        class="group block transition-all duration-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl p-2 -m-2"
    >
        <img
            src={slugsToImage[post.id].src}
            alt={`${post.data.title} - ${post.data.description}`}
            class="w-full rounded-xl mb-4 transition-all duration-200 group-hover:shadow-lg"
        />
        <h2
            class="text-3xl font-bold mb-2 text-black dark:text-white group-hover:underline"
            title={post.data.title}
        >
            {post.data.title}
        </h2>
        <div class="flex items-center gap-3 text-black dark:text-white">
            <span>{formatArticleDate(new Date(post.data.pubDate))}</span>
            {#if post.data.category}
                <span
                    class="inline-block text-sm bg-zinc-200 dark:bg-zinc-700 text-black dark:text-white px-2 py-1 rounded"
                    title={post.data.category}
                >
                    {post.data.category}
                </span>
            {/if}
        </div>
        <p class="mt-2 text-black dark:text-white" title={post.data.description}>
            {post.data.description}
        </p>
    </a>
</div>
