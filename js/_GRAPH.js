function renderGraph() {
    const graphContainer = document.getElementById('graph-container');
    const wireSVG = document.getElementById('wire-svg');
    graphContainer.innerHTML = '';
    graphContainer.appendChild(wireSVG);

    nodes.forEach(nodeData => {
        const nodeEl = document.createElement('div');
        nodeEl.className = 'node';
        nodeEl.style.left = nodeData.x + 'px';
        nodeEl.style.top = nodeData.y + 'px';
        nodeEl.dataset.nodeId = nodeData.id;

        if (activeNode && activeNode.id === nodeData.id) { nodeEl.classList.add('selected'); }

        const inputsHTML = nodeData.inputs.map((port, i) => `<div style="display: flex; align-items: center;"><div class="port port-input" data-node-id="${nodeData.id}" data-port-index="${i}"></div><span class="port-label">${port.name}</span></div>`).join('');
        const outputsHTML = nodeData.outputs.map((port, i) => `<div style="display: flex; align-items: center;"><span class="port-label">${port.name}</span><div class="port port-output" data-node-id="${nodeData.id}" data-port-index="${i}"></div></div>`).join('');
        const portsHTML = `<div class="node-ports-content"><div class="ports">${inputsHTML}</div><div class="ports">${outputsHTML}</div></div>`;

        let primitiveOptions = '', morphologyOptions = '', convolutionOptions = '';
        let glitchOptions = '', interOptions = '', matrixOptions = '', transitionOptions = '';
        let specificContentHTML = '';

        switch (nodeData.title) {
            case 'Image':
                specificContentHTML = `
                            <div class="node-content">
                                <input tabIndex="-1" type="file" title="Upload Image" class="node-input-file image-loader" data-node-id="${nodeData.id}" accept=".bmp, .jpg, .png, .webp">
                                <input type="text" class="node-input-field" placeholder="Image URL..." value="${nodeData.imageUrl}">
                            </div>`;
                break;
            case 'Video / Audio':
                specificContentHTML = `
                            <div class="node-content">
                                <input tabIndex="-1" type="file" title="Upload Media" class="node-input-file video-loader" data-node-id="${nodeData.id}" accept=".avi, .wmv, .mp4, .mkv, .mov, .webm, .wav, .mp3">
                                <input type="text" id="stream_url${nodeData.id}" class="node-input-field" placeholder="Media URL..." value="${nodeData.videoUrl}">
                            </div>`;
                break;
            case 'Sound Filters & Effects':
                const soundEffects = [
                    { value: 'bandpass', name: 'Band Pass' },
                    { value: 'lowpass', name: 'Low Pass' },
                    { value: 'highpass', name: 'High Pass' },
                    { value: 'delay', name: 'Delay' },
                    { value: 'reverb', name: 'Reverb' },
                    { value: 'flanger', name: 'Flanger' },
                    { value: 'distortion', name: 'Distortion' },
                    { value: 'tremolo', name: 'Tremolo' },
                    { value: 'panning', name: 'Panning' }
                ];
                let effectsHTML = soundEffects.map(fx =>
                    `<option value="${fx.value}" ${nodeData.fxName === fx.value ? 'selected' : ''}>${fx.name}</option>`
                ).join('');
                specificContentHTML = `
                            <div class="node-content">
                                <select class="node-select-field sound-fx-selector" data-node-id="${nodeData.id}">${effectsHTML}</select>
                                <input type="range" id="fxA${nodeData.id}" class="node-input-range fx-A-parameter" data-node-id="${nodeData.id}" min="0" max="100" value="${nodeData.fxA}" title="${nodeData.sliderAtitle}">
                            </div>`;
                break;
            case '3D Text':
                const fontOptions = [
                    { value: 'helvetiker_regular', name: 'Helvetiker' },
                    { value: 'gentilis_regular', name: 'Gentilis' },
                    { value: 'droid_sans_regular', name: 'Droid Sans' },
                    { value: 'optimer_regular', name: 'Optimer' },
                    { value: 'custom', name: 'External Font' }
                ];
                let optionsHTML = fontOptions.map(font =>
                    `<option value="${font.value}" ${nodeData.fontName === font.value ? 'selected' : ''}>${font.name}</option>`
                ).join('');
                specificContentHTML = `
                            <div class="node-content">
                                <select class="node-select-field text-font-selector" data-node-id="${nodeData.id}">${optionsHTML}</select>
                                <input type="text" class="node-input-field" placeholder="Typeface URL..." value="${nodeData.fontUrls[nodeData.fontName]}" ${nodeData.isReadonly}>
                                <input type="color" class="node-input-color text-color-input" data-node-id="${nodeData.id}" value="${nodeData.textColor}">
                                <input type="range" class="node-input-range text-size-input" data-node-id="${nodeData.id}" min="10" max="100" value="${nodeData.textSize}" title="Font-size: ${nodeData.textSize}" style="width:144px">
                                <input type="range" class="node-input-range text-size-height" data-node-id="${nodeData.id}" min="1" max="50" value="${nodeData.textHeight}" title="Thickness: ${nodeData.textHeight}" style="width:144px">
                                <input type="text" class="node-input-field text-input" data-node-id="${nodeData.id}" value="${nodeData.text}" style="margin-top:5px">
                                <button class="node-fullscreen-button" onclick="this.nextElementSibling.requestFullscreen();">Render 3D Scene</button>
                            </div>`;
                break;
            case 'Parametric Lines':
                const curveOptions = [
                    { value: 'rhodonea', name: 'Rhodonea' },
                    { value: 'astroid', name: 'Astroid' },
                    { value: 'combined', name: 'Combined' },
                    { value: 'custom', name: 'Custom Equations' }
                ];
                let curvesHTML = curveOptions.map(curve =>
                    `<option value="${curve.value}" ${nodeData.curveName === curve.value ? 'selected' : ''}>${curve.name}</option>`
                ).join('');
                specificContentHTML = `
                            <div class="node-content">
                                <select class="node-select-field curve-type-selector" data-node-id="${nodeData.id}">${curvesHTML}</select>
                                <input type="color" class="node-input-color curve-color-input" data-node-id="${nodeData.id}" value="${nodeData.curveColor}">
                                <input type="range" class="node-input-range curve-A-input" data-node-id="${nodeData.id}" min="1" max="1000" value="${nodeData.paramA}" title="A: ${nodeData.paramA}" style="width:144px">
                                <input type="range" class="node-input-range curve-B-input" data-node-id="${nodeData.id}" min="1" max="1000" value="${nodeData.paramB}" title="B: ${nodeData.paramB}" style="width:144px">
                                <br><br>
                                <em>x[t]=</em><input type="text" class="node-input-field curve-equation-X" title="Use only: numbers, +, -, /, *, %, **, sqr(), sin(), cos(), log(), e, pi, A, B, and t" value="${nodeData.equationX}" style="width:155px" ${nodeData.isReadonly}>
                                <em>y[t]=</em><input type="text" class="node-input-field curve-equation-Y" title="Use only: numbers, +, -, /, *, %, **, sqr(), sin(), cos(), log(), e, pi, A, B, and t" value="${nodeData.equationY}" style="width:155px" ${nodeData.isReadonly}>
                                <input type="range" id="curveSpeed${nodeData.id}" data-node-id="${nodeData.id}" title="Animation speed: ${nodeData.animationSpeed}" class="node-input-range curve-animation-speed" min="-3" max="3" step="0.1" value="${nodeData.animationSpeed}">
                                <p><input type="radio" id="curvePoints${nodeData.id}" data-node-id="${nodeData.id}" class="node-input-check curve-style" name="curveStyle${nodeData.id}" ${nodeData.curveType[0]}><small>Points</small>
                                <input type="radio" id="curveLines${nodeData.id}" data-node-id="${nodeData.id}" class="node-input-check curve-style" name="curveStyle${nodeData.id}" ${nodeData.curveType[1]}><small>Lines</small>
                                <input type="radio" data-node-id="${nodeData.id}" class="node-input-check curve-style" name="curveStyle${nodeData.id}" ${nodeData.curveType[2]}><small>Curves</small></p>
                            </div>`;
                break;
            case 'Countdown / Keyframes':
                specificContentHTML = `
                            <div class="node-content">
                                <input type="range" data-node-id="${nodeData.id}" title="Target value A: ${nodeData.targetValueA}" class="node-input-range target-value-A" min="0" max="1000" value="${nodeData.targetValueA}">
                                <input type="range" data-node-id="${nodeData.id}" title="Target value B: ${nodeData.targetValueB}" class="node-input-range target-value-B" min="0" max="1000" value="${nodeData.targetValueB}">
                                <p><button id="countDownButton${nodeData.id}" class="node-button keyframe-trigger-button" data-node-id="${nodeData.id}" style="width:100px" ${nodeData.isDisabled}>Trigger</button>
                                <input type="number" id="countDownTime${nodeData.id}" data-node-id="${nodeData.id}" title="Seconds" class="node-input-number count-down-time" min="1" max="3600" value="${nodeData.countTime}" style="width:75px" ${nodeData.isDisabled}></p>
                            </div>`;
                break;
            case 'Histogram Equalization':
                specificContentHTML = `
                            <div class="node-content">
                                <input type="range" data-node-id="${nodeData.id}" title="CLAHE grid size: ${nodeData.gridSize}" class="node-input-range hist-range" min="0" max="16" value="${nodeData.gridSize}">
                            </div>`;
                break;
            case 'Color Adjustment':
                specificContentHTML = `
                            <div class="node-content">
                                <input type="color" class="node-input-color color-picker" title="Selected Color" data-node-id="${nodeData.id}" value="${nodeData.selectedColor}">
                                <input type="range" class="node-input-range hue-adjustment" id="hueValue${nodeData.id}" title="Adjust Color Hue" data-node-id="${nodeData.id}" min="-180" max="180" value="${nodeData.newHSV[0]}" style="width:144px">
                                <input type="range" class="node-input-range saturation-adjustment" id="satValue${nodeData.id}" title="Adjust Color Saturation" data-node-id="${nodeData.id}" min="-255" max="255" value="${nodeData.newHSV[1]}" style="width:144px">
                                <p><input type="checkbox" class="node-input-check full-range" id="fullRange${nodeData.id}" data-node-id="${nodeData.id}" ${nodeData.fullRangeChecked}><small>Apply to all the colors</small><br>
                                <input type="checkbox" class="node-input-check color-range" id="colorRange${nodeData.id}" data-node-id="${nodeData.id}" ${nodeData.colorRangeChecked}><small>Select a range of colors</small><br>
                                <input type="checkbox" class="node-input-check color-invert" id="colorInvert${nodeData.id}" data-node-id="${nodeData.id}" ${nodeData.colorInvertChecked}><small>Invert the image colors</small></p>
                            </div>`;
                break;
            case 'Gamma Correction':
                specificContentHTML = `
                            <div class="node-content">
                                <input type="range" id="gamma${nodeData.id}" data-node-id="${nodeData.id}" title="Gamma value: ${nodeData.gammaValue}" class="node-input-range gamma-range" min="0.01" max="10" step="0.01" value="${nodeData.gammaValue}">
                            </div>`;
                break;
            case 'Convolution':
                nodeData.convolutionalFilters.forEach(name => { convolutionOptions += `<option value="${name}" ${nodeData.convolutionType === name ? 'selected' : ''}>${name}</option>`; });
                specificContentHTML = `
                            <div class="node-content">
                                <select class="node-select-field convolutional-filter-selector" data-node-id="${nodeData.id}">${convolutionOptions}</select>
                                <input type="range" id="convolutionRange${nodeData.id}" data-node-id="${nodeData.id}" title="Kernel size: ${nodeData.convolutionalFilterSize}X${nodeData.convolutionalFilterSize}" class="node-input-range convolution-range" min="3" max="25" step="2" value="${nodeData.convolutionalFilterSize}">
                                <p><textarea id="kernelInput${nodeData.id}" type="text" class="node-input-field custom-kernel-field" data-node-id="${nodeData.id}" ${nodeData.customDisabled}>${nodeData.customKernel.toString()}</textarea></p>
                            </div>`;
                break;
            case 'Morphology / Rank':
                nodeData.morphologicalFilters.forEach(name => { morphologyOptions += `<option value="${name}" ${nodeData.morphologyType === name ? 'selected' : ''}>${name}</option>`; });
                specificContentHTML = `
                            <div class="node-content">
                                <select class="node-select-field morphological-filter-selector" data-node-id="${nodeData.id}">${morphologyOptions}</select>
                                <input type="range" id="kernelSize${nodeData.id}" data-node-id="${nodeData.id}" title="Kernel size: ${nodeData.morphologicalFilterSize}X${nodeData.morphologicalFilterSize}" class="node-input-range morphology-range" min="3" max="25" step="2" value="${nodeData.morphologicalFilterSize}">
                                <p><input type="radio" id="squareKernel${nodeData.id}" data-node-id="${nodeData.id}" class="node-input-check morphology-kernel-type" name="morphKernel${nodeData.id}" ${nodeData.morphologyKernelType[0]}><small>Square</small>
                                <input type="radio" data-node-id="${nodeData.id}" class="node-input-check morphology-kernel-type" name="morphKernel${nodeData.id}" ${nodeData.morphologyKernelType[1]}><small>Disk</small>
                                <input type="radio" id="crossKernel${nodeData.id}" data-node-id="${nodeData.id}" class="node-input-check morphology-kernel-type" name="morphKernel${nodeData.id}" ${nodeData.morphologyKernelType[2]}><small>Cross</small></p>
                            </div>`;
                break;
            case 'Glitch Effects':
                nodeData.glitchEffects.forEach(name => { glitchOptions += `<option value="${name}" ${nodeData.glitchEffectType === name ? 'selected' : ''}>${name}</option>`; });
                specificContentHTML = `
                            <div class="node-content">
                                <select class="node-select-field glitch-effect-selector" data-node-id="${nodeData.id}">${glitchOptions}</select>
                                <input type="range" id="glitch${nodeData.id}" data-node-id="${nodeData.id}" title="Distortion ammount" class="node-input-range glitch-range" min="1" max="25" value="${nodeData.glitchEffectSize}">
                            </div>`;
                break;
            case 'Image Warping':
                nodeData.interEffects.forEach(name => { interOptions += `<option value="${name}" ${nodeData.interEffectType === name ? 'selected' : ''}>${name}</option>`; });
                specificContentHTML = `
                            <div class="node-content">
                                <select class="node-select-field inter-effect-selector" data-node-id="${nodeData.id}">${interOptions}</select>
                                <p><textarea id="interInput${nodeData.id}" type="text" class="node-input-field custom-shader-field warp-shader" data-node-id="${nodeData.id}">${nodeData.warpingShaders[nodeData.interEffectType].replace(/; /g, ';\n').replace(/} /g, '}\n')}</textarea></p>
                                <input type="range" id="inter${nodeData.id}" data-node-id="${nodeData.id}" title="Radius: ${nodeData.interEffectSize}" class="node-input-range inter-range" min="0.01" max="1" step="0.01" value="${nodeData.interEffectSize}" style="margin-top:10px">
                            </div>`;
                break;
            case 'Projection':
                nodeData.primitiveNames.forEach(name => { primitiveOptions += `<option value="${name}" ${nodeData.primitiveType === name ? 'selected' : ''}>${name}</option>`; });
                specificContentHTML = `
                            <div class="node-content">
                                <input tabIndex="-1" type="file" title="Upload GLTF model" class="node-input-file 3d-model-loader" data-node-id="${nodeData.id}" accept=".glb, .gltf">
                                <select class="node-select-field 3d-primitive-selector" data-node-id="${nodeData.id}">${primitiveOptions}</select>
                                <button class="node-fullscreen-button" onclick="this.nextElementSibling.requestFullscreen();">Render 3D Scene</button>
                            </div>`;
                break;
            case 'Mapping / Lighting':
                nodeData.primitiveNames.forEach(name => { primitiveOptions += `<option value="${name}" ${nodeData.primitiveType === name ? 'selected' : ''}>${name}</option>`; });
                specificContentHTML = `
                            <div class="node-content">
                                <input tabIndex="-1" type="file" title="Upload GLTF model" class="node-input-file 3d-model-loader" data-node-id="${nodeData.id}" accept=".glb, .gltf">
                                <select class="node-select-field 3d-primitive-selector" data-node-id="${nodeData.id}">${primitiveOptions}</select>
                                <input type="color" class="node-input-color mapping-light-color" data-node-id="${nodeData.id}" title="Spot Light Color" value="#${nodeData.pointLight.color.getHex().toString(16)}">
                                <input type="range" class="node-input-range mapping-light-ambient" data-node-id="${nodeData.id}" title="Ambient Light Intensity" min="0" max="10" step="0.1" value="${nodeData.ambientLight.intensity}" style="width:144px">
                                <input type="range" class="node-input-range mapping-light-value" data-node-id="${nodeData.id}" title="Spot Light Intensity" min="0" max="20" step="0.1" value="${nodeData.pointLight.intensity}" style="width:144px">
                                <br><br>
                                <button class="node-fullscreen-button" onclick="this.nextElementSibling.requestFullscreen();">Render 3D Scene</button>
                            </div>`;
                break;
            case 'Matrix Operations':
                nodeData.matrixOperations.forEach(name => { matrixOptions += `<option value="${name}" ${nodeData.operationType === name ? 'selected' : ''}>${name}</option>`; });
                specificContentHTML = `
                            <div class="node-content">
                                <select class="node-select-field matrix-operation-selector" data-node-id="${nodeData.id}">${matrixOptions}</select>
                                <p><textarea id="matrixInput${nodeData.id}" type="text" class="node-input-field custom-shader-field operation-code" data-node-id="${nodeData.id}">${nodeData.operationCode[nodeData.operationType].replace(/; /g, ';\n').replace(/} /g, '}\n')}</textarea></p>
                                <input type="range" id="weights${nodeData.id}" data-node-id="${nodeData.id}" title="Weights: ${1 - nodeData.operationWeight}, ${nodeData.operationWeight}" class="node-input-range matrix-operation-range" min="0.01" max="0.99" step="0.01" value="${nodeData.operationWeight}" style="margin-top:15px">
                            </div>`;
                break;
            case 'Channel Mixer':
                specificContentHTML = `
                            <div class="node-content">
                                <input type="range" id="channelRR${nodeData.id}" data-node-id="${nodeData.id}" title="R: ${nodeData.channelMixerValues[0] * 100}%" class="node-input-range channel-mixer-range" min="0" max="1" step="0.01" value="${nodeData.channelMixerValues[0]}" style="accent-color:indianred">
                                <input type="range" id="channelRG${nodeData.id}" data-node-id="${nodeData.id}" title="G: ${nodeData.channelMixerValues[1] * 100}%" class="node-input-range channel-mixer-range" min="0" max="1" step="0.01" value="${nodeData.channelMixerValues[1]}" style="accent-color:indianred">
                                <input type="range" id="channelRB${nodeData.id}" data-node-id="${nodeData.id}" title="B: ${nodeData.channelMixerValues[2] * 100}%" class="node-input-range channel-mixer-range" min="0" max="1" step="0.01" value="${nodeData.channelMixerValues[2]}" style="accent-color:indianred">
                                <input type="range" id="channelGR${nodeData.id}" data-node-id="${nodeData.id}" title="R: ${nodeData.channelMixerValues[3] * 100}%" class="node-input-range channel-mixer-range" min="0" max="1" step="0.01" value="${nodeData.channelMixerValues[3]}" style="accent-color:darkolivegreen">
                                <input type="range" id="channelGG${nodeData.id}" data-node-id="${nodeData.id}" title="G: ${nodeData.channelMixerValues[4] * 100}%" class="node-input-range channel-mixer-range" min="0" max="1" step="0.01" value="${nodeData.channelMixerValues[4]}" style="accent-color:darkolivegreen">
                                <input type="range" id="channelGB${nodeData.id}" data-node-id="${nodeData.id}" title="B: ${nodeData.channelMixerValues[5] * 100}%" class="node-input-range channel-mixer-range" min="0" max="1" step="0.01" value="${nodeData.channelMixerValues[5]}" style="accent-color:darkolivegreen">
                                <input type="range" id="channelBR${nodeData.id}" data-node-id="${nodeData.id}" title="R: ${nodeData.channelMixerValues[6] * 100}%" class="node-input-range channel-mixer-range" min="0" max="1" step="0.01" value="${nodeData.channelMixerValues[6]}" style="accent-color:cadetblue">
                                <input type="range" id="channelBG${nodeData.id}" data-node-id="${nodeData.id}" title="G: ${nodeData.channelMixerValues[7] * 100}%" class="node-input-range channel-mixer-range" min="0" max="1" step="0.01" value="${nodeData.channelMixerValues[7]}" style="accent-color:cadetblue">
                                <input type="range" id="channelBB${nodeData.id}" data-node-id="${nodeData.id}" title="B: ${nodeData.channelMixerValues[8] * 100}%" class="node-input-range channel-mixer-range" min="0" max="1" step="0.01" value="${nodeData.channelMixerValues[8]}" style="accent-color:cadetblue">
                            </div>`;
                break;
            case 'Color Blending':
                specificContentHTML = `
                            <div class="node-content">
                                <p><input type="checkbox" class="node-input-check hue-blending" id="hueBlend${nodeData.id}" data-node-id="${nodeData.id}" ${nodeData.hueBlendChecked}>Hue<br>
                                <input type="checkbox" class="node-input-check saturation-blending" id="satBlend${nodeData.id}" data-node-id="${nodeData.id}" ${nodeData.satBlendChecked}>Saturation<br>
                                <input type="checkbox" class="node-input-check value-blending" id="valBlend${nodeData.id}" data-node-id="${nodeData.id}" ${nodeData.valBlendChecked}>Value</p>
                            </div>`;
                break;
            case 'Concatenation':
                specificContentHTML = `
                            <div class="node-content">
                                <input type="range" id="overlap${nodeData.id}" data-node-id="${nodeData.id}" title="Overlap" class="node-input-range concatenation-range" min="0" max="1" step="0.01" value="${nodeData.concatenationAlignment}">
                                <p><input type="radio" id="concatenationCheck${nodeData.id}" data-node-id="${nodeData.id}" class="node-input-check concatenation-check" name="concatenation${nodeData.id}" ${nodeData.concatenationChecked[0]}>Horizontal&nbsp;
                                <input type="radio" data-node-id="${nodeData.id}" class="node-input-check concatenation-check" name="concatenation${nodeData.id}" ${nodeData.concatenationChecked[1]}>Vertical</p>
                            </div>`;
                break;
            case 'Thresholding':
                specificContentHTML = `
                            <div class="node-content">
                                <input type="range" data-node-id="${nodeData.id}" title="Threshold / Intensity / Block size" class="node-input-range thresholding-range" min="1" max="255" value="${nodeData.thresholdValue}">
                                <p><input type="radio" data-node-id="${nodeData.id}" class="node-input-check binary-threshold-check" name="thresholdRadio${nodeData.id}" ${nodeData.thresholdingChecked[0]}><small style="margin:-1px">Binary</small>
                                <input type="radio" data-node-id="${nodeData.id}" class="node-input-check otsu-threshold-check" name="thresholdRadio${nodeData.id}" ${nodeData.thresholdingChecked[1]}><small style="margin:-1px">Otsu</small>
                                <input type="radio" data-node-id="${nodeData.id}" class="node-input-check adaptive-threshold-check" name="thresholdRadio${nodeData.id}" ${nodeData.thresholdingChecked[2]}><small style="margin:-1px">Adaptive</small></p>
                            </div>`;
                break;
            case 'Skeleton':
                specificContentHTML = `
                            <div class="node-content">
                                <p><textarea id="skelInput${nodeData.id}" type="text" class="node-input-field custom-shader-field skeleton-code" data-node-id="${nodeData.id}">${nodeData.skeletonCode.replace(/; /g, ';\n').replace(/} /g, '}\n')}</textarea></p>
                            </div>`;
                break;
            case 'Superpixels':
                specificContentHTML = `
                            <div class="node-content">
                                <input type="range" data-node-id="${nodeData.id}" title="Clusters: ${nodeData.kValue}" class="node-input-range connected-components-range" min="2" max="16" value="${nodeData.kValue}">
                            </div>`;
                break;
            case 'Character Animation':
                specificContentHTML = `
                            <div class="node-content">
                                <input tabIndex="-1" type="file" title="Upload VRM model" class="node-input-file character-model-loader" data-node-id="${nodeData.id}" accept=".vrm">
                                <button class="node-fullscreen-button" onclick="this.nextElementSibling.requestFullscreen();">Render 3D Scene</button>
                            </div>`;
                break;
            case 'Human Pose':
                specificContentHTML = `
                            <div class="node-content">
                                <input type="range" id="confidenceRange${nodeData.id}" data-node-id="${nodeData.id}" title="Detection confidence: ${nodeData.detectionConfidence}" class="node-input-range confidence-range" min="0" max="1" step="0.1" value="${nodeData.detectionConfidence}" ${nodeData.sliderDisabled}>
                            </div>`;
                break;
            case 'Optical Flow':
                specificContentHTML = `
                            <div class="node-content">
                                <input type="range" data-node-id="${nodeData.id}" title="Block size: ${nodeData.opticalFlowSize}X${nodeData.opticalFlowSize}" class="node-input-range optical-flow-range" min="3" max="33" value="${nodeData.opticalFlowSize}">
                            </div>`;
                break;
            case 'Transitions':
                nodeData.transitionTypes.forEach(name => { transitionOptions += `<option value="${name}" ${nodeData.transitionType === name ? 'selected' : ''}>${name}</option>`; });
                specificContentHTML = `
                            <div class="node-content">
                                <select class="node-select-field transition-type-selector" data-node-id="${nodeData.id}">${transitionOptions}</select>
                                <p><textarea id="transInput${nodeData.id}" type="text" class="node-input-field custom-shader-field trans-shader" data-node-id="${nodeData.id}">${nodeData.transitionShaders[nodeData.transitionType]}</textarea></p>
                                <button class="node-button transition-play-button" data-node-id="${nodeData.id}" style="width:50px;margin:5px">Play</button>
                                <input type="range" data-node-id="${nodeData.id}" title="Duration: ${nodeData.transitionDuration}s" class="node-input-range transition-duration-range" min="0.1" max="10" step="0.1" value="${nodeData.transitionDuration}" style="width:120px">
                            </div>`;
                break;
            default:
                specificContentHTML = `<div class="node-content"></div>`;
                break;
        }
        let bypassCheck = '', popOut = '', flipButton = '', changeHand = '';
        if (nodeData.type === 'Throughput' || nodeData.type === 'Mixer') {
            bypassCheck = `<input type="checkbox" class="bypass-check" data-node-id="${nodeData.id}" style="float:right" ${nodeData.bypass}>`;
        }
        if (nodeData.type === 'Viewer') {
            popOut = `<button class="node-popout-button viewer-popout-button" data-node-id="${nodeData.id}" style="float:right" title="Pop-out">&#x1F5D7;</button>`;
        }
        if (nodeData.type === 'Input' && nodeData.title === 'Camera / Microphone') {
            flipButton = `<button class="node-flip-button input-flip-button" data-node-id="${nodeData.id}" style="float:right" title="Flip left-right">&#8644;</button>`;
        }
        if (nodeData.type === 'Interactive') {
            changeHand = `<button class="node-hand-button input-hand-button" data-node-id="${nodeData.id}" style="float:right" title="Right hand">&#129306;</button>`;
        }
        nodeEl.innerHTML = `<div class="node-header">${nodeData.title}${bypassCheck}${popOut}${flipButton}${changeHand}</div>${specificContentHTML}${portsHTML}`;
        makeDraggable(nodeEl, nodeEl.querySelector('.node-header'), nodeData);
        graphContainer.appendChild(nodeEl);

        if (nodeData.type === 'Input' && nodeData.mediaElement) {
            const contentDiv = nodeEl.querySelector('.node-content');
            contentDiv.appendChild(nodeData.mediaElement);
            if (nodeData.title === 'Camera / Microphone') {
                populateCameraSelector(contentDiv, nodeData);
            }
        }
        else if ((nodeData.type === '3DScene' || nodeData.type === 'Character' || nodeData.type === 'Text') && nodeData.three) {
            nodeEl.querySelector('.node-content').appendChild(nodeData.three.renderer.domElement);
        }
        else if ((nodeData.type === 'Viewer' || nodeData.type === 'Throughput' || nodeData.type === 'Mixer' || nodeData.type === 'Parametric' || nodeData.type === 'Features' || nodeData.type === 'Audio') && nodeData.canvas) {
            nodeEl.querySelector('.node-content').appendChild(nodeData.canvas);
        }
    });
    styleConnectedPorts();
    for (var i = 0; i < 10; i++) setTimeout(renderWires, i * 100);
}

