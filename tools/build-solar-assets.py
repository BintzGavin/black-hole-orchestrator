"""Original seamless planetary maps, authored with Blender + NumPy.

Run from project root:
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/build-solar-assets.py

The 3D domain is sampled on the unit sphere. Longitude wraps exactly; there are
no polar pinches from planar noise. Colors are art directed for real-time PBR.
No external source images, network calls, user settings, or secrets are used.
"""
from pathlib import Path
import math
import subprocess
import bpy
import numpy as np

OUT = Path(__file__).resolve().parents[1] / 'client' / 'public' / 'assets' / 'solar'
OUT.mkdir(parents=True, exist_ok=True)
W, H = 2048, 1024
u = (np.arange(W, dtype=np.float32) + .5) / W * (2 * math.pi)
v = (np.arange(H, dtype=np.float32) + .5) / H * math.pi
x = np.sin(v[:, None]) * np.cos(u[None, :])
y = np.broadcast_to(np.cos(v[:, None]), (H, W)).copy()
z = np.sin(v[:, None]) * np.sin(u[None, :])
xyz = (x, y, z)

def fract(value):
    return value - np.floor(value)

def hash3(a, b, c, seed):
    return fract(np.sin(a * 127.1 + b * 311.7 + c * 74.7 + seed * 13.17) * 43758.5453)

def noise(a, b, c, seed=0):
    ia, ib, ic = np.floor(a), np.floor(b), np.floor(c)
    fa, fb, fc = a - ia, b - ib, c - ic
    fa, fb, fc = fa * fa * (3 - 2 * fa), fb * fb * (3 - 2 * fb), fc * fc * (3 - 2 * fc)
    value = np.zeros_like(a, dtype=np.float32)
    for i in range(2):
        for j in range(2):
            for k in range(2):
                weight = (fa if i else 1 - fa) * (fb if j else 1 - fb) * (fc if k else 1 - fc)
                value += weight * hash3(ia + i, ib + j, ic + k, seed)
    return value

def fbm(coords, scale=3, octaves=6, seed=0, gain=.5):
    a, b, c = coords
    value = np.zeros_like(a, dtype=np.float32)
    weight, total = 1., 0.
    for octave in range(octaves):
        value += weight * noise(a * scale + 12.5, b * scale - 4.3, c * scale + 8.7, seed + octave * 7)
        total += weight
        weight *= gain
        scale *= 2.03
    return value / total

