import * as THREE from "three";

export function createSolarSky() {
  const group = new THREE.Group();
  group.name = "Deep-field stars and interstellar dust";
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(3800, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vDirection; void main(){ vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
      varying vec3 vDirection;
      float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      float fbm(vec3 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=noise(p)*a;p=p*2.03+7.1;a*=.48;}return n;}
      void main(){
        vec3 d=normalize(vDirection);
        float band=dot(d,normalize(vec3(.38,.82,-.43)));
        float n=fbm(d*4.+13.);
        float cloud=fbm(d*12.+n*3.);
        float galaxy=exp(-pow((band+(n-.45)*.28)*4.7,2.));
        float dust=pow(fbm(d*22.+3.),2.)*2.4;
        vec3 color=vec3(.0018,.0032,.006);
        color+=mix(vec3(.026,.032,.049),vec3(.083,.061,.038),cloud)*galaxy*(.18+cloud*.8);
        color*=1.-clamp(dust*galaxy,0.,.84);
        color+=vec3(.009,.02,.031)*pow(n,3.);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
  );
  group.add(sky);
  let seed = 8184;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const count = 9500;
  const positions = new Float32Array(count * 3),
    colors = new Float32Array(count * 3),
    sizes = new Float32Array(count);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const y = random() * 2 - 1,
      a = random() * Math.PI * 2,
      r = 1800 + random() * 1600;
    const s = Math.sqrt(1 - y * y);
    positions.set([Math.cos(a) * s * r, y * r, Math.sin(a) * s * r], i * 3);
    const warm = random();
    color.set(warm > 0.8 ? 0xffcc96 : warm > 0.3 ? 0xc4d7e7 : 0x81a5d5);
    color.multiplyScalar(0.15 + Math.pow(random(), 5) * 2.1);
    colors.set([color.r, color.g, color.b], i * 3);
    sizes[i] = random() > 0.992 ? 3.8 : 0.8 + random() * 1.1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    uniforms: { uDpr: { value: 1 } },
    vertexShader: `attribute float aSize;uniform float uDpr;varying vec3 vColor;void main(){vColor=color;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=aSize*uDpr;}`,
    fragmentShader: `varying vec3 vColor;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float glow=exp(-r*r*4.);gl_FragColor=vec4(vColor,glow);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n}`,
  });
  group.add(new THREE.Points(geometry, material));
  return {
    group,
    material,
    dispose() {
      sky.geometry.dispose();
      sky.material.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
