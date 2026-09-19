# Android release / Google Play

Este documento descreve o fluxo de publicação pública da L.I.V.I.A. no Google Play.

## 1. Criar a conta do Play Console

Use uma conta pessoal de desenvolvedor se a publicação for feita em nome próprio.

Requisitos atuais do Google Play:
- taxa de inscrição única de US$ 25;
- verificação de identidade;
- verificação de acesso a um dispositivo Android para novas contas pessoais;
- para contas pessoais criadas após 13/11/2023, teste fechado com pelo menos 12 testadores inscritos continuamente por 14 dias antes de solicitar acesso à produção.

## 2. Criar a upload key

No Windows, dentro do repositório:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create-android-upload-key.ps1
```

O arquivo padrão será criado fora do repositório:

```text
%USERPROFILE%\.livia\signing\livia-upload-key.jks
```

Use uma senha forte. Quando o `keytool` perguntar pela senha específica da chave do alias, pressione ENTER para usar a mesma senha do keystore. O workflow atual da L.I.V.I.A. usa a mesma senha para ambos.

Alias padrão:

```text
livia-upload
```

Faça pelo menos dois backups seguros do JKS.

## 3. Criar os GitHub Actions Secrets

Converta a upload key em Base64 e copie diretamente para o clipboard:

```powershell
[Convert]::ToBase64String(
  [IO.File]::ReadAllBytes("$HOME\.livia\signing\livia-upload-key.jks")
) | Set-Clipboard
```

No GitHub, abra:

```text
Settings > Secrets and variables > Actions
```

Crie:

- `ANDROID_KEY_BASE64`: Base64 copiado do JKS;
- `ANDROID_KEY_ALIAS`: `livia-upload`;
- `ANDROID_KEY_PASSWORD`: senha usada no keytool.

Nunca publique o JKS, a senha ou o Base64 em commit, issue, pull request ou chat.

## 4. Gerar os artefatos públicos

Execute manualmente o workflow:

```text
Android public release artifacts
```

O workflow:
- materializa o JKS somente no runner;
- valida alias e senha com `keytool`;
- gera AAB release para as ABIs suportadas;
- gera APK release auxiliar;
- valida o AAB com `jarsigner`;
- valida o APK com `apksigner`;
- publica checksums SHA-256 como artefatos do workflow.

## 5. Primeiro upload no Play Console

Crie o app no Play Console e faça o primeiro upload manual do AAB.

Identificador esperado:

```text
com.tombemol.livia
```

Para app novo, o Google Play App Signing é configurado no processo de publicação e a upload key fica separada da chave usada pelo Google para distribuir APKs aos usuários.

Política de privacidade pública:

```text
https://tombemol.github.io/L.I.V.I.A/privacy.html
```

Site:

```text
https://tombemol.github.io/L.I.V.I.A/
```

## 6. Teste fechado

Se a conta for pessoal e nova, mantenha pelo menos 12 testadores inscritos continuamente por 14 dias antes de pedir acesso à produção.

Use o teste interno primeiro se quiser validar instalação rapidamente. Depois configure o teste fechado e mantenha os testadores inscritos durante todo o período.

## 7. Produção

Depois do período de teste:
- solicite acesso à produção no Play Console;
- responda às perguntas sobre o teste e prontidão do app;
- somente depois faça o bump/publicação da v1.1.0 pública.
