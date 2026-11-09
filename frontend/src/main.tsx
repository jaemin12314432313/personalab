import { mountMockup } from "./mockup/MockupApp";
import "./mockup/mockup.css";
import "./mockup/marketing.css";
import "./mockup/workspace.css";
import "./mockup/editorial.css";
import "./mockup/workflow.css";
import "./mockup/setup-layout.css";
import "./mockup/execution-compact.css";
import "./mockup/app-notifications.css";
import "./mockup/workspace-shell.css";
import "./mockup/studio-shell.css";
import "./mockup/studio-topbar.css";
import "./mockup/redesign.css";
import "./mockup/studio-views.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
mountMockup(root);
