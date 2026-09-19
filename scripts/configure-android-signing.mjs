import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const MARKER = "// L.I.V.I.A. release signing";

export function patchAndroidSigning(source) {
  if (source.includes(MARKER)) return source;

  if (!source.includes("buildTypes {")) {
    throw new Error("build.gradle.kts sem bloco buildTypes; template Android inesperado.");
  }

  if (!source.includes('getByName("release") {')) {
    throw new Error('build.gradle.kts sem getByName("release"); não é seguro adivinhar o template.');
  }

  let next = source;

  if (!next.includes("import java.io.FileInputStream")) {
    next = `import java.io.FileInputStream\n${next}`;
  }

  if (!next.includes("import java.util.Properties")) {
    next = `import java.util.Properties\n${next}`;
  }

  const signingConfig = `
    ${MARKER}
    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            require(keystorePropertiesFile.exists()) {
                "keystore.properties ausente para build Android release"
            }

            val keystoreProperties = Properties()
            FileInputStream(keystorePropertiesFile).use {
                keystoreProperties.load(it)
            }

            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["password"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["password"] as String
        }
    }

`;

  next = next.replace("    buildTypes {", `${signingConfig}    buildTypes {`);

  next = next.replace(
    '        getByName("release") {',
    '        getByName("release") {\n            signingConfig = signingConfigs.getByName("release")'
  );

  return next;
}

function selfTest() {
  const sample = `plugins {
    id("com.android.application")
}

android {
    namespace = "com.tombemol.livia"

    buildTypes {
        getByName("debug") {
            isDebuggable = true
        }
        getByName("release") {
            isMinifyEnabled = true
        }
    }
}
`;

  const patched = patchAndroidSigning(sample);

  assert.match(patched, /import java\.io\.FileInputStream/);
  assert.match(patched, /import java\.util\.Properties/);
  assert.match(patched, /signingConfigs \{/);
  assert.match(patched, /signingConfig = signingConfigs\.getByName\("release"\)/);
  assert.equal(patchAndroidSigning(patched), patched, "patch deve ser idempotente");

  process.stdout.write("Android signing patcher: OK\n");
}

function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }

  const target = process.argv[2] ?? "src-tauri/gen/android/app/build.gradle.kts";
  const resolved = path.resolve(target);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Arquivo Android não encontrado: ${resolved}`);
  }

  const source = fs.readFileSync(resolved, "utf8");
  const patched = patchAndroidSigning(source);

  fs.writeFileSync(resolved, patched, "utf8");
  process.stdout.write(`Android release signing configurado em ${resolved}\n`);
}

main();
