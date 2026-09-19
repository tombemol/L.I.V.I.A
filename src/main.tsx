import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

async function bootstrap() {
  let android = false;

  try {
    const AndroidFs = await import("tauri-plugin-android-fs-api");
    android = Boolean(await Promise.resolve(AndroidFs.isAndroid()));
  } catch {
    android = false;
  }

  const root = createRoot(document.getElementById("root")!);

  if (android) {
    const { default: AndroidApp } = await import("./mobile/AndroidApp");
    root.render(
      <StrictMode>
        <AndroidApp />
      </StrictMode>
    );
    return;
  }

  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void bootstrap();
