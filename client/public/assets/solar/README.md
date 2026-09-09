# Original solar-world assets

These maps were generated locally with Blender 5.2 and NumPy specifically for this project. They use original, deterministic spherical fractal terrain, crater fields, atmospheric jet streams, continents, ice fractures, lava faults, and radial ring density. No external source images, stock textures, network requests, or generative-image services are used.

Regenerate from the repository root on macOS:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/build-solar-assets.py
```

The generator starts a fresh Blender scene and writes only these generated assets. It requires Blender's bundled NumPy and the macOS `sips` image utility. Surface albedo is 2048 × 1024 JPEG at quality 92; moon albedo is 1024 × 512. Terrain, roughness, cloud, emission, and ring-density data remain lossless PNG. Surfaces sample the 3D unit sphere, keeping longitude seams continuous and polar detail coherent.

`client/src/components/solar/planet-assets.ts` supplies the true sphere meshes, terrain relief, physically lit materials, atmospheric limbs, drifting cloud shell, three orbiting moons, and the ringed giant's geometric eclipse. The six styles are reusable templates for arbitrary real orchestration roles. Clone each template with `mesh.clone(true)` to share its assets, place and scale it from role data, and call `animatePlanet(clone, dt)` to animate the clone. Descendants carry `planetStyleId` and `planetStyleName` only; the parent renderer supplies role identity and inspection behavior. Ring eclipses account for the clone's world scale. Dispose the asset library after all clones are removed.
