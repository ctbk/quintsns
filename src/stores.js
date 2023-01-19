import { writable } from 'svelte/store'


const createBrowserTokenStore = (store_key) => {
  const store = writable(JSON.parse(localStorage.getItem(store_key)))
  // Store the token in LocalStorage whenever it´s updated
  store.subscribe((val) => {
    if (!localStorage) return
    if (!val) return localStorage.removeItem(store_key)
    localStorage.setItem(store_key, JSON.stringify(val))
  })
  return store
}

// just enough to not crash in Node
const createNodeTokenStore = () => writable(null)

function createLSStore(st_name_key) {
	if (typeof localStorage === 'undefined') {
		return createNodeTokenStore();
	} else {
		return createBrowserTokenStore(st_name_key);
	}
} 

export const token = createLSStore('token');
export const client_id = createLSStore('client_id');
export const client_secret = createLSStore('client_secret');
export const masto_instance = createLSStore('masto_instance');
export const myself = createLSStore('myself');
export const top_links = createLSStore('top_links');
export const top_toots = createLSStore('top_toots');
export const quint_version = createLSStore('quint_version');
export const active_tab = createLSStore('active_tab');
