// --- グローバル変数 ---
let observationStore = [];
let editIndex = -1;

// --- HTMLの要素を取得 ---
const observationForm = document.getElementById('observation-form');
const mainButton = document.getElementById('main-button');
const resetButton = document.getElementById('reset-button');
const celestialBodySelect = document.getElementById('celestial-body');
const tableBody = document.querySelector("#observation-table tbody");

// --- 度分秒と度数法を変換するヘルパー関数 ---
function dmsToDec(deg, min, sec) {
    const d = deg || 0;
    const m = min || 0;
    const s = sec || 0;
    const sign = d < 0 ? -1 : 1;
    return d + sign * (m / 60) + sign * (s / 3600);
}

function decToDms(decimal) {
    if(typeof decimal !== 'number' || isNaN(decimal)) return { deg: '', min: '', sec: '' };
    const sign = decimal < 0 ? -1 : 1;
    decimal = Math.abs(decimal);
    const deg = Math.trunc(decimal);
    const minDecimal = (decimal - deg) * 60;
    const min = Math.trunc(minDecimal);
    const sec = (minDecimal - min) * 60;
    return { deg: deg * sign, min: min, sec: parseFloat(sec.toFixed(1)) };
}

// === メインの再描画・再計算関数 ===
function rerenderAll() {
    tableBody.innerHTML = '';
    resetMap();

    if (observationStore.length > 0) {
        const lastObs = observationStore[observationStore.length - 1];
        if (lastObs && typeof lastObs.apLat !== 'undefined' && typeof lastObs.apLon !== 'undefined') {
             updatePositionMarker(lastObs.apLat, lastObs.apLon);
        }
    }

    observationStore.forEach((obsData, index) => {
        const m = obsData.m;
        const s = obsData.s;
        let ghaDeg = 0, declinationDeg = 0;

        switch (obsData.body) {
            case 'sun':
                declinationDeg = obsData.sunDecH + obsData.sunD * ((m + s / 60) / 60);
                ghaDeg = obsData.sunGhaH + 15 * ((60 * m + s) / 3600);
                break;
            case 'moon':
                declinationDeg = obsData.moonDecH + obsData.moonD * ((m + s / 60) / 60);
                ghaDeg = obsData.moonGhaH + (14 + 19 / 60) * ((60 * m + s) / 3600) + obsData.moonV * ((m + s / 60) / 60);
                break;
            case 'planet':
                declinationDeg = obsData.planetDecH + Math.sign(obsData.planetDecH1 - obsData.planetDecH) * obsData.planetD * ((m + s / 60) / 60);
                ghaDeg = obsData.planetGhaH + 15 * ((60 * m + s) / 3600) + obsData.planetV * ((m + s / 60) / 60);
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

        const hsTotalDeg = obsData.hsDeg + (obsData.hsMin / 60);
        const ieTotalDeg = obsData.ieSign * (obsData.ieDeg + (obsData.ieMin / 60));
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

        const hcDms = decToDms(hcDeg);
        const formattedHc = `${hcDms.deg}° ${hcDms.min}′`;
        const hoDms = decToDms(hoDeg);
        const formattedHo = `${hoDms.deg}° ${hoDms.min}′`;

        const row = tableBody.insertRow();
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${obsData.datetime.replace('T', ' ')}</td>
            <td>${obsData.bodyName}</td>
            <td>${formattedHc}</td>
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

function getField(id) { return parseFloat(document.getElementById(id).value); }

function getFormData() {
    const datetimeValue = document.getElementById('obs-datetime').value;
    const date = new Date(datetimeValue + 'Z');

    return {
        datetime: datetimeValue,
        s: date.getUTCSeconds(), m: date.getUTCMinutes(),
        apLat: dmsToDec(getField('lat-deg'), getField('lat-min'), getField('lat-sec')),
        apLon: dmsToDec(getField('lon-deg'), getField('lon-min'), getField('lon-sec')),
        body: celestialBodySelect.value,
        bodyName: celestialBodySelect.options[celestialBodySelect.selectedIndex].text,
        hsDeg: getField('altitude-deg'), hsMin: getField('altitude-min'),
        ieSign: getField('ie-sign'), ieDeg: getField('ie-deg'), ieMin: getField('ie-min'),
        he: getField('eye-height'), r: getField('refraction'), pa: getField('parallax'),
        sunGhaH: dmsToDec(getField('sun-gha-h-deg'), getField('sun-gha-h-min'), getField('sun-gha-h-sec')),
        sunDecH: dmsToDec(getField('sun-dec-h-deg'), getField('sun-dec-h-min'), getField('sun-dec-h-sec')),
        sunD: getField('sun-d-sign') * dmsToDec(0, getField('sun-d-min'), getField('sun-d-sec')),
        moonGhaH: dmsToDec(getField('moon-gha-h-deg'), getField('moon-gha-h-min'), getField('moon-gha-h-sec')),
        moonV: getField('moon-v-sign') * dmsToDec(0, getField('moon-v-min'), getField('moon-v-sec')),
        moonDecH: dmsToDec(getField('moon-dec-h-deg'), getField('moon-dec-h-min'), getField('moon-dec-h-sec')),
        moonD: getField('moon-d-sign') * dmsToDec(0, getField('moon-d-min'), getField('moon-d-sec')),
        planetGhaH: dmsToDec(getField('planet-gha-h-deg'), getField('planet-gha-h-min'), getField('planet-gha-h-sec')),
        planetV: getField('planet-v-sign') * dmsToDec(0, getField('planet-v-min'), getField('planet-v-sec')),
        planetDecH: dmsToDec(getField('planet-dec-h-deg'), getField('planet-dec-h-min'), getField('planet-dec-h-sec')),
        planetDecH1: dmsToDec(getField('planet-dec-h1-deg'), getField('planet-dec-h1-min'), getField('planet-dec-h1-sec')),
        planetD: getField('planet-d-sign') * dmsToDec(0, getField('planet-d-min'), getField('planet-d-sec')),
        starGhaAriesH: dmsToDec(getField('star-gha-aries-h-deg'), getField('star-gha-aries-h-min'), getField('star-gha-aries-h-sec')),
        starSha: dmsToDec(getField('star-sha-deg'), getField('star-sha-min'), getField('star-sha-sec')),
        starDec: dmsToDec(getField('star-dec-deg'), getField('star-dec-min'), getField('star-dec-sec')),
    };
}

function setField(id, value) { document.getElementById(id).value = value === 0 ? 0 : (value || ''); }

function setDmsFields(baseId, decimal) {
    const dms = decToDms(decimal);
    setField(`${baseId}-deg`, dms.deg);
    setField(`${baseId}-min`, dms.min);
    setField(`${baseId}-sec`, dms.sec);
}

function populateForm(data) {
    setField('obs-datetime', data.datetime);
    setDmsFields('lat', data.apLat);
    setDmsFields('lon', data.apLon);
    setField('celestial-body', data.body);
    celestialBodySelect.dispatchEvent(new Event('change'));
    
    setField('altitude-deg', data.hsDeg);
    setField('altitude-min', data.hsMin);
    setField('ie-sign', data.ieSign);
    setField('ie-deg', data.ieDeg);
    setField('ie-min', data.ieMin);
    setField('eye-height', data.he);
    setField('refraction', data.r);
    setField('parallax', data.pa);

    setDmsFields('sun-gha-h', data.sunGhaH);
    setDmsFields('sun-dec-h', data.sunDecH);
    setField('sun-d-sign', Math.sign(data.sunD) || 1);
    let dms = decToDms(Math.abs(data.sunD));
    setField('sun-d-min', dms.min);
    setField('sun-d-sec', dms.sec);
    
    setDmsFields('moon-gha-h', data.moonGhaH);
    setField('moon-v-sign', Math.sign(data.moonV) || 1);
    dms = decToDms(Math.abs(data.moonV));
    setField('moon-v-min', dms.min);
    setField('moon-v-sec', dms.sec);
    setDmsFields('moon-dec-h', data.moonDecH);
    setField('moon-d-sign', Math.sign(data.moonD) || 1);
    dms = decToDms(Math.abs(data.moonD));
    setField('moon-d-min', dms.min);
    setField('moon-d-sec', dms.sec);
    
    setDmsFields('planet-gha-h', data.planetGhaH);
    setField('planet-v-sign', Math.sign(data.planetV) || 1);
    dms = decToDms(Math.abs(data.planetV));
    setField('planet-v-min', dms.min);
    setField('planet-v-sec', dms.sec);
    setDmsFields('planet-dec-h', data.planetDecH);
    setDmsFields('planet-dec-h1', data.planetDecH1);
    setField('planet-d-sign', Math.sign(data.planetD) || 1);
    dms = decToDms(Math.abs(data.planetD));
    setField('planet-d-min', dms.min);
    setField('planet-d-sec', dms.sec);

    setDmsFields('star-gha-aries-h', data.starGhaAriesH);
    setDmsFields('star-sha', data.starSha);
    setDmsFields('star-dec', data.starDec);
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