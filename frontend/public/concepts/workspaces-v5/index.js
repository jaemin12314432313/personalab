import { mountProjectWorkspace } from '../project-workspace/workspace.js';
import * as view from './dashboard-view.js';
mountProjectWorkspace(document.getElementById('dashboard-root'), { appearance: 'dashboard', view });