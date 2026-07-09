async function urlExists(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
    } catch (error) { return false; }
}

function cartesian2polar(x, y) {
    let R = Math.sqrt(x * x + y * y)
    let theta = Math.atan2(y, x)
    return [R, theta]
}

function polar2cartesian(R, theta) {
    let x = R * Math.cos(theta);
    let y = R * Math.sin(theta);
    return [x, y];
}

function calculateLandmarks(source) {
    let nose = source[0][0];
    let leftEar = source[0][7];
    let rightEar = source[0][8];
    let levelY = nose.y || leftEar.y || rightEar.y;

    let rightShoulder = source[0][12];
    let leftShoulder = source[0][11];
    let klimax = 1.0 / Math.abs(leftShoulder.x - rightShoulder.x);

    let rightElbow = source[0][14];
    let leftElbow = source[0][13];
    let rightWrist = source[0][16];
    let leftWrist = source[0][15];

    let lX = null, lY = null, rX = null, rY = null;
    let bX = null, bY = null, jX = null, jY = null;
    let eR = null, eL = null, eB = null;

    if (rightWrist.y < rightShoulder.y && leftWrist.y > leftShoulder.y) {
        rX = klimax * (rightElbow.x - rightWrist.x);
        rY = klimax * (levelY - rightWrist.y) * 10;
    }
    if (rightWrist.y > rightShoulder.y && leftWrist.y < leftShoulder.y) {
        lX = klimax * (leftElbow.x - leftWrist.x);
        lY = klimax * (levelY - leftWrist.y) * 10;
    }
    if (rightWrist.y < rightShoulder.y && leftWrist.y < leftShoulder.y) {
        bX = klimax * ((leftWrist.x - rightWrist.x) - 0.5);
        bY = klimax * (leftWrist.y - rightWrist.y) * 10;
    }
    if (Math.abs(rightWrist.x - leftWrist.x) < 0.75 / klimax && Math.abs(rightWrist.y - leftWrist.y) < 0.75 / klimax) {
        jX = 0.5 - (rightWrist.x + leftWrist.x) / 2;
        jY = 0.5 - (rightWrist.y + leftWrist.y) / 2;
    }

    let checkL = leftWrist.x - leftShoulder.x > 1.5 * (leftElbow.x - leftShoulder.x) && Math.abs(leftElbow.y - leftShoulder.y) < 0.5 * Math.abs(leftShoulder.y - levelY);
    let checkR = rightShoulder.x - rightWrist.x > 1.5 * (rightShoulder.x - rightElbow.x) && Math.abs(rightElbow.y - rightShoulder.y) < 0.5 * Math.abs(rightShoulder.y - levelY);

    if (checkR && !checkL) eR = klimax * (rightShoulder.y - rightWrist.y);
    if (checkL && !checkR) eL = klimax * (leftShoulder.y - leftWrist.y);
    if (checkR && checkL) eB = klimax * (leftWrist.y - rightWrist.y);

    return [rX, rY, lX, lY, bX, bY, jX, jY, eR, eL, eB];
}

async function populateCameraSelector(container, nodeData) {
    try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        const selector = document.createElement('select');
        selector.className = 'node-select-field';

        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Camera ${index + 1}`;
            selector.appendChild(option);
        });
        selector.addEventListener('change', () => {
            startCamera(nodeData.mediaElement, selector.value);
        });
        container.prepend(selector);
        if (videoDevices.length > 0) {
            startCamera(nodeData.mediaElement, videoDevices[0].deviceId);
        }
    } catch (err) { alert(err); }
}

async function startCamera(videoElement, deviceId) {
    if (videoElement.srcObject) {
        try { videoElement.srcObject.getTracks().forEach(track => node.stop()); }
        catch { }
    }
    const constraints = {
        video: { deviceId: { exact: deviceId } },
        audio: true
    };
    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            videoElement.srcObject = stream;
        })
        .catch(err => { alert(err); });
}

function openSettings() {
    if (document.getElementById('settings').style.display == 'block')
        document.getElementById('settings').style.display = 'none';
    else document.getElementById('settings').style.display = 'block';
}

function cameraControl(sourceControl, position, ix1, ix2) {
    let cameraPosition = position;

    if (sourceControl && sourceControl.length == 2) {
        try {
            let points = calculateLandmarks(sourceControl);
            if (points[ix1]) cameraPosition.x += points[ix1];
            if (points[ix2]) cameraPosition.y += points[ix2];
        }
        catch { }
    }
    else if (sourceControl && sourceControl.length == 5 && sourceControl[3] === 'disabled') {
        let targetA = sourceControl[1] * 0.2 - 100;
        let targetB = sourceControl[2] * 0.2 - 100;
        if (sourceControl[0] > 0) {
            cameraPosition.x += (targetA - cameraPosition.x) / Math.min(Math.pow(sourceControl[0], 3), 2000);
            cameraPosition.y += (targetB - cameraPosition.y) / Math.min(Math.pow(sourceControl[0], 3), 2000);
        }
    }
    else if (sourceControl && sourceControl.length == 3) {
        cameraPosition.x = sourceControl[0] * 200 - 100;
        cameraPosition.y = sourceControl[2] * 200 - 100;
    }
    return cameraPosition;
}

function sliderControl(sourceControl, slid, sel, val, par, sens, low, high, target, res) {
    let value = val, params = par, slider = document.getElementById(slid);

    if (sourceControl && sourceControl.length == 2) {
        slider.style.accentColor = 'darkgoldenrod';
        try {
            let fx = calculateLandmarks(sourceControl);
            let ix = document.getElementById(sel).value * 1;
            if (fx[ix]) {
                params = fx[ix];
                value += fx[ix] * sens;
                if (value < low) value = low;
                if (value > high) value = high;
            }
        }
        catch { }
    }
    else if (sourceControl && sourceControl.length == 5 && sourceControl[3] === 'disabled') {
        slider.style.accentColor = 'darkgoldenrod';
        if (sourceControl[0] > 0) {
            value += (target - value) / Math.min(Math.pow(sourceControl[0], 3), 2000);
            params = sourceControl[0];
        }
    }
    else if (sourceControl && sourceControl.length == 3) {
        slider.style.accentColor = 'darkgoldenrod';
        value = res;
        params = sourceControl[0] + sourceControl[1] + sourceControl[2];
    }
    else slider.style.accentColor = '';

    slider.value = value;
    slider.title = '';

    return [value, params];
}