def smooth(a, b, value):
    t = np.clip((value - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def ramp(value, stops):
    result = np.zeros((*value.shape, 3), dtype=np.float32)
    for channel in range(3):
        result[..., channel] = np.interp(value, [s[0] for s in stops], [s[1][channel] / 255 for s in stops])
    return result

def mix(a, b, weight):
    return a * (1 - weight[..., None]) + b * weight[..., None]

def save(name, pixels, gray=False):
    if gray:
        pixels = np.repeat(np.clip(pixels[..., None], 0, 1), 3, axis=2)
    h, w = pixels.shape[:2]
    rgba = np.ones((h, w, 4), dtype=np.float32)
    # Images store rows bottom-up; reverse the latitude order for normal UVs.
    rgba[..., :3] = np.clip(pixels[::-1], 0, 1)
    image = bpy.data.images.new(name, width=w, height=h, alpha=False, float_buffer=False)
    image.colorspace_settings.name = 'sRGB' if not gray else 'Non-Color'
    image.pixels.foreach_set(rgba.ravel())
    filepath = OUT / (name + '.png')
    image.filepath_raw = str(filepath)
    image.file_format = 'PNG'
    image.save()
    print('SOLAR_ASSET', name, w, h, flush=True)
    bpy.data.images.remove(image)
    if name.endswith('-color'):
        # Keep detailed albedo inexpensive to transfer; data maps stay lossless.
        subprocess.run(['/usr/bin/sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '92', str(filepath), '--out', str(OUT / (name + '.jpg'))], check=True, capture_output=True)
        filepath.unlink()

def crater_field(seed, count=90):
    rng = np.random.default_rng(seed)
    elevation = np.zeros_like(x)
    for _ in range(count):
        direction = rng.normal(size=3)
        direction /= np.linalg.norm(direction)
        radius = rng.uniform(.016, .14) ** 1.12
        # Angular distance approximated with chord lengths on the sphere.
        distance = np.sqrt(np.maximum(0, 2 - 2 * (x * direction[0] + y * direction[1] + z * direction[2]))) / radius
        basin = -.12 * np.exp(-np.square(distance / .76) * 2.4)
        rim = .045 * np.exp(-np.square((distance - 1.) / .12))
        center = .04 * np.exp(-np.square(distance / .12))
        elevation += basin + rim + center
    return elevation

print('SOLAR_ASSETS_BEGIN', flush=True)
# Domain warping breaks up any grid alignment in the geological features.
warp = fbm(xyz, 2.2, 4, 38) - .5
geo = (x + warp * .4, y + warp * .34, z - warp * .3)
fine = fbm(geo, 62, 4, 913)

terrain = fbm(geo, 4.5, 7, 81, .56)
craters = crater_field(29, 120)
cinder_height = np.clip(terrain + craters + (fine - .5) * .12, 0, 1)
cinder = ramp(cinder_height, [(0,(12,13,15)),(.3,(32,24,22)),(.43,(68,42,31)),(.53,(133,76,46)),(.62,(184,112,66)),(.75,(224,162,100)),(1,(246,192,139))])
# Lava appears in narrow connected faults instead of a global orange wash.
fault = np.abs(fbm(geo, 12, 4, 281) - .48)
lava = (1 - smooth(.002, .012, fault)) * smooth(.54, .66, terrain)
cinder = mix(cinder, np.broadcast_to(np.array([.95,.3,.045]), cinder.shape), lava * .75)
save('cinder-color', cinder)
save('cinder-height', cinder_height[::2,::2], True)
save('cinder-emission', np.stack([lava, lava * .2, lava * .009], axis=2)[::2,::2])
moon_color = ramp(cinder_height, [(0,(35,36,36)),(.32,(68,68,65)),(.45,(102,104,99)),(.58,(146,147,138)),(.74,(185,185,174)),(1,(216,216,207))])
save('moon-color', moon_color[::2,::2])
save('moon-height', cinder_height[::2,::2], True)

continent = fbm(geo, 2.5, 7, 234, .53)
land = smooth(.49, .51, continent)
relief = fbm(geo, 12, 5, 118)
ocean = ramp(continent, [(0,(3,15,31)),(.35,(5,31,56)),(.45,(7,56,75)),(.487,(18,99,104)),(.503,(61,151,133)),(1,(61,151,133))])
land_color = ramp(relief, [(0,(19,42,39)),(.36,(34,67,44)),(.45,(47,90,54)),(.55,(82,115,68)),(.62,(119,122,82)),(.74,(158,149,119)),(1,(210,211,195))])
coast = (1-smooth(.512,.525,continent)) * land
land_color = mix(land_color, np.broadcast_to(np.array([.58,.63,.42]), land_color.shape), coast * .75)
verdant = mix(ocean, land_color, land)
ice = smooth(.87,.965,np.abs(y) + (relief - .5) * .13)
verdant = mix(verdant,np.broadcast_to(np.array([.81,.9,.9]),verdant.shape),ice)
save('verdant-color', verdant)
save('verdant-height', (relief * land * .5 + .25)[::2,::2], True)
save('verdant-roughness', (.27 + land * .64 + ice * .07)[::2,::2], True)
# Sheared high-altitude cloud system with calm ocean openings.
angle = y * 2.4 + warp * 2.
cloud_coords = (x * np.cos(angle) - z * np.sin(angle), y * 1.6, x * np.sin(angle) + z * np.cos(angle))
cloud = fbm(cloud_coords, 5.8, 7, 426, .57)
cloud = smooth(.48,.68,cloud) * .92
save('verdant-clouds', cloud[::2,::2], True)

# Gold gas world: fine jet streams, warped belts, and an elliptical storm.
storm_lon, storm_lat = -.48, -.17
storm_lon_distance = np.arctan2(np.sin(u[None,:]-storm_lon), np.cos(u[None,:]-storm_lon))
storm_lat_distance = y-storm_lat
storm_radius = np.sqrt(np.square(storm_lon_distance / .29) + np.square(storm_lat_distance / .115))
storm_weight = 1-smooth(.45,1.35,storm_radius)
gas_warp = fbm((x * 1.6, y * 5.7, z * 1.6), 3.4, 6, 499, .57)
jet = y * 53 + (gas_warp - .5) * 6.5
bands = .46 + np.sin(jet) * .15 + np.sin(jet * .37 + 2) * .13 + (fine - .5) * .34
gold = ramp(bands, [(0,(93,67,45)),(.25,(143,101,62)),(.43,(181,141,91)),(.58,(207,178,121)),(.72,(232,210,166)),(.87,(245,230,198)),(1,(255,241,211))])
storm_ridges = .45 + np.sin(storm_radius * 28 + gas_warp * 5) * .12 + gas_warp * .2
storm_color = ramp(storm_ridges,[(0,(105,71,51)),(.4,(161,101,65)),(.65,(192,132,87)),(1,(238,187,135))])
gold = mix(gold,storm_color,storm_weight * .95)
save('aurelia-color',gold)

ice_terrain = fbm(geo, 4.2, 7, 749, .57)
crack_noise = fbm(geo, 16, 5, 416)
cracks = 1-smooth(.006,.025,np.abs(crack_noise - .5))
glacial = ramp(ice_terrain,[(0,(26,60,79)),(.32,(54,103,123)),(.45,(109,157,172)),(.54,(169,202,208)),(.65,(211,230,227)),(1,(242,247,236))])
glacial = mix(glacial,np.broadcast_to(np.array([.10,.3,.39]),glacial.shape),cracks * .47)
save('glacial-color',glacial)
save('glacial-height',np.clip(ice_terrain-cracks * .1,0,1)[::2,::2],True)

rust_terrain = fbm(geo, 3.7, 8, 864, .57)
rust_craters = crater_field(219, 90)
rust_relief = rust_terrain + rust_craters
strata = np.sin(rust_relief * 120 + fbm(geo, 7, 3, 111) * 5) * .021
rust = ramp(rust_relief + strata,[(0,(58,32,26)),(.25,(98,49,31)),(.4,(143,70,41)),(.51,(185,104,62)),(.61,(211,142,89)),(.75,(237,180,120)),(1,(248,213,165))])
polar = smooth(.91,.98,np.abs(y) + (fine-.5) * .07)
rust = mix(rust,np.broadcast_to(np.array([.89,.84,.72]),rust.shape),polar)
save('rust-color',rust)
save('rust-height',np.clip(rust_relief,0,1)[::2,::2],True)

neptune_warp = fbm((x,y*2,z), 5.8, 6, 419,.56)
blue_bands = .46 + np.sin(y * 40 + neptune_warp * 4.8) * .06 + (neptune_warp-.5) * .68
neptune = ramp(blue_bands,[(0,(12,22,68)),(.29,(15,38,108)),(.4,(24,65,146)),(.53,(38,103,171)),(.64,(84,156,193)),(1,(163,212,221))])
blue_storm_radius = np.sqrt(np.square(np.arctan2(np.sin(u[None,:]-1.9), np.cos(u[None,:]-1.9))/.17)+np.square((y+.32)/.071))
blue_storm = (1-smooth(.65,1.2,blue_storm_radius))
neptune = mix(neptune,np.broadcast_to(np.array([.018,.076,.23]),neptune.shape),blue_storm * .75)
thin_cloud = smooth(.71,.79,neptune_warp) * .5
neptune = mix(neptune,np.broadcast_to(np.array([.55,.78,.91]),neptune.shape),thin_cloud)
save('nereid-color',neptune)

# The radial ring profile contains wide particle belts, the Cassini division,
# and hundreds of fine concentric strand variations. Alpha is stored separately.
ring_w,ring_h=2048,16
r=np.linspace(0,1,ring_w,dtype=np.float32)
rng=np.random.default_rng(650)
strands=np.interp(r,np.linspace(0,1,640),rng.random(640))
ring_density=.35+.44*strands+.14*np.sin(r*570)+.08*np.sin(r*1260)
ring_density*=smooth(0,.018,r)*(1-smooth(.94,1,r))
ring_density*=1-smooth(.002,.01,.011-np.abs(r-.57))*.96
ring_density*=1-smooth(.001,.007,.007-np.abs(r-.84))*.8
ring_density*=.6+smooth(.10,.22,r)*.4
ring_colors=ramp(.25+strands*.5+np.sin(r*19)*.12,[(0,(80,69,54)),(.3,(123,108,79)),(.5,(179,160,122)),(.8,(222,205,165)),(1,(240,228,198))])
save('aurelia-rings',np.broadcast_to(ring_colors[None,:,:],(ring_h,ring_w,3)))
save('aurelia-ring-alpha',np.broadcast_to(np.clip(ring_density,0,1)[None,:],(ring_h,ring_w)),True)
print('SOLAR_ASSETS_COMPLETE',flush=True)
