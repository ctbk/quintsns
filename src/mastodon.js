function mySleep(delayTime) {
    return new Promise(resolve => setTimeout(resolve, delayTime));
}
export async function pace(remaining) {
    let msec;
    if (remaining > 130) return;
    if (remaining > 30) {
        msec = 1000 * (1 - ((remaining-50)/100));
    } else {
        msec = 1100;
    }
    console.log(`pace: calls remaining ${remaining}, waiting ${msec}`);
    return await mySleep(msec);
}
export async function getPaginated(url, token, not_before) {
    let items = [];
    let go_on = true;
    let options = {};
    let items_batch;
    let resp;
    let loops = 1;
    let stop = false;
    if (token) {
        options = {'headers' : {'Authorization': 'Bearer '+ token}};
    }
    let remaining_calls = 500;
    do {
        pace(remaining_calls);
        resp = await fetch(url, options);
        remaining_calls = resp.headers.get('X-RateLimit-Remaining');
        items_batch = await resp.json();
        if (items_batch.length == 0) break;
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

        var link = resp.headers.get('Link');
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

    } while(loops < 50)
    console.log("Finished pagination after " + loops);
    return items;
    
}

