function saveProject() {
    const statusEl = document.getElementById('opencv-status');
    statusEl.textContent = 'Saving Project...';
    statusEl.style.backgroundColor = 'goldenrod';
    statusEl.style.display = 'block';

    setTimeout(function () {
        let gestures = [];
        for (var i = 0; i < settingsHTML.length; i++) {
            if (settingsHTML[i].tagName === 'SELECT') gestures.push(settingsHTML[i].value);
        }
        const payload = {
            nodes: nodes.map(n => ({
                id: n.id, title: n.title, type: n.type, x: n.x, y: n.y, bypass: n.bypass, isFlipped: n.isFlipped, rightHand: n.rightHand,
                imageUrl: n.imageUrl, videoUrl: n.videoUrl, fxName: n.fxName, fxA: n.fxA, sliderAtitle: n.sliderAtitle,
                nodeText: n.text, textColor: n.textColor, textSize: n.textSize, textHeight: n.textHeight, fontName: n.fontName, fontUrls: n.fontUrls,
                curveColor: n.curveColor, paramA: n.paramA, paramB: n.paramB, curveName: n.curveName, curveType: n.curveType, equationX: n.equationX, equationY: n.equationY, animationSpeed: n.animationSpeed,
                targetValueA: n.targetValueA, targetValueB: n.targetValueB, countTime: n.countTime,
                primitiveType: n.primitiveType, isCustomModel: n.isCustomModel, loadedModel: n.loadedModel, currentVrm: n.currentVrm,
                camera: n.camera, projectorCamera: n.projectorCamera, ambientLight: n.ambientLight, pointLight: n.pointLight,
                gridSize: n.gridSize, gammaValue: n.gammaValue,
                selectedColor: n.selectedColor, oldHSV: n.oldHSV, newHSV: n.newHSV, fullRangeChecked: n.fullRangeChecked, colorRangeChecked: n.colorRangeChecked, colorInvertChecked: n.colorInvertChecked,
                convolutionType: n.convolutionType, convolutionalFilterSize: n.convolutionalFilterSize, customKernel: n.customKernel,
                morphologyType: n.morphologyType, morphologicalFilterSize: n.morphologicalFilterSize, morphologyKernelType: n.morphologyKernelType,
                glitchEffectSize: n.glitchEffectSize, glitchEffectType: n.glitchEffectType, interEffectSize: n.interEffectSize, interEffectType: n.interEffectType, warpingShaders: n.warpingShaders,
                channelMixerValues: n.channelMixerValues, opticalFlowSize: n.opticalFlowSize, skeletonCode: n.skeletonCode,
                thresholdValue: n.thresholdValue, thresholdingChecked: n.thresholdingChecked, kValue: n.kValue,
                operationType: n.operationType, operationWeight: n.operationWeight, operationCode: n.operationCode, detectionConfidence: n.detectionConfidence,
                hueBlendChecked: n.hueBlendChecked, satBlendChecked: n.satBlendChecked, valBlendChecked: n.valBlendChecked,
                concatenationAlignment: n.concatenationAlignment, concatenationChecked: n.concatenationChecked,
                transitionType: n.transitionType, transitionDuration: n.transitionDuration, transitionShaders: n.transitionShaders
            })), connections, gestures
        };
        try {
            let jsonFILE = JSON.stringify(payload, null, 2);
            try {
                const blob = new Blob([jsonFILE], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = document.getElementById('projectName').value + '.olive';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);

                statusEl.textContent = 'Project Saved';
                statusEl.style.backgroundColor = 'darkolivegreen';
                setTimeout(() => statusEl.style.display = 'none', 1500);
            }
            catch (err) { alert(err); statusEl.style.display = 'none'; }
        }
        catch { alert("Cannot save project... the 3D model is too large!"); statusEl.style.display = 'none'; }
    }, 50);
}
function loadProjectFromJSON(event) {
    var reader = new FileReader();
    reader.onload = onReaderLoad;
    const file = event.target.files[0];
    reader.readAsText(file);
    document.getElementById('projectName').value = file.name.substring(0, file.name.lastIndexOf('.'));
}
function onReaderLoad(event) {
    loadProject(event.target.result);
}
function loadProject(text) {
    const statusEl = document.getElementById('opencv-status');
    statusEl.textContent = 'Loading Project...';
    statusEl.style.backgroundColor = 'goldenrod';
    statusEl.style.display = 'block';

    try {
        const payload = JSON.parse(text);
        nodes = [];
        connections = payload.connections || [];

        const highestId = setInterval(() => { }, 0);
        for (let i = 1; i <= highestId; i++) clearInterval(i);

        payload.nodes.forEach(n => {
            const nd = createNodeData(n.id, n.title, n.type, n.x || 100, n.y || 100);
            if (n.imageUrl) { nd.imageUrl = n.imageUrl; if (nd.mediaElement) nd.mediaElement.src = n.imageUrl; }
            if (n.videoUrl) { nd.videoUrl = n.videoUrl; if (nd.mediaElement) nd.mediaElement.src = n.videoUrl; }
            if (n.currentVrm) {
                nd.currentVrm = n.currentVrm;
                nd.three.scene.add(nd.currentVrm.scene);
            }
            if (n.primitiveType) { nd.primitiveType = n.primitiveType; nd.three.updateObject(); }
            if (n.isCustomModel) {
                nd.isCustomModel = n.isCustomModel;
                if (n.loadedModel) {
                    const jsonLoader = new THREE.ObjectLoader();
                    jsonLoader.parse(n.loadedModel, function (obj) { nd.loadedModel = obj; });
                }
                nd.three.updateObject();
            }
            if (n.ambientLight) {
                nd.ambientLight.intensity = n.ambientLight.object.intensity;
            }
            if (n.pointLight) {
                nd.pointLight.intensity = n.pointLight.object.intensity;
                nd.pointLight.color.set(n.pointLight.object.color);
                nd.pointLight.position.set(n.pointLight.object.matrix[12], n.pointLight.object.matrix[13], n.pointLight.object.matrix[14]);
                nd.pointHelper.position.set(n.pointLight.object.matrix[12], n.pointLight.object.matrix[13], n.pointLight.object.matrix[14]);
            }
            if (n.projectorCamera) {
                nd.projectorCamera.position.set(n.projectorCamera.object.matrix[12], n.projectorCamera.object.matrix[13], n.projectorCamera.object.matrix[14]);
                nd.pointHelper.position.set(n.projectorCamera.object.matrix[12], n.projectorCamera.object.matrix[13], n.projectorCamera.object.matrix[14]);
            }
            if (n.camera) {
                nd.camera.position.set(n.camera.object.matrix[12], n.camera.object.matrix[13], n.camera.object.matrix[14]);
                nd.camera.zoom = n.camera.object.zoom;
                nd.camera.updateProjectionMatrix();
            }
            if (n.bypass) nd.bypass = n.bypass;
            if (n.isFlipped) nd.isFlipped = n.isFlipped;
            if (n.rightHand) nd.rightHand = n.rightHand;

            nd.gridSize = n.gridSize;
            nd.gammaValue = n.gammaValue;
            nd.selectedColor = n.selectedColor;
            nd.oldHSV = n.oldHSV;
            nd.newHSV = n.newHSV;
            nd.convolutionType = n.convolutionType;
            nd.convolutionalFilterSize = n.convolutionalFilterSize;
            nd.customKernel = n.customKernel;
            nd.morphologyType = n.morphologyType;
            nd.morphologicalFilterSize = n.morphologicalFilterSize;
            nd.morphologyKernelType = n.morphologyKernelType;
            nd.glitchEffectSize = n.glitchEffectSize;
            nd.glitchEffectType = n.glitchEffectType;
            nd.interEffectSize = n.interEffectSize;
            nd.interEffectType = n.interEffectType;
            if (n.warpingShaders) nd.warpingShaders = n.warpingShaders;

            nd.channelMixerValues = n.channelMixerValues;
            nd.opticalFlowSize = n.opticalFlowSize;
            nd.thresholdValue = n.thresholdValue;
            nd.kValue = n.kValue;
            nd.operationType = n.operationType;
            nd.operationWeight = n.operationWeight;
            if (n.operationCode) nd.operationCode = n.operationCode;

            nd.concatenationAlignment = n.concatenationAlignment;
            nd.transitionType = n.transitionType;
            nd.transitionDuration = n.transitionDuration;
            if (n.transitionShaders) nd.transitionShaders = n.transitionShaders;

            nd.nodeText = n.nodeText;
            nd.textColor = n.textColor;
            nd.textSize = n.textSize;
            nd.textHeight = n.textHeight;
            if (n.fontUrls) {
                nd.fontUrls = n.fontUrls;
                nd.changeFont(n.fontName);
            }
            nd.curveColor = n.curveColor;
            nd.paramA = n.paramA;
            nd.paramB = n.paramB;
            nd.curveName = n.curveName;
            nd.curveType = n.curveType;
            nd.equationX = n.equationX;
            nd.equationY = n.equationY;
            nd.animationSpeed = n.animationSpeed;
            nd.detectionConfidence = n.detectionConfidence;
            nd.fxName = n.fxName;
            nd.fxA = n.fxA;
            nd.sliderAtitle = n.sliderAtitle;
            nd.targetValueA = n.targetValueA;
            nd.targetValueB = n.targetValueB;
            nd.countTime = n.countTime;

            nd.fullRangeChecked = n.fullRangeChecked;
            nd.colorRangeChecked = n.colorRangeChecked;
            nd.colorInvertChecked = n.colorInvertChecked;
            nd.thresholdingChecked = n.thresholdingChecked;
            nd.hueBlendChecked = n.hueBlendChecked;
            nd.satBlendChecked = n.satBlendChecked;
            nd.valBlendChecked = n.valBlendChecked;
            nd.concatenationChecked = n.concatenationChecked;
            if (n.skeletonCode) nd.skeletonCode = n.skeletonCode;

            nodes.push(nd);
        });
        renderGraph();

        if (payload.gestures) {
            let count = 0;
            for (var i = 0; i < settingsHTML.length; i++) {
                if (settingsHTML[i].tagName === 'SELECT') settingsHTML[i].value = payload.gestures[count++];
            }
        }
        statusEl.textContent = 'Project Loaded';
        statusEl.style.backgroundColor = 'darkolivegreen';
        setTimeout(() => statusEl.style.display = 'none', 1500);
    }
    catch (err) { alert(err); statusEl.style.display = 'none'; }
}