# ロゴ・背景の牌修正（2026-11-01）

組み込みのimage_genで既存画像を編集し、SharpでWebPへ形式変換しました。アプリから参照する保存先は次の2点です。

- `src/assets/janroku-logo.webp`：左の牌を鳥の図柄の一索へ。透過を保持、WebP品質92・アルファ品質100。
- `src/assets/mahjong-background.webp`：發・中の右にある牌を無地の白へ。WebP品質90。

## ロゴの最終編集指示

```text
Use case: precise-object-edit. Edit target: the attached existing transparent JANROKU logo. Make ONE localized change ONLY: replace the bamboo-stalk motif on the ivory mahjong tile at the far left with the traditional Japanese mahjong ONE BAMBOO (一索 / イーソー) motif, a single elegant green bird/peacock with a small red accent, in the same engraved dark emerald and gold style. The one-bamboo tile MUST depict ONE BIRD, NOT bamboo stalks, NOT three bamboo, NOT multiple birds. Keep the tile shape, angle, ivory face, gold edging, emerald sides, ornamental gold swirls, and all Japanese '雀録' lettering and Latin 'JANROKU' lettering unchanged in design and layout. Preserve the wide 3:1 composition, original generous bounds and high resolution. Keep actual alpha transparency around the artwork and inside letter openings. Clean transparent edges without colored fringe. Do not add background, captions, extra tiles or text.
```

## 背景の最終編集指示

```text
Use case: precise-object-edit. Edit target: the attached 3:1 dark green and gold mahjong banner background. Make one strictly localized modification: the RIGHTMOST upright ivory tile, to the RIGHT of both the green 發 tile and red 中 tile, currently has green bamboo symbols on its front. Remove ALL green bamboo engraving from ONLY that rightmost tile so it becomes a Japanese WHITE DRAGON tile (白 / ハク): a completely BLANK, plain smooth ivory white face with absolutely NO symbol, NO letter, NO dot, NO colored border marking on the face. Preserve that tile's exact shape, perspective, green sides, gold physical edge trim, lighting and shadow. Keep the green 發 tile and red 中 tile unchanged. Preserve the original background felt, gold waves, gold cloud lines, gold circular ornament and foliage, and all original composition and crop, at original wide 3:1 resolution. The left two-thirds must remain open dark green space, no logo and no new text. Change only the rightmost tile face, not any other tile or the scene.
```
