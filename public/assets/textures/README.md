# Texturen

Quelle: **Poly Haven** (https://polyhaven.com), Lizenz **CC0 1.0** – gemeinfrei,
auch kommerziell, ohne Namensnennung.

Aus dem 1k-JPG-Satz übernommen und auf 512 (Rauheit 256) verkleinert und neu
komprimiert; aus 11 MB wurden so 417 KB.

| Ordner | Poly-Haven-Name | Verwendung |
|---|---|---|
| `container_side/`    | container_side    | Container, Strukturen |
| `rust_coarse_01/`    | rust_coarse_01    | Blech: Dächer, Rampen, Zaun, Fässer, Panzer |
| `asphalt_03/`        | asphalt_03        | Arenaplatte (Normale und Rauheit über die bemalte Karte) |
| `concrete_floor_02/` | concrete_floor_02 | Sandsäcke, Mauerreste |
| `brown_planks_05/`   | brown_planks_05   | Kisten, Paletten, Kartons |
| `leafy_grass/`       | leafy_grass       | Boden außerhalb der Arena |

Je Satz `diff.jpg` (Basisfarbe), `nor.jpg` (Normale, OpenGL) und `rough.jpg`
(Rauheit). Weitere Sätze: Name in `TEXTURE_SETS` in `src/surface.js` eintragen
und die drei Karten unter gleichem Ordnernamen ablegen.
