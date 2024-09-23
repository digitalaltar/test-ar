  import * as THREE from 'three';
  import { MindARThree } from 'mindar-image-three';
  import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
  import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
  import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

  // Custom Chromatic Aberration Shader
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.02 },
    glitchAmount: { value: 0.0 },
    time: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float glitchAmount;
    uniform float time;
    varying vec2 vUv;

    float random(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 redOffset = amount * vec2(sin(time * 2.0), cos(time * 2.0));
      vec2 greenOffset = amount * vec2(sin(time + 2.0), cos(time + 2.0));
      vec2 blueOffset = amount * vec2(sin(time + 4.0), cos(time + 4.0));

      // Simple glitch effect, random displacement of fragments
      vec2 glitchOffset = vec2(0.0);
      if (random(vUv + time) < glitchAmount) {
        glitchOffset = vec2(random(vUv) * 0.05, random(vUv) * 0.05); // Displacement
      }

      vec4 cr = texture2D(tDiffuse, vUv + redOffset + glitchOffset);
      vec4 cg = texture2D(tDiffuse, vUv + glitchOffset);
      vec4 cb = texture2D(tDiffuse, vUv - blueOffset + glitchOffset);

      gl_FragColor = vec4(cr.r, cg.g, cb.b, cg.a);
    }
  `
};

  // Custom Glow Shader
const GlowShader = {
  uniforms: {
    tDiffuse: { value: null },
    glowIntensity: { value: 1.0 },
    glitchAmount: { value: 0 }, // Glitch intensity
    time: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float glowIntensity;
    uniform float glitchAmount;
    uniform float time;
    varying vec2 vUv;

    float random(vec2 co){
      return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Controlled glitch: Hide only small parts of the image
      if (random(vUv + time) < glitchAmount) {
        color.rgb *= 0.5; // Make glitch darker for better visibility
      }

      vec3 glow = color.rgb * glowIntensity;
      gl_FragColor = vec4(glow, color.a);
    }
  `
};


  // Custom Fragmented Shader (Glitch)
  const GlitchShader = {
    uniforms: {
      tDiffuse: { value: null },
      time: { value: 0 },
      glitchAmount: { value: 0.1 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float glitchAmount;
      uniform float time;
      varying vec2 vUv;

      float rand(vec2 co) {
        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        vec2 uv = vUv;

        float glitchEffect = rand(uv + time) * glitchAmount;
        if (glitchEffect < 0.3) {
          discard;
        }

        vec4 color = texture2D(tDiffuse, uv);
        gl_FragColor = color;
      }
    `
  };

  function createVideoPlane(videoSrc, videoWidth, videoHeight, opacity) {
    const video = document.createElement('video');
    video.src = videoSrc;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.load();

    video.addEventListener('canplay', () => {
      video.play();
    });

    const texture = new THREE.VideoTexture(video);
    const aspectRatio = videoWidth / videoHeight;
    const planeWidth = 1;
    const planeHeight = planeWidth / aspectRatio;

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: opacity
    });

    return { plane: new THREE.Mesh(geometry, material), video };
  }

  fetch('media.json')
    .then(response => response.json())
    .then(jsonData => {
      const mindFile = jsonData.mindFile;
      const videoRoot = jsonData.videoRoot;
      const mediaData = jsonData.media;

      const mindarThree = new MindARThree({
        container: document.querySelector("#mindar-container"),
        imageTargetSrc: mindFile
      });

      mindarThree.start().then(() => {
        const { renderer, scene, camera } = mindarThree;
        renderer.setClearColor(0x000000, 0);

        const ambientLight = new THREE.AmbientLight(0xffffff, 2);
        scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0xffffff, 1, 100);
        pointLight.position.set(5, 5, 5);
        scene.add(pointLight);

        const composer = new EffectComposer(renderer);
        const chromaticAberrationPass = new ShaderPass(ChromaticAberrationShader);
        const glowPass = new ShaderPass(GlowShader);

        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(chromaticAberrationPass);
        composer.addPass(glowPass);

        mediaData.forEach((entry, index) => {
          const videoSrc = videoRoot + entry.video;
          const videoWidth = entry.width;
          const videoHeight = entry.height;
          const opacity = entry.opacity;
          const rgbShiftIntensity = entry.rgbShiftIntensity !== undefined ? entry.rgbShiftIntensity : 0;
          const glowIntensity = entry.glowIntensity !== undefined ? entry.glowIntensity : 0;
          const glitchAmount = entry.glitchAmount !== undefined ? entry.glitchAmount : 0;

          const anchor = mindarThree.addAnchor(index);
          const { plane, video } = createVideoPlane(videoSrc, videoWidth, videoHeight, opacity);
          anchor.group.add(plane);

          anchor.onTargetFound = () => {
            video.play();
            chromaticAberrationPass.uniforms['amount'].value = rgbShiftIntensity;
            glowPass.uniforms['glowIntensity'].value = glowIntensity;
          };

          anchor.onTargetLost = () => {
            video.pause();
            chromaticAberrationPass.uniforms['amount'].value = 0;
            glowPass.uniforms['glowIntensity'].value = 0;
          };
        });

        const clock = new THREE.Clock();

        renderer.setAnimationLoop(() => {
          const elapsedTime = clock.getElapsedTime();
          chromaticAberrationPass.uniforms['time'].value = elapsedTime;
          composer.render();
        });
      }).catch(error => {
        console.error("Failed to start AR session:", error);
      });
    })
    .catch(error => {
      console.error('Failed to load JSON:', error);
    });