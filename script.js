const connectButton = document.getElementById('connectButton');
const disconnectButton = document.getElementById('disconnectButton');
const bleDot = document.getElementById('bleDot');
const bleState = document.getElementById('bleState');

const distValue = document.getElementById('distValue');
const hForceValue = document.getElementById('hForceValue');
const vForceValue = document.getElementById('vForceValue');
const skidResValue = document.getElementById('skidResValue');

var deviceName = "GripTester-ESP32";
var bleService = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
var distCharUUID = "beb5483e-36e1-4688-b7f5-ea07361b26ab";
var hForceCharUUID = "beb5483e-36e1-4688-b7f5-ea07361b26ae";
var vForceCharUUID = "beb5483e-36e1-4688-b7f5-ea07361b26af";
var skidResCharUUID = "beb5483e-36e1-4688-b7f5-ea07361b26ac";
var resetCharUUID =  "beb5483e-36e1-4688-b7f5-ea07361b26ad";

var bleServer;
var bleServiceFound;
var distCharFound;
var hForceCharFound;
var vForceCharFound;
var skidResCharFound;
var resetCharFound;

var hForce = 0;
var vForce = 0;
var distance = 0;
var skidRes = 0;

var skidChart = new Chart(document.getElementById('skidResChart'), {
    type: 'line',
    data: {
        datasets: [{
            label: 'Skid Resistance',
            data: [],
            borderColor: '#a135ff',
            backgroundColor: '#a135ff' + '18',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.3,
            fill: false,
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: 'index', intersect: false },
        scales: {
            x: {
                type: 'linear',
                min: 0,
                max: 400,
                title: {
                    display: true,
                    text: '距離 (m)'
                },
                ticks: {
                    font: { size: 11 },
                    maxRotation: 45
                }
            },
            y: {
                min: 0,
                max: 1,
                title: {
                    display: true,
                    text: '摩擦係数 (μ)'
                },
                ticks: { beginAtZero: true }
            }
        },
        plugins: {
            legend: {
                display: false
            }
        }
    }
});

function updateSensorValues() {
    distValue.textContent = distance.toFixed(1);
    hForceValue.textContent = hForce.toFixed(1);
    vForceValue.textContent = vForce.toFixed(1);
    skidResValue.textContent = skidRes.toFixed(2);
}

function getSensorValue(event) {
    const value = parseFloat(
        new TextDecoder().decode(event.target.value)
    );
        
    if (!Number.isFinite(value)) {
        console.error('Invalid sensor reading');
        return null;
    }

    return value;
}

function onHForceChange(event){
    const value = getSensorValue(event);
    if(value === null) return;

    hForce = value;
    updateSensorValues();
}

function onVForceChange(event) {
    const value = getSensorValue(event);
    if(value === null) return;

    vForce = value;
    updateSensorValues();
}

function onDistanceChange(event) {
    const value = getSensorValue(event);
    if(value === null) return;

    distance = value;
    updateSensorValues();
}

function onSkidResChange(event) {
    const value = getSensorValue(event);
    if(value === null) return;

    skidRes = value;
    updateSensorValues();

    const points = skidChart.data.datasets[0].data;
    const lastPoint = points[points.length - 1];

    if(!lastPoint || distance > lastPoint.x) {
        points.push({
            x: distance,
            y: skidRes
        });
    }
    else if(distance === lastPoint.x) {
        lastPoint.y = skidRes;
    }

    skidChart.update('none');

    if(distance >= 400) {
        bleState.textContent = 'テスト完了';
    }
}

function resetData() {
    hForce = 0;
    vForce = 0;
    distance = 0;
    skidRes = 0;

    updateSensorValues();

    skidChart.data.datasets[0].data = [];
    skidChart.update();

    console.log('Test data has been reset.');
}

function isWebBluetoothEnabled() {
    if(!navigator.bluetooth) {
        bleState.textContent = 'Web Bluetooth is not available in this browser';
        return false;
    }
    return true;
}

function connectToDevice() {
    resetData();
    console.log('Initializing BLE connection...');

    navigator.bluetooth.requestDevice({
        filters: [{ name: deviceName }],
        // acceptAllDevices: true,
        optionalServices: [bleService]
    })
    .then(device => {
        console.log('Device selected:', device.name);

        device.addEventListener(
            'gattserverdisconnected',
            onDisconnected
        );

        bleState.textContent = '接続中。。。';
        return device.gatt.connect();
    })
    .then(server => {
        bleServer = server;
        return bleServer.getPrimaryService(bleService);
    })
    .then(service => {
        bleServiceFound = service;

        return Promise.all([
            service.getCharacteristic(hForceCharUUID),
            service.getCharacteristic(vForceCharUUID),
            service.getCharacteristic(distCharUUID),
            service.getCharacteristic(skidResCharUUID),
            service.getCharacteristic(resetCharUUID)
        ]);
    })
    .then(characteristics => {
        hForceCharFound = characteristics[0];
        vForceCharFound = characteristics[1];
        distCharFound = characteristics[2];
        skidResCharFound = characteristics[3];
        resetCharFound = characteristics[4];

        hForceCharFound.addEventListener(
            'characteristicvaluechanged', onHForceChange
        );
        vForceCharFound.addEventListener(
            'characteristicvaluechanged', onVForceChange
        );
        distCharFound.addEventListener(
            'characteristicvaluechanged', onDistanceChange
        );
        skidResCharFound.addEventListener(
            'characteristicvaluechanged', onSkidResChange
        );
        
        return resetCharFound.writeValueWithResponse(
            new TextEncoder().encode('RESET')
        ).then(() => {
            return Promise.all([
            hForceCharFound.startNotifications(),
            vForceCharFound.startNotifications(),
            distCharFound.startNotifications(),
            skidResCharFound.startNotifications()
            ]);
        })
    })
    .then(() => {
        bleState.textContent = 'GripTester-ESP32に接続済み';

        if(bleDot) bleDot.classList.add('connected');
        connectButton.classList.add('hidden');
        disconnectButton.classList.remove('hidden');

        console.log('BLE notifications started');
    })
    .catch(error => {
        console.error('BLE connection error:', error);
        bleState.textContent = '接続に失敗しました。';
    });
}

function disconnectDevice() {
    resetData();
    if(bleServer && bleServer.connected) {
        bleServer.disconnect();
    }
}

function onDisconnected() {
    bleState.textContent = '切断';

    if(bleDot) bleDot.classList.remove('connected');
    connectButton.classList.remove('hidden');
    disconnectButton.classList.add('hidden');

    console.log('BLE device disconnected');
}

connectButton.addEventListener('click', () => {
    if(isWebBluetoothEnabled()) {
        connectToDevice();
    }
});

disconnectButton.addEventListener('click', disconnectDevice);





