import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./theme.css";
import "./integrated.css";
import "./visual.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
createRoot(root).render(<App />);
