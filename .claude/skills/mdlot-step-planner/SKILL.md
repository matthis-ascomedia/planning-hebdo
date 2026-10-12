---
name: "mdlot-step-planner"
description: "S'active à la fin de chaque étape d'un lot. Génère le tableau récapitulatif des étapes restantes pour compléter le lot, avec estimations de complexité, temps, coût et le modèle d'IA recommandé."
---

# Lot Step Planner

Ce skill intervient à la fin de chaque étape d'un lot pour planifier les tâches restantes et optimiser l'utilisation des modèles d'IA.

## Quand l'utiliser

- À la fin de la réalisation d'une étape au sein d'un lot.
- Lorsque l'utilisateur confirme la fin d'une sous-tâche ou demande les étapes suivantes du lot.

## Consignes d'exécution

À chaque cloture d'étape, générer un tableau structuré contenant les colonnes suivantes :

1. **Étape suivante** : description synthétique du travail restant.
2. **Complexité** : niveau de difficulté (Faible, Moyenne, Élevée).
3. **Temps / Coût** : durée estimée et coût relatif (ex. 2 h / $).
4. **Modèle recommandé** : type de modèle d'IA le plus adapté ou action humaine requise.

## Structure du tableau de sortie

| Étape suivante | Complexité | Temps / Coût | Modèle recommandé |
| :--- | :--- | :--- | :--- |
| Intégration du composant graphique | Moyenne | 3 h / $ | Modèle standard |
| Validation des accès API et sécurité | Élevée | 1 j / $$ | Modèle à fort raisonnement |
| Recette utilisateur et ajustements UI | Faible | 2 h / $ | Revue humaine + Modèle vision |

## Grille d'orientation des modèles

- **Code standard / Génération simple** : modèles rapides et économiques.
- **Architecture / Logique complexe** : modèles à fort raisonnement.
- **Design / Interfaces / Recette visuelle** : modèles multimodaux ou validation humaine.

## Pièges à éviter

- Réaliser un découpage trop fin : regrouper les sous-tâches secondaires sous une même étape.
- Proposer des modèles surdimensionnés pour des tâches d'exécution basiques.