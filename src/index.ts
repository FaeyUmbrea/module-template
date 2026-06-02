// #if svelte
import { mount } from 'svelte';
import Example from './svelte/Example.svelte';
// #endif
import './styles/main.styl';

Hooks.once('init', () => {
	console.warn('{{MODULE_ID}} | init');
});

Hooks.once('ready', () => {
	// #if svelte
	// Example: mount a Svelte component somewhere when needed.
	void mount;
	void Example;
	// #endif
});