function renderWires() {
    const wireSVG = document.getElementById('wire-svg');
    wireSVG.innerHTML = '';
    connections.forEach(conn => {
        const fromPortEl = document.querySelector(`.port-output[data-node-id='${conn.fromNode}'][data-port-index='${conn.fromPort}']`);
        const toPortEl = document.querySelector(`.port-input[data-node-id='${conn.toNode}'][data-port-index='${conn.toPort}']`);
        if (fromPortEl && toPortEl) {
            drawWire(fromPortEl, toPortEl, null, conn.color);
        }
    });
}

function drawWire(port1, port2, wireEl, color = '#aef') {
    const graphContainer = document.getElementById('graph-container');
    const wireSVG = document.getElementById('wire-svg');
    const rect1 = port1.getBoundingClientRect();
    const rect2 = port2.getBoundingClientRect();
    const graphRect = graphContainer.getBoundingClientRect();
    const x1 = rect1.left + rect1.width / 2 - graphRect.left;
    const y1 = rect1.top + rect1.height / 2 - graphRect.top;
    const x2 = rect2.left + rect2.width / 2 - graphRect.left;
    const y2 = rect2.top + rect2.height / 2 - graphRect.top;
    const controlOffset = Math.abs(x2 - x1) * 0.5;
    const pathData = `M ${x1},${y1} C ${x1 + controlOffset},${y1} ${x2 - controlOffset},${y2} ${x2},${y2}`;
    if (wireEl) {
        wireEl.setAttribute('d', pathData);
        wireEl.style.stroke = color;
    }
    else {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.classList.add('wire');
        path.style.stroke = color;
        wireSVG.appendChild(path);
    }
    wireSVG.style.width = graphContainer.scrollWidth + "px";
    wireSVG.style.height = graphContainer.scrollHeight + "px";
}

