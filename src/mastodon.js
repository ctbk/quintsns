function mySleep(delayTime) {
    return new Promise(resolve => setTimeout(resolve, delayTime));
}

export async function pace(remaining) {
    let msec;
    if (remaining > 130) return;
    if (remaining > 30) {
        msec = 2000 * (1 - ((remaining - 50) / 100));
    } else if (remaining > 10) {
        msec = 2500;
    } else {
        msec = 5000;
    }
    console.log(`pace: calls remaining ${remaining}, waiting ${msec}`);
    return await mySleep(msec);
}

let remaining_calls = 500;

export async function getPaginated(url, token, not_before, jitter = false) {
    const jitter_spread = 3000;
    let items = [];
    let options = {};
    let items_batch;
    let resp;
    let loops = 1;
    let stop = false;
    if (token) {
        options = {'headers': {'Authorization': 'Bearer ' + token}};
    }
    if (jitter) {
        await mySleep(Math.round(Math.random() * jitter_spread))
    }
    do {
        do {
            await pace(remaining_calls);
            resp = await fetch(url, options);
            remaining_calls = resp.headers.get('X-RateLimit-Remaining');
            if (!resp.ok) {
                console.log(`Error fetching data: ${resp.status} - ${resp.statusText}`)
            }
        } while (!resp.ok)
        items_batch = await resp.json();
        if (items_batch.length === 0) break;
        try {
            items_batch.forEach(i => {
                if (!not_before || i.created_at > not_before) {
                    items.push(i);
                } else if (not_before && i.created_at < not_before) {
                    stop = true;
                }
            });
        } catch {
            console.log("error while looping over items");
            console.log(items_batch);
        }
        if (stop) break;

        let link = resp.headers.get('Link');
        if (!link || !link.includes('next')) break;

        let next_page_url;
        link.split(',').forEach(s => {
            if (s.includes('next')) {
                next_page_url = new URL(s.slice(s.indexOf('http'), s.indexOf('>')));
            }
        });
        if (next_page_url) {
            console.log("next page...");
            url = next_page_url;
        }
        loops = loops + 1;

    } while (loops < 50)
    console.log("Finished pagination after " + loops);
    return items;
}

function extractPureText(htmlText) {
    let e = document.createElement('span')
    e.innerHTML = htmlText.replace(/<br ?\/?>/ig, ' ');
    let txt = e.innerText || e.textContent;
    return txt.replace(/@[^ ]+/g, '').replace(/https?:\/\/[^ ]/ig, '').trim()
}

export function account_instance_url(instance, account) {
    return instance + '/@' + account.acct
}

export function toot_instance_url(instance, toot) {
    let author_account;
    let toot_id;
    if (toot.reblog) {
        author_account = toot.reblog.account;
        toot_id = toot.reblog.id;
    } else {
        author_account = toot.account;
        toot_id = toot.id;
    }
    return instance + '/@' + author_account.acct + '/' + toot_id
}

export function extractLinks(toot, instance) {
    let content;
    let card;
    let parsed_links = [];
    let action;
    const linker_acct = toot.account.acct;
    const linker_name = toot.account.display_name;
    const parser = new DOMParser();
    if (toot.content) {
        content = toot.content;
        card = toot.card;
        action = 'toot';
    } else if (toot.reblog) {
        content = toot.reblog.content;
        card = toot.reblog.card;
        action = 'boost';
    }
    card = card ? card : {};
    if (content) {
        const html = parser.parseFromString(content, 'text/html');
        const a_tags = html.getElementsByTagName('a');
        for (let i = 0; i < a_tags.length; i++) {
            let a_tag = a_tags[i];
            if (a_tag.classList.length) continue; // hacky: real links have no class in mastodon's toots
            parsed_links.push({
                action: action,
                linker_acct: linker_acct,
                linker_name: linker_name,
                url: a_tag.href,
                title: a_tag.href === card.url ? card.title : undefined,
                description: a_tag.href === card.url ? card.description : undefined,
                image: card.image ? card.image : undefined,
                provider_name: a_tag.href === card.url ? card.provider_name : undefined,
                provider_url: a_tag.href === card.url ? card.provider_url : undefined,
                toot_text: action === 'toot' ? extractPureText(content) : undefined,
                toot_url: instance ? toot_instance_url(instance, toot) : toot.url
            });
        }
    }
    return parsed_links;
}

export async function getAccessCode(masto_instance, client_id, client_secret, code, redirect_uri) {
    let turl = new URL(masto_instance + '/oauth/token');
    let token_params = {
        'client_id': client_id,
        'client_secret': client_secret,
        'redirect_uri': redirect_uri,
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
    let tk = await create_token_resp.json();
    return tk['access_token']
}

export function cleanDisplayName(name) {
    return name.replace(/:[^:]+:/g, '')
}