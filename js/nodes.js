const fontCache = {};
const fontLoader = new THREE.FontLoader();
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function getInputData(node, portIndex) {
    const conn = connections.find(c => c.toNode === node.id && c.toPort === portIndex);
    if (!conn) return null;

    const fromNode = nodes.find(n => n.id === conn.fromNode);
    if (!fromNode) return null;
    return fromNode.outputValues[fromNode.outputs[conn.fromPort].name];
}

function createNodeData(id, title, type, x, y) {
    const node = { id, title, type, x, y, inputs: [], outputs: [], outputValues: {} };

    if (type === 'Input') {
        node.outputs.push({ name: 'output' });
        node.isFlipped = false;

        if (title === 'Image') {
            node.imageUrl = '';
            node.mediaElement = document.createElement('img');
            node.mediaElement.addEventListener('load', function () {
                for (var i = 0; i < 10; i++) setTimeout(renderWires, i * 100);
            });
            node.mediaElement.addEventListener('error', function () {
                for (var i = 0; i < 10; i++) setTimeout(renderWires, i * 100);
            });
        }
        else {
            node.mediaElement = document.createElement('video');
            node.mediaElement.muted = true;
            node.mediaElement.autoplay = true;
            node.mediaElement.controls = true;

            if (title === 'Video / Audio') {
                node.inputs.push({ name: 'control' });
                node.videoUrl = '';
                node.mediaElement.muted = false;
                node.mediaElement.addEventListener('canplay', function () {
                    for (var i = 0; i < 10; i++) setTimeout(renderWires, i * 100);
                });
                node.mediaElement.addEventListener('error', function () {
                    for (var i = 0; i < 10; i++) setTimeout(renderWires, i * 100);
                    if (node.videoUrl.indexOf('.m3u8') > 0) node.loadStream();
                });
                node.lastRate = 0;
                node.lastTime = [];

                node.hls = null;
                node.loadStream = () => {
                    if (node.hls) node.hls.destroy();
                    node.hls = new Hls();
                    node.hls.loadSource(node.videoUrl);
                    node.hls.attachMedia(node.mediaElement);

                    node.hls.on(Hls.Events.MANIFEST_PARSED, function () {
                        node.mediaElement.play().catch(e => console.log("Auto-play prevented: " + e));
                    });
                    node.hls.on(Hls.Events.ERROR, function (event, data) {
                        if (data.fatal) {
                            switch (data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    console.warn("HLS Network Error, recovering...");
                                    node.hls.startLoad();
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    console.warn("HLS Media Error, recovering...");
                                    node.hls.recoverMediaError();
                                    break;
                                default:
                                    console.error("HLS Fatal Error, destroying...", data);
                                    node.hls.destroy();
                                    break;
                            }
                        }
                    });
                };
            }
            node.mediaElement.playsInline = true;
            node.mediaElement.className = 'media-preview';
        }
        node.mediaElement.crossOrigin = 'anonymous';

        let isPlaying = true;
        node.onExecute = () => {
            if (title === 'Video / Audio') {
                const sourceControl = getInputData(node, 0);
                if (sourceControl && sourceControl.length == 2) {
                    try {
                        let playVid = calculateLandmarks(sourceControl);
                        let ix1 = document.getElementById('videoAudioPlay').value * 1;
                        let ix2 = document.getElementById('videoAudioPause').value * 1;
                        if (isPlaying && playVid[ix2]) {
                            node.mediaElement.pause();
                            setTimeout(function () { isPlaying = false; }, 1000);
                        }
                        else if (!isPlaying && playVid[ix1]) {
                            node.mediaElement.play();
                            setTimeout(function () { isPlaying = true; }, 1000);
                        }
                    }
                    catch { }
                }
                else if (sourceControl && sourceControl.length == 5 && sourceControl[3] === 'disabled' && sourceControl[0] == 1) {
                    if (isPlaying) setTimeout(function () { node.mediaElement.pause(); isPlaying = false; }, 1000);
                    else setTimeout(function () { node.mediaElement.play(); isPlaying = true; }, 1000);
                }
                else if (sourceControl && sourceControl.length == 3) {
                    node.mediaElement.play();
                    if (sourceControl[0] + sourceControl[1] + sourceControl[2] < node.lastRate) {
                        if (node.lastTime.length > 0) {
                            let popped = node.lastTime.pop();
                            node.mediaElement.currentTime = popped;
                        }
                    }
                    else node.lastTime.push(node.mediaElement.currentTime);

                    if (node.lastTime.length > 1000) node.lastTime.length = 0;
                    node.lastRate = sourceControl[0] + sourceControl[1] + sourceControl[2];
                }
            }
            if (node.isFlipped) node.mediaElement.style.transform = 'rotateY(180deg)';
            else node.mediaElement.style.transform = 'rotateY(0deg)';

            node.outputValues.output = node.mediaElement;
            node.mediaElement.style.zoom = 1;
            if (!document.fullscreenElement) node.mediaElement.style.zoom = 190 / node.mediaElement.naturalWidth;
        };
    }
    else if (type === 'Audio') {
        node.inputs.push({ name: 'input' });
        node.inputs.push({ name: 'control' });
        node.outputs.push({ name: 'control' });

        node.canvas = document.createElement('canvas');
        node.canvas.className = 'analyzer-canvas';
        node.canvas.width = 190; node.canvas.height = 60;
        node.ctx = node.canvas.getContext('2d');

        node.fxName = 'bandpass';
        node.fxA = 50;
        node.sliderAtitle = 'Frequency: ' + (node.fxA * 100.0) + 'Hz';

        node.audioSource = null;
        node.isConnected = false;

        node.gain = audioContext.createGain();
        node.panner = audioContext.createStereoPanner();

        node.delay = audioContext.createDelay(1.0);
        node.delay.delayTime.value = node.fxA / 100;
        node.feedback = audioContext.createGain();
        node.feedback.gain.value = 0.5;

        node.flangerDelay = audioContext.createDelay(1.0);
        node.flangerDelay.delayTime.value = node.fxA / 10000;
        node.flangerFeedback = audioContext.createGain();
        node.flangerFeedback.gain.value = 0.5;
        node.flangerLFO = audioContext.createOscillator();
        node.flangerLFO.type = 'sine';
        node.flangerLFO.frequency.value = 0.5;
        node.flangerLfoGain = audioContext.createGain();
        node.flangerLfoGain.gain.value = 0.005;
        node.flangerLFO.connect(node.flangerLfoGain);
        node.flangerLfoGain.connect(node.flangerDelay.delayTime);
        node.flangerLFO.start();

        node.convolver = audioContext.createConvolver();

        node.distortion = audioContext.createWaveShaper();
        node.distortion.oversample = '4x';

        node.filter = audioContext.createBiquadFilter();
        node.filter.Q.value = 1;

        node.tremoloGain = audioContext.createGain();
        node.tremoloGain.gain.value = 1;
        node.tremoloLFO = audioContext.createOscillator();
        node.tremoloLFO.type = 'sine';
        node.tremoloLFO.frequency.value = 5;
        node.tremoloLfoGain = audioContext.createGain();
        node.tremoloLfoGain.gain.value = 0.5;
        node.tremoloLFO.connect(node.tremoloLfoGain);
        node.tremoloLfoGain.connect(node.tremoloGain.gain);
        node.tremoloLFO.start();

        node.analyser = audioContext.createAnalyser();
        node.analyser.fftSize = 256;
        node.dataArray = new Uint8Array(node.analyser.frequencyBinCount);

        node.updateEffect = () => {
            node.gain.disconnect(); node.panner.disconnect();
            node.delay.disconnect(); node.feedback.disconnect(); node.flangerDelay.disconnect(); node.flangerFeedback.disconnect();
            node.convolver.disconnect(); node.distortion.disconnect(); node.filter.disconnect(); node.tremoloGain.disconnect();

            node.gain.gain.value = 1;
            if (node.audioSource) node.audioSource.connect(node.gain);

            if (node.fxName === 'panning') {
                node.panner.pan.value = (node.fxA - 50) / 50;
                if (node.isConnected) node.gain.connect(node.panner).connect(node.analyser).connect(audioContext.destination);
                node.sliderAtitle = 'Panning: ' + (node.fxA - 50) / 50;
            }
            else if (node.fxName === 'delay') {
                node.delay.delayTime.value = node.fxA / 100.0;
                if (node.isConnected) {
                    node.gain.connect(node.analyser).connect(audioContext.destination);
                    node.gain.connect(node.delay);
                    node.delay.connect(node.feedback);
                    node.delay.connect(audioContext.destination);
                }
                node.sliderAtitle = 'Delay: ' + (node.fxA / 100.0) + 's';
            }
            else if (node.fxName === 'flanger') {
                node.flangerDelay.delayTime.value = node.fxA / 10000.0;
                if (node.isConnected) {
                    node.gain.connect(node.analyser).connect(audioContext.destination);
                    node.gain.connect(node.flangerDelay);
                    node.flangerDelay.connect(node.flangerFeedback).connect(node.flangerDelay);
                    node.flangerDelay.connect(audioContext.destination);
                }
                node.sliderAtitle = 'Delay: ' + (node.fxA / 10000.0) + 's';
            }
            else if (node.fxName === 'reverb') {
                const impulseBuffer = audioContext.createBuffer(2, audioContext.sampleRate * (node.fxA / 25.0 + 0.001), audioContext.sampleRate);
                for (let i = 0; i < impulseBuffer.numberOfChannels; i++) {
                    const channel = impulseBuffer.getChannelData(i);
                    for (let j = 0; j < impulseBuffer.length; j++) {
                        channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / impulseBuffer.length, 2);
                    }
                }
                node.convolver.buffer = impulseBuffer;
                node.sliderAtitle = 'Impulse: ' + (node.fxA / 25.0) + 's';
                node.gain.gain.value = 3;
                if (node.isConnected) node.gain.connect(node.convolver).connect(node.analyser).connect(audioContext.destination);
            }
            else if (node.fxName === 'distortion') {
                const curve = new Float32Array(22050);
                for (let i = 0; i < 22050; i++) {
                    const x = i * 2 / 22050 - 1;
                    curve[i] = (x < 0) ? (x * (1 + node.fxA * 5.0 * x)) : (x / (1 + node.fxA * 5.0 * x));
                }
                node.distortion.curve = curve;
                node.sliderAtitle = 'Amount: ' + (node.fxA * 10.0);
                node.gain.gain.value = 0.5;
                if (node.isConnected) node.gain.connect(node.distortion).connect(node.analyser).connect(audioContext.destination);
            }
            else if (node.fxName === 'lowpass' || node.fxName === 'highpass' || node.fxName === 'bandpass') {
                node.filter.type = node.fxName;
                node.filter.frequency.value = node.fxA * 100.0;
                node.sliderAtitle = 'Frequency: ' + (node.fxA * 100.0) + 'Hz';
                node.gain.gain.value = 2;
                if (node.isConnected) node.gain.connect(node.filter).connect(node.analyser).connect(audioContext.destination);
            }
            else if (node.fxName === 'tremolo') {
                node.tremoloLFO.frequency.value = node.fxA / 10.0;
                node.sliderAtitle = 'Frequency: ' + (node.fxA / 10.0) + 'Hz';
                if (node.isConnected) node.gain.connect(node.tremoloGain).connect(node.analyser).connect(audioContext.destination);
            }
            if (!node.isConnected) {
                node.gain.gain.value = 1;
                node.gain.connect(node.analyser).connect(audioContext.destination);
            }
            document.getElementById('fxA' + node.id).title = node.sliderAtitle;
        };

        node.onExecute = () => {
            const source = getInputData(node, 0);
            if (source && source.tagName === 'VIDEO') {
                try {
                    if (source.srcObject) node.audioSource = audioContext.createMediaStreamSource(source.srcObject);
                    else node.audioSource = audioContext.createMediaElementSource(source);
                    node.isConnected = true;
                    node.updateEffect();
                }
                catch {
                    if (!node.isConnected) {
                        node.isConnected = true;
                        node.updateEffect();
                    }
                }
                node.isConnected = true;
            }
            else {
                if (node.isConnected) {
                    node.isConnected = false;
                    node.updateEffect();
                }
                node.isConnected = false;
            }
            const sourceControl = getInputData(node, 1);
            if (sourceControl && sourceControl.length == 2) {
                document.getElementById('fxA' + node.id).style.accentColor = 'darkgoldenrod';
                try {
                    let fx = calculateLandmarks(sourceControl);
                    let ix = document.getElementById('soundFilters').value * 1;
                    if (fx[ix]) {
                        node.fxA += fx[ix];
                        if (node.fxA < 0) node.fxA = 0;
                        if (node.fxA > 100) node.fxA = 100;
                        document.getElementById('fxA' + node.id).value = node.fxA;
                        if (Math.abs(node.fxA - Math.round(node.fxA)) < 0.1) node.updateEffect();
                    }
                }
                catch { }
            }
            else if (sourceControl && sourceControl.length == 5 && sourceControl[3] === 'disabled') {
                document.getElementById('fxA' + node.id).style.accentColor = 'darkgoldenrod';
                let target = sourceControl[1] * 0.1;
                if (sourceControl[0] > 0) node.fxA += (target - node.fxA) / Math.min(Math.pow(sourceControl[0], 3), 2000);
                document.getElementById('fxA' + node.id).value = node.fxA;
                if (Math.abs(node.fxA - Math.round(node.fxA)) < 0.1) node.updateEffect();
            }
            else if (sourceControl && sourceControl.length == 3) {
                document.getElementById('fxA' + node.id).style.accentColor = 'darkgoldenrod';
                node.fxA = (sourceControl[0] + sourceControl[1] + sourceControl[2]) * 33;
                document.getElementById('fxA' + node.id).value = node.fxA;
                if (Math.abs(node.fxA - Math.round(node.fxA)) < 0.1) node.updateEffect();
            }
            else document.getElementById('fxA' + node.id).style.accentColor = '';

            node.analyser.getByteFrequencyData(node.dataArray);
            let bass = 0, mid = 0, high = 0;
            for (let i = 0; i < 10; i++) bass += node.dataArray[i];
            for (let i = 10; i < 60; i++) mid += node.dataArray[i];
            for (let i = 60; i < 128; i++) high += node.dataArray[i];
            bass = (bass / 10) / 255; mid = (mid / 50) / 255; high = (high / 68) / 255; high = Math.min(1, high * 2);

            node.outputValues.control = [bass, mid, high];

            node.ctx.fillStyle = '#333';
            node.ctx.fillRect(0, 0, node.canvas.width, node.canvas.height);
            const barWidth = (node.canvas.width / node.dataArray.length) * 2.5;

            let x = 0;
            for (let i = 0; i < node.dataArray.length; i++) {
                let barHeight = node.dataArray[i] / 255 * node.canvas.height;
                node.ctx.fillStyle = `rgb(${barHeight + 100}, 100, 100)`;
                node.ctx.fillRect(x, node.canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
        };
    }
    else if (type === 'Text') {
        node.inputs.push({ name: 'control' });
        node.outputs.push({ name: 'output' });

        node.text = 'OLIVE';
        node.textColor = '#ffffff';
        node.textSize = 30;
        node.textHeight = 10;
        node.fontName = 'helvetiker_regular';
        node.font = null;
        node.needsUpdate = true;
        node.isReadonly = "disabled";

        const scene = new THREE.Scene();
        node.camera = new THREE.PerspectiveCamera(45, screen.width / screen.height, 1, 1000);
        node.camera.position.z = 100;

        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
        renderer.setSize(screen.width, screen.height);
        renderer.setClearColor(0x000000, 0);

        const controls = new THREE.OrbitControls(node.camera, renderer.domElement);
        controls.enableZoom = true;

        node.fontUrls = {
            'helvetiker_regular': 'fonts/helvetiker_regular.typeface.json',
            'gentilis_regular': 'fonts/gentilis_regular.typeface.json',
            'droid_sans_regular': 'fonts/droid_sans_regular.typeface.json',
            'optimer_regular': 'fonts/optimer_regular.typeface.json',
            'custom': ''
        };
        function loadFont(fontName) {
            if (node.fontUrls[fontName] === '') return;

            if (fontCache[fontName]) {
                node.font = fontCache[fontName];
                node.needsUpdate = true;
                return;
            }
            try {
                fontLoader.load(node.fontUrls[fontName], (loadedFont) => {
                    fontCache[fontName] = loadedFont;
                    node.font = loadedFont;
                    node.needsUpdate = true;
                });
            }
            catch { }
        }
        loadFont(node.fontName);

        node.changeFont = (newFontName) => {
            node.fontName = newFontName;
            loadFont(newFontName);
        };

        let textMesh = null;
        function updateText() {
            if (textMesh) {
                scene.remove(textMesh);
                textMesh.geometry.dispose();
                textMesh.material.dispose();
            }
            if (!node.font || !node.text) return;

            const geometry = new THREE.TextGeometry(node.text, {
                font: node.font,
                size: node.textSize,
                height: node.textHeight
            });
            geometry.computeBoundingBox();
            geometry.center();

            const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(node.textColor) });
            textMesh = new THREE.Mesh(geometry, material);
            scene.add(textMesh);
        }
        node.three = { scene, renderer, controls, updateText };

        node.onExecute = () => {
            if (node.needsUpdate) {
                updateText();
                node.needsUpdate = false;
            }
            const sourceControl = getInputData(node, 0);
            let ix1 = document.getElementById('textCameraHor').value * 1;
            let ix2 = document.getElementById('textCameraVer').value * 1;
            node.camera.position = cameraControl(sourceControl, node.camera.position, ix1, ix2);

            controls.update();
            renderer.render(scene, node.camera);
            node.outputValues.output = renderer.domElement;

            renderer.domElement.style.display = "none";
            if (document.fullscreenElement === renderer.domElement) renderer.domElement.style.display = "block";
        };
    }
    else if (type === 'Parametric') {
        node.inputs.push({ name: 'control' });
        node.outputs.push({ name: 'output' });
        node.canvas = document.createElement('canvas');
        node.canvas.className = 'inner-canvas';
        node.canvas.width = 600;
        node.canvas.height = 600;
        node.ctx = node.canvas.getContext('2d', { willReadFrequently: true });

        let A = [283, 433, 161, 544, 379, 232, 117, 61, 256, 583, 272, 253, 101, 456];
        let B = [528, 142, 613, 282, 494, 430, 419, 87, 183, 604, 299, 167, 434, 369];
        let rand = Math.floor(Math.random() * A.length);

        node.curveColor = '#faf0a0';
        node.paramA = A[rand];
        node.paramB = B[rand];

        node.curveName = 'combined';
        node.equationX = "cos(A*t/sqr(B))-pow(cos(A*t/sqr(B)),A%10*2+3)";
        node.equationY = "sin(A*t/sqr(B))-pow(sin(A*t/sqr(B)),A%10*2+3)";
        if (rand > 0) {
            node.curveName = 'astroid';
            node.equationX = "pow(cos(A*t/sqr(B)),A%3*2+3)";
            node.equationY = "pow(sin(A*t/sqr(B)),A%3*2+3)";
        }
        if (rand > 3) {
            node.curveName = 'rhodonea';
            node.equationX = "sin(t/sqr(B))*sin(sqr(A)*t/sqr(B))";
            node.equationY = "cos(t/sqr(B))*sin(sqr(A)*t/sqr(B))";
        }
        node.curveType = ["", "", "checked"];
        if (rand < 9) node.curveType = ["", "checked", ""];

        node.timeIndex = 0;
        node.animationSpeed = 1;
        node.isReadonly = "readonly";

        function curve(t) {
            let eqx, eqy;
            if (node.curveName === "rhodonea") {
                eqx = Math.sin(t) * Math.sin(Math.sqrt(node.paramA) * t);
                eqy = Math.cos(t) * Math.sin(Math.sqrt(node.paramA) * t);
            }
            else if (node.curveName === "astroid") {
                eqx = Math.pow(Math.cos(node.paramA * t), node.paramA % 3 * 2 + 3);
                eqy = Math.pow(Math.sin(node.paramA * t), node.paramA % 3 * 2 + 3);
            }
            else if (node.curveName === "combined") {
                eqx = Math.cos(node.paramA * t) - Math.pow(Math.cos(node.paramA * t), node.paramA % 10 * 2 + 3);
                eqy = Math.sin(node.paramA * t) - Math.pow(Math.sin(node.paramA * t), node.paramA % 10 * 2 + 3);
            }
            else {
                try {
                    let X = node.equationX.replace(/t/g, t).replace(/A/g, node.paramA).replace(/sqr\(B\)/g, 1);
                    let Y = node.equationY.replace(/t/g, t).replace(/A/g, node.paramA).replace(/sqr\(B\)/g, 1);

                    X = X.replace(/PI/gi, "Math.PI").replace(/E/gi, "Math.E").replace(/sqr/g, "Math.sqrt").replace(/pow/g, "Math.pow").replace(/log/g, "Math.log").replace(/sin/g, "Math.sin").replace(/cos/g, "Math.cos");
                    Y = Y.replace(/PI/gi, "Math.PI").replace(/E/gi, "Math.E").replace(/sqr/g, "Math.sqrt").replace(/pow/g, "Math.pow").replace(/log/g, "Math.log").replace(/sin/g, "Math.sin").replace(/cos/g, "Math.cos");

                    eqx = eval(X);
                    eqy = eval(Y);
                }
                catch { eqx = 0; eqy = 0; }
            }
            return [eqx, eqy];
        }
        node.onExecute = () => {
            let scale = 2 * 10000;
            let step = scale * Math.sqrt(node.paramB);
            let start = node.timeIndex / step;

            const sourceControl = getInputData(node, 0);
            if (sourceControl && sourceControl.length == 2) {
                document.getElementById('curveSpeed' + node.id).style.accentColor = 'darkgoldenrod';
                try {
                    let speed = calculateLandmarks(sourceControl);
                    let ix = document.getElementById('parametricLines').value * 1;
                    if (speed[ix]) {
                        node.animationSpeed += speed[ix] / 10;
                        if (node.animationSpeed < -3) node.animationSpeed = -3;
                        if (node.animationSpeed > 3) node.animationSpeed = 3;
                        document.getElementById('curveSpeed' + node.id).value = node.animationSpeed;
                        document.getElementById('curveSpeed' + node.id).title = 'Animation speed: ' + node.animationSpeed;
                    }
                }
                catch { }
            }
            else if (sourceControl && sourceControl.length == 5 && sourceControl[3] === 'disabled') {
                document.getElementById('curveSpeed' + node.id).style.accentColor = 'darkgoldenrod';
                let target = sourceControl[1] * 0.006 - 3;
                if (sourceControl[0] > 0) node.animationSpeed += (target - node.animationSpeed) / Math.min(Math.pow(sourceControl[0], 3), 2000);
                document.getElementById('curveSpeed' + node.id).value = node.animationSpeed;
                document.getElementById('curveSpeed' + node.id).title = 'Animation speed: ' + node.animationSpeed;
            }
            else if (sourceControl && sourceControl.length == 3 && sourceControl[1] > 0) {
                document.getElementById('curveSpeed' + node.id).style.accentColor = 'darkgoldenrod';
                node.timeIndex += (sourceControl[0] + sourceControl[1] + sourceControl[2]) * 33 - 50;
                node.animationSpeed = (sourceControl[0] + sourceControl[1] + sourceControl[2]) * 2 - 3;
                document.getElementById('curveSpeed' + node.id).value = node.animationSpeed;
                document.getElementById('curveSpeed' + node.id).title = 'Animation speed: ' + node.animationSpeed;
            }
            else document.getElementById('curveSpeed' + node.id).style.accentColor = '';

            node.timeIndex += node.animationSpeed;

            if (node.curveName === "rhodonea") start *= 100;
            let end = start + 1000 * scale * 2 * Math.PI;

            let i = curve(start);
            let x, y, z;

            node.ctx.clearRect(0, 0, node.canvas.width, node.canvas.width);
            node.ctx.beginPath();
            node.ctx.moveTo(node.canvas.width / 2 * (1 + i[0]), node.canvas.width / 2 * (1 + i[1]));

            node.ctx.strokeStyle = node.curveColor;
            node.ctx.fillStyle = node.curveColor;

            for (var t = start; t < end; t += step) {
                z = curve(t);
                x = node.canvas.width / 2 * (1 + z[0]);
                y = node.canvas.width / 2 * (1 + z[1]);

                if (node.curveType[0] === "checked") node.ctx.fillRect(x - 1, y - 1, 3, 3);
                else {
                    if (node.curveType[1] === "checked") node.ctx.lineTo(x, y);
                    else node.ctx.quadraticCurveTo(node.canvas.width / 2, node.canvas.width / 2, x, y);
                }
            }
            if (node.curveType[0] !== "checked") node.ctx.stroke();

            node.outputValues.output = node.canvas;
        };
    }
    else if (type === 'Time') {
        node.inputs.push({ name: 'control' });
        node.outputs.push({ name: 'control' });

        node.targetValueA = 500;
        node.targetValueB = 500;
        node.countDown = null;
        node.countTime = 1;
        node.defaultTime = 1;
        node.isDisabled = '';

        node.onExecute = () => {
            if (node.countTime <= 0) {
                if (node.countDown) {
                    clearInterval(node.countDown);
                    node.countDown = null;
                    node.isDisabled = '';
                }
                else {
                    node.countTime = node.defaultTime;
                    document.getElementById('countDownTime' + node.id).value = node.defaultTime;
                    document.getElementById('countDownTime' + node.id).disabled = '';
                    document.getElementById('countDownButton' + node.id).disabled = '';
                }
            }

            const sourceControl = getInputData(node, 0);
            if (sourceControl && node.isDisabled === '') {
                let check = false;
                if (sourceControl.length == 2) {
                    try {
                        let trigger = calculateLandmarks(sourceControl);
                        let ix = document.getElementById('countdownTrigger').value * 1;
                        if (trigger[ix]) check = true;
                    }
                    catch { }
                }
                else if (sourceControl.length == 5 && sourceControl[0] == 0) check = true;
                else if (sourceControl.length == 3 && sourceControl[1] > 0.25) check = true;

                if (check) {
                    node.defaultTime = node.countTime;
                    node.countDown = setInterval(function () {
                        node.countTime--;
                        document.getElementById('countDownTime' + node.id).value = node.countTime;
                    }, 1000);
                    node.isDisabled = "disabled";
                    document.getElementById('countDownTime' + node.id).disabled = 'disabled';
                    document.getElementById('countDownButton' + node.id).disabled = 'disabled';
                }
            }
            node.outputValues.control = [node.countTime, node.targetValueA, node.targetValueB, node.isDisabled, node.id];
        };
    }
    else if (type === '3DScene') {
        node.inputs.push({ name: 'input' });
        node.inputs.push({ name: 'control' });
        node.outputs.push({ name: 'output' });
        node.inputExists = true;

        const scene = new THREE.Scene();
        node.camera = new THREE.PerspectiveCamera(45, screen.width / screen.height, 1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

        renderer.setSize(screen.width, screen.height);
        renderer.setClearColor(0x000000, 0);

        const controls = new THREE.OrbitControls(node.camera, renderer.domElement);
        controls.enableZoom = true;

        node.projectorCamera = new THREE.PerspectiveCamera(45, 1, 1, 1000);
        node.projectorCamera.lookAt(0, 0, 0);
        scene.add(node.projectorCamera);

        node.ambientLight = new THREE.AmbientLight(0xffffff, 1);
        scene.add(node.ambientLight);

        node.pointLight = new THREE.PointLight(0xff0000, 2);
        const pointSphere = new THREE.SphereGeometry(0.1, 16, 16);
        const pointColor = new THREE.MeshStandardMaterial({ color: 0x0077ff });
        node.pointHelper = new THREE.Mesh(pointSphere, pointColor);
        node.pointHelper.visible = false;

        const dragControls = new THREE.DragControls([node.pointHelper], node.camera, renderer.domElement);
        dragControls.addEventListener('hoveron', (event) => {
            event.object.material.emissive.set(0x333333);
            controls.enabled = false;
        });
        dragControls.addEventListener('hoveroff', (event) => {
            event.object.material.emissive.set(0x000000);
            controls.enabled = true;
        });
        dragControls.addEventListener('drag', (event) => {
            node.projectorCamera.position.set(node.pointHelper.position.x, node.pointHelper.position.y, node.pointHelper.position.z);
            node.pointLight.position.set(node.pointHelper.position.x, node.pointHelper.position.y, node.pointHelper.position.z);
        });
        renderer.domElement.addEventListener('mouseenter', (event) => { node.pointHelper.visible = true; });
        renderer.domElement.addEventListener('mouseleave', (event) => { node.pointHelper.visible = false; });

        node.isCustomModel = false;
        node.primitiveType = 'Plane';

        const loader = new THREE.GLTFLoader();
        let currentModel;

        const geometries = {
            Plane: new THREE.PlaneGeometry(1, 1),
            Cube: new THREE.BoxGeometry(1, 1, 1),
            Sphere: new THREE.SphereGeometry(0.5, 32, 32),
            Cone: new THREE.ConeGeometry(0.5, 1, 128),
            Cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 64),
            Torus: new THREE.TorusGeometry(0.5, 0.2, 16, 128),
            Circle: new THREE.CircleGeometry(1, 64)
        };
        node.primitiveNames = ['Plane', 'Cube', 'Sphere', 'Cone', 'Cylinder', 'Torus', 'Circle'];

        const texture = new THREE.Texture();
        const standardMaterial = new THREE.MeshStandardMaterial({ map: texture, metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide });

        const projectionMaterial = new THREE.ShaderMaterial({
            uniforms: {
                projectedTexture: { value: texture },
                viewMatrixProjector: { value: node.projectorCamera.matrixWorldInverse },
                projectionMatrixProjector: { value: node.projectorCamera.projectionMatrix },
            },
            vertexShader: `
                        uniform mat4 viewMatrixProjector;
                        uniform mat4 projectionMatrixProjector;

                        varying vec4 vProjectedTexCoords;
                        varying vec3 vNormal;
                        varying vec3 vWorldPosition;

                        void main() {
                            vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                            vProjectedTexCoords = projectionMatrixProjector * viewMatrixProjector * vec4(vWorldPosition, 1.0);
                            vNormal = normalize(normalMatrix * normal);
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `,
            fragmentShader: `
                        uniform sampler2D projectedTexture;
                        varying vec4 vProjectedTexCoords;
                        varying vec3 vNormal;
                        varying vec3 vWorldPosition;

                        void main() {
                            float light = 1.0;
                            vec2 projCoords = vProjectedTexCoords.xy / vProjectedTexCoords.w;
                            projCoords = projCoords * 0.5 + 0.5;

                            if (projCoords.x >= 0.0 && projCoords.x <= 1.0 && projCoords.y >= 0.0 && projCoords.y <= 1.0) {
                                gl_FragColor = texture2D(projectedTexture, projCoords) * light;
                            } else {
                                gl_FragColor = vec4(0.25, 0.25, 0.25, 0.0) * light;
                            }
                        }
                    `
        });
        if (title !== 'Projection') scene.add(node.pointLight);
        scene.add(node.pointHelper);

        function updateObject() {
            if (currentModel) scene.remove(currentModel);

            let material = standardMaterial;
            if (title === 'Projection') material = projectionMaterial;

            if (node.isCustomModel && node.loadedModel) {
                currentModel = node.loadedModel;
                if (node.inputExists) currentModel.traverse(child => { if (child.isMesh) child.material = material; });
            } else {
                currentModel = new THREE.Mesh(geometries[node.primitiveType], material);
            }
            scene.add(currentModel);

            node.camera.position.set(0, 0, 20);
            node.pointLight.position.set(0, 0, 11);
            node.pointHelper.position.set(0, 0, 11);
            node.projectorCamera.position.set(0, 0, 11);
        }
        updateObject();

        node.three = { scene, renderer, controls, standardMaterial, projectionMaterial, loader, updateObject };

        node.onExecute = () => {
            const sourceElement = getInputData(node, 0);
            const sourceIsValid = sourceElement && (sourceElement.naturalWidth > 0 || sourceElement.videoWidth > 0 || sourceElement.width > 0);
            if (sourceIsValid) {
                if (!node.inputExists) {
                    node.inputExists = true;
                    updateObject();
                }
                standardMaterial.map.image = sourceElement;
                standardMaterial.map.needsUpdate = true;

                projectionMaterial.uniforms.projectedTexture.value.image = sourceElement;
                projectionMaterial.uniforms.projectedTexture.value.needsUpdate = true;

                const width = sourceElement.naturalWidth || sourceElement.videoWidth || sourceElement.width;
                const height = sourceElement.naturalHeight || sourceElement.videoHeight || sourceElement.height;

                if (currentModel && !node.isCustomModel) {
                    if (currentModel.scale.x !== width / 100 || currentModel.scale.y !== height / 100) {
                        const originalScale = new THREE.Vector3(1, 1, 1);
                        currentModel.scale.set(originalScale);
                        currentModel.scale.set(10, 10 * height / width, 10);

                        node.projectorCamera.aspect = width / height;
                        node.projectorCamera.updateProjectionMatrix();
                    }
                }
                const sourceControl = getInputData(node, 1);
                let ix1 = document.getElementById('projCameraHor').value * 1;
                let ix2 = document.getElementById('projCameraVer').value * 1;
                node.camera.position = cameraControl(sourceControl, node.camera.position, ix1, ix2);
            }
            else node.inputExists = false;

            controls.update();
            renderer.render(scene, node.camera);

            node.outputValues.output = renderer.domElement;

            renderer.domElement.style.display = "none";
            if (document.fullscreenElement === renderer.domElement) renderer.domElement.style.display = "block";
        };
    }
    else if (type === 'Viewer') {
        node.inputs.push({ name: 'input' });
        node.canvas = document.createElement('canvas');
        node.canvas.width = 190;
        node.ctx = node.canvas.getContext('2d', { willReadFrequently: true });

        node.popup = null;
        node.popupImg = null;

        let index = fsIndex.indexOf(node.id);
        if (index < 0) {
            let fsC = document.createElement('canvas');
            let fsX = fsC.getContext('2d', { willReadFrequently: true });
            fsC.className = 'fs-canvas';
            document.body.appendChild(fsC);
            fsCanvas.push(fsC);
            fsCtx.push(fsX);
            fsIndex.push(node.id);
            index = fsIndex.length - 1;
        }

        node.onExecute = () => {
            if (!openCvReady) return;
            const sourceElement = getInputData(node, 0);
            const sourceIsValid = sourceElement && (sourceElement.naturalWidth > 0 || sourceElement.videoWidth > 0 || sourceElement.width > 0);
            if (sourceIsValid) {
                let W = sourceElement.naturalWidth || sourceElement.videoWidth || sourceElement.width;
                let H = sourceElement.naturalHeight || sourceElement.videoHeight || sourceElement.height;

                node.canvas.height = 190 * H / W;
                node.canvas.width = 190;
                node.ctx.drawImage(sourceElement, 0, 0, node.canvas.width, node.canvas.height);

                fsCanvas[index].width = W;
                fsCanvas[index].height = H;
                fsCtx[index].drawImage(sourceElement, 0, 0, W, H);
            }
            if (node.popup && !node.popup.closed) {
                try {
                    if (!node.popupImg) {
                        node.popup.document.body.style.margin = "0";
                        node.popup.document.body.style.background = "#000";
                        node.popup.document.title = "Live Viewer";
                        node.popupImg = node.popup.document.createElement('img');
                        node.popupImg.style.width = "100%";
                        node.popupImg.style.height = "100%";
                        node.popupImg.style.objectFit = "contain";
                        node.popup.document.body.appendChild(node.popupImg);
                        node.popupImg.oncontextmenu = function (e) { e.preventDefault(); this.requestFullscreen(); };
                        node.popupImg.ondblclick = function (e) { e.preventDefault(); this.requestFullscreen(); };
                    }
                    node.popupImg.src = fsCanvas[index].toDataURL();
                } catch (e) {
                    node.popup = null;
                    node.popupImg = null;
                }
            } else {
                node.popup = null;
                node.popupImg = null;
            }
        };
    }
    else if (type === 'Interactive') {
        node.inputs.push({ name: 'input' });
        node.inputs.push({ name: 'control' });
        node.outputs.push({ name: 'output' });

        node.canvas = document.createElement('canvas');
        node.canvas.className = 'inner-canvas';

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const renderer = new THREE.WebGLRenderer({ canvas: node.canvas });
        const clock = new THREE.Clock();

        node.rightHand = true;
        node.interEffectSize = 0.75;
        node.interEffectType = 'Liquify';
        node.interEffects = ['Liquify', 'Swirl', 'Pixelation', 'Ripple', 'Kaleidoscope', 'Thermal'];

        const shaderLeft = 'uniform sampler2D INPUT; uniform vec2 CENTER; uniform float RADIUS; uniform float TIME; varying vec2 UV; ';

        node.warpingShaders = {
            Liquify: `void main() { vec2 dir = UV - CENTER; float dist = length(dir); if (dist < 0.5 * RADIUS) { float normDist = dist / (0.5 * RADIUS); float distortion = pow(normDist, RADIUS + 1.0); vec2 newUV = CENTER + normalize(dir) * distortion * RADIUS / 2.0; gl_FragColor = texture2D(INPUT, newUV); } else gl_FragColor = texture2D(INPUT, UV); }`,
            Swirl: `void main() { vec2 uv = UV; vec2 dir = uv - CENTER; float dist = length(dir); if (dist < 1.0) { float percent = 1.0 - dist; float theta = percent * percent * (RADIUS * 5.0 - 2.5); float s = sin(theta); float c = cos(theta); uv = CENTER + vec2(dir.x * c - dir.y * s, dir.x * s + dir.y * c); } gl_FragColor = texture2D(INPUT, uv); }`,
            Pixelation: `void main() { float dist = distance(UV, CENTER); if (dist < RADIUS) { float t = dist / RADIUS; float gridSize = mix(15.0, 300.0, t * t); vec2 pixelatedUV = floor(UV * gridSize) / gridSize; gl_FragColor = texture2D(INPUT, pixelatedUV); } else gl_FragColor = texture2D(INPUT, UV); }`,
            Ripple: `void main() { vec2 uv = UV; vec2 dir = uv - CENTER; float dist = length(dir); float ripple = sin(dist * 25.0 - TIME * 5.0) * (RADIUS / 40.0); ripple *= exp(-dist * 5.0); uv += normalize(dir) * ripple; gl_FragColor = texture2D(INPUT, uv); }`,
            Kaleidoscope: `void main() { vec2 dir = UV - CENTER; float r = length(dir); float a = atan(dir.y, dir.x); float angleStep = 6.2831853 / (RADIUS * 16.0); a = mod(a, angleStep); if (a > angleStep * 0.5) { a = angleStep - a; } vec2 newUV = CENTER + vec2(cos(a), sin(a)) * r; gl_FragColor = texture2D(INPUT, newUV); }`,
            Thermal: `void main() { vec4 texColor = texture2D(INPUT, UV); float gray = dot(texColor.rgb, vec3(0.299, 0.587, 0.114)); float dist = distance(UV, CENTER); float heat = 1.0 - clamp(dist / RADIUS, 0.0, 1.0); float totalThermal = clamp(gray * 0.3 + heat * 0.7, 0.0, 1.0); vec3 cold = vec3(0.0, 0.0, 0.5); vec3 warm = vec3(0.8, 0.0, 0.2); vec3 hot = vec3(1.0, 0.9, 0.0); vec3 finalColor; if (totalThermal < 0.5) { finalColor = mix(cold, warm, totalThermal * 2.0); } else finalColor = mix(warm, hot, (totalThermal - 0.5) * 2.0); gl_FragColor = vec4(finalColor, 1.0); }`
        };
        const material = new THREE.ShaderMaterial({
            uniforms: {
                INPUT: { value: null },
                CENTER: { value: new THREE.Vector2(0.5, 0.5) },
                RADIUS: { value: node.interEffectSize },
                TIME: { value: 0.0 }
            },
            vertexShader: 'varying vec2 UV; void main() { UV = uv; gl_Position = vec4(position, 1.0); }',
            fragmentShader: shaderLeft + node.warpingShaders.liquify
        });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(plane);

        node.onExecute = () => {
            const sourceElement = getInputData(node, 0);
            const sourceIsValid = sourceElement && (sourceElement.naturalWidth > 0 || sourceElement.videoWidth > 0 || sourceElement.width > 0);
            if (sourceIsValid) {
                const newWidth = sourceElement.naturalWidth || sourceElement.videoWidth || sourceElement.width;
                const newHeight = sourceElement.naturalHeight || sourceElement.videoHeight || sourceElement.height;
                if (node.canvas.width !== newWidth || node.canvas.height !== newHeight) {
                    renderer.setSize(newWidth, newHeight, false);
                }
                material.uniforms.INPUT.value = new THREE.CanvasTexture(sourceElement);
                material.fragmentShader = shaderLeft + node.warpingShaders[node.interEffectType];
                material.needsUpdate = true;

                const sourceControl = getInputData(node, 1);
                try {
                    let centerX = 0.5, centerY = 0.5;
                    if (sourceControl && sourceControl.length == 2) {
                        centerX = 1000; centerY = 1000;

                        let hand = 15;
                        if (node.rightHand) hand = 16;
                        if (sourceControl[0][hand]) {
                            centerX = sourceControl[0][hand].x;
                            centerY = 1 - sourceControl[0][hand].y;
                        }
                    }
                    else if (sourceControl && sourceControl.length == 5 && sourceControl[3] === 'disabled') {
                        document.getElementById('inter' + node.id).style.accentColor = 'darkgoldenrod';
                        let target = Math.round(sourceControl[1] * 0.012) * 2 + 1;
                        if (sourceControl[0] > 0) {
                            node.interEffectSize += (target - node.interEffectSize) / Math.min(Math.pow(sourceControl[0], 3), 2000) / 2000.0;
                        }
                        document.getElementById('inter' + node.id).value = node.interEffectSize;
                    }
                    else if (sourceControl && sourceControl.length == 3) {
                        document.getElementById('inter' + node.id).style.accentColor = 'darkgoldenrod';
                        node.interEffectSize = Math.round((sourceControl[0] + sourceControl[1] + sourceControl[2]) * 4) / 10.0;
                        document.getElementById('inter' + node.id).value = node.interEffectSize;
                    }
                    else document.getElementById('inter' + node.id).style.accentColor = '';

                    material.uniforms.CENTER.value.set(centerX, centerY);
                    material.uniforms.RADIUS.value = node.interEffectSize;
                    material.uniforms.TIME.value = clock.getElapsedTime();
                }
                catch (err) { console.log("Three.js Error:", err); }

                renderer.render(scene, camera);
                node.outputValues.output = node.canvas;
            }
        };
    }
    else if (type === 'Throughput') {
        node.inputs.push({ name: 'input' });
        node.outputs.push({ name: 'output' });

        node.canvas = document.createElement('canvas');
        node.canvas.className = 'inner-canvas';
        node.ctx = node.canvas.getContext('2d', { willReadFrequently: true });

        node.helperCanvas = document.createElement('canvas');
        node.hCtx = node.helperCanvas.getContext('2d', { willReadFrequently: true });

        node.checkFirstFrame = true;
        node.bypass = "checked";
        node.lastState = '';

        if (title === 'Histogram Equalization') {
            node.gridSize = 8;
        }
        else if (title === 'Gamma Correction') {
            node.inputs.push({ name: 'control' });
            node.gammaValue = 1.0;
        }
        else if (title === 'Color Adjustment') {
            node.inputs.push({ name: 'control' });
            node.selectedColor = "#80ffff";
            node.oldHSV = [90.0, 128.0];
            node.newHSV = [0.0, 0.0];

            node.fullRangeChecked = "checked";
            node.colorRangeChecked = "";
            node.colorInvertChecked = "";
        }
        else if (title === 'Convolution') {
            node.convolutionType = 'Gaussian Blur';
            node.convolutionalFilters = ['Gaussian Blur', 'Bilateral Smoothing', 'Sobel Edges', 'Custom Filter'];
            node.convolutionalFilterSize = 13;
            node.customKernel = [];
            node.customDisabled = 'disabled';
        }
        else if (title === 'Morphology / Rank') {
            node.inputs.push({ name: 'control' });
            node.morphologyType = 'Erosion (Min)';
            node.morphologicalFilters = ['Erosion (Min)', 'Dilation (Max)', 'Opening', 'Closing', 'Gradient', 'Tophat', 'Blackhat', 'Median'];
            node.morphologicalFilterName = [cv.MORPH_ERODE, cv.MORPH_DILATE, cv.MORPH_OPEN, cv.MORPH_CLOSE, cv.MORPH_GRADIENT, cv.MORPH_TOPHAT, cv.MORPH_BLACKHAT];
            node.morphologicalFilterSize = 9;
            node.morphologyKernelType = ["checked", "", ""];
        }
        else if (title === 'Glitch Effects') {
            node.inputs.push({ name: 'control' });
            node.glitchEffectSize = 5;
            node.glitchEffectType = 'Shaking';
            node.glitchEffects = ['Shaking', 'Abberation', 'Fade', 'Glass', 'Caricature', 'Slice Glitch'];
        }
        else if (title === 'Channel Mixer') {
            node.channelMixerValues = [1, 0, 0, 0, 1, 0, 0, 0, 1];
        }
        else if (title === 'Optical Flow') {
            node.opticalFlowSize = 5;
        }
        else if (title === 'Thresholding') {
            node.thresholdValue = 128;
            node.thresholdingChecked = ["checked", "", ""];
        }
        else if (title === 'Live Editor') {
            node.previousCode = '';
            node.skeletonCode = `let channels = new cv.MatVector(); cv.split(INPUT, channels); let R = channels.get(0); let G = channels.get(1); let B = channels.get(2); channels.delete(); let final = new cv.MatVector(); let tmpR = new cv.Mat(), dstR = new cv.Mat(); cv.threshold(R, tmpR, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU); R.delete(); cv.distanceTransform(tmpR, dstR, cv.DIST_L2, 5); tmpR.delete(); cv.normalize(dstR, dstR, 1, 0, cv.NORM_INF); final.push_back(dstR); dstR.delete(); let tmpG = new cv.Mat(), dstG = new cv.Mat(); cv.threshold(G, tmpG, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU); G.delete(); cv.distanceTransform(tmpG, dstG, cv.DIST_L2, 5); tmpG.delete(); cv.normalize(dstG, dstG, 1, 0, cv.NORM_INF); final.push_back(dstG); dstG.delete(); let tmpB = new cv.Mat(), dstB = new cv.Mat(); cv.threshold(B, tmpB, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU); B.delete(); cv.distanceTransform(tmpB, dstB, cv.DIST_L2, 5); tmpB.delete(); cv.normalize(dstB, dstB, 1, 0, cv.NORM_INF); final.push_back(dstB); dstB.delete(); cv.merge(final, OUTPUT); final.delete();`;
        }
        else if (title === 'Superpixels') {
            node.kValue = 8;
        }
        else if (title === 'Background Subtraction') {
            node.fgbg = new cv.BackgroundSubtractorMOG2();
        }
        let blackImage, previousImage;

        node.onExecute = () => {
            if (!openCvReady) return;
            const sourceElement = getInputData(node, 0);
            const sourceIsValid = sourceElement && (sourceElement.naturalWidth > 0 || sourceElement.videoWidth > 0 || sourceElement.width > 0);
            if (sourceIsValid) {
                let previousWidth = node.helperCanvas.width;
                let previousHeight = node.helperCanvas.height;

                node.helperCanvas.width = sourceElement.naturalWidth || sourceElement.videoWidth || sourceElement.width;
                node.helperCanvas.height = sourceElement.naturalHeight || sourceElement.videoHeight || sourceElement.height;

                let src;
                try { src = cv.imread(sourceElement); }
                catch {
                    try {
                        node.hCtx.drawImage(sourceElement, 0, 0, node.helperCanvas.width, node.helperCanvas.height);
                        src = cv.imread(node.helperCanvas);
                    }
                    catch { return; }
                }
                try {
                    if (node.helperCanvas.width !== previousWidth || node.helperCanvas.height !== previousHeight) node.checkFirstFrame = true;

                    let mean = cv.mean(src) + node.bypass;
                    let dst = new cv.Mat();

                    if (node.bypass === "") src.copyTo(dst);
                    else {
                        if (title === 'Histogram Equalization') {
                            if (node.lastState === node.gridSize + mean) {
                                src.delete(); dst.delete();
                                return;
                            }
                            node.lastState = node.gridSize;

                            if (node.gridSize > 0) {
                                let tileGridSize = new cv.Size(node.gridSize, node.gridSize);
                                let clahe = new cv.CLAHE(40, tileGridSize);
                                let tmp1 = new cv.MatVector();
                                let tmp2 = new cv.MatVector();
                                cv.split(src, tmp1);
                                let dst0 = tmp1.get(0);
                                clahe.apply(dst0, dst0);
                                tmp2.push_back(dst0);
                                let dst1 = tmp1.get(1);
                                clahe.apply(dst1, dst1);
                                tmp2.push_back(dst1);
                                let dst2 = tmp1.get(2);
                                clahe.apply(dst2, dst2);
                                tmp2.push_back(dst2);
                                dst0.delete(); dst1.delete(); dst2.delete();
                                cv.merge(tmp2, dst);
                                tmp1.delete(); tmp2.delete(); clahe.delete();
                            }
                            else src.copyTo(dst);
                        }
                        else if (title === 'Color Adjustment') {
                            let controlParams = '';
                            const sourceControl = getInputData(node, 1);
                            if (sourceControl && sourceControl.length == 2) {
                                document.getElementById('hueValue' + node.id).style.accentColor = 'darkgoldenrod';
                                document.getElementById('satValue' + node.id).style.accentColor = 'darkgoldenrod';
                                try {
                                    let hs = calculateLandmarks(sourceControl);
                                    let ix1 = document.getElementById('colorHue').value * 1;
                                    let ix2 = document.getElementById('colorSat').value * 1;
                                    if (hs[ix1]) {
                                        controlParams += hs[ix1];
                                        node.newHSV[0] += hs[ix1] * 10;
                                        if (node.newHSV[0] < -180) node.newHSV[0] = -180;
                                        if (node.newHSV[0] > 180) node.newHSV[0] = 180;
                                        document.getElementById('hueValue' + node.id).value = node.newHSV[0];
                                    }
                                    if (hs[ix2]) {
                                        controlParams += hs[ix2];
                                        node.newHSV[1] += hs[ix2] * 10;
                                        if (node.newHSV[1] < -255) node.newHSV[1] = -255;
                                        if (node.newHSV[1] > 255) node.newHSV[1] = 255;
                                        document.getElementById('satValue' + node.id).value = node.newHSV[1];
                                    }
                                }
                                catch { }
                            }
                            else if (sourceControl && sourceControl.length == 5 && sourceControl[3] === 'disabled') {
                                document.getElementById('hueValue' + node.id).style.accentColor = 'darkgoldenrod';
                                document.getElementById('satValue' + node.id).style.accentColor = 'darkgoldenrod';
                                let targetA = sourceControl[1] * 0.36 - 180;
                                let targetB = sourceControl[2] * 0.51 - 255;
                                if (sourceControl[0] > 0) {
                                    controlParams = sourceControl[0];
                                    node.newHSV[0] += (targetA - node.newHSV[0]) / Math.min(Math.pow(sourceControl[0], 3), 2000);
                                    node.newHSV[1] += (targetB - node.newHSV[1]) / Math.min(Math.pow(sourceControl[0], 3), 2000);
                                }
                                document.getElementById('hueValue' + node.id).value = node.newHSV[0];
                                document.getElementById('satValue' + node.id).value = node.newHSV[1];
                            }
                            else if (sourceControl && sourceControl.length == 3) {
                                document.getElementById('hueValue' + node.id).style.accentColor = 'darkgoldenrod';
                                document.getElementById('satValue' + node.id).style.accentColor = 'darkgoldenrod';
                                node.newHSV[0] = sourceControl[0] * 360 - 180;
                                node.newHSV[1] = sourceControl[2] * 510 - 255;
                                controlParams = sourceControl[0] + sourceControl[1] + sourceControl[2];
                                document.getElementById('hueValue' + node.id).value = node.newHSV[0];
                                document.getElementById('satValue' + node.id).value = node.newHSV[1];
                            }
                            else {
                                document.getElementById('hueValue' + node.id).style.accentColor = '';
                                document.getElementById('satValue' + node.id).style.accentColor = '';
                            }

                            if (node.lastState === controlParams + node.selectedColor + node.oldHSV + node.newHSV + node.fullRangeChecked + node.colorRangeChecked + node.colorInvertChecked + mean) {
                                src.delete(); dst.delete();
                                return;
                            }
                            node.lastState = controlParams + node.selectedColor + node.oldHSV + node.newHSV + node.fullRangeChecked + node.colorRangeChecked + node.colorInvertChecked;

                            document.getElementById('fullRange' + node.id).checked = node.fullRangeChecked;
                            document.getElementById('colorRange' + node.id).checked = node.colorRangeChecked;

                            if (node.colorInvertChecked) cv.bitwise_not(src, src);
                            let adjusted = new cv.Mat();
                            cv.cvtColor(src, adjusted, cv.COLOR_RGB2HSV);

                            let low = [node.oldHSV[0], node.oldHSV[1], 0, 0];
                            let high = [node.oldHSV[0], node.oldHSV[1], 255, 255];
                            let low2, high2;

                            if (node.fullRangeChecked || node.oldHSV[1] < 50) {
                                node.fullRangeChecked = true;
                                low = [0, 0, 0, 0];
                                high = [180, 255, 255, 255];
                            }
                            else if (node.colorRangeChecked) {
                                node.colorRangeChecked = true;
                                if (node.oldHSV[0] < 10 || node.oldHSV[0] > 158) { //red
                                    low = [159, 50, 70, 0];
                                    high = [180, 255, 255, 255];
                                    low2 = [0, 50, 70, 0];
                                    high2 = [9, 255, 255, 255];
                                }
                                else if (node.oldHSV[0] < 25 && node.oldHSV[0] > 9) { //orange
                                    low = [10, 50, 70, 0];
                                    high = [24, 255, 255, 255];
                                }
                                else if (node.oldHSV[0] < 36 && node.oldHSV[0] > 24) { //yellow
                                    low = [25, 50, 70, 0];
                                    high = [35, 255, 255, 255];
                                }
                                else if (node.oldHSV[0] < 90 && node.oldHSV[0] > 35) { //green
                                    low = [36, 50, 70, 0];
                                    high = [89, 255, 255, 255];
                                }
                                else if (node.oldHSV[0] < 129 && node.oldHSV[0] > 89) { //blue
                                    low = [90, 50, 70, 0];
                                    high = [128, 255, 255, 255];
                                }
                                else if (node.oldHSV[0] < 159 && node.oldHSV[0] > 128) { //purple
                                    low = [129, 50, 70, 0];
                                    high = [158, 255, 255, 255];
                                }
                            }
                            else {
                                low = [node.oldHSV[0], node.oldHSV[1], 0, 0];
                                high = [node.oldHSV[0], node.oldHSV[1], 255, 255];
                            }
                            let lowerBound = new cv.Mat(adjusted.rows, adjusted.cols, adjusted.type(), low);
                            let upperBound = new cv.Mat(adjusted.rows, adjusted.cols, adjusted.type(), high);
                            let mask = new cv.Mat();
                            cv.inRange(adjusted, lowerBound, upperBound, mask);
                            lowerBound.delete(); upperBound.delete();

                            if (low2) {
                                let lowerBound2 = new cv.Mat(adjusted.rows, adjusted.cols, adjusted.type(), low2);
                                let upperBound2 = new cv.Mat(adjusted.rows, adjusted.cols, adjusted.type(), high2);
                                let mask2 = new cv.Mat();
                                cv.inRange(adjusted, lowerBound2, upperBound2, mask2);
                                cv.bitwise_or(mask, mask2, mask);
                                lowerBound2.delete(); upperBound2.delete(); mask2.delete();
                            }
                            let result = new cv.Mat();
                            let final = new cv.Mat();
                            let step = new cv.Mat();
                            let temp = new cv.Mat();

                            let newHue = new cv.Mat(adjusted.rows, adjusted.cols, adjusted.type(), new cv.Scalar(Math.abs(node.newHSV[0]), 0, 0, 0));
                            cv.bitwise_and(newHue, newHue, result, mask);
                            newHue.delete();

                            if (node.newHSV[0] >= 0) cv.add(adjusted, result, step, temp, -1);
                            else cv.subtract(adjusted, result, step, temp, -1);
                            adjusted.delete();

                            let newSat = new cv.Mat(step.rows, step.cols, step.type(), new cv.Scalar(0, Math.abs(node.newHSV[1]), 0, 0));
                            cv.bitwise_and(newSat, newSat, result, mask);
                            newSat.delete(); mask.delete();

                            if (node.newHSV[1] >= 0) cv.add(step, result, final, temp, -1);
                            else cv.subtract(step, result, final, temp, -1);
                            step.delete(); result.delete(); temp.delete();

                            cv.cvtColor(final, dst, cv.COLOR_HSV2RGB);
                            final.delete();
                        }
                        else if (title === 'Gamma Correction') {
                            let controlParams = '';
                            const sourceControl = getInputData(node, 1);
                            if (sourceControl) [node.gammaValue, controlParams] = sliderControl(sourceControl, 'gamma' + node.id, 'gammaCorrection', node.gammaValue, controlParams, 0.1, 0.01, 10, sourceControl[1] * 0.01, (sourceControl[0] + sourceControl[1] + sourceControl[2]) * 3);

                            if (node.lastState === controlParams + node.gammaValue + mean) {
                                src.delete(); dst.delete();
                                return;
                            }
                            node.lastState = controlParams + node.gammaValue;

                            let lut = new cv.Mat(1, 256, cv.CV_8UC1);
                            for (let i = 0; i < 256; i++) {
                                lut.ucharPtr(0, i)[0] = Math.min(255, Math.pow(i / 255.0, node.gammaValue) * 255.0);
                            }
                            cv.LUT(src, lut, dst);
                            lut.delete();
                        }
                        else if (title === 'Convolution') {
                            if (node.lastState === node.convolutionType + node.convolutionalFilterSize + node.customKernel + mean) {
                                src.delete(); dst.delete();
                                return;
                            }
                            node.lastState = node.convolutionType + node.convolutionalFilterSize + node.customKernel;

                            let anchor = new cv.Point(-1, -1);
                            let ksize = new cv.Size(node.convolutionalFilterSize, node.convolutionalFilterSize);
                            let index = node.convolutionalFilters.indexOf(node.convolutionType);

                            document.getElementById('convolutionRange' + node.id).disabled = false;
                            document.getElementById('kernelInput' + node.id).disabled = "disabled";
                            node.customDisabled = 'disabled';
                            switch (index) {
                                case 0: cv.GaussianBlur(src, dst, ksize, 0, 0, cv.BORDER_DEFAULT);
                                    break;
                                case 1:
                                    cv.cvtColor(src, src, cv.COLOR_RGBA2RGB);
                                    cv.bilateralFilter(src, dst, node.convolutionalFilterSize, 75, 75, cv.BORDER_DEFAULT);
                                    break;
                                case 2:
                                    let channels = new cv.MatVector();
                                    cv.split(src, channels);
                                    let R = channels.get(0);
                                    let G = channels.get(1);
                                    let B = channels.get(2);
                                    channels.delete();

                                    let final = new cv.MatVector();

                                    let gradXR = new cv.Mat();
                                    let gradYR = new cv.Mat();
                                    let absGradXR = new cv.Mat();
                                    let absGradYR = new cv.Mat();
                                    cv.Sobel(R, gradXR, cv.CV_16S, 1, 0, 3, 1, 0, cv.BORDER_DEFAULT);
                                    cv.Sobel(R, gradYR, cv.CV_16S, 0, 1, 3, 1, 0, cv.BORDER_DEFAULT);
                                    R.delete();
                                    cv.convertScaleAbs(gradXR, absGradXR);
                                    cv.convertScaleAbs(gradYR, absGradYR);
                                    gradXR.delete(); gradYR.delete();
                                    let tmpR = new cv.Mat();
                                    cv.addWeighted(absGradXR, node.convolutionalFilterSize / 25, absGradYR, 1 - node.convolutionalFilterSize / 25, 0, tmpR);
                                    absGradXR.delete(); absGradYR.delete();
                                    final.push_back(tmpR);
                                    tmpR.delete();

                                    let gradXG = new cv.Mat();
                                    let gradYG = new cv.Mat();
                                    let absGradXG = new cv.Mat();
                                    let absGradYG = new cv.Mat();
                                    cv.Sobel(G, gradXG, cv.CV_16S, 1, 0, 3, 1, 0, cv.BORDER_DEFAULT);
                                    cv.Sobel(G, gradYG, cv.CV_16S, 0, 1, 3, 1, 0, cv.BORDER_DEFAULT);
                                    G.delete();
                                    cv.convertScaleAbs(gradXG, absGradXG);
                                    cv.convertScaleAbs(gradYG, absGradYG);
                                    gradXG.delete(); gradYG.delete();
                                    let tmpG = new cv.Mat();
                                    cv.addWeighted(absGradXG, 0.5, absGradYG, 0.5, 0, tmpG);
                                    absGradXG.delete(); absGradYG.delete();
                                    final.push_back(tmpG);
                                    tmpG.delete();

                                    let gradXB = new cv.Mat();
                                    let gradYB = new cv.Mat();
                                    let absGradXB = new cv.Mat();
                                    let absGradYB = new cv.Mat();
                                    cv.Sobel(B, gradXB, cv.CV_16S, 1, 0, 3, 1, 0, cv.BORDER_DEFAULT);
                                    cv.Sobel(B, gradYB, cv.CV_16S, 0, 1, 3, 1, 0, cv.BORDER_DEFAULT);
                                    B.delete();
                                    cv.convertScaleAbs(gradXB, absGradXB);
                                    cv.convertScaleAbs(gradYB, absGradYB);
                                    gradXB.delete(); gradYB.delete();
                                    let tmpB = new cv.Mat();
                                    cv.addWeighted(absGradXB, 0.5, absGradYB, 0.5, 0, tmpB);
                                    absGradXB.delete(); absGradYB.delete();
                                    final.push_back(tmpB);
                                    tmpB.delete();

                                    cv.merge(final, dst);
                                    final.delete();
                                    break;
                                default:
                                    document.getElementById('convolutionRange' + node.id).disabled = true;
                                    document.getElementById('kernelInput' + node.id).disabled = "";
                                    node.customDisabled = '';
                                    try {
                                        cv.cvtColor(src, src, cv.COLOR_RGBA2RGB);
                                        let block = parseInt(Math.sqrt(node.customKernel.length));
                                        let kernel = cv.matFromArray(block, block, cv.CV_32F, node.customKernel);
                                        cv.filter2D(src, dst, cv.CV_8U, kernel);
                                    }
                                    catch { src.copyTo(dst); }
                            }
                        }
                        else if (title === 'Morphology / Rank') {
                            let controlParams = '';
                            const sourceControl = getInputData(node, 1);
                            if (sourceControl) [node.morphologicalFilterSize, controlParams] = sliderControl(sourceControl, 'kernelSize' + node.id, 'morphRankSize', node.morphologicalFilterSize, controlParams, 1, 3, 25, Math.round(sourceControl[1] * 0.011) * 2 + 3, Math.round((sourceControl[0] + sourceControl[1] + sourceControl[2]) * 3.6) * 2 + 3);

                            if (node.lastState === controlParams + node.morphologyType + node.morphologicalFilterSize + node.morphologyKernelType + mean) {
                                src.delete(); dst.delete();
                                return;
                            }
                            node.lastState = controlParams + node.morphologyType + node.morphologicalFilterSize + node.morphologyKernelType;

                            let ksize = new cv.Size(node.morphologicalFilterSize, node.morphologicalFilterSize);
                            let kernel;
                            if (node.morphologyKernelType[1] === "checked")
                                kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, ksize);
                            else if (node.morphologyKernelType[2] === "checked")
                                kernel = cv.getStructuringElement(cv.MORPH_CROSS, ksize);
                            else kernel = cv.Mat.ones(node.morphologicalFilterSize, node.morphologicalFilterSize, cv.CV_8U);

                            let index = node.morphologicalFilters.indexOf(node.morphologyType);
                            if (index > 6) cv.medianBlur(src, dst, Math.floor(node.morphologicalFilterSize / 2) * 2 + 1);
                            else {
                                if (index > 3) cv.cvtColor(src, src, cv.COLOR_RGBA2RGB);
                                cv.morphologyEx(src, dst, node.morphologicalFilterName[index], kernel);
                            }
                        }
                        else if (title === 'Glitch Effects') {
                            let controlParams = '';
                            const sourceControl = getInputData(node, 1);
                            if (sourceControl) [node.glitchEffectSize, controlParams] = sliderControl(sourceControl, 'glitch' + node.id, 'glitchSlider', node.glitchEffectSize, controlParams, 1, 1, 25, Math.round(sourceControl[1] * 0.012) * 2 + 1, Math.round((sourceControl[0] + sourceControl[1] + sourceControl[2]) * 4) * 2 + 1);

                            if (node.lastState === controlParams + node.glitchEffectType + node.glitchEffectSize + mean && (node.glitchEffectType === 'Fade' || node.glitchEffectType === 'Glass')) {
                                src.delete(); dst.delete();
                                return;
                            }
                            node.lastState = controlParams + node.glitchEffectType + node.glitchEffectSize;

                            let dsize = new cv.Size(src.cols, src.rows);
                            let M1 = cv.matFromArray(2, 3, cv.CV_64FC1, [1, 0, 2 * (2 * Math.random() - 1) * node.glitchEffectSize, 0, 1, 2 * (2 * Math.random() - 1) * node.glitchEffectSize]);
                            let M3 = cv.matFromArray(2, 3, cv.CV_64FC1, [1, 0, 2 * (2 * Math.random() - 1) * node.glitchEffectSize, 0, 1, 2 * (2 * Math.random() - 1) * node.glitchEffectSize]);

                            if (node.glitchEffectType === 'Shaking') {
                                let tmp = new cv.Mat();
                                cv.warpAffine(src, tmp, M1, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
                                cv.warpAffine(tmp, dst, M3, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
                                tmp.delete();
                            }
                            else if (node.glitchEffectType === 'Abberation') {
                                let channels = new cv.MatVector(), planes = new cv.MatVector();
                                cv.split(src, channels);
                                let c1 = channels.get(0), c2 = channels.get(1), c3 = channels.get(2);

                                cv.warpAffine(c1, c1, M1, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
                                cv.warpAffine(c3, c3, M3, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

                                planes.push_back(c1), planes.push_back(c2), planes.push_back(c3);
                                cv.merge(planes, dst);
                                channels.delete(); planes.delete(); c1.delete(); c2.delete(); c3.delete();
                            }
                            else if (node.glitchEffectType === 'Fade') {
                                cv.cvtColor(src, src, cv.COLOR_RGBA2RGB);

                                if (node.checkFirstFrame) {
                                    if (blackImage) blackImage.delete();
                                    blackImage = new cv.Mat.zeros(src.rows, src.cols, src.type());
                                    node.checkFirstFrame = false;
                                }
                                else {
                                    try { cv.addWeighted(src, 1 - (node.glitchEffectSize / 2 - 1) / 10, blackImage, (node.glitchEffectSize / 2 - 1) / 10, 0, blackImage); }
                                    catch { }
                                }
                                blackImage.copyTo(dst);
                            }
                            else if (node.glitchEffectType === 'Glass') {
                                cv.cvtColor(src, dst, cv.COLOR_RGBA2RGB, 0);
                                for (var x = 0; x < src.cols; x++) {
                                    for (var y = 0; y < src.rows; y++) {
                                        let randx = Math.round(Math.random() * node.glitchEffectSize * 2 - node.glitchEffectSize);
                                        let randy = Math.round(Math.random() * node.glitchEffectSize * 2 - node.glitchEffectSize);
                                        try {
                                            let pixel = src.ucharPtr(y + randy, x + randx);
                                            dst.data[y * dst.cols * dst.channels() + x * dst.channels()] = pixel[0];
                                            dst.data[y * dst.cols * dst.channels() + x * dst.channels() + 1] = pixel[1];
                                            dst.data[y * dst.cols * dst.channels() + x * dst.channels() + 2] = pixel[2];
                                        }
                                        catch { }
                                    }
                                }
                            }
                            else if (node.glitchEffectType === 'Caricature') {
                                let p = new cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC3);

                                for (var x = 0; x < p.cols; x++) {
                                    for (var y = 0; y < p.rows; y++) {
                                        let cart, polar = cartesian2polar(x - p.cols / 2, y - p.rows / 2);
                                        cart = polar2cartesian(Math.sqrt(polar[0] * node.glitchEffectSize * 10), polar[1]);

                                        let pixel = src.ucharPtr(Math.round(cart[1]) + p.rows / 2, Math.round(cart[0]) + p.cols / 2);
                                        p.data[y * p.cols * p.channels() + x * p.channels()] = pixel[0];
                                        p.data[y * p.cols * p.channels() + x * p.channels() + 1] = pixel[1];
                                        p.data[y * p.cols * p.channels() + x * p.channels() + 2] = pixel[2];
                                    }
                                }
                                p.copyTo(dst);
                                p.delete();
                            }
                            else if (node.glitchEffectType === 'Slice Glitch') {
                                src.copyTo(dst);

                                const numSlices = Math.random() * 5 * node.glitchEffectSize;
                                const sliceHeight = Math.floor(src.rows / numSlices);

                                for (let i = 0; i < numSlices; i++) {
                                    if (Math.random() > 1 - node.glitchEffectSize / 100) {
                                        let maxOffset = Math.floor(src.cols * node.glitchEffectSize * 0.005);
                                        if (maxOffset < 1) maxOffset = 1;

                                        let shiftX = Math.floor((Math.random() - 0.5) * maxOffset);
                                        if (shiftX === 0) continue;

                                        let y = i * sliceHeight;
                                        let currentSliceHeight = (y + sliceHeight > src.rows) ? (src.rows - y) : sliceHeight;
                                        if (currentSliceHeight <= 0) continue;

                                        let srcX, destX, roiWidth;
                                        if (shiftX > 0) {
                                            srcX = 0;
                                            destX = shiftX;
                                            roiWidth = src.cols - shiftX;
                                        }
                                        else {
                                            srcX = -shiftX;
                                            destX = 0;
                                            roiWidth = src.cols + shiftX;
                                        }
                                        if (roiWidth > 0) {
                                            let srcRect = new cv.Rect(srcX, y, roiWidth, currentSliceHeight);
                                            let destRect = new cv.Rect(destX, y, roiWidth, currentSliceHeight);

                                            let srcRoi = src.roi(srcRect);
                                            let destRoi = dst.roi(destRect);

                                            srcRoi.copyTo(destRoi);
                                            srcRoi.delete();
                                            destRoi.delete();
                                        }
                                    }
                                }
                            }
                            M1.delete(); M3.delete();
                        }
                        else if (title === 'Channel Mixer') {
                            if (node.lastState === node.channelMixerValues + mean) {
                                src.delete(); dst.delete();
                                return;
                            }
                            node.lastState = node.channelMixerValues;

                            let channels = new cv.MatVector();
                            let newRGB = new cv.MatVector();
                            cv.split(src, channels);

                            let Rchannel = channels.get(0);
                            let Gchannel = channels.get(1);
                            let Bchannel = channels.get(2);
                            channels.delete();

                            let scalar, temp = new cv.Mat();
                            let matrix = new cv.Mat(Rchannel.rows, Rchannel.cols, Rchannel.type());
                            let newR = new cv.Mat.zeros(Rchannel.rows, Rchannel.cols, Rchannel.type());
                            scalar = new cv.Scalar(node.channelMixerValues[0]);
                            matrix.setTo(scalar);
                            cv.multiply(Rchannel, matrix, temp);
                            cv.add(newR, temp, newR);
                            scalar = new cv.Scalar(node.channelMixerValues[3]);
                            matrix.setTo(scalar);
                            cv.multiply(Gchannel, matrix, temp);
                            cv.add(newR, temp, newR);
                            scalar = new cv.Scalar(node.channelMixerValues[6]);
                            matrix.setTo(scalar);
                            cv.multiply(Bchannel, matrix, temp);
                            cv.add(newR, temp, newR);
                            cv.normalize(newR, newR, 0, 255, cv.NORM_MINMAX);
                            newRGB.push_back(newR);
                            newR.delete();

                            let newG = new cv.Mat.zeros(Gchannel.rows, Gchannel.cols, Gchannel.type());
                            scalar = new cv.Scalar(node.channelMixerValues[1]);
                            matrix.setTo(scalar);
                            cv.multiply(Rchannel, matrix, temp);
                            cv.add(newG, temp, newG);
                            scalar = new cv.Scalar(node.channelMixerValues[4]);
                            matrix.setTo(scalar);
                            cv.multiply(Gchannel, matrix, temp);
                            cv.add(newG, temp, newG);
                            scalar = new cv.Scalar(node.channelMixerValues[7]);
                            matrix.setTo(scalar);
                            cv.multiply(Bchannel, matrix, temp);
                            cv.add(newG, temp, newG);
                            cv.normalize(newG, newG, 0, 255, cv.NORM_MINMAX);
                            newRGB.push_back(newG);
                            newG.delete();

                            let newB = new cv.Mat.zeros(Bchannel.rows, Bchannel.cols, Bchannel.type());
                            scalar = new cv.Scalar(node.channelMixerValues[2]);
                            matrix.setTo(scalar);
                            cv.multiply(Rchannel, matrix, temp);
                            cv.add(newB, temp, newB);
                            scalar = new cv.Scalar(node.channelMixerValues[5]);
                            matrix.setTo(scalar);
                            cv.multiply(Gchannel, matrix, temp);
                            cv.add(newB, temp, newB);
                            scalar = new cv.Scalar(node.channelMixerValues[8]);
                            matrix.setTo(scalar);
                            cv.multiply(Bchannel, matrix, temp);
                            cv.add(newB, temp, newB);
                            cv.normalize(newB, newB, 0, 255, cv.NORM_MINMAX);
                            newRGB.push_back(newB);
                            newB.delete();

                            Rchannel.delete(); Gchannel.delete(); Bchannel.delete();
                            temp.delete(); matrix.delete();
                            cv.merge(newRGB, dst);
                            newRGB.delete();
                        }
                        else if (title === 'Thresholding') {
                            if (node.lastState === node.thresholdingChecked + node.thresholdValue + mean) {
                                src.delete(); dst.delete();
                                return;
                            }
                            node.lastState = node.thresholdingChecked + node.thresholdValue;

                            let channels = new cv.MatVector();
                            cv.split(src, channels);
                            let R = channels.get(0);
                            let G = channels.get(1);
                            let B = channels.get(2);
                            channels.delete();

                            let final = new cv.MatVector();
                            let block = node.thresholdValue * 2 + 1;

                            let tmpR = new cv.Mat();
                            if (node.thresholdingChecked[0] === "checked") cv.threshold(R, tmpR, node.thresholdValue, 255, cv.THRESH_BINARY);
                            else if (node.thresholdingChecked[1] === "checked") cv.threshold(R, tmpR, 0, node.thresholdValue, cv.THRESH_OTSU);
                            else cv.adaptiveThreshold(R, tmpR, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, 0);
                            R.delete();
                            final.push_back(tmpR);
                            tmpR.delete();

                            tmpG = new cv.Mat();
                            if (node.thresholdingChecked[0] === "checked") cv.threshold(G, tmpG, node.thresholdValue, 255, cv.THRESH_BINARY);
                            else if (node.thresholdingChecked[1] === "checked") cv.threshold(G, tmpG, 0, node.thresholdValue, cv.THRESH_OTSU);
                            else cv.adaptiveThreshold(G, tmpG, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, 0);
                            G.delete();
                            final.push_back(tmpG);
                            tmpG.delete();

                            tmpB = new cv.Mat();
                            if (node.thresholdingChecked[0] === "checked") cv.threshold(B, tmpB, node.thresholdValue, 255, cv.THRESH_BINARY);
                            else if (node.thresholdingChecked[1] === "checked") cv.threshold(B, tmpB, 0, node.thresholdValue, cv.THRESH_OTSU);
                            else cv.adaptiveThreshold(B, tmpB, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, 0);
                            B.delete();
                            final.push_back(tmpB);
                            tmpB.delete();

                            cv.merge(final, dst);
                            final.delete();
                        }
                        else if (title === 'Live Editor') {
                            if (node.lastState === mean && node.previousCode === node.skeletonCode) {
                                src.delete(); dst.delete();
                                return;
                            }
                            node.lastState = '';

                            try {
                                eval(node.skeletonCode.replace(/INPUT/g, 'src').replace(/OUTPUT/g, 'dst'));
                                node.previousCode = node.skeletonCode;
                            }
                            catch {
                                src.delete(); dst.delete();
                                return;
                            }
                        }
                        else if (title === 'Superpixels') {
                            if (node.lastState === node.kValue + mean) {
                                src.delete(); dst.delete();
                                return;
                            }
                            node.lastState = node.kValue;

                            cv.cvtColor(src, src, cv.COLOR_RGBA2RGB);
                            const pixelData = src.data;
                            const numPixels = src.cols * src.rows;

                            let data = new cv.Mat(numPixels, 3, cv.CV_32F);
                            let data_ptr = data.data32F;

                            for (let i = 0; i < numPixels; i++) {
                                data_ptr[i * 3 + 0] = pixelData[i * 3 + 0];
                                data_ptr[i * 3 + 1] = pixelData[i * 3 + 1];
                                data_ptr[i * 3 + 2] = pixelData[i * 3 + 2];
                            }
                            let labels = new cv.Mat();
                            let centers = new cv.Mat();
                            const criteria = new cv.TermCriteria(cv.TermCriteria_EPS + cv.TermCriteria_MAX_ITER, 10, 1.0);
                            cv.kmeans(data, node.kValue, labels, criteria, 3, cv.KMEANS_PP_CENTERS, centers);

                            data.delete();
                            centers.convertTo(centers, cv.CV_8U);
                            dst = new cv.Mat(src.rows, src.cols, cv.CV_8UC3);

                            const labels_ptr = labels.data32S;
                            const centers_ptr = centers.data;
                            const dst_ptr = dst.data;

                            for (let i = 0; i < labels_ptr.length; i++) {
                                const cluster_id = labels_ptr[i];
                                const c_ptr = cluster_id * 3;
                                const d_ptr = i * 3;
                                dst_ptr[d_ptr + 0] = centers_ptr[c_ptr + 0];
                                dst_ptr[d_ptr + 1] = centers_ptr[c_ptr + 1];
                                dst_ptr[d_ptr + 2] = centers_ptr[c_ptr + 2];
                            }
                            labels.delete(); centers.delete();
                        }
                        else if (title === 'Background Subtraction') {
                            if (node.lastState === mean) {
                                src.delete(); dst.delete();
                                return;
                            }
                            node.lastState = '';

                            cv.cvtColor(src, src, cv.COLOR_RGBA2RGB);
                            let tmp = new cv.Mat();
                            node.fgbg.apply(src, tmp);
                            let rgb = new cv.Mat();
                            cv.cvtColor(tmp, rgb, cv.COLOR_GRAY2RGB);
                            tmp.delete();
                            cv.bitwise_and(src, rgb, dst);
                            rgb.delete();
                        }
                        else if (title === 'Optical Flow') {
                            if (node.lastState === node.opticalFlowSize + mean) {
                                src.delete(); dst.delete();
                                return;
                            }
                            node.lastState = node.opticalFlowSize;

                            if (node.checkFirstFrame) {
                                if (previousImage) previousImage.delete();
                                previousImage = new cv.Mat();
                                cv.cvtColor(src, previousImage, cv.COLOR_RGBA2GRAY);
                                node.checkFirstFrame = false;
                                return;
                            }
                            let next = new cv.Mat(src.rows, src.cols, cv.CV_8UC1);
                            let flow = new cv.Mat(src.rows, src.cols, cv.CV_32FC2);
                            let flowVec = new cv.MatVector();
                            let win = node.opticalFlowSize;

                            cv.cvtColor(src, next, cv.COLOR_RGBA2GRAY);
                            cv.calcOpticalFlowFarneback(previousImage, next, flow, 0.5, 3, win + 1, 3, 5, 1.2, 0);
                            next.copyTo(previousImage);
                            next.delete();

                            cv.split(flow, flowVec);
                            flow.delete();

                            let u = flowVec.get(0);
                            let v = flowVec.get(1);
                            flowVec.delete();

                            dst = new cv.Mat(src.rows, src.cols, cv.CV_8UC3, new cv.Scalar(0, 0, 0));

                            for (var i = 0; i < src.cols; i += win) {
                                for (var j = 0; j < src.rows; j += win) {
                                    let pixel = src.ucharPtr(j, i);
                                    let x = u.data32F[j * src.cols + i];
                                    let y = v.data32F[j * src.cols + i];
                                    let p1 = new cv.Point(i, j);
                                    let p2 = new cv.Point(i + x, j + y);

                                    cv.line(dst, p1, p2, pixel, win / 3);
                                }
                            }
                            u.delete(); v.delete();
                        }
                    }
                    cv.imshow(node.canvas, dst);
                    src.delete(); dst.delete();

                    node.outputValues.output = node.canvas;
                    node.lastState += mean;
                }
                catch (err) { console.log("OpenCV Error:", err); }
            }
        };
    }
    else if (type === 'Transition') {
        node.inputs.push({ name: 'input1' }, { name: 'input2' }, { name: 'control' });
        node.outputs.push({ name: 'output' });

        node.canvas = document.createElement('canvas');
        node.canvas.className = 'inner-canvas';
        node.canvas.width = 256;
        node.canvas.height = 256;

        node.transitionTypes = ['Fade', 'Wipe', 'Upwards', 'Diagonal', 'Iris', 'Radial', 'Dissolve'];
        node.transitionType = 'Fade';
        node.progress = 0;
        node.transitionDuration = 1;

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const renderer = new THREE.WebGLRenderer({ canvas: node.canvas, antialias: true });

        const shaderLeft = 'uniform sampler2D tex1; uniform sampler2D tex2; uniform float progress; varying vec2 UV; void main() { gl_FragColor = mix(texture2D(tex1, UV), texture2D(tex2, UV), ';
        const shaderRight = '); }';

        node.transitionShaders = {
            Fade: `progress`,
            Wipe: `step(UV.x, progress)`,
            Upwards: `step(UV.y, progress)`,
            Diagonal: `step(UV.x + UV.y, progress * 2.0)`,
            Iris: `step(distance(UV, vec2(0.5)), progress * 0.707)`,
            Radial: `step((atan(UV.y - 0.5, UV.x - 0.5) + 3.14) / (2.0 * 3.14), progress)`,
            Dissolve: `step(fract(sin(dot(UV.xy, vec2(12.9898,78.233))) * 43758.5453123), progress)`
        };

        const material = new THREE.ShaderMaterial({
            uniforms: {
                tex1: { value: null },
                tex2: { value: null },
                progress: { value: 0 }
            },
            vertexShader: 'varying vec2 UV; void main() { UV = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: shaderLeft + node.transitionShaders.fade + shaderRight
        });

        const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(plane);

        node.playTransition = (dir) => {
            gsap.to(node, { progress: dir, duration: node.transitionDuration, ease: "power2.inOut", repeat: 0 });
        };

        node.onExecute = () => {
            const source1 = getInputData(node, 0);
            const source2 = getInputData(node, 1);
            const sourceIsValid = source1 && source2 && (source1.width > 0 || source1.videoWidth > 0) && (source2.width > 0 || source2.videoWidth > 0);

            if (sourceIsValid) {
                const newWidth = source1.naturalWidth || source1.videoWidth || source1.width;
                const newHeight = source1.naturalHeight || source1.videoHeight || source1.height;
                if (node.canvas.width !== newWidth || node.canvas.height !== newHeight) {
                    renderer.setSize(newWidth, newHeight, false);
                }
                material.uniforms.tex1.value = new THREE.CanvasTexture(source1);
                material.uniforms.tex2.value = new THREE.CanvasTexture(source2);
                material.uniforms.progress.value = node.progress;
                material.fragmentShader = shaderLeft + node.transitionShaders[node.transitionType] + shaderRight;
                material.needsUpdate = true;

                const sourceControl = getInputData(node, 2);
                if (sourceControl && sourceControl.length == 2) {
                    try {
                        let playTrans = calculateLandmarks(sourceControl);
                        let ix = document.getElementById('transitionPlay').value * 1;
                        if (playTrans[ix]) {
                            if (node.progress == 0) node.playTransition(1.0);
                            else if (node.progress == 1) node.playTransition(0);
                        }
                    }
                    catch { }
                }
                else if (sourceControl && sourceControl.length == 5 && sourceControl[3] === 'disabled' && sourceControl[0] == 1) {
                    if (node.progress == 0) setTimeout(function () { node.playTransition(1.0); }, 1000);
                    else if (node.progress == 1) setTimeout(function () { node.playTransition(0); }, 1000);
                }
                else if (sourceControl && sourceControl.length == 3) {
                    node.progress = sourceControl[0] + sourceControl[1] + sourceControl[2];
                    controlParams = sourceControl[0] + sourceControl[1] + sourceControl[2];
                    if (node.progress == 0) setTimeout(function () { node.playTransition(1.0); }, 1000);
                    else if (node.progress == 1) setTimeout(function () { node.playTransition(0); }, 1000);
                }
            }
            renderer.render(scene, camera);
            node.outputValues.output = node.canvas;
        };
    }
    else if (type === 'Mixer') {
        node.inputs.push({ name: 'input1' });
        node.inputs.push({ name: 'input2' });
        node.outputs.push({ name: 'output' });

        node.canvas = document.createElement('canvas');
        node.canvas.className = 'inner-canvas';
        node.ctx = node.canvas.getContext('2d', { willReadFrequently: true });

        node.helperCanvas = document.createElement('canvas');
        node.hCtx = node.helperCanvas.getContext('2d', { willReadFrequently: true });

        node.bypass = "checked";
        node.lastState = '';

        if (title === 'Matrix Operations') {
            node.inputs.push({ name: 'control' });
            node.operationType = 'Min';
            node.matrixOperations = ['Min', 'Max', 'Add', 'Subtract', 'Multiply', 'Divide'];
            node.operationWeight = 0.5;
            node.previousCode = '';

            node.operationCode = {
                Min: `cv.min(INPUT1, INPUT2, OUTPUT);`,
                Max: `cv.max(INPUT1, INPUT2, OUTPUT);`,
                Add: `cv.add(INPUT1, INPUT2, OUTPUT);`,
                Subtract: `cv.absdiff(INPUT1, INPUT2, OUTPUT);`,
                Multiply: `cv.multiply(INPUT1, INPUT2, OUTPUT);`,
                Divide: `cv.divide(INPUT1, INPUT2, OUTPUT); cv.normalize(OUTPUT, OUTPUT, 0, 1, cv.NORM_MINMAX, cv.CV_32F);`
            };
        }
        else if (title === 'Color Blending') {
            node.hueBlendChecked = "checked";
            node.satBlendChecked = "checked";
            node.valBlendChecked = "";
        }
        else if (title === 'Concatenation') {
            node.inputs.push({ name: 'control' });
            node.concatenationAlignment = 1;
            node.concatenationChecked = ["checked", ""];
        }
        node.onExecute = () => {
            if (!openCvReady) return;
            const sourceElement1 = getInputData(node, 0);
            const sourceElement2 = getInputData(node, 1);
            const sourceIsValid1 = sourceElement1 && (sourceElement1.naturalWidth > 0 || sourceElement1.videoWidth > 0 || sourceElement1.width > 0);
            const sourceIsValid2 = sourceElement2 && (sourceElement2.naturalWidth > 0 || sourceElement2.videoWidth > 0 || sourceElement2.width > 0);
            if (sourceIsValid1 && sourceIsValid2) {
                let src1, temp;
                try { src1 = cv.imread(sourceElement1); }
                catch {
                    try {
                        node.helperCanvas.width = sourceElement1.naturalWidth || sourceElement1.videoWidth || sourceElement1.width;
                        node.helperCanvas.height = sourceElement1.naturalHeight || sourceElement1.videoHeight || sourceElement1.height;
                        node.hCtx.drawImage(sourceElement1, 0, 0, node.helperCanvas.width, node.helperCanvas.height);
                        src1 = cv.imread(node.helperCanvas);
                    }
                    catch { return; }
                }
                try { temp = cv.imread(sourceElement2); }
                catch {
                    try {
                        node.helperCanvas.width = sourceElement2.naturalWidth || sourceElement2.videoWidth || sourceElement2.width;
                        node.helperCanvas.height = sourceElement2.naturalHeight || sourceElement2.videoHeight || sourceElement2.height;
                        node.hCtx.drawImage(sourceElement2, 0, 0, node.helperCanvas.width, node.helperCanvas.height);
                        temp = cv.imread(node.helperCanvas);
                    }
                    catch { src1.delete(); return; }
                }
                try {
                    let mean1 = cv.mean(src1) + node.bypass;
                    let dst = new cv.Mat();

                    if (node.bypass === "") {
                        src1.copyTo(dst);
                        temp.delete();
                    }
                    else {
                        let src2 = new cv.Mat();
                        cv.resize(temp, src2, new cv.Size(src1.cols, src1.rows), 0, 0, cv.INTER_CUBIC);
                        temp.delete();

                        let mean2 = cv.mean(src2);
                        if (title === 'Matrix Operations') {
                            let controlParams = '';
                            const sourceControl = getInputData(node, 2);
                            if (sourceControl) [node.operationWeight, controlParams] = sliderControl(sourceControl, 'weights' + node.id, 'matrixSlider', node.operationWeight, controlParams, 0.1, 0.01, 0.99, sourceControl[1] * 0.001, (sourceControl[0] + sourceControl[1] + sourceControl[2]) / 3 + 0.01);

                            if (node.lastState === controlParams + node.operationType + node.operationWeight + mean2 + mean1 && node.previousCode === node.operationCode[node.operationType]) {
                                src1.delete(); src2.delete(); dst.delete();
                                return;
                            }
                            node.lastState = controlParams + node.operationType + node.operationWeight;

                            try {
                                const presetLeft = `cv.normalize(INPUT1, INPUT1, 0, 255 * (1 - WEIGHT), cv.NORM_MINMAX, cv.CV_8U); cv.normalize(INPUT2, INPUT2, 0, 255 * WEIGHT, cv.NORM_MINMAX, cv.CV_8U); `;
                                const presetRight = ` cv.normalize(OUTPUT, OUTPUT, 0, 255, cv.NORM_MINMAX);`;
                                const opCode = presetLeft + node.operationCode[node.operationType] + presetRight;

                                eval(opCode.replace(/INPUT1/g, 'src1').replace(/INPUT2/g, 'src2').replace(/OUTPUT/g, 'dst').replace(/WEIGHT/g, 'node.operationWeight'));
                                node.previousCode = node.operationCode[node.operationType];
                            }
                            catch {
                                src1.delete(); src2.delete(); dst.delete();
                                return;
                            }
                        }
                        else if (title === 'Color Blending') {
                            if (node.lastState === node.hueBlendChecked + node.satBlendChecked + node.valBlendChecked + mean2 + mean1) {
                                src1.delete(); src2.delete(); dst.delete();
                                return;
                            }
                            node.lastState = node.hueBlendChecked + node.satBlendChecked + node.valBlendChecked;

                            let hsv1 = new cv.Mat(), hsv2 = new cv.Mat();
                            cv.cvtColor(src1, hsv1, cv.COLOR_RGB2HSV);
                            cv.cvtColor(src2, hsv2, cv.COLOR_RGB2HSV);

                            let channels1 = new cv.MatVector(), channels2 = new cv.MatVector();
                            cv.split(hsv1, channels1); cv.split(hsv2, channels2);
                            hsv1.delete(); hsv2.delete();

                            let hue1 = channels1.get(0), sat1 = channels1.get(1), val1 = channels1.get(2);
                            let hue2 = channels2.get(0), sat2 = channels2.get(1), val2 = channels2.get(2);
                            channels1.delete(); channels2.delete();

                            let final = new cv.MatVector();
                            if (node.hueBlendChecked) final.push_back(hue2); else final.push_back(hue1);
                            if (node.satBlendChecked) final.push_back(sat2); else final.push_back(sat1);
                            if (node.valBlendChecked) final.push_back(val2); else final.push_back(val1);
                            hue1.delete(); sat1.delete(); val1.delete(); hue2.delete(); sat2.delete(); val2.delete();

                            cv.merge(final, dst);
                            final.delete();
                            cv.cvtColor(dst, dst, cv.COLOR_HSV2RGB);
                        }
                        else if (title === 'Concatenation') {
                            let controlParams = '';
                            const sourceControl = getInputData(node, 2);
                            if (sourceControl) [node.concatenationAlignment, controlParams] = sliderControl(sourceControl, 'overlap' + node.id, 'concatSlider', node.concatenationAlignment, controlParams, 0.1, 0, 1, sourceControl[1] * 0.001, 1 - (sourceControl[0] + sourceControl[1] + sourceControl[2]) / 3);

                            if (node.lastState === controlParams + node.concatenationChecked + node.concatenationAlignment + mean2 + mean1) {
                                src1.delete(); src2.delete(); dst.delete();
                                return;
                            }
                            node.lastState = controlParams + node.concatenationChecked + node.concatenationAlignment;

                            let roi;
                            if (node.concatenationChecked[0] === "checked") {
                                let pad = Math.round(node.concatenationAlignment * src1.cols);
                                cv.copyMakeBorder(src1, dst, 0, 0, 0, pad, cv.BORDER_REPLICATE);
                                let rect = new cv.Rect(pad, 0, src2.cols, src2.rows);
                                roi = dst.roi(rect);
                            }
                            else {
                                let pad = Math.round(node.concatenationAlignment * src1.rows);
                                cv.copyMakeBorder(src1, dst, 0, pad, 0, 0, cv.BORDER_REPLICATE);
                                let rect = new cv.Rect(0, pad, src2.cols, src2.rows);
                                roi = dst.roi(rect);
                            }
                            src2.copyTo(roi);
                            roi.delete();
                        }
                        src2.delete();
                        node.lastState += mean2;
                    }
                    cv.imshow(node.canvas, dst);
                    src1.delete(); dst.delete();

                    node.outputValues.output = node.canvas;
                    node.lastState += mean1;
                }
                catch (err) { console.log("OpenCV Error:", err); }
            }
        };
    }
    else if (type === 'Features') {
        node.inputs.push({ name: 'input1' });
        node.inputs.push({ name: 'input2' });
        node.outputs.push({ name: 'output' });

        node.canvas = document.createElement('canvas');
        node.canvas.className = 'inner-canvas';
        node.ctx = node.canvas.getContext('2d', { willReadFrequently: true });

        node.lastInput1 = -1;
        node.lastInput2 = -1;

        node.onExecute = () => {
            if (!openCvReady) return;
            const sourceElement1 = getInputData(node, 0);
            const sourceElement2 = getInputData(node, 1);
            const sourceIsValid1 = sourceElement1 && (sourceElement1.naturalWidth > 0 || sourceElement1.videoWidth > 0 || sourceElement1.width > 0);
            const sourceIsValid2 = sourceElement2 && (sourceElement2.naturalWidth > 0 || sourceElement2.videoWidth > 0 || sourceElement2.width > 0);
            if (sourceIsValid1 && sourceIsValid2) {
                let src1, src2;
                try { src1 = cv.imread(sourceElement1); }
                catch {
                    try {
                        node.canvas.width = sourceElement1.naturalWidth || sourceElement1.videoWidth || sourceElement1.width;
                        node.canvas.height = sourceElement1.naturalHeight || sourceElement1.videoHeight || sourceElement1.height;
                        node.ctx.drawImage(sourceElement1, 0, 0, node.canvas.width, node.canvas.height);
                        src1 = cv.imread(node.canvas);
                    }
                    catch { return; }
                }
                try { src2 = cv.imread(sourceElement2); }
                catch {
                    try {
                        node.canvas.width = sourceElement2.naturalWidth || sourceElement2.videoWidth || sourceElement2.width;
                        node.canvas.height = sourceElement2.naturalHeight || sourceElement2.videoHeight || sourceElement2.height;
                        node.ctx.drawImage(sourceElement2, 0, 0, node.canvas.width, node.canvas.height);
                        src2 = cv.imread(node.canvas);
                    }
                    catch { src1.delete(); return; }
                }
                try {
                    let mean1 = cv.mean(src1);
                    let mean2 = cv.mean(src2);

                    if (node.lastInput1 === mean1[0] + mean1[1] + mean1[2] && node.lastInput2 === mean2[0] + mean2[1] + mean2[2]) {
                        src1.delete(); src2.delete();
                        return;
                    }
                    node.lastInput1 = mean1[0] + mean1[1] + mean1[2];
                    node.lastInput2 = mean2[0] + mean2[1] + mean2[2];

                    let temp = new cv.Mat();
                    let borderType = cv.BORDER_CONSTANT;
                    let color = new cv.Scalar(0, 0, 0, 255);
                    cv.copyMakeBorder(src2, temp, src1.rows, src1.rows, src1.cols, src1.cols, borderType, color);

                    let im1 = new cv.Mat();
                    let im2 = new cv.Mat();
                    cv.cvtColor(src1, im1, cv.COLOR_RGBA2GRAY);
                    cv.cvtColor(temp, im2, cv.COLOR_RGBA2GRAY);

                    let keypoints1 = new cv.KeyPointVector();
                    let keypoints2 = new cv.KeyPointVector();
                    let descriptors1 = new cv.Mat();
                    let descriptors2 = new cv.Mat();

                    var orb = new cv.ORB(5000);
                    orb.detectAndCompute(im1, new cv.Mat(), keypoints1, descriptors1);
                    orb.detectAndCompute(im2, new cv.Mat(), keypoints2, descriptors2);
                    im1.delete(); im2.delete(); orb.delete();

                    let bf = new cv.BFMatcher(cv.NORM_HAMMING, true);
                    let matches = new cv.DMatchVector();
                    bf.match(descriptors1, descriptors2, matches);
                    descriptors1.delete(); descriptors2.delete(); bf.delete();

                    let good_matches = new cv.DMatchVector();
                    for (let i = 0; i < matches.size(); i++) {
                        if (matches.get(i).distance < 30) {
                            good_matches.push_back(matches.get(i));
                        }
                    }
                    matches.delete();

                    let points1 = [];
                    let points2 = [];

                    for (let i = 0; i < good_matches.size(); i++) {
                        points1.push(keypoints1.get(good_matches.get(i).queryIdx).pt.x);
                        points1.push(keypoints1.get(good_matches.get(i).queryIdx).pt.y);
                        points2.push(keypoints2.get(good_matches.get(i).trainIdx).pt.x);
                        points2.push(keypoints2.get(good_matches.get(i).trainIdx).pt.y);
                    }
                    good_matches.delete(); keypoints1.delete(); keypoints2.delete();

                    let mat1 = cv.matFromArray(points1.length, 2, cv.CV_32F, points1);
                    let mat2 = cv.matFromArray(points2.length, 2, cv.CV_32F, points2);
                    let h = cv.findHomography(mat1, mat2, cv.RANSAC);
                    mat1.delete(); mat2.delete();

                    let dst = new cv.Mat();
                    cv.warpPerspective(src1, dst, h, temp.size());
                    cv.max(dst, temp, dst);
                    h.delete(); src1.delete(); src2.delete(); temp.delete();

                    let gray = new cv.Mat();
                    cv.cvtColor(dst, gray, cv.COLOR_RGBA2GRAY);

                    let thresh = new cv.Mat();
                    cv.threshold(gray, thresh, 1, 255, cv.THRESH_BINARY);
                    gray.delete();

                    let contours = new cv.MatVector();
                    let hierarchy = new cv.Mat();
                    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
                    thresh.delete(); hierarchy.delete();

                    if (contours.size() > 0) {
                        let maxArea = 0;
                        let maxRect = null;
                        for (let i = 0; i < contours.size(); i++) {
                            let rect = cv.boundingRect(contours.get(i));
                            let area = rect.width * rect.height;
                            if (area > maxArea) {
                                maxArea = area;
                                maxRect = rect;
                            }
                        }
                        if (maxRect) {
                            let cropped = dst.roi(maxRect);
                            cv.imshow(node.canvas, cropped);
                            cropped.delete();
                        }
                    }
                    else cv.imshow(node.canvas, dst);
                    contours.delete(); dst.delete();

                    node.outputValues.output = node.canvas;
                }
                catch (err) { console.log("OpenCV Error:", err); }
            }
        };
    }
    else if (type === 'MediaPipe') {
        node.inputs.push({ name: 'input' });
        node.outputs.push({ name: 'output' });
        node.outputs.push({ name: 'control' });
        node.canvas = document.createElement('canvas');
        node.canvas.className = 'inner-canvas';
        node.ctx = node.canvas.getContext('2d', { willReadFrequently: true });

        node.checkFirstFrame = true;
        node.sliderDisabled = '';
        node.detectionConfidence = 0.5;
        node.poseData = null;

        const statusEl = document.getElementById('opencv-status');
        statusEl.textContent = 'Loading MediaPipe...';
        statusEl.style.backgroundColor = 'goldenrod';

        node.pose = new Pose({
            locateFile: (file) => {
                return `js/pose/${file}`;
            }
        });
        function onResults(results) {
            if (statusEl.style.display == 'block') {
                statusEl.textContent = 'MediaPipe Ready';
                statusEl.style.backgroundColor = 'darkolivegreen';
                setTimeout(() => statusEl.style.display = 'none', 1500);
            }
            if (!results.poseLandmarks) return;
            node.ctx.save();
            node.ctx.clearRect(0, 0, node.canvas.width, node.canvas.height);
            node.ctx.drawImage(results.image, 0, 0);
            node.ctx.globalCompositeOperation = 'destination-in';
            node.ctx.drawImage(results.segmentationMask, 0, 0);
            node.ctx.restore();

            node.poseData = results.poseLandmarks;
            node.poseWorldData = results.poseWorldLandmarks;
        }
        node.pose.onResults(onResults);

        node.onExecute = () => {
            const sourceElement = getInputData(node, 0);
            const sourceIsValid = sourceElement && (sourceElement.naturalWidth > 0 || sourceElement.videoWidth > 0 || sourceElement.width > 0);
            if (sourceIsValid) {
                let width = sourceElement.naturalWidth || sourceElement.videoWidth || sourceElement.width;
                let height = sourceElement.naturalHeight || sourceElement.videoHeight || sourceElement.height;

                if (node.canvas.width !== width) node.canvas.width = width;
                if (node.canvas.height !== height) node.canvas.height = height;

                try {
                    if (node.checkFirstFrame) {
                        node.pose.setOptions({
                            modelComplexity: 1,
                            smoothLandmarks: true,
                            enableSegmentation: true,
                            smoothSegmentation: true,
                            minDetectionConfidence: node.detectionConfidence,
                            minTrackingConfidence: 0.5
                        });
                        node.sliderDisabled = 'disabled';
                        document.getElementById('confidenceRange' + node.id).disabled = true;

                        let interval;
                        async function mediaP() {
                            try {
                                await node.pose.send({ image: sourceElement });
                                interval = setTimeout(mediaP, 50);
                            }
                            catch {
                                clearInterval(interval);
                                node.pose = new Pose({
                                    locateFile: (file) => {
                                        return `js/pose/${file}`;
                                    }
                                });
                                node.pose.onResults(onResults);
                                node.checkFirstFrame = true;
                            }
                        }
                        mediaP();
                        node.checkFirstFrame = false;
                        statusEl.style.display = "block";
                    }
                }
                catch (err) { console.log("MediaPipe Error:", err); }
            }
            node.outputValues.output = node.canvas;
            node.outputValues.control = [node.poseData, node.poseWorldData];
        };
    }
    else if (type === 'Character') {
        node.inputs.push({ name: 'control' });
        node.outputs.push({ name: 'output' });

        const scene = new THREE.Scene();
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
        node.camera = new THREE.PerspectiveCamera(45, screen.width / screen.height, 1, 100);
        node.camera.position.set(0, 1.5, 3);

        renderer.domElement.style.display = "none";
        renderer.setSize(screen.width, screen.height);
        renderer.setClearColor(0x000000, 0);

        const light = new THREE.DirectionalLight(0xffffff);
        light.position.set(1, 1, 1).normalize();
        scene.add(light);

        const controls = new THREE.OrbitControls(node.camera, renderer.domElement);
        controls.screenSpacePanning = true;
        controls.target.set(0, 1, 0);
        controls.enableZoom = true;
        controls.update();

        node.currentVrm = null;
        const clock = new THREE.Clock();
        const lerp = Kalidokit.Vector.lerp;

        const rigRotation = (
            name,
            rotation = { x: 0, y: 0, z: 0 },
            dampener = 1,
            lerpAmount = 0.3
        ) => {
            if (!node.currentVrm) { return }
            const Part = node.currentVrm.humanoid.getBoneNode(
                THREE.VRMSchema.HumanoidBoneName[name]
            );
            if (!Part) { return }

            let euler = new THREE.Euler(
                rotation.x * dampener,
                rotation.y * dampener,
                rotation.z * dampener
            );
            let quaternion = new THREE.Quaternion().setFromEuler(euler);
            Part.quaternion.slerp(quaternion, lerpAmount);
        };
        const rigPosition = (
            name,
            position = { x: 0, y: 0, z: 0 },
            dampener = 1,
            lerpAmount = 0.3
        ) => {
            if (!node.currentVrm) { return }
            const Part = node.currentVrm.humanoid.getBoneNode(
                THREE.VRMSchema.HumanoidBoneName[name]
            );
            if (!Part) { return }
            let vector = new THREE.Vector3(
                position.x * dampener,
                position.y * dampener,
                position.z * dampener
            );
            Part.position.lerp(vector, lerpAmount);
        };

        const animateVRM = (vrm, results) => {
            if (!vrm) return;

            let riggedPose;
            const pose3DLandmarks = results[1];
            const pose2DLandmarks = results[0];

            if (pose2DLandmarks && pose3DLandmarks) {
                riggedPose = Kalidokit.Pose.solve(pose3DLandmarks, pose2DLandmarks, {
                    runtime: "mediapipe"
                });
                rigRotation("Hips", riggedPose.Hips.rotation, 0.7);
                rigPosition(
                    "Hips",
                    {
                        x: -riggedPose.Hips.position.x, // Reverse direction
                        y: riggedPose.Hips.position.y + 1, // Add a bit of height
                        z: -riggedPose.Hips.position.z // Reverse direction
                    },
                    1,
                    0.07
                );
                rigRotation("Chest", riggedPose.Spine, 0.25, .3);
                rigRotation("Spine", riggedPose.Spine, 0.45, .3);
                rigRotation("RightUpperArm", riggedPose.RightUpperArm, 1, .3);
                rigRotation("RightLowerArm", riggedPose.RightLowerArm, 1, .3);
                rigRotation("LeftUpperArm", riggedPose.LeftUpperArm, 1, .3);
                rigRotation("LeftLowerArm", riggedPose.LeftLowerArm, 1, .3);
                rigRotation("LeftUpperLeg", riggedPose.LeftUpperLeg, 1, .3);
                rigRotation("LeftLowerLeg", riggedPose.LeftLowerLeg, 1, .3);
                rigRotation("RightUpperLeg", riggedPose.RightUpperLeg, 1, .3);
                rigRotation("RightLowerLeg", riggedPose.RightLowerLeg, 1, .3);
            }
        };

        const loader = new THREE.GLTFLoader();
        loader.crossOrigin = "anonymous";
        node.loadModel = (url) => {
            loader.load(url, gltf => {
                THREE.VRMUtils.removeUnnecessaryJoints(gltf.scene);
                THREE.VRM.from(gltf).then(vrm => {
                    if (node.currentVrm) scene.remove(node.currentVrm.scene);
                    scene.add(vrm.scene);
                    node.currentVrm = vrm;
                    node.currentVrm.scene.rotation.y = Math.PI;
                }).catch(err => { alert(err); });
                URL.revokeObjectURL(url);
            }, undefined, (err) => { console.log(err); URL.revokeObjectURL(url); });
        };

        node.three = { scene, renderer, controls };
        node.onExecute = () => {
            if (!node.currentVrm) return;
            const sourceControl = getInputData(node, 0);
            if (sourceControl) {
                try {
                    animateVRM(node.currentVrm, sourceControl);
                    node.currentVrm.update(clock.getDelta());
                }
                catch (err) { console.log("Three.js Error:", err); }
                controls.update();
                renderer.render(scene, node.camera);
            }
            node.outputValues.output = renderer.domElement;

            renderer.domElement.style.display = "none";
            if (document.fullscreenElement === renderer.domElement) renderer.domElement.style.display = "block";
        };
    }
    return node;
}