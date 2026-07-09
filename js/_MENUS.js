let openCvReady = false;
let pendingWire = null;
let activeNode = null;

let nodes = [];
let connections = [];
let fsCanvas = [];
let fsCtx = [];
let fsIndex = [];

const gestureOptions = [
    { value: '0', name: 'Right hand raised and moving left/right' },
    { value: '1', name: 'Right hand raised and moving up/down' },
    { value: '2', name: 'Left hand raised and moving left/right' },
    { value: '3', name: 'Left hand raised and moving up/down' },
    { value: '4', name: 'Both hands raised and moving left/right' },
    { value: '5', name: 'Both hands raised and moving up/down' },
    { value: '6', name: 'Hands joined and moving left/right' },
    { value: '7', name: 'Hands joined and moving up/down' },
    { value: '8', name: 'Right hand extended and moving up/down' },
    { value: '9', name: 'Left hand extended and moving up/down' },
    { value: '10', name: 'Both hands extended and moving up/down' }
];
let gesturesHTML = gestureOptions.map(gesture => `<option value="${gesture.value}">${gesture.name}</option>`).join('');
let settingsHTML = document.getElementById('settings').getElementsByTagName('*');

for (var i = 0; i < settingsHTML.length; i++) {
    if (settingsHTML[i].tagName === 'SELECT') settingsHTML[i].innerHTML = gesturesHTML;
}