function styleConnectedPorts() {
    connections.forEach(conn => {
        const fromPortEl = document.querySelector(`.port-output[data-node-id='${conn.fromNode}'][data-port-index='${conn.fromPort}']`);
        const toPortEl = document.querySelector(`.port-input[data-node-id='${conn.toNode}'][data-port-index='${conn.toPort}']`);
        if (fromPortEl && toPortEl) {
            fromPortEl.style.backgroundColor = conn.color;
            toPortEl.style.backgroundColor = conn.color;
        }
    });
}

function makeDraggable(element, handle, nodeData) {
    let offsetX, offsetY;
    function onMouseMove(event) {
        nodeData.x = event.clientX - offsetX; nodeData.y = event.clientY - offsetY;
        element.style.left = nodeData.x + 'px';
        element.style.top = nodeData.y + 'px';
        renderWires();
    }
    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
    handle.addEventListener('mousedown', (event) => {
        const currentlySelected = document.querySelector('.node.selected');
        if (currentlySelected) currentlySelected.classList.remove('selected');
        element.classList.add('selected');
        activeNode = nodeData;
        offsetX = event.clientX - nodeData.x;
        offsetY = event.clientY - nodeData.y;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

function getRandomColor() {
    const h = Math.random() * 360;
    const s = 50 + Math.random() * 25;
    const l = 45 + Math.random() * 10;
    return `hsl(${h}, ${s}%, ${l}%)`;
}
