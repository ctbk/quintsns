<script>
    import {top_toots, masto_instance} from "../stores.js";
    import {account_instance_url, toot_instance_url, cleanDisplayName} from "../mastodon.js";
    function formattedDate(date_string) {
        let d = new Date(date_string)
        let fmt = Intl.DateTimeFormat([], {timeStyle: "short", dateStyle: "short"})
        return fmt.format(d)
    }
</script>
{#if $top_toots && $top_toots.length}
    <ul class="top_toots">
        {#each $top_toots as t}
        <li>
            <a href="{toot_instance_url($masto_instance, t.toot)}" target="_blank" rel="noreferrer">
                <a class="toot_credits" href="{account_instance_url($masto_instance, t.toot.account)}"
                   target="_blank" rel="noreferrer">
                    <img class="tooter_avatar" src="{t.toot.account.avatar}" alt="{t.toot.account.display_name}">
                    <div class="tooter_name_acct">
                        <span class="tooter_name">{cleanDisplayName(t.toot.account.display_name)}</span><br />
                        <span class="tooter_acct">@{t.toot.account.acct}</span>
                    </div>
                </a>
                <div class="toot_content">{@html t.toot.content}</div>
                <div class="toot_media">
                    {#each t.toot.media_attachments as attach}
                        <img height="200" class="media_attachment" src="{attach.preview_url}" title="{attach.description}" alt=""/>
                    {/each}
                </div>
                <nav class="nav">
                    <div class="nav-left">
                        <span class="interactions">
                            <i class="fa fa-mail-reply" aria-label="replies"></i>{t.toot.replies_count}&nbsp;
                            <i class="fa fa-retweet" aria-label="boosts"></i>{t.toot.reblogs_count}&nbsp;
                            <i class="fa fa-star" aria-label="stars"></i>{t.toot.favourites_count}
                        </span>
                    </div>
                    <div class="nav-right"><span class="toot_date">{formattedDate(t.toot.created_at)}</span></div>
                </nav>
            </a>
        </li>
        {/each}
    </ul>
{:else}
    <p>After pressing the get/refresh button above, the "top" toots that appeared in your timeline in the last 24 hours will be shown here.
{/if}
<p>Beware: the scoring criteria is still very experimental.</p>
