# Research Lab

Generated products (soldiers, structures, vehicles) previewed in the demo menu's Research Lab before they are added
to the game.

- One folder per product: `research-lab/<id>/`, holding up to 6 pictures (the first is the large view).
- `products.json` lists them; edit only this file to add, hide or remove a product:

```json
{
  "products": [
    {
      "id": "m1a2-tank",
      "name": "M1A2 Abrams",
      "kind": "vehicle",
      "notes": "Draft, rendered 2026-11-05",
      "enabled": true,
      "images": ["front.png", "side.png", "top.png"]
    }
  ]
}
```

- `images` are file names inside the product's folder, shown in order (large view, then the 6 thumbnails).
- `enabled: false` hides a product from the page but keeps its folder, to bring it back later by setting it to true.
- Remove a product: delete its entry and its folder.
- Blender renders can go straight into a product folder:
  `blender -b -P tools/blender/building_render.py -- <model>` with the environment variable `LAB=<id>` set.