function initialize() {
    const paletteContainer = document.getElementById('node-palette');
    const graphContainer = document.getElementById('graph-container');

    paletteContainer.style.display = 'block';

    const paletteNodes = {
        "Capture": [{ title: "Image", type: "Input" }, { title: "Video / Audio", type: "Input" }, { title: "Camera / Microphone", type: "Input" }],
        "Generate": [{ title: "3D Text", type: "Text" }, { title: "Parametric Lines", type: "Parametric" }, { title: "Countdown / Keyframes", type: "Time" }],
        "Enhance": [{ title: "Gamma Correction", type: "Throughput" }, { title: "Histogram Equalization", type: "Throughput" }, { title: "Color Adjustment", type: "Throughput" }],
        "Filter": [{ title: "Convolution", type: "Throughput" }, { title: "Morphology / Rank", type: "Throughput" }, { title: "Sound Filters & Effects", type: "Audio" }],
        "Render": [{ title: "Projection", type: "3DScene" }, { title: "Mapping / Lighting", type: "3DScene" }, { title: "Character Animation", type: "Character" }],
        "Distort": [{ title: "Glitch Effects", type: "Throughput" }, { title: "Image Warping", type: "Interactive" }, { title: "Thresholding", type: "Throughput" }],
        "Mix": [{ title: "Matrix Operations", type: "Mixer" }, { title: "Channel Mixer", type: "Throughput" }, { title: "Color Blending", type: "Mixer" }],
        "Merge": [{ title: "Concatenation", type: "Mixer" }, { title: "Transitions", type: "Transition" }, { title: "Image Stitching", type: "Features" }],
        "Detect": [{ title: "Superpixels", type: "Throughput" }, { title: "Human Pose", type: "MediaPipe" }, { title: "Background Subtraction", type: "Throughput" }],
        "Visualize": [{ title: "Canvas Viewer", type: "Viewer" }, { title: "Optical Flow", type: "Throughput" }, { title: "Skeleton", type: "Throughput" }]
    };
    for (const category in paletteNodes) {
        const categoryBlock = document.createElement("div");
        paletteContainer.appendChild(categoryBlock);

        const categoryTitle = document.createElement("h3");
        categoryTitle.className = "palette-title";
        categoryTitle.textContent = category;
        categoryBlock.appendChild(categoryTitle);

        paletteNodes[category].forEach(nodeDef => {
            const nodeElement = document.createElement("div");
            nodeElement.className = "palette-node";
            nodeElement.textContent = nodeDef.title;
            nodeElement.draggable = true;
            nodeElement.addEventListener("dragstart", (event) => { event.dataTransfer.setData("text/plain", nodeDef.title + '|' + nodeDef.type); });
            categoryBlock.appendChild(nodeElement);
        });
    }

    graphContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('viewer-popout-button')) {
            const nodeId = parseInt(event.target.dataset.nodeId);
            const nodeData = nodes.find(n => n.id === nodeId);
            if (nodeData) {
                if (!nodeData.popup || nodeData.popup.closed) {
                    let params = 'width=' + nodeData.canvas.width * 2 + ',height=' + nodeData.canvas.height * 2 + ',';
                    params += 'left=' + Math.round(Math.random() * screen.width / 2) + ',top=' + Math.round(Math.random() * screen.height / 2);
                    params += ',toolbar=no,menubar=no,scrollbars=no,resizable=no,location=no,status=no,titlebar=no';
                    nodeData.popup = window.open("", "", params);
                }
                else nodeData.popup.focus();
            }
        }
        else if (event.target.classList.contains('input-flip-button')) {
            const nodeId = parseInt(event.target.dataset.nodeId);
            const nodeData = nodes.find(n => n.id === nodeId);
            if (nodeData) nodeData.isFlipped = !nodeData.isFlipped;
        }
        else if (event.target.classList.contains('input-hand-button')) {
            const nodeId = parseInt(event.target.dataset.nodeId);
            const nodeData = nodes.find(n => n.id === nodeId);
            if (nodeData) nodeData.rightHand = !nodeData.rightHand;
            if (nodeData.rightHand) {
                event.target.innerHTML = '&#129306;';
                event.target.title = 'Right hand';
            }
            else {
                event.target.innerHTML = '&#9995;';
                event.target.title = 'Left hand';
            }
        }
        else if (event.target.classList.contains('transition-play-button')) {
            const nodeId = parseInt(event.target.dataset.nodeId);
            const nodeData = nodes.find(n => n.id === nodeId);
            if (nodeData && nodeData.playTransition) {
                if (nodeData.progress == 0) nodeData.playTransition(1.0);
                else nodeData.playTransition(0);
            }
        }
        else if (event.target.classList.contains('keyframe-trigger-button')) {
            const nodeId = parseInt(event.target.dataset.nodeId);
            const nodeData = nodes.find(n => n.id === nodeId);
            if (nodeData) {
                nodeData.defaultTime = nodeData.countTime;
                nodeData.countDown = setInterval(function () {
                    nodeData.countTime--;
                    document.getElementById('countDownTime' + nodeId).value = nodeData.countTime;
                }, 1000);
                document.getElementById('countDownTime' + nodeId).disabled = "disabled";
                event.target.disabled = "disabled";
                nodeData.isDisabled = "disabled";
            }
        }
        else if (event.target.classList.contains('port-output')) {
            const fromNodeId = parseInt(event.target.dataset.nodeId);
            const fromPortIndex = parseInt(event.target.dataset.portIndex);

            pendingWire = { fromNodeId, fromPortIndex, element: document.createElementNS('http://www.w3.org/2000/svg', 'path') };
            pendingWire.element.classList.add('wire');
            document.getElementById('wire-svg').appendChild(pendingWire.element);
        }
        else if (pendingWire) {
            const wasConnected = event.target.classList.contains('port-input');

            if (wasConnected) {
                const toNodeId = parseInt(event.target.dataset.nodeId);
                const toPortIndex = parseInt(event.target.dataset.portIndex);

                if (!connections.some(c => c.toNode === toNodeId && c.toPort === toPortIndex)) {
                    connections.push({ id: Math.round(Math.random() * 999999), fromNode: pendingWire.fromNodeId, fromPort: pendingWire.fromPortIndex, toNode: toNodeId, toPort: toPortIndex, color: getRandomColor() });
                }
            }
            pendingWire.element.remove();
            pendingWire = null;

            if (wasConnected) {
                setTimeout(renderWires, 100);
                styleConnectedPorts();
            }
        }
    });

    graphContainer.addEventListener('change', (event) => {
        const nodeId = parseInt(event.target.dataset.nodeId);
        const nodeData = nodes.find(n => n.id === nodeId);

        if (!nodeData) return;

        if (event.target.classList.contains('image-loader')) {
            const file = event.target.files[0];
            if (!file) return;
            nodeData.mediaElement.src = URL.createObjectURL(file);
            nodeData.imageUrl = file.name;
        }
        else if (event.target.classList.contains('video-loader')) {
            const file = event.target.files[0];
            if (!file) return;
            nodeData.mediaElement.src = URL.createObjectURL(file);
            nodeData.videoUrl = file.name;
        }
        else if (event.target.classList.contains('sound-fx-selector')) {
            nodeData.fxName = event.target.value;
            nodeData.updateEffect();
        }
        else if (event.target.classList.contains('text-font-selector')) {
            nodeData.isReadonly = "disabled";
            if (event.target.value === 'custom') nodeData.isReadonly = "";
            if (nodeData.changeFont) {
                nodeData.changeFont(event.target.value);
            }
        }
        else if (event.target.classList.contains('curve-type-selector')) {
            nodeData.curveName = event.target.value;
            nodeData.isReadonly = "readonly";
            if (event.target.value === "rhodonea") {
                nodeData.equationX = "sin(t/sqr(B))*sin(sqr(A)*t/sqr(B))";
                nodeData.equationY = "cos(t/sqr(B))*sin(sqr(A)*t/sqr(B))";
            }
            else if (event.target.value === "astroid") {
                nodeData.equationX = "pow(cos(A*t/sqr(B)),A%3*2+3)";
                nodeData.equationY = "pow(sin(A*t/sqr(B)),A%3*2+3)";
            }
            else if (event.target.value === "combined") {
                nodeData.equationX = "cos(A*t/sqr(B))-pow(cos(A*t/sqr(B)),A%10*2+3)";
                nodeData.equationY = "sin(A*t/sqr(B))-pow(sin(A*t/sqr(B)),A%10*2+3)";
            }
            else nodeData.isReadonly = "";
        }
        else if (event.target.classList.contains('curve-style')) {
            nodeData.curveType = ["", "", "checked"];
            if (document.getElementById('curvePoints' + nodeId).checked) nodeData.curveType = ["checked", "", ""];
            else if (document.getElementById('curveLines' + nodeId).checked) nodeData.curveType = ["", "checked", ""];
        }
        else if (event.target.classList.contains('curve-animation-speed')) {
            nodeData.animationSpeed = event.target.value * 1.0;
            event.target.title = "Animation speed: " + nodeData.animationSpeed;
        }
        else if (event.target.classList.contains('target-value-A')) {
            nodeData.targetValueA = event.target.value * 1.0;
            event.target.title = "Target value A: " + nodeData.targetValueA;
        }
        else if (event.target.classList.contains('target-value-B')) {
            nodeData.targetValueB = event.target.value * 1.0;
            event.target.title = "Target value B: " + nodeData.targetValueB;
        }
        else if (event.target.classList.contains('count-down-time')) {
            nodeData.countTime = event.target.value * 1;
        }
        else if (event.target.classList.contains('character-model-loader')) {
            const file = event.target.files[0];
            if (!file) return;
            if (nodeData.loadModel) {
                const objectURL = URL.createObjectURL(file);
                nodeData.loadModel(objectURL);
            }
        }
        else if (event.target.classList.contains('3d-primitive-selector')) {
            nodeData.primitiveType = event.target.value;
            nodeData.isCustomModel = false;
            nodeData.three.updateObject();
        }
        else if (event.target.classList.contains('3d-model-loader')) {
            const file = event.target.files[0];
            if (!file) return;

            const objectURL = URL.createObjectURL(file);
            nodeData.three.loader.load(objectURL, (gltf) => {
                nodeData.loadedModel = gltf.scene;
                nodeData.isCustomModel = true;
                URL.revokeObjectURL(objectURL);
                nodeData.three.updateObject();
                renderGraph();
            }, undefined, (error) => {
                alert(error);
                URL.revokeObjectURL(objectURL);
            });
        }
        else if (event.target.classList.contains('mapping-light-color')) {
            nodeData.pointLight.color.set(event.target.value);
        }
        else if (event.target.classList.contains('mapping-light-value')) {
            nodeData.pointLight.intensity = event.target.value;
        }
        else if (event.target.classList.contains('mapping-light-ambient')) {
            nodeData.ambientLight.intensity = event.target.value;
        }
        else if (event.target.classList.contains('bypass-check')) {
            if (event.target.checked) nodeData.bypass = "checked";
            else nodeData.bypass = "";
        }
        else if (event.target.classList.contains('color-picker')) {
            nodeData.selectedColor = event.target.value;
            let r = parseInt(nodeData.selectedColor.slice(1, 3), 16);
            let g = parseInt(nodeData.selectedColor.slice(3, 5), 16);
            let b = parseInt(nodeData.selectedColor.slice(5, 7), 16);

            let tmp = cv.matFromArray(1, 1, cv.CV_8UC3, [r, g, b]);
            let hsvColor = new cv.Mat();
            cv.cvtColor(tmp, hsvColor, cv.COLOR_RGB2HSV);

            let temp = hsvColor.ucharPtr(0, 0);
            nodeData.oldHSV = [temp[0] * 1.0, temp[1] * 1.0];
            hsvColor.delete(); tmp.delete();

            nodeData.newHSV = [0.0, 0.0];
            document.getElementById('hueValue' + nodeId).value = 0;
            document.getElementById('satValue' + nodeId).value = 0;
        }
        else if (event.target.classList.contains('hue-adjustment')) {
            nodeData.newHSV[0] = event.target.value * 1.0;
        }
        else if (event.target.classList.contains('saturation-adjustment')) {
            nodeData.newHSV[1] = event.target.value * 1.0;
        }
        else if (event.target.classList.contains('full-range')) {
            if (event.target.checked) {
                nodeData.fullRangeChecked = "checked";
                nodeData.colorRangeChecked = "";
            }
            else nodeData.fullRangeChecked = "";
        }
        else if (event.target.classList.contains('color-range')) {
            if (event.target.checked) {
                nodeData.fullRangeChecked = "";
                nodeData.colorRangeChecked = "checked";
            }
            else nodeData.colorRangeChecked = "";
        }
        else if (event.target.classList.contains('color-invert')) {
            nodeData.colorInvertChecked = "";
            if (event.target.checked) nodeData.colorInvertChecked = "checked";
        }
        else if (event.target.classList.contains('hist-range')) {
            nodeData.gridSize = event.target.value * 1.0;
            event.target.title = "CLAHE grid size: " + nodeData.gridSize;
        }
        else if (event.target.classList.contains('gamma-range')) {
            nodeData.gammaValue = event.target.value * 1.0;
            event.target.title = "Gamma value: " + nodeData.gammaValue;
        }
        else if (event.target.classList.contains('convolutional-filter-selector')) {
            nodeData.convolutionType = event.target.value;
        }
        else if (event.target.classList.contains('convolution-range')) {
            nodeData.convolutionalFilterSize = event.target.value * 1;
            event.target.title = "Kernel size: " + event.target.value + "X" + event.target.value;
        }
        else if (event.target.classList.contains('morphological-filter-selector')) {
            nodeData.morphologyType = event.target.value;
        }
        else if (event.target.classList.contains('morphology-range')) {
            nodeData.morphologicalFilterSize = event.target.value * 1;
            event.target.title = "Kernel size: " + event.target.value + "X" + event.target.value;
        }
        else if (event.target.classList.contains('morphology-kernel-type')) {
            nodeData.morphologyKernelType = ["", "checked", ""];
            if (document.getElementById('squareKernel' + nodeId).checked) nodeData.morphologyKernelType = ["checked", "", ""];
            else if (document.getElementById('crossKernel' + nodeId).checked) nodeData.morphologyKernelType = ["", "", "checked"];
        }
        else if (event.target.classList.contains('glitch-effect-selector')) {
            nodeData.glitchEffectType = event.target.value;
        }
        else if (event.target.classList.contains('glitch-range')) {
            nodeData.glitchEffectSize = event.target.value * 1;
        }
        else if (event.target.classList.contains('inter-effect-selector')) {
            nodeData.interEffectType = event.target.value;
        }
        else if (event.target.classList.contains('inter-range')) {
            nodeData.interEffectSize = event.target.value * 1;
            event.target.title = "Radius: " + nodeData.interEffectSize;
        }
        else if (event.target.classList.contains('matrix-operation-selector')) {
            nodeData.operationType = event.target.value;
        }
        else if (event.target.classList.contains('matrix-operation-range')) {
            nodeData.operationWeight = event.target.value * 1.0;
            event.target.title = "Weights: " + (1 - nodeData.operationWeight) + "," + nodeData.operationWeight;
        }
        else if (event.target.classList.contains('channel-mixer-range')) {
            let RR = document.getElementById('channelRR' + nodeId).value * 1.0;
            let RG = document.getElementById('channelRG' + nodeId).value * 1.0;
            let RB = document.getElementById('channelRB' + nodeId).value * 1.0;
            let GR = document.getElementById('channelGR' + nodeId).value * 1.0;
            let GG = document.getElementById('channelGG' + nodeId).value * 1.0;
            let GB = document.getElementById('channelGB' + nodeId).value * 1.0;
            let BR = document.getElementById('channelBR' + nodeId).value * 1.0;
            let BG = document.getElementById('channelBG' + nodeId).value * 1.0;
            let BB = document.getElementById('channelBB' + nodeId).value * 1.0;

            nodeData.channelMixerValues = [RR, RG, RB, GR, GG, GB, BR, BG, BB];

            document.getElementById('channelRR' + nodeId).title = "R: " + Math.round(RR * 100) + "%";
            document.getElementById('channelRG' + nodeId).title = "G: " + Math.round(RG * 100) + "%";
            document.getElementById('channelRB' + nodeId).title = "B: " + Math.round(RB * 100) + "%";
            document.getElementById('channelGR' + nodeId).title = "R: " + Math.round(GR * 100) + "%";
            document.getElementById('channelGG' + nodeId).title = "G: " + Math.round(GG * 100) + "%";
            document.getElementById('channelGB' + nodeId).title = "B: " + Math.round(GB * 100) + "%";
            document.getElementById('channelBR' + nodeId).title = "R: " + Math.round(BR * 100) + "%";
            document.getElementById('channelBG' + nodeId).title = "G: " + Math.round(BG * 100) + "%";
            document.getElementById('channelBB' + nodeId).title = "B: " + Math.round(BB * 100) + "%";
        }
        else if (event.target.classList.contains('hue-blending')) {
            nodeData.hueBlendChecked = "";
            if (event.target.checked) nodeData.hueBlendChecked = "checked";
        }
        else if (event.target.classList.contains('saturation-blending')) {
            nodeData.satBlendChecked = "";
            if (event.target.checked) nodeData.satBlendChecked = "checked";
        }
        else if (event.target.classList.contains('value-blending')) {
            nodeData.valBlendChecked = "";
            if (event.target.checked) nodeData.valBlendChecked = "checked";
        }
        else if (event.target.classList.contains('concatenation-range')) {
            nodeData.concatenationAlignment = event.target.value * 1.0;
        }
        else if (event.target.classList.contains('concatenation-check')) {
            nodeData.concatenationChecked = ["", "checked"];
            if (document.getElementById('concatenationCheck' + nodeId).checked) nodeData.concatenationChecked = ["checked", ""];
        }
        else if (event.target.classList.contains('thresholding-range')) {
            nodeData.thresholdValue = event.target.value * 1;
        }
        else if (event.target.classList.contains('binary-threshold-check')) {
            if (event.target.checked) nodeData.thresholdingChecked = ["checked", "", ""];
        }
        else if (event.target.classList.contains('otsu-threshold-check')) {
            if (event.target.checked) nodeData.thresholdingChecked = ["", "checked", ""];
        }
        else if (event.target.classList.contains('adaptive-threshold-check')) {
            if (event.target.checked) nodeData.thresholdingChecked = ["", "", "checked"];
        }
        else if (event.target.classList.contains('connected-components-range')) {
            nodeData.kValue = event.target.value * 1;
            event.target.title = "Clusters: " + event.target.value;
        }
        else if (event.target.classList.contains('optical-flow-range')) {
            nodeData.opticalFlowSize = event.target.value * 1.0;
            event.target.title = "Block size: " + event.target.value + "X" + event.target.value;
        }
        else if (event.target.classList.contains('transition-type-selector')) {
            nodeData.transitionType = event.target.value;
        }
        else if (event.target.classList.contains('transition-duration-range')) {
            nodeData.transitionDuration = event.target.value * 1.0;
            event.target.title = "Duration: " + event.target.value + "s";
        }
        else if (event.target.classList.contains('confidence-range')) {
            nodeData.detectionConfidence = event.target.value * 1.0;
            event.target.title = "Detection confidence: " + nodeData.detectionConfidence;
        }
        renderGraph();
    });

    graphContainer.addEventListener('dragover', (event) => event.preventDefault());

    graphContainer.addEventListener('drop', (event) => {
        event.preventDefault();
        const nodeData = event.dataTransfer.getData('text/plain').split('|');
        const nodeTitle = nodeData[0];
        const nodeType = nodeData[1];

        if (!nodeType || nodeType === 'undefined') return;

        const rect = graphContainer.getBoundingClientRect();
        nodes.push(createNodeData(Math.round(Math.random() * 999999), nodeTitle, nodeType, event.clientX - rect.left - 30, event.clientY - rect.top - 10));
        renderGraph();
    });

    graphContainer.addEventListener('input', (event) => {
        const target = event.target;
        const nodeId = parseInt(target.dataset.nodeId);
        const nodeData = nodes.find(n => n.id === nodeId);

        if (!nodeData) return;

        if (target.classList.contains('fx-A-parameter')) {
            nodeData.fxA = parseInt(target.value);
            nodeData.updateEffect();
        }
        if (target.classList.contains('text-color-input')) {
            nodeData.textColor = target.value;
            nodeData.needsUpdate = true;
        }
        if (target.classList.contains('text-size-input')) {
            nodeData.textSize = parseInt(target.value);
            nodeData.needsUpdate = true;
        }
        if (target.classList.contains('text-size-height')) {
            nodeData.textHeight = parseInt(target.value);
            nodeData.needsUpdate = true;
        }
        if (target.classList.contains('curve-color-input')) {
            nodeData.curveColor = target.value;
        }
        if (target.classList.contains('curve-A-input')) {
            nodeData.paramA = parseInt(target.value);
        }
        if (target.classList.contains('curve-B-input')) {
            nodeData.paramB = parseInt(target.value);
        }
    });

    document.addEventListener('mousedown', (event) => {
        if (event.target.classList.contains('port-output')) {
            const fromNodeId = parseInt(event.target.dataset.nodeId);
            const fromPortIndex = parseInt(event.target.dataset.portIndex);

            pendingWire = { fromNodeId, fromPortIndex, element: document.createElementNS('http://www.w3.org/2000/svg', 'path') };
            pendingWire.element.classList.add('wire');
            document.getElementById('wire-svg').appendChild(pendingWire.element);
        }
        else if (event.target.classList.contains('palette-title')) {
            const groupTitles = document.getElementsByClassName('palette-title');
            for (var i = 0; i < groupTitles.length; i++) groupTitles[i].style.color = "#aaa";

            const nodeTitles = document.getElementsByClassName('palette-node');
            for (var i = 0; i < nodeTitles.length; i++) nodeTitles[i].style.display = "none";

            const catChildren = event.target.parentNode.children;
            for (var i = 1; i < catChildren.length; i++) {
                catChildren[i].style.display = "block";
                catChildren[0].style.color = "white";
            }
        }
        else if (event.target.classList.contains('node-input-field')) {
            const currentlySelected = document.querySelector('.node.selected');
            if (currentlySelected) { currentlySelected.classList.remove('selected'); }
            activeNode = event.target.parentNode.parentNode;
        }
        else if (event.target.className === 'example') {
            const fileName = event.target.innerText.replace(' ', '_').toLowerCase();
            const file = 'examples/' + fileName + '.olive';
            fetch(file).then(res => res.text()).then(text => loadProject(text));
            document.getElementById('projectName').value = fileName;
        }
        else if (!event.target.closest('.node')) {
            const currentlySelected = document.querySelector('.node.selected');
            if (currentlySelected) { currentlySelected.classList.remove('selected'); }
            activeNode = null;
        }
        document.getElementById('examples').style.display = 'none';
    });

    document.addEventListener('mousemove', (event) => {
        if (pendingWire) {
            const fromPortEl = document.querySelector(`.port-output[data-node-id='${pendingWire.fromNodeId}'][data-port-index='${pendingWire.fromPortIndex}']`);
            const mousePos = { getBoundingClientRect: () => ({ left: event.clientX, top: event.clientY, width: 0, height: 0 }) };
            drawWire(fromPortEl, mousePos, pendingWire.element);
        }
    });

    document.addEventListener('mouseup', (event) => {
        if (pendingWire) {
            const wasConnected = event.target.classList.contains('port-input');

            if (wasConnected) {
                const toNodeId = parseInt(event.target.dataset.nodeId);
                const toPortIndex = parseInt(event.target.dataset.portIndex);

                if (!connections.some(c => c.toNode === toNodeId && c.toPort === toPortIndex)) {
                    connections.push({ id: Math.round(Math.random() * 999999), fromNode: pendingWire.fromNodeId, fromPort: pendingWire.fromPortIndex, toNode: toNodeId, toPort: toPortIndex, color: getRandomColor() });
                }
            }
            pendingWire.element.remove();
            pendingWire = null;

            if (wasConnected) {
                setTimeout(renderWires, 100);
                styleConnectedPorts();
            }
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Delete') {
            if (activeNode) {
                nodes = nodes.filter(n => n.id !== activeNode.id);
                connections = connections.filter(c => c.fromNode !== activeNode.id && c.toNode !== activeNode.id);
                activeNode = null;
                renderGraph();
            }
        }
        else if (event.key === 'Enter' && event.target.classList.contains('node-input-field')) {
            const inputEl = event.target;
            const nodeEl = inputEl.closest('.node');
            const nodeId = parseInt(nodeEl.dataset.nodeId);
            const nodeData = nodes.find(n => n.id === nodeId);

            if (nodeData && nodeData.title === '3D Text') {
                nodeData.fontUrls['custom'] = event.target.value;
                if (nodeData.changeFont) {
                    nodeData.changeFont('custom');
                }
            }
            else if (nodeData && nodeData.title !== 'Convolution' && nodeData.title !== 'Transitions' && nodeData.title !== 'Image Warping' && nodeData.title !== 'Parametric Lines' && nodeData.title !== 'Skeleton' && nodeData.title !== 'Matrix Operations') {
                urlExists(inputEl.value).then(exists => {
                    if (exists) {
                        nodeData.mediaElement.src = inputEl.value;
                        if (nodeData.title === 'Image') nodeData.imageUrl = inputEl.value;
                        else if (nodeData.title === 'Video / Audio') nodeData.videoUrl = inputEl.value;
                    }
                    else alert('This URL does not exist or is unreacheable...');
                });
            }
        }
    });

    document.addEventListener('keyup', (event) => {
        const inputEl = event.target;
        const nodeEl = inputEl.closest('.node');
        const nodeId = parseInt(nodeEl.dataset.nodeId);
        const nodeData = nodes.find(n => n.id === nodeId);

        if (!nodeData) return;

        if (event.target.classList.contains('custom-kernel-field')) {
            nodeData.customKernel = inputEl.value.split(",");
        }
        else if (event.target.classList.contains('trans-shader')) {
            nodeData.transitionShaders[nodeData.transitionType] = event.target.value;
        }
        else if (event.target.classList.contains('warp-shader')) {
            nodeData.warpingShaders[nodeData.interEffectType] = event.target.value;
        }
        else if (event.target.classList.contains('skeleton-code')) {
            nodeData.skeletonCode = event.target.value;
        }
        else if (event.target.classList.contains('operation-code')) {
            nodeData.operationCode[nodeData.operationType] = event.target.value;
        }
        else if (event.target.classList.contains('text-input')) {
            nodeData.text = event.target.value;
            nodeData.needsUpdate = true;
        }
        else if (event.target.classList.contains('curve-equation-X')) {
            nodeData.equationX = inputEl.value;
        }
        else if (event.target.classList.contains('curve-equation-Y')) {
            nodeData.equationY = inputEl.value;
        }
    });

    graphContainer.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (event.target.classList.contains('port')) {
            const nodeId = parseInt(event.target.dataset.nodeId);
            const portIndex = parseInt(event.target.dataset.portIndex);
            const isInput = event.target.classList.contains('port-input');

            if (isInput) {
                connections = connections.filter(c => c.toNode !== nodeId || c.toPort !== portIndex);
            }
            else {
                connections = connections.filter(c => c.fromNode !== nodeId || c.fromPort !== portIndex);
            }
            renderGraph();
        }
        else if (event.target.tagName === 'IMG' || event.target.tagName === 'VIDEO') event.target.requestFullscreen();
        else if (event.target.tagName === 'CANVAS') {
            const nodeEl = event.target.closest('.node');
            const nodeId = parseInt(nodeEl.dataset.nodeId);
            fsCanvas[fsIndex.indexOf(nodeId)].requestFullscreen();
        }
        else if (activeNode) {
            nodes = nodes.filter(n => n.id !== activeNode.id);
            connections = connections.filter(c => c.fromNode !== activeNode.id && c.toNode !== activeNode.id);
            activeNode = null;
            renderGraph();
        }
    });

    graphContainer.addEventListener('dblclick', (event) => {
        if (event.target.tagName === 'IMG' || event.target.tagName === 'VIDEO') event.target.requestFullscreen();
        else if (event.target.tagName === 'CANVAS') {
            const nodeEl = event.target.closest('.node');
            const nodeId = parseInt(nodeEl.dataset.nodeId);
            fsCanvas[fsIndex.indexOf(nodeId)].requestFullscreen();
        }
    });
    requestAnimationFrame(update);
}

function update() {
    if (!openCvReady) {
        if (typeof cv !== 'undefined' && cv.imread) {
            openCvReady = true;

            const statusEl = document.getElementById('opencv-status');
            statusEl.textContent = 'OpenCV Ready';
            statusEl.style.backgroundColor = 'darkolivegreen';

            setTimeout(() => statusEl.style.display = 'none', 1500);
        }
    }
    nodes.forEach(nodeData => {
        if (nodeData.onExecute) {
            nodeData.onExecute();
        }
    });
    requestAnimationFrame(update);
}

document.addEventListener('DOMContentLoaded', () => {
    initialize();
});
