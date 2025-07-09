// --- グローバル変数 ---
let observationStore = [];
let editIndex = -1;

// --- HTMLの要素を取得 ---
const observationForm = document.getElementById('observation-form');
const mainButton = document.getElementById('main-button');
const resetButton = document.getElementById('reset-button');
const celestialBodySelect = document.getElementById('celestial-body');
const starSelectionDiv = document.getElementById('star-selection-div');
const starListSelect = document.getElementById('star-list');
const tableBody = document.querySelector("#observation-table tbody");


// === メインの再描画・再計算関数 ===
function rerenderAll() {
    tableBody.innerHTML = '';
    resetMap();

    if (observationStore.length > 0) {
        const lastObs = observationStore[observationStore.length - 1];
        if (lastObs && lastObs.apLat && lastObs.apLon) {
             updatePositionMarker(lastObs.apLat, lastObs.apLon);
        }
    }

    observationStore.forEach((obsData, index) => {
        const m = obsData.m;
        const s = obsData.s;
        let ghaDeg = 0, declinationDeg = 0;

        switch (obsData.body) {
            case 'sun':
                declinationDeg = obsData.sunDecH + obsData.sunD * ((m + 0.5) / 60);
                ghaDeg = obsData.sunGhaH + 15 * ((60 * m + s) / 3600);
                break;
            case 'moon':
                declinationDeg = obsData.moonDecH + obsData.moonD * ((m + 0.5) / 60);
                ghaDeg = obsData.moonGhaH + (14 + 19 / 60) * ((60 * m + s) / 3600) + obsData.moonV * ((m + 0.5) / 60);
                break;
            case 'planet':
                declinationDeg = obsData.planetDecH + Math.sign(obsData.planetDecH1 - obsData.planetDecH) * obsData.planetD * ((m + 0.5) / 60);
                ghaDeg = obsData.planetGhaH + 15 * ((60 * m + s) / 3600) + obsData.planetV * ((m + 0.5) / 60);
                break;
            case 'star':
                declinationDeg = obsData.starDec;
                ghaDeg = obsData.starGhaAriesH + (15 + 2.5 / 60) * ((60 * m + s) / 3600) + obsData.starSha;
                break;
        }

        const declinationRad = toRad(declinationDeg);
        const latRad = toRad(obsData.apLat);
        const lhaDeg = ghaDeg + obsData.apLon;
        const lhaRad = toRad(lhaDeg);
        const sinHc = Math.sin(latRad) * Math.sin(declinationRad) + Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(lhaRad);
        const hcRad = Math.asin(sinHc);
        const hcDeg = toDeg(hcRad);

        const hsTotalDeg = (obsData.hsDeg || 0) + (obsData.hsMin || 0) / 60;
        const ieTotalDeg = (obsData.ieSign || 1) * ((obsData.ieDeg || 0) + (obsData.ieMin || 0) / 60);
        const dipDeg = (1.776 * Math.sqrt(obsData.he)) / 60;
        const refractionDeg = (obsData.r || 0) / 60;
        const parallaxDeg = (obsData.pa || 0) / 60;
        const hoDeg = hsTotalDeg + ieTotalDeg - dipDeg - refractionDeg + parallaxDeg;
        const interceptNm = (hoDeg - hcDeg) * 60;

        let azimuthDeg = 0;
        const denominator = Math.cos(hcRad) * Math.cos(latRad);
        if (Math.abs(denominator) > 1e-9) {
            let cosAz = (Math.sin(declinationRad) - Math.sin(hcRad) * Math.sin(latRad)) / denominator;
            cosAz = Math.max(-1, Math.min(1, cosAz));
            azimuthDeg = toDeg(Math.acos(cosAz));
        }
        let normalizedLha = lhaDeg % 360;
        if (normalizedLha < 0) normalizedLha += 360;
        if (normalizedLha > 0 && normalizedLha < 180) {
            azimuthDeg = 360 - azimuthDeg;
        }

        const hoDegreesInt = Math.floor(hoDeg);
        const hoMinutes = (hoDeg - hoDegreesInt) * 60;
        const formattedHo = `${hoDegreesInt}° ${hoMinutes.toFixed(1)}′`;
        
        const row = tableBody.insertRow();
        const fullSecond = String(obsData.s).padStart(2, '0');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${obsData.datetime.replace('T', ' ')}</td>
            <td>${obsData.bodyName}</td>
            <td>${formattedHo}</td>
            <td>${azimuthDeg.toFixed(1)}°</td>
            <td>
                <button onclick="editObservation(${index})">編集</button>
                <button onclick="deleteObservation(${index})">削除</button>
            </td>
        `;
        
        obsData.lopData = {};
        drawLOP(obsData.apLat, obsData.apLon, azimuthDeg, interceptNm, obsData.lopData);
    });

    if (observationStore.length >= 2) {
        const lop1 = observationStore[observationStore.length - 2].lopData;
        const lop2 = observationStore[observationStore.length - 1].lopData;
        if (lop1 && lop2) {
            const fixPoint = findIntersection(lop1.p1, lop1.p2, lop2.p1, lop2.p2);
            if (fixPoint) {
                drawFix(fixPoint[0], fixPoint[1]);
            }
        }
    }
}

function getFormData() {
    const datetimeValue = document.getElementById('obs-datetime').value;
    const date = new Date(datetimeValue + 'Z');

    return {
        datetime: datetimeValue,
        s: date.getUTCSeconds(),
        m: date.getUTCMinutes(),
        apLat: parseFloat(document.getElementById('latitude').value),
        apLon: parseFloat(document.getElementById('longitude').value),
        body: celestialBodySelect.value,
        bodyName: celestialBodySelect.options[celestialBodySelect.selectedIndex].text,
        hsDeg: parseFloat(document.getElementById('altitude-deg').value),
        hsMin: parseFloat(document.getElementById('altitude-min').value),
        ieSign: parseFloat(document.getElementById('ie-sign').value),
        ieDeg: parseFloat(document.getElementById('ie-deg').value),
        ieMin: parseFloat(document.getElementById('ie-min').value),
        he: parseFloat(document.getElementById('eye-height').value),
        r: parseFloat(document.getElementById('refraction').value),
        pa: parseFloat(document.getElementById('parallax').value),
        sunGhaH: parseFloat(document.getElementById('sun-gha-h').value),
        sunDecH: parseFloat(document.getElementById('sun-dec-h').value),
        sunD: parseFloat(document.getElementById('sun-d').value),
        moonGhaH: parseFloat(document.getElementById('moon-gha-h').value),
        moonV: parseFloat(document.getElementById('moon-v').value),
        moonDecH: parseFloat(document.getElementById('moon-dec-h').value),
        moonD: parseFloat(document.getElementById('moon-d').value),
        planetGhaH: parseFloat(document.getElementById('planet-gha-h').value),
        planetV: parseFloat(document.getElementById('planet-v').value),
        planetDecH: parseFloat(document.getElementById('planet-dec-h').value),
        planetDecH1: parseFloat(document.getElementById('planet-dec-h1').value),
        planetD: parseFloat(document.getElementById('planet-d').value),
        starGhaAriesH: parseFloat(document.getElementById('star-gha-aries-h').value),
        starSha: parseFloat(document.getElementById('star-sha').value),
        starDec: parseFloat(document.getElementById('star-dec').value),
    };
}

function populateForm(data) {
    document.getElementById('obs-datetime').value = data.datetime;
    document.getElementById('latitude').value = data.apLat;
    document.getElementById('longitude').value = data.apLon;
    document.getElementById('celestial-body').value = data.body;
    celestialBodySelect.dispatchEvent(new Event('change'));
    
    document.getElementById('altitude-deg').value = data.hsDeg;
    document.getElementById('altitude-min').value = data.hsMin;
    document.getElementById('ie-sign').value = data.ieSign;
    document.getElementById('ie-deg').value = data.ieDeg;
    document.getElementById('ie-min').value = data.ieMin;
    document.getElementById('eye-height').value = data.he;
    document.getElementById('refraction').value = data.r;
    document.getElementById('parallax').value = data.pa;
    document.getElementById('sun-gha-h').value = data.sunGhaH;
    document.getElementById('sun-dec-h').value = data.sunDecH;
    document.getElementById('sun-d').value = data.sunD;
    document.getElementById('moon-gha-h').value = data.moonGhaH;
    document.getElementById('moon-v').value = data.moonV;
    document.getElementById('moon-dec-h').value = data.moonDecH;
    document.getElementById('moon-d').value = data.moonD;
    document.getElementById('planet-gha-h').value = data.planetGhaH;
    document.getElementById('planet-v').value = data.planetV;
    document.getElementById('planet-dec-h').value = data.planetDecH;
    document.getElementById('planet-dec-h1').value = data.planetDecH1;
    document.getElementById('planet-d').value = data.planetD;
    document.getElementById('star-gha-aries-h').value = data.starGhaAriesH;
    document.getElementById('star-sha').value = data.starSha;
    document.getElementById('star-dec').value = data.starDec;
}

function editObservation(index) {
    const obsData = observationStore[index];
    populateForm(obsData);
    editIndex = index;
    mainButton.textContent = '観測データを更新';
    window.scrollTo(0, 0);
}

function deleteObservation(index) {
    if (confirm(`${index + 1}番のデータを削除しますか？`)) {
        observationStore.splice(index, 1);
        rerenderAll();
    }
}

celestialBodySelect.addEventListener('change', (event) => {
    document.querySelectorAll('.celestial-form').forEach(form => form.style.display = 'none');
    document.getElementById(event.target.value + '-form').style.display = 'block';
    starSelectionDiv.style.display = event.target.value === 'star' ? 'block' : 'none';
});

observationForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const currentData = getFormData();
    
    if (editIndex === -1) {
        observationStore.push(currentData);
    } else {
        observationStore[editIndex] = currentData;
        editIndex = -1;
        mainButton.textContent = '観測データを追加';
    }

    rerenderAll();
    observationForm.reset();
    celestialBodySelect.dispatchEvent(new Event('change'));
    document.getElementById('sun-form').style.display = 'block';
});

resetButton.addEventListener('click', () => {
    if (confirm('全てのデータをリセットしますか？')) {
        observationStore = [];
        editIndex = -1;
        mainButton.textContent = '観測データを追加';
        observationForm.reset();
        celestialBodySelect.dispatchEvent(new Event('change'));
        document.getElementById('sun-form').style.display = 'block';
        rerenderAll();
    }
});