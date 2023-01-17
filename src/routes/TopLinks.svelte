<script>
    import {top_links} from "../stores.js";

    function toggleLinkDetails(i) {
        $top_links[i].expanded = !$top_links[i].expanded;
    }
</script>
{#if $top_links}
    <ul class="top_links">
        {#each $top_links as link, tli}
            <li>
                <a href="{link.url}" target="_blank" rel="noreferrer" title="{link.description||link.title}">
                    <div class="link_image">
                        {#if link.image}<img src="{link.image}" alt="">{/if}
                    </div>
                    <div class="link_text">
                        <strong class="link_title">{link.title}</strong><br />
                        <span class="link_description">{link.description}</span>
                        {#if link.provider_name}
                            <span class="provider_name">({link.provider_name})</span>
                        {/if}
                    </div>
                </a>
                {#if link.expanded}
                    <div><a title="Click to collapse" class="shared_bar" href="?collapse"
                            on:click|preventDefault={() => {toggleLinkDetails(tli)}}><i class="fa fa-compress"></i></a>
                    </div>
                    {#each link.tooters as linker, i}
                        <a class="shared_bar" href="{link.quotations[linker.acct].toot_url}" target="_blank"
                           rel="noreferrer" title="{link.quotations[linker.acct].toot_text}">
                            <i class="fa fa-comment-o" aria-hidden="true"></i>
                            <img class="linker_avatar" alt="{linker.display_name}" title="{linker.display_name}"
                                 src="{linker.avatar_url}"/>
                            <span class="quote"> &ldquo;{link.quotations[linker.acct].toot_text}&rdquo;</span>
                        </a>
                    {/each}
                    {#if link.boosters.length > 0}
                        <span class="shared_bar">
                        <i class="fa fa-retweet" aria-hidden="true"></i>
                            {#each link.boosters as linker}
                                <img class="linker_avatar" alt="{linker.display_name}" title="{linker.display_name}"
                                     src="{linker.avatar_url}"/>
                        {/each}
                        </span>
                    {/if}
                {:else}
                    <a title="Click for more details" class="shared_bar" href="?expand"
                       on:click|preventDefault={() => {toggleLinkDetails(tli)}}>
                        {#each link.tooters as linker, j}
                            {#if j === 0}<i class="fa fa-comment-o" aria-hidden="true"></i>{/if}
                            <img class="linker_avatar" alt="{linker.display_name}" title="{linker.display_name}"
                                 src="{linker.avatar_url}"/>
                        {/each}
                        {#each link.boosters as linker, j}
                            {#if j === 0}<i class="fa fa-retweet" aria-hidden="true"></i>{/if}
                            <img class="linker_avatar" alt="{linker.display_name}" title="{linker.display_name}"
                                 src="{linker.avatar_url}"/>
                        {/each}
                    </a>
                {/if}
            </li>
        {/each}
    </ul>
{:else}
    <p>Pressing the "Get/Refresh" button above, you will collect the links tooted/boosted in the last 24 hours
        by the people you follow on Mastodon.</p>
    <p>After the collection is completed, the links shared by the most people will be shown to you.</p>
{/if}
