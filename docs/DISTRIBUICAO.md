# Distribuição do Codificando

Este documento cobre o caminho completo de uma versão: gerar o build, assinar,
notarizar, publicar no GitHub Releases e entregar a atualização pelo
`tauri-plugin-updater`. Nenhum segredo fica no repositório — tudo vem do
ambiente local ou dos *secrets* do GitHub Actions.

## Visão geral

```
tag v0.2.2  →  .github/workflows/release.yml
                 ├─ macOS: .app/.dmg assinados com Developer ID + notarizados
                 ├─ Windows: instaladores .msi/.exe
                 ├─ (se houver chave do updater) .tar.gz + .sig + latest.json
                 └─ anexa tudo ao release da tag
                        ↓
        app instalado consulta .../releases/latest/download/latest.json
                        ↓
        usuário confirma → download → verificação da assinatura → instala
```

O app é 100% local: a verificação de atualização só acontece quando o usuário
clica em **Configurações → Verificar atualizações**. Sem internet, ele continua
funcionando normalmente com os dados em
`~/Library/Application Support/Investigando`.

## 1. Credenciais da Apple (necessárias para assinar e notarizar)

Você precisa de uma conta no **Apple Developer Program** (paga) e de:

| Item | Onde obter |
| --- | --- |
| Certificado **Developer ID Application** | developer.apple.com → Certificates, Identifiers & Profiles |
| **Team ID** (10 caracteres) | developer.apple.com → Membership |
| **Senha de app** (app-specific password) | appleid.apple.com → Segurança → Senhas de app |

### Criar o certificado Developer ID

1. No Mac, abra **Acesso às Chaves** → menu **Acesso às Chaves** →
   **Assistente de Certificado** → **Solicitar um certificado de uma
   autoridade de certificação**. Informe o e-mail, escolha **Salvar no disco**
   e guarde o `.certSigningRequest`.
2. Em developer.apple.com → **Certificates** → **+** → **Developer ID
   Application** → envie o `.certSigningRequest`.
3. Baixe o `.cer`, dê dois cliques para instalar no chaveiro (categoria
   *Meus Certificados*) e confirme que a chave privada veio junto.
4. Confira no terminal:

```bash
security find-identity -v -p codesigning
# deve listar: "Developer ID Application: Seu Nome (TEAMID)"
```

### Exportar para o CI

No Acesso às Chaves, exporte o certificado **e a chave privada** como `.p12`
com uma senha forte, e gere o base64 que vai virar secret:

```bash
base64 -i DeveloperID.p12 | pbcopy
```

## 2. Assinar e notarizar

O script `scripts/sign-notarize.sh` assina com `codesign` (hardened runtime +
timestamp), envia para `xcrun notarytool` e grampeia o ticket com `stapler`.

```bash
export APPLE_ID="seu@email.com"
export APPLE_TEAM_ID="ABCDE12345"
export APPLE_APP_PASSWORD="abcd-efgh-ijkl-mnop"   # senha de app, não a do iCloud

# depois de npm run tauri build:
scripts/sign-notarize.sh src-tauri/target/release/bundle/macos/Codificando.app
```

O script:

- falha com mensagem clara se `APPLE_ID`, `APPLE_TEAM_ID` ou
  `APPLE_APP_PASSWORD` não estiverem definidos;
- usa `APPLE_SIGNING_IDENTITY` se você quiser escolher a identidade; caso
  contrário, pega o primeiro *Developer ID Application* do chaveiro;
- assina binários internos, frameworks e o bundle, nessa ordem;
- envia um `.zip` do `.app` para notarização e grampeia o ticket no `.app`;
- se receber um `.dmg`, assina, notariza e grampeia o próprio DMG.

Verificação final:

```bash
codesign --verify --deep --strict --verbose=2 Codificando.app
spctl --assess --type execute --verbose=2 Codificando.app
```

Notas:

- A notarização pode levar de minutos a algumas horas. O `--wait` do
  `notarytool` acompanha até o fim.
