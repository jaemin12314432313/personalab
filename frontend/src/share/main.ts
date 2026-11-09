import { mountShareApp } from './ShareApp';
const root=document.getElementById('root');
if(!root)throw new Error('PersonaLab root is missing');
mountShareApp(root);