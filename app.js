// Control de Accesos – versión con evidencias (IndexedDB), movimiento y mejoras
(function () {
  const { useState, useEffect, useMemo, useRef } = React;

  /* -------------------- IndexedDB helpers (photos) -------------------- */
  function openMediaDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('acx_media', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('photos')) {
          const store = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function dataURLtoBlob(dataURL) {
    const [meta, base] = dataURL.split(',');
    const isBase64 = /;base64$/.test(meta);
    const mime = (meta.match(/data:(.*?)(;|$)/) || [])[1] || 'application/octet-stream';
    let bytes;
    if (isBase64) {
      const bin = atob(base);
      const len = bin.length;
      const arr = new Uint8Array(len);
      for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
      bytes = arr;
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(base));
    }
    return new Blob([bytes], { type: mime });
  }
  async function idbSavePhotoFromDataURL(dataURL) {
    if (!dataURL) return '';
    const blob = dataURLtoBlob(dataURL);
    const db = await openMediaDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      const store = tx.objectStore('photos');
      const now = Date.now();
      const req = store.add({ blob, createdAt: now });
      req.onsuccess = () => resolve('idb:photo:' + req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGetPhotoDataURL(ref) {
    if (!ref || !ref.startsWith('idb:photo:')) return ref || '';
    const id = parseInt(ref.split(':').pop(), 10);
    const db = await openMediaDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readonly');
      const store = tx.objectStore('photos');
      const req = store.get(id);
      req.onsuccess = () => {
        const rec = req.result;
        if (!rec || !rec.blob) return resolve('');
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(rec.blob);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /* -------------------- UI: Modal -------------------- */
  function ModalWrapper({ title, onClose, children }) {
    return React.createElement(
      'div',
      { className: 'modal-overlay' },
      React.createElement(
        'div',
        { className: 'modal' },
        React.createElement(
          'button',
          { className: 'close-btn', onClick: onClose, title: 'Cerrar' },
          React.createElement('i', { className: 'fas fa-times' })
        ),
        React.createElement('h2', null, title),
        children
      )
    );
  }

  /* -------------------- UI: CameraBlock -------------------- */
  function CameraBlock({ label, value, onChange }) {
    const [open, setOpen] = useState(false);
    const [streamOn, setStreamOn] = useState(false);
    const videoRef = useRef(null);
    const streamRef = useRef(null);

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          streamRef.current = stream;
          setStreamOn(true);
        }
      } catch (err) {
        alert('No se pudo acceder a la cámara. Use HTTPS o localhost, y otorgue permisos.');
        console.error(err);
      }
    }
    function stopCamera() {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
      setStreamOn(false);
    }
    function capture() {
      if (!videoRef.current) return;
      const v = videoRef.current;
      const c = document.createElement('canvas');
      const w = v.videoWidth || 640, h = v.videoHeight || 480;
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(v, 0, 0, w, h);
      const data = c.toDataURL('image/jpeg', 0.85);
      onChange(data);
      stopCamera();
      setOpen(false);
    }
    useEffect(() => () => stopCamera(), []);

    return React.createElement(
      'div', { className: 'camera-block' },
      React.createElement('h4', null, label),
      value
        ? React.createElement('img', { className: 'camera-preview', src: value, alt: label })
        : React.createElement('p', { className: 'small muted' }, 'Sin foto.'),
      React.createElement('div', { className: 'camera-actions' },
        React.createElement('button', { className: 'button', onClick: () => setOpen(true) }, value ? 'Repetir foto' : 'Tomar foto'),
        value && React.createElement('button', { className: 'button danger', onClick: () => onChange('') }, 'Eliminar')
      ),
      open && React.createElement(
        'div', { className: 'modal-overlay' },
        React.createElement(
          'div', { className: 'modal' },
          React.createElement('h3', null, 'Cámara: ', label),
          React.createElement('p', { className: 'small muted' }, 'La cámara solo se activa cuando lo decides.'),
          React.createElement('video', { ref: videoRef, playsInline: true, muted: true, style: { width: '100%', borderRadius: 8, background: '#000' } }),
          React.createElement('div', { className: 'camera-actions' },
            !streamOn && React.createElement('button', { className: 'button', onClick: startCamera }, 'Activar cámara'),
            streamOn && React.createElement('button', { className: 'button', onClick: capture }, 'Tomar foto'),
            streamOn && React.createElement('button', { className: 'button danger', onClick: stopCamera }, 'Detener cámara'),
            React.createElement('button', { className: 'button', onClick: () => { stopCamera(); setOpen(false); } }, 'Cerrar')
          )
        )
      )
    );
  }

  /* -------------------- Login -------------------- */
  function Login({ onSubmit }) {
    const [role, setRole] = useState('Guardia');
    const [turno, setTurno] = useState('Matutino');
    return React.createElement(
      'div',
      { className: 'container', style: { marginTop: '3rem', maxWidth: '400px' } },
      React.createElement('h1', { style: { textAlign: 'center', marginBottom: '0.25rem', fontSize: '1.75rem' } }, 'ctrl caseta'),
      React.createElement('p', { style: { textAlign: 'center', marginBottom: '1rem', fontSize: '0.875rem', color: '#4A5568' } }, 'desarrollado por reizo atarashi'),
      React.createElement('h1', { style: { textAlign: 'center', marginBottom: '1rem' } }, 'Control de Accesos'),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Rol'),
        React.createElement('select', { value: role, onChange: e => setRole(e.target.value) },
          React.createElement('option', { value: 'Guardia' }, 'Guardia'),
          React.createElement('option', { value: 'Administrador' }, 'Administrador')
        )
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Turno'),
        React.createElement('select', { value: turno, onChange: e => setTurno(e.target.value) },
          React.createElement('option', { value: 'Matutino' }, 'Matutino'),
          React.createElement('option', { value: 'Vespertino' }, 'Vespertino'),
          React.createElement('option', { value: 'Nocturno' }, 'Nocturno')
        )
      ),
      React.createElement('button', { className: 'button', style: { width: '100%', marginTop: '1rem' }, onClick: () => onSubmit(role, turno) }, 'Ingresar')
    );
  }

  /* -------------------- Dashboard -------------------- */
  function Dashboard({ role, onNavigate, turno }) {
    const cards = [
      { key: 'vehicle', icon: 'fa-car', title: 'Registrar vehículo' },
      { key: 'pedestrian', icon: 'fa-person-walking', title: 'Registrar peatón' },
      { key: 'history', icon: 'fa-list', title: 'Historial de accesos' },
      { key: 'bitacora', icon: 'fa-clipboard-list', title: 'Bitácora' }
    ];
    if (role === 'Administrador') {
      cards.push({ key: 'admin', icon: 'fa-cog', title: 'Administración' });
    }
    return React.createElement(
      'div', { className: 'container' },
      React.createElement('h2', null, `Bienvenido, ${role}`),
      React.createElement('p', null, `Turno: ${turno}`),
      React.createElement('div', { className: 'grid' },
        cards.map(c =>
          React.createElement('div', { key: c.key, className: 'card', onClick: () => onNavigate(c.key) },
            React.createElement('i', { className: `fas ${c.icon}` }),
            React.createElement('span', null, c.title)
          )
        )
      )
    );
  }

  /* -------------------- Register Vehicle -------------------- */
  function RegisterVehicle({ db, SQL, models, saveDb, onClose }) {
    const [plate, setPlate] = useState('');
    const [name, setName] = useState('');
    const [motivo, setMotivo] = useState('');
    const [modelo, setModelo] = useState('');
    const [color, setColor] = useState('#2F855A');
    const [destino, setDestino] = useState('');
    const [registroTipo, setRegistroTipo] = useState('');
    const [razonBloqueo, setRazonBloqueo] = useState('');

    // temp photos as dataURL until submit; we persist to IndexedDB on save
    const [fotoPersona, setFotoPersona] = useState('');
    const [fotoPlaca, setFotoPlaca] = useState('');
    const [fotoId, setFotoId] = useState('');

    // DEDUP suggestions: last record for each placa
    const suggestions = useMemo(() => {
      if (!db || plate.trim() === '') return [];
      try {
        const stmt = db.prepare(`
          SELECT v1.placa, v1.nombre, v1.motivo, v1.modelo, v1.color, v1.destino
          FROM vehiculos v1
          JOIN (
            SELECT placa, MAX(id) AS maxid
            FROM vehiculos
            WHERE placa LIKE ?
            GROUP BY placa
          ) latest
          ON v1.placa = latest.placa AND v1.id = latest.maxid
          ORDER BY v1.id DESC
          LIMIT 5
        `);
        stmt.bind([plate.toUpperCase() + '%']);
        const list = [];
        while (stmt.step()) list.push(stmt.getAsObject());
        stmt.free();
        return list;
      } catch (err) {
        console.error(err);
        return [];
      }
    }, [plate, db]);

    function handlePlateSelected(newPlate) {
      const val = (newPlate || '').toUpperCase();
      setPlate(val);
      const found = suggestions.find(s => s.placa === val);
      if (found) {
        setName(found.nombre || '');
        setMotivo(found.motivo || '');
        setModelo(found.modelo || '');
        setColor(found.color || '#2F855A');
        setDestino(found.destino || '');
      }
    }

    async function handleSubmit(accion) {
      if (!plate || !name || !destino) { alert('La placa, el nombre y el destino son obligatorios.'); return; }
      if (registroTipo === 'boletinado') { alert('Visita boletinada. No se registró movimiento.'); return; }
      const now = new Date();
      const fecha = now.toISOString().slice(0, 10);
      const hora = now.toTimeString().slice(0, 8);
      // Persist photos to IDB (store refs; if empty -> '')
      let refPersona = '', refPlaca = '', refId = '';
      try {
        if (fotoPersona) refPersona = await idbSavePhotoFromDataURL(fotoPersona);
        if (fotoPlaca)   refPlaca   = await idbSavePhotoFromDataURL(fotoPlaca);
        if (fotoId)      refId      = await idbSavePhotoFromDataURL(fotoId);
      } catch (err) {
        console.error('Fallo guardando fotos en IndexedDB', err);
        alert('No se pudieron guardar las fotos localmente. Continuaré sin fotos.');
      }
      try {
        db.run(
          'INSERT INTO vehiculos (placa,nombre,motivo,modelo,color,destino,fecha,hora,movimiento,foto_persona,foto_placa,foto_identificacion) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          [plate.toUpperCase(), name, motivo, modelo, color, destino, fecha, hora, accion, refPersona, refPlaca, refId]
        );
      } catch (err) {
        console.error('Fallo al escribir en vehiculos', err);
        alert('No se pudo escribir en la base de datos (vehiculos): ' + (err && err.message ? err.message : err));
        return;
      }
      try {
        saveDb();
      } catch (err) {
        console.error('Fallo al guardar en localStorage', err);
        alert('El registro se creó pero no se pudo guardar localmente (espacio insuficiente). Exporta/limpia y reintenta.');
        return;
      }
      alert(`Vehículo registrado (${accion}).`);
      // reset
      setPlate(''); setName(''); setMotivo(''); setModelo(''); setColor('#2F855A'); setDestino('');
      setRegistroTipo(''); setRazonBloqueo(''); setFotoPersona(''); setFotoPlaca(''); setFotoId('');
      onClose();
    }

    return React.createElement(
      'div',
      { style: registroTipo === 'frecuente' ? { backgroundColor: '#F0FFF4', padding: '1rem', borderRadius: 8 } : (registroTipo === 'boletinado' ? { backgroundColor: '#FFF5F5', padding: '1rem', borderRadius: 8 } : {}) },
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Placa'),
        React.createElement('input', { list: 'placasList', value: plate, onChange: e => setPlate(e.target.value.toUpperCase()), onBlur: e => handlePlateSelected(e.target.value) , placeholder: 'ABC1234' }),
        React.createElement('datalist', { id: 'placasList' },
          suggestions.map((s, i) => React.createElement('option', { key: i, value: s.placa }, `${s.placa} - ${s.nombre}`))
        )
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Nombre completo'),
        React.createElement('input', { type: 'text', value: name, onChange: e => setName(e.target.value) })
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Motivo de la visita'),
        React.createElement('input', { type: 'text', value: motivo, onChange: e => setMotivo(e.target.value), placeholder: 'Entrega, Visita, Servicio, etc.' })
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Modelo vehicular'),
        React.createElement('input', { list: 'modelosList', value: modelo, onChange: e => setModelo(e.target.value), placeholder: 'Seleccione o escriba modelo' }),
        React.createElement('datalist', { id: 'modelosList' },
          (models || []).map((m, idx) => React.createElement('option', { key: idx, value: m.name }, m.name))
        )
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Color'),
        React.createElement('input', { type: 'color', value: color, onChange: e => setColor(e.target.value) })
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Destino'),
        React.createElement('input', { type: 'text', value: destino, onChange: e => setDestino(e.target.value), placeholder: 'Número de casa/depto' })
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Clasificación'),
        React.createElement('select', { value: registroTipo, onChange: e => setRegistroTipo(e.target.value) },
          React.createElement('option', { value: '' }, 'Seleccione'),
          React.createElement('option', { value: 'frecuente' }, 'Frecuente'),
          React.createElement('option', { value: 'boletinado' }, 'Boletinado')
        )
      ),
      registroTipo === 'boletinado' && React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Razón de bloqueo'),
        React.createElement('input', { type: 'text', value: razonBloqueo, onChange: e => setRazonBloqueo(e.target.value), placeholder: 'Explique el motivo...' })
      ),
      React.createElement('div', { className: 'evidencias' },
        React.createElement('p', { className: 'small muted' }, 'Evidencias (opcional). La cámara no se activa automáticamente.'),
        React.createElement('div', { className: 'row' },
          React.createElement(CameraBlock, { label: 'Foto de la persona', value: fotoPersona, onChange: setFotoPersona }),
          React.createElement(CameraBlock, { label: 'Foto de la placa', value: fotoPlaca, onChange: setFotoPlaca }),
          React.createElement(CameraBlock, { label: 'Identificación', value: fotoId, onChange: setFotoId })
        )
      ),
      React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' } },
        React.createElement('button', { className: 'button', onClick: () => handleSubmit('entrada'), disabled: registroTipo === 'boletinado' }, 'Registrar entrada'),
        React.createElement('button', { className: 'button', onClick: () => handleSubmit('salida'), disabled: registroTipo === 'boletinado' }, 'Registrar salida'),
        React.createElement('button', { className: 'button danger', onClick: onClose }, 'Cancelar')
      )
    );
  }

  /* -------------------- Register Pedestrian -------------------- */
  function RegisterPedestrian({ db, saveDb, onClose }) {
    const [name, setName] = useState('');
    const [motivo, setMotivo] = useState('');
    const [destino, setDestino] = useState('');
    const [idOpcional, setIdOpcional] = useState('');
    function handleSubmit() {
      if (!name || !destino) { alert('El nombre y el destino son obligatorios.'); return; }
      const now = new Date();
      const fecha = now.toISOString().slice(0, 10);
      const hora = now.toTimeString().slice(0, 8);
      try {
        db.run('INSERT INTO peatones (nombre,motivo,destino,id_opcional,fecha,hora) VALUES (?,?,?,?,?,?)', [name, motivo, destino, idOpcional, fecha, hora]);
        saveDb();
        alert('Peatón registrado correctamente');
        setName(''); setMotivo(''); setDestino(''); setIdOpcional('');
        onClose();
      } catch (err) {
        console.error(err);
        alert('Error al registrar al peatón');
      }
    }
    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Nombre completo'),
        React.createElement('input', { type: 'text', value: name, onChange: e => setName(e.target.value) })
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Motivo de la visita'),
        React.createElement('input', { type: 'text', value: motivo, onChange: e => setMotivo(e.target.value), placeholder: 'Entrega, Visita, Servicio, etc.' })
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Destino'),
        React.createElement('input', { type: 'text', value: destino, onChange: e => setDestino(e.target.value), placeholder: 'Número de casa/depto' })
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'ID (opcional)'),
        React.createElement('input', { type: 'text', value: idOpcional, onChange: e => setIdOpcional(e.target.value), placeholder: 'Credencial, INE, etc.' })
      ),
      React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' } },
        React.createElement('button', { className: 'button', onClick: handleSubmit }, 'Registrar'),
        React.createElement('button', { className: 'button danger', onClick: onClose }, 'Cancelar')
      )
    );
  }

  /* -------------------- Evidence Viewer -------------------- */
  function EvidenceModal({ record, onClose }) {
    const [urls, setUrls] = useState([]);
    useEffect(() => {
      let cancelled = false;
      async function load() {
        const refs = [record.foto_persona, record.foto_placa, record.foto_identificacion].filter(Boolean);
        const arr = [];
        for (const r of refs) {
          try {
            arr.push(await idbGetPhotoDataURL(r));
          } catch (e) {
            arr.push('');
          }
        }
        if (!cancelled) setUrls(arr.filter(Boolean));
      }
      load();
      return () => { cancelled = true; };
    }, [record]);
    return React.createElement(
      'div', { className: 'modal-overlay' },
      React.createElement(
        'div', { className: 'modal' },
        React.createElement('button', { className: 'close-btn', onClick: onClose }, React.createElement('i', { className: 'fas fa-times' })),
        React.createElement('h3', null, 'Evidencias'),
        urls.length === 0
          ? React.createElement('p', null, 'Sin fotos.')
          : React.createElement('div', { className: 'gallery' },
              urls.map((u, i) => React.createElement('div', { key: i },
                React.createElement('img', { src: u, alt: 'Evidencia ' + (i + 1) }),
                React.createElement('a', { href: u, download: `evidencia_${record.id}_${i+1}.jpg`, className: 'button', style: { marginTop: 6, display: 'inline-block' } }, 'Descargar')
              ))
            )
      )
    );
  }

  /* -------------------- History -------------------- */
  function HistoryView({ db, onClose }) {
    const [records, setRecords] = useState([]);
    const [filters, setFilters] = useState({ tipo: '', nombre: '', placa: '', destino: '', fechaInicio: '', fechaFin: '', movimiento: '' });
    const [sortConfig, setSortConfig] = useState({ key: 'fecha', direction: 'desc' });
    const [evi, setEvi] = useState(null);

    useEffect(() => {
      if (!db) return;
      try {
        const vehRes = db.exec("SELECT id,fecha,hora,'Vehículo' AS tipo,nombre,placa,destino,motivo,modelo,color,movimiento,foto_persona,foto_placa,foto_identificacion FROM vehiculos");
        const peatRes = db.exec("SELECT id,fecha,hora,'Peatón' AS tipo,nombre,'' AS placa,destino,motivo,'' AS modelo,'' AS color,'' AS movimiento,'' AS foto_persona,'' AS foto_placa,'' AS foto_identificacion FROM peatones");
        const mapRows = res => {
          if (!res[0]) return [];
          const cols = res[0].columns;
          return res[0].values.map(row => { const obj = {}; cols.forEach((c, idx) => obj[c] = row[idx]); return obj; });
        };
        const allRows = [...mapRows(vehRes), ...mapRows(peatRes)];
        setRecords(allRows);
      } catch (err) {
        console.error(err);
      }
    }, [db]);

    const filtered = useMemo(() => {
      let data = records;
      if (filters.tipo) data = data.filter(r => r.tipo === filters.tipo);
      if (filters.nombre) data = data.filter(r => (r.nombre || '').toLowerCase().includes(filters.nombre.toLowerCase()));
      if (filters.placa) data = data.filter(r => (r.placa || '').toLowerCase().includes(filters.placa.toLowerCase()));
      if (filters.destino) data = data.filter(r => (r.destino || '').toLowerCase().includes(filters.destino.toLowerCase()));
      if (filters.movimiento) data = data.filter(r => (r.movimiento || '') === filters.movimiento);
      if (filters.fechaInicio) data = data.filter(r => r.fecha >= filters.fechaInicio);
      if (filters.fechaFin) data = data.filter(r => r.fecha <= filters.fechaFin);
      if (sortConfig.key) {
        data = [...data].sort((a, b) => {
          const aVal = (a[sortConfig.key] || '');
          const bVal = (b[sortConfig.key] || '');
          if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
      }
      return data;
    }, [records, filters, sortConfig]);

    function handleSort(key) {
      setSortConfig(prev => prev.key === key ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
    }
    function exportCSV() {
      const headers = ['Fecha','Hora','Tipo','Nombre','Placa','Destino','Motivo','Modelo','Color','Movimiento'];
      const rows = filtered.map(r => [r.fecha, r.hora, r.tipo, r.nombre, r.placa, r.destino, r.motivo, r.modelo, r.color, r.movimiento]);
      const csv = [headers.join(','), ...rows.map(row => row.map(v => '"' + (v || '') + '"').join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'historial.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }

    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'filter-bar' },
        React.createElement('select', { value: filters.tipo, onChange: e => setFilters({ ...filters, tipo: e.target.value }) },
          React.createElement('option', { value: '' }, 'Todos'),
          React.createElement('option', { value: 'Vehículo' }, 'Vehículos'),
          React.createElement('option', { value: 'Peatón' }, 'Peatones')
        ),
        React.createElement('input', { type: 'text', placeholder: 'Nombre', value: filters.nombre, onChange: e => setFilters({ ...filters, nombre: e.target.value }) }),
        React.createElement('input', { type: 'text', placeholder: 'Placa', value: filters.placa, onChange: e => setFilters({ ...filters, placa: e.target.value }) }),
        React.createElement('input', { type: 'text', placeholder: 'Destino', value: filters.destino, onChange: e => setFilters({ ...filters, destino: e.target.value }) }),
        React.createElement('select', { value: filters.movimiento, onChange: e => setFilters({ ...filters, movimiento: e.target.value }) },
          React.createElement('option', { value: '' }, 'Todos los movimientos'),
          React.createElement('option', { value: 'entrada' }, 'Entradas'),
          React.createElement('option', { value: 'salida' }, 'Salidas')
        ),
        React.createElement('input', { type: 'date', value: filters.fechaInicio, onChange: e => setFilters({ ...filters, fechaInicio: e.target.value }) }),
        React.createElement('input', { type: 'date', value: filters.fechaFin, onChange: e => setFilters({ ...filters, fechaFin: e.target.value }) }),
        React.createElement('button', { className: 'button', onClick: exportCSV }, 'Exportar CSV'),
        React.createElement('button', { className: 'button danger', onClick: onClose }, 'Cerrar')
      ),
      React.createElement('div', { className: 'table-container' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              ['Fecha','Hora','Tipo','Nombre','Placa','Destino','Motivo','Modelo','Color','Movimiento','Evidencias'].map(key =>
                React.createElement('th', { key, className: 'sortable', onClick: () => handleSort(key.toLowerCase()) },
                  key + (sortConfig.key === key.toLowerCase() ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''))
              )
            )
          ),
          React.createElement('tbody', null,
            filtered.map((r, idx) => React.createElement('tr', { key: idx },
              React.createElement('td', null, r.fecha),
              React.createElement('td', null, r.hora),
              React.createElement('td', null, r.tipo),
              React.createElement('td', null, r.nombre),
              React.createElement('td', null, r.placa),
              React.createElement('td', null, r.destino),
              React.createElement('td', null, r.motivo),
              React.createElement('td', null, r.modelo),
              React.createElement('td', null, React.createElement('span', { style: { backgroundColor: r.color || '#FFFFFF', padding: '2px 6px', borderRadius: 4, display: 'inline-block' } }, r.color)),
              React.createElement('td', null,
                r.movimiento
                  ? React.createElement('span', { className: 'badge ' + (r.movimiento === 'entrada' ? 'entry' : 'exit') }, r.movimiento)
                  : ''
              ),
              React.createElement('td', null,
                r.tipo === 'Vehículo' && (r.foto_persona || r.foto_placa || r.foto_identificacion)
                  ? React.createElement('button', { className: 'button', onClick: () => setEvi(r) }, 'Ver')
                  : ''
              )
            ))
          )
        )
      ),
      evi && React.createElement(EvidenceModal, { record: evi, onClose: () => setEvi(null) })
    );
  }

  /* -------------------- Bitácora -------------------- */
  function BitacoraView({ db, turno, saveDb, onClose }) {
    const [nota, setNota] = useState('');
    const [notas, setNotas] = useState([]);
    useEffect(() => {
      if (!db) return;
      const res = db.exec('SELECT id,fecha,hora,turno,nota FROM bitacora ORDER BY fecha DESC, hora DESC');
      if (res[0]) {
        const cols = res[0].columns;
        const list = res[0].values.map(row => { const obj = {}; cols.forEach((c, i) => obj[c] = row[i]); return obj; });
        setNotas(list);
      }
    }, [db]);
    function addNota() {
      if (!nota.trim()) { alert('La nota no puede estar vacía'); return; }
      const now = new Date();
      const fecha = now.toISOString().slice(0, 10);
      const hora = now.toTimeString().slice(0, 8);
      try {
        db.run('INSERT INTO bitacora (fecha,hora,turno,nota) VALUES (?,?,?,?)', [fecha, hora, turno, nota]);
        let insertedId = Date.now();
        try { const idRes = db.exec('SELECT last_insert_rowid() AS id'); if (idRes[0] && idRes[0].values && idRes[0].values[0]) insertedId = idRes[0].values[0][0]; } catch (e) {}
        saveDb();
        setNotas([{ id: insertedId, fecha, hora, turno, nota }, ...notas]);
        setNota('');
      } catch (err) { console.error(err); }
    }
    function deleteNota(id) {
      if (!confirm('¿Eliminar esta nota?')) return;
      try { db.run('DELETE FROM bitacora WHERE id=?', [id]); saveDb(); setNotas(notas.filter(n => n.id !== id)); } catch (err) { console.error(err); }
    }
    function exportCSV() {
      const headers = ['Fecha','Hora','Turno','Nota'];
      const rows = notas.map(n => [n.fecha,n.hora,n.turno,n.nota]);
      const csv = [headers.join(','), ...rows.map(row => row.map(v => '\"' + (v || '') + '\"').join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'bitacora.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Agregar nota'),
        React.createElement('textarea', { rows: 3, value: nota, onChange: e => setNota(e.target.value), placeholder: 'Descripción de la incidencia...' })
      ),
      React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' } },
        React.createElement('button', { className: 'button', onClick: addNota }, 'Añadir'),
        React.createElement('button', { className: 'button', onClick: exportCSV }, 'Exportar CSV'),
        React.createElement('button', { className: 'button danger', onClick: onClose }, 'Cerrar')
      ),
      React.createElement('div', { className: 'table-container', style: { marginTop: '1rem' } },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Fecha'),
              React.createElement('th', null, 'Hora'),
              React.createElement('th', null, 'Turno'),
              React.createElement('th', null, 'Nota'),
              React.createElement('th', null, '')
            )
          ),
          React.createElement('tbody', null,
            notas.map(n => React.createElement('tr', { key: n.id },
              React.createElement('td', null, n.fecha),
              React.createElement('td', null, n.hora),
              React.createElement('td', null, n.turno),
              React.createElement('td', null, n.nota),
              React.createElement('td', null, React.createElement('button', { className: 'button danger', onClick: () => deleteNota(n.id) }, 'Eliminar'))
            ))
          )
        )
      )
    );
  }

  /* -------------------- Admin -------------------- */
  function AdminView({ db, saveDb, onClose }) {
    const [guards, setGuards] = useState([]);
    const [nombre, setNombre] = useState('');
    const [usuario, setUsuario] = useState('');
    const [password, setPassword] = useState('');
    const [rol, setRol] = useState('Guardia');
    const [stats, setStats] = useState({ vehiculos: 0, peatones: 0 });

    useEffect(() => {
      if (!db) return;
      const res = db.exec('SELECT id,nombre,usuario,rol FROM guardias');
      if (res[0]) {
        const cols = res[0].columns;
        const list = res[0].values.map(row => { const o = {}; cols.forEach((c,i) => o[c]=row[i]); return o; });
        setGuards(list);
      }
      try {
        const vehRes = db.exec('SELECT COUNT(*) as total FROM vehiculos');
        const peatRes = db.exec('SELECT COUNT(*) as total FROM peatones');
        const vehTotal = vehRes[0] ? vehRes[0].values[0][0] : 0;
        const peatTotal = peatRes[0] ? peatRes[0].values[0][0] : 0;
        setStats({ vehiculos: vehTotal, peatones: peatTotal });
      } catch (err) { console.error(err); }
    }, [db]);

    function addGuard() {
      if (!nombre || !usuario || !password) { alert('Todos los campos son obligatorios'); return; }
      try { db.run('INSERT INTO guardias (nombre,usuario,password,rol) VALUES (?,?,?,?)', [nombre, usuario, password, rol]); saveDb();
        setGuards([...guards, { id: Date.now(), nombre, usuario, rol }]);
        setNombre(''); setUsuario(''); setPassword(''); setRol('Guardia');
      } catch (err) { console.error(err); }
    }
    function deleteGuard(id) {
      if (!confirm('¿Eliminar guardia?')) return;
      try { db.run('DELETE FROM guardias WHERE id=?', [id]); saveDb(); setGuards(guards.filter(g => g.id !== id)); } catch (err) { console.error(err); }
    }

    function vacuumDb() {
      try { db.run('VACUUM'); saveDb(); alert('Base de datos compactada.'); } catch (e) { console.error(e); alert('No se pudo compactar.'); }
    }
    function exportDbFile() {
      try {
        const data = db.export();
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'accesos.sqlite';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      } catch (e) { console.error(e); alert('No se pudo exportar.'); }
    }

    return React.createElement(React.Fragment, null,
      React.createElement('h3', null, 'Estadísticas'),
      React.createElement('p', null, `Entradas vehiculares: ${stats.vehiculos}`),
      React.createElement('p', null, `Entradas peatonales: ${stats.peatones}`),
      React.createElement('div', { style: { display: 'flex', gap: '0.5rem', marginBottom: '1rem' } },
        React.createElement('button', { className: 'button', onClick: vacuumDb }, 'Compactar BD'),
        React.createElement('button', { className: 'button', onClick: exportDbFile }, 'Exportar BD')
      ),
      React.createElement('hr', null),
      React.createElement('h3', null, 'Gestión de guardias'),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Nombre'),
        React.createElement('input', { type: 'text', value: nombre, onChange: e => setNombre(e.target.value) })
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Usuario'),
        React.createElement('input', { type: 'text', value: usuario, onChange: e => setUsuario(e.target.value) })
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Contraseña'),
        React.createElement('input', { type: 'password', value: password, onChange: e => setPassword(e.target.value) })
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Rol'),
        React.createElement('select', { value: rol, onChange: e => setRol(e.target.value) },
          React.createElement('option', { value: 'Guardia' }, 'Guardia'),
          React.createElement('option', { value: 'Administrador' }, 'Administrador')
        )
      ),
      React.createElement('button', { className: 'button', onClick: addGuard }, 'Agregar guardia'),
      React.createElement('div', { className: 'table-container', style: { marginTop: '1rem' } },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Nombre'),
              React.createElement('th', null, 'Usuario'),
              React.createElement('th', null, 'Rol'),
              React.createElement('th', null, '')
            )
          ),
          React.createElement('tbody', null,
            guards.map(g => React.createElement('tr', { key: g.id },
              React.createElement('td', null, g.nombre),
              React.createElement('td', null, g.usuario),
              React.createElement('td', null, g.rol),
              React.createElement('td', null, React.createElement('button', { className: 'button danger', onClick: () => deleteGuard(g.id) }, 'Eliminar'))
            ))
          )
        )
      ),
      React.createElement('div', { style: { marginTop: '1rem', textAlign: 'right' } },
        React.createElement('button', { className: 'button danger', onClick: onClose }, 'Cerrar')
      )
    );
  }

  /* -------------------- App and DB init/migrations -------------------- */
  function App() {
    const [SQLLib, setSQLLib] = useState(null);
    const [db, setDb] = useState(null);
    const [models, setModels] = useState([]);
    const [role, setRole] = useState('');
    const [turno, setTurno] = useState('');
    const [view, setView] = useState('loading');

    useEffect(() => {
      let cancelled = false;
      async function init() {
        try {
          const SQL = await initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}` });
          if (cancelled) return;
          setSQLLib(SQL);
          let dbInstance;
          const saved = localStorage.getItem('access_control_db');
          if (saved) {
            const bytes = Uint8Array.from(atob(saved), c => c.charCodeAt(0));
            dbInstance = new SQL.Database(bytes);
          } else {
            dbInstance = new SQL.Database();
            dbInstance.run(`
CREATE TABLE IF NOT EXISTS vehiculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placa TEXT, nombre TEXT, motivo TEXT, modelo TEXT, color TEXT,
  destino TEXT, fecha TEXT, hora TEXT,
  movimiento TEXT,
  foto_persona TEXT, foto_placa TEXT, foto_identificacion TEXT
);
CREATE TABLE IF NOT EXISTS peatones (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, motivo TEXT, destino TEXT, id_opcional TEXT, fecha TEXT, hora TEXT);
CREATE TABLE IF NOT EXISTS bitacora (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT, hora TEXT, turno TEXT, nota TEXT);
CREATE TABLE IF NOT EXISTS guardias (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, usuario TEXT, password TEXT, rol TEXT);
`);
          }

          // Migrations: ensure columns exist on vehiculos
          try {
            const res = dbInstance.exec("PRAGMA table_info('vehiculos')");
            const cols = new Set((res[0] && res[0].values) ? res[0].values.map(r => r[1]) : []);
            const addIfMissing = (name, ddl) => { if (!cols.has(name)) dbInstance.run(ddl); };
            addIfMissing('movimiento', "ALTER TABLE vehiculos ADD COLUMN movimiento TEXT");
            addIfMissing('foto_persona', "ALTER TABLE vehiculos ADD COLUMN foto_persona TEXT");
            addIfMissing('foto_placa', "ALTER TABLE vehiculos ADD COLUMN foto_placa TEXT");
            addIfMissing('foto_identificacion', "ALTER TABLE vehiculos ADD COLUMN foto_identificacion TEXT");
          } catch (e) { console.warn('Migraciones no aplicadas:', e); }

          if (cancelled) return;
          setDb(dbInstance);

          try {
            const response = await fetch('models.json');
            const data = await response.json();
            if (!cancelled) setModels(data);
          } catch (err) { console.warn('No se pudo cargar models.json', err); }

          setView('login');
        } catch (err) { console.error('Error inicializando SQL.js', err); }
      }
      init();
      return () => { cancelled = true; };
    }, []);

    function u8ToBase64(u8) {
      const CHUNK = 0x8000; // 32KB
      let result = '';
      for (let i = 0; i < u8.length; i += CHUNK) {
        const sub = u8.subarray(i, i + CHUNK);
        result += String.fromCharCode.apply(null, sub);
      }
      return btoa(result);
    }
    function saveDb() {
      if (!db) return;
      try {
        const data = db.export();
        const base64 = u8ToBase64(data);
        localStorage.setItem('access_control_db', base64);
      } catch (e) {
        console.error('Error al guardar la base de datos en localStorage', e);
        throw e;
      }
    }

    if (view === 'loading') return React.createElement('div', { className: 'container' }, 'Cargando aplicación...');
    if (view === 'login') return React.createElement(Login, { onSubmit: (r, t) => { setRole(r); setTurno(t); setView('dashboard'); } });
    if (view === 'dashboard') return React.createElement(Dashboard, { role, turno, onNavigate: (target) => setView(target) });
    if (view === 'vehicle') return React.createElement(ModalWrapper, { title: 'Registrar vehículo', onClose: () => setView('dashboard'),
      children: React.createElement(RegisterVehicle, { db, SQL: SQLLib, models, saveDb, onClose: () => setView('dashboard') }) });
    if (view === 'pedestrian') return React.createElement(ModalWrapper, { title: 'Registrar peatón', onClose: () => setView('dashboard'),
      children: React.createElement(RegisterPedestrian, { db, saveDb, onClose: () => setView('dashboard') }) });
    if (view === 'history') return React.createElement(ModalWrapper, { title: 'Historial de accesos', onClose: () => setView('dashboard'),
      children: React.createElement(HistoryView, { db, onClose: () => setView('dashboard') }) });
    if (view === 'bitacora') return React.createElement(ModalWrapper, { title: 'Bitácora de incidencias', onClose: () => setView('dashboard'),
      children: React.createElement(BitacoraView, { db, turno, saveDb, onClose: () => setView('dashboard') }) });
    if (view === 'admin') return React.createElement(ModalWrapper, { title: 'Panel de administración', onClose: () => setView('dashboard'),
      children: React.createElement(AdminView, { db, saveDb, onClose: () => setView('dashboard') }) });
    return React.createElement('div', null, 'Vista no encontrada');
  }

  ReactDOM.render(React.createElement(App), document.getElementById('root'));
})();