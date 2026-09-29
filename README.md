# Latch

Interface locale (français) pour composer des scripts **bash** `pass-cli` à partir de l’arbre d’aide officiel. Latch ne lit pas les coffres, PAT, items ni secrets.

**Chemin d’installation documenté :** `~/dev/h4ll4y/latch`

## Sécurité

- Latch n’exécute **jamais** `sudo` et refuse les scripts qui contiennent `sudo`.
- Dans l’UI et le serveur de dev, les appels `pass-cli` autorisés sont **`--version`**, **`--help`** (parcours du mapping), et éventuellement **`update --yes`** si le mapping documente `--yes` (désactivable avec `LATCH_ALLOW_PASS_CLI_UPDATE=0`).
- Les scripts générés s’exécutent **dans votre terminal** ; les listes en mode « auto » ne renvoient rien à Latch.

## Prérequis

- Node.js 20+
- `pass-cli` sur le `PATH` (optionnel pour l’UI : le dernier mapping embarqué est conservé)

## Installation

```bash
cd ~/dev/h4ll4y/latch
npm ci
npm run dev
```

Ouvrir [http://127.0.0.1:4317](http://127.0.0.1:4317).

## Actualiser le mapping (arbre d’aide)

Le fichier `src/data/help-mapping.json` est produit en parcourant `pass-cli --help` sur chaque menu (sous-commande `help` ignorée).

**En ligne de commande :**

```bash
# binaire par défaut : pass-cli sur le PATH
npm run walk-help

# ou binaire explicite
PASS_CLI_BIN=/chemin/vers/pass-cli npm run walk-help
```

**Dans l’UI (serveur de dev) :** bouton **Actualiser le mapping (help)** — relance le parcours si `pass-cli` est disponible, puis recharge l’interface.

Si `pass-cli` est absent, Latch garde le mapping embarqué et l’indique dans l’en-tête.

## Build

```bash
npm run build
npm run preview
```

## npm

Supply-chain : `.npmrc` (`ignore-scripts=true`, `min-release-age=7`). Préférer `npm ci`.

## macOS trousseau (-25308)

Ne lancez jamais `pass-cli` avec `sudo`. Latch ne propose pas d’élévation.
