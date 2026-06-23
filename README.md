# Topo-Rando PWA — CimeEnvie ASBL

Coquille PWA qui affiche les topo-guides au format JSON, hors-ligne, sur téléphone.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `index.html` | Page d'entrée minimale |
| `app.js` | Toute la logique (rendu, IndexedDB, navigation) |
| `styles.css` | Mise en forme (palette papier / vert sapin) |
| `manifest.webmanifest` | Déclaration PWA (nom, icônes, mode standalone) |
| `service-worker.js` | Cache hors-ligne de la coquille |
| `icon-192.png` | Icône installation (192×192) |
| `icon-512.png` | Icône installation (512×512) |
| `icon-512-maskable.png` | Icône adaptable Android |

## Test rapide en local (PC)

Ouvrir un terminal dans ce dossier et lancer :

```
python3 -m http.server 8000
```

Puis ouvrir `http://localhost:8000` dans Chrome. **Important :** ouvrir directement le fichier `index.html` ne marchera PAS (le service worker exige HTTPS ou localhost).

## Déploiement public (GitHub Pages)

Voir le guide pas-à-pas qui sera livré séparément. En résumé :
1. Créer un dépôt GitHub public
2. Uploader tous les fichiers de ce dossier
3. Activer GitHub Pages dans les paramètres du dépôt
4. Récupérer l'URL `https://<username>.github.io/<repo>/`
5. Ouvrir cette URL sur le téléphone → menu → « Installer l'application »

## Format des fichiers de parcours (JSON)

Un parcours est un fichier `.json` au format suivant :

```json
{
  "version": 1,
  "id": "anhee-molignee",
  "titre": "Anhée & la vallée de la Molignée",
  "sous_titre": "Vallées de la Meuse et de la Molignée — Namur",
  "date_generation": "2026-05-28",
  "auteur": "CimeEnvie ASBL",
  "pois": [
    {
      "num": "01",
      "titre": "Anhée, le départ",
      "accroche": "Carrefour d'eau.",
      "puces": [
        { "amorce": "Le site", "texte": "Texte avec *italique* et renvoi [POI 03]." }
      ]
    }
  ]
}
```

### Conventions de texte dans les puces

- `*mot*` → italique
- `⚠️ à vérifier` → badge d'avertissement
- `[POI 03]` → lien cliquable vers le POI 03 du même parcours

## Mise à jour de la coquille

Pour corriger un bug ou améliorer l'app : modifier les fichiers, **incrémenter `CACHE_NAME`** dans `service-worker.js` (par ex. `topo-rando-v2`), repousser sur GitHub. La PWA installée récupérera la nouvelle version au prochain lancement en ligne.
