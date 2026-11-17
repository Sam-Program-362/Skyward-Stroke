import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { PWAInstallBanner } from "./pwa/PWAInstallBanner";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PWAInstallBanner />
    <App />
  </StrictMode>
);
