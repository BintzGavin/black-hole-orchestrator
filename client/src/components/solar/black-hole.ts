import * as THREE from "three";

/** Curved null-ray approximation: real camera rays cross a three-dimensional
 * emitting disk. This is an artistic Schwarzschild-inspired integrator, not a
 * scientific metric solver. All coordinates below are in horizon radii. */
export function createSolarBlackHole() {
  const radius = 13;
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: true,
    uniforms: {
      uTime: { value: 0 },
      uEye: { value: new THREE.Vector3() },
      uRadius: { value: radius },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vWorld;
      uniform vec3 uEye;
      uniform float uTime;
      uniform float uRadius;
      float hash(vec3 p) {
        p = fract(p * .1031); p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float noise(vec3 p) {
        vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      vec4 disk(vec3 p, vec3 rd) {
        float r=length(p.xz);
        float inner=smoothstep(1.52,1.82,r);
        float outer=1.-smoothstep(4.7,6.1,r);
        float a=atan(p.z,p.x);
        float rotation=uTime*.13/pow(max(r,1.),1.5);
        vec3 q=vec3(cos(a-rotation),sin(a-rotation),r*.85);
        float n=noise(q*9. + vec3(0,0,r*2.));
        n+=noise(q*23.)*.42;
        float bands=.64+.36*sin(r*74.+n*8.);
        float swirl=.62+.38*sin(a*11.-r*7.+n*5.-rotation*8.);
        float density=(.24+n*.66)*bands*swirl;
        float heat=pow(1.7/max(r,1.7),1.9);
        float doppler=clamp(1.+dot(normalize(vec3(-p.z,0,p.x)), -rd)*.48,.5,1.55);
        vec3 hot=mix(vec3(1.,.21,.035),vec3(1.,.76,.38),pow(heat,.6));
        hot=mix(hot,vec3(.82,.91,1.),pow(heat,4.)*.3);
        float alpha=inner*outer*density;
        return vec4(hot*(1.7+heat*6.)*pow(doppler,2.),alpha);
      }
      void main() {
        vec3 ro=uEye/uRadius;
        vec3 rd=normalize(vWorld-uEye);
        float b=dot(ro,rd), c=dot(ro,ro)-49.;
        float discriminant=b*b-c;
        if(discriminant<0.) discard;
        float nearT=max(0.,-b-sqrt(discriminant));
        vec3 p=ro+rd*nearT;
        vec3 light=vec3(0.);
        float trans=1.;
        float minR=10.;
        for(int i=0;i<110;i++) {
          float r=length(p);
          minR=min(minR,r);
          if(r<1.02) {trans=0.;break;}
          if(r>7.05) break;
          float stepSize=clamp(r*.095,.052,.48);
          float h2=dot(cross(p,rd),cross(p,rd));
          vec3 acceleration=-1.5*h2*p/pow(r,5.);
          vec3 nextDirection=normalize(rd+acceleration*stepSize);
          vec3 next=p+nextDirection*stepSize;
          if(p.y*next.y<0. || (abs(p.y)<.045 && abs(next.y-p.y)<.015)) {
            float crossing=abs(p.y-next.y)>.001 ? clamp(p.y/(p.y-next.y),0.,1.) : .5;
            vec3 hit=mix(p,next,crossing);
            vec4 emission=disk(hit,nextDirection);
            float opacity=emission.a*.88;
            light+=trans*emission.rgb*opacity;
            trans*=1.-opacity;
          }
          // Thin volumetric corona supplies soft heat around the disk.
          float radial=length(p.xz);
          float haze=exp(-abs(p.y)*12.)*exp(-abs(radial-2.4)*1.2)*stepSize*.035;
          light+=trans*vec3(1.,.3,.065)*haze;
          p=next;rd=nextDirection;
        }
        float photon=exp(-abs(minR-1.5)*22.);
        light+=vec3(1.,.63,.27)*photon*.12;
        float alpha=clamp(1.-trans+dot(light,vec3(.21,.71,.08))*.075,0.,1.);
        if(alpha<.002) discard;
        gl_FragColor=vec4(light/max(alpha,.01),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 14, radius * 14),
    material,
  );
  mesh.name = "Curved-light accretion disk";
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return {
    mesh,
    update(camera: THREE.Camera, time: number) {
      mesh.quaternion.copy(camera.quaternion);
      material.uniforms.uEye!.value.copy(camera.position);
      material.uniforms.uTime!.value = time;
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
