import './theme.svelte.ts'; // sets the theme before anything is drawn
import { mount } from 'svelte';
import Root from './Root.svelte';
import './app.css';

mount(Root, { target: document.getElementById('app')! });
