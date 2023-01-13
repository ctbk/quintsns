<script>
    import {client_id, client_secret, masto_instance, myself, token, top_links, quint_version} from '../stores.js';
    import {extractLinks, getPaginated, getAccessCode} from '../mastodon.js';
    import {onMount} from 'svelte';
    // import "../../node_modules/chota/dist/chota.min.css"

    let hours_back = 24;
    let links_found = 0;
    let processing = false;
    let followed_done = 0;
    let followed_todo = 0;
    let name_error;
    const cur_version = 1;

    function clean_masto_address() {
        name_error = '';
        let dirty = $masto_instance;
        dirty = dirty.trim().toLowerCase().replace(/^https?:\/+/, '');
        dirty = 'https://' + dirty;
        console.log(dirty);
        try {
            let u = new URL(dirty);
            if (u.protocol === 'https:') {
                $masto_instance = u.origin;
                return true;
            }
        } catch {
            console.log("Problems with the typed instance: " + dirty);
        }
        name_error = "Please check that the instance name you typed is correct.";
        return false;
    }

    async function doLogin() {
        if (!clean_masto_address()) return;
        let url = $masto_instance + '/api/v1/apps';
        let curURL = new URL(window.location);
        let app_params = {
            'client_name': 'quintessence',
            'redirect_uris': 'urn:ietf:wg:oauth:2.0:oob ' + curURL.origin,
            'scope': 'read'
        }
        const options = {
            'method': 'POST',
            'body': JSON.stringify(app_params),
            'headers': {'Content-Type': 'application/json'}
        }
        let create_app_resp = await fetch(url, options);
        let result = await create_app_resp.json();
        $client_id = result['client_id'];
        $client_secret = result['client_secret'];
        let aurl = new URL($masto_instance + '/oauth/authorize');
        let auth_params = {
            'response_type': 'code',
            'client_id': $client_id,
            'scope': 'read',
            'redirect_uri': curURL.origin
        }
        for (let k in auth_params) {
            aurl.searchParams.append(k, auth_params[k]);
        }
        setTimeout(() => {
            document.location.href = aurl;
        }, 200);
    }

    async function checkLocationCode() {
        if ($token || !$masto_instance) return;
        const curURL = new URL(window.location);
        if (curURL.searchParams.has('code')) {
            let code = curURL.searchParams.get('code');
            let redirect_uri = curURL.origin;
            $token = await getAccessCode($masto_instance, $client_id, $client_secret, code, redirect_uri)
            await get_user_info();
            setTimeout(() => {
                document.location.href = curURL.origin
            }, 200);

        }
    }

    function doLogout() {
        $token = '';
        $client_id = '';
        $client_secret = '';
        $myself = '';
        $top_links = '';
    }

    function checkVersion() {
        let found_version = $quint_version;
        if (!found_version || found_version !== cur_version) {
            // do compatibility thing
            $top_links = ''
            $quint_version = cur_version
        }
    }
    checkVersion();

    onMount(async () => {
        await checkLocationCode();
    });

    function calculateTopLinks(links) {
        let top = new Map();
        let link_data;
        links.forEach(l => {
            if (top.has(l.url)) {
                link_data = top.get(l.url)
            } else {
                link_data = {
                    linkers: new Set(),
                    boosters: new Set(),
                    tooters: new Set(),
                    quotations: {}
                }
            }
            link_data.linkers.add(l.linker_acct)
            if (l.action === 'boost') {
                link_data.boosters.add(l.linker_acct)
            } else if (l.action === 'toot') {
                link_data.tooters.add(l.linker_acct)
                link_data.quotations[l.linker_acct] = {toot_url: l.toot_url, toot_text: l.toot_text}
            }
            if (l.title) {
                link_data.title = l.title
            }
            if (l.description) {
                link_data.description = l.description
            }
            if (l.provider_name) {
                link_data.provider_name = l.provider_name
                link_data.provider_url = l.provider_url
            }
            if (l.image) {
                link_data.image = l.image
            }
            top.set(l.url, link_data)
        });
        return [...top].sort((a, b) => {
            return b[1].linkers.size - a[1].linkers.size
        });
    }

    async function get_user_info() {
        let url = $masto_instance + '/api/v1/accounts/verify_credentials';
        let options = {'headers': {'Authorization': 'Bearer ' + $token}};
        let resp = await fetch(url, options);
        $myself = await resp.json();
    }

    async function getFollowed() {
        let url = $masto_instance + '/api/v1/accounts/' + $myself['id'] + '/following';
        return getPaginated(url, $token);
    }

    async function getToots(user_id, not_before) {
        let url = new URL($masto_instance + '/api/v1/accounts/' + user_id + '/statuses');
        url.searchParams.set('limit', "100");
        return await getPaginated(url, $token, not_before);
    }

    function cleanDisplayName(name) {
        return name.replace(/:[^:]+:/g, '')
    }

    function buildFollowedInfo(followed) {
        let fi = {};
        followed.forEach(fl => {
            fi[fl.acct] = {
                avatar_url: fl.avatar,
                display_name: cleanDisplayName(fl.display_name)
            }
        });
        return fi
    }

    async function fillTopLinks() {
        followed_done = 0;
        processing = true;
        let followed = await getFollowed();
        let followed_info = buildFollowedInfo(followed);
        // console.log(followed);
        let d = new Date();
        let not_before = new Date();
        not_before.setHours(not_before.getHours() - hours_back);
        d.setHours(d.getHours() - hours_back);
        d.setUTCHours(0);
        d.setUTCMinutes(0);
        d.setUTCSeconds(0);
        d.setUTCMilliseconds(0);
        let fresh_followed = followed.filter(f => {
            let parsedDate = new Date();
            parsedDate.setTime(Date.parse(f.last_status_at));
            return parsedDate >= d;
        }); /* ### */
        followed_todo = fresh_followed.length;
        let found_links = [];
        for (let i = 0; i < fresh_followed.length; i++) {
            let f = fresh_followed[i];
            let toots = await getToots(f.id, not_before.toISOString());
            console.log(`${f.acct} has ${toots.length} toots`);
            toots.forEach(t => {
                found_links = found_links.concat(extractLinks(t))
            });
            links_found = found_links.length;
            followed_done = i + 1;
        }
        processing = false;
        $top_links = prepareLinks(calculateTopLinks(found_links).slice(0, 15), followed_info);
    }

    function trunc_str(s, max_length = 120) {
        let abbr = '…';
        if (s.length < max_length) return s;
        return s.slice(0, max_length - 1).trim() + abbr;
    }

    function expandFollowers(followers, info) {
        let expanded = [];
        followers.forEach(f => {
            expanded.push({
                acct: f,
                avatar_url: info[f].avatar_url,
                display_name: info[f].display_name,
            })
        })
        return expanded
    }

    function prepareLinks(links, followed_info) {
        let prepared_links = [];
        for (let i = 0; i < links.length; i++) {
            let url = links[i][0];
            let ld = links[i][1];

            prepared_links.push({
                url: url,
                image: ld.image ? ld.image : '',
                title: ld.title ? trunc_str(ld.title) : trunc_str(url, 80),
                ppl: ld.linkers.size > 1 ? 'people' : 'person',
                description: ld.description ? ld.description : '',
                provider_name: ld.provider_name ? ld.provider_name : '',
                provider_url: ld.provider_url ? ld.provider_url : '',
                linkers: expandFollowers(ld.linkers, followed_info),
                tooters: expandFollowers(ld.tooters, followed_info),
                boosters: expandFollowers(ld.boosters, followed_info),
                quotations: ld.quotations,
                expanded: false,
            });
        }
        return prepared_links;
    }

    function toggleLinkDetails(i) {
        $top_links[i].expanded = !$top_links[i].expanded;
    }
</script>

{#if $token}
    <p class="grouped">
        <button on:click={fillTopLinks} class="button primary">Get/refresh the top links</button>
        <button on:click={doLogout} class="button outline dark">Logout</button>
    </p>
    {#if processing}
        <p>
            <progress value={followed_done} max={followed_todo}>downloading...</progress>
            Links found: {links_found}</p>
    {/if}
    {#if $top_links}
        <p>These are the latest most shared links from people you follow:</p>
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
{:else}
    <p>Quintessence shows you the top links that the people that you follow on
        Mastodon tooted or boosted in the last 24 hours.</p>
    <p>In order to work it just needs read permissions for your account.</p>
    <p>You can allow this by specifying your instance in the text box below and
        clicking "Authorize".</p>
    <p>Quintessence is a static site, all its code runs on the device that you are
        using to read these lines. No data leaves your browser nor is being shared with
        anyone.</p>
    <p>Enjoy!</p>
    <div class="grouped">
        <form on:submit={doLogin}><input bind:value={$masto_instance} placeholder="Your instance address"/>
            <button on:click={doLogin} class="button primary">Authorize</button>
        </form>
    </div>
    {#if name_error}
        <div class="error">{name_error}</div>
    {/if}
{/if}
