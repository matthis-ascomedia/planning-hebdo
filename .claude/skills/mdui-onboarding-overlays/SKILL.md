---
name: "mdui-onboarding-overlays"
description: "Conçoit et génère des interfaces d'overlays (tutoriels guidés, suivi des lots de dev, journal de MAJ) intégrées au design system de l'application. À utiliser pour formaliser l'onboarding, les étapes de découverte ou les changelogs interactifs."
---

# UI Onboarding Overlays

Ce skill définit la méthode et la structure pour intégrer des interfaces superposées (overlays, popovers, tooltips) guidant l'utilisateur, tout en réutilisant les jetons de style (*tokens*) du design system.

## Cas d'usage

- **Phase de développement** : Visualisation des évolutions livrées par lot (badge de recette, surbrillance des nouveautés par lot).
- **Phase de déploiement** : Tutoriel interactif pas-à-pas (onboarding) lors du premier lancement ou d'une mise à jour majeure.
- **Phase de suivi** : Journal des mises à jour (*changelog*) pour consulter les patchs et relancer un guide.

## Principes UI / UX et Design System

1. **Tokens de style** : Réutilisation obligatoire des variables CSS et tokens de l'application (couleurs, ombres, élévation `z-index`, typographies).
2. **Ergonomie et accessibilité (a11y)** :
   - Capture du focus (*focus trap*) au sein du composant actif.
   - Fermeture via la touche `Échap` ou un clic sur l'arrière-plan.
   - Attributs ARIA stricts (`role="dialog"`, `aria-modal="true"`, `aria-describedby`).
3. **Ancrage dynamique** : Calcul du positionnement autour des éléments cibles avec repli (*fallback*) si l'élément touche le bord de l'écran.

## Modes de fonctionnement

### 1. Mode Développement (Suivi par lot)
- **Indicateurs visuels** : Surbrillance des composants modifiés ou ajoutés dans le lot sélectionné.
- **Panneau de contrôle** : Sélecteur de lot pour filtrer les évolutions et faciliter la recette UI.

### 2. Mode Déploiement (Tutoriel pas-à-pas)
- **Overlay avec masquage** : Arrière-plan semi-transparent (*backdrop*) percé d'un projecteur (*spotlight*) sur la zone cible.
- **Carte d'étape** : En-tête, description, progression (`Étape X / Y`), boutons *Précédent*, *Suivant*, et option *Passer*.
- **Persistance** : Sauvegarde de l'état d'avancement pour ne pas réafficher le tutoriel une fois terminé.

### 3. Journal des mises à jour (Changelog)
- **Composant dédié** : Panneau latéral (*drawer*) récapitulant les versions.
- **Classification** : Distinction entre mises à jour majeures, mineures et patchs.
- **Interactivité** : Bouton permettant de rejouer le tutoriel associé à une version majeure.

## Modèle de données recommandé

```json
{
  "tourId": "onboarding-v2",
  "steps": [
    {
      "id": "step-1",
      "targetSelector": "#main-nav",
      "title": "Nouvelle navigation",
      "content": "Découvre le menu restructuré pour accéder aux projets.",
      "placement": "bottom-start",
      "lot": "Lot 2.1"
    }
  ]
}