- `tauri build` também sabe assinar/notarizar sozinho quando encontra
  `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
  `APPLE_ID`, `APPLE_PASSWORD` e `APPLE_TEAM_ID` no ambiente (é o que o
  workflow de release usa). O script fica como caminho manual e reproduzível.
- Para builds locais de teste, o app roda sem notarização — só não abra em
  outro Mac sem antes notarizar.

## 3. Gerar o DMG

```bash
npm start                                # .app local, sem artefatos do updater
npm run tauri build                      # com a chave do updater no ambiente
# apenas o DMG:
npm run tauri build -- --bundles dmg
```

Como `bundle.createUpdaterArtifacts` está `true`, o build tenta assinar os
artefatos do updater. Sem `TAURI_SIGNING_PRIVATE_KEY` ele termina com erro
*"A public key has been found, but no private key"* depois de gerar o `.app`.
Para builds locais, desligue os artefatos com o arquivo de configuração
`src-tauri/tauri.ci.conf.json` (o `npm start` já usa):

```bash
npx tauri build --config src-tauri/tauri.ci.conf.json
```

Saída: `src-tauri/target/release/bundle/dmg/Codificando_<versão>_<arch>.dmg`.

Para publicar, o DMG precisa conter o `.app` já assinado. O caminho mais
simples é assinar o `.app` antes de empacotar — o workflow de release faz isso
automaticamente quando os segredos existem. Manualmente, rode o script no
`.dmg` final (ele assina, notariza e grampeia o DMG inteiro).

## 4. Chave do updater (assinatura das atualizações)

O updater usa um par de chaves **minisign**, independente do certificado Apple.
A chave privada assina os artefatos; a pública fica embutida no app e é a única
coisa que ele aceita.

```bash
npx tauri signer generate -w ~/.tauri/codificando.key
```

O comando pede uma senha (opcional, mas recomendada) e imprime a **chave
pública**. Cole-a em `src-tauri/tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "pubkey": "RW...chave-publica-gerada...",
    "endpoints": [
      "https://github.com/SEU_USUARIO/codificando/releases/latest/download/latest.json"
    ]
  }
}
```

Troque `SEU_USUARIO` pelo usuário/organização real do GitHub. O
`bundle.createUpdaterArtifacts` já está `true`, então o build gera
`Codificando.app.tar.gz` + `.sig` (macOS) e os `.sig` dos instaladores
(Windows), além do `latest.json`.

No CI, configure:

| Secret | Conteúdo |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | conteúdo do `~/.tauri/codificando.key` **ou** caminho do arquivo |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | senha da chave (vazio se não houver) |
| `APPLE_CERTIFICATE` | `.p12` em base64 |
| `APPLE_CERTIFICATE_PASSWORD` | senha do `.p12` |
| `APPLE_SIGNING_IDENTITY` | ex.: `Developer ID Application: Seu Nome (TEAMID)` |
| `APPLE_ID` | e-mail da conta Apple |
| `APPLE_PASSWORD` | senha de app (usada pelo `tauri build`) |
| `APPLE_TEAM_ID` | Team ID |

Sem `TAURI_SIGNING_PRIVATE_KEY` o workflow ainda compila e publica os
instaladores, mas **sem** atualização automática (o `latest.json` não é gerado).

Nunca faça commit da chave privada. Ela fica fora do repositório
(`~/.tauri/codificando.key`) e apenas nos *secrets* do GitHub.

### Como a atualização chega ao usuário

1. Suba a versão em `src-tauri/tauri.conf.json` (é ela que o updater compara).
2. Crie a tag e envie: `git tag v0.2.2 && git push origin v0.2.2`.
3. O workflow cria um release em rascunho com os artefatos. Revise e publique.
4. O endpoint `/releases/latest/download/latest.json` passa a apontar para a
   nova versão (rascunhos e pré-releases são ignorados pelo GitHub).
5. No app, **Configurações → Verificar atualizações** mostra a versão nova,
   as notas e os botões *Baixar e instalar* / *Agora não*. Só baixa depois do
   clique; depois de instalar, o app pede para reiniciar.

Se a chave do updater for rotacionada, os usuários da versão antiga precisam
instalar manualmente uma versão nova (a chave antiga não valida a assinatura
nova).

## 5. Instalação local segura

Para testar o build antes de publicar:

```bash
scripts/install-local.sh
# ou com um bundle específico:
scripts/install-local.sh src-tauri/target/release/bundle/macos/Codificando.app
```

O script:

1. verifica se o Codificando está aberto e pede para fechar (pode encerrar por
   você com confirmação);
2. move o app atual de `/Applications/Codificando.app` para
   `/Applications/Codificando-Swift.app`; se esse nome já existir, usa
   `/Applications/Codificando-Swift-AAAAMMDD-HHMMSS.app`;
3. copia o build novo com `ditto` e abre o app.

Para voltar atrás, arraste o app preservado de volta para `/Applications` ou
abra-o direto do nome de reserva.

## 6. Release pelo GitHub Actions

`.github/workflows/release.yml` roda em tags `v*` e tem dois jobs:

- **macOS**: build `aarch64-apple-darwin`, assinatura/notarização (se os
  segredos Apple existirem) e artefatos do updater.
- **Windows**: instaladores `.msi`/`.exe` e assinatura do updater.

Sem nenhum segredo, os dois jobs ainda geram os instaladores sem assinatura,
para validação. O `ci.yml` continua rodando em `main` e em pull requests e
desativa os artefatos do updater (não há chave ali).

Checklist antes da tag:

- [ ] `npm test` e `npm run build` passam
- [ ] `cd src-tauri && cargo check` passa
- [ ] versão atualizada em `src-tauri/tauri.conf.json`
- [ ] `pubkey` e `endpoints` conferem com o repositório real
- [ ] app testado localmente com `scripts/install-local.sh`
- [ ] segredos Apple e do updater configurados (se a versão for assinada)
