<script>
    import { token, client_id, client_secret, masto_instance, myself, top_links} from '../stores.js';
    import { getPaginated, pace } from '../mastodon.js';
    import { onMount } from 'svelte';
    import "../../node_modules/chota/dist/chota.min.css"

    let hours_back = 24;
    let links = [];
    let resp = undefined;
    let timeline = undefined;
    let total_toots_seen = 0;
    let links_found = 0;
    let processing = false;
    let followed_done = 0;
    let followed_todo = 0;
    let name_error;

    function extractLinksA(toot) {
        let content;
        let card;
        let parsed_links = [];
        var linker_acct = toot.account.acct;
        var linker_name = toot.account.display_name;
        var parser = new DOMParser();
        if (toot.content) {
            content = toot.content;
            card = toot.card;

        } else if (toot.reblog) {
            content = toot.reblog.content;
            card = toot.reblog.card;
        } 
        card = card ? card : {};
        if (content) {
            var html = parser.parseFromString(content, 'text/html');
            var a_tags = html.getElementsByTagName('a');
            for (let i = 0; i < a_tags.length; i++) {
                var a_tag = a_tags[i];
                if (a_tag.classList.length) continue; // hacky: real links have no class in mastodon's toots
                parsed_links.push({
                    'linker_acct': linker_acct,
                    'linker_name': linker_name,
                    'url': a_tag.href,
                    'title': a_tag.href == card.url ? card.title : undefined,
                    'description': a_tag.href == card.url ? card.description : undefined,
                    'provider': a_tag.href == card.url ? card.provider : undefined,
                });
            };
        }     
        return parsed_links;
    }

    function clean_masto_address() {
        name_error = '';
        let dirty = $masto_instance;
        dirty = dirty.trim().toLowerCase().replace(/^https?:\/\/*/, '');
        dirty = 'https://'+dirty;
        console.log(dirty);
        try {
            let u = new URL(dirty);
            if (u.protocol == 'https:') {
                $masto_instance = u.origin;
                return true;
            }
        } catch {
        }
        name_error = "Please check that the instance name you typed is correct.";
        return false;
    }
    async function doLogin() {
        if (!clean_masto_address()) return;
        let url = $masto_instance + '/api/v1/apps';
        let fd = new FormData();
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
        if ($token) return;

        let turl = new URL($masto_instance + '/oauth/token');
        const curURL = new URL(window.location);
        if (curURL.searchParams.has('code')) {
            let code = curURL.searchParams.get('code');
            let token_params = {
                'client_id': $client_id,
                'client_secret': $client_secret,
                'redirect_uri': curURL.origin,
                'grant_type': 'authorization_code',
                'code': code,
                'scope': 'read'
            };
            const options = { 
                'method': 'POST',
                'body': JSON.stringify(token_params),
                'headers': {'Content-Type': 'application/json'}
            }
            let create_token_resp = await fetch(turl, options);
            let result = await create_token_resp.json();
            $token = result['access_token'];
            await get_user_info();
            setTimeout(() => { document.location.href = curURL.origin }, 200);
            
        }
    }
    function doLogout() {
        $token = '';
        $client_id = '';
        $client_secret = '';
        $myself = '';
        $top_links = '';
    }
    onMount(async () => {
        await checkLocationCode();
    });
    function calculateTopLinks(links) {
        var top = new Map();
        links.forEach(l => {
            if (top.has(l.url)) {
                top.get(l.url).linkers.add(l.linker_acct);
                if (l.title) { top.get(l.url).title = l.title };
                if (l.description) { top.get(l.url).description = l.description };
                if (l.provider) { top.get(l.url).provider = l.provider };
            } else {
                top.set(l.url, {
                    'linkers': new Set([l.linker_acct]),
                    'title': l.title,
                    'description': l.description,
                    'provider': l.provider
                    });
            }
        });
        var sorted = [...top].sort((a, b) => { return b[1].linkers.size - a[1].linkers.size });
        return sorted;
    }
    async function get_user_info() {
        let url = $masto_instance + '/api/v1/accounts/verify_credentials';
        let options = {'headers' : {'Authorization': 'Bearer '+ $token}};
        let resp = await fetch(url, options);
        $myself = await resp.json();
    }
    async function getFollowed() {
        let url = $masto_instance + '/api/v1/accounts/'+$myself['id']+'/following';
        return getPaginated(url, $token);
    }
    async function getToots(user_id, not_before) {
        let url = new URL($masto_instance + '/api/v1/accounts/'+user_id+'/statuses');
        url.searchParams.set('limit', 100);
        return await getPaginated(url, $token, not_before);
    }
    async function fillTopLinks() {
        processing = true;
        let followed = await getFollowed();
        console.log(followed);
        let d = new Date();
        let not_before = new Date();
        not_before.setHours(not_before.getHours() - 24);
        d.setHours(d.getHours() - 24);
        d.setUTCHours(0);
        d.setUTCMinutes(0);
        d.setUTCSeconds(0);
        d.setUTCMilliseconds(0);
        let fresh_followed = followed.filter(f => { 
            let parsedDate = new Date();
            parsedDate.setTime(Date.parse(f.last_status_at));
            return parsedDate >= d;
        });
        followed_todo = fresh_followed.length;
        let found_links = [];
        for (let i = 0; i < fresh_followed.length; i++) {
            let f = fresh_followed[i];
            let toots = await getToots(f.id, not_before.toISOString());
            console.log(`${f.acct} has ${toots.length} toots`);
            toots.forEach(t => {
                found_links = found_links.concat(extractLinksA(t)) 
            });
            links_found = found_links.length;
            followed_done = i+1;
        };
        processing = false;
        $top_links = prepare_links(calculateTopLinks(found_links).slice(0, 15));
    }
    function trunc_str(s, max_length=120) {
        let abbr = '…';
        if (s.length < max_length) return s;
        return s.slice(0,max_length-1).trim() + abbr;
    }
    function prepare_links(links) {
        let prepared_links = [];
        for (let i = 0; i < links.length; i++) {
            let url = links[i][0];
            let ld = links[i][1];
            prepared_links.push({
                url: url,
                title: ld.title ? trunc_str(ld.title) : trunc_str(url, 60),
                ppl: ld.linkers.size > 1 ? 'people' : 'person',
                linkers: [...ld.linkers]
            });
        }
        return prepared_links;
    }
    function fakeme() {
    alert('fale');
    }
</script>
<style>
:root {
      --bg-color: #191b22;
      --bg-secondary-color: #131316;
      --font-color: #f5f5f5;
      --color-grey: #ccc;
      --color-darkGrey: #777;
      --color-primary: #bcbdff;
      --grid-maxWidth: 100rem;

}
footer {
    font-size:70%;
}

progress { color: var(--color-primary); }
progress::-moz-progress-bar { background: var(--color-primary);  }
progress::-webkit-progress-value { background: var(--color-primary); }
</style>

<div class="container">
<h1>Quintessence</h1>
{#if $token}
<p class="grouped">
    <button on:click={fillTopLinks} class="button primary">Get/refresh the top links</button>
    <button on:click={doLogout} class="button outline dark">Logout</button>
</p>
{#if processing}
    <p><progress value={followed_done} max={followed_todo} >downloading...</progress> Links found: {links_found}</p>
{/if}
{#if $top_links}
    <p>Here are the latest most shared links from people you follow:</p>
    <ul>
    {#each $top_links as link, i}
        <li><a href={link.url}>{link.title}</a> ({link.linkers.length} {link.ppl})</li>
    {/each}
    </ul>
{:else}
<p>Pressing the "Get/Refresh" button above, you will collect the links tooted/boosted in the last 24 hours by the people you follow on Mastodon.</p>
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
<div class="grouped"><input bind:value={$masto_instance} on:submit={fakeme} placeholder="Your instance address" /><button on:click={doLogin} class="button primary">Authorize</button></div>
{#if name_error}<div class="error">{name_error}</div>{/if}
{/if}
<footer>Quintessence was made by <a rel="me" href="https://mastodon.uno/@ctbk">ctbk</a>; follow <a rel="me" href="https://mastodon.uno/@quintsns">quintsns</a> for news & updates.</footer>

</div>
