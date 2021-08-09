import * as THREE from "three";
import fragment from "./shader/fragment.glsl";
import fragmentSimulation from "./shader/fragmentSimulation.glsl";
import vertex from "./shader/vertexParticles.glsl";
let OrbitControls = require("three-orbit-controls")(THREE);
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

import face from "../model/facefull.glb";

/* TEXTURE WIDTH FOR SIMULATION */
const WIDTH = 128;

export default class Sketch {
  constructor(options) {
    this.scene = new THREE.Scene();

    this.container = options.dom;
    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.width, this.height);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputEncoding = THREE.sRGBEncoding;

    this.container.appendChild(this.renderer.domElement);
    this.loader = new GLTFLoader();
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.001,
      1000
    );

    // var frustumSize = 10;
    // var aspect = window.innerWidth / window.innerHeight;
    // this.camera = new THREE.OrthographicCamera( frustumSize * aspect / - 2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / - 2, -1000, 1000 );
    this.camera.position.set(0, 0, 2.5);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.time = 0;

    this.loader.load(face, (gltf) => {
      this.model = gltf.scene.children[0].children[4];
      console.log(this.model)
      this.model.geometry.scale(1000, 1000, 1000);
      this.model.geometry.translate(-0.32, -0.5, 0); 
      this.facePos  = this.model.geometry.attributes.position.array;
      this.faceNumber = this.facePos.length/3;

      console.log(this.facePos)
      
      
      // let s = 2000;
      // this.model.scale.set(s,s,s);
      // this.scene.add(gltf.scene)
      this.isPlaying = true;
      this.initGPGPU();
      this.addObjects();
      this.resize();
      this.render();
      this.setupResize();
    });

    // this.settings();
  }

  initGPGPU() {
    this.gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, this.renderer);
    // if ( isSafari() ) {
    //   gpuCompute.setDataType( THREE.HalfFloatType );
    // }
    this.dtPosition = this.gpuCompute.createTexture();
    this.fillPositions(this.dtPosition);

    this.positionVariable = this.gpuCompute.addVariable(
      "texturePosition",
      fragmentSimulation,
      this.dtPosition
    );

    this.positionVariable.wrapS = THREE.RepeatWrapping;
    this.positionVariable.wrapT = THREE.RepeatWrapping;

    this.positionVariable.material.uniforms["time"] = { value: 0 };

    this.gpuCompute.init();
  }

  fillPositions(texture) {
    let arr = texture.image.data;
    for (let i = 0; i < arr.length; i = i + 4) {

      let rand = Math.floor(Math.random() * this.faceNumber);
      // let x = Math.random();
      // let y = Math.random();
      // let z = Math.random();
      let x = this.facePos[3*rand];
      let y = this.facePos[3*rand + 1];
      let z = this.facePos[3*rand + 2];
      

      arr[i] = x;
      arr[i + 1] = y;
      arr[i + 2] = z;
      arr[i + 3] = 1;
    }
    console.log(arr);
  }

  settings() {
    let that = this;
    this.settings = {
      progress: 0,
    };
    this.gui = new dat.GUI();
    this.gui.add(this.settings, "progress", 0, 1, 0.01);
  }

  setupResize() {
    window.addEventListener("resize", this.resize.bind(this));
  }

  resize() {
    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  addObjects() {
    let that = this;
    this.material = new THREE.ShaderMaterial({
      extensions: {
        derivatives: "#extension GL_OES_standard_derivatives : enable",
      },
      side: THREE.DoubleSide,
      uniforms: {
        time: { type: "f", value: 0 },
        positionTexture: { value: null },
        resolution: { type: "v4", value: new THREE.Vector4() },
      },
      // wireframe: true,
      // transparent: true,
      vertexShader: vertex,
      fragmentShader: fragment,
      blending: THREE.AdditiveBlending
    });

    this.geometry = new THREE.BufferGeometry();
    let positions = new Float32Array(WIDTH * WIDTH * 3);
    let references = new Float32Array(WIDTH * WIDTH * 2);
    for (let i = 0; i < WIDTH * WIDTH; i++) {
      let x = Math.random();
      let y = Math.random();
      let z = Math.random();
      let xx = (i % WIDTH) / WIDTH;
      let yy = ~~(i / WIDTH) / WIDTH;
      positions.set([x, y, z], i * 3);
      references.set([xx, yy], i * 2);
    }

    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    this.geometry.setAttribute(
      "references",
      new THREE.BufferAttribute(references, 2)
    );

    this.geometry = this.model.geometry;
    this.geometry = new THREE.IcosahedronBufferGeometry(1., 50.);
      
    this.plane = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.plane);
  }

  stop() {
    this.isPlaying = false;
  }

  play() {
    if (!this.isPlaying) {
      this.render();
      this.isPlaying = true;
    }
  }

  render() {
    if (!this.isPlaying) return;
    this.time += 0.05;
    this.positionVariable.material.uniforms["time"].value = this.time;
    this.gpuCompute.compute();

    this.material.uniforms.positionTexture.value =
      this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture;
    this.plane.rotation.x +=0.001
    this.plane.rotation.y +=0.001
    
    this.material.uniforms.time.value = this.time;
    requestAnimationFrame(this.render.bind(this));
    this.renderer.render(this.scene, this.camera);
  }
}

new Sketch({
  dom: document.getElementById("container"),
});
