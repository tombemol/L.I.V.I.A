import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import AndroidApp from "./AndroidApp";
import "./styles.css";

const isAndroid = /android/i.test(navigator.userAgent);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isAndroid ? <AndroidApp /> : <App />}
  </StrictMode>
);
