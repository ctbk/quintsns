<script>
    import {
        active_tab,
        client_id,
        client_secret,
        masto_instance,
        myself,
        quint_version,
        token,
        top_links,
        top_toots,
        settings
    } from '../stores.js';
    import {cleanDisplayName, extractLinks, getAccessCode, getPaginated} from '../mastodon.js';
    import {onMount} from 'svelte';
    import TopLinks from "./TopLinks.svelte";
    import TopToots from "./TopToots.svelte";

    let links_found = 0
    let processing = false
    let followed_done = 0
    let followed_todo = 0
    let name_error
    let settings_shown = false
    const cur_version = 1

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
                //document.location.href = curURL.origin
            }, 200);

        }
    }

    function doLogout() {
        $token = '';
        $client_id = '';
        $client_secret = '';
        $myself = '';
        $top_links = '';
        $top_toots = '';
        $settings = '';
    }

    function checkVersion() {
        let found_version = $quint_version;
        if (!found_version || found_version !== cur_version) {
            // do compatibility thing
            $top_links = ''
            $quint_version = cur_version
        }
        if (!$active_tab) {
            $active_tab = 'top_links'
        }
        if (!$settings || !validSettings())
            resetSettings()
    }

    onMount(async () => {
        await checkLocationCode();
    });

    function calculateTopLinks(links) {
        let top = new Map()
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
        })
        return [...top].sort((a, b) => {
            return b[1].linkers.size - a[1].linkers.size
        })
    }

    async function get_user_info() {
        let url = $masto_instance + '/api/v1/accounts/verify_credentials'
        let options = {'headers': {'Authorization': 'Bearer ' + $token}}
        let resp = await fetch(url, options)
        $myself = await resp.json()
    }

    async function getFollowed() {
        let url = $masto_instance + '/api/v1/accounts/' + $myself['id'] + '/following'
        return getPaginated(url, $token)
    }

    async function getTootsPara(user_id, not_before) {
        let url = new URL($masto_instance + '/api/v1/accounts/' + user_id + '/statuses')
        url.searchParams.set('limit', "100")
        let toots = await getPaginated(url, $token, not_before, true)
        followed_done += 1
        return toots
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

    function geometricMean(arr) {
        let sum = 0
        for (let i = 0; i < arr.length; i++)
            sum = sum + Math.log(arr[i])
        sum = sum / arr.length
        return Math.exp(sum)
    }

    // function geometricMean2(arr) {
    //     let product = 1;
    //     for (let i = 0; i < arr.length; i++)
    //         product = product * arr[i];
    //     return Math.pow(product, 1 / arr.length);
    // }
    function extractToot(toot) {
        if (toot.reblog) {
            return toot.reblog
        } else {
            return toot
        }
    }

    function tootScore(toot) {
        let author_followers = toot.account.followers_count
        let reblogs = toot.reblogs_count * $settings.reblogs_importance / 2
        let favs = toot.favourites_count * $settings.favs_importance / 2
        let replies = toot.replies_count * $settings.replies_importance / 2
        let foll_weight = author_followers > 0 ? 1 / (Math.sqrt(20 + (author_followers * $settings.fol_importance / 2))) : 0
        let hours_by = (Date.now() - new Date(toot.created_at)) / 1000 / 60 / 60
        let time_weight = hours_by > 0 ? 1 / ((6 + (hours_by * $settings.fresh_importance / 2))) : 0
        // if (reblogs + favs + replies < 2)
        //     return 0
        if (toot.favourited || toot.reblogged || toot.bookmarked)
            return 0
        return time_weight * foll_weight * geometricMean([reblogs + 1, favs + 1, replies + 1])
    }

    function update_top_toots(top_t, seen_t, t) {
        if (seen_t.has(t.id))
            return top_t
        seen_t.add(t.id)
        let score = tootScore(t)
        if (top_t.length < $settings.max_top_toots || top_t[top_t.length - 1].score < score) {
            top_t.push({toot: t, score: score})
            return top_t.sort((a, b) => {
                return b.score - a.score
            }).slice(0, $settings.max_top_toots)
        } else {
            return top_t
        }
    }

    async function processTimeLine() {
        if (!validSettings())
            resetSettings()
        followed_done = 0;
        let followed = await getFollowed();
        let followed_info = buildFollowedInfo(followed);
        // console.log(followed);
        let d = new Date();
        let not_before = new Date();
        not_before.setHours(not_before.getHours() - $settings.hours_back);
        d.setHours(d.getHours() - $settings.hours_back);
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
        let top_toots_wip = [];
        let seen_toots = new Set();
        processing = true;
        let followed_toots = await Promise.all(fresh_followed.map(f => {
            return getTootsPara(f.id, not_before.toISOString())
        }))
        followed_toots.forEach(ft => {
            ft.forEach(t => {
                found_links = found_links.concat(extractLinks(t, $masto_instance))
                top_toots_wip = update_top_toots(top_toots_wip, seen_toots, extractToot(t))
            })
            links_found = found_links.length;
        })
        processing = false
        $top_links = prepareLinks(calculateTopLinks(found_links).slice(0, 15), followed_info)
        $top_toots = top_toots_wip
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

    function toggleSettings() {
        console.log("Settings")
        if (!validSettings())
            resetSettings()
        settings_shown = !settings_shown
    }
    let importance_map = {
        0: 'ignored',
        1: 'little importance',
        2: 'normal importance',
        3: 'more importance',
        4: 'very important'
    }
    let adv_settings_shown = false

    function toggleAdvSettings() {
        adv_settings_shown = !adv_settings_shown
    }

    function resetSettings() {
        $settings = {
            hours_back: 24,
            max_top_toots: 50,
            max_top_links: 15,
            replies_importance: 2,
            favs_importance: 2,
            reblogs_importance: 2,
            fol_importance: 2,
            fresh_importance: 2,
        }
    }

    export function validSettings() {
        if (!$settings)
            return false
        if ($settings.hours_back < 6 || $settings.hours_back > 48)
            return false
        if ($settings.max_top_links < 5 || $settings.max_top_links > 30)
            return false
        if ($settings.replies_importance < 0 || $settings.replies_importance > 4)
            return false
        if ($settings.favs_importance < 0 || $settings.favs_importance > 4)
            return false
        if ($settings.reblogs_importance < 0 || $settings.reblogs_importance > 4)
            return false
        if ($settings.fresh_importance < 0 || $settings.fresh_importance > 4)
            return false
        if ($settings.fol_importance < 0 || $settings.fol_importance > 4)
            return false
        if ($settings.max_top_toots < 10 || $settings.max_top_links > 150)
            return false
        return true
    }





    checkVersion();
</script>

{#if $token}
    <div class="myrow">
        <div class="leftcol">
            <button on:click={processTimeLine} class="button primary">Get/refresh data</button>
        </div>
        <div class="rightcol">
            <a href="?settings" on:click|preventDefault={toggleSettings} class="settings" title="Show/hide settings">
                <i class="fa fa-cog" aria-label="Settings"></i></a>
        </div>
    </div>
    {#if settings_shown}
        <div id="settings">
            <fieldset>
                <legend>General Settings</legend>
                <p class="setting">
                    How much of your timeline to analyze:<br/>
                    <input class="range data_amount" type="range" min="6" max="48" step="6"
                           bind:value={$settings.hours_back}> {$settings.hours_back} hrs
                </p>
            </fieldset>
            <fieldset>
                <legend>Top Links</legend>
                <p class="setting">
                    How many Top Links to show:<br/>
                    <input class="range data_amount" type="range" min="5" max="30" step="5"
                           bind:value={$settings.max_top_links}> {$settings.max_top_links} links
                </p>
            </fieldset>
            <fieldset>
                <legend>Top Toots</legend>
                <p class="setting">
                    How many Top Toots to show:<br/>
                    <input class="range data_amount" type="range" min="10" max="150" step="10"
                           bind:value={$settings.max_top_toots}> {$settings.max_top_toots} toots
                </p>
                <fieldset>
                    <legend>Top Toots Ranking</legend>
                    <p>If you want you can decide how much importance to give to toots features when ranking them. <a
                            href="?adv_settings" on:click|preventDefault={toggleAdvSettings}>Show/hide ranking
                        settings</a></p>
                    {#if adv_settings_shown}
                        <p class="setting">
                            Favourites:<br/>
                            <input class="range data_amount" type="range" min="0" max="4" step="1"
                                   bind:value={$settings.favs_importance}> {importance_map[$settings.favs_importance]}
                        </p>
                        <p class="setting">
                            Boosts:<br/>
                            <input class="range data_amount" type="range" min="0" max="4" step="1"
                                   bind:value={$settings.reblogs_importance}> {importance_map[$settings.reblogs_importance]}
                        </p>
                        <p class="setting">
                            Replies:<br/>
                            <input class="range data_amount" type="range" min="0" max="4" step="1"
                                   bind:value={$settings.replies_importance}> {importance_map[$settings.replies_importance]}
                        </p>
                        <p class="setting">
                            Freshness:<br/>
                            <input class="range data_amount" type="range" min="0" max="4" step="1"
                                   bind:value={$settings.fresh_importance}> {importance_map[$settings.fresh_importance]}
                        </p>
                        <p class="setting">
                            Tooters with Few Followers:<br/>
                            <input class="range data_amount" type="range" min="0" max="4" step="1"
                                   bind:value={$settings.fol_importance}> {importance_map[$settings.fol_importance]}
                        </p>
                    {/if}
                </fieldset>
            </fieldset>
            <p>Settings will be applied at the next data refresh.</p>
            <nav class="myrow">
                <div class="leftcol">
                    <button class="button" on:click={toggleSettings}>Close</button>
                    <button class="button outline dark" on:click={resetSettings}>Reset</button>
                </div>
                <div class="rightcol">
                    <button on:click={doLogout} class="button error">Logout</button>
                </div>
            </nav>
        </div>
    {/if}
    {#if processing}
        <p>
            <progress value={followed_done} max={followed_todo}>downloading...</progress>
            Retrieving data...
        </p>
    {/if}
    <nav class="tabs is-full">
        <a class:active={$active_tab==='top_links'} href="?top_links"
           on:click|preventDefault={()=>{$active_tab = 'top_links'}}>Top Links <i class="fa fa-link"
                                                                                  aria-hidden="true"></i></a>
        <a class:active={$active_tab==='top_toots'} href="?top_toots"
           on:click|preventDefault={()=>{$active_tab = 'top_toots'}}>Top Toots <i class="fa fa-comments"
                                                                                  aria-hidden="true"></i></a>
    </nav>
    {#if $active_tab === 'top_links'}
        <TopLinks/>
    {:else}
        <TopToots/>
    {/if}
{:else}
    <p>Quintessence shows you the top links that the people that you follow on
        Mastodon tooted or boosted in the last hours and the most notable toots that appeared in your timeline.</p>
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
