import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { RegisterSW } from "./register-sw";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RegisterSW />
    <App />
  </StrictMode>
);
