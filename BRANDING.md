# NGACCUL Branding & Logo Usage

This document outlines the usage and replacement procedures for corporate branding assets in the NGACCUL Savings & Credit Platform.

## Branding Source of Truth
The primary brand asset is:
* **Path:** `/public/branding/logo.svg`

## Logo Visual Composition
The circular emblem is designed to reflect the core savings-cooperative mission of NGACCUL:
* **Background Field:** Light violet / lavender ring tinted background (`#F3EEF9`).
* **Outer Circle Border:** Deep violet (`#4B2D7F`) matching the primary brand color.
* **Central Globe:** A crisp, classic vector grid-sphere outline representing global scope and connected communities.
* **Family Silhouette:** Two adults and two children standing centered in front of the globe, signifying security and families supported.
* **Cupped Hands:** Deep violet cupped hands supporting the family and globe from below, signifying the union protecting and lifting member assets.
* **Wordmark:** Bold, wide-tracked "NGACCUL" below.

## Replacement Procedure
1. The currently provided `public/branding/logo.svg` is an **interim vector recreation** drafted for simulation and high-fidelity previewing since the client's final corporate artwork sig-off is pending.
2. Once the final approved branding vector assets are delivered:
    * Save the final vector artwork file named exactly `logo.svg`.
    * Replace the file located at `public/branding/logo.svg`.
3. Because all modules, portals, login screens, letterheads, and PWA manifest assets across both Client and Admin interfaces reference this single absolute path, **no code changes or inline adjustments are necessary to deploy the official logo.**

## Color Contrast & Palettes
All component and text palettes across the applications extend these validated corporate tones:
* **Brand Primary:** `#4B2D7F` (Deep Violet)
* **Brand Secondary:** `#C8B8E8` (Lavender Accent)
* **Brand Surface:** `#F3EEF9` (Light Violet Tint)
* **Brand Accent:** `#7C4DCC` (Medium Violet)
* **Success Indicator:** `#1A7A4A` (Forest Green)
* **Warning Indicator:** `#C97A10` (Harvest Amber)
* **Error Indicator:** `#B42318` (Crimson Red)
